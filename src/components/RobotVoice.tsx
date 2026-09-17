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
type Mode = "ptt" | "hands-free";

/**
 * RobotVoice
 * Fluxo: botão -> POST /api/voice/session (backend busca token na ElevenLabs)
 * -> startSession({ conversationToken, connectionType: "webrtc" })
 * -> áudio via WebRTC direto ao agente (backend fora do caminho do áudio).
 *
 * PUSH-TO-TALK (padrão): o microfone fica MUDO em repouso e só abre enquanto o
 * botão está pressionado. Segurar = o robô ouve. Soltar = o robô PARA de ouvir
 * na hora: o track de áudio local é desabilitado (`enabled = false`), então o
 * agente simplesmente não recebe mais áudio nenhum.
 *
 * ⚠️ POR QUE NÃO USAMOS O MODO CONTROLADO DO PROVIDER (`isMuted`/`onMutedChange`):
 * o provider controlado só chama `conversation.setMicMuted(x)` quando `x` MUDA.
 * Como o repouso já nasce mudo, um toque rápido (soltar ANTES de a sessão
 * conectar) não alterava o valor -> o mute nunca chegava ao SDK -> o microfone
 * ficava ABERTO pra sempre. Verificado instrumentando o track de áudio real.
 *
 * Solução: provider em modo NÃO-controlado + `conversation.setMuted()` explícito.
 * Nesse modo o SDK sempre repassa a chamada (não depende de mudança de estado),
 * e ainda assim mantém `isMuted` sincronizado para a UI.
 */
