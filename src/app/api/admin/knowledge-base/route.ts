import { NextRequest, NextResponse } from "next/server";
import { listKB, createTextKB, uploadFileKB, deleteKB, checkAdmin } from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";

/** GET /api/admin/knowledge-base → lista documentos da KB */
export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { status, data }: any = await listKB();
    if (status !== 200) return NextResponse.json({ error: data }, { status });
    const documents = (data?.documents ?? []).map((d: any) => ({
      id: d.id,
      name: d.name,
      createdAt: d.metadata?.created_at_unix_secs,
      sizeBytes: d.metadata?.size_bytes,
    }));
    return NextResponse.json({ documents });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

/** POST /api/admin/knowledge-base → upload de arquivo ou texto */
export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      // Upload de arquivo
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "Arquivo ausente" }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const { status, data } = await uploadFileKB(file.name, buffer, file.type || "text/plain");
      if (status !== 200) return NextResponse.json({ error: data }, { status });
      return NextResponse.json({ document: data }, { status });
    } else {
      // Texto puro (nova KB a partir de texto colado)
      const body = await req.json();
      const { text, name } = body;
      if (!text || typeof text !== "string")
        return NextResponse.json({ error: "Campo text obrigatório" }, { status: 400 });
      const { status, data } = await createTextKB(text, name);
      if (status !== 200) return NextResponse.json({ error: data }, { status });
      return NextResponse.json({ document: data }, { status });
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

/** DELETE /api/admin/knowledge-base?id=xxx → remove documento */
export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    const { status, data } = await deleteKB(id);
    if (status !== 200) return NextResponse.json({ error: data }, { status });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}