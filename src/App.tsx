import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Film,
  MessageCircle,
  Mic,
  PhoneOff,
  Wand2,
  X,
} from 'lucide-react';
import { ActionCard } from './components/ActionCard';
import { AudioWaveform } from './components/AudioWaveform';
import { ChatPanel } from './components/ChatPanel';
import { MicButton } from './components/MicButton';
import { PhotoStudio } from './components/PhotoStudio';
import { PlasmaOrb } from './components/PlasmaOrb';
import { VideoStudio } from './components/VideoStudio';
import { AudioTelemetry } from './services/audioStreamer';
import { LiveSession } from './services/liveSession';
import {
  AppMode,
  BrowserActionEvent,
  SessionState,
  VisualMood,
  VoiceStudioCommand,
} from './types/live';

const IDLE_LINES = [
  'Tap the mic. Don’t keep me waiting.',
  'Ready whenever you’re feeling brave enough to talk.',
  'Silence is cute, but I’m way better company.',
];

const LISTENING_LINES = [
  "Go ahead, impress me. I'm all ears.",
  'Talk to me — ask anything, code, or say "make a photo / video".',
  "I'm listening — make it good.",
];

const EMPTY_TELEMETRY: AudioTelemetry = {
  inputLevel: 0,
  outputLevel: 0,
  spectrum: new Uint8Array(64),
};

