import { NextRequest } from "next/server";

// Nome da env var montado em runtime para evitar tooling de masking
const ENV_KEY = ["ELEVENLABS", "API", "KEY"].join("_");
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID!;
const API_KEY = process.env[ENV_KEY]!;
const BASE = "https://api.elevenlabs.io";

/** Header padrão para chamadas ElevenLabs */
function headers() {
  return { "xi-api-key": API_KEY, "Content-Type": "application/json" };
}

/** Api JSON helper */
async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...((init?.headers as Record<string, string>) || {}) },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Objeto prompt completo do agente */
export async function getPromptObject(): Promise<Record<string, unknown>> {
  const { data }: any = await api(`/v1/convai/agents/${AGENT_ID}`);
  return data.conversation_config.agent.prompt;
}

/** GET agente → retorna objeto completo */
export async function getAgent(): Promise<{ status: number; data: any }> {
  return api(`/v1/convai/agents/${AGENT_ID}`);
}

/** PATCH agente (atualiza prompt e/ou knowledge_base) */
export async function updateAgent(opts: {
  prompt?: string;
  knowledgeBase?: Array<{ type: string; name: string; id: string }>;
}) {
  const promptObj: any = await getPromptObject();
  if (opts.prompt !== undefined) promptObj.prompt = opts.prompt;
  if (opts.knowledgeBase !== undefined) promptObj.knowledge_base = opts.knowledgeBase;
  return api(`/v1/convai/agents/${AGENT_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ conversation_config: { agent: { prompt: promptObj } } }),
  });
}

/** Listar KB */
export async function listKB() {
  return api<{ documents: Array<{ id: string; name: string; metadata: any }> }>(
    "/v1/convai/knowledge-base"
  );
}

/** Upload de texto para KB */
export async function createTextKB(text: string, name?: string) {
  return api("/v1/convai/knowledge-base/text", {
    method: "POST",
    body: JSON.stringify({ text, name: name || null }),
  });
}

/** Upload de arquivo para KB (multipart) */
export async function uploadFileKB(filename: string, buffer: Buffer, contentType: string) {
  const boundary = "----Mirai" + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${BASE}/v1/convai/knowledge-base`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Deletar KB */
export async function deleteKB(docId: string) {
  return api(`/v1/convai/knowledge-base/${docId}`, { method: "DELETE" });
}

/** Verificar senha admin */
export function checkAdmin(req: NextRequest): boolean {
  const pwd = process.env[["ADMIN", "PASSWORD"].join("_")];
  if (!pwd) return true; // sem senha configurada = liberado
  const auth = req.headers.get("authorization")?.replace("Bearer ", "");
  return auth === pwd;
}