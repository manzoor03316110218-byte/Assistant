import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ChatMessage, ImageAttachment } from '../types/live';
import { readImageFile } from '../utils/imageFile';

const TOPIC_STARTERS = [
  'Duniya ke top 5 amazing facts batao',
  'Python mein ek quick calculator code likho',
  'Meri photo dekho aur style suggest karo',
  'Urdu ya Hindi mein ek witty shayari sunao',
];

interface ChatPanelProps {
  pendingCommand?: { prompt: string; nonce: number };
}

interface MessageSegment {
  type: 'text' | 'code';
  content: string;
  lang?: string;
}

function parseCodeSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      lang: match[1] || 'code',
      content: match[2].trimEnd(),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

export function ChatPanel({ pendingCommand }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "Hey! Voice ke alawa ab message bhi kar sakte ho. Duniya ki kisi bhi topic par baat karo, coding poochho, ya photo bhejo — main ready hoon.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<ImageAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const lastNonceRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const processed = await readImageFile(file);
      setAttachment(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load image.');
    }
  };

  const handleSend = useCallback(
    async (customText?: string) => {
      const textToSend = (customText ?? input).trim();
      if ((!textToSend && !attachment) || isSending) return;

      setError(null);
      const currentAttachment = customText ? null : attachment;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: textToSend || 'Look at this photo.',
        imagePreviewUrl: currentAttachment?.previewUrl,
        timestamp: Date.now(),
      };

      const nextHistory = [...messagesRef.current, userMsg];
      setMessages(nextHistory);
      if (!customText) setInput('');
      if (!customText) setAttachment(null);
      setIsSending(true);

      try {
        const payloadMessages = nextHistory.map((m, idx) => {
          const isLatestUser = idx === nextHistory.length - 1 && currentAttachment;
          return {
            role: m.role,
            text: m.text,
            image: isLatestUser
              ? {
                  data: currentAttachment.data,
                  mimeType: currentAttachment.mimeType,
                }
              : undefined,
          };
        });

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: payloadMessages, useSearch: true }),
        });
        const data = (await res.json()) as {
          reply?: string;
          sources?: Array<{ uri: string; title: string }>;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error || 'Failed to get response from Mahi.');
        }

        const botMsg: ChatMessage = {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply || 'Say that again?',
          sources: data.sources,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Message failed.');
      } finally {
        setIsSending(false);
      }
    },
    [attachment, input, isSending]
  );

  useEffect(() => {
    if (
      pendingCommand &&
      pendingCommand.nonce > 0 &&
      pendingCommand.nonce !== lastNonceRef.current
    ) {
      lastNonceRef.current = pendingCommand.nonce;
      if (pendingCommand.prompt.trim()) {
        void handleSend(pendingCommand.prompt.trim());
      }
    }
  }, [pendingCommand, handleSend]);

  const handleSpeak = async (msg: ChatMessage) => {
    if (playingId === msg.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingId(msg.id);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text }),
      });
      const data = (await res.json()) as { audioDataUrl?: string; error?: string };
      if (!res.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Voice playback failed.');
      }
      const audio = new Audio(data.audioDataUrl);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      await audio.play();
    } catch (err) {
      setPlayingId(null);
      setError(err instanceof Error ? err.message : 'Could not play voice.');
    }
  };

  const handleCopyCode = async (key: string, code: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopiedKey(key);
        window.setTimeout(() => setCopiedKey(null), 1800);
      } catch {
        // ignore clipboard errors
      }
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto h-full flex flex-col px-3 sm:px-6 pb-3 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 py-2 pr-1">
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {TOPIC_STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void handleSend(starter)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-fuchsia-500/15 border border-white/10 hover:border-fuchsia-400/40 text-xs text-slate-200 transition-colors cursor-pointer text-left"
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const segments = parseCodeSegments(msg.text);
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-gradient-to-br from-fuchsia-600/80 to-purple-700/80 text-white border border-fuchsia-400/30'
                    : 'bg-[#100e20]/90 text-slate-100 border border-white/10'
                }`}
              >
                {msg.imagePreviewUrl && (
                  <img
                    src={msg.imagePreviewUrl}
                    alt="Uploaded attachment"
                    referrerPolicy="no-referrer"
                    className="mb-2.5 max-h-52 w-auto rounded-xl object-cover border border-white/15"
                  />
                )}

                <div className="space-y-2.5">
                  {segments.map((seg, idx) =>
                    seg.type === 'code' ? (
                      <div
                        key={idx}
                        className="rounded-xl overflow-hidden border border-white/15 bg-[#06060d]"
                      >
                        <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/10 text-[11px] font-mono text-slate-400">
                          <span>{seg.lang}</span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyCode(`${msg.id}-${idx}`, seg.content)
                            }
                            className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                          >
                            {copiedKey === `${msg.id}-${idx}` ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-3 overflow-x-auto text-xs font-mono text-cyan-100 leading-relaxed">
                          <code>{seg.content}</code>
                        </pre>
                      </div>
                    ) : (
                      <p key={idx} className="whitespace-pre-wrap break-words">
                        {seg.content.trim()}
                      </p>
                    )
                  )}
                </div>

                {!isUser && (
                  <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSpeak(msg)}
                      className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-cyan-500/20 text-[11px] font-medium text-cyan-200 transition-colors cursor-pointer"
                    >
                      {playingId === msg.id ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" />
                          <span>Stop Voice</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </>
                      )}
                    </button>

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto max-w-[220px]">
                        {msg.sources.slice(0, 2).map((src) => (
                          <a
                            key={src.uri}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300 hover:text-fuchsia-200 truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start">
            <div className="px-4 py-3 rounded-2xl bg-[#100e20]/90 border border-white/10 text-xs text-slate-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400" />
              <span>Mahi is thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mb-2 px-3 py-2 rounded-xl bg-rose-950/75 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span className="truncate">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="p-1 hover:bg-white/10 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="shrink-0 pt-2">
        {attachment && (
          <div className="mb-2 inline-flex items-center gap-2 p-1.5 pr-2 rounded-xl bg-[#131026] border border-fuchsia-400/30">
            <img
              src={attachment.previewUrl}
              alt="Preview"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-cover"
            />
            <span className="text-xs text-slate-300">Photo attached</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove attachment"
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#0e0c1d]/95 border border-white/15 focus-within:border-fuchsia-400/60 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach photo"
            title="Send photo"
            className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask any question, coding help, or attach a photo..."
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none px-1"
          />

          <button
            type="submit"
            disabled={isSending || (!input.trim() && !attachment)}
            aria-label="Send message"
            className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-600 text-white disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
