#!/usr/bin/env python3
"""Helper de acesso à API ElevenLabs para o painel admin do robot-voice.
Lê a chave de .env.local e expõe funções tipadas.
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

AGENT_ID = os.environ.get("ELEVENLABS_AGENT_ID", "agent_5001m1f48wg2ecwsdty8s1250wat")
BASE = "https://api.elevenlabs.io"


def load_key():
    """Lê ELEVENLABS_API_KEY do .env.local (projeto)."""
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        # fallback: variável de ambiente
        key = os.environ.get("ELEVENLABS_API_KEY", "")
        if key:
            return key.strip()
        raise RuntimeError(f".env.local não encontrado em {env_path}")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line.startswith("ELEVENLABS_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("ELEVENLABS_API_KEY ausente no .env.local")


def api(path, method="GET", body=None, timeout=40):
    """Chamada JSON genérica. Retorna (status, parsed)."""
    req = urllib.request.Request(f"{BASE}{path}", method=method)
    req.add_header("xi-api-key", load_key())
    req.add_header("Content-Type", "application/json")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1000]


def api_multipart(path, filename, content, content_type="text/plain", extra_fields=None, method="POST", timeout=60):
    """Upload multipart (para knowledge-base). Retorna (status, parsed)."""
    import uuid
    boundary = "----Mirai" + uuid.uuid4().hex
    parts = []
    for k, v in (extra_fields or {}).items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        )
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {content_type}\r\n\r\n".encode()
    )
    parts.append(content)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)
    req = urllib.request.Request(
        f"{BASE}{path}", data=body, method=method,
        headers={
            "xi-api-key": load_key(),
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1000]


def get_agent():
    """Retorna o objeto completo do agente."""
    return api(f"/v1/convai/agents/{AGENT_ID}")


def get_prompt_object():
    """Retorna o objeto prompt completo (dict) do agente."""
    s, ag = get_agent()
    if s != 200:
        raise RuntimeError(f"Falha GET agente: {s} {ag}")
    return ag["conversation_config"]["agent"]["prompt"]


def update_agent(prompt_text=None, knowledge_base_ids=None):
    """PATCH do agente com objeto prompt completo. Só altera campos fornecidos."""
    prompt_obj = get_prompt_object()
    if prompt_text is not None:
        prompt_obj["prompt"] = prompt_text
    if knowledge_base_ids is not None:
        prompt_obj["knowledge_base"] = knowledge_base_ids
    return api(f"/v1/convai/agents/{AGENT_ID}", "PATCH", {
        "conversation_config": {"agent": {"prompt": prompt_obj}}
    })


def list_kb():
    """Lista documentos da knowledge base."""
    return api("/v1/convai/knowledge-base")


def upload_kb(filename, content, content_type="text/plain"):
    """Cria documento na KB. Retorna (status, {id, name})."""
    return api_multipart("/v1/convai/knowledge-base", filename, content, content_type)


def delete_kb(doc_id):
    return api(f"/v1/convai/knowledge-base/{doc_id}", "DELETE")


if __name__ == "__main__":
    s, r = get_agent()
    print("agent get:", s)
    if s == 200:
        print("prompt len:", len(r["conversation_config"]["agent"]["prompt"]["prompt"]))
        print("kb:", r["conversation_config"]["agent"]["prompt"].get("knowledge_base"))
