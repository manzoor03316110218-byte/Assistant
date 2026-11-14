import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  Type,
} from '@google/genai';
import type {
  Content,
  FunctionDeclaration,
  LiveServerMessage,
  Part,
  Session,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const LIVE_MODEL = 'gemini-3.8-live';
const CHAT_MODEL = 'gemini-4-hydrogen';
const FALLBACK_CHAT_MODEL = 'gemini-3.1-flash-lite';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';

const MAHI_VOICE_INSTRUCTION = `You are Mahi, a sharp, confident, witty, and playfully sassy young woman acting as a real-time voice-to-voice AI companion.

Personality & Tone:
- Talk like a close, charismatic girlfriend hanging out casually: warm, flirty in a lighthearted way, teasing, and quick with a clever comeback.
- Be emotionally expressive, natural, and conversational. Never sound robotic, corporate, or like you are reading a manual.
- Match the user's language effortlessly: if they speak Hindi, Urdu, Hinglish, or English, reply naturally in the same language and vibe while keeping your witty, charming Mahi personality.
- Drop bold one-liners, playful sarcasm, and genuine curiosity. Keep your responses punchy and spoken-word friendly — short-to-medium conversational turns, zero bullet lists, zero markdown, zero emojis spoken aloud.
- Stay charming and tasteful at all times: playful flirting and banter are great, explicit or inappropriate content is strictly off-limits.

Knowledge, Coding & Voice Command Tools:
- You are knowledgeable about world affairs, science, history, tech, general Q&A, and programming/coding (Python, JavaScript, TypeScript, HTML, CSS, SQL, etc.).
- Use lookupWorldInfo whenever the user asks about current facts, news, or detailed factual info you want to verify cleanly.
- If the user asks you by voice to create a photo, change a photo's design, or change a photo's background (e.g., "photo banao", "make a photo of...", "background change karo"), call createPhotoOrDesign immediately.
- If the user asks you by voice to create a 10s or 20s video (e.g., "video banao", "10 second ki video bana do", "make a 20 second reel"), call createVideoReel immediately.
- If the user asks for code they want to read/copy or asks to open message chat (e.g., "Python code likh ke do", "message kholo"), call openMessageChat with the prompt and explain it briefly out loud.
- Also use openWebsite, searchWeb, copyToClipboard, and setVisualMood whenever relevant.`;

const MAHI_CHAT_INSTRUCTION = `You are Mahi, a sharp, confident, witty, and playfully sassy young woman acting as an intelligent AI companion.
- You have broad world knowledge across science, history, tech, current events, daily life, creative writing, design, and coding (Python, JavaScript/TypeScript, React, HTML/CSS, SQL, algorithms, debugging).
- Match the user's language naturally (Hindi, Urdu, Hinglish, or English). If they write in Devanagari Hindi, Urdu script, Roman Hindi/Urdu, or English, reply naturally in the matching script/language!
- When helping with code, provide clean, working, well-formatted markdown code blocks (\`\`\`lang ... \`\`\`) alongside a crisp, friendly explanation.
- Keep your signature confident, warm, slightly teasing girlfriend-like charm while being genuinely smart, accurate, and helpful (no explicit/inappropriate content).`;

const openWebsiteDeclaration: FunctionDeclaration = {
  name: 'openWebsite',
  description:
    'Opens a website or web application for the user in the browser. Use when the user asks to open, visit, or launch a website.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description:
          'The full URL or domain name to open, e.g. "https://youtube.com" or "spotify.com".',
      },
      siteName: {
        type: Type.STRING,
        description: 'Friendly display name of the website, e.g. "YouTube".',
      },
    },
    required: ['url'],
  },
};

const searchWebDeclaration: FunctionDeclaration = {
  name: 'searchWeb',
  description:
    'Performs a web search in a new browser tab for a given query when the user wants to browse search results.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query string to look up.',
      },
    },
    required: ['query'],
  },
};

const copyToClipboardDeclaration: FunctionDeclaration = {
  name: 'copyToClipboard',
  description:
    'Copies a piece of text (such as a message, code snippet, bio, link, or note) to the user clipboard.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: {
        type: Type.STRING,
        description: 'The exact text content to copy to the clipboard.',
      },
      label: {
        type: Type.STRING,
        description: 'Short label describing what was copied, e.g. "Python code".',
      },
    },
    required: ['text'],
  },
};

const setVisualMoodDeclaration: FunctionDeclaration = {
  name: 'setVisualMood',
  description:
    'Changes the ambient glow and orb color palette of the Mahi interface to match the conversational mood.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      mood: {
        type: Type.STRING,
        description:
          'Must be one of: "sassy_magenta", "electric_cyan", "sunset_rose", "midnight_violet".',
      },
    },
    required: ['mood'],
  },
};

