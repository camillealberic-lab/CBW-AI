# Contrat — fenêtre principale « Dicta AI » (onboarding + hub)

Une seule fenêtre principale (`design/app/app.html`, ~85 % de l'écran, min 960×640, redimensionnable, titre caché, feux tricolores macOS intégrés — `titleBarStyle: 'hiddenInset'`).
- Premier lancement (ou `onboarding.done !== true`) : **onboarding** plein écran dans la fenêtre.
- Ensuite : **hub** (barre latérale : Accueil · Dictionnaire · Style · Réglages).
- L'app est visible dans le **Dock** (clic Dock → ouvre la fenêtre) ET garde l'icône de barre de menus + l'overlay pastille.
- Pastille (overlay) : déplaçable au glisser (`window.dicta.drag('start'|'end')`, la fenêtre suit le curseur côté main) ; position mémorisée dans le réglage `overlay.position` = « idÉcran:x:y » (relatif à l'écran) ; `''` = place par défaut (bas de l'écran, au-dessus du Dock s'il est visible) — bouton Réglages › Général › « Remettre en bas ».

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
- **Dictionnaire** : vocabulaire perso (`cleaning.vocabulary`), ajout/suppression de termes. Les termes appris des corrections (`dictionary.learned`, sous-ensemble de `cleaning.vocabulary`) portent la marque « appris » ; retirer un terme le retire aussi de `dictionary.learned`. Max 200 termes : les plus anciens appris sont retirés d'abord.
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

## Notes v2 — compte rendu exhaustif + qui a dit quoi

**Audio** : deux sources quand c'est possible — micro (toujours) + **son du Mac** (visios / appels sur le Mac, via la capture audio système macOS, permission « Enregistrement de l'écran et audio système » demandée au 1er usage, désactivable). Le WAV complet de la session est conservé pendant l'organisation (`~/.dicta-ai/notes/<id>.wav`), puis supprimé (option « garder l'audio »).
**Séparation des voix** (locale, gratuite) : diarisation sherpa-onnx (segmentation pyannote + empreintes vocales) sur l'audio complet à la fin → tours de parole ; chaque segment Whisper (horodaté) reçoit le locuteur qui le recouvre le plus. Locuteurs nommés `Personne 1…n` (ton micro seul = « Moi » quand les deux pistes existent).
**Transcription transmise à l'organisation** (format fixe, une ligne par tour) :
`[mm:ss] Personne 2 : texte…`
**Note** (Markdown, sections H2 fixes, omises si vides) :
`# Titre` · `## En bref` · `## Participants` · `## Sujets abordés` (### un sous-titre par sujet, tous les points, attribution « — Personne 2 ») · `## Décisions` · `## Actions` (`- [ ] Personne 1 — action — échéance si dite`) · `## Questions ouvertes` · `## Par personne` (### Personne n : positions, propositions, engagements) · `## Chronologie` (`- mm:ss — sujet`)
**Bridge ajouté** : `renameSpeaker(noteId, from, to)` (remplace dans la note + transcription), `getNote(id)` renvoie aussi `segments: {startMs, endMs, speaker, text}[]` quand disponibles. Réglage `notes.systemAudio` (bool, défaut true), `notes.diarization` (bool, défaut true), `notes.keepAudio` (bool, défaut false).

## Confidentialité — « Supprimer toutes mes données » (src/main/privacy.ts › wipeAllUserData)

`wipeAllData(opts?: { documents?: boolean; models?: boolean }): Promise<{ removed: string[] }>` — efface clés API (+ élément « CBW AI Safe Storage » du trousseau), réglages, historique, compteurs, notes internes, audio, journaux, profil Chromium ; `documents: true` supprime aussi `~/Documents/CBW AI` (notes exportées), `models: true` les modèles téléchargés (≈ 600 Mo). Seul `true` strict active une option (défaut : conservés). L'app se relance ≈ 300 ms après la réponse et repart sur l'onboarding : afficher « Suppression… » puis ne plus rien appeler.
UI (docs/SECURITY.md › 8) : Réglages › Confidentialité, bouton rouge « Supprimer toutes mes données… » → dialogue listant ce qui sera effacé, deux cases décochées (Documents, modèles), bouton « Tout supprimer » actif après saisie de « SUPPRIMER ».

Tous les canaux `app:*` vérifient l'émetteur (cadre principal d'une page de l'app dans la fenêtre principale) ; `testProvider(id)` n'accepte que `gemini | groq | zai | openrouter | ollama` (sinon `{ ok: false, message: 'Fournisseur inconnu' }`).

## Mises à jour (src/main/updater.ts)

Sans Developer ID : l'app lit `https://github.com/<package.json › cbw.repo>/releases/latest/download/latest.json` 30 s après le lancement puis toutes les 6 h (si `updates.auto`, bool, défaut true), télécharge le zip dans `~/.dicta-ai/updates` (reprise, SHA-256), vérifie d'abord la signature Ed25519 de `latest.json` (`src/main/updateVerify.ts`, URL GitHub uniquement ; sinon `error`), le décompresse et vérifie signature + bundle id + exigence désignée, puis notifie (menu barre de menus + notification macOS « Mise à jour prête — redémarre CBW AI »). Installation au clic « Redémarrer pour mettre à jour » ou au prochain Quitter. Tant que `cbw.repo` vaut `OWNER/…`, l'updater est `disabled`.
**Bridge** :
- `getVersion(): Promise<string>` (aussi `platform.version`, synchrone)
- `getUpdateStatus(): Promise<UpdateStatus>` — état courant (à lire à l'ouverture de Réglages)
- `checkForUpdates(): Promise<UpdateStatus>` — bouton « Vérifier les mises à jour »
- `installUpdate(): Promise<{ ok: boolean; message?: string }>` — bouton « Redémarrer pour mettre à jour » (refusé pendant une note / une dictée : afficher `message`) ; l'app quitte puis se relance sur la nouvelle version
- `onUpdate(cb)` — `cb(UpdateStatus)` à chaque changement (progression du téléchargement incluse)
- `onConfigChanged(cb)` — `cb({ key, value })` quand `cleaning.vocabulary` ou `dictionary.learned` change côté main (terme appris d'une correction, src/main/learn.ts) ; l'UI rafraîchit la page Dictionnaire.
- `onFullscreen(cb)` — `cb(boolean)` à l'entrée / sortie du plein écran macOS (et au chargement) ; l'UI pose `html.fs`

`UpdateStatus = { state: 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'installing' | 'error'; current: string; version?: string; notes?: string /* Markdown */; percent?: number /* 0–100 */; message?: string }`.
UI suggérée (Réglages › Général) : « Version 1.0.42 » + bouton « Vérifier les mises à jour » ; si `ready` : carte « Version X prête » + notes + bouton primaire « Redémarrer pour mettre à jour » ; interrupteur « Mises à jour automatiques » (`setConfig('updates.auto', bool)`). Un clic sur la notification ouvre `#reglages`.

## Contexte de l'app active et dictionnaire appris (Réglages › Confidentialité)
- `context.enabled` (défaut `true`) — « Lire l'app active pour orthographier les noms » : au début de chaque dictée, le helper `dicta-context` (scripts/context.swift, Accessibilité, sans capture d'écran) renvoie app, bundleId, domaine du site (navigateurs) et le texte autour du curseur / visible (borné à ≤ 150 ms). `src/main/context.ts` en extrait localement ≤ 40 noms ; le texte brut ne quitte jamais le process et n'est jamais journalisé (le log ne contient que des comptes). Passé à `clean()` via `CleanOptions.context` et ajouté au prompt Whisper (« Noms : … », vocabulaire d'abord, ≤ ~450 car.). Si `false` : aucun appel au helper.
- Exclusions : gestionnaires de mots de passe (1Password, Bitwarden, Keychain Access, Mots de passe, KeePassXC…), champs sécurisés (`AXSecureTextField`), et les bundle ids listés dans `context.excludedApps` (tableau de chaînes, sans interface pour l'instant).
- `dictionary.autoLearn` (défaut `true`) — « Apprendre de mes corrections » : après un collage, relecture du champ (dans les 45 s ou à la dictée suivante) via `dicta-context`, diff mot à mot, `validateLearnedTerm` (src/llm/learn.ts) ; un terme accepté est ajouté à `cleaning.vocabulary` et à `dictionary.learned`, avec une notification « Ajouté au dictionnaire : X ». Si `false` : aucun appel au helper pour ce besoin.
- Protocole du helper (JSON, une ligne par message, process persistant) : requête `{"id":1,"cmd":"snapshot"|"focused-value","budgetMs":150,"exclude":[…]}` ; réponse `{"id":1,"ok":true,"app","bundleId","pid","url","title","focused","visible","secure","excluded","ms"}` ou `{"ok":false,"error":"no-access"|"no-app"}`.

## Parité Wispr (v1.1) — hub, réglages, raccourcis d'action

Hub : **Accueil · Notes · Historique · Dictionnaire · Snippets · Style · Réglages** (alias de hash : `#historique`, `#snippets`). Réglages : sections Général · **Micro** (`#reglages` + `settings-audio`) · **Raccourcis** (`settings-keys`) · Nettoyage IA · Transcription · Confidentialité.
Tous les canaux sont `app:*`, émetteur vérifié (`handle()` d'appWindow.ts), payloads validés ; une erreur remonte en rejet de promesse (message en français).

```ts
interface Dictation { id?: string; status?: 'ok'|'cancelled'|'failed'; audio?: boolean; durationMs?: number; app?: string; raw; text; provider; model; at; ms }
window.dictaApp += {
  audio: { listInputs(): Promise<{ id; label; isDefault; bluetooth; builtIn }[]> };
  micTest: { start(): Promise<{ ok: boolean; message?: string }>; stop(): Promise<void> }; // capture sans transcription, 15 s max
  onMicLevel(cb: (lv: number) => void): void;            // 0..1 ~30×/s ; -1 = test terminé
  history: {
    retry(id): Promise<Dictation>;                       // retranscrit l'audio gardé (jamais collé depuis la fenêtre)
    pasteRaw(id?): Promise<boolean>;                     // masque l'app puis colle la version brute dans l'app précédente
    recover(): Promise<Dictation|null>;                  // dernière dictée annulée / en échec (< 30 min)
    clearAudio(): Promise<void>;                         // « Supprimer les enregistrements »
  };
  onHistoryChanged(cb): void;                            // recoverable / retried
  snippets: { get(): Promise<{trigger,text}[]>; set(list): Promise<{trigger,text}[]> }; // ≤ 100, trigger ≤ 80, text ≤ 5000
  rewrite: { getPresets(): Promise<{id,name,instruction}[]>; setPresets(list): Promise<…>; run(id): Promise<boolean> }; // ≤ 20, nom ≤ 40, consigne ≤ 500
  dictionary: { export(): Promise<{ok, terms?, rules?, snippets?}>; import(): Promise<{ok, terms?, rules?, snippets?, message?}> }; // JSON, fusion sans rien effacer
  importContacts(opts?: { calendar?: boolean }): Promise<{ added; found; errors: { source; reason: 'denied'|'timeout'|'failed' }[] }>;
  notepad: { list(): Promise<{id,text,at,app?}[]>; remove(id): Promise<boolean>; clear(): Promise<void>; copy(): Promise<boolean> };
  getActivity(): Promise<{ date; words; dictations }[]>;  // ~12 mois (agrégats history.json), carte de chaleur
  image: { save(dataUrl): Promise<boolean>; copy(dataUrl): Promise<boolean> }; // carte « à partager » PNG, générée dans la page
  getSecureInput(): Promise<boolean>; onSecureInput(cb: ({ active, app }) => void): void;
}
```
Format d'export du dictionnaire : `{ format: 'cbw-ai-dictionary', version: 1, vocabulary[], priority[], replacements["avant => après"], snippets[{trigger,text}] }` (fichier ≤ 1 Mo à l'import).
`onConfigChanged` couvre aussi `dictionary.priority`, `dictionary.replacements`, `snippets.list`, `rewrite.presets`, `general.language`, `overlay.livePreview`, `notepad.enabled`.

**Réglages ajoutés** (défauts et validation stricte dans src/main/settings.ts) : `audio.inputDeviceId` ('' = défaut), `audio.avoidBluetooth` (true), `audio.lowVoice` (false), `audio.pauseMedia` (true), `audio.maxDurationMin` (20, entier 0..120, 0 = illimitée) · `cleaning.promptMode` ('auto'|'on'|'off'), `cleaning.toneByApp` (true), `cleaning.frenchTypography` (true), `context.readBefore` (true) · `dictionary.priority` ([] ⊂ `cleaning.vocabulary`), `dictionary.replacements` ([] de « avant => après ») · `history.keepAudio` (true), `history.audioDays` (14, 1..60), `paste.rawUndoFirst`, `paste.restoreDelayOverrides` · `snippets.enabled` (true), `snippets.list` (chaîne JSON) · `rewrite.enabled` (true), `rewrite.presets` (chaîne JSON, 7 suggestions par défaut) · `shortcuts.pasteLast` (⌃⌘V), `shortcuts.copyLast` (⌃⌘C), `shortcuts.rewrite` (⌃⌘R) ('' = désactivé, sinon accélérateur avec modificateur), `shortcuts.mouseButton` (0, 4..32) · `overlay.livePreview` (false), `overlay.hiddenUntil` · `notepad.enabled` (false) · `general.language` ∈ auto, fr, en, es, de, it, pt, nl.

**Raccourcis (main.ts)** : ⌃⌘V colle la dernière dictée — ou la dernière annulée / en échec si elle est plus récente (< 30 min) ; ⌃⌘C la copie ; ⌃⌘R : 1er appui = sélection captée + écoute de la consigne, 2e appui = fin (globalShortcut ne voit pas le relâchement).
**Notifications macOS** (silencieuses, une par type / 8 s) : aucun son du micro · il reste 1 minute · micro coupé / déconnecté · saisie sécurisée active (nom de l'app, une fois / 10 min) · « Échap : dictée gardée — ⌃⌘V pour la coller » (clic → Historique) · dictée gardée après une erreur. « Ajouté au dictionnaire : X » reste émise par learn.ts.
Barre des menus (clic droit) : « Réécrire la sélection ▸ consignes », « Réafficher la pastille » quand elle est masquée.

## Notes v2 — écran Notes (design/app/notes.js, structure Wispr Notetaker validée le 15 oct. + audit final.md)

Écran « Notes », **même organisation que Wispr Notetaker** (chantiers/notes-v2/wispr-structure.md, réponses de Camille dans tickets.md › « Organisation façon Wispr Notetaker ») :
- **L1 `#notes`** : liste pleine largeur. En-tête « Notes » + réglages (→ `#reglages:settings-notes`) + « Nouvelle note » (⌘N, démarre tout de suite). Bloc **« À venir »** seulement si `notes.calendar` est actif (`calendar.upcoming()` : aujourd'hui, demain, après-demain ; 3 visibles puis « Afficher N de plus » ; « Démarrer » ou « Rejoindre et démarrer » + menu Démarrer sans rejoindre / Rejoindre seulement, lien ouvert par `openExternal`, https seulement). Puis **« Notes précédentes »** groupées par jour (surtitre « Aujourd’hui, 15 oct. »), ligne = voix (initiales) + titre + **heure seule** (+ statut : « Générer le résumé », « Résumé non préparé »), menu … (Copier au format Markdown · Afficher dans le Finder · Supprimer…). Recherche « Rechercher dans les notes » (titres, voix, transcriptions via `notesV2.search`). La note en cours est en tête (onde + chrono, ou « Étape n sur 3 »). **Aperçu à droite (280 px)** qui suit le survol / la sélection : horaire « Aujourd’hui • 10:02 • 42 min », Participants (5 + « +N de plus »), Vue d’ensemble (début du « En bref », en gris IA). Pas d'indicateur dans la barre latérale.
- **L2 `#notes:<id>`** (`#notes:direct` = note en cours) : Retour (Échap), menu …, Note précédente / suivante (J / K). Gros titre modifiable, puce date + voix. Onglets **Transcription · Résumé** (Transcription pendant l'enregistrement, Résumé pour une note passée et à la fin). Outils dans chaque onglet : chrono / « 3 voix • 42 min » · Chercher (⌘F, /) · Copier tout · **Nommer les voix** (fenêtre : toutes les voix d'un coup, extrait + nom suggéré, « Même personne que », « Enregistrer les noms » → `renameSpeaker` en série) ; « N min de lecture » · Chercher · Copier · … (Type de résumé…, Copier les prochaines étapes, Hub, Revenir à la version précédente, Régénérer). Texte IA gris + heure dans la marge (loupe → transcription + réécoute), renommage au clic (Partout / Ce passage seulement).
- **Barre du bas flottante** : Démarrer → Arrêter (onde + chrono) → Finalisation… (« Étape n sur 3 ») → Reprendre + **« Demander… »** (seulement après l'arrêt ; réponses dans un tiroir qui s'ouvre vers le haut). **Pas de pause ni d'Annuler** (« Démarré par erreur ? Garder / Jeter » après coup) ; « Reprendre » sur une note terminée enregistre la suite dans une nouvelle note « <titre> (suite) » (pas d'ajout à une note close côté main). La pause n'existe plus que pour l'arrêt auto (« Notes arrêtées » → Reprendre = `resumeNote`).
- Carte « Réunion détectée » : bouton principal « Démarrer les notes » + menu (Plus tard (2 min) · interrupteur « Démarrer automatiquement » = `setConfig('notes.autoStart')` · Réglages des notifications) + croix (= Non), compte à rebours 10 s gardé.
**Aucun nombre de personnes demandé** : `startNote` ne passe plus `numSpeakers` (voix détectées seules, correction après coup). Après l'arrêt : progression « Étape 1/3 sauvegarde · 2/3 transcription · 3/3 résumé », notification macOS « Résumé prêt : <titre> » (main.ts). Note sans résumé de moins de 5 min : « Générer le résumé » ; quasi vide (< 12 mots ou < 15 s) : « Démarré par erreur ? Garder / Jeter ». Genre reconnu (`kind`) en petit libellé dans la rangée d'outils du Résumé.

`startNote(opts?)` accepte `{ title, participants[], eventId }` ; `stopNote(opts?)` accepte `{ title, participants, template }` (`userNotes`/`userTimes` encore acceptés pour les anciennes pages). `listNotes()` ajoute `templateId`/`folder`/`kind` ; `getNote(id)` ajoute `annotated` (balises `[[ia mm:ss]]`, lignes `> ` = encadré « À retenir » / citation), `templateId`, `templatePick`, `kind`, `participants`, `previous`, `hasAudio`.

```ts
window.dictaApp += {
  notesV2: {
    current(): Promise<{ state; active; busy; elapsedMs; meeting: { title?; participants; eventId?; startedAt; app? } | null }>;
    regenerate(id, { template? }): Promise<void>;      // change de type de résumé (garde la version précédente)
    restorePrevious(id): Promise<boolean>;
    renameSegment(id, startMs, to): Promise<boolean>;  // « Ce passage seulement » (renameSpeaker = « Partout »)
    save(id, { annotated?, title? }): Promise<boolean>; // retouches (le .md est réécrit sans balises)
    templates(): Promise<{ id; label; hint }[]>;
    ask(qid, question, noteIds[], history?): Promise<AskResult>; // deltas via onAskDelta
    search(q): Promise<{ id; snippet }[]>;             // recherche dans les transcriptions
    audio(id, fromMs, toMs): Promise<{ ok; dataUrl? ; message? }>; // extrait WAV ≤ 90 s si l'audio est gardé
    privacy(): Promise<{ local; provider; label }>;    // « L'audio reste sur ce Mac. Le texte part chez … »
    call(action: 'start'|'snooze'|'dismiss'|'keep'|'resume'|'stopNow'): Promise<void>; // cartes d'appel
    callState(): Promise<{ inCall; app; offer; autoStop: 'warn'|'stopped'|null }>;
    onCallDetected(cb: ({ app?, bundleId?, seconds } | null) => void); // carte « Réunion détectée » (null = la retirer)
    onAutoStop(cb: ({ phase: 'warn'|'stopped'|'cancel'|'done', seconds? }) => void);
    onLive / onStage / onVoices / onDevice / onDraft / onDelta({ noteId, annotated }) / onAskDelta({ qid, answer }) / onMeetingSoon(CalendarEvent)
  };
  hub: { available(): Promise<boolean>; send(tasks[{ titre, date?, pour?, pourquoi? }]): Promise<{ ok; sent; failed }> }; // node ~/cbw-studio/mcp/hub.mjs tache
  calendar: { status(); enable(on?): Promise<{ ok; access }>; current(): Promise<CalendarEvent|null>; upcoming(): Promise<{ enabled: boolean; events: CalendarEvent[] }> }; // src/main/calendar.ts ; upcoming = bloc « À venir » (aujourd'hui → après-demain, réunions finies exclues, `enabled: false` si `notes.calendar` coupé)
  engine: { status(); downloadNow(); cancel() }; onEngineProgress(cb);  // api-engine.md
  licenses(): Promise<string>;                                             // NOTICE-meeting-engine.txt
}
```
**Détection d'appel** (src/main/callDetect.ts, branché par `wireCallDetection` dans appWindow.ts) : `call-start` → si `notes.autoStart` démarrage direct (+ notification si la fenêtre n'est pas au premier plan), sinon carte « Réunion détectée » 10 s (Démarrer maintenant · Plus tard 2 min · Non) dans la fenêtre, notification macOS si la fenêtre n'est pas au premier plan (clic = démarrer). `call-end` pendant une note qui a vu un appel, si `notes.autoStop` : carte « Toujours là ? » 15 s (Continuer · Arrêter maintenant), puis pause + « Notes arrêtées » avec Reprendre 4 s, puis arrêt réel (même chemin que `stopNote`). Un nouvel appel pendant l'avertissement l'annule. Les cartes (notes.js › Cartes) s'affichent sur toutes les pages.
Réglages (settings.ts) : `notes.detectCalls` (true), `notes.autoStart` (false), `notes.autoStop` (true), `notes.echoCancel` (true), `notes.engine` ('auto'|'whisper'), `notes.engineDownloadPaused` (false), `notes.calendar` (false, autorisation demandée à l'activation), `notes.template` ('auto'). UI : Réglages › Notes, « Mentions des licences » dans Confidentialité & à propos.
Compte rendu en flux : `scripts/build.mjs` enveloppe `organizeNotes` ; `appWindow.ts` pose `setNextOrganize({ userNotes, template, title, participants, onDelta, onResult })` juste avant `NoteSession.stop()` / `reorganize()` ; le résultat balisé est rangé dans `~/.dicta-ai/notes/<id>.ui.json`.
Limites connues (hors zone UI) : le résumé des notes de moins de 5 min est encore rédigé automatiquement (il faudrait `NoteSession.stop({ summarize: false })`, ticket CORE) ; pas de « consigne » libre pour `organizeNotes` (ticket LLM : « raccourcis le résumé » passe par `askNotes` + « Remplacer le résumé ») ; Info.plist à compléter avec `NSCalendarsFullAccessUsageDescription` + `NSCalendarsUsageDescription` (package.json) ; la notification calendrier est une notification macOS (clic = démarre la note) + une carte dans la fenêtre.
