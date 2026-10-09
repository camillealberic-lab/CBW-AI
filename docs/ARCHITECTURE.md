# Dicta AI — architecture & répartition

Stack : Electron + TypeScript (macOS, Apple Silicon). Whisper local (whisper.cpp). LLM via router multi-fournisseurs.

Pipeline : hotkey maintenu → capture micro (16 kHz mono WAV) → whisper.cpp → texte brut → `cleanTranscript()` → clipboard + Cmd+V dans l'app active.

| Zone | Propriétaire | Contenu |
|---|---|---|
| `src/shared/types.ts` | orchestrateur | contrat partagé (ne pas modifier seul) |
| `src/llm/prompt.ts` | orchestrateur | prompt système, few-shots, buildMessages, postProcess |
| `bench/` | orchestrateur | 50 phrases de benchmark + runner |
| `src/llm/router.ts`, `src/llm/providers/*`, `src/llm/config.ts` | worker LLM | fournisseurs, fallback, quotas |
| `docs/API_KEYS.md` | worker LLM | guide d'obtention des clés |
| `src/main/*`, `src/renderer/*`, `package.json`, build | worker App | Electron, hotkey, audio, whisper, insertion, overlay |
| `design/*`, `assets/*` | designers | logo, overlay d'état, fenêtre réglages |

## API de prompt.ts (fournie par l'orchestrateur)
```ts
export const PROMPT_VERSION: string;
export function buildMessages(raw: string, opts?: { language?: string }): { system: string; user: string };
export function postProcess(modelOutput: string, raw: string): string; // nettoie guillemets, préfixes, détecte réponses "hors-rôle"
export const GENERATION = { temperature: number, maxTokens: (raw: string) => number };
```
