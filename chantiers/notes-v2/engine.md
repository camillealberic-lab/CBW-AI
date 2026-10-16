# ENGINE — prototype `dicta-meeting` (FluidAudio + Parakeet TDT v3)

Statut : prototype compilé et mesuré (15 oct. 2026). Aucun fichier existant du dépôt touché.
Fichiers : `scripts/meeting-engine/` (Package.swift, Sources/dicta-meeting/main.swift, build.sh, .gitignore), `vendor/meeting-engine/dicta-meeting` (binaire, ignoré par git).

## 1. Faisabilité : oui
- Paquet SwiftPM, FluidAudio **0.17.7 épinglé** (`exact`). Build : `scripts/meeting-engine/build.sh` (SDK 26 forcé comme `build-fnwatch.sh`, cible `arm64-apple-macos14.0`, signature ad hoc). Première compilation ~2 min (télécharge FluidAudio + un xcframework binaire `NemoTextProcessing`), ensuite quelques secondes.
- Binaire : **18,7 Mo**, `minos 14.0`, dépend seulement de frameworks système (CoreML, Accelerate, AVFAudio…). Pas de dylib à embarquer.
- Swift 6.4 / outils 6.0 : le mode Swift 5 est forcé sur notre cible (le package FluidAudio utilise `Package@swift-6.2.swift`, sans souci).
- Piège connu (doc FluidAudio) : sur **macOS 14**, bug Apple dans BNNS (crash intermittent de Core ML quand ça retombe du Neural Engine sur le CPU), corrigé en macOS 15. Notre `minimumSystemVersion` est 14 : à tester sur une machine macOS 14, sinon relever le minimum pour les notes ou prévoir un repli (sherpa-onnx actuel).

## 2. Licences (compatibles app gratuite distribuée)
| Élément | Licence | Obligation |
|---|---|---|
| FluidAudio (code) | **Apache-2.0** | garder LICENSE/NOTICE dans « À propos / licences » |
| Parakeet TDT 0.6B v3 (NVIDIA, conversion Core ML FluidInference) | **CC-BY-4.0** (usage commercial permis) | attribution NVIDIA + FluidInference, lien licence, mention « modèle converti » |
| Diarisation : pyannote *community-1* (segmentation, FBank, Embedding WeSpeaker, PLDA BUT Speech@FIT) | **CC-BY-4.0** (périmètre « scoped », NOTICE.md du dépôt HF) ; segmentation 3.0 historique MIT | attribution pyannote, WeSpeaker, BUT Speech@FIT, FluidInference |
| Sortformer (diarisation en flux, non utilisé ici) | NVIDIA Open Model License (« sans restriction » selon la doc) | à relire avant tout usage |
Aucune clause non commerciale rencontrée. Les modèles sont téléchargés depuis HuggingFace par le binaire (pas dans le dépôt ni dans l'app) : à décider si on les héberge nous-mêmes (variable `REGISTRY_URL` supportée par FluidAudio) pour ne pas dépendre de HF.

## 3. Tailles
- Parakeet v3 (encodeur int8) : **468 Mo** dans `~/.dicta-ai/models/fluid/parakeet-tdt-0.6b-v3/`.
- Diarisation (Segmentation 5,7 + Embedding 13 + FBank 1,7 + PLDA) : **21 Mo** dans `~/.dicta-ai/models/fluid/diarizer/`.
- Total ~490 Mo (contre 547 Mo pour whisper large-v3-turbo q5_0 + 46 Mo sherpa). Téléchargement + compilation Core ML initiale : **57 s** (`dicta-meeting prepare`, RAM max 550 Mo).
- Variante plus légère existante : Parakeet « redux » (~220 Mo, macOS 15+) ; « ultra » (même taille que v3, plus précis selon FluidAudio, à évaluer en français).

## 4. Mesures (Mac 16 Go, M-series, whisper-server de l'app installée au repos, pas d'Ollama chargé)
Fichier 1 : 285 s, 3 voix Apple (Thomas, Amelie, Jacques, 36 tours). Fichier 2 : 279 s, voix plus distinctes (Thomas, Shelley, Rocko). Texte de référence connu, WER approximatif (chiffres écrits « 15 » vs « quinze » comptés en erreur, donc pessimiste).

| Mesure | Résultat |
|---|---|
| Parakeet v3, transcription 285 s (2e passage, modèles chargés) | **0,67 s** (RTFx ≈ 425), 0,77 s mur avec lancement du processus ; pic mémoire **~85 Mo** (RSS 160 Mo) |
| Chargement des modèles ASR | 0,09 s (déjà compilés) ; le tout premier lancement compile (voir `prepare`) |
| WER Parakeet (fichier 2) | **5,5 %**, mots horodatés (756 mots) |
| whisper-cli turbo q5_0 `-l fr -t 8`, même fichier | **12,6 s** mur, 1,0 Go de pic ; WER 17,5 % car il **saute des phrases** sur le long format (686 mots contre ~790) |
| Diarisation hors ligne, fichier 2 (3 voix distinctes) | **1,0 à 1,1 s** (1,3 s mur), **3 locuteurs trouvés**, pureté 98,3 %, pic mémoire **~810 Mo** (RSS 350 Mo) |
| Diarisation, fichier 1 (Thomas et Amelie très proches) | 2 locuteurs auto ; avec `--speakers 3` : 3 clusters mais Thomas/Amelie restent mélangés (pureté 66 %) |
| Pseudo-flux (`stream`, blocs 15 s sur stdin) | 0,07 à 0,1 s par bloc de 15 s |
Réserve : la synthèse vocale Apple n'est pas de la vraie parole (pas de bruit, pas de chevauchement, timbres très réguliers). Les temps sont fiables ; la précision de séparation est optimiste dans le cas distinct et pessimiste dans le cas Thomas/Amelie. **À refaire sur 2 ou 3 vraies réunions enregistrées** avant décision.

## 5. API proposée (pour CORE/UI plus tard)
CLI `dicta-meeting`, une ligne JSON sur stdout, erreurs `{"error": "..."}` + code ≠ 0, journaux sur stderr (jamais de texte de réunion dans les logs). Dossier des modèles : `~/.dicta-ai/models/fluid` (surcharge `DICTA_MEETING_MODELS`). Entrée : WAV 16 kHz mono (FluidAudio convertit aussi les autres formats).
- `prepare` : télécharge et compile les modèles → `{ok, prepareSeconds, modelsDir}`. À appeler une fois (écran « Télécharger le moteur de notes », ~490 Mo, avec progression à ajouter).
- `transcribe <wav> [--lang fr]` → `{text, duration, words:[{w,s,e}], model, loadSeconds, transcribeSeconds, rtfx}` (secondes). `--lang` filtre l'écriture (français par défaut).
- `diarize <wav> [--speakers N] [--threshold 0.6] [--embeddings]` → `{segments:[{speaker:"S1",s,e}], speakerCount, diarizeSeconds, embeddings?:{S1:[256 floats]}}`. Les empreintes (256 flottants L2-normalisés) servent à « renommer une fois » et à l'empreinte de la voix de l'utilisateur.
- `stream [--chunk 15] [--lang fr]` : PCM s16le 16 kHz mono sur stdin, une ligne JSON par bloc (`offset`, mots à horodatage absolu). Pour l'instant sans VAD (coupe au milieu des phrases) : à placer derrière notre VAD/segmentation.
- Côté Electron : un wrapper `src/main/meetingEngine.ts` (spawn, timeout, lecture de la ligne JSON) comme pour `dicta-fnwatch`. Fusion des mots et des segments : attribuer chaque mot au locuteur dont le segment le contient (temps du milieu du mot), puis regrouper en tours. Prévoir la piste micro (« Moi ») et la piste système (« Eux ») séparées, avec diarisation sur la piste système seulement.
- À ajouter si retenu : progression de téléchargement/diarisation sur stdout (le callback existe), chargement d'empreintes connues (`--known file.json`), diarisation en flux (LS-EEND, jusqu'à 10 locuteurs, ou Sortformer, 4 max), vocabulaire personnalisé (CTC 110M de FluidAudio, branchable sur notre dictionnaire).

