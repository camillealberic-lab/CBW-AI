// OpenRouter — API compatible OpenAI. Modèles gratuits : suffixe ":free" ou routeur "openrouter/free".
// Doc : https://openrouter.ai/docs/api/reference/limits , /docs/guides/routing/provider-selection

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';
import * as quota from '../quota.ts';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Modèles gratuits de secours (« Provider returned error » = limite du fournisseur amont, par modèle). */
export const OPENROUTER_ROTATION = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free'];

export function createOpenRouterProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.openrouter;
  const key = cfg.keys.openrouter;
  const candidates = [model, ...OPENROUTER_ROTATION.filter((m) => m !== model)];
  return {
    id: 'openrouter',
    model,
    candidates,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé OPENROUTER_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('openrouter', 'auth', 'clé OPENROUTER_API_KEY absente');
      const { usable, forced } = quota.orderModels('openrouter', candidates, quota.estimateTokens(req));
      const models = usable.length ? usable : forced ? [forced] : candidates.slice(0, 1);
      let lastErr: unknown;
      for (const m of models) {
        try {
          return await openAIChat(
            'openrouter',
            URL,
            key,
            { ...req, model: m, timeoutMs: cfg.timeouts.cloudMs },
            {
              max_tokens: req.maxTokens,
              // Raisonnement réduit et non renvoyé (ignoré par les modèles sans raisonnement).
              reasoning: { effort: 'low', exclude: true },
              provider: { data_collection: cfg.openrouter.dataCollection },
            },
            { 'HTTP-Referer': 'https://github.com/dicta-ai', 'X-Title': 'Dicta AI' },
          );
        } catch (e: any) {
          // Plafond journalier du compte (free-models-per-day) : inutile d'essayer un autre modèle.
          if ((e?.kind !== 'quota' && e?.status !== 404) || e?.daily) throw e;
          lastErr = e;
          if (req.signal?.aborted) throw e;
        }
      }
      throw lastErr ?? providerError('openrouter', 'quota', 'modèles gratuits OpenRouter en limite de débit');
    },
  };
}
