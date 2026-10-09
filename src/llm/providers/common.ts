// Outils HTTP partagés par les providers : timeout, mapping d'erreurs → ProviderError.

import { ProviderError } from '../../shared/types.ts';
import { redact } from '../../shared/redact.ts';
import type { LLMProvider, ProviderErrorKind, ProviderId } from '../../shared/types.ts';

/** Provider + métadonnées utiles au router / à l'écran Réglages / au bench. */
export interface DictaProvider extends LLMProvider {
  /** Modèle configuré. */
  model: string;
  /** Disponibilité détaillée (raison lisible si indisponible). Rapide (<300 ms). */
  availability(): Promise<{ ok: boolean; reason?: string }>;
}

/** Erreur fournisseur enrichie (pause conseillée). */
export type DictaProviderError = ProviderError & { retryAfterMs?: number; daily?: boolean; status?: number };

export function providerError(
  provider: ProviderId,
  kind: ProviderErrorKind,
  message: string,
  extra: { retryAfterMs?: number; daily?: boolean; status?: number } = {},
): DictaProviderError {
  // Les corps d'erreur des fournisseurs peuvent recopier la clé (« Incorrect API key provided: sk-… ») :
  // tout message est masqué avant d'atteindre usage.json, dicta.log ou l'UI.
  return Object.assign(new ProviderError(provider, kind, redact(message).slice(0, 400)), extra);
}

export function isUserAbort(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted && (e as any)?.name !== 'TimeoutError';
}

/** Combine le signal appelant et un timeout. */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

function parseRetryAfter(h: Headers): number | undefined {
  const v = h.get('retry-after');
  if (!v) return undefined;
  const s = Number(v);
  if (Number.isFinite(s)) return s * 1000;
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : undefined;
}

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 429 || status === 402) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status >= 500) return 'network';
  return 'unknown';
}

/**
 * POST/GET JSON avec timeout et mapping d'erreurs.
 * `classify` permet au provider d'affiner le type d'erreur à partir du corps.
 */
export async function requestJson(
  provider: ProviderId,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; timeoutMs: number; signal?: AbortSignal },
  classify?: (status: number, body: any, text: string) => Partial<{ kind: ProviderErrorKind; daily: boolean; message: string; retryAfterMs: number }> | void,
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: withTimeout(init.timeoutMs, init.signal),
    });
  } catch (e: any) {
    if (isUserAbort(e, init.signal)) throw e;
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw providerError(provider, 'timeout', `délai dépassé (${init.timeoutMs} ms)`);
    }
    throw providerError(provider, 'network', `réseau : ${e?.cause?.code ?? e?.message ?? e}`);
  }

  let text = '';
  try {
    text = await res.text();
  } catch (e: any) {
    if (isUserAbort(e, init.signal)) throw e;
    if (e?.name === 'TimeoutError') throw providerError(provider, 'timeout', `délai dépassé (${init.timeoutMs} ms)`);
    throw providerError(provider, 'network', `lecture réponse : ${e?.message ?? e}`);
  }
  let body: any = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    /* corps non JSON */
  }

  if (!res.ok) {
    const apiMsg = body?.error?.message ?? (typeof body?.error === 'string' ? body.error : undefined) ?? text.slice(0, 200);
    const refined = classify?.(res.status, body, text) || {};
    const kind = refined.kind ?? kindForStatus(res.status);
    throw providerError(provider, kind, `HTTP ${res.status} : ${refined.message ?? apiMsg}`, {
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers) ?? refined.retryAfterMs,
      daily: refined.daily,
    });
  }
  if (body === undefined) throw providerError(provider, 'bad_output', 'réponse non JSON');
  return body;
}

/** Retire un éventuel bloc de raisonnement <think>…</think>. */
export function stripThinking(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Appel OpenAI-compatible (Groq, OpenRouter). */
export async function openAIChat(
  provider: ProviderId,
  url: string,
  apiKey: string,
  req: { model: string; system: string; user: string; temperature: number; maxTokens: number; signal?: AbortSignal; timeoutMs: number },
  extraBody: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
): Promise<{ text: string; model: string }> {
  const body = await requestJson(provider, url, {
    headers: { authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: {
      model: req.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      temperature: req.temperature,
      stream: false,
      ...extraBody,
    },
    timeoutMs: req.timeoutMs,
    signal: req.signal,
  });
  // OpenRouter peut renvoyer 200 avec un objet error.
  if (body?.error) {
    const code = Number(body.error.code);
    const kind: ProviderErrorKind = code === 429 || code === 402 ? 'quota' : code === 401 || code === 403 ? 'auth' : 'unknown';
    throw providerError(provider, kind, `erreur API : ${body.error.message ?? JSON.stringify(body.error)}`);
  }
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw providerError(provider, 'bad_output', 'réponse vide');
  if (choice.finish_reason === 'length') throw providerError(provider, 'bad_output', 'sortie tronquée (max tokens)');
  if (choice.finish_reason === 'content_filter') throw providerError(provider, 'bad_output', 'filtrée (content_filter)');
  return { text: stripThinking(content), model: String(body.model ?? req.model) };
}