## 6. Risques
1. **Bug Core ML/BNNS macOS 14** (voir §1) : tester ; sinon repli sherpa-onnx.
2. **Précision en vrai** : voix proches, chevauchements, bruit de salle, français québécois/accents. Parakeet v3 corrige la ponctuation mais peut écrire les nombres en chiffres (« 15 novembre ») : acceptable, à signaler au LLM. Sorties numériques/ITN non filtrées (le binaire n'applique pas NemoTextProcessing).
3. **Dépendance réseau** : modèles sur HuggingFace (CC-BY, épinglés par FluidAudio). Prévoir miroir, vérification SHA (le `provenance.json` fournit les SHA-256) et reprise sur coupure.
4. **Mémoire** : diarisation ~810 Mo de pic (réglable : `segmentation.batchSize` 32 → 8 donne ~100 Mo selon la doc) ; transcription négligeable. Rien de bloquant sur 16 Go ; ne pas charger en même temps Ollama.
5. **Gros fichiers** : testé jusqu'à 285 s seulement ; la doc annonce un mode disque à mémoire constante. Mesurer sur 60 min avant de promettre.
6. **Signature et notarisation** : binaire signé ad hoc ici ; en production il faut le signer avec le certificat de l'app (hardened runtime, entitlements Core ML inutiles à priori) et l'ajouter à `extraResources`. Le build tire des paquets depuis GitHub : prévoir cache CI ou vendoring de FluidAudio.
7. **Mise à jour de FluidAudio** très rapide (0.15 → 0.17 en quelques mois, API qui bouge) : version épinglée, ne pas suivre `main`.
8. Plafond de locuteurs en auto : 2 trouvés au lieu de 3 quand deux voix se ressemblent ; proposer à l'utilisateur de corriger le nombre (`--speakers N`) comme dans nos tickets.

## 7. Reproduction
```
bash scripts/meeting-engine/build.sh
vendor/meeting-engine/dicta-meeting prepare
/usr/bin/time -l vendor/meeting-engine/dicta-meeting transcribe meeting.wav
/usr/bin/time -l vendor/meeting-engine/dicta-meeting diarize meeting.wav --speakers 3
```
Fichiers de test (hors dépôt, scratchpad de la session) : générés avec `say -v Thomas|"Shelley (Français (France))"|"Rocko (Français (France))"` puis `afconvert -f WAVE -d LEI16@16000 -c 1`, 18 tours répétés deux fois.
