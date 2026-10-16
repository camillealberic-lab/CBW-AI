# Dictaphone + dictée en anglais : causes, changements, mesures (15 oct.)

## Bug 1 : 3 personnes dans la même pièce, une seule voix trouvée
Journal 13:48 : moteur fluid, mode `mix` (le Mac n'avait aucune parole, donc la règle « micro = Moi » ne s'appliquait PAS), diarisation déjà faite sur le fichier entier, FluidAudio a rendu **1 groupe** (« groupes 1 → 1 »).
Causes trouvées :
1. **Micro traité par le système** : en note, `getUserMedia` demandait `echoCancellation: true` (son du Mac activé) + `autoGainControl: true`. Sur macOS cela passe par le traitement vocal du système (AEC + AGC réglés pour UNE voix proche) : les voix lointaines de la salle sont écrasées.
2. **Réglage FluidAudio par défaut (VBx Fa 0,07) trop « fusionneur » sur un audio court** : sur 50 s, 3 voix → 2 dans 3 scénarios sur 3 (le seuil `threshold` n'y change rien : 0,4 à 0,7 donnent le même résultat).
3. Non confirmé : la diarisation était bien sur le fichier entier (pas par morceaux) ; la fusion 0,7 du worker sherpa ne s'appliquait pas (moteur fluid).

## Changements (dictaphone)
- `src/renderer/recorder.ts` : note = **micro brut** (`echoCancellation/noiseSuppression/autoGainControl: false`, aussi à la reprise après perte du micro). Un flux pré-ouvert avec d'autres traitements est rouvert (note ↔ dictée). L'écho du haut-parleur reste retiré en logiciel (NLMS `shared/aec.ts`, sans effet quand le Mac est muet). Dictée inchangée.
- `src/main/notes.ts` › `finalPass` : moteur Parakeet → à l'arrêt, **transcription définitive sur les fichiers entiers** (piste micro + piste Mac si elle a porté de la parole, sinon le mélange), mots horodatés, découpe en segments sur les pauses (`speakers.segmentsFromWords`). Le direct n'est plus qu'un aperçu. Garde-fou : si la passe finale a moins de 50 % des mots de l'aperçu, l'aperçu est gardé (+ rattrapage habituel).
- `src/main/meetingEngine.ts` : `transcribeFile` (tranches ≤ 10 min coupées au creux le plus calme, `meetingEngineCore.splitLong`) ; `diarizeWithEngine` : réglages recalibrés + **tri des voix de la piste micro en deux pistes** : « Moi » seulement si le micro ne porte qu'une voix (`micTurns`), sinon « Personne n » ; une voix du micro qui parle à ≥ 60 % en même temps que le Mac est traitée comme de l'écho (`dropEchoVoices`).
- `src/main/speakers.ts` › `labelSegments(…, micTurns)` ; `diarization.ts` : champ `micTurns`.
- Recalibrage (`meetingEngineCore.ts`) : `FLUID_DIARIZE_ARGS = --fa 0.4 --embeddings` (sur-découpe volontaire) puis `refineDiarization` : fusion des groupes dont les empreintes moyennes ont un cosinus ≥ **0,62** (même voix mesurée 0,69–0,85, voix différentes ≤ 0,57), absorption des groupes < 1,5 s. Nombre imposé : inchangé.
- `scripts/meeting-engine/Sources/dicta-meeting/main.swift` : options `--fa`, `--fb`, `--min-speakers`, `--max-speakers` (binaire recompilé dans `vendor/bin/dicta-meeting`). Un ancien binaire ignore `--fa` (pas d'erreur, juste l'ancien comportement).
- Non fait : empreinte de la voix de l'utilisateur (aucune empreinte enregistrée aujourd'hui) ; chaîne Whisper + sherpa (macOS 14) : pas de passe finale sur le fichier entier (rattrapage habituel).

## Mesures (Mac 16 Go, binaire au repos)
Scénarios « salle » générés (voix `say` Thomas / Amélie / Jacques / Shelley / Rocko, débits 165–235, locuteur proche fort + autres à −10/−12 dB avec réverbération 0,5 s + bruit), ~50 s ; vraies voix : 4 voix zh, 3 × 2 voix en.

| Fichier | attendu | avant (défaut) | après |
|---|---|---|---|
| s3a / s3b / s3c (50 s) | 3 | 2 / 2 / 2 | **3 / 3 / 3** (pureté 97 / 93 / 96 %) |
| s3long (184 s) | 3 | 3 | 3 (96 %) |
| s2a / s2b / s2c | 2 | 2 / 2 / 2 | 2 / 2 / 2 (100 %) |
| s1a / s1b / s1c | 1 | 1 | 1 |
| vraies voix en (×3) | 2 | 2 | 2 |
| vraies voix zh | 4 | 3 | 5 |
| meeting-fr (Thomas / Amélie / Jacques très proches) | 3 | 2 | 2 (cas dur connu) |

Temps : diarisation 0,45–0,5 s pour 50 s, 1,0 s pour 184 s ; transcription Parakeet du fichier entier 0,72 s pour 184 s (RSS 147 Mo), **2,25 s pour 12 min 18** (RSS 194 Mo), chargement 0,07–0,09 s (12 s au tout premier lancement d'un binaire recompilé : compilation Core ML).
Réserve : synthèse vocale ≠ vraie salle. À valider par Camille sur un vrai test à 3.

## Bug 2 : passages de dictée en anglais (general.language = fr)
- Vérifié : `language: fr` est bien envoyé (code installé, `dist/main/main.js`), Parakeet n'est jamais utilisé pour la dictée (moteur des notes seulement), le serveur « réunion » n'a pas tourné (moteur fluid), aucun `translate`.
- **Cause reproduite** : un prompt Whisper contenant des phrases anglaises fait **traduire** Whisper malgré `language=fr` (audio français + prompt anglais → sortie anglaise ; même audio sans prompt ou avec noms seuls → français). Le prompt de dictée contient les 200 derniers caractères du texte déjà dicté : un passage anglais (citation, terme, segment mal reconnu) contamine les segments suivants (effet cascade, cohérent avec « des passages »). Le contrôle de l'IA (`novelWordRatio`) laisse passer car le brut est déjà anglais.
- Correctifs `src/main/whisper.ts` (+ `src/main/langGuard.ts`, pur, testé) : prompt dans une autre langue que celle demandée → écarté d'emblée ; **sortie dans une autre langue → nouvel essai sans prompt ni contexte**, on garde la version en bonne langue (journal : « langue ≠ fr → nouvel essai… ») ; whisper-server lancé avec `-l fr` par défaut (le défaut du binaire est `en`, utilisé seulement si un paramètre manquait). Jugement fr/en par mots-outils, muet sous 3 indices (noms propres, « Ok merci »).

## Vérifications
`npx tsc --noEmit -p .` OK. Tests purs OK : speakers, meetingEngineCore (+ essai réel du binaire), langGuard, vad, aec, whisperText, fluidModels.
