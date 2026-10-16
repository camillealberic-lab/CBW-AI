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
