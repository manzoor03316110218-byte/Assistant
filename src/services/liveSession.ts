import { AudioStreamer, AudioTelemetry } from './audioStreamer';
import {
  BrowserActionEvent,
  ClientToServerMessage,
  ServerToClientMessage,
  SessionState,
  VisualMood,
} from '../types/live';
import { executeBrowserToolCall } from '../utils/browserActions';

export interface LiveSessionHandlers {
  onStateChange: (state: SessionState) => void;
  onCaptionChange: (caption: string) => void;
  onAction: (action: BrowserActionEvent) => void;
  onMoodChange: (mood: VisualMood) => void;
  onPhotoCommand?: (prompt: string, action: 'create' | 'redesign' | 'background') => void;
  onVideoCommand?: (prompt: string, durationSeconds: 10 | 20, aspectRatio: '9:16' | '16:9') => void;
  onChatCommand?: (prompt: string) => void;
  onError: (message: string) => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private audioStreamer: AudioStreamer | null = null;
  private state: SessionState = 'disconnected';
  private handlers: LiveSessionHandlers;
  private captionBuffer = '';
  private manualClosing = false;

  constructor(handlers: LiveSessionHandlers) {
    this.handlers = handlers;
  }

  getState(): SessionState {
    return this.state;
  }

  private setState(next: SessionState): void {
    if (this.state === next) return;
    this.state = next;
    this.handlers.onStateChange(next);
  }

  private send(payload: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  async connect(): Promise<void> {
    if (this.state !== 'disconnected') return;

    this.manualClosing = false;
    this.captionBuffer = '';
    this.handlers.onCaptionChange('');
    this.setState('connecting');

    this.audioStreamer = new AudioStreamer((isPlaying) => {
      if (this.state === 'disconnected' || this.state === 'connecting') return;
      this.setState(isPlaying ? 'speaking' : 'listening');
    });

    try {
      await this.audioStreamer.initOutput();
    } catch {
      this.disconnect();
      this.handlers.onError('Could not initialize audio playback.');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/live`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onmessage = async (event) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerToClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'ready') {
        try {
          await this.audioStreamer?.startCapture((base64Pcm) => {
            this.send({ type: 'audio', data: base64Pcm });
          });
          if (this.state !== 'disconnected') {
            this.setState('listening');
          }
        } catch (err) {
          const message =
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Microphone access denied. Enable mic permissions to talk with Mahi.'
              : err instanceof Error && err.message
                ? err.message
                : 'Could not access microphone input.';
          this.handlers.onError(message);
          this.disconnect();
        }
        return;
      }

      if (msg.type === 'audio') {
        this.audioStreamer?.enqueuePlayback(msg.data);
        return;
      }

      if (msg.type === 'caption') {
        this.captionBuffer = (this.captionBuffer + msg.text).slice(-140);
        this.handlers.onCaptionChange(this.captionBuffer.trim());
        return;
      }

      if (msg.type === 'turnComplete') {
        this.captionBuffer = '';
        return;
      }

      if (msg.type === 'interrupted') {
        this.captionBuffer = '';
        this.audioStreamer?.interruptPlayback();
        if (this.state !== 'disconnected') {
          this.setState('listening');
        }
        return;
      }

      if (msg.type === 'toolCall') {
        const responses = await Promise.all(
          msg.functionCalls.map(async (call) => {
            const result = await executeBrowserToolCall(call, {
              onMoodChange: this.handlers.onMoodChange,
              onPhotoCommand: this.handlers.onPhotoCommand,
              onVideoCommand: this.handlers.onVideoCommand,
              onChatCommand: this.handlers.onChatCommand,
            });
            if (result.actionEvent) {
              this.handlers.onAction(result.actionEvent);
            }
            return result.functionResponse;
          })
        );
        this.send({ type: 'toolResponse', functionResponses: responses });
        return;
      }

      if (msg.type === 'error') {
        this.handlers.onError(msg.message);
        this.disconnect();
      }
    };

    ws.onerror = () => {
      if (!this.manualClosing) {
        this.handlers.onError('Voice link interrupted. Please reconnect.');
      }
      this.disconnect();
    };

    ws.onclose = () => {
      if (!this.manualClosing && this.state !== 'disconnected') {
        this.cleanup();
      }
    };
  }

  interrupt(): void {
    if (this.state === 'speaking') {
      this.captionBuffer = '';
      this.handlers.onCaptionChange('');
      this.audioStreamer?.interruptPlayback();
      this.setState('listening');
    }
  }

  getTelemetry(): AudioTelemetry {
    if (!this.audioStreamer) {
      return {
        inputLevel: 0,
        outputLevel: 0,
        spectrum: new Uint8Array(64),
      };
    }
    return this.audioStreamer.getTelemetry();
  }

  disconnect(): void {
    this.manualClosing = true;
    this.cleanup();
  }

  private cleanup(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close();
        }
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    if (this.audioStreamer) {
      this.audioStreamer.dispose();
      this.audioStreamer = null;
    }

    this.captionBuffer = '';
    this.setState('disconnected');
  }
}
