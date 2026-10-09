// Masquage des secrets (clés API, jetons) dans les journaux, messages d'erreur et données envoyées à l'UI.
// Pur TS, sans dépendance : utilisé par le process main (src/main/paths.ts › log) ET par le bundle du
// router LLM (src/llm/providers/common.ts › providerError). Voir docs/SECURITY.md.

/** Formes connues des clés des fournisseurs (et formes génériques « Bearer … », « api_key=… »). */
const PATTERNS: RegExp[] = [
  /gsk_[A-Za-z0-9]{10,}/g, // Groq
  /AIza[0-9A-Za-z_\-]{20,}/g, // Google (AI Studio)
  /\bAQ\.[A-Za-z0-9_\-]{20,}/g, // Google (nouveau format)
  /sk-or-v1-[0-9a-f]{16,}/g, // OpenRouter
  /\bsk-[A-Za-z0-9_\-]{16,}/g, // OpenAI-like
  /\bxai-[A-Za-z0-9]{16,}/g, // xAI
  /\b[0-9a-f]{32}\.[A-Za-z0-9]{16}\b/g, // Z.ai
];
/** Valeur après un en-tête / paramètre sensible. */
const CONTEXT = /(\b(?:bearer|authorization|x-goog-api-key|api[_-]?key|apikey|access[_-]?token)\b["']?\s*[:=]?\s*["']?(?:bearer\s+)?)([A-Za-z0-9._~+/=\-]{12,})/gi;
const QUERY = /([?&](?:key|api_key|apikey|token|access_token)=)[^&\s"'#]+/gi;

const extra = new Set<string>();

/** Ajoute des valeurs exactes à masquer (clés effectivement configurées). */
export function registerSecretValues(values: Iterable<string | undefined | null>): void {
  for (const v of values) if (typeof v === 'string' && v.trim().length >= 8) extra.add(v.trim());
}
export function forgetSecretValue(v: string): void {
  extra.delete(v.trim());
}

/** « gsk_…a3f2 » : 4 premiers + 4 derniers caractères (••• si trop court pour rester secret). */
export function maskSecret(v: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.length < 16) return '•••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Une valeur masquée renvoyée telle quelle par l'UI (contient « … » ou « ••• ») : jamais une vraie clé. */
export const isMaskedValue = (v: unknown): boolean => typeof v === 'string' && /…|•••/.test(v);

/** Remplace tout secret reconnu dans un texte par sa forme masquée. */
export function redact(input: string): string {
  let s = String(input ?? '');
  if (!s) return s;
  for (const v of extra) if (s.includes(v)) s = s.split(v).join(maskSecret(v));
  for (const re of PATTERNS) s = s.replace(re, (m) => maskSecret(m));
  s = s.replace(CONTEXT, (_m, pre: string, val: string) => (val.includes('…') ? pre + val : pre + maskSecret(val)));
  s = s.replace(QUERY, '$1[masqué]');
  return s;
}
