# API CORE (capture / transcription / voix) — Phase 1

Fichiers : `src/main/{notes,diarization,diarize-worker,speakers,recorder,whisper,preload-recorder}.ts`, `src/renderer/recorder.ts`, `src/shared/{vad,aec,whisperText}.ts`. Modèle d'empreinte : inchangé (TitaNet small ; FluidAudio le remplacera, cf. engine.md).

## Démarrer / événements (NoteSession, `src/main/notes.ts`)
- `notes.start({ numSpeakers?: number })` : nombre de personnes présentes, toi compris (1..30). Deux pistes : les autres = n−1 ; présentiel : toutes triées sur le micro. n=1 : pas de tri (tout « Moi » en présentiel).
- `notes.on('live', { noteId, source: 'mic'|'system', startMs, endMs, text })` : un morceau transcrit (pendant la réunion). `source:'mic'` = Moi si le son du Mac est capté ; la voix finale arrive à l'arrêt.
- Après l'arrêt : `notes.on('stage', { noteId, stage })` avec `stage` = `'transcript'` (transcription prête, note brouillon déjà dans l'index, provider `'pending'`, événement `'draft'` avec le `NoteMeta`) → `'voices'` → `'summary'` → `'done'`. Même info dans `progress` (`NoteProgress.stage`).
- `notes.on('voices', { noteId, segments, diarized, mode })` : segments étiquetés (mode `'two-track'|'mix'`).
- `notes.on('device', { state: 'lost'|'recovered'|'fallback'|'muted', label })` : micro disparu / revenu / bascule défaut ; la note ne s'arrête jamais.
- `getNote()` renvoie aussi `segments` dès le brouillon. JSON `<id>.json` : `{ segments:[{startMs,endMs,speaker,text,source,speechStartMs,speechEndMs}], diarized, mode, numSpeakers, diarizationMs }`.

## Réglages
| clé | défaut | libellé FR proposé |
|---|---|---|
| `notes.echoCancel` (nouveau, non typé : lu via `get`) | true | « Annuler l'écho du haut-parleur sur le micro » |
| `notes.systemAudio` | true | son du Mac (existant) |
| `notes.diarization` | true | séparation des voix (existant) |
Pas de limite de durée en réunion (`audio.maxDurationMin` ignoré pour les notes, aucun `limit warn/max`).

## Comportement
- Deux pistes bout en bout : micro (nettoyé : `echoCancellation` getUserMedia + NLMS `shared/aec.ts` avec le son du Mac en référence, ERLE 16 dB en test, ~6 % d'un cœur) et son du Mac ont chacun leur découpage et leur WAV (`.mic.wav` / `.sys.wav`). Mode deux pistes si le Mac porte ≥ max(8 s, 6 % de la durée) de parole, sinon « une piste » (présentiel). Micro = « Moi » jamais trié ; écho résiduel retiré (`dedupeEcho`).
- Découpage (`MEETING_VAD`) : marge 256 ms, coupe après 800 ms de silence, 25 s max (creux le plus calme des 3 dernières s), seuil 0,0025 RMS (dictée : 0,01 inchangé), réduction de bruit coupée, aucun rognage. Rattrapage à l'arrêt : découpage rejoué sur les WAV, tout passage non couvert est retranscrit.
- Plus de re-transcription : `labelSegments` coupe par phrases (prorata de caractères) et attribue chacune à la voix qui la recouvre le plus.
- whisper : `transcribe(wav, { meeting: true })` → serveur dédié (contexte complet, ≤ 25 s, ~0,8 s pour 24 s), démarré avec la note, arrêté après la transcription. Boucle détectée → nouvel essai sur le même serveur (sans prompt, beam 3, repli de température) puis réduction des répétitions ; whisper-cli seulement si le serveur est absent/en erreur. Dictée : serveur, contexte 640 et réglages inchangés. `looksLooping` : 40 car./s + 30 (avant 30/s), répétitions ≥ 5 mots / 4 bigrammes / 3 n-grammes.
- Voix : `numSpeakers` imposé (`numClusters`), sinon seuil 0,7 (recalibré : plateau 0,5–0,7 sur 3 voix FR ; 0,8 fusionnait deux voix), fusion des groupes à similarité de centroïdes ≥ 0,7 (0,6 collapsait 4 voix zh réelles), absorption < max(4 s, 3 %), plafond 8. Mesures : 111 s d'audio diarisés en 4,1 s (3,7 %, 4 threads, 650 Mo) ; 3 voix → 3 (97 % des trames), 4 voix zh réelles → 4, 2 voix en réelles → 2.
- Recorder : micro choisi une fois par session (`sessionDevice`), repris à la pause ; perte → reprise auto (10 s puis défaut), jamais d'`interrupted` en notes.

## À brancher (UI / main.ts)
Champ « Combien êtes-vous ? » → `notes.start({numSpeakers})` ; écouter `live`, `stage`, `voices`, `device`, `draft` ; réglage `notes.echoCancel`. Tests : `node --experimental-strip-types src/{shared/vad,shared/aec,shared/whisperText,main/speakers}.test.ts`.
