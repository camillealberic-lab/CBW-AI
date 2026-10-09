// Groq — API compatible OpenAI. Doc : https://console.groq.com/docs/models , /docs/rate-limits

import type { LLMConfig } from '../config.ts';
import { openAIChat, providerError } from './common.ts';
import type { DictaProvider } from './common.ts';

const URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Modèles Groq gratuits testés (oct. 2026), du plus rapide/fiable au moins prioritaire. */
export const GROQ_ROTATION = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
/** Modèle → instant (ms) jusqu'auquel il est en limite de débit. */
const cooled = new Map<string, number>();

export function createGroqProvider(cfg: LLMConfig): DictaProvider {
  const model = cfg.models.groq;
  const key = cfg.keys.groq;
  return {
    id: 'groq',
    model,
    async availability() {
      return key ? { ok: true } : { ok: false, reason: 'clé GROQ_API_KEY absente' };
    },
    async isAvailable() {
      return !!key;
    },
    async complete(req) {
      if (!key) throw providerError('groq', 'auth', 'clé GROQ_API_KEY absente');
      // Le quota gratuit Groq est PAR MODÈLE (≈ 8 000 tokens/min chacun) : sur 429, on passe
      // tout de suite au modèle Groq suivant au lieu de quitter Groq (≈ 3× plus de débit).
      const now = Date.now();
      const models = [model, ...GROQ_ROTATION.filter((m) => m !== model)];
      let lastErr: unknown;
      for (const m of models) {
        if ((cooled.get(m) ?? 0) > now) continue;
        const extra: Record<string, unknown> = { max_completion_tokens: req.maxTokens };
        if (/gpt-oss/.test(m)) {
          // Raisonnement minimal, masqué ; marge de tokens pour qu'il ne mange pas la réponse.
          extra.reasoning_effort = 'low';
          extra.include_reasoning = false;
          extra.max_completion_tokens = req.maxTokens + 512;
        }
        if (/qwen3/.test(m)) extra.reasoning_effort = 'none'; // pas de réflexion : latence minimale
        try {
          return await openAIChat('groq', URL, key, { ...req, model: m, timeoutMs: cfg.timeouts.cloudMs }, extra);
        } catch (e: any) {
          if (e?.kind !== 'quota') throw e;
          cooled.set(m, Date.now() + (e.retryAfterMs ?? 60_000));
          lastErr = e;
        }
      }
      throw lastErr ?? providerError('groq', 'quota', 'tous les modèles Groq sont en limite de débit');
    },
  };
}
