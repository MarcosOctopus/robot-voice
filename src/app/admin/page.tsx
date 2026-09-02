"use client";

import { useCallback, useEffect, useState } from "react";

type KB = { id: string; name: string; createdAt?: number; sizeBytes?: number };

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [kbs, setKbs] = useState<KB[]>([]);
  const [linkedKbs, setLinkedKbs] = useState<KB[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${password}` }),
    [password]
  );

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [agentRes, kbRes] = await Promise.all([
        fetch("/api/admin/agent", { headers: authHeaders() }),
        fetch("/api/admin/knowledge-base", { headers: authHeaders() }),
      ]);
      if (agentRes.status === 401 || kbRes.status === 401) {
        setAuthed(false);
        setMsg({ type: "err", text: "Senha incorreta" });
        return;
      }
      const agent = await agentRes.json();
      const kb = await kbRes.json();
      setPrompt(agent.prompt ?? "");
      setSavedPrompt(agent.prompt ?? "");
      setLinkedKbs(agent.knowledgeBase ?? []);
      setKbs(kb.documents ?? []);
      setAuthed(true);
      setMsg(null);
    } catch (e: any) {
      setMsg({ type: "err", text: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);

  const saveAgent = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, knowledgeBase: linkedKbs.map((k) => ({ type: "file", name: k.name, id: k.id })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? JSON.stringify(data.error ?? data));
      setSavedPrompt(data.prompt ?? prompt);
      setLinkedKbs(data.knowledgeBase ?? linkedKbs);
      setMsg({ type: "ok", text: "✅ Agente atualizado com sucesso" });
    } catch (e: any) {
      setMsg({ type: "err", text: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/knowledge-base", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
      const doc = data.document;
      setMsg({ type: "ok", text: `📄 "${doc.name}" enviado. Vincule na lista abaixo.` });
      await loadAll();
    } catch (e: any) {
      setMsg({ type: "err", text: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  const deleteKB = async (id: string) => {
    if (!confirm("Deletar este documento da base?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/knowledge-base?id=${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(JSON.stringify(d.error ?? d));
      }
      setKbs((prev) => prev.filter((k) => k.id !== id));
      setLinkedKbs((prev) => prev.filter((k) => k.id !== id));
      setMsg({ type: "ok", text: "🗑️ Documento removido" });
    } catch (e: any) {
      setMsg({ type: "err", text: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  };

  const toggleLink = (kb: KB) => {
    setLinkedKbs((prev) =>
      prev.some((k) => k.id === kb.id) ? prev.filter((k) => k.id !== kb.id) : [...prev, kb]
    );
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 p-6">
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h1 className="text-xl font-bold text-white mb-1">Painel Admin</h1>
          <p className="text-zinc-400 text-sm mb-6">Base de dados + prompt do agente</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAll()}
            placeholder="Senha admin"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={loadAll}
            disabled={busy || !password}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-lg py-3 transition"
          >
            {busy ? "Carregando..." : "Entrar"}
          </button>
          {msg && (
            <p className={`mt-4 text-sm ${msg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">🤖 Painel do Agente</h1>
            <p className="text-zinc-500 text-sm">Gerencie a base de dados e o comportamento do robô</p>
          </div>
          <button
            onClick={() => setAuthed(false)}
            className="text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-lg px-3 py-2"
          >
            Sair
          </button>
        </header>

        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.type === "ok" ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
            {msg.text}
          </div>
        )}

        {/* Prompt */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">🧠 Prompt do agente</h2>
            <span className="text-xs text-zinc-500">{prompt.length} caracteres</span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm font-mono focus:outline-none focus:border-emerald-600 resize-y"
            placeholder="Escreva aqui como o agente deve se comportar..."
          />
          <div className="flex justify-end">
            <button
              onClick={saveAgent}
              disabled={busy || prompt === savedPrompt}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl px-6 py-3 transition"
            >
              {busy ? "Salvando..." : "💾 Salvar prompt"}
            </button>
          </div>
        </section>

        {/* KB upload */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">📚 Base de dados (Knowledge Base)</h2>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 hover:border-emerald-600 rounded-xl p-8 cursor-pointer transition bg-zinc-950">
            <span className="text-3xl mb-2">📤</span>
            <span className="text-sm text-zinc-400">Clique para enviar um arquivo (txt, pdf, md...)</span>
            <input
              type="file"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = "";
              }}
            />
          </label>

          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">Documentos disponíveis</h3>
            <div className="space-y-2">
              {kbs.length === 0 && <p className="text-sm text-zinc-600">Nenhum documento ainda.</p>}
              {kbs.map((kb) => {
                const linked = linkedKbs.some((k) => k.id === kb.id);
                return (
                  <div key={kb.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={linked}
                        onChange={() => toggleLink(kb)}
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-medium">{kb.name}</p>
                        <p className="text-xs text-zinc-500">
                          {kb.sizeBytes ? `${(kb.sizeBytes / 1024).toFixed(1)} KB` : "—"}
                          {linked ? " · vinculado ao agente" : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteKB(kb.id)}
                      className="text-red-400 hover:text-red-300 text-sm px-2 py-1"
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
            {kbs.length > 0 && (
              <p className="text-xs text-zinc-500 mt-3">
                Marque/desmarque os documentos e clique em{" "}
                <button onClick={saveAgent} disabled={busy} className="text-emerald-400 hover:underline">
                  salvar
                </button>{" "}
                para aplicar os vínculos ao agente.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}