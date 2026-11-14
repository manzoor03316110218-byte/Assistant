import { Loader2, Mic, PhoneOff, Square } from 'lucide-react';
import { SessionState } from '../types/live';

interface MicButtonProps {
  state: SessionState;
  onPrimaryPress: () => void;
  onDisconnect: () => void;
}

export function MicButton({
  state,
  onPrimaryPress,
  onDisconnect,
}: MicButtonProps) {
  const isActive = state === 'listening' || state === 'speaking';
  const isSpeaking = state === 'speaking';
  const isConnecting = state === 'connecting';

  const primaryLabel =
    state === 'disconnected'
      ? 'Tap to talk'
      : state === 'connecting'
        ? 'Connecting...'
        : isSpeaking
          ? 'Tap to interrupt'
          : 'Tap to end';

  const ariaLabel =
    state === 'disconnected'
      ? 'Start voice session with Mahi'
      : state === 'connecting'
        ? 'Cancel connection'
        : isSpeaking
          ? 'Interrupt Mahi and speak'
          : 'End voice session';

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative flex items-center justify-center">
        {/* Outer rotating segmented orbital arcs */}
        <svg
          className={`w-32 h-32 sm:w-36 sm:h-36 pointer-events-none transition-opacity duration-300 ${
            state === 'disconnected' ? 'opacity-45' : 'opacity-100'
          }`}
          viewBox="0 0 144 144"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="ringGradCyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22e5ff" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id="ringGradMagenta" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff2fa8" />
              <stop offset="100%" stopColor="#22e5ff" />
            </linearGradient>
          </defs>

          <g
            className={isActive || isConnecting ? 'animate-orbit-slow' : ''}
            style={{ transformOrigin: '72px 72px' }}
          >
            <circle
              cx="72"
              cy="72"
              r="64"
              fill="none"
              stroke="url(#ringGradCyan)"
              strokeWidth="1.5"
              strokeDasharray="65 36 28 32"
              strokeLinecap="round"
              opacity={isActive ? '0.85' : '0.45'}
            />
          </g>

          <g
            className={isActive || isConnecting ? 'animate-orbit-reverse' : ''}
            style={{ transformOrigin: '72px 72px' }}
          >
            <circle
              cx="72"
              cy="72"
              r="53"
              fill="none"
              stroke="url(#ringGradMagenta)"
              strokeWidth="1.75"
              strokeDasharray="48 24 38 28"
              strokeLinecap="round"
              opacity={isSpeaking ? '0.95' : isActive ? '0.75' : '0.35'}
            />
          </g>
        </svg>

        {/* Central glowing tactile button */}
        <button
          type="button"
          onClick={onPrimaryPress}
          aria-label={ariaLabel}
          className={`absolute flex items-center justify-center w-[76px] h-[76px] sm:w-20 sm:h-20 rounded-full border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05050a] active:scale-95 ${
            isSpeaking
              ? 'bg-gradient-to-br from-fuchsia-600/90 via-purple-600/90 to-cyan-500/80 border-cyan-300/70 shadow-[0_0_32px_rgba(255,47,168,0.65)] text-white'
              : isActive
                ? 'bg-gradient-to-br from-fuchsia-600/80 via-purple-700/80 to-indigo-700/80 border-fuchsia-300/60 shadow-[0_0_28px_rgba(217,70,239,0.5)] text-white'
                : isConnecting
                  ? 'bg-slate-900/90 border-cyan-400/50 shadow-[0_0_22px_rgba(34,229,255,0.3)] text-cyan-200'
                  : 'bg-[#100d1f]/90 border-white/20 hover:border-fuchsia-400/60 shadow-[0_0_24px_rgba(168,85,247,0.28)] hover:shadow-[0_0_30px_rgba(255,47,168,0.45)] text-slate-100'
          }`}
        >
          {isConnecting ? (
            <Loader2 className="w-7 h-7 animate-spin" />
          ) : isSpeaking ? (
            <Square className="w-6 h-6 fill-current" />
          ) : (
            <Mic className="w-7 h-7" />
          )}
        </button>

        {/* Secondary End Call button when Mahi is speaking so user can cleanly disconnect */}
        {isSpeaking && (
          <button
            type="button"
            onClick={onDisconnect}
            aria-label="End voice session"
            title="End session"
            className="absolute -right-14 sm:-right-16 flex items-center justify-center w-11 h-11 rounded-full bg-white/5 hover:bg-rose-500/20 border border-white/15 hover:border-rose-400/60 text-slate-300 hover:text-rose-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        )}
      </div>

      <span className="text-[11px] font-medium tracking-[0.22em] uppercase text-slate-300/90">
        {primaryLabel}
      </span>
    </div>
  );
}
