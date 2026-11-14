import {
  Check,
  ExternalLink,
  Film,
  Globe,
  MessageCircle,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { BrowserActionEvent } from '../types/live';

interface ActionCardProps {
  action: BrowserActionEvent;
  onDismiss: () => void;
}

export function ActionCard({ action, onDismiss }: ActionCardProps) {
  const Icon =
    action.toolName === 'openWebsite'
      ? Globe
      : action.toolName === 'searchWeb'
        ? Search
        : action.toolName === 'copyToClipboard'
          ? Check
          : action.toolName === 'createPhotoOrDesign'
            ? Wand2
            : action.toolName === 'createVideoReel'
              ? Film
              : action.toolName === 'openMessageChat'
                ? MessageCircle
                : Sparkles;

  return (
    <div
      role="status"
      className="w-full max-w-sm mx-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-[#110f24]/90 backdrop-blur-md border border-fuchsia-400/25 shadow-[0_8px_30px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-400/30 text-cyan-300">
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">
            {action.title}
          </p>
          <p className="text-[11px] text-slate-400 truncate">{action.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {action.url && (
          <a
            href={action.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/35 border border-fuchsia-400/40 text-xs font-medium text-fuchsia-100 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Open</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss action notice"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
