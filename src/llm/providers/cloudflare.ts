// Cloudflare Workers AI — endpoint compatible OpenAI. Gratuit : 10 000 « neurons »/jour (~460 dictées).
// Doc : https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
// Nécessite un jeton API (permission « Workers AI ») ET l'identifiant de compte.

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';

export function createCloudflareProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.cloudflare;
  const key = cfg.keys.cloudflare;
  const account = cfg.cloudflare.accountId;
  const missing = !key ? 'jeton CLOUDFLARE_API_TOKEN absent' : !account ? 'identifiant de compte Cloudflare absent' : '';
  return {
    id: 'cloudflare',
    model,
    async availability() {
      return missing ? { ok: false, reason: missing } : { ok: true };
    },
    async isAvailable() {
      return !missing;
    },
    async complete(req) {
      if (missing) throw providerError('cloudflare', 'auth', missing);
      const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`;
      return openAIChat('cloudflare', url, key!, { ...req, model, timeoutMs: cfg.timeouts.cloudMs }, { max_tokens: req.maxTokens });
    },
  };
}
