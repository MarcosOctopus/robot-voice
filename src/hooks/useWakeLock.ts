"use client";

import { useEffect, useRef } from "react";

/**
 * useWakeLock
 * Mantém a tela acesa enquanto a conversa estiver ativa (modo quiosque do robô).
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function acquire() {
      try {
        const nav: any = navigator;
        if (!nav.wakeLock?.request) return;
        const sentinel = await nav.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // wake lock não suportado ou negado — segue sem
      }
    }

    acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinelRef.current?.release?.().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);
}
