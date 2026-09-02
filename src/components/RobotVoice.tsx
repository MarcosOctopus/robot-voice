"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConversationProvider,
  useConversation,
} from "@elevenlabs/react";
import { RobotVisual, VisualState } from "./RobotVisual";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useLatency } from "@/hooks/useLatency";

interface SessionResponse {
  token: string;
  agent_id: string;
  conversation_id: string | null;
  server_time: number;
}

type Phase = "idle" | "connecting" | "connected";

/**
 * RobotVoice
 * Fluxo: botão -> POST /api/voice/session (backend busca token na ElevenLabs)
 * -> startSession({ conversationToken, connectionType: "webrtc" })
 * -> áudio via WebRTC direto ao agente (backend fora do caminho do áudio).
 */
function RobotVoiceInner({ debug }: { debug: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<
    { role: string; message: string }[]
  >([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const sessionStartRef = useRef<number>(0);
  const userSpeechEndRef = useRef<number | null>(null);

  const { stats, reset: resetLatency, recordSessionSetup, recordResponseLatency } =
    useLatency(debug);

  const conversation = useConversation({
    onConnect: () => {
      recordSessionSetup(performance.now() - sessionStartRef.current);
      setPhase("connected");
      setError(null);
    },
    onDisconnect: () => {
      setPhase("idle");
    },
    onError: (message: string, context?: { errorType?: string; code?: number; debugMessage?: string; details?: unknown }) => {
      console.error("[robot-voice] erro", message, JSON.stringify(context));
      const detail = context?.debugMessage || context?.errorType || "";
      setError(detail ? `${message} (${detail})` : message);
    },
    onMessage: (msg: { role: string; message: string }) => {
      if (msg?.role && msg?.message) {
        setTranscript((prev) => [...prev.slice(-19), msg]);
      }
    },
  });

  const isSpeaking = conversation.isSpeaking;
  const isListening = conversation.isListening;
  const status = conversation.status;
  // SDK novo: isListening/isSpeaking podem vir true antes de qualquer sessão.
  // Só considera estados de áudio quando a fase está conectada.
  const audioActive = phase === "connected";

  // Wake lock ativo enquanto conectado
  useWakeLock(phase === "connected");

  // Polling de volumes
  useEffect(() => {
    if (phase !== "connected") return;
    const id = setInterval(() => {
      try {
        setInputLevel(conversation.getInputVolume?.() ?? 0);
        setOutputLevel(conversation.getOutputVolume?.() ?? 0);
      } catch {
        /* API ausente — ignora */
      }
    }, 80);
    return () => clearInterval(id);
  }, [phase, conversation]);

  // Latência: fim da fala do usuário -> início da fala do robô
  useEffect(() => {
    if (audioActive && isListening) {
      userSpeechEndRef.current = null;
    }
    if (phase === "connected" && !(audioActive && isSpeaking) && !(audioActive && isListening)) {
      // agente processando
      if (userSpeechEndRef.current === null) {
        userSpeechEndRef.current = performance.now();
      }
    }
    if (audioActive && isSpeaking && userSpeechEndRef.current !== null) {
      const latency = performance.now() - userSpeechEndRef.current;
      recordResponseLatency(latency);
      userSpeechEndRef.current = null;
    }
  }, [isListening, isSpeaking, phase, recordResponseLatency]);

  // Estado visual
  const visualState: VisualState = (() => {
    if (phase === "connecting") return "connecting";
    if (audioActive && isSpeaking) return "speaking";
    if (audioActive && isListening) return "listening";
    if (phase === "connected") return "thinking";
    return "idle";
  })();

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    resetLatency();
    sessionStartRef.current = performance.now();
    setPhase("connecting");
    try {
      // 1) Backend devolve o conversation token (nunca expõe a API key)
      const res = await fetch("/api/voice/session", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Falha ao criar sessão");
      }
      const data: SessionResponse = await res.json();

      // 2) WebRTC direto ao agente com o token efêmero
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Falha ao iniciar");
      setPhase("idle");
    }
  }, [conversation, resetLatency]);

  const stop = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch {
      /* ignora */
    }
    setPhase("idle");
  }, [conversation]);

  const statusLabel = (() => {
    if (phase === "connecting") return "Conectando…";
    if (audioActive && isSpeaking) return "Falando";
    if (audioActive && isListening) return "Ouvindo";
    if (phase === "connected") return "Pensando…";
    return "Toque para falar";
  })();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between px-6 pb-safe pt-safe">
      {/* Header */}
      <header className="w-full pt-6 text-center">
        <h1 className="text-lg font-semibold tracking-wide text-white">
          Robot Voice
        </h1>
        <p className="mt-1 text-xs text-gray-400">Interface de voz • MVP</p>
      </header>

      {/* Visual do robô */}
      <main className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative h-64 w-64 max-w-[70vw] max-h-[50vh]">
          <RobotVisual state={visualState} frequencies={null} />
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                phase === "connected" ? "bg-[var(--listening)]" : "bg-gray-600"
              }`}
            />
            <span className="text-sm font-medium text-gray-200">
              {statusLabel}
            </span>
          </div>
          {error && (
            <p className="mt-2 max-w-xs text-xs text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>

        {/* Medidores de volume (debug) */}
        {debug && (
          <div className="w-full max-w-xs space-y-2 rounded-2xl border border-white/10 bg-panel p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Latência
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
              <div>Setup: <b>{stats.sessionSetupMs != null ? `${stats.sessionSetupMs.toFixed(0)}ms` : "—"}</b></div>
              <div>Última: <b>{stats.lastResponseMs != null ? `${stats.lastResponseMs.toFixed(0)}ms` : "—"}</b></div>
              <div>P50: <b>{stats.p50 != null ? `${stats.p50.toFixed(0)}ms` : "—"}</b></div>
              <div>P95: <b>{stats.p95 != null ? `${stats.p95.toFixed(0)}ms` : "—"}</b></div>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Áudio
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[var(--listening)] transition-all"
                style={{ width: `${Math.min(100, inputLevel * 100)}%` }}
              />
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-[var(--speaking)] transition-all"
                style={{ width: `${Math.min(100, outputLevel * 100)}%` }}
              />
            </div>
          </div>
        )}
      </main>

      {/* Transcript compacto */}
      {transcript.length > 0 && (
        <div className="w-full max-w-sm space-y-1.5 pb-3">
          {transcript.slice(-3).map((m, i) => (
            <p
              key={i}
              className={`text-xs ${
                m.role === "user" ? "text-gray-300" : "text-[var(--neon)]"
              }`}
            >
              <b>{m.role === "user" ? "Você" : "Robô"}:</b> {m.message}
            </p>
          ))}
        </div>
      )}

      {/* Botão principal */}
      <footer className="w-full pb-8">
        <button
          onClick={phase === "idle" ? start : stop}
          disabled={phase === "connecting"}
          className={`w-full max-w-sm rounded-full py-5 text-base font-bold tracking-wide transition-all active:scale-[0.97] disabled:opacity-50 ${
            phase === "idle"
              ? "bg-[var(--accent)] text-white shadow-[0_0_30px_rgba(0,102,255,0.5)]"
              : "bg-[var(--danger)] text-white shadow-[0_0_30px_rgba(255,77,109,0.5)]"
          }`}
        >
          {phase === "idle"
            ? "🎙️ Iniciar conversa"
            : phase === "connecting"
              ? "Conectando…"
              : "⏹️ Encerrar"}
        </button>
      </footer>
    </div>
  );
}

export function RobotVoice({ debug }: { debug: boolean }) {
  return (
    <ConversationProvider>
      <RobotVoiceInner debug={debug} />
    </ConversationProvider>
  );
}
