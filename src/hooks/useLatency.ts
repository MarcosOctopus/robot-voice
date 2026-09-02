"use client";

import { useCallback, useRef, useState } from "react";

export interface LatencyStats {
  sessionSetupMs: number | null;
  firstResponseMs: number | null;
  samples: number[];
  p50: number | null;
  p95: number | null;
  lastResponseMs: number | null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * useLatency
 * Instrumentação de latência para o modo ?debug=true.
 * Mede: tempo de setup da sessão (token -> connected) e tempo
 * entre o fim da fala do usuário e o início da resposta do robô.
 */
export function useLatency(debug: boolean) {
  const samplesRef = useRef<number[]>([]);
  const [stats, setStats] = useState<LatencyStats>({
    sessionSetupMs: null,
    firstResponseMs: null,
    samples: [],
    p50: null,
    p95: null,
    lastResponseMs: null,
  });

  const reset = useCallback(() => {
    samplesRef.current = [];
    setStats({
      sessionSetupMs: null,
      firstResponseMs: null,
      samples: [],
      p50: null,
      p95: null,
      lastResponseMs: null,
    });
  }, []);

  const recordSessionSetup = useCallback((ms: number) => {
    setStats((s) => ({ ...s, sessionSetupMs: ms }));
  }, []);

  const recordResponseLatency = useCallback((ms: number) => {
    samplesRef.current.push(ms);
    const sorted = [...samplesRef.current].sort((a, b) => a - b);
    setStats((s) => ({
      ...s,
      samples: [...samplesRef.current],
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      lastResponseMs: ms,
      firstResponseMs: s.firstResponseMs ?? ms,
    }));
  }, []);

  return { stats, reset, recordSessionSetup, recordResponseLatency };
}
