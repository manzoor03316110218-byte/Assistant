import { useEffect, useRef } from 'react';
import { AudioTelemetry } from '../services/audioStreamer';
import { SessionState, VisualMood } from '../types/live';

interface AudioWaveformProps {
  state: SessionState;
  mood: VisualMood;
  getTelemetry: () => AudioTelemetry;
}

export function AudioWaveform({ state, mood, getTelemetry }: AudioWaveformProps) {
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

    let rafId = 0;
    let phase = 0;
    let smoothedAmp = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(200, Math.floor(parent.clientWidth * dpr));
      canvas.height = Math.max(64, Math.floor(parent.clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const midY = height / 2;

      const currentState = stateRef.current;
      const currentMood = moodRef.current;
      const telemetry = getTelemetry();

      const liveLevel =
        currentState === 'speaking'
          ? Math.max(0.18, telemetry.outputLevel)
          : currentState === 'listening'
            ? Math.max(0.06, telemetry.inputLevel)
            : currentState === 'connecting'
              ? 0.14
              : 0.025;

      smoothedAmp += (liveLevel - smoothedAmp) * 0.22;
      phase += (prefersReducedMotion ? 0.01 : 0.065) * (0.6 + smoothedAmp * 1.8);

      ctx.clearRect(0, 0, width, height);

      const leftColor =
        currentMood === 'electric_cyan'
          ? '#38bdf8'
          : currentMood === 'sunset_rose'
            ? '#fb7185'
            : '#22e5ff';
      const rightColor =
        currentMood === 'midnight_violet'
          ? '#a855f7'
          : currentMood === 'electric_cyan'
            ? '#f472b6'
            : '#ff2fa8';

      const lineGrad = ctx.createLinearGradient(0, 0, width, 0);
      lineGrad.addColorStop(0, 'rgba(34, 229, 255, 0)');
      lineGrad.addColorStop(0.18, leftColor);
      lineGrad.addColorStop(0.5, '#c084fc');
      lineGrad.addColorStop(0.82, rightColor);
      lineGrad.addColorStop(1, 'rgba(255, 47, 168, 0)');

      const fillGrad = ctx.createLinearGradient(0, 0, width, 0);
      fillGrad.addColorStop(0, 'rgba(34, 229, 255, 0)');
      fillGrad.addColorStop(0.2, 'rgba(34, 229, 255, 0.16)');
      fillGrad.addColorStop(0.5, 'rgba(192, 132, 252, 0.24)');
      fillGrad.addColorStop(0.8, 'rgba(255, 47, 168, 0.16)');
      fillGrad.addColorStop(1, 'rgba(255, 47, 168, 0)');

      const points = 96;
      const maxSwing = height * 0.42 * (0.12 + smoothedAmp * 1.15);

      const computeYOffset = (normX: number, harmonicSign: number): number => {
        // Taper smoothly to 0 at edges
        const envelope = Math.pow(Math.sin(normX * Math.PI), 1.6);
        const binIndex = Math.min(
          telemetry.spectrum.length - 1,
          Math.floor(Math.abs(normX - 0.5) * 2 * (telemetry.spectrum.length * 0.55))
        );
        const binEnergy =
          currentState === 'listening' || currentState === 'speaking'
            ? (telemetry.spectrum[binIndex] ?? 0) / 255
            : 0;

        const w1 = Math.sin(normX * Math.PI * 5 + phase * harmonicSign);
        const w2 = 0.55 * Math.sin(normX * Math.PI * 9 - phase * 1.4 * harmonicSign);
        const w3 = 0.3 * Math.cos(normX * Math.PI * 13 + phase * 0.8);
        const combined = (w1 + w2 + w3) / 1.85;
        return envelope * (maxSwing * (0.45 + binEnergy * 0.85)) * combined;
      };

      // Draw soft mirrored filled ribbon
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const nx = i / points;
        const x = nx * width;
        const y = midY - Math.abs(computeYOffset(nx, 1));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = points; i >= 0; i--) {
        const nx = i / points;
        const x = nx * width;
        const y = midY + Math.abs(computeYOffset(nx, -1));
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Primary glowing dual curves
      for (const sign of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const nx = i / points;
          const x = nx * width;
          const y = midY + computeYOffset(nx, sign);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = sign === 1 ? 2 : 1.4;
        ctx.globalAlpha = sign === 1 ? 0.95 : 0.55;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Center baseline filament
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.strokeStyle = lineGrad;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [getTelemetry]);

  return (
    <div className="w-full max-w-md h-16 sm:h-20 px-4 select-none pointer-events-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-hidden="true"
      />
    </div>
  );
}
