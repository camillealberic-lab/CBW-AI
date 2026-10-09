# CBW AI (ex-Dicta AI) — fiche projet

App macOS (Electron 44 + TS) : dictée nettoyée, notes de réunion (qui a dit quoi), brainstorm → master prompt. Utilisateur francophone, design CBW Studio.

## Carte
- `src/llm/` — IA (orchestrateur) : `prompt.ts` (nettoyage dictée, v1.5), `notes.ts` (compte rendu v2), `brainstorm.ts` (analyze / compile / liveBrainstorm), `router.ts` (course hedgée), `providers/*` (groq, gemini, zai, mistral, cloudflare, openrouter, ollama), `config.ts`, `quota.ts`.
- `src/main/` — Electron : `main.ts`, `pipeline.ts` (dictée), `notes.ts` (NoteSession), `brainstorm.ts` (BrainstormManager), `bubbles.ts`, `overlay.ts` (pastille), `diarization.ts` + `diarize-worker.ts` (sherpa-onnx), `fnkey.ts` + `scripts/fnwatch.swift` (Control gauche), `sounds.ts`, `appWindow.ts` + `preload-app.ts` (pont `window.dictaApp`).
- `design/app/` — `app.html` (fenêtre), `notes.js`, `brainstorm.js`, `charts.js` ; `design/overlay/overlay.html` ; `design/bubbles/bubbles.html` ; `design/cbw/` tokens + DESIGN.md.
- Contrats : `docs/APP_API.md`. État / reprise : `docs/PAUSE.md`. Benchmark : `bench/` (`run.ts`, `cases.jsonl`).
- Sites : `site-1/ site-2/ site-3/` (2 recommandé). Récap : `docs/recap/index.html`.

## Commandes
- Node : `export PATH=~/.local/node/bin:$PATH`
- Vérifier : `npx tsc --noEmit -p .`
- Installer : `npm run build && npx electron-builder --mac dir --arm64 && bash scripts/install-app.sh` (icône : `npm run icon` avant electron-builder).
- Tester le LLM : `NODE_NO_WARNINGS=1 node --experimental-strip-types src/llm/cli.ts "texte"`
- Logs : `~/.dicta-ai/dicta.log` ; config/clés : `~/.dicta-ai/config.json` (clés plates `providers.groq.apiKey`…).

## Règles
- Mac 16 Go : jamais charger Ollama/gemma4 en test (`OLLAMA_HOST=http://127.0.0.1:9`), une seule instance Electron de test à la fois, tuée après ; un seul whisper-server de test.
- Agents en parallèle : un propriétaire par fichier ; ne pas installer pendant qu'un agent édite un fichier embarqué (sinon réutiliser la version installée via `npx @electron/asar extract-file`).
- Ne rien publier (GitHub, Vercel) sans accord explicite.
- Réponses à l'utilisateur : français, courtes, statut + ce qu'il doit faire.
