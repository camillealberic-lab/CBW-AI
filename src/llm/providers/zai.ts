// Z.ai (Zhipu) — API compatible OpenAI. GLM-4.7-Flash est gratuit (tarifs officiels, oct. 2026).
// Doc : https://docs.z.ai/guides/overview/pricing , base internationale https://api.z.ai/api/paas/v4
// Limites non officielles : ~1 requête simultanée, ~1 000 req/jour. Serveurs hors UE (juridiction chinoise).

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';
import * as quota from '../quota.ts';

const URL = 'https://api.z.ai/api/paas/v4/chat/completions';

/** Modèles texte gratuits Z.ai (tarifs officiels, oct. 2026). glm-4.5-flash : retrait annoncé. */
const ZAI_FREE = ['glm-4.7-flash', 'glm-4.5-flash'];

export function createZaiProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.zai;
  const key = cfg.keys.zai;
  const candidates = [model, ...ZAI_FREE.filter((x) => x !== model)];
  return {
    id: 'zai',
    model,
    candidates,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé ZAI_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('zai', 'auth', 'clé ZAI_API_KEY absente');
      // Les modèles gratuits saturent souvent (« 1305 overloaded ») : on bascule sur l'autre modèle gratuit.
      // Modèles connus comme saturés / épuisés (quota.ts) sautés sans requête.
      const { usable, forced } = quota.orderModels('zai', candidates, quota.estimateTokens(req));
      const models = usable.length ? usable : forced ? [forced] : candidates.slice(0, 1);
      let lastErr: unknown;
      for (const m of models) {
        try {
          return await openAIChat('zai', URL, key, { ...req, model: m, timeoutMs: cfg.timeouts.cloudMs }, {
            max_tokens: req.maxTokens,
            thinking: { type: 'disabled' }, // GLM-4.x : pas de réflexion → latence minimale
          });
        } catch (e: any) {
          if (e?.kind !== 'quota' && e?.status !== 404) throw e;
          lastErr = e;
          if (req.signal?.aborted) throw e;
        }
      }
      throw lastErr ?? providerError('zai', 'quota', 'modèles gratuits Z.ai surchargés');
    },
  };
}
