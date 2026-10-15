# Parité Wispr Flow — plan d'implémentation (go de Camille, 14 oct.)

Source : chantiers/veille-wispr-complete/index.html (47 propositions) + 01..04-*.md.
Camille : « tout ce qui est bénéfique, on y va, ajoute tout ce que tu trouves nécessaire ».

## Règles communes (tous les agents)
- Lis CLAUDE.md du dépôt. **Un propriétaire par fichier** (tableau ci-dessous). Ne touche JAMAIS un fichier d'un autre agent.
- Pas d'installation, pas de lancement d'Electron, pas de commit, pas de push. Pas d'Ollama (OLLAMA_HOST=http://127.0.0.1:9). Pas d'appel LLM réel. Ne lis jamais config.json/secrets/.env.
- **main.ts, settings.ts, design/app/*, preload-app.ts, appWindow.ts, tray.ts appartiennent à l'agent UI (vague 2)**. Les agents de la vague 1 n'y touchent pas : ils exposent leurs fonctions dans leurs modules et décrivent dans `chantiers/wispr-parite/api-<agent>.md` : fonctions exportées, IPC à brancher (nom, payload, validation), réglages lus (clé, défaut, libellé FR pour l'UI), notifications. Ils lisent les réglages avec `settings.get(clé) ?? défaut`.
- Vie privée : jamais de texte dicté ni d'écran dans les journaux (comptes seulement). Tout reste local sauf l'appel LLM existant.
- Vérifier : `export PATH=~/.local/node/bin:$PATH; npx tsc --noEmit -p .` (signaler sans corriger une erreur venant du fichier d'un autre) + tests purs `node --experimental-strip-types` pour la logique.

## Vague 1 (parallèle)
| Agent | Fichiers (propriétaire) | Tickets |
|---|---|---|
| **LLM** (dev-llm) | src/llm/**, src/shared/types.ts, bench/** | b1, b2, m1–m14, logique f2/f3 (fonctions de réécriture), f4 (règles de remplacement appliquées après LLM) |
| **AUDIO** (dev-electron) | src/main/recorder.ts, src/renderer/recorder.ts, src/renderer/recorder.html, src/main/preload-recorder.ts, nouveau src/main/media.ts | c1, c2, c5, c9, c10, c12 |
| **PIPE** (dev-electron) | src/main/pipeline.ts, insert.ts, history.ts, learn.ts, context.ts, whisper.ts, nouveaux src/main/snippets.ts, rewrite.ts, recovery.ts | b4, c3, c4, c6, c8, f1, f2/f3 (côté app : capter la sélection, coller le résultat), f4 (côté dictionnaire), f6 |
| **KEYS** (dev-electron) | src/main/hotkey.ts, fnkey.ts, scripts/fnwatch.swift, scripts/build-fnwatch.sh, src/main/overlay.ts, design/overlay/overlay.html, src/main/preload-overlay.ts | b3, c7, c11, c13, c14 (désactivé par défaut : la pastille ne montre jamais de texte sauf réglage), c15, f8 |

## Vague 2 (après la vague 1)
| **UI** (designer-ui) | src/main/main.ts, settings.ts, appWindow.ts, preload-app.ts, tray.ts, design/app/* | branche toutes les API (api-*.md), réglages + pages (Historique avec Réessayer, Snippets, Dictionnaire : prioritaires/remplacements/import-export f7, Réglages micro/voix basse/raccourcis/ton par app/mode prompt), f11 statistiques, s2 guide « bien dicter » + test micro |
| **NOTES/MCP** (dev-electron) | src/main/notes.ts, diarization.ts, nouveau mcp/ | f9 (serveur MCP local lecture seule des notes), f10 bloc-notes vocal (stockage + API pour UI) — en coordination avec UI |
| s1 / s3 | site-2 (page « Ce qui sort de votre Mac ») + mesure mémoire au repos | site non déployé sans go |

## Vague 3
Intégration (tsc, build, tests), bench Gemini (quota prudent), installation locale (version 1.0.13 pour éviter l'updater), test réel par Camille, puis « prêt à pousser » → go de Camille → audit sécurité → push.
