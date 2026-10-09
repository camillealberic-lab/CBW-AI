# Contrat — fenêtre principale « Dicta AI » (onboarding + hub)

Une seule fenêtre principale (`design/app/app.html`, ~85 % de l'écran, min 960×640, redimensionnable, titre caché, feux tricolores macOS intégrés — `titleBarStyle: 'hiddenInset'`).
- Premier lancement (ou `onboarding.done !== true`) : **onboarding** plein écran dans la fenêtre.
- Ensuite : **hub** (barre latérale : Accueil · Dictionnaire · Style · Réglages).
- L'app est visible dans le **Dock** (clic Dock → ouvre la fenêtre) ET garde l'icône de barre de menus + l'overlay pastille.

## Pont exposé par le preload : `window.dictaApp` (si absent → la page tourne en mode démo avec données factices)

```ts
interface Permissions {
  mic: 'granted' | 'denied' | 'not-determined' | 'restricted';
  accessibility: boolean;
  /** helper natif de la touche fn : 'ready' | 'no-access' (Accessibilité / Surveillance de l'entrée manquante → repli ⌥Espace) | 'unavailable' | 'off' (raccourci ≠ fn) */
  fnKey?: string;
}
interface ProviderStatus { id: 'gemini'|'groq'|'openrouter'|'ollama'; ui: 'available'|'missing_key'|'quota'|'offline'|'testing'; detail?: string }
interface Stats { words: number; dictations: number; wpm: number; streakDays: number; timeSavedMin: number;
  daily: { date: string; words: number; dictations: number; avgMs: number }[]; // 30 derniers jours
  byProvider: Record<string, number> } // dictées par moteur, 30 j
interface Dictation { raw: string; text: string; provider: string; model: string; at: string; ms: number }

window.dictaApp = {
  // ── permissions
  getPermissions(): Promise<Permissions>;
  requestMic(): Promise<boolean>;                 // déclenche la popup système
  openAccessibilitySettings(): Promise<void>;     // ouvre Réglages Système › Accessibilité (+ prompt système)
  onPermissions(cb: (p: Permissions) => void): void;   // poussé toutes les ~1 s tant que la fenêtre est ouverte
  repairAccessibility(): Promise<void>;           // tccutil reset (entrée périmée d'une ancienne signature) + nouvelle demande
  requestInputMonitoring(): Promise<boolean>;     // « Surveillance de l'entrée » pour la touche fn (ouvre les Réglages si refusé)
  // ── touche fn (raccourci par défaut 'Fn×2' : double appui = mains libres, maintien = push-to-talk, Échap annule)
  getFnUsage(): Promise<{ value: number | null; doNothing: boolean }>; // defaults com.apple.HIToolbox AppleFnUsageType (0 = Ne rien faire)
  setFnUsageNothing(): Promise<boolean>;          // « Appuyer sur 🌐 pour » → Ne rien faire (à confirmer dans l'UI avant l'appel)
  // ── config ('general.theme' = 'light' (défaut) | 'dark' | 'system' → la page reçoit ?theme=… ; mêmes clés que design/settings/NOTES.md, ex. 'providers.gemini.apiKey', 'cleaning.level', 'general.shortcut' = 'Fn×2' | 'Alt+Space' | accélérateur)
  getConfig(): Promise<Record<string, unknown>>;
  setConfig(key: string, value: unknown): Promise<void>;
  testProvider(id: string): Promise<{ ok: boolean; message: string; latencyMs?: number }>;
  providerStatuses(): Promise<ProviderStatus[]>;
  // ── local
  // Ollama est OPTIONNEL : non installé → installed:false, et providerStatuses() renvoie pour 'ollama'
  // { ui: 'offline', detail: 'Non installé (optionnel)', installed: false } — à afficher « Non installé » (gris), pas en erreur.
  ollamaStatus(): Promise<{ installed: boolean; running: boolean; model: string; modelPresent: boolean }>;
  pullOllamaModel(): Promise<void>;                     // progression via onOllamaProgress
  onOllamaProgress(cb: (p: { status: string; percent?: number }) => void): void;
  // ── Whisper (transcription locale). Premier lancement sans modèle dans ~/.dicta-ai/models : l'app télécharge
  //    automatiquement ggml-large-v3-turbo-q5_0.bin (~574 Mo, Hugging Face officiel whisper.cpp), reprise .part + Range,
  //    vérif taille + SHA-256, puis démarre whisper-server. Pendant ce temps une dictée affiche dans la pastille
  //    « Modèle de transcription en cours de téléchargement (NN %) ».
  whisperStatus(): Promise<{ ready: boolean; model: string; downloading?: boolean; percent?: number; error?: string }>;
  downloadWhisper(model?: 'large-v3-turbo' | 'small'): Promise<void>; // 'small' = ggml-small-q5_1 (~190 Mo) ; aussi 'base' | 'tiny' | 'medium'
  onWhisperProgress(cb: (p: { model: string; received: number; total: number; percent: number;
    state: 'downloading' | 'verifying' | 'done' | 'error'; error?: string }) => void): void; // ~4 événements/s
  // ── dictée (le raccourci global marche aussi dans la fenêtre : le texte est collé dans le champ focalisé)
  onStatus(cb: (s: { state: string; message?: string; level?: number; mode?: 'dictation' | 'note'; elapsedMs?: number }) => void): void;
  onDictation(cb: (d: Dictation) => void): void;       // à chaque dictée terminée
  getStats(): Promise<Stats>;
  getRecent(): Promise<Dictation[]>;                   // 20 dernières max (stockage local, effaçable)
  clearRecent(): Promise<void>;
  // ── divers
  finishOnboarding(): Promise<void>;                   // onboarding.done = true
  resetOnboarding(): Promise<void>;
  wipeAllData(opts?: { documents?: boolean; models?: boolean }): Promise<{ removed: string[] }>; // tout effacer puis relancer (voir « Confidentialité »)
  openExternal(url: string): Promise<void>;
  platform: { version: string };
}
```

## Étapes d'onboarding (inspirées du parcours Wispr Flow, identité Dicta AI)
1. **Bienvenue** — logo animé (5 barres), « Parle. Dicta écrit. », bouton Commencer.
2. **Micro** — explication + bouton « Autoriser le micro » → état vert quand `mic === 'granted'`.
3. **Accessibilité** — pourquoi (raccourci maintenu + collage auto), bouton « Ouvrir les Réglages », mini-illustration du toggle à activer, passe au vert automatiquement (`onPermissions`). Bouton « Plus tard » (mode dégradé presse-papiers).
4. **Raccourci** — visuel des touches ⌥ + Espace, « Maintiens pour parler, relâche pour coller », possibilité de changer (`general.shortcut`).
5. **Moteur IA** — choix : « 100 % local (gratuit, privé) » [Ollama : statut, bouton Télécharger le modèle avec progression] et/ou « Cloud gratuit » [champs clé Gemini / Groq / OpenRouter + lien « Obtenir une clé » + Tester]. Passable.
6. **Essai** — champ texte focalisé, consigne « Maintiens ⌥ Espace et dis : “Euh je veux trois boutons, enfin non quatre” », affiche la pastille d'état live, puis brut vs nettoyé quand `onDictation` arrive. 🎉
7. **C'est prêt** — récap, « Dicta reste dans ta barre de menus », bouton Ouvrir Dicta.

## Hub
- **Accueil** : salutation, stats (mots dictés, minutes gagnées, série de jours, wpm), carte « Dernières dictées » (brut ↔ propre, copier), statut moteur (fournisseur actif, quotas).
- **Dictionnaire** : vocabulaire perso (`cleaning.vocabulary`), ajout/suppression de termes.
- **Style** : niveau Léger / Standard avec exemple avant/après.
- **Réglages** : réutilise les sections de design/settings/settings.html (raccourci, insertion, fournisseurs + clés, Whisper, quotas, démarrage à la connexion), + « Revoir l'onboarding ».

## Mode « Prise de notes » (sessions longues, 10–15 min et plus)

Lancement : bouton « Nouvelle note » (hub › Notes, et Accueil), menu de la barre de menus « Prise de notes », ou **Control gauche ×3** (triple appui).
Arrêt : bouton « Terminer » dans la fenêtre, menu, ou **un appui sur Control gauche** ; Échap = annuler (confirmation dans l'UI si > 30 s).
Pendant la session, la pastille affiche « NOTE · 12:34 » (minuteur) + niveau micro ; rien n'est collé.
La transcription se fait au fil de l'eau (segments Whisper aux pauses), puis `organizeNotes()` (src/llm/notes.ts) produit la note Markdown.
Fichiers : `~/Documents/CBW AI/Notes/AAAA-MM-JJ HHhMM — <titre>.md` (note) ; transcription brute dans `~/.dicta-ai/notes/<id>.txt` ; index `~/.dicta-ai/notes/index.json`.

```ts
interface NoteMeta { id: string; title: string; createdAt: string; durationMs: number; words: number; path: string; provider: string }
interface NoteProgress { state: 'recording' | 'paused' | 'transcribing' | 'organizing' | 'done' | 'error'; elapsedMs: number; words: number; step?: number; total?: number; message?: string; noteId?: string }
window.dictaApp += {
  startNote(): Promise<void>;
  pauseNote(): Promise<void>;  resumeNote(): Promise<void>;
  stopNote(): Promise<void>;          // → transcribing → organizing → done (noteId)
  cancelNote(): Promise<void>;
  onNoteProgress(cb: (p: NoteProgress) => void): void;
  listNotes(): Promise<NoteMeta[]>;
  getNote(id: string): Promise<{ meta: NoteMeta; markdown: string; transcript: string }>;
  reorganizeNote(id: string): Promise<void>;   // relance l'organisation depuis la transcription brute
  deleteNote(id: string): Promise<void>;
  revealNote(id: string): Promise<void>;       // affiche dans le Finder
  copyNote(id: string): Promise<void>;         // Markdown dans le presse-papiers
}
```

Implémentation (src/main/notes.ts) : pendant la note, la pastille reçoit `{ state: 'recording', mode: 'note', message: 'NOTE · mm:ss' | 'NOTE · PAUSE mm:ss', elapsedMs, level }` (≥ 1×/s), puis `transcribing` / `cleaning` (« Note · organisation… ») et `done` (« Note prête : <titre> »). Pas de limite de durée (la dictée garde sa limite de 5 min) ; l'audio déjà transcrit est libéré au fil de l'eau (mémoire constante). Sans moteur IA disponible, la note est enregistrée avec la transcription brute (`provider: 'passthrough'`) et `NoteProgress.message` l'indique ; « Réorganiser » la reprend plus tard. Une transcription orpheline (plantage) est récupérée au démarrage suivant en « Note récupérée du … ».
Notification macOS « Note prête » → clic : ouvre la fenêtre sur `#notes:<id>` et émet `dicta:navigate` avec `detail: 'notes'` (l'id est dans `location.hash`).

## Mode « Brainstorm → master prompt » (CRAFT+, cible Claude Code / Cursor)

Parcours : 1) **vidage libre** à la voix (même enregistrement que les notes, rien n'est collé) → 2) **analyse** : l'IA remplit les cases CRAFT+ et pose 3 à 6 questions, chacune avec 0–3 suggestions cliquables → 3) l'utilisateur répond (champ texte ; la dictée Control gauche ×2 colle dedans car la fenêtre est au premier plan ; ou clic sur une suggestion ; ou « Passer ») → 4) **compilation** du master prompt (Markdown) → copier / enregistrer.
Lancement : section « Brainstorm » de la barre latérale, 3e bouton « Brainstorm » de la pastille au survol (ouvre la fenêtre sur #brainstorm et démarre le vidage).
Fichiers : `~/Documents/CBW AI/Prompts/AAAA-MM-JJ HHhMM — <titre>.md` ; sessions dans `~/.dicta-ai/brainstorms/<id>.json`.

```ts
type SlotKey = 'contexte' | 'role' | 'action' | 'format' | 'cible' | 'contraintes' | 'criteres' | 'exemples';
interface Slot { value: string; status: 'vide' | 'partiel' | 'ok'; evidence?: string }
interface BQuestion { id: string; slot: SlotKey; question: string; why: string; suggestions: string[] }
interface Brainstorm { id: string; title: string; createdAt: string; target: 'claude-code' | 'cursor';
  state: 'recording' | 'analyzing' | 'questions' | 'compiling' | 'done' | 'error';
  transcript: string; slots: Record<SlotKey, Slot>; questions: BQuestion[]; answers: Record<string, string>;
  prompt?: string; path?: string; message?: string }
window.dictaApp += {
  startBrainstorm(target?: 'claude-code'|'cursor'): Promise<void>;   // démarre le vidage (comme startNote)
  stopBrainstorm(): Promise<void>;                                   // fin du vidage → analyse
  cancelBrainstorm(): Promise<void>;
  onBrainstorm(cb: (b: Brainstorm) => void): void;                   // état complet poussé à chaque étape (+ timer via onNoteProgress-like {elapsedMs, words, level})
  answerBrainstorm(id: string, questionId: string, answer: string): Promise<void>;  // '' = passer
  askMore(id: string): Promise<void>;                                // re-analyse avec les réponses → nouvelles questions si cases floues (max 6 au total)
  compileBrainstorm(id: string, target?: 'claude-code'|'cursor'): Promise<void>;
  listBrainstorms(): Promise<{ id: string; title: string; createdAt: string; state: string }[]>;
  getBrainstorm(id: string): Promise<Brainstorm>;
  copyBrainstormPrompt(id: string): Promise<void>;
  deleteBrainstorm(id: string): Promise<void>;
}
```
LLM : `src/llm/brainstorm.ts` → `analyzeBrainstorm(transcript, prior?)` et `compileMasterPrompt(state, target)` (orchestrateur).

## Notes v2 — compte rendu exhaustif + qui a dit quoi

**Audio** : deux sources quand c'est possible — micro (toujours) + **son du Mac** (visios / appels sur le Mac, via la capture audio système macOS, permission « Enregistrement de l'écran et audio système » demandée au 1er usage, désactivable). Le WAV complet de la session est conservé pendant l'organisation (`~/.dicta-ai/notes/<id>.wav`), puis supprimé (option « garder l'audio »).
**Séparation des voix** (locale, gratuite) : diarisation sherpa-onnx (segmentation pyannote + empreintes vocales) sur l'audio complet à la fin → tours de parole ; chaque segment Whisper (horodaté) reçoit le locuteur qui le recouvre le plus. Locuteurs nommés `Personne 1…n` (ton micro seul = « Moi » quand les deux pistes existent).
**Transcription transmise à l'organisation** (format fixe, une ligne par tour) :
`[mm:ss] Personne 2 : texte…`
**Note** (Markdown, sections H2 fixes, omises si vides) :
`# Titre` · `## En bref` · `## Participants` · `## Sujets abordés` (### un sous-titre par sujet, tous les points, attribution « — Personne 2 ») · `## Décisions` · `## Actions` (`- [ ] Personne 1 — action — échéance si dite`) · `## Questions ouvertes` · `## Par personne` (### Personne n : positions, propositions, engagements) · `## Chronologie` (`- mm:ss — sujet`)
**Bridge ajouté** : `renameSpeaker(noteId, from, to)` (remplace dans la note + transcription), `getNote(id)` renvoie aussi `segments: {startMs, endMs, speaker, text}[]` quand disponibles. Réglage `notes.systemAudio` (bool, défaut true), `notes.diarization` (bool, défaut true), `notes.keepAudio` (bool, défaut false).

## Brainstorm v2 — conversation en direct (bulles en bas à droite)

Pendant le vidage, à **chaque pause de parole** (segment Whisper validé) et dès qu'il y a ≥ 12 mots nouveaux non analysés (un seul appel à la fois ; sinon on accumule), le main appelle `liveBrainstorm({ target, slots, open, asked, said, fresh, maxNew: 3 - open.length (≥0, max 3 bulles visibles) })` (src/llm/brainstorm.ts, exporté dans le bundle router).
Effets : la grille se met à jour ; les questions « resolved » passent à `answered` (réponse = celle de l'IA, éditable) ; les nouvelles questions sont ajoutées (`state: 'open'`, id `q1…`).
`Brainstorm` gagne : `live: { id: string; slot: SlotKey; question: string; suggestions: string[]; state: 'open' | 'answered' | 'dismissed'; answer?: string; askedAt: number }[]`.
Bridge ajouté : `answerLive(id, questionId, answer)` (clic sur une suggestion ou réponse tapée), `dismissLive(id, questionId)`.
À l'arrêt : plus d'écran de questions obligatoire → compilation directe du master prompt avec toutes les Q/R (`answered` + réponses de la grille) ; les questions encore ouvertes deviennent « À clarifier ». (L'ancien flux questions reste accessible via « Encore une question ».)
**Bulles** : fenêtre flottante dédiée (panneau macOS non activable, toujours au-dessus, tous les bureaux) en **bas à droite** de l'écran actif, au-dessus du Dock ; visible seulement pendant un brainstorm ; 3 cartes max empilées (question, 0–3 suggestions cliquables, ×), animation d'entrée (glisse depuis la droite + fondu, 240 ms), une carte répondue se coche en vert puis s'efface (800 ms) ; rien ne vole le focus de l'app active. Preload `window.cbwBubbles = { onState(cb), answer(qid, text), dismiss(qid) }`.

## Confidentialité — « Supprimer toutes mes données » (src/main/privacy.ts › wipeAllUserData)

`wipeAllData(opts?: { documents?: boolean; models?: boolean }): Promise<{ removed: string[] }>` — efface clés API (+ élément « CBW AI Safe Storage » du trousseau), réglages, historique, compteurs, notes et brainstorms internes, audio, journaux, profil Chromium ; `documents: true` supprime aussi `~/Documents/CBW AI` (notes et prompts exportés), `models: true` les modèles téléchargés (≈ 600 Mo). Seul `true` strict active une option (défaut : conservés). L'app se relance ≈ 300 ms après la réponse et repart sur l'onboarding : afficher « Suppression… » puis ne plus rien appeler.
UI (docs/SECURITY.md › 8) : Réglages › Confidentialité, bouton rouge « Supprimer toutes mes données… » → dialogue listant ce qui sera effacé, deux cases décochées (Documents, modèles), bouton « Tout supprimer » actif après saisie de « SUPPRIMER ».

Tous les canaux `app:*` vérifient l'émetteur (cadre principal d'une page de l'app dans la fenêtre principale) ; `testProvider(id)` n'accepte que `gemini | groq | zai | mistral | cloudflare | openrouter | ollama` (sinon `{ ok: false, message: 'Fournisseur inconnu' }`) ; `revealBrainstorm` n'ouvre que des fichiers `.md` de `~/Documents/CBW AI/Prompts`.

## Mises à jour (src/main/updater.ts)

Sans Developer ID : l'app lit `https://github.com/<package.json › cbw.repo>/releases/latest/download/latest.json` 30 s après le lancement puis toutes les 6 h (si `updates.auto`, bool, défaut true), télécharge le zip dans `~/.dicta-ai/updates` (reprise, SHA-256), vérifie d'abord la signature Ed25519 de `latest.json` (`src/main/updateVerify.ts`, URL GitHub uniquement ; sinon `error`), le décompresse et vérifie signature + bundle id + exigence désignée, puis notifie (menu barre de menus + notification macOS « Mise à jour prête — redémarre CBW AI »). Installation au clic « Redémarrer pour mettre à jour » ou au prochain Quitter. Tant que `cbw.repo` vaut `OWNER/…`, l'updater est `disabled`.
**Bridge** :
- `getVersion(): Promise<string>` (aussi `platform.version`, synchrone)
- `getUpdateStatus(): Promise<UpdateStatus>` — état courant (à lire à l'ouverture de Réglages)
- `checkForUpdates(): Promise<UpdateStatus>` — bouton « Vérifier les mises à jour »
- `installUpdate(): Promise<{ ok: boolean; message?: string }>` — bouton « Redémarrer pour mettre à jour » (refusé pendant une note / un brainstorm / une dictée : afficher `message`) ; l'app quitte puis se relance sur la nouvelle version
- `onUpdate(cb)` — `cb(UpdateStatus)` à chaque changement (progression du téléchargement incluse)

`UpdateStatus = { state: 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'installing' | 'error'; current: string; version?: string; notes?: string /* Markdown */; percent?: number /* 0–100 */; message?: string }`.
UI suggérée (Réglages › Général) : « Version 1.0.42 » + bouton « Vérifier les mises à jour » ; si `ready` : carte « Version X prête » + notes + bouton primaire « Redémarrer pour mettre à jour » ; interrupteur « Mises à jour automatiques » (`setConfig('updates.auto', bool)`). Un clic sur la notification ouvre `#reglages`.
