import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/session
 * Cria uma sessão de voz: busca o conversation token na ElevenLabs
 * e devolve apenas o token + agent_id para o frontend.
 *
 * O áudio NUNCA passa por aqui — após o handshake, o cliente
 * conecta via WebRTC direto ao agente da ElevenLabs.
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || "";

// Rate limit simples em memória: máx 10 sessões/min por IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

export async function POST(req: NextRequest) {
  if (!ELEVENLABS_API_KEY || !AGENT_ID) {
    return NextResponse.json(
      { error: "Servidor não configurado (ELEVENLABS_API_KEY / AGENT_ID)" },
      { status: 500 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Muitas sessões — aguarde um momento" },
      { status: 429 }
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(AGENT_ID)}`,
      {
        method: "GET",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text();
      console.error("[voice-session] ElevenLabs erro", res.status, body.slice(0, 300));
      return NextResponse.json(
        { error: "Falha ao criar sessão de voz" },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      token: data.token,
      agent_id: AGENT_ID,
      conversation_id: data.conversation_id || null,
      server_time: Date.now(),
    });
  } catch (err: unknown) {
    const e = err as Error;
    if (e.name === "AbortError") {
      return NextResponse.json(
        { error: "Tempo esgotado ao criar sessão" },
        { status: 504 }
      );
    }
    console.error("[voice-session] erro", e.message);
    return NextResponse.json(
      { error: "Erro interno ao criar sessão" },
      { status: 500 }
    );
  }
}
