// Z.ai (Zhipu) — API compatible OpenAI. GLM-4.7-Flash est gratuit (tarifs officiels, oct. 2026).
// Doc : https://docs.z.ai/guides/overview/pricing , base internationale https://api.z.ai/api/paas/v4
// Limites non officielles : ~1 requête simultanée, ~1 000 req/jour. Serveurs hors UE (juridiction chinoise).

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';

const URL = 'https://api.z.ai/api/paas/v4/chat/completions';

/** Modèles texte gratuits Z.ai (tarifs officiels, oct. 2026). glm-4.5-flash : retrait annoncé. */
const ZAI_FREE = ['glm-4.7-flash', 'glm-4.5-flash'];
const cooled = new Map<string, number>();

export function createZaiProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.zai;
  const key = cfg.keys.zai;
  return {
    id: 'zai',
    model,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé ZAI_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('zai', 'auth', 'clé ZAI_API_KEY absente');
      // Les modèles gratuits saturent souvent (« 1305 overloaded ») : on bascule sur l'autre modèle gratuit.
      const now = Date.now();
      let lastErr: unknown;
      for (const m of [model, ...ZAI_FREE.filter((x) => x !== model)]) {
        if ((cooled.get(m) ?? 0) > now) continue;
        try {
          return await openAIChat('zai', URL, key, { ...req, model: m, timeoutMs: cfg.timeouts.cloudMs }, {
            max_tokens: req.maxTokens,
            thinking: { type: 'disabled' }, // GLM-4.x : pas de réflexion → latence minimale
          });
        } catch (e: any) {
          if (e?.kind !== 'quota') throw e;
          cooled.set(m, Date.now() + (e.retryAfterMs ?? 60_000));
          lastErr = e;
        }
      }
      throw lastErr ?? providerError('zai', 'quota', 'modèles gratuits Z.ai surchargés');
    },
  };
}
