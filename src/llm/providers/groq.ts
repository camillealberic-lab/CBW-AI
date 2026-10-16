// Groq — API compatible OpenAI. Doc : https://console.groq.com/docs/models , /docs/rate-limits

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';
import * as quota from '../quota.ts';

const URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Modèles Groq gratuits testés (oct. 2026), du plus rapide/fiable au moins prioritaire. */
export const GROQ_ROTATION = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

/**
 * Marge de sortie ajoutée aux modèles à raisonnement (comptée dans le quota de tokens).
 * gpt-oss raisonne MÊME à `reasoning_effort: low` et ce raisonnement consomme max_completion_tokens : trop juste,
 * la réponse sort vide (finish_reason « length », contenu ""). 1024 couvre le raisonnement bas ; un réessai à 3072
 * rattrape les cas rares (voir complete()).
 */
export const GROQ_REASONING_MARGIN = 1024;
export const GROQ_REASONING_MARGIN_RETRY = 3072;
const extraOut = (m: string) => (/gpt-oss/.test(m) ? GROQ_REASONING_MARGIN : 0);

/** Corps additionnel pour un modèle Groq (pur, testable). */
export function groqExtraBody(m: string, maxTokens: number, margin = extraOut(m)): Record<string, unknown> {
  const extra: Record<string, unknown> = { max_completion_tokens: maxTokens };
  if (/gpt-oss/.test(m)) {
    // Raisonnement minimal, masqué ; marge de tokens pour qu'il ne mange pas la réponse.
    extra.reasoning_effort = 'low';
    extra.include_reasoning = false;
    extra.max_completion_tokens = maxTokens + margin;
  }
  if (/qwen3/.test(m)) extra.reasoning_effort = 'none'; // pas de réflexion : latence minimale
  return extra;
}

/** Réponse vide / tronquée d'un modèle à raisonnement : un réessai avec plus de marge peut la rattraper. */
const isEmptyOrCut = (e: any) => e?.kind === 'bad_output' && /vide|tronqu/i.test(String(e?.message ?? ''));

export function createGroqProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.groq;
  const key = cfg.keys.groq;
  const candidates = [model, ...GROQ_ROTATION.filter((m) => m !== model)];
  return {
    id: 'groq',
    model,
    candidates,
    extraOutTokens: extraOut,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé GROQ_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('groq', 'auth', 'clé GROQ_API_KEY absente');
      // Le quota gratuit Groq est PAR MODÈLE (≈ 8 000 tokens/min, ~1 000 req/jour chacun). Les en-têtes
      // x-ratelimit-* de chaque réponse sont mémorisés (quota.ts) : un modèle connu comme épuisé est sauté
      // SANS requête ; sur 429, bascule immédiate sur le modèle Groq suivant.
      const est = quota.estimateTokens(req);
      const { usable, forced } = quota.orderModels('groq', candidates, est);
      const models = usable.length ? usable : forced ? [forced] : candidates.slice(0, 1);
      let lastErr: unknown;
      for (const m of models) {
        const call = (margin?: number) =>
          openAIChat('groq', URL, key, { ...req, model: m, timeoutMs: cfg.timeouts.cloudMs }, groqExtraBody(m, req.maxTokens, margin));
        try {
          try {
            return await call();
          } catch (e: any) {
            // gpt-oss : réponse vide (raisonnement qui a mangé le budget) → un seul réessai avec une grosse marge.
            if (/gpt-oss/.test(m) && isEmptyOrCut(e) && !req.signal?.aborted) return await call(GROQ_REASONING_MARGIN_RETRY);
            throw e;
          }
        } catch (e: any) {
          // 429 (déjà mémorisé par requestJson) ou modèle retiré (404) → modèle suivant.
          if (e?.kind !== 'quota' && e?.status !== 404) {
            // Réponse vide persistante d'un gpt-oss : on passe au modèle Groq suivant plutôt que d'échouer.
            if (/gpt-oss/.test(m) && isEmptyOrCut(e) && m !== models[models.length - 1]) { lastErr = e; continue; }
            throw e;
          }
          lastErr = e;
          if (req.signal?.aborted) throw e;
        }
      }
      throw lastErr ?? providerError('groq', 'quota', 'tous les modèles Groq sont en limite de débit');
    },
  };
}
