import { useEffect, useRef } from 'react';
import { AudioTelemetry } from '../services/audioStreamer';
import { SessionState, VisualMood } from '../types/live';

interface PlasmaOrbProps {
  state: SessionState;
  mood: VisualMood;
  getTelemetry: () => AudioTelemetry;
}

interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  halo: string;
}

const MOOD_PALETTES: Record<VisualMood, Palette> = {
  sassy_magenta: {
    primary: '#ff2fa8',
    secondary: '#9333ea',
    accent: '#22e5ff',
    halo: 'rgba(236, 72, 153, 0.34)',
  },
  electric_cyan: {
    primary: '#22e5ff',
    secondary: '#6366f1',
    accent: '#f472b6',
    halo: 'rgba(34, 229, 255, 0.32)',
  },
  sunset_rose: {
    primary: '#fb7185',
    secondary: '#d946ef',
    accent: '#fbbf24',
    halo: 'rgba(251, 113, 133, 0.34)',
  },
  midnight_violet: {
    primary: '#a855f7',
    secondary: '#3b82f6',
    accent: '#38bdf8',
    halo: 'rgba(168, 85, 247, 0.34)',
  },
};

interface Particle {
  angle: number;
  radiusRatio: number;
  speed: number;
  size: number;
  alpha: number;
  huePick: number;
}

