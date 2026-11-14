import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  Trash2,
} from 'lucide-react';
import { ImageAttachment, VideoStoryboard } from '../types/live';
import { readImageFile } from '../utils/imageFile';

interface VideoStudioProps {
  pendingCommand?: {
    prompt: string;
    durationSeconds: 10 | 20;
    aspectRatio: '9:16' | '16:9';
    nonce: number;
  };
}

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return undefined;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function VideoStudio({ pendingCommand }: VideoStudioProps) {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<10 | 20>(10);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
  const [photos, setPhotos] = useState<ImageAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [mahiComment, setMahiComment] = useState<string | null>(
    'Topic likho, 10s ya 20s choose karo — main voiceover aur scenes ke sath reel bana dungi.'
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [storyboard, setStoryboard] = useState<VideoStoryboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef(false);
  const lastNonceRef = useRef(0);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const [videoExt, setVideoExt] = useState<'webm' | 'mp4'>('webm');

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
    e.target.value = '';
    if (files.length === 0) return;

    try {
      const loaded = await Promise.all(files.map((f) => readImageFile(f, 1080)));
      setPhotos((prev) => [...prev, ...loaded].slice(0, 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach photo.');
    }
  };

  const renderMotionVideo = useCallback(
    async (
      board: VideoStoryboard,
      durSec: 10 | 20,
      ratio: '9:16' | '16:9',
      attachedPhotos: ImageAttachment[],
      fallbackPrompt: string,
      audioDataUrl?: string
    ): Promise<string> => {
      const width = ratio === '9:16' ? 540 : 960;
      const height = ratio === '9:16' ? 960 : 540;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context is not supported.');

      const htmlImages = await Promise.all(
        attachedPhotos.map((p) => loadHtmlImage(p.previewUrl))
      );

      if (
        typeof MediaRecorder === 'undefined' ||
        typeof canvas.captureStream !== 'function'
      ) {
        throw new Error(
          'Video recording is not supported in this browser. Try Chrome or Safari 15+.'
        );
      }

      const canvasStream = canvas.captureStream(30);
      let combinedStream: MediaStream = canvasStream;
      let audioCtx: AudioContext | null = null;
      let audioEl: HTMLAudioElement | null = null;

      if (audioDataUrl) {
        try {
          audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
          const dest = audioCtx.createMediaStreamDestination();
          audioEl = new Audio(audioDataUrl);
          audioEl.crossOrigin = 'anonymous';
          const srcNode = audioCtx.createMediaElementSource(audioEl);
          srcNode.connect(dest);
          const tracks = [
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ];
          combinedStream = new MediaStream(tracks);
        } catch {
          combinedStream = canvasStream;
        }
      }

      const mimeType = pickSupportedMimeType();
      const recorderOptions: MediaRecorderOptions = mimeType
        ? { mimeType, videoBitsPerSecond: 2_600_000 }
        : { videoBitsPerSecond: 2_600_000 };
      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      const actualMime = recorder.mimeType || mimeType || 'video/webm';
      setVideoExt(actualMime.includes('mp4') ? 'mp4' : 'webm');

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const donePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: actualMime }));
        };
      });

      recorder.start(250);
      if (audioEl) {
        void audioEl.play().catch(() => {});
      }

      const totalMs = durSec * 1000;
      const startTs = performance.now();
      const scenes =
        board.scenes.length > 0
          ? board.scenes
          : [
              {
                headline: board.title || 'Mahi Reel',
                caption: fallbackPrompt || 'Generated in real time',
                bgPrimary: '#1e0b36',
                bgSecondary: '#090915',
                accent: '#ff2fa8',
                motionType: 'zoom_in' as const,
              },
            ];
      const sceneDurationMs = totalMs / scenes.length;

      await new Promise<void>((resolve) => {
        const renderFrame = () => {
          if (abortRef.current) {
            resolve();
            return;
          }
          const elapsed = performance.now() - startTs;
          const pct = Math.min(1, elapsed / totalMs);
          setProgress(Math.round(20 + pct * 78));

          const sceneIdx = Math.min(
            scenes.length - 1,
            Math.floor(elapsed / sceneDurationMs)
          );
          const sceneElapsed = elapsed - sceneIdx * sceneDurationMs;
          const t = Math.min(1, sceneElapsed / sceneDurationMs);
          const scene = scenes[sceneIdx];

          const grad = ctx.createLinearGradient(
            0,
            0,
            width * (0.4 + 0.6 * Math.sin(t * Math.PI)),
            height
          );
          grad.addColorStop(0, scene.bgPrimary || '#1a0933');
          grad.addColorStop(1, scene.bgSecondary || '#070712');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);

          if (htmlImages.length > 0) {
            const img = htmlImages[sceneIdx % htmlImages.length];
            const zoom =
              scene.motionType === 'zoom_in'
                ? 1 + t * 0.14
                : scene.motionType === 'pulse'
                  ? 1.05 + Math.sin(t * Math.PI * 2) * 0.04
                  : 1.08;
            const panX = scene.motionType === 'pan_right' ? (t - 0.5) * 48 : 0;

            const imgAspect = img.width / img.height;
            const boxAspect = width / height;
            let drawW = width * zoom;
            let drawH = height * zoom;
            if (imgAspect > boxAspect) {
              drawW = drawH * imgAspect;
            } else {
              drawH = drawW / imgAspect;
            }

            ctx.save();
            ctx.globalAlpha = 0.78;
            ctx.drawImage(
              img,
              (width - drawW) / 2 + panX,
              (height - drawH) / 2,
              drawW,
              drawH
            );
            ctx.restore();
          } else {
            const orbR =
              Math.min(width, height) * (0.24 + 0.06 * Math.sin(t * Math.PI * 2));
            const cx = width / 2 + Math.cos(t * Math.PI * 2) * 28;
            const cy = height * 0.42 + Math.sin(t * Math.PI * 2) * 18;
            const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, orbR * 1.4);
            glow.addColorStop(0, '#ffffffcc');
            glow.addColorStop(0.35, scene.accent || '#ff2fa8');
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, orbR * 1.4, 0, Math.PI * 2);
            ctx.fill();

            for (let p = 0; p < 18; p++) {
              const px = (p * 79 + elapsed * 0.04) % width;
              const py = (p * 131 + elapsed * 0.03) % height;
              ctx.fillStyle = `${scene.accent || '#22e5ff'}88`;
              ctx.beginPath();
              ctx.arc(px, py, 2 + (p % 3), 0, Math.PI * 2);
              ctx.fill();
            }
          }

          const scrim = ctx.createLinearGradient(0, height * 0.48, 0, height);
          scrim.addColorStop(0, 'rgba(5,5,10,0.08)');
          scrim.addColorStop(1, 'rgba(5,5,10,0.88)');
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, width, height);

          const fade = t < 0.15 ? t / 0.15 : t > 0.88 ? (1 - t) / 0.12 : 1;
          const slideY = (1 - Math.min(1, t * 4)) * 16;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, fade));
          ctx.textAlign = 'center';

          ctx.fillStyle = scene.accent || '#22e5ff';
          ctx.font = `600 ${ratio === '9:16' ? 16 : 18}px "JetBrains Mono", monospace`;
          ctx.fillText(
            `SCENE 0${sceneIdx + 1} / 0${scenes.length}`,
            width / 2,
            height * 0.68 + slideY
          );

          ctx.fillStyle = '#ffffff';
          ctx.font = `700 ${ratio === '9:16' ? 36 : 42}px Outfit, system-ui, sans-serif`;
          const headLines = wrapLines(ctx, scene.headline, width - 64);
          headLines.forEach((ln, idx) => {
            ctx.fillText(ln, width / 2, height * 0.74 + idx * 44 + slideY);
          });

          ctx.fillStyle = '#e2e8f0';
          ctx.font = `400 ${ratio === '9:16' ? 20 : 22}px "Plus Jakarta Sans", system-ui, sans-serif`;
          const capLines = wrapLines(ctx, scene.caption, width - 72);
          capLines.forEach((ln, idx) => {
            ctx.fillText(ln, width / 2, height * 0.85 + idx * 28 + slideY);
          });
          ctx.restore();

          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(24, 24, width - 48, 4);
          ctx.fillStyle = scene.accent || '#ff2fa8';
          ctx.fillRect(24, 24, (width - 48) * pct, 4);

          if (elapsed >= totalMs) {
            resolve();
            return;
          }
          window.setTimeout(renderFrame, 33);
        };

        renderFrame();
      });

      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      if (audioEl) {
        audioEl.pause();
      }
      if (audioCtx) {
        void audioCtx.close().catch(() => {});
      }

      const blob = await donePromise;
      return URL.createObjectURL(blob);
    },
    []
  );

  const runVideoCreation = useCallback(
    async (
      targetPrompt: string,
      targetDuration: 10 | 20,
      targetRatio: '9:16' | '16:9'
    ) => {
      const currentPhotos = photosRef.current;
      if (!targetPrompt.trim() && currentPhotos.length === 0) {
        setError('Enter a video topic or attach at least one photo.');
        return;
      }

      abortRef.current = false;
      setError(null);
      setIsGenerating(true);
      setProgress(8);
      setStatusText('Writing AI storyboard...');

      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });

      try {
        const res = await fetch('/api/video-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: targetPrompt.trim() || 'Stylish photo showcase reel',
            durationSeconds: targetDuration,
            aspectRatio: targetRatio,
            hasPhoto: currentPhotos.length > 0,
          }),
        });
        const board = (await res.json()) as VideoStoryboard & { error?: string };
        if (!res.ok) throw new Error(board.error || 'Could not generate storyboard.');

        setStoryboard(board);
        setMahiComment(board.mahiComment);

        let audioDataUrl: string | undefined;
        if (voiceoverEnabled && board.narrationScript) {
          setProgress(15);
          setStatusText('Recording Mahi voiceover...');
          const ttsRes = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: board.narrationScript }),
          });
          const ttsData = (await ttsRes.json()) as { audioDataUrl?: string };
          if (ttsRes.ok && ttsData.audioDataUrl) {
            audioDataUrl = ttsData.audioDataUrl;
          }
        }

        setStatusText(`Rendering ${targetDuration}s video...`);
        const outUrl = await renderMotionVideo(
          board,
          targetDuration,
          targetRatio,
          currentPhotos,
          targetPrompt.trim(),
          audioDataUrl
        );
        setVideoUrl(outUrl);
        setProgress(100);
        setStatusText(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Video generation failed.');
        setStatusText(null);
      } finally {
        setIsGenerating(false);
      }
    },
    [renderMotionVideo, voiceoverEnabled]
  );

  useEffect(() => {
    if (
      pendingCommand &&
      pendingCommand.nonce > 0 &&
      pendingCommand.nonce !== lastNonceRef.current
    ) {
      lastNonceRef.current = pendingCommand.nonce;
      setPrompt(pendingCommand.prompt);
      setDuration(pendingCommand.durationSeconds);
      setAspectRatio(pendingCommand.aspectRatio);
      void runVideoCreation(
        pendingCommand.prompt,
        pendingCommand.durationSeconds,
        pendingCommand.aspectRatio
      );
    }
  }, [pendingCommand, runVideoCreation]);

  return (
    <div className="w-full max-w-5xl mx-auto h-full overflow-y-auto px-4 sm:px-6 pb-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-6 flex flex-col gap-4">
          {mahiComment && (
            <div className="px-4 py-2.5 rounded-2xl bg-[#110f24]/90 border border-fuchsia-400/25 text-xs sm:text-sm text-slate-200">
              <span className="text-fuchsia-300 font-semibold mr-1.5">Mahi:</span>
              {mahiComment}
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200">
              {error}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runVideoCreation(prompt, duration, aspectRatio);
            }}
            className="flex flex-col gap-3.5"
          >
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Video Topic / Prompt
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. '10 second futuristic neon intro' or 'Mere photos ke sath sunset reel banao'"
                className="w-full p-3 rounded-xl bg-[#0e0c1d] border border-white/15 focus:border-fuchsia-400/60 text-sm text-white placeholder:text-slate-500 focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-slate-400 mb-1.5">Duration</p>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {([10, 20] as const).map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDuration(sec)}
                      className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        duration === sec
                          ? 'bg-fuchsia-600 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-400 mb-1.5">Format</p>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                  {(['9:16', '16:9'] as const).map((ar) => (
                    <button
                      key={ar}
                      type="button"
                      onClick={() => setAspectRatio(ar)}
                      className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        aspectRatio === ar
                          ? 'bg-cyan-500/80 text-white'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void handlePhotoSelect(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={photos.length >= 3}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-medium text-slate-200 inline-flex items-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4 text-cyan-300" />
                <span>Add Photos ({photos.length}/3)</span>
              </button>

              <button
                type="button"
                onClick={() => setVoiceoverEnabled((v) => !v)}
                className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-2 cursor-pointer transition-colors ${
                  voiceoverEnabled
                    ? 'bg-fuchsia-500/20 border-fuchsia-400/50 text-fuchsia-100'
                    : 'bg-white/[0.04] border-white/10 text-slate-400'
                }`}
              >
                {voiceoverEnabled ? (
                  <Mic className="w-4 h-4 text-fuchsia-300" />
                ) : (
                  <MicOff className="w-4 h-4" />
                )}
                <span>Mahi Voiceover {voiceoverEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            {photos.length > 0 && (
              <div className="flex items-center gap-2">
                {photos.map((p, idx) => (
                  <div
                    key={idx}
                    className="relative w-14 h-14 rounded-xl overflow-hidden border border-white/15"
                  >
                    <img
                      src={p.previewUrl}
                      alt={`Attached ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove attached photo"
                      className="absolute top-0.5 right-0.5 p-1 rounded-md bg-black/70 text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={isGenerating}
              className="min-h-[46px] w-full rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{statusText || 'Generating...'}</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>Create {duration}s Video</span>
                </>
              )}
            </button>

            {isGenerating && (
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </form>
        </div>

        <div className="lg:col-span-6 flex flex-col items-center gap-3">
          {videoUrl ? (
            <>
              <video
                src={videoUrl}
                controls
                playsInline
                autoPlay
                className={`w-full rounded-2xl border border-white/15 bg-black shadow-[0_12px_40px_rgba(0,0,0,0.6)] ${
                  aspectRatio === '9:16'
                    ? 'max-w-[290px] aspect-[9/16]'
                    : 'aspect-video'
                }`}
              />
              <div className="w-full flex items-center justify-between gap-3 px-1">
                <span className="text-xs text-slate-400 truncate">
                  {storyboard?.title || `Mahi ${duration}s Reel`}
                </span>
                <a
                  href={videoUrl}
                  download={`mahi-${duration}s-video.${videoExt}`}
                  className="min-h-[42px] px-4 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Video</span>
                </a>
              </div>
            </>
          ) : (
            <div
              className={`w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.02] flex flex-col items-center justify-center text-center p-6 ${
                aspectRatio === '9:16'
                  ? 'max-w-[290px] aspect-[9/16]'
                  : 'aspect-video'
              }`}
            >
              <Film className="w-10 h-10 text-fuchsia-400/70 mb-3" />
              <p className="text-sm font-medium text-slate-200">
                {duration}s AI Motion Reel Preview
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Generates {duration === 20 ? '6' : '4'} animated scenes with Mahi&apos;s voiceover and optional photo motion.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
