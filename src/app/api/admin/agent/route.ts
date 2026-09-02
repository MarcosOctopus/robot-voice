import { NextRequest, NextResponse } from "next/server";
import { getPromptObject, updateAgent, checkAdmin } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

/** GET /api/admin/agent → prompt atual + estado do agente */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const promptObj: any = await getPromptObject();
    return NextResponse.json({
      prompt: promptObj.prompt ?? "",
      knowledgeBase: promptObj.knowledge_base ?? [],
      agentId: process.env.ELEVENLABS_AGENT_ID,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

/** PUT /api/admin/agent → atualiza prompt (e opcionalmente KB) */
export async function PUT(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { prompt, knowledgeBase } = body;
    const { status, data } = await updateAgent({
      prompt: typeof prompt === "string" ? prompt : undefined,
      knowledgeBase: Array.isArray(knowledgeBase) ? knowledgeBase : undefined,
    });
    if (status !== 200) {
      return NextResponse.json({ error: data }, { status });
    }
    const promptObj: any = await getPromptObject();
    return NextResponse.json({
      ok: true,
      prompt: promptObj.prompt,
      knowledgeBase: promptObj.knowledge_base,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}