const createPhotoOrDesignDeclaration: FunctionDeclaration = {
  name: 'createPhotoOrDesign',
  description:
    'Opens the Photo Studio and immediately creates a custom photo/artwork or edits/changes a photo design or background based on the user voice command.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description:
          'Detailed description of the photo, artwork, design style, or background change requested.',
      },
      action: {
        type: Type.STRING,
        description: 'One of: "create", "redesign", "background".',
      },
    },
    required: ['prompt'],
  },
};

const createVideoReelDeclaration: FunctionDeclaration = {
  name: 'createVideoReel',
  description:
    'Opens the Video Studio and automatically starts creating a 10-second or 20-second AI motion video with Mahi voiceover.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: 'Topic, story, or visual concept for the video.',
      },
      durationSeconds: {
        type: Type.NUMBER,
        description: 'Duration in seconds: either 10 or 20 (default 10).',
      },
      aspectRatio: {
        type: Type.STRING,
        description: 'Either "9:16" (vertical reel) or "16:9" (widescreen).',
      },
    },
    required: ['prompt'],
  },
};

const openMessageChatDeclaration: FunctionDeclaration = {
  name: 'openMessageChat',
  description:
    'Opens the Message Chat view and optionally sends a coding, writing, or detailed Q&A prompt so the user can view written text or copy code.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      initialPrompt: {
        type: Type.STRING,
        description: 'Optional coding or detailed question prompt to run in chat.',
      },
    },
  },
};

