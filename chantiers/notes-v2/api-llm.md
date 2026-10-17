# API LLM — notes v2 (agent LLM)
Fichiers : `src/llm/notes.ts`, `templates.ts`, `ask.ts`, `router.ts` (ajout `routeLong`), `providers/{common,groq,gemini}.ts`. Tests purs : `src/llm/notes.test.ts`.
Tous les appels passent par `routeLong()` (router.ts) : mêmes fournisseurs, quotas, pauses et clés que la dictée, mais séquentiel (pas de course hedgée), délais longs, streaming. Aucun texte de réunion dans les journaux.

## 1. `organizeNotes(transcript, opts)` (src/llm/notes.ts)
- `transcript` : `string` « [mm:ss] Personne 2 : texte » (format actuel de `speakerTranscript`, inchangé) **ou** `NoteSegment[]` `{start: secondes, speaker, text}`.
- `opts` : `signal`, `onProgress(step,total)`, **`onDelta(annotatedSoFar)`**, **`userNotes`** (OPTIONNEL, absent par défaut : plus de carnet ; si fourni, jamais supprimé), **`template`** (id, défaut `auto`), `title` (événement calendrier), `participants[]` (orthographe seulement), `vocabulary[]`.
- Un seul appel jusqu'à 14 000 mots (≈ 1 h 40 de parole) ; au-delà : parties de 7 000 mots + fusion (le streaming ne porte alors que sur la fusion). Sortie max 7 000 tokens (≈ 0,4 × mots + 1 500).
- Retour `NotesResult` : `markdown` (SANS balises : fichier .md, comme avant), **`annotated`** (avec balises, à stocker), **`lines`** (annotated déjà découpé pour l'UI), `title`, `provider`, `model`, `parts`, `latencyMs`, `templateId` (demandé, `auto` par défaut), **`kind`** (genre reconnu : `reunion|brainstorm|cours|collegues|client|recrutement`), `userNotesRecovered`.
- `onDelta` reçoit le texte balisé **cumulé** (remplacer l'affichage à chaque appel, passer à `parseAnnotated`). `''` = le fournisseur change (repartir de zéro). Ollama ne streame pas (un seul delta final).
- Échec total : l'exception habituelle (le caller garde la transcription brute et propose « Réessayer l'organisation »).

## 2. Format balisé (choix : balises en ligne, une ligne = une unité)
- Texte **sans balise = texte de l'utilisateur** (noir). Ajout de l'IA = `[[ia]]texte[[/ia]]` (gris), sur UNE seule ligne. **CHANGEMENT (16 oct.) : plus aucune heure émise** ; la loupe/`refs` n'existe plus pour le résumé (les heures restent dans l'onglet Transcription). `parseAnnotated` accepte encore l'ancien `[[ia mm:ss]]` (notes déjà stockées) mais ignore l'heure : `spans[].refs` est toujours `[]`. `normalizeAnnotated` réécrit en `[[ia]]`. UI : gris seul, ne pas afficher de loupe ni d'heure dans la marge du résumé.
- Le marqueur de liste reste hors balise : `- [ ] [[ia]]**Marc** : livrer le devis (vendredi)[[/ia]]`. Les lignes `#` (titres) ne sont jamais balisées ni grisées.
- Notes de l'utilisateur : jamais supprimées ni reformulées (le prompt l'exige, **et** `enforceUserNotes` remet sous `## Mes notes` toute ligne oubliée ; un span IA identique à une ligne de l'utilisateur redevient « utilisateur »).
- Helpers : `parseAnnotated(md): NoteLine[]` (tolère balises non fermées/orphelines/partielles, utilisable sur le flux), `stripMarkers(md)`, `normalizeAnnotated`, `enforceUserNotes`, `parseTranscript`, `formatSegments`.
- `NoteLine = {kind:'heading'|'blank'|'text', level?, prefix, spans: {kind:'user'|'ia', text, refs:{t:secondes,label:'mm:ss'}[]}[]}`.

