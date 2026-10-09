// Groq — API compatible OpenAI. Doc : https://console.groq.com/docs/models , /docs/rate-limits

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';
import * as quota from '../quota.ts';

const URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Modèles Groq gratuits testés (oct. 2026), du plus rapide/fiable au moins prioritaire. */
export const GROQ_ROTATION = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

/** Marge de sortie ajoutée aux modèles à raisonnement (comptée dans le quota de tokens). */
const extraOut = (m: string) => (/gpt-oss/.test(m) ? 512 : 0);

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
        const extra: Record<string, unknown> = { max_completion_tokens: req.maxTokens };
        if (/gpt-oss/.test(m)) {
          // Raisonnement minimal, masqué ; marge de tokens pour qu'il ne mange pas la réponse.
          extra.reasoning_effort = 'low';
          extra.include_reasoning = false;
          extra.max_completion_tokens = req.maxTokens + extraOut(m);
        }
        if (/qwen3/.test(m)) extra.reasoning_effort = 'none'; // pas de réflexion : latence minimale
        try {
          return await openAIChat('groq', URL, key, { ...req, model: m, timeoutMs: cfg.timeouts.cloudMs }, extra);
        } catch (e: any) {
          // 429 (déjà mémorisé par requestJson) ou modèle retiré (404) → modèle suivant.
          if (e?.kind !== 'quota' && e?.status !== 404) throw e;
          lastErr = e;
          if (req.signal?.aborted) throw e;
        }
      }
      throw lastErr ?? providerError('groq', 'quota', 'tous les modèles Groq sont en limite de débit');
    },
  };
}