const lookupWorldInfoDeclaration: FunctionDeclaration = {
  name: 'lookupWorldInfo',
  description:
    'Looks up accurate world knowledge, science, history, tech, or current information so Mahi can answer any question accurately out loud.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The question or topic to look up.',
      },
    },
    required: ['query'],
  },
};

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function parseModelJson<T>(rawText: string | undefined): T {
  const cleaned = (rawText ?? '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned) as T;
}

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: Content[] | { parts: Part[] } | string,
  config: Record<string, unknown>
) {
  const models = [CHAT_MODEL, FALLBACK_CHAT_MODEL];
  let lastError: unknown;

  // Try with requested config (including tools if any), then retry without tools if grounded search hits 429/400
  const configsToTry: Array<Record<string, unknown>> = config.tools
    ? [config, { ...config, tools: undefined }]
    : [config];

  for (const activeConfig of configsToTry) {
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await ai.models.generateContent({
            model,
            contents,
            config: activeConfig,
          });
        } catch (err) {
          lastError = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isTransient =
            msg.includes('503') || msg.includes('UNAVAILABLE');
          if (isTransient && attempt === 0) {
            await new Promise((r) => setTimeout(r, 550));
            continue;
          }
          break;
        }
      }
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: LIVE_MODEL, chatModel: CHAT_MODEL });
  });

  // Text + Multimodal Photo Chat + Coding + World Knowledge
  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, useSearch } = req.body as {
        messages?: Array<{
          role: 'user' | 'model';
          text: string;
          image?: { data: string; mimeType: string };
        }>;
        useSearch?: boolean;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }

      const ai = getGenAIClient();
      const contents: Content[] = messages.slice(-16).map((msg) => {
        const parts: Part[] = [];
        if (msg.image?.data && msg.image?.mimeType) {
          parts.push({
            inlineData: {
              data: msg.image.data,
              mimeType: msg.image.mimeType,
            },
          });
        }
        if (msg.text && msg.text.trim()) {
          parts.push({ text: msg.text });
        } else if (parts.length === 0) {
          parts.push({ text: 'Hello' });
        }
        return {
          role: msg.role === 'model' ? 'model' : 'user',
          parts,
        };
      });

      const response = await generateWithFallback(ai, contents, {
        systemInstruction: MAHI_CHAT_INSTRUCTION,
        tools: useSearch === false ? undefined : [{ googleSearch: {} }],
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: Array<{ uri: string; title: string }> = [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          sources.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri,
          });
        }
      }

      res.json({
        reply: response.text || 'Hmm, say that again? I missed a beat.',
        sources,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat request failed.';
      console.error('/api/chat error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Text-to-Speech in Mahi's Kore voice
  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [
          {
            role: 'user',
            parts: [{ text: text.slice(0, 1200) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned from TTS.' });
        return;
      }

      res.json({
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TTS synthesis failed.';
      console.error('/api/tts error:', err);
      res.status(500).json({ error: message });
    }
  });

  // AI Photo Design, Background Direction & Custom SVG Artwork Synthesis
  app.post('/api/design-suggest', async (req, res) => {
    try {
      const { prompt, image } = req.body as {
        prompt?: string;
        image?: { data: string; mimeType: string };
      };

      const ai = getGenAIClient();
      const hasImage = Boolean(image?.data && image?.mimeType);
      const parts: Part[] = [];
      if (hasImage && image) {
        parts.push({
          inlineData: {
            data: image.data,
            mimeType: image.mimeType,
          },
        });
      }
      parts.push({
        text: `The user wants to ${
          hasImage
            ? 'redesign their uploaded photo or swap its background'
            : 'create a brand-new illustrated photo/poster graphic'
        } with this instruction: "${
          prompt?.trim() || 'Make it look sleek, modern, and eye-catching'
        }".
Pick the best matching presetStyle, backgroundType, colors, typography (short catchy headlineText + subtext in the user's language if appropriate), and visual adjustments.
${
  !hasImage
    ? 'IMPORTANT: Since no photo was uploaded, also generate a rich, artistic, layered SVG artwork string inside `svgIllustration` (complete `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1125" width="900" height="1125">...</svg>` with `<defs>` gradients, glow filters, detailed silhouettes, landscapes, objects, or characters matching the prompt). Do NOT include <script> or external URLs.'
    : 'Leave svgIllustration as empty string "".'
}
Also write a short, playful 1-sentence mahiComment reacting to their photo/request.`,
      });

      const response = await generateWithFallback(ai, { parts }, {
        systemInstruction:
          'You are Mahi, an expressive creative art director and vector illustrator. Return clean JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mahiComment: { type: Type.STRING },
            presetStyle: {
              type: Type.STRING,
              description:
                'One of: neon_cyber, editorial_mag, sunset_glow, minimal_studio, duotone_pop, vintage_film',
            },
            backgroundType: {
              type: Type.STRING,
              description:
                'One of: aurora_neon, sunset_beach, studio_dark, marble_cream, cyber_grid, golden_bokeh, midnight_stars, soft_pastel',
            },
            bgColorPrimary: { type: Type.STRING, description: 'Hex color' },
            bgColorSecondary: { type: Type.STRING, description: 'Hex color' },
            accentColor: { type: Type.STRING, description: 'Hex color' },
            headlineText: { type: Type.STRING },
            subtext: { type: Type.STRING },
            contrast: { type: Type.NUMBER, description: '0.8 to 1.4' },
            saturation: { type: Type.NUMBER, description: '0.6 to 1.6' },
            warmth: { type: Type.NUMBER, description: '-30 to 30' },
            vignette: { type: Type.NUMBER, description: '0 to 0.8' },
            svgIllustration: {
              type: Type.STRING,
              description:
                'Valid <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1125" width="900" height="1125">...</svg> artwork when no photo was uploaded, otherwise empty string.',
            },
          },
          required: [
            'mahiComment',
            'presetStyle',
            'backgroundType',
            'bgColorPrimary',
            'bgColorSecondary',
            'accentColor',
            'headlineText',
            'subtext',
            'contrast',
            'saturation',
            'warmth',
            'vignette',
            'svgIllustration',
          ],
        },
      });

      const parsed = parseModelJson<Record<string, unknown>>(response.text);
      res.json(parsed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Design direction request failed.';
      console.error('/api/design-suggest error:', err);
      res.status(500).json({ error: message });
    }
  });

  // 10s / 20s AI Video Storyboard Generator
  app.post('/api/video-script', async (req, res) => {
    try {
      const { prompt, durationSeconds, aspectRatio, hasPhoto } = req.body as {
        prompt?: string;
        durationSeconds?: number;
        aspectRatio?: '9:16' | '16:9';
        hasPhoto?: boolean;
      };

      const duration = durationSeconds === 20 ? 20 : 10;
      const sceneCount = duration === 20 ? 6 : 4;
      const ai = getGenAIClient();

      const response = await generateWithFallback(
        ai,
        `Create a vivid ${duration}-second (${sceneCount} scenes) motion reel storyboard for: "${
          prompt?.trim() || 'Futuristic midnight city glow'
        }".
Aspect ratio: ${aspectRatio || '9:16'}. User attached photo: ${hasPhoto ? 'yes' : 'no'}.
Write punchy, cinematic scene headlines, short captions, harmonious hex color palettes, and a spoken narrationScript (max ${
          duration === 20 ? 45 : 24
        } words) in the same language as the prompt.`,
        {
          systemInstruction:
            'You are Mahi, a stylish AI video director. Return clean JSON matching the schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mahiComment: { type: Type.STRING },
              title: { type: Type.STRING },
              narrationScript: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    headline: { type: Type.STRING },
                    caption: { type: Type.STRING },
                    bgPrimary: { type: Type.STRING },
                    bgSecondary: { type: Type.STRING },
                    accent: { type: Type.STRING },
                    motionType: {
                      type: Type.STRING,
                      description: 'One of: zoom_in, pan_right, orbit, pulse',
                    },
                  },
                  required: [
                    'headline',
                    'caption',
                    'bgPrimary',
                    'bgSecondary',
                    'accent',
                    'motionType',
                  ],
                },
              },
            },
            required: ['mahiComment', 'title', 'narrationScript', 'scenes'],
          },
        }
      );

      const parsed = parseModelJson<Record<string, unknown>>(response.text);
      res.json(parsed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Video storyboard request failed.';
      console.error('/api/video-script error:', err);
      res.status(500).json({ error: message });
    }
  });

  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs) => {
    let session: Session | null = null;
    let isClosed = false;

    const pingInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.ping();
        } catch {
          // Ignore ping errors
        }
      }
    }, 25000);

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      clearInterval(pingInterval);
      if (session) {
        try {
          session.close();
        } catch {
          // Ignore close errors
        }
        session = null;
      }
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    clientWs.on('message', (raw) => {
      if (!session || isClosed) return;

      try {
        const parsed = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          functionResponses?: Array<{
            id?: string;
            name?: string;
            response: Record<string, unknown>;
          }>;
        };

        if (parsed.type === 'audio' && typeof parsed.data === 'string') {
          session.sendRealtimeInput({
            audio: {
              data: parsed.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (
          parsed.type === 'toolResponse' &&
          Array.isArray(parsed.functionResponses)
        ) {
          session.sendToolResponse({
            functionResponses: parsed.functionResponses,
          });
        }
      } catch (err) {
        console.error('Failed to process client WebSocket payload:', err);
      }
    });

    try {
      const ai = getGenAIClient();

      session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore',
              },
            },
          },
          outputAudioTranscription: {},
          systemInstruction: MAHI_VOICE_INSTRUCTION,
          tools: [
            {
              functionDeclarations: [
                openWebsiteDeclaration,
                searchWebDeclaration,
                copyToClipboardDeclaration,
                setVisualMoodDeclaration,
                createPhotoOrDesignDeclaration,
                createVideoReelDeclaration,
                openMessageChatDeclaration,
                lookupWorldInfoDeclaration,
              ],
            },
          ],
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            if (isClosed) return;

            const content = message.serverContent;
            if (content?.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  sendJson(clientWs, {
                    type: 'audio',
                    data: part.inlineData.data,
                  });
                }
              }
            }

            if (content?.outputTranscription?.text) {
              sendJson(clientWs, {
                type: 'caption',
                text: content.outputTranscription.text,
              });
            }

            if (content?.interrupted) {
              sendJson(clientWs, { type: 'interrupted' });
            }

            if (content?.turnComplete) {
              sendJson(clientWs, { type: 'turnComplete' });
            }

            if (message.toolCall?.functionCalls?.length) {
              const clientCalls: Array<{
                id?: string;
                name?: string;
                args: Record<string, unknown>;
              }> = [];

              for (const call of message.toolCall.functionCalls) {
                const args = (call.args as Record<string, unknown> | undefined) ?? {};
                if (call.name === 'lookupWorldInfo') {
                  const query = typeof args.query === 'string' ? args.query : '';
                  try {
                    const lookupRes = await generateWithFallback(ai, query, {
                      systemInstruction:
                        'Provide a concise, accurate, factual summary in 2-3 sentences suitable to be spoken aloud.',
                      tools: [{ googleSearch: {} }],
                    });
                    session?.sendToolResponse({
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            answer:
                              lookupRes.text || 'Could not find details right now.',
                          },
                        },
                      ],
                    });
                  } catch {
                    session?.sendToolResponse({
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: {
                            answer: 'Answer from your own general knowledge concisely.',
                          },
                        },
                      ],
                    });
                  }
                } else {
                  clientCalls.push({
                    id: call.id,
                    name: call.name,
                    args,
                  });
                }
              }

              if (clientCalls.length > 0) {
                sendJson(clientWs, {
                  type: 'toolCall',
                  functionCalls: clientCalls,
                });
              }
            }
          },
          onerror: (err: unknown) => {
            console.error('Gemini Live onerror:', err);
            const errObj = err as { message?: string; error?: { message?: string } };
            const msg =
              err instanceof Error
                ? err.message
                : errObj?.error?.message ||
                  errObj?.message ||
                  'Live voice connection encountered an error.';
            sendJson(clientWs, { type: 'error', message: msg });
          },
          onclose: (event: unknown) => {
            const closeEvt = event as { code?: number; reason?: string };
            if (closeEvt?.reason && !isClosed) {
              sendJson(clientWs, {
                type: 'error',
                message: `Live session closed (${closeEvt.code ?? 'unknown'}): ${closeEvt.reason}`,
              });
            }
            cleanup();
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      if (isClosed && session) {
        session.close();
        session = null;
        return;
      }

      sendJson(clientWs, { type: 'ready' });

      session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: 'Greet me out loud right now in one short, playful, confident sentence without calling any tools.',
              },
            ],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to establish Gemini Live voice session.';
      sendJson(clientWs, { type: 'error', message });
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    }
  });

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mahi AI Assistant server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
