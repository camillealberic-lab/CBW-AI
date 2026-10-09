// Google Gemini API (clé AI Studio) — REST generateContent.
// Doc : https://ai.google.dev/api/generate-content , https://ai.google.dev/gemini-api/docs/generate-content/thinking

import type { LLMConfig } from '../config.ts';
import { providerError, requestJson } from './common.ts';
import type { DictaProvider } from './common.ts';
import * as quota from '../quota.ts';

/** Quota gratuit Gemini = PAR MODÈLE : modèles Flash-Lite de secours (404 → écarté 6 h). */
export const GEMINI_ROTATION = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Réglage de réflexion le plus bas accepté par le modèle :
 * - Gemini 2.5 Flash / Flash-Lite : thinkingBudget 0 (désactivé). 2.5 Pro ne peut pas → rien.
 * - Gemini 3.7 / 3.8 Flash et Pro : 'minimal' refusé → 'low'.
 * - Autres Gemini 3.x (3.5 Flash-Lite, 3.1 Flash-Lite, 3.5/3.6 Flash, 3 Flash preview) : 'minimal'.
 */
export function thinkingConfigFor(model: string, forced?: string): Record<string, unknown> | undefined {
  const m = model.toLowerCase();
  if (/gemini-2\.5/.test(m)) return /pro/.test(m) ? undefined : { thinkingBudget: 0 };
  if (forced) return { thinkingLevel: forced };
  if (/gemini-3/.test(m) || /gemini-[4-9]/.test(m)) {
    if (/pro/.test(m) || /gemini-3\.[7-9]-flash(?!-lite)/.test(m)) return { thinkingLevel: 'low' };
    return { thinkingLevel: 'minimal' };
  }
  return undefined;
}

function classify(status: number, body: any) {
  const err = body?.error ?? {};
  const details: any[] = Array.isArray(err.details) ? err.details : [];
  // Clé invalide : Gemini répond 400 INVALID_ARGUMENT / reason API_KEY_INVALID.
  if (status === 400 && (details.some((d) => d?.reason === 'API_KEY_INVALID') || /api key not valid/i.test(err.message ?? ''))) {
    return { kind: 'auth' as const };
  }
  if (status === 429) {
    const daily = details.some((d) =>
      (d?.violations ?? []).some((v: any) => /per ?day/i.test(String(v?.quotaId ?? '') + String(v?.quotaMetric ?? ''))),
    );
    // RetryInfo.retryDelay, ex. "23s" (ou "23.5s").
    const ri = details.find((d) => typeof d?.retryDelay === 'string');
    const secs = ri ? parseFloat(ri.retryDelay) : NaN;
    return { kind: 'quota' as const, daily, retryAfterMs: Number.isFinite(secs) ? secs * 1000 : undefined };
  }
}

export function createGeminiProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.gemini;
  const key = cfg.keys.gemini;
  const candidates = [model, ...GEMINI_ROTATION.filter((m) => m !== model)];
  return {
    id: 'gemini',
    model,
    candidates,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé GEMINI_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('gemini', 'auth', 'clé GEMINI_API_KEY absente');
      const { usable, forced } = quota.orderModels('gemini', candidates, quota.estimateTokens(req));
      const models = usable.length ? usable : forced ? [forced] : candidates.slice(0, 1);
      let lastErr: unknown;
      for (const m of models) {
        try {
          return await completeWith(m, req);
        } catch (e: any) {
          // 429 (mémorisé par requestJson, quota journalier compris) ou modèle introuvable → modèle suivant.
          if (e?.kind !== 'quota' && e?.status !== 404) throw e;
          lastErr = e;
          if (req.signal?.aborted) throw e;
        }
      }
      throw lastErr ?? providerError('gemini', 'quota', 'tous les modèles Gemini sont en limite de débit');
    },
  };

  async function completeWith(model: string, req: Parameters<DictaProvider['complete']>[0]): Promise<{ text: string; model: string }> {
      const thinking = thinkingConfigFor(model, cfg.gemini.thinkingLevel);
      const makeBody = (withThinking: boolean) => ({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature,
          // Les tokens de réflexion comptent dans maxOutputTokens : marge pour éviter la troncature.
          maxOutputTokens: req.maxTokens + (withThinking && thinking ? 512 : 0),
          ...(withThinking && thinking ? { thinkingConfig: thinking } : {}),
        },
      });
      const call = (withThinking: boolean) =>
        requestJson(
          'gemini',
          `${BASE}/${encodeURIComponent(model)}:generateContent`,
          { headers: { 'x-goog-api-key': key! }, body: makeBody(withThinking), timeoutMs: cfg.timeouts.cloudMs, signal: req.signal, model },
          classify,
        );

      let body: any;
      try {
        body = await call(true);
      } catch (e: any) {
        // Niveau de réflexion non supporté par ce modèle → réessai sans thinkingConfig.
        if (thinking && e?.status === 400 && /think/i.test(e?.message ?? '')) body = await call(false);
        else throw e;
      }

      if (body?.promptFeedback?.blockReason) {
        throw providerError('gemini', 'bad_output', `prompt bloqué : ${body.promptFeedback.blockReason}`);
      }
      const cand = body?.candidates?.[0];
      const parts: any[] = cand?.content?.parts ?? [];
      const text = parts
        .filter((p) => !p?.thought && typeof p?.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim();
      const fr = cand?.finishReason;
      if (fr === 'MAX_TOKENS') throw providerError('gemini', 'bad_output', 'sortie tronquée (MAX_TOKENS)');
      if (fr && fr !== 'STOP') throw providerError('gemini', 'bad_output', `finishReason ${fr}`);
      if (!text) throw providerError('gemini', 'bad_output', 'réponse vide');
      return { text, model: String(body.modelVersion ?? model) };
  }
}
