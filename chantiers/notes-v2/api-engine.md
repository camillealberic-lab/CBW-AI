# API ENGINE (intégration du moteur dicta-meeting) — Phase 3
Fichiers : `src/main/{meetingEngine,meetingEngineCore,fluidModels,fluidModels.manifest}.ts` (+ tests `*.test.ts`), `notes.ts`, `diarization.ts` (champ `engine`), `speakers.ts` (mots horodatés), `scripts/meeting-engine/{build.sh,pin-models.mjs}`, `assets/licenses/NOTICE-meeting-engine.txt`.

## Comportement (automatique, aucun réglage requis)
- Au démarrage d'une note : `currentEngine()` = Parakeet/FluidAudio si macOS ≥ 15 ET modèles vérifiés ET binaire présent, sinon Whisper + sherpa (inchangé). Le choix est journalisé (sans texte).
- Transcription : un processus `dicta-meeting transcribe` par morceau (≈ 0,1 s de chargement, ~85 Mo). Mots horodatés → attribution mot par mot (`piecesFromWords`). Diarisation : `diarize --speakers N` sur la piste du Mac (deux pistes, micro = Moi) ou le mélange (une piste), même règle de bascule que le worker sherpa.
- Repli sans perte : morceau en erreur → Whisper pour ce morceau ; 3 échecs d'affilée → Whisper pour la fin de la note ; diarisation en erreur → sherpa. Le binaire tourne en mode hors ligne (jamais de téléchargement en réunion).
- JSON `<id>.json` : champs ajoutés `engine` (`'fluid'|'whisper'|'mixed'`, absent = ancienne note) et `diarizationEngine` (`'fluid'|'sherpa'`). `getNote()` renvoie `engine`.
- Téléchargement : `initMeetingEngine()` est appelé par le constructeur de NoteSession ; planificateur toutes les 60 s : Mac inactif ≥ 2 min, sur secteur, ni dictée ni réunion, non suspendu. Il coupe (fichier .part gardé, reprise Range) si une condition de poursuite disparaît. Les fichiers déjà présents sont adoptés après vérification SHA-256 (une seule fois). Wi-Fi : non détecté (limite connue). Échauffement Core ML automatique après un téléchargement.

## À brancher (UI / main.ts / settings.ts)
1. `import { engineStatus, fluidModels, addBusyProbe } from './meetingEngine'`. Dans main.ts : `addBusyProbe(() => pipeline.current !== 'idle')` (dictée ; les notes sont déjà couvertes).
2. IPC (lecture) `engine:status` → `engineStatus()` = `{ engine, reason, supported (macOS ≥ 15), binPresent, modelsReady, totalMB (~490), progress, paused }`.
   `progress` (`FluidProgress`) = `{ state: 'idle'|'waiting'|'downloading'|'verifying'|'done'|'error', received, total, percent, file?, waiting?: 'idle'|'power'|'busy'|'paused', error? }`. Événement push : `fluidModels().on('progress', p => …)` (toutes les ≥ 250 ms).
3. IPC actions : `engine:download-now` → `fluidModels().start()` (ignore les conditions « inactif/secteur », bouton « Télécharger maintenant ») ; `engine:cancel` → `fluidModels().cancel()`.
4. Réglages (lus via `get` non typé, à ajouter dans settings.ts) :
   | clé | défaut | libellé FR |
   |---|---|---|
   | `notes.engineDownloadPaused` | false | « Suspendre le téléchargement du moteur de notes » |
   | `notes.engine` | `'auto'` (`'whisper'` = forcer l'ancienne chaîne) | « Moteur de transcription des réunions : Automatique / Classique (Whisper) » (avancé) |
5. Textes d'état suggérés : `waiting` + `idle` « En attente : Mac actif » ; `power` « En attente : sur batterie » ; `busy` « En pause pendant une dictée ou une réunion » ; `paused` « Suspendu » ; `downloading` « Téléchargement du moteur de notes… 42 % (≈ 490 Mo) » ; `done` « Moteur de notes prêt » ; macOS 14 (`supported:false`) « Non disponible sur macOS 14 : la transcription classique est utilisée ». Pendant le téléchargement les réunions marchent avec l'ancienne chaîne.
6. « À propos » : afficher le contenu de `Resources/licenses/NOTICE-meeting-engine.txt` (ajouté à extraResources) : FluidAudio Apache-2.0 ; Parakeet TDT 0.6B v3 (NVIDIA, converti par FluidInference) CC-BY-4.0 ; pyannote community-1, WeSpeaker, PLDA BUT Speech@FIT CC-BY-4.0.
7. Mises à jour : les modèles sont hors de l'app (`~/.dicta-ai/models/fluid`, `.verified.json` + `.fluidaudio-revision`) : ne jamais les supprimer dans les migrations.

## Épinglage / build
- `node scripts/meeting-engine/pin-models.mjs` régénère le manifeste (47 fichiers, 490 Mo, révisions HF : Parakeet `7dd20fe6…`, diarisation `df2625ac…`).
- `bash scripts/build-fnwatch.sh` compile aussi `vendor/bin/dicta-meeting` (extraResources filtre mis à jour). Binaire : `DICTA_MEETING_BIN`, modèles : `DICTA_MEETING_MODELS`.
- Tests : `node --experimental-strip-types src/main/{meetingEngineCore,fluidModels,speakers}.test.ts` (matrice moteur, parsing, essai réel du binaire sur 2 voix, reprise Range sur serveur local).
