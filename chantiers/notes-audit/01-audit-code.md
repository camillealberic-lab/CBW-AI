# Notes de réunion : audit du code (lecture seule)

15/10/2026. Ce qui a été lu : `src/main/notes.ts`, `diarization.ts`, `diarize-worker.ts`, `speakers.ts`, `recorder.ts`, `src/renderer/recorder.ts`, `whisper.ts`, `whisperModels.ts`, `src/shared/vad.ts`, `src/llm/notes.ts`, `src/llm/providers/{gemini,groq}.ts`, `src/llm/config.ts`, `src/main/settings.ts`, `design/app/notes.js` (progression), et les lignes de minutage du journal `~/.dicta-ai/dicta.log`.

> **Ce que le journal permet de vérifier.** Le journal de ce Mac ne contient **pas** la réunion de 3 personnes d'aujourd'hui : il ne contient que des notes de test de 2 à 7 s. Il montre en revanche **des sorties de Whisper qui bouclent, régulièrement** : « whisper-server : échec, repli whisper-cli, sortie en boucle (76 à 871 car.) », plusieurs fois par jour. Les durées ci-dessous sont donc **estimées** à partir du code et des mesures inscrites dans les commentaires. Pour les mesurer réellement, il faut le journal du Mac de la réunion : chercher les lignes `note: transcription finie…`, `note: diarisation…`, `note: N segment(s) à cheval…` et `note: organisée par…`.

---

## 1. Architecture actuelle

```
PENDANT LA RÉUNION (fenêtre cachée src/renderer/recorder.ts)
  micro (getUserMedia : NS activée, AEC désactivée, AGC)  ─┐
  son du Mac (getDisplayMedia, loopback CoreAudio)        ─┴─► ChannelMerger ─► worklet ─► ingest()
        │                                                                           │
        │ mix = micro + Mac (somme écrêtée)                                         │
        ├──► WAV de session par blocs de 0,5 s ─► main : <id>.wav / .mic.wav / .sys.wav  (audio brut COMPLET, déjà en place)
        └──► Segmenter VAD (énergie, seuil absolu de 0,01 RMS, pause 300 ms, coupe forcée à 6 s)
                 └─► trimSilence ─► segment WAV ≤ 6 s ─► main NoteSession.enqueue()
                                                         └─► file SÉQUENTIELLE ─► whisper-server
                                                             (large-v3-turbo q5_0, greedy, audio_ctx 640,
                                                              prompt = base + noms + 200 derniers car.)
                                                             échec/boucle ─► whisper-cli (recharge le modèle)
                                                             erreur ─► segment PERDU (journalisé seulement)

APRÈS « STOP » (tout est séquentiel et bloquant, notes.ts:418-463)
  1. recorder.stop()  → fin non transcrite (« tail ») mise en file
  2. await queue      → la file Whisper se vide
  3. speakers()       → diarize() : utilityProcess sherpa-onnx sur le WAV COMPLET
                         pyannote-seg 3.0 + TitaNet-small (en), seuil 0,8, nombre de locuteurs inconnu
                         + refine() (empreintes recalculées) + absorbSmall()
  4. splitAtTurns()   → RE-TRANSCRIPTION Whisper, un morceau après l'autre, de chaque segment à cheval sur 2 locuteurs
  5. assignSpeakers() → « [mm:ss] Personne n : … »
  6. organizeNotes()  → si plus de 3 500 mots : N parties SÉQUENTIELLES + fusion + passe de couverture
                         (compte rendu v2 en 9 sections, maxTokens jusqu'à 12 000, délai de 120 s par fournisseur,
                          ordre gemini → groq → zai → openrouter → ollama)
  7. écriture du .md, index, statut « Note prête »
```

**Point clé sur la suggestion de la fondatrice : l'audio brut complet est déjà enregistré en continu** (`notes.ts:202-216`, pistes mélange, micro et Mac alignées). Le problème est ailleurs. La transcription se fait sur des **bouts de 6 s découpés par un VAD rudimentaire**. Le WAV complet ne sert qu'à la diarisation, puis à **re-transcrire** les morceaux. Ensuite, tout est enchaîné après l'arrêt.

