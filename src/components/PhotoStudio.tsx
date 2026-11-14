import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  BackgroundTheme,
  DesignPresetStyle,
  ImageAttachment,
  PhotoDesignSpec,
} from '../types/live';
import { readImageFile } from '../utils/imageFile';

interface PhotoStudioProps {
  pendingCommand?: {
    prompt: string;
    action: 'create' | 'redesign' | 'background';
    nonce: number;
  };
}

const DESIGN_STYLES: Array<{ id: DesignPresetStyle; label: string }> = [
  { id: 'neon_cyber', label: 'Neon Cyber' },
  { id: 'editorial_mag', label: 'Editorial' },
  { id: 'sunset_glow', label: 'Sunset Glow' },
  { id: 'minimal_studio', label: 'Minimal' },
  { id: 'duotone_pop', label: 'Duotone' },
  { id: 'vintage_film', label: 'Vintage' },
];

const BACKGROUND_THEMES: Array<{
  id: BackgroundTheme;
  label: string;
  c1: string;
  c2: string;
  accent: string;
}> = [
  { id: 'aurora_neon', label: 'Aurora Neon', c1: '#15082e', c2: '#3b0764', accent: '#22e5ff' },
  { id: 'sunset_beach', label: 'Sunset', c1: '#4c0519', c2: '#ea580c', accent: '#fde047' },
  { id: 'studio_dark', label: 'Studio Dark', c1: '#09090b', c2: '#1e1b4b', accent: '#c084fc' },
  { id: 'marble_cream', label: 'Cream Studio', c1: '#f5f5f4', c2: '#e7e5e4', accent: '#18181b' },
  { id: 'cyber_grid', label: 'Cyber Grid', c1: '#020617', c2: '#0f172a', accent: '#ff2fa8' },
  { id: 'golden_bokeh', label: 'Golden Bokeh', c1: '#1c1917', c2: '#78350f', accent: '#fbbf24' },
  { id: 'midnight_stars', label: 'Starlight', c1: '#030712', c2: '#172554', accent: '#38bdf8' },
  { id: 'soft_pastel', label: 'Rose Pastel', c1: '#fdf2f8', c2: '#ede9fe', accent: '#db2777' },
];

function sanitizeSvg(rawSvg: string): string | null {
  if (!rawSvg || !rawSvg.includes('<svg')) return null;
  const cleaned = rawSvg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/(?:xlink:)?href\s*=\s*["']https?:\/\/[^"']*["']/gi, '');
  const match = cleaned.match(/<svg[\s\S]*<\/svg>/i);
  return match ? match[0] : null;
}

function drawBackgroundScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: BackgroundTheme,
  c1: string,
  c2: string,
  accent: string
) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (theme === 'aurora_neon' || theme === 'sunset_beach') {
    const glow1 = ctx.createRadialGradient(w * 0.25, h * 0.25, 10, w * 0.25, h * 0.25, w * 0.7);
    glow1.addColorStop(0, `${accent}66`);
    glow1.addColorStop(1, 'transparent');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, w, h);

    const glow2 = ctx.createRadialGradient(w * 0.8, h * 0.75, 10, w * 0.8, h * 0.75, w * 0.65);
    glow2.addColorStop(0, '#ff2fa855');
    glow2.addColorStop(1, 'transparent');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, w, h);
  } else if (theme === 'cyber_grid') {
    ctx.strokeStyle = `${accent}33`;
    ctx.lineWidth = 1.5;
    const step = 48;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (theme === 'golden_bokeh' || theme === 'midnight_stars') {
    for (let i = 0; i < 36; i++) {
      const px = ((i * 197) % 100) * (w / 100);
      const py = ((i * 313) % 100) * (h / 100);
      const r = theme === 'golden_bokeh' ? 14 + (i % 5) * 12 : 1.5 + (i % 3);
      ctx.fillStyle = `${accent}${theme === 'golden_bokeh' ? '2e' : 'aa'}`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function isolateSubjectCanvas(
  img: HTMLImageElement,
  sensitivity: number
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  if (!octx) return off;

  octx.drawImage(img, 0, 0);
  if (sensitivity <= 0) return off;

  const imgData = octx.getImageData(0, 0, off.width, off.height);
  const data = imgData.data;
  const w = off.width;
  const h = off.height;

  const sampleCoords = [
    [4, 4],
    [w - 5, 4],
    [Math.floor(w / 2), 4],
    [4, Math.floor(h / 2)],
    [w - 5, Math.floor(h / 2)],
  ];
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  for (const [sx, sy] of sampleCoords) {
    if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
      const idx = (sy * w + sx) * 4;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count++;
    }
  }
  const bgR = rSum / Math.max(1, count);
  const bgG = gSum / Math.max(1, count);
  const bgB = bSum / Math.max(1, count);

  const threshold = 22 + sensitivity * 1.45;
  const feather = 26;

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - bgR;
    const dg = data[i + 1] - bgG;
    const db = data[i + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist < threshold) {
      data[i + 3] = 0;
    } else if (dist < threshold + feather) {
      const alpha = ((dist - threshold) / feather) * 255;
      data[i + 3] = Math.min(data[i + 3], alpha);
    }
  }

  octx.putImageData(imgData, 0, 0);
  return off;
}

export function PhotoStudio({ pendingCommand }: PhotoStudioProps) {
  const [photo, setPhoto] = useState<ImageAttachment | null>(null);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [generatedSvgImg, setGeneratedSvgImg] = useState<HTMLImageElement | null>(null);
  const [prompt, setPrompt] = useState('');
  const [presetStyle, setPresetStyle] = useState<DesignPresetStyle>('neon_cyber');
  const [bgTheme, setBgTheme] = useState<BackgroundTheme>('aurora_neon');
  const [bgPrimary, setBgPrimary] = useState('#15082e');
  const [bgSecondary, setBgSecondary] = useState('#3b0764');
  const [accentColor, setAccentColor] = useState('#22e5ff');
  const [headline, setHeadline] = useState('MAHI STUDIO');
  const [subtext, setSubtext] = useState('Designed in real time');
  const [bgCutout, setBgCutout] = useState(35);
  const [contrast, setContrast] = useState(1.08);
  const [saturation, setSaturation] = useState(1.12);
  const [vignette, setVignette] = useState(0.35);
  const [mahiComment, setMahiComment] = useState<string | null>(
    'Photo bhejo ya koi bhi artwork prompt likho — background, design aur poster sab ban jayega.'
  );
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastNonceRef = useRef(0);
  const photoRef = useRef(photo);
  photoRef.current = photo;

  useEffect(() => {
    if (!photo) {
      setLoadedImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLoadedImg(img);
    img.src = photo.previewUrl;
  }, [photo]);

  const runAiStyle = useCallback(async (instruction: string) => {
    setIsApplying(true);
    setError(null);
    const currentPhoto = photoRef.current;

    try {
      const res = await fetch('/api/design-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: instruction || 'Redesign this photo with a bold modern studio background',
          image: currentPhoto
            ? { data: currentPhoto.data, mimeType: currentPhoto.mimeType }
            : undefined,
        }),
      });
      const spec = (await res.json()) as PhotoDesignSpec & { error?: string };
      if (!res.ok) throw new Error(spec.error || 'Could not apply AI styling.');

      if (spec.presetStyle) setPresetStyle(spec.presetStyle);
      if (spec.backgroundType) setBgTheme(spec.backgroundType);
      if (spec.bgColorPrimary) setBgPrimary(spec.bgColorPrimary);
      if (spec.bgColorSecondary) setBgSecondary(spec.bgColorSecondary);
      if (spec.accentColor) setAccentColor(spec.accentColor);
      if (spec.headlineText) setHeadline(spec.headlineText);
      if (spec.subtext) setSubtext(spec.subtext);
      if (typeof spec.contrast === 'number') setContrast(spec.contrast);
      if (typeof spec.saturation === 'number') setSaturation(spec.saturation);
      if (typeof spec.vignette === 'number') setVignette(spec.vignette);
      if (currentPhoto && bgCutout < 30) setBgCutout(42);

      if (!currentPhoto && spec.svgIllustration) {
        const safeSvg = sanitizeSvg(spec.svgIllustration);
        if (safeSvg) {
          const blob = new Blob([safeSvg], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const svgImg = new Image();
          svgImg.onload = () => {
            setGeneratedSvgImg(svgImg);
            URL.revokeObjectURL(url);
          };
          svgImg.onerror = () => URL.revokeObjectURL(url);
          svgImg.src = url;
        }
      }

      setMahiComment(spec.mahiComment || 'Done! Look at that makeover.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI styling failed.');
    } finally {
      setIsApplying(false);
    }
  }, [bgCutout]);

  useEffect(() => {
    if (
      pendingCommand &&
      pendingCommand.nonce > 0 &&
      pendingCommand.nonce !== lastNonceRef.current
    ) {
      lastNonceRef.current = pendingCommand.nonce;
      setPrompt(pendingCommand.prompt);
      if (pendingCommand.action === 'background' && photoRef.current) {
        setBgCutout((prev) => Math.max(prev, 48));
      }
      void runAiStyle(pendingCommand.prompt);
    }
  }, [pendingCommand, runAiStyle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 900;
    const h = 1125;
    canvas.width = w;
    canvas.height = h;

    drawBackgroundScene(ctx, w, h, bgTheme, bgPrimary, bgSecondary, accentColor);

    if (loadedImg) {
      const processedCanvas = isolateSubjectCanvas(loadedImg, bgCutout);
      ctx.save();
      ctx.filter = `contrast(${contrast}) saturate(${saturation})${
        presetStyle === 'vintage_film' ? ' sepia(0.28)' : ''
      }`;

      const pad =
        presetStyle === 'minimal_studio' ? 76 : presetStyle === 'editorial_mag' ? 36 : 0;
      const drawW = w - pad * 2;
      const drawH = h - pad * 2;

      const imgAspect = loadedImg.width / loadedImg.height;
      const boxAspect = drawW / drawH;
      let sx = 0;
      let sy = 0;
      let sw = loadedImg.width;
      let sh = loadedImg.height;
      if (imgAspect > boxAspect) {
        sw = loadedImg.height * boxAspect;
        sx = (loadedImg.width - sw) / 2;
      } else {
        sh = loadedImg.width / boxAspect;
        sy = (loadedImg.height - sh) / 2;
      }

      if (presetStyle === 'minimal_studio') {
        ctx.beginPath();
        ctx.roundRect(pad, pad + 30, drawW, drawH - 130, 32);
        ctx.clip();
      }

      ctx.drawImage(processedCanvas, sx, sy, sw, sh, pad, pad, drawW, drawH);

      if (presetStyle === 'duotone_pop') {
        ctx.globalCompositeOperation = 'color';
        ctx.fillStyle = `${accentColor}66`;
        ctx.fillRect(pad, pad, drawW, drawH);
      }
      ctx.restore();
    } else if (generatedSvgImg) {
      ctx.save();
      ctx.drawImage(generatedSvgImg, 0, 0, w, h);
      ctx.restore();
    } else {
      const orbGrad = ctx.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, 260);
      orbGrad.addColorStop(0, '#ffffffcc');
      orbGrad.addColorStop(0.35, accentColor);
      orbGrad.addColorStop(0.75, `${bgSecondary}88`);
      orbGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.45, 260, 0, Math.PI * 2);
      ctx.fill();
    }

    if (vignette > 0) {
      const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.28, w / 2, h / 2, w * 0.8);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, `rgba(0,0,0,${vignette})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }

    const isLightBg = bgTheme === 'marble_cream' || bgTheme === 'soft_pastel';
    const textColor = isLightBg && !loadedImg && !generatedSvgImg ? '#18181b' : '#ffffff';

    if (presetStyle === 'neon_cyber' || presetStyle === 'editorial_mag') {
      ctx.strokeStyle =
        presetStyle === 'neon_cyber' ? accentColor : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = presetStyle === 'neon_cyber' ? 4 : 2;
      ctx.strokeRect(32, 32, w - 64, h - 64);
    }

    const scrim = ctx.createLinearGradient(0, h * 0.65, 0, h);
    scrim.addColorStop(0, 'transparent');
    scrim.addColorStop(
      1,
      isLightBg && !loadedImg && !generatedSvgImg
        ? 'rgba(255,255,255,0.65)'
        : 'rgba(5,5,10,0.82)'
    );
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.font = '700 58px Outfit, system-ui, sans-serif';
    ctx.fillText(headline.slice(0, 26), w / 2, h - 118);

    ctx.fillStyle = accentColor;
    ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(subtext.slice(0, 48), w / 2, h - 72);
  }, [
    loadedImg,
    generatedSvgImg,
    presetStyle,
    bgTheme,
    bgPrimary,
    bgSecondary,
    accentColor,
    headline,
    subtext,
    bgCutout,
    contrast,
    saturation,
    vignette,
  ]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const att = await readImageFile(file);
      setGeneratedSvgImg(null);
      setPhoto(att);
      setMahiComment('Nice shot! Ab batao iska background ya design kaisa karna hai?');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photo.');
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `mahi-design-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="w-full max-w-5xl mx-auto h-full overflow-y-auto px-4 sm:px-6 pb-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-5 flex flex-col items-center gap-3">
          <div className="w-full max-w-[320px] sm:max-w-[360px] aspect-[4/5] rounded-2xl overflow-hidden border border-white/15 bg-[#090814] shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
            <canvas ref={canvasRef} className="w-full h-full block object-contain" />
          </div>

          <div className="w-full max-w-[360px] flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleUpload(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-medium text-white inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ImagePlus className="w-4 h-4 text-cyan-300" />
              <span>{photo ? 'Change Photo' : 'Upload Photo'}</span>
            </button>

            {photo && (
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="Remove photo"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/[0.05] hover:bg-rose-500/20 border border-white/15 text-slate-300 hover:text-rose-200 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:brightness-110 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 flex flex-col gap-4">
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
              if (prompt.trim() || photo) {
                void runAiStyle(prompt.trim());
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Create any artwork or describe background/design change..."
              className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl bg-[#0e0c1d] border border-white/15 focus:border-fuchsia-400/60 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isApplying || (!prompt.trim() && !photo)}
              className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 hover:brightness-110 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {isApplying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>{photo ? 'Redesign' : 'Create'}</span>
            </button>
          </form>

          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Design Style</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {DESIGN_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setPresetStyle(st.id)}
                  className={`min-h-[40px] px-2 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                    presetStyle === st.id
                      ? 'bg-fuchsia-500/25 border-fuchsia-400 text-white'
                      : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">Background Scene</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BACKGROUND_THEMES.map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => {
                    setBgTheme(bg.id);
                    setBgPrimary(bg.c1);
                    setBgSecondary(bg.c2);
                    setAccentColor(bg.accent);
                  }}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-2 transition-colors cursor-pointer ${
                    bgTheme === bg.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-white'
                      : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]'
                  }`}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                    style={{
                      background: `linear-gradient(135deg, ${bg.c1}, ${bg.accent})`,
                    }}
                  />
                  <span className="truncate">{bg.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Background Cutout</span>
                <span className="font-mono text-cyan-300">{bgCutout}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={90}
                value={bgCutout}
                onChange={(e) => setBgCutout(Number(e.target.value))}
                className="w-full accent-fuchsia-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                <span>Vignette Depth</span>
                <span className="font-mono text-cyan-300">
                  {Math.round(vignette * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={80}
                value={Math.round(vignette * 100)}
                onChange={(e) => setVignette(Number(e.target.value) / 100)}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Headline</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-lg bg-[#0a0915] border border-white/10 text-xs text-white focus:outline-none focus:border-fuchsia-400/50"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Caption</label>
              <input
                type="text"
                value={subtext}
                onChange={(e) => setSubtext(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-lg bg-[#0a0915] border border-white/10 text-xs text-white focus:outline-none focus:border-fuchsia-400/50"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
            <span>
              Upload a photo to change its background & design, or type a prompt to generate custom vector artwork.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
