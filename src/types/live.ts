export type AppMode = 'voice' | 'chat' | 'photo' | 'video';

export type SessionState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export type VisualMood =
  | 'sassy_magenta'
  | 'electric_cyan'
  | 'sunset_rose'
  | 'midnight_violet';

export interface BrowserActionEvent {
  id: string;
  toolName:
    | 'openWebsite'
    | 'searchWeb'
    | 'copyToClipboard'
    | 'setVisualMood'
    | 'createPhotoOrDesign'
    | 'createVideoReel'
    | 'openMessageChat';
  title: string;
  subtitle: string;
  url?: string;
  copiedText?: string;
  mood?: VisualMood;
  timestamp: number;
}

export interface LiveToolCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
}

export interface LiveFunctionResponse {
  id?: string;
  name?: string;
  response: Record<string, unknown>;
}

export type ServerToClientMessage =
  | { type: 'ready' }
  | { type: 'audio'; data: string }
  | { type: 'caption'; text: string }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'toolCall'; functionCalls: LiveToolCall[] }
  | { type: 'error'; message: string };

export type ClientToServerMessage =
  | { type: 'audio'; data: string }
  | { type: 'toolResponse'; functionResponses: LiveFunctionResponse[] };

export interface ImageAttachment {
  data: string;
  mimeType: string;
  previewUrl: string;
}

export interface ChatSource {
  uri: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  imagePreviewUrl?: string;
  sources?: ChatSource[];
  timestamp: number;
}

export type DesignPresetStyle =
  | 'neon_cyber'
  | 'editorial_mag'
  | 'sunset_glow'
  | 'minimal_studio'
  | 'duotone_pop'
  | 'vintage_film';

export type BackgroundTheme =
  | 'aurora_neon'
  | 'sunset_beach'
  | 'studio_dark'
  | 'marble_cream'
  | 'cyber_grid'
  | 'golden_bokeh'
  | 'midnight_stars'
  | 'soft_pastel';

export interface PhotoDesignSpec {
  mahiComment: string;
  presetStyle: DesignPresetStyle;
  backgroundType: BackgroundTheme;
  bgColorPrimary: string;
  bgColorSecondary: string;
  accentColor: string;
  headlineText: string;
  subtext: string;
  contrast: number;
  saturation: number;
  warmth: number;
  vignette: number;
  svgIllustration?: string;
}

export interface VideoScene {
  headline: string;
  caption: string;
  bgPrimary: string;
  bgSecondary: string;
  accent: string;
  motionType: 'zoom_in' | 'pan_right' | 'orbit' | 'pulse';
}

export interface VideoStoryboard {
  mahiComment: string;
  title: string;
  narrationScript: string;
  scenes: VideoScene[];
}

export interface VoiceStudioCommand {
  photo?: {
    prompt: string;
    action: 'create' | 'redesign' | 'background';
    nonce: number;
  };
  video?: {
    prompt: string;
    durationSeconds: 10 | 20;
    aspectRatio: '9:16' | '16:9';
    nonce: number;
  };
  chat?: {
    prompt: string;
    nonce: number;
  };
}
