// OpenRouter — API compatible OpenAI. Modèles gratuits : suffixe ":free" ou routeur "openrouter/free".
// Doc : https://openrouter.ai/docs/api/reference/limits , /docs/guides/routing/provider-selection

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

export function createOpenRouterProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.openrouter;
  const key = cfg.keys.openrouter;
  return {
    id: 'openrouter',
    model,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé OPENROUTER_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('openrouter', 'auth', 'clé OPENROUTER_API_KEY absente');
      return openAIChat(
        'openrouter',
        URL,
        key,
        { ...req, model, timeoutMs: cfg.timeouts.cloudMs },
        {
          max_tokens: req.maxTokens,
          // Raisonnement réduit et non renvoyé (ignoré par les modèles sans raisonnement).
          reasoning: { effort: 'low', exclude: true },
          provider: { data_collection: cfg.openrouter.dataCollection },
        },
        { 'HTTP-Referer': 'https://github.com/dicta-ai', 'X-Title': 'Dicta AI' },
      );
    },
  };
}
