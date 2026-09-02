import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "robot-voice",
    agent_configured: Boolean(process.env.ELEVENLABS_AGENT_ID),
    time: new Date().toISOString(),
  });
}
