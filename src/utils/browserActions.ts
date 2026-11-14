import {
  BrowserActionEvent,
  LiveFunctionResponse,
  LiveToolCall,
  VisualMood,
} from '../types/live';

const VALID_MOODS = new Set<VisualMood>([
  'sassy_magenta',
  'electric_cyan',
  'sunset_rose',
  'midnight_violet',
]);

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return 'https://www.google.com';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function triggerAnchorLaunch(url: string): void {
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } catch {
    // Safe fallback: user can tap the rendered action card link directly
  }
}

export interface BrowserActionCallbacks {
  onMoodChange: (mood: VisualMood) => void;
  onPhotoCommand?: (prompt: string, action: 'create' | 'redesign' | 'background') => void;
  onVideoCommand?: (prompt: string, durationSeconds: 10 | 20, aspectRatio: '9:16' | '16:9') => void;
  onChatCommand?: (prompt: string) => void;
}

export interface ExecutedToolResult {
  functionResponse: LiveFunctionResponse;
  actionEvent?: BrowserActionEvent;
}

export async function executeBrowserToolCall(
  call: LiveToolCall,
  callbacks: BrowserActionCallbacks
): Promise<ExecutedToolResult> {
  const args = call.args ?? {};
  const id = call.id;
  const name = call.name ?? 'unknown';

  if (name === 'openWebsite') {
    const rawUrl = typeof args.url === 'string' ? args.url : 'https://google.com';
    const url = normalizeUrl(rawUrl);
    let fallbackHost = 'website';
    try {
      fallbackHost = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      fallbackHost = rawUrl;
    }
    const siteName =
      typeof args.siteName === 'string' && args.siteName.trim()
        ? args.siteName.trim()
        : fallbackHost;

    triggerAnchorLaunch(url);

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: true,
          openedUrl: url,
          siteName,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'openWebsite',
        title: `Opened ${siteName}`,
        subtitle: url,
        url,
        timestamp: Date.now(),
      },
    };
  }

  if (name === 'searchWeb') {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    triggerAnchorLaunch(url);

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: true,
          query,
          searchUrl: url,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'searchWeb',
        title: `Searched "${query}"`,
        subtitle: 'Google Search',
        url,
        timestamp: Date.now(),
      },
    };
  }

  if (name === 'copyToClipboard') {
    const text = typeof args.text === 'string' ? args.text : '';
    const label =
      typeof args.label === 'string' && args.label.trim()
        ? args.label.trim()
        : 'Copied text';

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: copied,
          label,
          characterCount: text.length,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'copyToClipboard',
        title: copied ? `Copied: ${label}` : `Ready to copy: ${label}`,
        subtitle: text.length > 64 ? `${text.slice(0, 64)}...` : text,
        copiedText: text,
        timestamp: Date.now(),
      },
    };
  }

  if (name === 'setVisualMood') {
    const requested = typeof args.mood === 'string' ? args.mood : 'sassy_magenta';
    const mood: VisualMood = VALID_MOODS.has(requested as VisualMood)
      ? (requested as VisualMood)
      : 'sassy_magenta';

    callbacks.onMoodChange(mood);

    const moodLabels: Record<VisualMood, string> = {
      sassy_magenta: 'Sassy Magenta',
      electric_cyan: 'Electric Cyan',
      sunset_rose: 'Sunset Rose',
      midnight_violet: 'Midnight Violet',
    };

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: true,
          mood,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'setVisualMood',
        title: `Vibe shifted · ${moodLabels[mood]}`,
        subtitle: 'Orb resonance updated',
        mood,
        timestamp: Date.now(),
      },
    };
  }

  if (name === 'createPhotoOrDesign') {
    const prompt =
      typeof args.prompt === 'string' && args.prompt.trim()
        ? args.prompt.trim()
        : 'Stylish neon artwork';
    const rawAction = typeof args.action === 'string' ? args.action : 'create';
    const action: 'create' | 'redesign' | 'background' =
      rawAction === 'redesign' || rawAction === 'background' ? rawAction : 'create';

    callbacks.onPhotoCommand?.(prompt, action);

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: true,
          openedStudio: 'photo',
          prompt,
          action,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'createPhotoOrDesign',
        title: 'Photo Studio Active',
        subtitle: prompt,
        timestamp: Date.now(),
      },
    };
  }

  if (name === 'createVideoReel') {
    const prompt =
      typeof args.prompt === 'string' && args.prompt.trim()
        ? args.prompt.trim()
        : 'Midnight neon reel';
    const dur = args.durationSeconds === 20 ? 20 : 10;
    const ratio = args.aspectRatio === '16:9' ? '16:9' : '9:16';

    callbacks.onVideoCommand?.(prompt, dur, ratio);

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: true,
          openedStudio: 'video',
          durationSeconds: dur,
          aspectRatio: ratio,
          prompt,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'createVideoReel',
        title: `Creating ${dur}s Video`,
        subtitle: prompt,
        timestamp: Date.now(),
      },
    };
  }

  if (name === 'openMessageChat') {
    const prompt =
      typeof args.initialPrompt === 'string' ? args.initialPrompt.trim() : '';

    callbacks.onChatCommand?.(prompt);

    return {
      functionResponse: {
        id,
        name,
        response: {
          success: true,
          openedStudio: 'chat',
          initialPrompt: prompt,
        },
      },
      actionEvent: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        toolName: 'openMessageChat',
        title: 'Opened Message Chat',
        subtitle: prompt || 'Ready for coding & Q&A',
        timestamp: Date.now(),
      },
    };
  }

  return {
    functionResponse: {
      id,
      name,
      response: {
        success: false,
        error: `Unsupported tool "${name}"`,
      },
    },
  };
}
