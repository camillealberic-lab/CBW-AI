# 02 — Veille : notes de réunion complètes, locuteurs fiables, résultat quasi instantané

Date : 15/10/2026. Lecture seule (web + code open source cloné en local, rien publié).
Légende : **PROUVÉ** = source primaire (doc officielle, code, papier, benchmark publié) · **OBSERVÉ** = test ou revue tierce · **SUPPOSÉ** = déduction de ma part, à mesurer.

---

## 0. En une minute

1. **Personne ne fait « dictaphone puis tout traiter ».** Les leaders transcrivent **pendant** la réunion (texte live), puis à l'arrêt **repassent** sur l'enregistrement complet (Wispr : « re-reads the full recording with additional context »), lancent la diarisation **offline sur l'audio complet**, puis le résumé. CBW AI fait déjà ce schéma : transcription incrémentale + diarisation après.
2. **Deux pistes séparées = la base de l'identification.** Micro = « Moi », son du Mac = « les autres ». Granola s'arrête là sur desktop (Me/Them). Char/Anarlog (code lu) **ne diarise jamais la piste micro** sur un appel, mais seulement la piste système, avec un budget « nombre de participants − 1 ».
3. **Les vrais noms viennent rarement de la voix.** Ils viennent : du calendrier (Wispr, Notion), de l'UI de l'appli de visio lue via l'Accessibilité (Granola sur Zoom/Teams/Meet), ou d'**empreintes vocales mémorisées après un premier renommage** (Otter, Jamie, Char).
4. **Diarisation locale sur Mac** : FluidAudio (Core ML/ANE) fait **15 % de DER à 122–150× le temps réel**, soit **≈ 12–15 s pour 30 min** sur M2 Air. sherpa-onnx (CPU) est la même famille (pyannote seg 3.0 + embeddings), mais plus lent. Le levier le plus rentable reste **l'embedding et le clustering** (seuil, nombre de locuteurs fourni, absorption des petits clusters).
5. **ASR plus rapide en français** : Parakeet TDT v3 donne **5,9 % de WER FR (FLEURS) à ~200×** sur M4 Pro via FluidAudio, contre 6,31 % pour Whisper large-v3 (papier NVIDIA). Il est ~10× plus rapide que turbo et pèse ~50 Mo de modèle.
6. **Résumé en quelques secondes** : 30 min de parole, c'est ~4–5 k mots, soit ~7–9 k tokens. Sur Groq ou Gemini Flash, la note sort en **3–8 s**. Elle paraît instantanée si on l'affiche en streaming et si un brouillon a été préparé pendant la réunion.

---

## 1. Outils du marché