---

## 2. Problème 1 : 14 personnes au lieu de 3

| # | Cause racine | Preuve |
|---|---|---|
| 1.1 | **Nombre de locuteurs jamais transmis.** Le regroupement se fait sur un seuil seul (`numClusters: -1`), et l'interface n'a aucun champ « combien de personnes ». | `diarize-worker.ts:145`, `diarization.ts:146-152` |
| 1.2 | **Seuil 0,8 calibré sur une conversation synthétique de 2 min à 3 voix** (voix TTS propres et très différentes). En vraie réunion (réverbération, micro du MacBook à 1-2 m, AGC et suppression de bruit qui font varier le timbre), les empreintes d'une même personne dérivent : une voix éclate en plusieurs groupes. | `diarization.ts:12-14, 32-33` |
| 1.3 | **Modèle d'empreintes `nemo_en_titanet_small`** : la petite version, entraînée en anglais. Discrimination plus faible sur du français réverbéré. | `diarization.ts:25-30` |
| 1.4 | **Aucune fusion de groupes après coup.** `refine()` ne fait que réattribuer chaque morceau au centroïde le plus proche **parmi les groupes existants**. Il ne fusionne jamais deux centroïdes très proches (même personne). | `diarize-worker.ts:170-265` |
| 1.5 | **`absorbSmall` trop permissif sur une longue réunion** : seuls les groupes de moins de max(2 s, 2 % de la parole) sont absorbés. Sur 30 min, un « faux locuteur » de 40 s survit. Le nombre de groupes n'a aucun plafond. | `diarize-worker.ts:116-137` |
| 1.6 | **Choix du mode à deux pistes fragile.** Il bascule sur `two-track` dès que le son du Mac dépasse 0,01 RMS pendant 3 s cumulées (notification, vidéo, son d'interface). La diarisation tourne alors sur la **piste du Mac**, qui ne contient pas les voix de la salle, et « Moi » est déduit par une règle d'énergie (`micro > 0,015 ET > 2 × Mac`), sans écho annulé. Les tours « Moi » s'ajoutent aux groupes S0..Sn sans contrôle de chevauchement. En visio, le codec et les bascules de haut-parleur de l'appli créent aussi des groupes en trop. | `diarize-worker.ts:278-301` (285-286, 292) ; capture du son du Mac activée par défaut, `settings.ts:50` |
| 1.7 | **Toute étiquette distincte devient « Personne n »**, sans validation : nombre de tours, durée minimale, plafond. | `speakers.ts:52-59` |

**Conclusion.** Sans nombre de locuteurs connu et sans fusion des centroïdes, un regroupement à seuil fixe sur 30 min d'audio réel sur-segmente, ce qui est classique avec pyannote et sherpa. La sur-segmentation **alimente aussi les problèmes 2 et 3** à travers `splitAtTurns`, voir 2.3 et 3.5.

---

## 3. Problème 2 : environ 5 min d'attente après l'arrêt

Tout est **séquentiel** et ne démarre **qu'après l'arrêt** (`notes.ts:427-458`). Estimation pour une réunion de 30 min (environ 4 000 à 4 500 mots, environ 330 segments VAD) sur un Mac M-series de 16 Go :

| Étape après l'arrêt | Code | Estimation (30 min) | Pourquoi |
|---|---|---|---|
| a. Vidage de la file Whisper | `notes.ts:428-433` | 1 à 10 s (parfois plus) | À l'équilibre, le serveur tient le temps réel (environ 0,3-0,6 s par segment de 6 s). Mais chaque « sortie en boucle » bascule sur **whisper-cli, qui recharge le modèle de 574 Mo** (1,5 à 4 s par segment, `whisper.ts:315-329`). Le journal en montre régulièrement, ce qui peut créer un retard qui s'accumule. |
| b. Diarisation (processus séparé) | `diarization.ts:117-153`, `diarize-worker.ts` | **90 à 240 s** | Mesuré à « environ 5 % de la durée sur M4 » pour 2 min. Sur 30 min : environ 90 s sur M4, 1,5 à 2 fois plus sur M1/M2. Le nombre d'empreintes croît avec la durée (fenêtres de 10 s glissantes), puis `refine()` calcule une empreinte de plus par morceau d'au moins 0,6 s. 4 threads seulement. Garde-fou de durée : 50 % de l'audio, soit 15 min (`diarization.ts:137`). |
| c. `splitAtTurns` (re-transcription) | `notes.ts:469-503`, `speakers.ts:67-90` | **60 à 180 s** | **Un appel Whisper par morceau, en série**, pour chaque segment qui chevauche un changement de locuteur. Avec 14 faux locuteurs, une grande part des segments est coupée : 100 à 250 appels × 0,3 à 0,7 s (bien plus en cas de repli CLI). |
| d. Organisation par le LLM | `llm/notes.ts:192-253` | **60 à 180 s** (pire cas : plus de 5 min) | Plus de 3 500 mots donnent 2 parties, chacune avec une sortie de 3 500 × 1,8 + 2 000 ≈ **8 300 jetons maximum** (`:208`). Les parties sont appelées **l'une après l'autre** (`:216-225`), puis viennent la **fusion** (`:228`) et souvent une **passe de couverture** qui **réécrit tout le compte rendu** (`:231-241`), soit 3 à 4 appels lourds en série. Gemini flash-lite génère environ 150 à 250 jetons/s, soit 20 à 60 s par appel. Groq gratuit plafonne à environ 6 000-30 000 jetons/min selon le modèle, d'où des 429 et le passage au fournisseur suivant. Chaque fournisseur a **120 s de délai** (`:169`) ; Ollama vient en dernier avec 300 s. |
| e. Écriture et index | `notes.ts:590-602` | moins de 0,1 s | |
| **Total** | | **≈ 3,5 à 10 min**, cohérent avec les 5 min observées | Wispr et Granola montrent la transcription tout de suite et produisent le résumé à partir d'un texte déjà prêt, en un seul appel diffusé au fil de l'eau. |

Autres causes :
- Les étapes b, c et d auraient pu **commencer pendant la réunion** : diarisation incrémentale, résumés partiels par bloc de 5 min.
- L'interface n'affiche rien d'exploitable pendant l'attente : barre « Organisation 1/3 », `design/app/notes.js:819-837`, alors que la transcription brute existe déjà.
- `outTokens` gonfle la sortie demandée au-delà de la longueur de la transcription (« compte rendu exhaustif v2 », 9 sections, plus « Par personne » et « Chronologie »). Le temps de génération est proportionnel au nombre de jetons produits.

---

## 4. Problème 3 : des mots perdus

| # | Cause racine | Preuve |
|---|---|---|
| 3.1 | **Coupe forcée toutes les 6 s au milieu de la parole.** En réunion, la parole est continue et la pause de 300 ms n'arrive pas toujours. On coupe alors à la trame de 20 ms la plus calme de la dernière 1,5 s, souvent **au milieu d'un mot**. Les deux appels Whisper reçoivent chacun un demi-mot et l'éliminent ou le déforment. **Aucun chevauchement** entre segments. | `vad.ts:52` (6 s), `vad.ts:93-108`, `vad.ts:111` |
| 3.2 | **Seuil de parole absolu de 0,01 RMS (environ −40 dBFS).** Les voix lointaines (micro du MacBook, interlocuteurs à 1-2 m) restent sous ce seuil et sont classées « silence ». `trimSilence` les rogne ; si tout le segment est sous le seuil, il **n'est jamais envoyé** (`if (audio.length)`). La marge de 150 ms rogne aussi les attaques et fins de mots faibles. | `vad.ts:145`, `vad.ts:148-165`, `renderer/recorder.ts:441-444` |
| 3.3 | **Suppression de bruit WebRTC activée** (`noiseSuppression: !lowVoice`). Elle est conçue pour une voix proche du micro et atténue les voix lointaines de la salle. L'**annulation d'écho est désactivée**, donc en visio la voix distante est présente deux fois dans le mélange (piste du Mac + écho capté par le micro, décalé) : effet de réverbération qui dégrade Whisper. Le mélange est une **somme écrêtée** micro + Mac. | `renderer/recorder.ts:359`, `:199-205` |
| 3.4 | **Paramètres Whisper tirés de la dictée.** Contexte audio réduit à 640 (12,8 s au lieu de 30 s), décodage glouton (beam 1, sans repli de température), et un prompt qui contient « Dictée en français… » plus les 200 derniers caractères. Le prompt de contexte fait **halluciner et boucler** Whisper (journal : sorties de 700 à 870 caractères), et un modèle conditionné sur le texte précédent **saute** volontiers des mots. | `whisper.ts:150, 190, 231-247` ; `notes.ts:111-120, 287-291` ; `settings.ts:42` |
| 3.5 | **`splitAtTurns` perd des morceaux.** Les morceaux de 0,7 à 2 s re-transcrits isolément renvoient souvent du texte vide ; un morceau vide est **jeté** (`if (w.text)`), et on ne revient au texte d'origine que si *tous* les morceaux sont vides. Plus la diarisation éclate les voix (14 au lieu de 3), plus il y a de coupes et de mots perdus. | `notes.ts:485-494`, `speakers.ts:67-90` (`minMs = 700`) |
| 3.6 | **Erreurs silencieuses.** Un segment en échec (délai dépassé, erreur HTTP, CLI) est seulement journalisé, **jamais rejoué** depuis le WAV complet pourtant disponible. | `notes.ts:299-301` |
| 3.7 | **Filtres anti-hallucination trop larges.** `^merci d'avoir regard[ée]` et `^\(.*\)$` vident **tout le segment** dès qu'il *commence* par ces mots : un vrai « Merci d'avoir regardé le devis, … » disparaît en entier. La sortie de whisper-cli **n'est pas vérifiée** contre les boucles (`transcribeCli`), donc une répétition de 870 caractères peut entrer dans la transcription et pousser le LLM à couper. | `whisper.ts:105-111`, `whisper.ts:332-376` |
| 3.8 | Le LLM compresse ce qui reste. `preClean` puis les règles « seules disparaissent les hésitations… » : un compte rendu n'est pas une transcription. Il faut comparer la **transcription brute** (`<id>.txt` / `.json`), pas le .md, à celle de Wispr. | `llm/notes.ts:197, 27` |

---

## 5. Quick wins (de quelques heures à 1 jour chacun, sans refonte)

**Personnes**
1. **Champ « Nombre de participants » (défaut : auto)**, transmis à `clustering.numClusters` (`diarize-worker.ts:145`). C'est le correctif le plus efficace quand le nombre est connu.
2. En mode auto : **fusionner les centroïdes** dont la similarité cosinus dépasse environ 0,55-0,65 après `refine()`, **plafonner** à 6 groupes, et absorber les groupes de moins de max(20 s, 5 %).
3. Mode à deux pistes uniquement si la piste du Mac contient vraiment de la parole sur une durée significative (par exemple plus de 10 % du temps, et non 3 s cumulées).

**Attente**
4. **Supprimer `splitAtTurns`** ou le limiter (morceaux d'au moins 2 s, en parallèle, texte d'origine conservé en cas d'échec). Gain : 1 à 3 min, et moins de mots perdus.
5. **Un seul appel LLM** quand le fournisseur a un grand contexte : Gemini flash-lite accepte plus de 30 000 mots, alors que `CHUNK_WORDS` est fixé à 3 500. Sinon, lancer les parties **en parallèle** (`Promise.all`). Passe de couverture seulement si nécessaire et limitée aux ajouts. Budget de sortie environ divisé par deux (le compte rendu n'a pas à être plus long que la transcription).
6. **Afficher la transcription brute dès l'arrêt** (« Note prête — compte rendu en cours »). Le temps perçu tombe à quelques secondes.
7. Lancer la diarisation **en parallèle** du vidage de la file Whisper (CPU d'un côté, GPU/Metal de l'autre), et passer à 6 threads sur les puces qui ont 6 cœurs de performance ou plus.

**Mots**
8. Mode notes du VAD : seuil absolu 0,01 → environ 0,003 (ou relatif au bruit seulement), marge 150 → 300 ms, **chevauchement de 0,5 s** entre segments, coupe forcée remontée vers environ 12 s (dans la limite de `AUDIO_CTX`).
9. Notes : `noiseSuppression: false` sur le micro. Transcrire **la piste du Mac et celle du micro séparément** plutôt que leur somme écrêtée ; c'est en plus une séparation « Moi / les autres » gratuite.
10. Prompt Whisper des notes : vocabulaire seulement, sans « Dictée… » ni les 200 derniers caractères (pour casser les boucles). Vérifier aussi les boucles en sortie de whisper-cli.
11. Rejouer depuis le WAV complet, après l'arrêt, les segments en échec ou vides.
12. Filtres d'hallucination : ne retirer que si **tout** le texte correspond (`^…$`), pas le seul début.

## 6. Refonte recommandée : « dictaphone + traitement au fil de l'eau »

C'est l'idée de la fondatrice. Le WAV continu existe déjà ; il faut en faire **la source unique**.

1. **Transcription continue sur des fenêtres de 30 s qui se chevauchent de 5 s**, lues dans le WAV de session et non plus dans les segments VAD. Contexte audio complet de 1 500, horodatage par mot, VAD Silero intégré à whisper.cpp (`--vad`) au lieu du VAD par énergie. Déduplication du chevauchement par horodatage. Prévoir une **instance whisper-server dédiée aux notes** (`-ac 1500`, environ 0,6 Go), car le serveur de dictée garde son contexte de 640 fixe (`whisper.ts:144-150`). Latence du dernier bloc après l'arrêt : 1 à 3 s.
2. **Diarisation incrémentale** : empreintes TitaNet calculées pendant la réunion sur chaque fenêtre. À l'arrêt, il ne reste que le regroupement (moins de 5 s), avec `numClusters` si connu, sinon auto, fusion et plafond. Attribution des **mots** par leur horodatage : plus de re-transcription.
3. **LLM au fil de l'eau** : un résumé partiel par bloc de 5 à 10 min pendant la réunion, puis une seule synthèse finale **diffusée en direct** (`stream`) à l'arrêt, avec un modèle à grand contexte.
4. Option « qualité maximale » en tâche de fond : re-transcrire tout le WAV avec large-v3 et un beam de 5 après l'arrêt (RTF environ 0,05 à 0,1 sur M-series, soit 1,5 à 3 min pour 30 min). La note s'améliore ensuite **sans bloquer** l'utilisatrice.

**Objectif** : la transcription avec les personnes s'affiche **en moins de 10 s**, le compte rendu en moins de 30-45 s, avec 3 locuteurs quand 3 sont annoncés.

## 7. Mesures à faire pour valider (sans Ollama)

- Récupérer `dicta.log` sur le Mac de la réunion : lire les durées de `transcription finie`, `diarisation`, `segment(s) à cheval` et `organisée`, et compter les `sortie en boucle`.
- Avec `notes.keepAudio = true` : rejouer le WAV dans `diarize-worker.js` (mode ligne de commande, `diarize-worker.ts:322-324`) avec `numClusters` à 3 et à −1, et des seuils de 0,8 à 1,0.
- Comparer le nombre de mots de `<id>.txt` à une transcription de référence, en distinguant les mots perdus aux coupes de 6 s (3.1), ceux sous le seuil (3.2) et ceux perdus par `splitAtTurns` (3.5).