function RobotVoiceInner({ debug }: { debug: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("ptt");
  const [holding, setHolding] = useState(false);
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
      setHolding(false);
    },
    onError: (message: string, context?: { errorType?: string; code?: number; debugMessage?: string; details?: unknown }) => {
      console.error("[robot-voice] erro", message, JSON.stringify(context));
      const detail = context?.debugMessage || context?.errorType || "";
      setError(detail ? `${message} (${detail})` : message);
      // Mic negado/indisponível: destrava a UI para o usuário poder tentar de novo.
      setPhase((p) => (p === "connected" ? p : "idle"));
      setHolding(false);
    },
    onMessage: (msg: { role: string; message: string }) => {
      if (msg?.role && msg?.message) {
        setTranscript((prev) => [...prev.slice(-19), msg]);
      }
    },
  });

  const { isMuted: micMuted, setMuted } = conversation;

  const isSpeaking = conversation.isSpeaking;
  const isListening = conversation.isListening;
  // SDK novo: isListening/isSpeaking podem vir true antes de qualquer sessão.
  // Só considera estados de áudio quando a fase está conectada.
  const audioActive = phase === "connected";

  // Wake lock ativo enquanto conectado
  useWakeLock(phase === "connected");

  /**
   * Aplica o estado do microfone no SDK.
   * `setMuted` lança se ainda não houver sessão ativa (ex.: toque antes de
   * conectar) — engolimos porque o efeito abaixo reaplica ao conectar.
   */
  const applyMute = useCallback(
    (muted: boolean) => {
      try {
        setMuted(muted);
      } catch {
        /* sem sessão ativa ainda — o efeito reaplica quando conectar */
      }
    },
    [setMuted],
  );

  // Fonte única da verdade do microfone:
  //   PTT        -> aberto APENAS enquanto o botão está pressionado
  //   mãos livres-> sempre aberto
  const desiredMute = mode === "ptt" ? !holding : false;

  // Reaplica sempre que o estado desejado muda E quando a sessão conecta.
  // (No modo não-controlado, setMuted sempre chega ao SDK — inclusive quando o
  // valor é o mesmo do repouso, que era o furo do provider controlado.)
  useEffect(() => {
    if (phase !== "connected") return;
    applyMute(desiredMute);
  }, [phase, desiredMute, applyMute]);

  // Soltar: fecha o mic mesmo se o dedo sair do botão, a aba perder o foco
  // ou o app for para segundo plano (evita mic preso aberto).
  useEffect(() => {
    if (!holding) return;
    const release = () => setHolding(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [holding]);

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
    if (audioActive && mode === "ptt" && holding) return "listening";
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
      setHolding(false);
    }
  }, [conversation, resetLatency]);

  const stop = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch {
      /* ignora */
    }
    setPhase("idle");
    setHolding(false);
  }, [conversation]);

  /**
   * Pressionar o botão principal. Num toque único já faz as duas coisas:
   * abre a sessão (se não houver) e libera o microfone.
   * Durante "connecting" o toque é ignorado (sem `disabled`, que dispararia
   * pointercancel no meio do gesto e fecharia o mic).
   */
  const handlePressStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (phase === "connecting") return;
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* alguns browsers recusam — o listener global cobre o release */
      }
      if (phase === "idle") {
        void start();
      }
      setHolding(true);
    },
    [phase, start],
  );

  const statusLabel = (() => {
    if (phase === "connecting") return "Conectando…";
    if (audioActive && isSpeaking) return "Falando";
    if (audioActive && mode === "ptt" && holding) return "Gravando… solte para enviar";
    if (audioActive && mode === "ptt") return "Segure o botão para falar";
    if (audioActive && isListening) return "Ouvindo";
    if (phase === "connected") return "Pensando…";
    return "Segure para falar";
  })();

  const buttonLabel = (() => {
    if (phase === "connecting") return "Conectando…";
    if (phase === "idle") {
      return mode === "ptt" ? "Segurar para falar" : "Iniciar conversa";
    }
    if (mode === "ptt") {
      return holding ? "🔴 Solte para enviar" : "Segurar para falar";
    }
    return "Mãos livres ativo";
  })();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-between px-6 pb-safe pt-safe">
      {/* Header */}
      <header className="w-full pt-6 text-center">
        <h1 className="text-lg font-semibold tracking-wide text-white">
          Robot Voice
        </h1>
        <p className="mt-1 text-xs text-gray-400">
          {mode === "ptt"
            ? "Push-to-talk • segure para falar"
            : "Mãos livres • microfone aberto"}
        </p>

        {/* Seletor de modo */}
        <div className="mt-3 inline-flex rounded-full border border-white/10 bg-panel p-0.5">
          <button
            type="button"
            onClick={() => setMode("ptt")}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              mode === "ptt" ? "bg-[var(--accent)] text-white" : "text-gray-400"
            }`}
          >
            Segurar para falar
          </button>
          <button
            type="button"
            onClick={() => setMode("hands-free")}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              mode === "hands-free" ? "bg-[var(--accent)] text-white" : "text-gray-400"
            }`}
          >
            Mãos livres
          </button>
        </div>
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
                phase === "connected"
                  ? holding || mode === "hands-free"
                    ? "bg-[var(--listening)]"
                    : "bg-gray-500"
                  : "bg-gray-600"
              }`}
            />
            <span className="text-sm font-medium text-gray-200">
              {statusLabel}
            </span>
          </div>
          {phase === "connected" && mode === "ptt" && (
            <p className="mt-1 text-[11px] text-gray-500">
              Microfone {micMuted ? "fechado" : "aberto"}
            </p>
          )}
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
      <footer className="w-full space-y-3 pb-8">
        <button
          type="button"
          onPointerDown={handlePressStart}
          onPointerUp={() => setHolding(false)}
          onPointerCancel={() => setHolding(false)}
          onLostPointerCapture={() => setHolding(false)}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "none" }}
          aria-disabled={phase === "connecting"}
          className={`w-full max-w-sm select-none rounded-full py-6 text-base font-bold tracking-wide transition-all ${
            phase === "connecting"
              ? "bg-panel text-gray-400 border border-white/10"
              : phase === "idle"
                ? "bg-[var(--accent)] text-white shadow-[0_0_30px_rgba(0,102,255,0.5)]"
                : holding
                  ? "scale-[0.98] bg-[var(--listening)] text-black shadow-[0_0_45px_rgba(0,255,180,0.65)]"
                  : "bg-panel text-white border border-white/15 shadow-[0_0_20px_rgba(255,255,255,0.08)]"
          }`}
        >
          {buttonLabel}
        </button>

        {phase !== "idle" && (
          <button
            type="button"
            onClick={stop}
            className="mx-auto block w-full max-w-sm rounded-full bg-[var(--danger)] py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,77,109,0.4)] active:scale-[0.97]"
          >
            Encerrar
          </button>
        )}

        {mode === "ptt" && phase === "idle" && (
          <p className="text-center text-[11px] text-gray-500">
            Toque e segure o botão para falar
          </p>
        )}
      </footer>
    </div>
  );
}

export function RobotVoice({ debug }: { debug: boolean }) {
  // Provider em modo NÃO-controlado de propósito: o modo controlado
  // (`isMuted`/`onMutedChange`) só aplica o mute quando o valor MUDA, o que
  // deixava o microfone aberto após um toque rápido. O componente agora chama
  // `conversation.setMuted()` direto, que sempre chega ao SDK.
  return (
    <ConversationProvider>
      <RobotVoiceInner debug={debug} />
    </ConversationProvider>
  );
}