### Wispr Flow Notetaker (Mac, sorti le 5 août 2026)
- **PROUVÉ** (annonce officielle, https://wisprflow.ai/post/wispr-flow-notetaker) :
  - transcription live pendant la réunion ;
  - après l'arrêt, « re-reads the full recording with additional context » pour produire une transcription finale plus juste ;
  - noms tirés de l'invitation du calendrier ;
  - contexte injecté : dictionnaire personnel, Slack, calendrier ;
  - livrables : résumé par sujets, décisions, dates, prochaines étapes avec responsables ;
  - « What did I miss? » pendant l'appel ; Q&A sur l'historique ; MCP.
- **PROUVÉ** (page Wispr, https://wisprflow.ai/notetaker/what-is-system-audio-capture) : permission séparée « Capture what others say » (audio système), macOS 14.4 minimum. Sans elle, l'enregistrement se fait au micro seul, et alors « one person can occasionally split into two anonymous speakers ».
- **OBSERVÉ** (tl;dv, https://tldv.io/blog/wispr-flow-notetaker-review/) :
  - live étiqueté « You / Them » (juste) ;
  - après la réunion, sur un test de 5 min à 3 personnes, **3 étiquettes toutes fausses** : un locuteur coupé en deux, un autre fondu avec l'auteur ;
  - 3 étapes de traitement après l'appel, puis une notification « résumé prêt » (durée non publiée) ;
  - pas d'audio conservé, donc pas de réécoute possible ;
  - ~1 Go de RAM pendant l'enregistrement ;
  - 21 langues annoncées.
- **OBSERVÉ** (presse : TechCrunch https://techcrunch.com/2026/08/05/wispr-flow-is-preparing-to-launch-a-meeting-notetaker-updated-terms-suggest/, 9to5Mac https://9to5mac.com/2026/08/05/wispr-flow-takes-on-ai-meeting-assistants-with-notetaker-its-first-product-beyond-dictation/) : sans bot, audio système, traitement côté serveur, anglais seul au lancement.
- **À retenir** : même le leader de la dictée se trompe sur la diarisation à 3 voix. Le différenciant visible, c'est live + « Moi/Eux » fiable + passe finale + calendrier.

### Granola
- **PROUVÉ** (https://docs.granola.ai/help-center/taking-notes/transcription.md) :
  - « Me » = micro, « Them » = audio système, en bulles vertes à droite et grises à gauche ;
  - flux combiné micro + système, envoyé en direct au fournisseur de transcription, **aucun audio enregistré** ;
  - arrêt automatique en fin d'appel, après 15 min sans audio ou à la mise en veille ;
  - pas de diarisation live sur desktop ;
  - chunks de transcription copiables et supprimables ; recherche ; jargon personnel et d'équipe.
- **PROUVÉ** (https://docs.granola.ai/help-center/taking-notes/speaker-attribution) : les « speaker tags » donnent le nom affiché de chaque participant. Ils passent par l'extension Chrome pour Meet et par **la permission Accessibilité pour lire les noms dans Zoom desktop (macOS)** ; Teams a été ajouté ensuite (OBSERVÉ, https://createwith.com/tool/granola/updates/granola-brings-speaker-tags-to-microsoft-teams). Pas de rétroactivité ; les salles partagées et les chevauchements restent sources d'erreurs.
- **PROUVÉ/OBSERVÉ** : à la détection de la fin d'appel, enrichissement automatique avec le gabarit par défaut « Auto ». Les notes tapées par l'utilisateur sont gardées en noir, l'IA ajoute en gris (https://zapier.com/blog/granola-ai). Le gabarit type contient : métadonnées, ordre du jour, décisions, actions avec responsable et échéance, prochaines étapes (https://www.granola.ai/blog/meeting-recipes-repeatable-formats).

### Otter, Jamie, Notion, Fireflies, tl;dv, Krisp, Bluedot
- **Otter (OBSERVÉ)**, revues et guides : diarisation + **empreinte vocale**. L'utilisateur enregistre la sienne ; pour les autres, une fois quelques segments étiquetés (~15 s de voix), Otter les reconnaît dans les réunions suivantes.
- **Jamie (PROUVÉ**, https://docs.meetjamie.ai/getting-started/identify-speaker) : sans bot, capte micro + sortie haut-parleur. Après la note, **on écoute de courts extraits et on nomme chaque locuteur**, et Jamie s'en souvient pour les réunions suivantes. La doc reconnaît qu'il peut couper une personne en deux ou en rater une.
- **Notion AI Meeting Notes (PROUVÉ**, https://www.notion.com/help/ai-meeting-notes) : app desktop, micro + audio système (permission d'enregistrement d'écran). Étiquetage fiable surtout en **1:1** ; nom de l'autre participant tiré du calendrier ; peu fiable en groupe ou avec un micro partagé. Nouvelle ligne à chaque changement de locuteur ; citations du résumé qui renvoient à la ligne exacte au survol et au clic.
- **Fireflies, tl;dv** : bot qui rejoint l'appel. Les noms viennent de la plateforme (flux par participant), d'où une identification quasi parfaite. Ce n'est pas reproductible en local sans bot (SUPPOSÉ, cohérent avec Granola qui lit l'UI).
- **Krisp, Bluedot** : pas de doc primaire trouvée sur la diarisation locale. Non conclu.

### Apple (Notes, Mémos vocaux, SpeechAnalyzer)
- **OBSERVÉ** : transcription locale dans Mémos vocaux (macOS 15+) et Notes (macOS 26). **Pas d'étiquettes de locuteurs** (https://fireflies.ai/blog/transcription-software-for-mac/).
- **OBSERVÉ** : un benchmark tiers donne SpeechAnalyzer à 2,12 % de WER sur LibriSpeech propre, ~3× plus rapide que Whisper small (https://www.macg.co/macos/2026/07/speechanalyzer-un-benchmark-confirme-que-la-transcription-dapple-bat-le-whisper-dopenai-309741). Un autre : 34 min transcrites en ~45 s. **Aucun chiffre en français** : piste à tester, pas à adopter.

### Apps Mac locales (MacWhisper, Superwhisper)
- **MacWhisper (OBSERVÉ**, heise https://heise.de/-10322414, Simon Willison https://simonwillison.net/2025/Nov/18/macwhisper-speaker-recognition/) : reconnaissance des locuteurs via **Argmax SpeakerKit/WhisperKit Pro** (en Pro), Parakeet disponible, « works really well » sur un conseil municipal.
- **Superwhisper (OBSERVÉ/PROUVÉ partiel**, https://superwhisper.com/meeting-transcription) : audio système, tout en local, option « Identify Speakers » désactivée par défaut. Le résumé IA ne tient pas compte de qui a dit quoi, et sa propre table comparative se contredit.

### Open source : code lu
- **Char / Hyprnote → aujourd'hui `fastrepl/anarlog`** (https://github.com/fastrepl/anarlog, Rust + TS, actif le 15/10/2026). C'est la référence la plus proche de notre cas :
  - **Deux runtimes.** `crates/listener-core` (live : acteurs source → listener → recorder, VAD masking, AEC) et `crates/listener2-core` (batch après l'arrêt, avec un mode « progressive » qui streame la progression de whisper.cpp).
  - **Capture.** Micro + audio système en **stéréo : canal 0 = micro direct (« You »), canal 1 = tous les distants**. L'audio système passe par une process tap Core Audio (`crates/tcc/swift-lib`, `crates/audio*`). AEC neuronale ONNX (`crates/aec`, blocs 512/128, de type DTLN) pour retirer l'écho des haut-parleurs du micro.
  - **Diarisation locale** (`crates/listener2-core/src/batch/diarize.rs`, `crates/pyannote-local`) : « mirrors pyannote.audio 3.1 », pensée pour le CPU en batch après l'enregistrement. Règles lues dans le code :
    - le canal micro d'un appel **n'est pas diarisé** (`channel_audio` renvoie `None` pour (2,2,0)) ;
    - le canal système est diarisé avec un plafond de **participants − 1** (`shift = 1`) ;
    - **réunion en présentiel détectée** quand plusieurs participants sont annoncés mais que le canal système contient ≤ 3 s de parole : le micro est alors diarisé avec le nombre total (`in_person_capture`, `REMOTE_SILENCE_MAX_SECONDS = 3.0`) ;
    - un « micro partagé » a son propre canal (`SHARED_MIC_CHANNEL = 2`), dont les voix sont nommées au lieu d'être fondues dans « You » ;
    - quand le fournisseur a coupé une voix en deux, `expected_speaker_cap` force le regroupement.
  - **Paramètres** (`pyannote-local/src/pipeline.rs`) :
    - fenêtres de 10 s, pas de 2 s (« ≤ 5 fenêtres par trame → vote majoritaire ») ;
    - `min_embedding_seconds 1.0`, `min_activity_seconds 0.3` : les blips courts sont rattachés au cluster le plus proche, pas jetés ;
    - **clustering agglomératif centroïde, seuil 0.7045** (euclidien sur vecteurs normalisés) ;
    - **`min_cluster_seconds 12`** : les clusters de moins de 12 s sont absorbés par leurs voisins ;
    - `max_windows 1800`, c'est-à-dire un pas qui grandit sur les longues réunions pour borner le calcul ;
    - si le nombre de locuteurs est fourni (exact ou min/max), la coupe du dendrogramme la plus proche du seuil qui respecte ces bornes est retenue (`clustering.rs`).
  - **Empreintes vocales** (`crates/voiceprint`, `KnownSpeaker`) : des voix de confiance servent à **fusionner les clusters fragmentés** et à nommer les locuteurs (score cosinus minimal + marge d'unicité).
  - **Méthode d'optimisation** (`pyannote-local/eval/PROGRAM.md`) : boucle « un changement, une mesure » sur AMI + VoxConverse dev, DER collar 0,25 s, avec une **contrainte rtf < 0.15**. Idées listées : agrégation douce des probabilités, hystérésis, balayage du seuil, pas adaptatif (1 s sous 20 min).
  - Fournisseurs ASR : whisper.cpp local, Soniqo/Parakeet (chunks ≤ 29,5 s, `SONIQO_PARAKEET_MAX_CHUNK_SAMPLES`), Apple SpeechAnalyzer (`crates/transcribe-speechanalyzer`), Argmax, plus des fournisseurs cloud.
- **Meetily** (https://github.com/Zackriya-Solutions/meetily, Tauri/Rust) :
  - micro + système (ScreenCaptureKit), mixage avec ducking RMS pour l'enregistrement, chemin séparé filtré par VAD pour Whisper ;
  - **pas de diarisation** (grep vide) ;
  - VAD Silero : seuils 0.50/0.35, **pre_speech_pad 300 ms**, min_speech 250 ms, redemption configurable. Le commentaire du code note que « 0.55/0.40 avec 400 ms fragmentait la parole en segments de 40 ms » ;
  - résumé par chunks de tokens avec recouvrement (`summary/processor.rs::chunk_text`).
- **Meeting Transcriber** (https://github.com/pasrom/meeting-transcriber, Swift, MIT) :
  - **double piste via `CATapDescription`** (macOS 14.2+) + micro ;
  - WhisperKit ou **Parakeet TDT v3 (~50 Mo, ~10× plus rapide)** ;
  - diarisation FluidAudio **séparée par piste** (« without echo interference »), modes `OfflineDiarizer` et Sortformer (gère les chevauchements) ;
  - **reconnaissance des locuteurs entre réunions** (embeddings + cosinus) ;
  - détection de l'écho haut-parleur → AEC ou dédoublonnage optionnels ;
  - VAD Silero v6 avec remappage des timestamps.
- **Vibe** (https://github.com/thewh1teagle/vibe) : transcription de fichiers whisper.cpp avec diarisation optionnelle. Pas de mode réunion live : non approfondi.

---

## 2. Dictaphone puis traitement, ou transcription en continu ?

| | Dictaphone puis traitement | Continu (incrémental) + passe finale |
|---|---|---|
| Attente après l'arrêt | proportionnelle à la durée (ASR + diarisation + LLM) | ≈ dernier segment + diarisation + LLM |
| Qualité ASR | meilleure (contexte complet, découpe propre) | un peu moins bonne, sauf si l'on refait une passe finale |
| Diarisation | offline sur l'audio complet (la meilleure) | idem, lancée à l'arrêt (le streaming coûte +10–15 pts de DER, cf. §3) |
| UX | rien à voir pendant | texte live, « qu'est-ce que j'ai raté ? », notes horodatées |

**Ce que font les leaders** (PROUVÉ via Wispr, Granola, Anarlog) :
- **ASR en continu** par segments VAD, affichée en live ;
- à l'arrêt, **diarisation offline sur le fichier complet** (plus éventuellement une ré-ASR sur le fichier : Wispr) ;
- **deux pistes** micro/système : « Moi » sans erreur possible, et diarisation limitée aux distants ;
- **résumé** lancé dès que la transcription est prête, affiché en streaming ; mini-résumés possibles pendant l'appel (« What did I miss? »).

**CBW AI aujourd'hui** (lu dans `src/main/notes.ts`, `diarize-worker.ts`) :
- transcription par segments **pendant** la réunion (file `enqueue`) ;
- WAV `mix` / `mic` / `sys` ;
- diarisation sherpa-onnx sur le WAV complet après l'arrêt ;
- mode `two-track` (« Moi » là où le micro domine, S0/S1… sur la piste système) ;
- ré-ASR des segments à cheval sur deux locuteurs (`splitAtTurns`) ;
- embedding **`nemo_en_titanet_small`**, seuil **0.8**, `numClusters -1` (nombre de locuteurs estimé).

L'architecture est donc déjà du bon type. Les écarts portent sur la qualité de la diarisation, sur l'ASR faite sur le **mix** (et non piste par piste) et sur le chemin critique après l'arrêt.

---

## 3. Diarisation locale de qualité

### Chiffres de référence
| Pipeline | DER | Vitesse | Source |
|---|---|---|---|
| pyannote 3.1 (PyTorch) | AMI-IHM 18,8 · AMI-SDM 22,7 · VoxConverse 11,2 | — | PROUVÉ, https://huggingface.co/pyannote/speaker-diarization-community-1 |
| **pyannote community-1** (CC-BY-4.0, local) | **17,0 · 19,9 · 11,2** | 37 s/h sur H100 | idem |
| pyannote precision-2 (cloud payant) | 12,9 · 15,6 · 8,5 | 14 s/h sur H100 | idem |
| **FluidAudio offline** (seg pyannote + WeSpeaker v2 + VBx, Core ML/ANE) | **15,1 %** VoxConverse (13,9 % en « max accuracy ») | **122× M4 Pro, 150× M2 Air** (65× en max accuracy) | PROUVÉ, https://docs.fluidinference.com/diarization/getting-started.md, https://docs.fluidinference.com/reference/benchmarks.md |
| FluidAudio streaming 5 s | 26,2 % (AMI SDM) | 223× | idem : « 10–15 % pire que l'offline » |
| Sortformer (≤ 4 locuteurs, gère les chevauchements) | 31,7 % AMI SDM (miss 21,5 %) | 127× M2 | idem : bon en bruit, mauvais à 5+ voix |
| sherpa-onnx (seg pyannote 3.0 + 3D-Speaker/WeSpeaker/TitaNet) | non publié | CPU | à mesurer sur notre corpus |

### Embeddings (sherpa-onnx)
Modèles disponibles : https://huggingface.co/csukuangfj/speaker-embedding-models.
- **PROUVÉ** (EER VoxCeleb1-O, auto-déclaré, https://github.com/modelscope/3D-Speaker) : ERes2NetV2 0,61 %, ERes2Net-large 0,52 %, CAM++ 0,65 %. WeSpeaker ResNet293 0,447 % (https://arxiv.org/pdf/2306.15161).
- **OBSERVÉ** : ERes2NetV2 est ~10× plus lent que CAM++ en fp32 ; quantifié int8, une fenêtre de 6 s passe de 223 à 77 ms.
- **SUPPOSÉ** : `titanet_small` (entraîné sur de l'anglais) est un choix moyen pour des voix françaises. CAM++ ou ERes2Net (3D-Speaker, entraînés sur des données massives multilingues et chinoises) ou WeSpeaker ResNet34 sont à départager sur 5–10 réunions FR étiquetées.

### Bonnes pratiques (PROUVÉ dans le code Anarlog / la doc FluidAudio, sauf mention)
- **Audio complet, pas par segments** : l'offline bat le streaming de 10–15 pts de DER.
- **Piste micro = utilisateur** sur un appel : ne pas la diariser. Diariser seulement la piste système, avec `numClusters = participants − 1` si connu.
- **Présentiel** (piste système quasi muette) : diariser le micro avec le nombre total de présents.
- **« Combien êtes-vous ? »**, demandé ou déduit du calendrier : contraindre la coupe du dendrogramme (exact ou min/max), sinon garder le seuil.
- **Fusion des sur-segmentations** : absorber les clusters de moins de ~12 s ; fusionner deux clusters si leurs centroïdes dépassent un cosinus donné, ou s'ils matchent la même empreinte connue.
- **Empreintes connues** : charger les voix déjà nommées (FluidAudio « pre-load speaker embeddings », Anarlog `KnownSpeaker`, Otter, Jamie). C'est le « renommer une fois ».
- Seuils FluidAudio : `clusteringThreshold` 0.7 (exemple de config), CLI 0.6, `minSpeechDuration` 1.0 s, `minSilenceGap` 0.5 s.

---

## 4. Ne perdre aucun mot

- **VAD Silero, pièges** (PROUVÉ, code Meetily `audio/vad.rs` et aide whisper-server) :
  - seuils trop stricts → parole hachée en fragments de 40 ms ;
  - padding trop court → débuts et fins de mots coupés. Meetily utilise **pre_speech_pad 300 ms** ; whisper-server a un défaut de **`--vad-speech-pad-ms 30`**, trop court pour du conversationnel (SUPPOSÉ : viser 200–300 ms) ;
  - options whisper-server : `--vad`, `-vt 0.50`, `-vspd 250`, `-vsd 100`, `-vmsd` (découpe max), `-vp 30`, `-vo 0.10` (recouvrement) (https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/examples/server/README.md) ;
  - FluidAudio Silero v6 : rappel 95,8 % en propre mais **78,9 % sur MUSAN** (bruit, musique). Un VAD peut avaler de la parole faible : toujours garder le WAV complet et laisser la passe finale repêcher.
- **Whisper sur les longs fichiers** (PROUVÉ, WhisperX https://arxiv.org/pdf/2303.00747) : découper aux frontières VAD (« Cut & Merge ») réduit les hallucinations et les répétitions (5-grammes dupliqués), au lieu de se fier aux timestamps décodés. `condition_on_previous_text` propage hallucinations et boucles (https://github.com/openai/whisper/discussions/679, https://arxiv.org/html/2501.11378v1). On garde un prompt court (noms, vocabulaire, ≤ 200 car. de contexte, ce que CBW fait déjà) ; on ne chaîne jamais le texte précédent entier.
- **Chevauchements** : deux pistes séparées, c'est la seule façon simple de ne pas perdre la phrase de l'utilisateur quand un distant parle en même temps. Il faut alors **transcrire chaque piste séparément** (Granola, Anarlog), pas le mix. Sur haut-parleurs, l'écho rentre dans le micro : AEC (Anarlog DTLN ONNX ; FluidAudio LocalVQE 4,8 M, 16 ms, bêta) ou dédoublonnage textuel.
- **Modèles rapides sur Mac** :
  - **Parakeet TDT v3 (Core ML, FluidAudio)** : FR FLEURS **WER 5,9 %, CER 2,2 %, RTFx ~200** (M4 Pro) (PROUVÉ, benchmarks FluidAudio). Papier NVIDIA : FR FLEURS **5,15 % contre 6,31 %** pour Whisper large-v3 (PROUVÉ, https://arxiv.org/pdf/2509.14128). 25 langues européennes, ~10× plus rapide que turbo (OBSERVÉ). Pas de prompt de noms, mais boosting CTC du vocabulaire.
  - whisper large-v3-turbo : décodeur à 4 couches au lieu de 32 (809 M). Aucun WER FR publié trouvé pour turbo.
  - WhisperKit (ANE) : 0,46 s de latence et 2,2 % de WER en streaming anglais (PROUVÉ, https://arxiv.org/html/2507.10860v1). Pas de comparatif propre avec whisper.cpp Metal.
  - mlx-whisper turbo : ~14× temps réel sur M1 Max (OBSERVÉ, https://vllm-mlx.is-a.dev/es/benchmarks/audio/).
  - SpeechAnalyzer : pas de chiffre FR.
  - **Aucun benchmark FR sur des réunions** (parole spontanée, plusieurs voix) : il faut le nôtre.

---

## 5. Résumé rapide

- Taille : 30 min ≈ 4–5 k mots FR, soit **~7–9 k tokens** en entrée (SUPPOSÉ, ~150 mots/min). Cela tient dans un seul appel : pas besoin de map-reduce sous ~2 h.
- Vitesse : Groq (gpt-oss-120b, qwen) ou Gemini Flash. Le premier token arrive en < 1 s et 1–2 k tokens de sortie prennent **~3–6 s** (SUPPOSÉ, cohérent avec les `cleanMs` de 2–3 s observés dans `~/.dicta-ai/dicta.log` pour la dictée).
- **Streaming** : afficher le compte rendu au fur et à mesure (titre et TL;DR d'abord). C'est le gain perçu principal.
- **Incrémental pendant la réunion** : brouillon « points saillants » toutes les ~5 min (comme « What did I miss? »). À l'arrêt, le prompt final reçoit le brouillon et la transcription diarisée : résumé plus stable et plus court à générer (SUPPOSÉ).
- **Structure plébiscitée** (Granola, Wispr, Notion, PROUVÉ) :
  - titre auto ;
  - TL;DR en 2–3 lignes ;
  - décisions ;
  - **actions (qui, quoi, échéance)** ;
  - sujets abordés (par thème, pas chronologique) ;
  - questions ouvertes ;
  - **chaque point cliquable vers l'instant de la transcription** (Notion, Wispr).

---

## 6. UX : ce qui rend ces outils « visuels »

- Transcription **live** en bulles Moi (droite) / Eux (gauche) (Granola). Indicateur d'enregistrement flottant hors de l'app.
- **Noms réels** : calendrier, lecture de l'UI de la visio (Accessibilité), sinon « Locuteur 1 » cliquable.
- **Renommer une fois** : clic sur « Locuteur 2 » → nom, propagé à toute la note **et mémorisé** (empreinte) pour les réunions suivantes (Otter, Jamie, Char).
- **Extraits audio cliquables** pour identifier une voix (Jamie) : c'est l'argument contre Wispr, qui ne garde pas l'audio.
- Timeline ou barre de parole par personne (temps de parole), recherche, citations du résumé qui sautent à l'instant précis.
- Notes tapées par l'utilisateur gardées et distinguées de l'IA (noir et gris, Granola).
- Actions : copier, envoyer, exporter vers Notion ou MCP ; titre automatique ; notification « note prête ».

---

## 7. Recommandation pour CBW AI (classée par gain/effort)

Hypothèse : réunion visio de 30 min, M1/M2 16 Go, 3–4 participants.
Temps **SUPPOSÉS** sauf mention ; à valider avec les timings déjà loggés (`timings.diarizeMs`, `organizedAt`).

| # | Étape | Gain | Effort | Effet attendu |
|---|---|---|---|---|
| 1 | **« Combien êtes-vous ? »** (1 tap au démarrage ou à l'arrêt, prérempli par le calendrier si dispo) → `numClusters = n − 1` sur la piste système, `n` en présentiel | ★★★ | faible | supprime la plupart des sur- et sous-segmentations (le bug type de Wispr) |
| 2 | **Règles deux pistes à la Anarlog** : micro jamais diarisé sur un appel (= « Moi ») ; présentiel détecté si la piste système a ≤ 3 s de parole → diariser le micro ; absorber les clusters < 12 s ; fusionner les centroïdes proches | ★★★ | faible | identification fiable de l'utilisateur et des distants |
| 3 | **Changer d'embedding** : remplacer `nemo_en_titanet_small` (anglais) par CAM++ ou ERes2Net (3D-Speaker) ou WeSpeaker ResNet34 ; **balayer le seuil** (0.6–0.9) sur 5–10 réunions FR étiquetées (DER collar 0,25 s, méthode `PROGRAM.md` d'Anarlog) | ★★★ | faible-moyen | DER mesuré au lieu d'estimé ; seuil adapté au français |
| 4 | **ASR par piste** (micro et système transcrits séparément, pas le mix) + VAD padding 250–300 ms + petit recouvrement | ★★ | moyen | plus de phrases perdues en chevauchement ; « Moi » exact au mot près ; supprime l'essentiel de `splitAtTurns` |
| 5 | **Renommer une fois + empreintes mémorisées** (centroïde par personne dans `~/.dicta-ai`, cosinus + marge) ; extraits audio de 3 s cliquables pour identifier | ★★★ | moyen | les réunions récurrentes sortent nommées automatiquement |
| 6 | **Résumé en streaming + brouillon incrémental toutes les 5 min** (Groq/Gemini Flash, prompt ≤ 10 k tokens) ; structure TL;DR / décisions / actions qui-quoi-quand / sujets / questions, citations horodatées | ★★ | faible-moyen | note perçue comme « prête » en 1–2 s, complète en ~5 s |
| 7 | **FluidAudio en binaire Swift** (comme `scripts/fnwatch.swift`) pour la diarisation offline sur ANE (+ VBx, + empreintes connues) | ★★ | moyen | diarisation de 30 min en **~12–15 s** (PROUVÉ 150× sur M2 Air), CPU libre, moins de RAM que onnxruntime |
| 8 | **Parakeet TDT v3 (FluidAudio)** comme ASR des notes, whisper-server gardé pour la dictée ; passe finale complète possible sur 30 min en ~10–20 s | ★★ | moyen-élevé | FR FLEURS 5,9 % contre ~6,3 % ; ~10× plus rapide ; benchmark FR réunion obligatoire avant bascule (pas de prompt de noms, boosting CTC à la place) |
| 9 | **Capture système via Core Audio process tap** (`CATapDescription`, macOS 14.2+) au lieu de `getDisplayMedia` loopback | ★ | moyen-élevé | audio seul, sans permission d'enregistrement d'écran ni flux vidéo ; ne réduit pas l'attente. Risque connu : tap muet après plusieurs minutes signalé sur une bêta de macOS 26.5 |
| 10 | Noms via l'UI de Zoom/Teams (Accessibilité), à la Granola | ★★ | élevé | les vrais noms sans renommage ; fragile à chaque mise à jour des apps |

### Pipeline cible et temps (30 min, M-series 16 Go)
1. **Pendant** : segments VAD par piste → whisper-server (ou Parakeet) → texte live Moi/Eux ; brouillon de résumé toutes les 5 min (cloud, ~2 s chacun, en tâche de fond). Retard live ≈ 1–3 s.
2. **Arrêt → transcription prête** : dernier segment seulement, **~1–2 s** (déjà le cas).
3. **Diarisation de la piste système** (n − 1 imposé) : sherpa-onnx actuel ≈ 30–90 s CPU (SUPPOSÉ, à lire dans `diarizeMs`) ; **FluidAudio ≈ 12–15 s** (PROUVÉ). Afficher la transcription Moi/Eux tout de suite et injecter les noms quand la diarisation finit.
4. **Résumé final en streaming** : premier mot < 1 s, complet en **~4–6 s**.
5. **Total perçu** : note lisible **immédiatement** (Moi/Eux), noms et compte rendu complets en **~10–20 s** avec FluidAudio, ~40–100 s avec sherpa-onnx optimisé.

### À mesurer avant de choisir (corpus maison)
- 5–10 réunions FR réelles (visio et présentiel, 2–6 personnes) étiquetées à la main → DER et WER.
- Comparer : TitaNet-small, CAM++ et ERes2Net, avec et sans `numClusters` ; FluidAudio ; Whisper turbo q5 contre Parakeet v3.
- Une seule instance de test à la fois (règle RAM 16 Go), Ollama coupé (`OLLAMA_HOST=http://127.0.0.1:9`).

---

## Sources principales
- Wispr : https://wisprflow.ai/post/wispr-flow-notetaker · https://wisprflow.ai/notetaker/what-is-system-audio-capture · https://tldv.io/blog/wispr-flow-notetaker-review/ · https://techcrunch.com/2026/08/05/wispr-flow-is-preparing-to-launch-a-meeting-notetaker-updated-terms-suggest/
- Granola : https://docs.granola.ai/help-center/taking-notes/transcription.md · https://docs.granola.ai/help-center/taking-notes/speaker-attribution · https://www.granola.ai/blog/meeting-recipes-repeatable-formats
- Notion : https://www.notion.com/help/ai-meeting-notes · Jamie : https://docs.meetjamie.ai/getting-started/identify-speaker
- Code : https://github.com/fastrepl/anarlog (`crates/listener2-core/src/batch/diarize.rs`, `crates/pyannote-local/src/{pipeline,clustering}.rs`, `crates/pyannote-local/eval/PROGRAM.md`, `crates/aec`) · https://github.com/Zackriya-Solutions/meetily (`frontend/src-tauri/src/audio/vad.rs`) · https://github.com/pasrom/meeting-transcriber · https://github.com/FluidInference/FluidAudio
- Benchmarks : https://docs.fluidinference.com/reference/benchmarks.md · https://docs.fluidinference.com/diarization/getting-started.md · https://huggingface.co/pyannote/speaker-diarization-community-1 · https://arxiv.org/pdf/2509.14128 (Parakeet v3) · https://arxiv.org/pdf/2303.00747 (WhisperX) · https://arxiv.org/html/2507.10860v1 (WhisperKit)
- whisper.cpp server : https://github.com/ggml-org/whisper.cpp/blob/master/examples/server/README.md
- Core Audio taps : https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps · https://www.recall.ai/blog/core-audio-taps
