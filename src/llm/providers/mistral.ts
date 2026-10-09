// Mistral (La Plateforme) — API compatible OpenAI. Offre gratuite « Experiment » (hébergé UE, très bon en français).
// Doc : https://docs.mistral.ai/api/ — attention : les requêtes gratuites peuvent servir à l'entraînement.

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';

const URL = 'https://api.mistral.ai/v1/chat/completions';

export function createMistralProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.mistral;
  const key = cfg.keys.mistral;
  return {
    id: 'mistral',
    model,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé MISTRAL_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('mistral', 'auth', 'clé MISTRAL_API_KEY absente');
      return openAIChat('mistral', URL, key, { ...req, model, timeoutMs: cfg.timeouts.cloudMs }, { max_tokens: req.maxTokens });
    },
  };
}