## 3. Gabarits (src/llm/templates.ts) — v5 « résumé rédigé »
Forme unique pour `auto` et tous les gabarits : (1) 1 à 2 paragraphes généraux (sans titre) couvrant toutes les décisions et conclusions ; (2) un `## thème` par sujet en prose (aucune puce, jamais chronologique, aucune expression de temps ni horodatage) ; (3) UNE seule liste finale `## Prochaines étapes` : `- [ ] [[ia]]**Prénom** : verbe + objet (échéance)[[/ia]]`, groupées par personne, jamais inventées (`**À attribuer**`), omise si aucune tâche. Encadré `> **À retenir**` + `> - …` et citation `> « … » (Prénom)` : rares. Le genre adapte les thèmes (`KIND_PLANS`), pas la forme.
`auto` (défaut) : le modèle écrit en 1re ligne `[[genre:X]]` (retirée du texte et du flux `onDelta`, lue dans `kind` ; repli `guessKind`), X = `reunion|brainstorm|cours|collegues|client|recrutement`. Autres gabarits (`equipe`, `un-a-un`, `client`, `recrutement`, `atelier`, `cours`) : liste de thèmes imposés, même forme. `listTemplates()`, `getTemplate`, `guessTemplate`, `guessKind`, `kindOfTemplate`.
UI : `parseAnnotated` gère les lignes `> ` (préfixe hors balise) : encadré/citation. Longues sessions (> 14 000 mots) : parties puis fusion, genre deviné par `guessKind`.
**Changer après coup** = rappeler `organizeNotes(mêmeTranscription, {template: autreId})` ; stocker `templateId` et `kind` avec la note.