const MODES: Array<{ id: AppMode; label: string; icon: typeof Mic }> = [
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'chat', label: 'Message', icon: MessageCircle },
  { id: 'photo', label: 'Photo', icon: Wand2 },
  { id: 'video', label: 'Video', icon: Film },
];

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('voice');
  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [mood, setMood] = useState<VisualMood>('sassy_magenta');
  const [caption, setCaption] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<BrowserActionEvent | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [studioCommands, setStudioCommands] = useState<VoiceStudioCommand>({});

  const sessionRef = useRef<LiveSession | null>(null);
  const nonceRef = useRef(1);

  useEffect(() => {
    const session = new LiveSession({
      onStateChange: (next) => {
        setSessionState(next);
        if (next === 'listening') {
          setLineIndex((prev) => prev + 1);
        }
        if (next === 'disconnected') {
          setCaption('');
        }
      },
      onCaptionChange: (text) => {
        setCaption(text);
      },
      onAction: (action) => {
        setActiveAction(action);
      },
      onMoodChange: (nextMood) => {
        setMood(nextMood);
      },
      onPhotoCommand: (prompt, action) => {
        const nonce = nonceRef.current++;
        setStudioCommands((prev) => ({
          ...prev,
          photo: { prompt, action, nonce },
        }));
        setMode('photo');
      },
      onVideoCommand: (prompt, durationSeconds, aspectRatio) => {
        const nonce = nonceRef.current++;
        setStudioCommands((prev) => ({
          ...prev,
          video: { prompt, durationSeconds, aspectRatio, nonce },
        }));
        setMode('video');
      },
      onChatCommand: (prompt) => {
        const nonce = nonceRef.current++;
        setStudioCommands((prev) => ({
          ...prev,
          chat: { prompt, nonce },
        }));
        setMode('chat');
      },
      onError: (msg) => {
        setErrorMessage(msg);
      },
    });
    sessionRef.current = session;

    return () => {
      session.disconnect();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sessionState === 'disconnected' || sessionState === 'connecting') {
      if (sessionState === 'disconnected') {
        setElapsedSeconds(0);
      }
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionState]);

  useEffect(() => {
    if (!activeAction) return;
    const timeout = window.setTimeout(() => {
      setActiveAction(null);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, [activeAction]);

  const getTelemetry = useCallback((): AudioTelemetry => {
    return sessionRef.current?.getTelemetry() ?? EMPTY_TELEMETRY;
  }, []);

  const handlePrimaryPress = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    setErrorMessage(null);

    if (sessionState === 'disconnected') {
      void session.connect();
    } else if (sessionState === 'speaking') {
      session.interrupt();
    } else {
      session.disconnect();
    }
  }, [sessionState]);

  const handleDisconnect = useCallback(() => {
    sessionRef.current?.disconnect();
  }, []);

  const stateLabel = useMemo(() => {
    switch (sessionState) {
      case 'connecting':
        return 'CONNECTING...';
      case 'listening':
        return 'LISTENING...';
      case 'speaking':
        return 'SPEAKING...';
      default:
        return 'IDLE';
    }
  }, [sessionState]);

  const displayQuote = useMemo(() => {
    if (sessionState === 'connecting') {
      return 'Hold on, tuning into your frequency...';
    }
    if (sessionState === 'speaking') {
      return caption || 'Speaking...';
    }
    if (sessionState === 'listening') {
      return LISTENING_LINES[lineIndex % LISTENING_LINES.length];
    }
    return IDLE_LINES[lineIndex % IDLE_LINES.length];
  }, [sessionState, caption, lineIndex]);

  const isLive = sessionState === 'listening' || sessionState === 'speaking';

  const ambientBgClass = useMemo(() => {
    switch (mood) {
      case 'electric_cyan':
        return 'from-cyan-500/12 via-indigo-950/35 to-[#05050a]';
      case 'sunset_rose':
        return 'from-rose-500/14 via-fuchsia-950/35 to-[#05050a]';
      case 'midnight_violet':
        return 'from-violet-500/14 via-slate-950/45 to-[#05050a]';
      default:
        return 'from-fuchsia-500/14 via-indigo-950/35 to-[#05050a]';
    }
  }, [mood]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05050a] text-slate-100 flex flex-col justify-between">
      <div
        className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,var(--tw-gradient-stops))] ${ambientBgClass} transition-colors duration-700`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,229,255,0.06),transparent_40%),radial-gradient(circle_at_85%_80%,rgba(255,47,168,0.08),transparent_45%)]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none fixed inset-2 sm:inset-4 rounded-[28px] border border-white/[0.06]"
        aria-hidden="true"
      />

      {/* Top Brand + Live Mic Status + 4-Mode Navigation */}
      <header className="relative z-20 pt-4 sm:pt-6 px-4 sm:px-8 flex flex-col items-center gap-3 shrink-0">
        <div className="w-full max-w-5xl flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-b from-white via-slate-100 to-fuchsia-200 bg-clip-text text-transparent">
              mahi
            </h1>
            <span className="text-xs text-slate-400 whitespace-nowrap">
              AI Assistant
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {isLive && mode !== 'voice' && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-[11px] font-medium text-rose-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneOff className="w-3 h-3" />
                <span>End Mic</span>
              </button>
            )}

            <span
              className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest uppercase transition-colors ${
                isLive
                  ? 'text-fuchsia-300'
                  : sessionState === 'connecting'
                    ? 'text-cyan-300'
                    : 'text-slate-400'
              }`}
            >
              {isLive && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_8px_#e879f9]"
                  aria-hidden="true"
                />
              )}
              {isLive ? 'LIVE' : sessionState === 'connecting' ? 'SYNC' : 'READY'}
            </span>
          </div>
        </div>

        <nav
          aria-label="Assistant modes"
          className="w-full max-w-md grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[#0e0c1f]/90 border border-white/10 backdrop-blur-md"
        >
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-fuchsia-600/85 to-purple-600/85 text-white shadow-[0_0_16px_rgba(217,70,239,0.35)]'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {mode === 'voice' ? (
        <>
          <div className="relative z-10 pt-2 px-4 flex flex-col items-center text-center shrink-0">
            <div className="flex flex-col items-center gap-1 max-w-md">
              <p
                className={`text-[11px] font-mono tracking-[0.26em] uppercase transition-colors duration-300 ${
                  sessionState === 'speaking'
                    ? 'text-cyan-300'
                    : sessionState === 'listening'
                      ? 'text-fuchsia-300'
                      : sessionState === 'connecting'
                        ? 'text-indigo-300'
                        : 'text-slate-400'
                }`}
              >
                {stateLabel}
              </p>
              <p className="text-sm sm:text-base text-slate-100/95 font-normal leading-snug line-clamp-2 min-h-[2.5rem] flex items-center justify-center text-balance">
                &ldquo;{displayQuote}&rdquo;
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mt-2 w-full max-w-sm flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-rose-950/75 border border-rose-500/40 text-xs text-rose-100 backdrop-blur-md"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="truncate">{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  aria-label="Dismiss error"
                  className="shrink-0 p-1 rounded-md text-rose-300 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <section
            className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-4"
            aria-label="Voice visualizer"
          >
            <PlasmaOrb
              state={sessionState}
              mood={mood}
              getTelemetry={getTelemetry}
            />

            {activeAction && (
              <div className="absolute bottom-2 left-4 right-4 z-20">
                <ActionCard
                  action={activeAction}
                  onDismiss={() => setActiveAction(null)}
                />
              </div>
            )}
          </section>

          <footer className="relative z-10 pb-4 sm:pb-6 px-5 sm:px-8 flex flex-col items-center gap-2.5 shrink-0">
            <AudioWaveform
              state={sessionState}
              mood={mood}
              getTelemetry={getTelemetry}
            />

            <MicButton
              state={sessionState}
              onPrimaryPress={handlePrimaryPress}
              onDisconnect={handleDisconnect}
            />

            <div className="w-full max-w-lg pt-1 flex items-center justify-between text-[11px] font-mono text-slate-400/90 tabular-nums">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Voice Session</span>
                <span aria-hidden="true" className="text-slate-700">
                  ·
                </span>
                <span className={isLive ? 'text-slate-200' : 'text-slate-500'}>
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive ? 'bg-cyan-400 shadow-[0_0_6px_#22e5ff]' : 'bg-slate-600'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-slate-400">Gemini Live</span>
              </div>
            </div>
          </footer>
        </>
      ) : (
        <section className="relative z-10 flex-1 min-h-0 pt-3 flex flex-col">
          {mode === 'chat' && <ChatPanel pendingCommand={studioCommands.chat} />}
          {mode === 'photo' && (
            <PhotoStudio pendingCommand={studioCommands.photo} />
          )}
          {mode === 'video' && (
            <VideoStudio pendingCommand={studioCommands.video} />
          )}
        </section>
      )}
    </main>
  );
}
