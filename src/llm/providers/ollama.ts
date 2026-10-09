// Ollama local — POST /api/chat (stream false). Doc : https://docs.ollama.com/api/chat

import type { LLMConfig } from '../config.ts';
import { providerError, requestJson, stripThinking } from './common.ts';
import type { DictaProvider } from './common.ts';

/** "qwen3.5" ≡ "qwen3.5:latest". */
function sameModel(a: string, b: string): boolean {
  const norm = (s: string) => (s.includes(':') ? s : s + ':latest');
  return norm(a) === norm(b);
}

export function createOllamaProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.ollama;
  const base = cfg.ollama.url;

  async function availability(): Promise<{ ok: boolean; reason?: string }> {
    try {
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(300) });
      if (!res.ok) return { ok: false, reason: `Ollama répond HTTP ${res.status}` };
      const body: any = await res.json();
      const names: string[] = (body?.models ?? []).map((m: any) => String(m?.name ?? m?.model ?? ''));
      if (!names.some((n) => sameModel(n, model))) return { ok: false, reason: `modèle absent : lancez « ollama pull ${model} »` };
      // Garde-fou mémoire : charger gemma4 à froid prend ~10 Go et fait ramer un Mac 16 Go.
      // En secours, on n'utilise le local que s'il est DÉJÀ en mémoire (ou si l'utilisateur a choisi « Local d'abord »).
      if (!cfg.localFirst && cfg.providers[0] !== 'ollama') {
        const ps: any = await (await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(300) })).json().catch(() => ({}));
        const loaded = (ps?.models ?? []).some((m: any) => sameModel(String(m?.name ?? m?.model ?? ''), model));
        if (!loaded) return { ok: false, reason: 'modèle local non chargé (évite de saturer la mémoire) — active « Local d’abord » pour l’utiliser' };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: `Ollama injoignable (${base}) — application lancée ?` };
    }
  }

  async function chat(req: Parameters<DictaProvider['complete']>[0], think: boolean | undefined) {
    return requestJson(
      'ollama',
      `${base}/api/chat`,
      {
        body: {
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          stream: false,
          ...(think === undefined ? {} : { think }),
          keep_alive: cfg.ollama.keepAlive,
          options: { temperature: req.temperature, num_predict: req.maxTokens, num_ctx: 4096 }, // prompt ≈ 2,5 k tokens ; borne la RAM
        },
        timeoutMs: cfg.timeouts.localMs,
        signal: req.signal,
      },
      (status, body) => {
        if (status === 404) return { kind: 'unknown', message: `modèle « ${model} » absent (ollama pull ${model})` };
        if (/not support thinking/i.test(String(body?.error ?? ''))) return { kind: 'unknown', message: 'think-unsupported' };
      },
    );
  }

  return {
    id: 'ollama',
    model,
    availability,
    async isAvailable() {
      return (await availability()).ok;
    },
    async complete(req) {
      let body: any;
      try {
        // Désactive la réflexion (Qwen 3.x, etc.) : inutile ici et coûteuse en latence.
        body = await chat(req, false);
      } catch (e: any) {
        if (/think/i.test(e?.message ?? '') && e?.status === 400) body = await chat(req, undefined);
        else throw e;
      }
      const text = stripThinking(String(body?.message?.content ?? ''));
      if (body?.done_reason === 'length') throw providerError('ollama', 'bad_output', 'sortie tronquée (num_predict)');
      if (!text) throw providerError('ollama', 'bad_output', 'réponse vide');
      return { text, model: String(body?.model ?? model) };
    },
  };
}

/** Précharge le modèle en mémoire (à appeler au lancement de l'app si Ollama est utilisé). */
export async function warmupOllama(cfg: LLMConfig): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.ollama.url}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.models.ollama, keep_alive: cfg.ollama.keepAlive, options: { num_ctx: 4096 } }), // même num_ctx que chat(), sinon Ollama recharge
      signal: AbortSignal.timeout(60_000),
    });
    await res.text();
    return res.ok;
  } catch {
    return false;
  }
}