## 4. `askNotes(question, notes[], opts)` (src/llm/ask.ts)
- `notes[]` : `{id, title, date?, segments? | transcript?, summary?}` (une ou plusieurs réunions ; `summary` = `annotated` conseillé, l'horodatage des extraits ne vient plus que de la transcription).
- Sélection avant l'appel : fenêtres de ~110 mots + sections du compte rendu, score par mots-clés (sans accents, racines, mots rares pondérés), meilleur passage de chaque réunion d'abord, budget `maxContextTokens` (défaut 6 000 ≈ quota Groq gratuit). Question « décisions/actions/résumé » : compte rendu favorisé.
- `opts` : `signal`, `onDelta(réponseCumulée)`, `maxContextTokens`, `history[]` (questions de suivi, 6 max).
- Retour : `answer` (Markdown, sources en `[S1]`, `[S2, S4]` ; références inconnues retirées), `citations[]` `{ref, noteId, title, t (s)|null, label 'mm:ss'|null, source:'transcript'|'summary', quote}`, `passages`, `provider`, `model`, `latencyMs`. Clic sur `[Sk]` → ouvrir la note `noteId` à `t`.
- Sans passage exploitable : « Je ne trouve pas ça dans tes réunions. » sans appel.

## 5. Groq (dictée comprise, prompt de dictée inchangé)
gpt-oss raisonne même à `low` et mange `max_completion_tokens` → réponse vide. Maintenant : `reasoning_effort: low` + `include_reasoning: false` + marge 1 024 tokens (au lieu de 512), un réessai à 3 072 si la réponse sort vide/tronquée, puis modèle Groq suivant. Quota estimé avec la nouvelle marge.

## 6. Branchement (agent CORE/UI)
- `src/main/cleaner.ts` (hors zone LLM) : élargir le type `OrganizeFn` (transcript `string|segments`, `opts` ci-dessus, retour `NotesResult`) ; `scripts/build.mjs` exporte seulement `organizeNotes` : ajouter `export { askNotes } from './src/llm/ask.ts'; export { listTemplates } from './src/llm/templates.ts'; export { parseAnnotated, stripMarkers } from './src/llm/notes.ts'` au bundle router.
- IPC à créer : `notes:organize` (progress + deltas), `notes:regenerate {id, template}`, `notes:ask {question, noteIds}` (+ deltas). Stocker `annotated`, `templateId`, `userNotes` dans le JSON de la note ; écrire `markdown` dans le .md.

## 7. Prompt v5 (`notes-v5.0`, 16 oct., audit-notes §4) — déjà actif dans `organizeNotes`
- Entrée **sans heures** (`noClock` retire `[mm:ss]` de chaque tour avant l'envoi ; la transcription stockée garde ses heures).
- DÉCISION (accord explicite) ≠ PISTE (« X propose », « l'équipe envisage ») ≠ QUESTION OUVERTE. Dates/échéances **dites** gardées, chronologie de réunion interdite.
- Prochaines étapes : seulement les actions dites/acceptées ; responsable = prénom dit (une voix « Personne N » interpellée par son prénom = ce prénom) ; jamais `**Personne N**` → `**À attribuer**`.
- Gabarits : plus de rubriques « Décisions », « Décision et suite », « Questions et réponses ». `[[genre:X]]` lu dans les 3 premières lignes et retiré partout. `guessKind` n'utilise plus le nombre de voix (`speakers = 0` = inconnu). Parties de longues sessions acceptées sans titre.

## 8. Pipeline qualité (`src/llm/notesPipeline.ts`) — à brancher par l'agent CORE/UI
`organizeNotesQuality(transcript, opts): Promise<QualityResult>` : **remplaçant direct** d'`organizeNotes` (même entrée, mêmes options, même résultat + champs ci-dessous). Étapes :
1. **relecture** (`reviewTranscript`) : noms (dictionnaire `vocabulary`, `participants`), termes, ponctuation ; blocs de 1 500 mots, 3 en parallèle (Gemini d'abord). Garde-fous sans IA : mêmes lignes, même locuteur, < 15 % de mots nouveaux (mots du dictionnaire exclus), aucune ligne raccourcie de plus de 30 % ; sinon bloc/ligne d'origine. Heures et locuteurs jamais modifiés.
2. **analyse** (`analyzeTranscript`) : JSON (genre, titre, participants, thèmes → points `decision|piste|question|fait` avec phrase source, étapes `qui/quoi/echeance/source`, citations). Contrôle local (`normalizeAnalysis`) : étape sans appui dans la transcription retirée, citation non retrouvée retirée, décision sans appui → piste, `Personne N` responsable → `À attribuer`.
3. **rédaction** : prompt v5 + `<analyse>` (rendu compact), **streaming `onDelta` inchangé** (texte balisé cumulé, `''` = repartir de zéro).
4. **vérification** : contrôles locaux (`localChecks` : heure, chronologie, puce hors « Prochaines étapes », étapes pas en dernier, `Personne N`, étape sans appui, responsable jamais nommé) + contrôleur LLM (`verifyNotes` : inventions, oublis, statut faux, heures ; extraits introuvables ignorés) → **une** correction ciblée si besoin, acceptée seulement si `correctionOk` (longueur 60–160 %, thèmes ±1, forme intacte, pas plus de problèmes). Puis `onDelta(versionFinale)` une fois si la note a changé.

Options en plus d'`OrganizeOptions` :
- `steps` : `{ review?, analysis?, verify?, correct? }` — défauts : `review` = true si Gemini est utilisable (sinon false, quota Groq trop juste), les autres true. `steps: {review:false, analysis:false, verify:false}` = `organizeNotes` v5 seul.
- `budgetMs` : défaut `45 s + 12 s / 1 000 mots` (max 180 s). Chaque étape est bornée (`stageTimeouts`) et coupée au-delà du budget ; l'analyse est sautée si 45 % du budget est déjà consommé, la vérification si 80 %.
- `onStage({name, status, ms?, detail?})` : `name` = `relecture|analyse|redaction|verification|correction`, `status` = `start|done|skipped|failed` ; `detail` ne contient que des nombres (journalisable). Pour l'affichage « Transcription · Voix · Relecture · Résumé » : `relecture` → Relecture ; `analyse`, `redaction`, `verification`, `correction` → Résumé. `onProgress(step, total)` reste appelé.

Retour en plus de `NotesResult` : `reviewedTranscript` / `reviewedSegments` (à stocker **à côté** de l'original : recherche, « voir le texte brut »), `analysis`, `pipeline = { version, stages[], fallback, review: {blocks, accepted, rejected, failed, changedLines, latencyMs}, verification: {inventions, oublis, statutFaux, heures, local, corrected}, totalMs }`. Journal : uniquement ces nombres.

Replis : relecture/vérification/correction en échec ou hors délai → étape sautée (`fallback: true`), la note reste celle d'avant ; analyse en échec → rédaction simple v5 (`organizeNotes`) ; > 14 000 mots → relecture puis parties + fusion (`organizeNotes`), sans analyse ; échec de la rédaction elle-même → exception habituelle (le caller garde la transcription brute). Abandon (`signal`) → remonte toujours.

Mesure réelle (16 oct., Gemini seul, `bench/notes-quality-try.ts`, textes fictifs de ~270 mots, Gemini sous charge avec des 503) : 28 à 44 s au total, premier texte affiché à 17–34 s (chaque appel ~8–9 s quel que soit le volume). Sur 12 min, prévoir ~40–60 s ; si c'est trop, couper `review` d'abord (−8 s).

Branchement (agent CORE, `src/main/notes.ts`) : remplacer l'appel `organizeNotes(...)` par `organizeNotesQuality(...)` avec les mêmes options + `onStage` → étapes visibles ; exporter `organizeNotesQuality` (et `reviewTranscript` si la relecture doit tourner seule) dans le bundle router (`scripts/build.mjs`). Pas de nouveau réglage obligatoire ; réglage possible `notes.quality` (défaut true, libellé « Résumé vérifié (plus lent, plus fiable) ») → `steps: {review:false, analysis:false, verify:false}` quand false.
