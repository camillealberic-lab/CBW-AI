# API LLM — prompt v1.8 (agent LLM, vague 1)

Fichiers : `src/llm/{prompt,format,router,rewrite}.ts`, `src/shared/types.ts`, `bench/`. Tests : `node --experimental-strip-types src/llm/format.test.ts` (+ `context.test.ts`). Bench sans réseau : `OLLAMA_HOST=http://127.0.0.1:9 node --experimental-strip-types bench/run.ts --dry --cases cases-forme.jsonl`.

## Nouveaux champs de type (`src/shared/types.ts`)
- `DictationContext.before?: string` : ≤ 300 car. avant le curseur (m14). Jamais journalisé ; part au LLM avec la dictée. À remplir par `context.ts` (PIPE) ; absent = pas de raccord.
- `CleanOptions` : `promptMode?: 'auto'|'on'|'off'`, `toneByApp?: boolean`, `frenchTypography?: boolean`, `priorityVocabulary?: string[]`, `replacements?: ReplacementRule[]`.
- `ReplacementRule { from; to }`, `RewritePreset { id?; name; instruction }`.
Le pipeline passe ces options à `cleanTranscript(raw, opts)` ; elles sont lues avec `settings.get(clé) ?? défaut` côté app, rien n'est lu dans `src/llm` (hors `config.json` existant).

## Fonctions exportées
- `router.ts` : `cleanTranscript` (inchangé, + options ci-dessus), `finalizeText(text, raw, opts)` (passe finale pure : remplacements, pas de retour inventé en terminal/éditeur, espaces fines, raccord), `routeCompletion(job, opts)` (course hedgée générique, utilisée par la réécriture).
- `prompt.ts` : `PROMPT_VERSION = 'v1.8'` ; `shouldSkipLLM` ne saute plus une dictée contenant une commande (b1) ; `fallbackClean` applique les commandes sans IA (b2, ex. `Salut Karim virgule à la ligne` → `Salut Karim,\n`). Le repli peut renvoyer un texte finissant par `\n` (dictée terminée par « à la ligne » : à coller tel quel, ne pas `trim()`). `renderContextBlock(ctx, {promptMode, toneByApp})` ajoute `profil="terminal|code|messagerie|mail|chat-ia"`, `prompt="oui"` et le bloc `<avant>`.
- `format.ts` : `applyDictationCommands`, `hasDictationCommand`, `appProfile(ctx)`, `isPromptMode(ctx, mode)`, `joinWithBefore(text, before)`, `frenchTypography`, `stripInventedDashes`, `stripInventedBreaks`, `applyReplacements(text, rules)` (mots entiers, insensible à la casse, une passe, casse cible respectée ; majuscule de début de phrase conservée), `sanitizeReplacementRules` (≤ 500, from ≤ 80, to ≤ 200).
- `rewrite.ts` (f2/f3) : `rewriteSelection(selected, instruction, opts)` → `{ text, provider, model, latencyMs, preset?, unchanged? }` ; `rewriteWithPreset(selected, preset, opts)` ; `findPreset(spoken, presets)`, `resolveInstruction`, `sanitizePresets` (≤ 30, nom ≤ 40, consigne ≤ 600), `DEFAULT_PRESETS` (7 suggestions). `opts` : `providers?, language?, presets?, replacements?, frenchTypography?, signal?`. Erreurs : `RewriteError.code` = `empty-selection | empty-instruction | too-long (12 000 car.) | failed` : en cas d'échec rien n'est remplacé (pas de repli texte brut). `unchanged: true` = le modèle a jugé l'instruction inapplicable : ne rien coller. Aucun texte journalisé.
- Mots prioritaires (f4) : `PromptOptions.priorityVocabulary` placé en tête du bloc « Vocabulaire » (cache du prompt par liste).

## Réglages à créer (clé / défaut / libellé FR)
| clé | défaut | libellé |
|---|---|---|
| `cleaning.promptMode` | `'auto'` | Mode « prompt pour l'IA » : Auto (ChatGPT, Claude, Cursor, terminal) / Toujours / Jamais |
| `cleaning.toneByApp` | `true` | Adapter la forme à l'app (Slack détendu, Mail soigné) |
| `cleaning.frenchTypography` | `true` | Typographie française (espaces fines avant ; : ? !) |
| `cleaning.priorityVocabulary` | `[]` | Mots prioritaires (étoile dans le Dictionnaire) |
| `cleaning.replacements` | `[]` | Règles de remplacement (« asian » → « agent ») |
| `context.readBefore` | `true` | Lire le texte avant le curseur pour raccorder la dictée (≤ 300 car., envoyé au moteur IA avec la dictée) |
| `rewrite.presets` | `DEFAULT_PRESETS` | Raccourcis de réécriture (nom + consigne) |

## Points d'attention pour PIPE / UI
- Appeler `applyReplacements` n'est plus nécessaire côté pipeline : `cleanTranscript` le fait (LLM et repli). Pour une réécriture, passer `replacements` à `rewriteSelection`.
- Terminal/éditeurs : `profil` terminal/code supprime tout retour à la ligne non dicté, et la typographie française est coupée. `promptMode: 'on'` lève cette suppression (listes autorisées).
- Le ton par app ne change que la forme (pas de point final en messagerie pour 1–2 phrases, salutation/signature en mail), jamais le contenu.
- Bench : `cases-forme.jsonl` (26 cas, une règle chacun, champs `starts` et `offline` en plus). Aucun appel modèle réel n'a été fait ; le score réel (Gemini/Groq) reste à mesurer en vague 3, en surveillant les paragraphes ajoutés à tort (cas f08) et les listes numérotées.
