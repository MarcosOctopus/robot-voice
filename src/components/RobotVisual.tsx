"use client";

import { useEffect, useRef } from "react";

export type VisualState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking";

const PALETTE: Record<VisualState, { r: number; g: number; b: number }> = {
  idle: { r: 30, g: 60, b: 120 },
  connecting: { r: 0, g: 120, b: 255 },
  listening: { r: 0, g: 255, b: 180 },
  thinking: { r: 0, g: 240, b: 255 },
  speaking: { r: 255, g: 200, b: 100 },
};

/**
 * RobotVisual
 * Orb animado em Canvas que reflete o estado do robô.
 * Frequências de áudio (quando ouvindo/falando) modulam o brilho.
 */
export function RobotVisual({
  state,
  frequencies,
}: {
  state: VisualState;
  frequencies?: Uint8Array | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const freqRef = useRef<Uint8Array | null>(null);
  stateRef.current = state;
  freqRef.current = frequencies ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.min(canvas.clientWidth, canvas.clientHeight);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const t0 = performance.now();

    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const st = stateRef.current;
      const c = PALETTE[st];
      const freq = freqRef.current;

      // Nível de áudio (0..1) a partir das frequências
      let level = 0;
      if (freq && freq.length > 0) {
        let sum = 0;
        for (let i = 0; i < freq.length; i++) sum += freq[i];
        level = sum / freq.length / 255;
      }

      // Pulso baseado no estado + áudio
      const pulse =
        st === "speaking"
          ? 0.55 + level * 0.45
          : st === "listening"
            ? 0.45 + level * 0.35
            : st === "thinking"
              ? 0.4 + 0.12 * Math.sin(t * 4)
              : st === "connecting"
                ? 0.35 + 0.15 * Math.sin(t * 6)
                : 0.3 + 0.05 * Math.sin(t * 2);

      ctx.clearRect(0, 0, size, size);

      // Anéis orbitais (sempre presentes)
      for (let i = 0; i < 3; i++) {
        const ang = t * (0.4 + i * 0.25) * (st === "thinking" ? 2 : 1);
        const r = size * (0.32 + i * 0.12);
        const x = size / 2 + Math.cos(ang) * r;
        const y = size / 2 + Math.sin(ang) * r;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.035, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${0.35 - i * 0.08})`;
        ctx.fill();
      }

      // Corpo principal
      const radius = size * 0.28 * pulse;
      const grad = ctx.createRadialGradient(
        size / 2,
        size / 2,
        radius * 0.1,
        size / 2,
        size / 2,
        radius
      );
      grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},1)`);
      grad.addColorStop(0.6, `rgba(${c.r},${c.g},${c.b},0.55)`);
      grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0.05)`);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Núcleo branco
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.5 + level * 0.4})`;
      ctx.fill();

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      aria-label={`Robô ${state}`}
    />
  );
}