export function PlasmaOrb({ state, mood, getTelemetry }: PlasmaOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef(state);
  const moodRef = useRef(mood);

  stateRef.current = state;
  moodRef.current = mood;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const particles: Particle[] = Array.from({ length: 48 }, (_, i) => ({
      angle: (i / 48) * Math.PI * 2 + Math.random() * 0.4,
      radiusRatio: 1.04 + Math.random() * 0.36,
      speed: (0.002 + Math.random() * 0.004) * (i % 2 === 0 ? 1 : -1),
      size: 0.9 + Math.random() * 1.8,
      alpha: 0.25 + Math.random() * 0.65,
      huePick: i % 3,
    }));

    let smoothedEnergy = 0;
    let phase = 0;
    let rafId = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.min(parent.clientWidth, parent.clientHeight);
      canvas.width = Math.max(240, Math.floor(size * dpr));
      canvas.height = Math.max(240, Math.floor(size * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const cx = width / 2;
      const cy = height / 2;

      const currentState = stateRef.current;
      const palette = MOOD_PALETTES[moodRef.current];
      const telemetry = getTelemetry();

      const targetEnergy =
        currentState === 'speaking'
          ? Math.max(0.2, telemetry.outputLevel)
          : currentState === 'listening'
            ? Math.max(0.08, telemetry.inputLevel * 0.95)
            : currentState === 'connecting'
              ? 0.24
              : 0.04;

      smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.16;

      const motionFactor = prefersReducedMotion ? 0.15 : 1;
      const speedMultiplier =
        currentState === 'speaking'
          ? 1.9 + smoothedEnergy * 2.1
          : currentState === 'listening'
            ? 1.15 + smoothedEnergy * 1.4
            : currentState === 'connecting'
              ? 1.55
              : 0.55;

      phase += 0.015 * speedMultiplier * motionFactor;

      ctx.clearRect(0, 0, width, height);

      const baseRadius = Math.min(width, height) * 0.31;
      const reactiveRadius = baseRadius * (1 + smoothedEnergy * 0.1);

      // Ambient outer nebula halo
      const haloGrad = ctx.createRadialGradient(
        cx,
        cy,
        reactiveRadius * 0.35,
        cx,
        cy,
        reactiveRadius * 1.68
      );
      haloGrad.addColorStop(0, palette.halo);
      haloGrad.addColorStop(0.55, 'rgba(99, 102, 241, 0.12)');
      haloGrad.addColorStop(1, 'rgba(5, 5, 10, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, reactiveRadius * 1.68, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting stardust particles
      for (const p of particles) {
        p.angle += p.speed * speedMultiplier * motionFactor;
        const wobble = Math.sin(phase * 1.7 + p.angle * 2) * (4 + smoothedEnergy * 10);
        const dist = reactiveRadius * p.radiusRatio + wobble;
        const px = cx + Math.cos(p.angle) * dist;
        const py = cy + Math.sin(p.angle) * dist;

        ctx.fillStyle =
          p.huePick === 0
            ? palette.accent
            : p.huePick === 1
              ? palette.primary
              : '#e2e8f0';
        ctx.globalAlpha =
          p.alpha * (currentState === 'disconnected' ? 0.45 : 0.75 + smoothedEnergy * 0.25);
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Clipped 3D Plasma Sphere Body
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, reactiveRadius, 0, Math.PI * 2);
      ctx.clip();

      // Deep dark sphere core
      const coreGrad = ctx.createRadialGradient(
        cx - reactiveRadius * 0.28,
        cy - reactiveRadius * 0.28,
        reactiveRadius * 0.08,
        cx,
        cy,
        reactiveRadius
      );
      coreGrad.addColorStop(0, '#2b124c');
      coreGrad.addColorStop(0.55, '#13092b');
      coreGrad.addColorStop(1, '#060312');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(cx - reactiveRadius, cy - reactiveRadius, reactiveRadius * 2, reactiveRadius * 2);

      // Additive glowing plasma ribbons
      ctx.globalCompositeOperation = 'lighter';
      const ribbonCount = 14;
      const steps = 64;

      for (let r = 0; r < ribbonCount; r++) {
        const ratio = r / ribbonCount;
        const yOffset = (ratio - 0.5) * reactiveRadius * 1.65;
        const amp = (8 + smoothedEnergy * 24) * (0.65 + 0.35 * Math.sin(ratio * Math.PI));
        const freq = 2.4 + (r % 4) * 0.55;
        const ribbonPhase = phase * (r % 2 === 0 ? 1 : -0.85) + r * 0.65;

        const ribbonGrad = ctx.createLinearGradient(
          cx - reactiveRadius,
          cy + yOffset,
          cx + reactiveRadius,
          cy - yOffset * 0.4
        );
        if (r % 3 === 0) {
          ribbonGrad.addColorStop(0, 'rgba(34, 229, 255, 0.05)');
          ribbonGrad.addColorStop(0.45, palette.accent);
          ribbonGrad.addColorStop(0.8, palette.primary);
          ribbonGrad.addColorStop(1, 'rgba(255, 47, 168, 0.05)');
        } else if (r % 3 === 1) {
          ribbonGrad.addColorStop(0, 'rgba(255, 47, 168, 0.05)');
          ribbonGrad.addColorStop(0.35, palette.primary);
          ribbonGrad.addColorStop(0.75, palette.secondary);
          ribbonGrad.addColorStop(1, 'rgba(34, 229, 255, 0.08)');
        } else {
          ribbonGrad.addColorStop(0, 'rgba(147, 51, 234, 0.05)');
          ribbonGrad.addColorStop(0.5, palette.secondary);
          ribbonGrad.addColorStop(0.85, palette.accent);
          ribbonGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
        }

        ctx.strokeStyle = ribbonGrad;
        ctx.lineWidth = 2.2 + smoothedEnergy * 2.6;
        ctx.globalAlpha = 0.42 + smoothedEnergy * 0.45;
        ctx.beginPath();

        for (let s = 0; s <= steps; s++) {
          const t = (s / steps) * 2 - 1;
          const x = cx + t * reactiveRadius * 1.15;
          const wave1 = Math.sin(t * Math.PI * freq + ribbonPhase) * amp;
          const wave2 =
            Math.cos(t * Math.PI * (freq * 0.6) - ribbonPhase * 1.3) * (amp * 0.45);
          const curveArch = Math.sin(t * Math.PI * 0.5) * yOffset * 0.25;
          const y = cy + yOffset + wave1 + wave2 + curveArch;

          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Bright thin highlight core on primary ribbons
        if (r % 2 === 0) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.85;
          ctx.globalAlpha = 0.16 + smoothedEnergy * 0.28;
          ctx.stroke();
        }
      }

      // 3D Fresnel rim + internal shadow vignette
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const rimGrad = ctx.createRadialGradient(
        cx - reactiveRadius * 0.2,
        cy - reactiveRadius * 0.25,
        reactiveRadius * 0.45,
        cx,
        cy,
        reactiveRadius
      );
      rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      rimGrad.addColorStop(0.78, 'rgba(15, 10, 35, 0.22)');
      rimGrad.addColorStop(0.95, 'rgba(34, 229, 255, 0.35)');
      rimGrad.addColorStop(1, 'rgba(255, 47, 168, 0.65)');
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, reactiveRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Subtle luminous outer contour ring
      ctx.strokeStyle =
        currentState === 'speaking'
          ? 'rgba(34, 229, 255, 0.5)'
          : currentState === 'listening'
            ? 'rgba(255, 47, 168, 0.45)'
            : 'rgba(168, 85, 247, 0.22)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(cx, cy, reactiveRadius + 1, 0, Math.PI * 2);
      ctx.stroke();

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [getTelemetry]);

  return (
    <div className="relative flex items-center justify-center w-full h-full max-w-[340px] max-h-[340px] sm:max-w-[380px] sm:max-h-[380px] aspect-square select-none pointer-events-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-hidden="true"
      />
    </div>
  );
}
