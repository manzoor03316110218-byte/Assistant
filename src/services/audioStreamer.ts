const TARGET_INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const WORKLET_PROCESSOR_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset >= this.bufferSize) {
        this.port.postMessage(this.buffer.slice(0));
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

function downsampleFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate: number
): Float32Array {
  if (inputRate === targetRate) return input;
  const ratio = inputRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const s0 = input[index] ?? 0;
    const s1 = input[Math.min(index + 1, input.length - 1)] ?? s0;
    result[i] = s0 + (s1 - s0) * frac;
  }
  return result;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sample = view.getInt16(i * 2, true);
    float32[i] = sample / 0x8000;
  }
  return float32;
}

export interface AudioTelemetry {
  inputLevel: number;
  outputLevel: number;
  spectrum: Uint8Array;
}

export class AudioStreamer {
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private isPlaying = false;
  private inputData = new Uint8Array(64);
  private outputData = new Uint8Array(64);
  private onPlaybackChange?: (playing: boolean) => void;

  constructor(onPlaybackChange?: (playing: boolean) => void) {
    this.onPlaybackChange = onPlaybackChange;
  }

  private createAudioContext(preferredRate: number): AudioContext {
    try {
      return new AudioContext({ sampleRate: preferredRate });
    } catch {
      return new AudioContext();
    }
  }

  async initOutput(): Promise<void> {
    if (!this.outputCtx) {
      this.outputCtx = this.createAudioContext(OUTPUT_SAMPLE_RATE);
      this.outputAnalyser = this.outputCtx.createAnalyser();
      this.outputAnalyser.fftSize = 128;
      this.outputAnalyser.smoothingTimeConstant = 0.72;
      this.outputAnalyser.connect(this.outputCtx.destination);
      this.outputData = new Uint8Array(this.outputAnalyser.frequencyBinCount);
      this.nextStartTime = this.outputCtx.currentTime;
    }
    if (this.outputCtx.state === 'suspended') {
      await this.outputCtx.resume();
    }
  }

  async startCapture(onAudioChunk: (base64Pcm16: string) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access requires HTTPS or a supported mobile browser.');
    }

    await this.initOutput();

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    this.inputCtx = this.createAudioContext(TARGET_INPUT_SAMPLE_RATE);
    if (this.inputCtx.state === 'suspended') {
      await this.inputCtx.resume();
    }

    const source = this.inputCtx.createMediaStreamSource(this.micStream);
    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 128;
    this.inputAnalyser.smoothingTimeConstant = 0.72;
    this.inputData = new Uint8Array(this.inputAnalyser.frequencyBinCount);

    const muteGain = this.inputCtx.createGain();
    muteGain.gain.value = 0;
    muteGain.connect(this.inputCtx.destination);

    source.connect(this.inputAnalyser);

    const actualRate = this.inputCtx.sampleRate;
    const emitSamples = (raw: Float32Array) => {
      const resampled = downsampleFloat32(
        raw,
        actualRate,
        TARGET_INPUT_SAMPLE_RATE
      );
      const base64 = float32ToPcm16Base64(resampled);
      onAudioChunk(base64);
    };

    if (this.inputCtx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_CODE], {
          type: 'application/javascript',
        });
        const workletUrl = URL.createObjectURL(blob);
        try {
          await this.inputCtx.audioWorklet.addModule(workletUrl);
        } finally {
          URL.revokeObjectURL(workletUrl);
        }

        this.workletNode = new AudioWorkletNode(
          this.inputCtx,
          'pcm-capture-processor'
        );
        this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          emitSamples(event.data);
        };
        this.inputAnalyser.connect(this.workletNode);
        this.workletNode.connect(muteGain);
        return;
      } catch {
        // Fallback to ScriptProcessorNode below if AudioWorklet fails
      }
    }

    this.scriptNode = this.inputCtx.createScriptProcessor(2048, 1, 1);
    this.scriptNode.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0);
      emitSamples(channel);
    };
    this.inputAnalyser.connect(this.scriptNode);
    this.scriptNode.connect(muteGain);
  }

  enqueuePlayback(base64Pcm16: string): void {
    if (!this.outputCtx || !this.outputAnalyser) return;
    if (this.outputCtx.state === 'suspended') {
      void this.outputCtx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Pcm16);
    if (float32.length === 0) return;

    const buffer = this.outputCtx.createBuffer(
      1,
      float32.length,
      OUTPUT_SAMPLE_RATE
    );
    buffer.getChannelData(0).set(float32);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.outputAnalyser);

    const now = this.outputCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.015;
    }

    const startTime = this.nextStartTime;
    this.nextStartTime = startTime + buffer.duration;

    this.activeSources.add(source);
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlaybackChange?.(true);
    }

    source.onended = () => {
      this.activeSources.delete(source);
      source.disconnect();
      if (this.activeSources.size === 0 && this.isPlaying) {
        this.isPlaying = false;
        this.onPlaybackChange?.(false);
      }
    };

    source.start(startTime);
  }

  interruptPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    }
    if (this.isPlaying) {
      this.isPlaying = false;
      this.onPlaybackChange?.(false);
    }
  }

  getTelemetry(): AudioTelemetry {
    let inputLevel = 0;
    let outputLevel = 0;

    if (this.inputAnalyser) {
      this.inputAnalyser.getByteFrequencyData(this.inputData);
      let sum = 0;
      for (let i = 0; i < this.inputData.length; i++) {
        sum += this.inputData[i];
      }
      inputLevel = Math.min(1, sum / (this.inputData.length * 140));
    }

    if (this.outputAnalyser && this.isPlaying) {
      this.outputAnalyser.getByteFrequencyData(this.outputData);
      let sum = 0;
      for (let i = 0; i < this.outputData.length; i++) {
        sum += this.outputData[i];
      }
      outputLevel = Math.min(1, sum / (this.outputData.length * 140));
    }

    const spectrum = this.isPlaying ? this.outputData : this.inputData;
    return { inputLevel, outputLevel, spectrum };
  }

  dispose(): void {
    this.interruptPlayback();

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // Ignore
      }
      this.workletNode = null;
    }

    if (this.scriptNode) {
      try {
        this.scriptNode.onaudioprocess = null;
        this.scriptNode.disconnect();
      } catch {
        // Ignore
      }
      this.scriptNode = null;
    }

    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }

    if (this.inputCtx) {
      void this.inputCtx.close().catch(() => {});
      this.inputCtx = null;
    }

    if (this.outputCtx) {
      void this.outputCtx.close().catch(() => {});
      this.outputCtx = null;
    }

    this.inputAnalyser = null;
    this.outputAnalyser = null;
  }
}
