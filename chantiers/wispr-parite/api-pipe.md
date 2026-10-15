# API PIPE (b4, c3, c4, c6, c8, f1, f2/f3, f4, f6, m14)

tsc OK, test pur `src/main/snippets.test.ts` OK. Rien lancé en Electron. Binaire `dicta-context` à reconstruire (`scripts/build-fnwatch.sh`) : j'ai ajouté `before` (snapshot) et la commande `selected-text` dans scripts/context.swift.

## Fonctions exportées
- `recovery.ts` : `retry(id, {insert?})` (retranscrit l'audio gardé + renettoie, met l'historique à jour, retourne la `Dictation`), `pasteRaw(id?, {undoFirst?})` (version brute de la dernière dictée collée ; ⌘Z avant si `undoFirst` ou `paste.rawUndoFirst`), `recoverLast()` (dernière dictée annulée/échouée < 30 min, retranscrite si besoin, collée ; null sinon). Le Pipeline les enregistre seul (aucun câblage).
- `rewrite.ts` : `startRewrite()` (KEYS : à l'appui ; le relâchement appelle `pipeline.end()` comme une dictée ; false + alerte si rien de sélectionné), `runRewritePreset(id)` (f3, sans dicter), `getRewritePresets()/saveRewritePresets(list)`, `performRewrite()`. Charge `dist/llm/rewrite.js` (`rewriteSelection(selected, instruction, opts)`), absent à ce jour : erreur claire « module IA absent ».
- `history.ts` : `Dictation` enrichie `{id, status:'ok'|'cancelled'|'failed', audio, durationMs}` ; `getById, updateDictation, readAudio, audioPath, clearAudio()` (« Supprimer les enregistrements »), `purgeAudio()` (auto au démarrage + toutes les 6 h). `getRecent()` renvoie maintenant jusqu'à 50 entrées.
- `snippets.ts` : `loadSnippets, saveSnippets(list), parseSnippets, matchSnippet`. `learn.ts` : `vocabularyForNotes(): {vocabulary, replacements}` (prioritaires d'abord, ≤ 200) pour l'agent NOTES. `pipeline.pasteText(text, bundleId?)`, `pipeline.retry/pasteRaw/recoverLast`.
- Pipeline : `begin({rewrite?})`.

## IPC à brancher (main.ts, vérifier l'expéditeur comme les autres)
`history:retry` (id /^[a-z0-9]{6,32}$/, {insert?}) -> Dictation ; `history:pasteRaw` (id?) ; `history:recover` () ; `history:clearAudio` () ; `snippets:get/set` (set = tableau [{trigger<=80, text<=5000}], max 100) ; `rewrite:presets:get/set` ; `rewrite:run` (presetId). Raccourcis (KEYS) : coller la version brute -> `pasteRaw()`, réécriture -> `startRewrite()`, récupérer -> `recoverLast()`.

## Événements du Pipeline (pour la pastille / UI)
- `recoverable` `{id, status:'cancelled'|'failed', until}` : afficher « Dictée annulée · Récupérer » (5 s) -> `recoverLast()`.
- `alert` `{kind}` : `no-input` (« Aucun son du micro »), `limit-warn` `{remainingMs}` (« Il reste 1 min »), `interrupted` `{reason}` (« Micro déconnecté, texte conservé »), `no-selection`, `too-long`, `disabled`, `error` (+ `message`).
- `rewrite` `{selChars, outChars}`, `retried` `{id}`. Limite de durée : événement recorder `limit` `max` / `interrupted` => `end()` normal, texte gardé (ancien minuteur 5 min supprimé). Pause musique : gérée par recorder.ts/media.ts.

## Réglages (lus avec `settings.get(clé) ?? défaut`) — à déclarer dans settings.ts/UI
| Clé | Défaut | Libellé FR |
|---|---|---|
| `history.keepAudio` | true | Garder l'enregistrement de chaque dictée (14 jours, sur ce Mac) |
| `history.audioDays` | 14 | Durée de conservation des enregistrements (1 à 60 jours) |
| `paste.restoreDelayMs` | 250 | Délai de base avant de restaurer le presse-papiers (porté à 700 ms-4 s pour Slack, Teams, Word, Outlook, navigateurs, Bureau à distance) |
| `paste.restoreDelayOverrides` | [] | Délais par app (liste « bundleId=ms ») |
| `paste.rawUndoFirst` | false | Version brute : annuler (⌘Z) la dernière dictée avant de coller |
| `snippets.enabled` | true | Activer les snippets |
| `snippets.list` | "[]" | Snippets : chaîne JSON `[{trigger,text}]` (la clé doit avoir un point ; validateSetting limite à 20 000 car., d'où la chaîne JSON et pas un tableau d'objets) |
| `dictionary.replacements` | [] | Règles de remplacement : liste de chaînes « avant => après » (<= 500 car.) |
| `dictionary.priority` | [] | Mots prioritaires (en tête du prompt Whisper et du bloc vocabulaire LLM) ; ils doivent aussi être dans `cleaning.vocabulary` |
| `rewrite.enabled` | true | Réécrire la sélection à la voix |
| `rewrite.presets` | "[]" | Consignes de réécriture : chaîne JSON `[{id,name,instruction}]` |

## Comportements
- b4 : chaque dictée a son état ; relancer pendant le traitement ne perd rien, les collages restent dans l'ordre, un collage enchaîné reprend la sauvegarde d'origine du presse-papiers. Les statuts d'une dictée en arrière-plan ne masquent pas l'enregistrement en cours.
- c6 : Échap (enregistrement ou traitement) garde audio + texte partiel (`status:'cancelled'`) ; une erreur garde aussi l'audio (`'failed'`, bouton Réessayer).
- f1 : transcription brute égale au déclencheur -> pas d'appel IA (provider `snippet`) ; sinon texte nettoyé égal ou commençant par le déclencheur -> snippet + reste. Accents/ponctuation/casse ignorés.
- f4 : `replacements` + `priorityVocabulary` passés au router (format.ts), repli réseau compris. m14 : `context.before` (<= 300 car.) est dans le contexte passé à `clean()`.
- Vie privée : aucun texte journalisé (longueurs). Audios en 0600 dans ~/.dicta-ai/audio (dossier 0700), jamais chiffrés (la proposition parlait de chiffré : à trancher).
