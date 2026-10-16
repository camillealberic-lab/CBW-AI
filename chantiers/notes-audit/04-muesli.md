# Muesli 0.8.5 : analyse complète et comparaison avec CBW AI

15/10/2026. Analyse en lecture seule : rien n'a été lancé ni exécuté, aucun secret lu, et de `muesli.db` seul le schéma a été inspecté.

Repères de fiabilité utilisés dans tout le document :
- **[P] PROUVÉ** : fichier du bundle, fichier de données, code source (chemin + ligne) ou URL.
- **[O] OBSERVÉ** : capture d'écran publique ou page web.
- **[S] SUPPOSÉ** : déduction.

Sources consultées :
- `/Applications/Muesli.app` ;
- `~/Downloads/Muesli-0.8.5.dmg`, monté en lecture seule puis démonté ; le bundle est identique à l'app installée (SHA-1 de tous les fichiers comparés) ;
- `~/Library/Application Support/Muesli` (schéma de la base, noms des réglages) et `~/Library/Application Support/FluidAudio/Models` ;
- le **code source public** de l'app (MIT), cloné : https://github.com/Muesli-HQ/muesli, commit `3362629` du 15/10/2026 ;
- le site https://muesli.works ;
- la doc FluidAudio, https://docs.fluidinference.com.

Les chemins `App/…` désignent `native/MuesliNative/Sources/MuesliNativeApp/…` et `Core/…` désignent `…/Sources/MuesliCore/…`.

---

## 0. En une minute

- **Ce que c'est.** Une app **native Swift / AppKit / SwiftUI**, ni Electron ni Tauri. Open source sous licence MIT, gratuite, financée par les dons (« Buy me a coffee »). Elle combine une dictée façon Wispr Flow et des réunions façon Granola. [P] README.
- **Qui la fait.** Pranav Hari (@pHequals7), sous l'organisation GitHub Muesli-HQ, avec environ 1 400 étoiles et 143 forks. [P] `docs/llms.txt`, [O] page GitHub.
- **Local par défaut.** La transcription se fait sur la puce Apple. Le cloud est optionnel : OpenAI Realtime, OpenRouter, ChatGPT par OAuth, Anthropic, `claude -p` (Claude Code) ou Ollama. [P] README.
- **Télémétrie.** TelemetryDeck, présentée comme anonyme et catégorielle. [P] `Info.plist` (`MuesliTelemetryDeckAppID`, canal `production`).
- **Leurs forces face à nous** :
  1. Pipeline réunion **en deux pistes réellement séparées**, avec annulation d'écho neuronale. Le micro donne « You » et n'est jamais diarisé ; seul le son du Mac est trié par voix.
  2. Découpage VAD Silero de 3 à 5 s, transcrit pendant la réunion, avec point de reprise en base à chaque morceau.
  3. **Aucune re-transcription après la diarisation** : chaque segment est attribué au locuteur qui le recouvre le plus.
  4. Compte rendu en **un seul appel LLM**, et templates intégrés interchangeables après coup.
  5. Notes tapées à la main injectées comme contexte prioritaire, avec un filet qui réinjecte celles que le LLM aurait oubliées.
  6. Détection automatique des réunions (caméra + micro + app ou URL), et calendrier avec « Join & Transcribe ».
  7. « Ask Meetings » : chat sur toutes les réunions avec citations, en recherche lexicale FTS5.
  8. CLI pour agents (`muesli-cli`).
- **Leurs faiblesses face à nous** :
  - nettoyage de dictée et filtres pensés **pour l'anglais** (prompt, liste de mots parasites, suggestions de dictionnaire) ;
  - pas de « combien êtes-vous ? » ;
  - pas de reconnaissance des voix d'une réunion à l'autre ;
  - pas d'arrêt automatique ;
  - pas de découpage d'un long transcript pour le LLM (tout dépend de la fenêtre de contexte du modèle) ;
  - prompts de compte rendu en anglais et génériques.

---

## 1. Bundle

### 1.1 Identité et autorisations [P] `Contents/Info.plist`

- **Identité** : `com.muesli.app`, version 0.8.5, macOS 14.2 minimum, `LSUIElement = true` (app de barre des menus, sans Dock), 222 Mo.
- **Mises à jour** : Sparkle 2.9.3, flux `https://muesli-hq.github.io/muesli/appcast.xml`, signature EdDSA (`SUPublicEDKey`, une clé publique).
- **Autorisations déclarées** :

| Clé | Texte affiché |
|---|---|
| `NSMicrophoneUsageDescription` | dictée |
| `NSAudioCaptureUsageDescription` | « captures system audio from other applications during meeting recordings » : process tap CoreAudio, sans « Enregistrement de l'écran » |
| `NSScreenCaptureUsageDescription` | « screen content for meeting context » : OCR facultatif |
| `NSCalendarsFullAccessUsageDescription` | calendrier |
| `NSContactsUsageDescription` | ajouter des personnes aux notes |
| `NSInputMonitoringUsageDescription` | push-to-talk |

  L'Accessibilité est demandée à l'exécution (collage, lecture du champ), sans clé dans le plist. [P] code `PushToTalkEnablementPolicy.swift`.

### 1.2 Binaires et bibliothèques [P]

- **Exécutables** : `MacOS/Muesli` (83 Mo) et `MacOS/muesli-cli` (14 Mo).
- **Frameworks embarqués** :
  - `llama.framework` : llama.cpp, pour les petits LLM GGUF de nettoyage ;
  - `libCLiteRTLM_mac.dylib` (61 Mo) : Google LiteRT-LM v0.13.1, pour Gemma 4 E2B/E4B ;
  - `Sparkle.framework` ;
  - `libggml*` 0.9.8 (variantes CPU m1, m2_m3, m4) ;
  - `liblocalvqe` : annulation d'écho.
- **Liés dynamiquement (otool)** : CoreML, Metal, Accelerate, AVFAudio, CoreAudio, ScreenCaptureKit, EventKit, Contacts, Vision (OCR), NaturalLanguage (découpage en phrases), Speech (weak, pour Apple SpeechAnalyzer sur macOS 26), CloudKit (sync iCloud), AppIntents (Raccourcis/Siri), CryptoKit, StoreKit.
- **Dépendances Swift** [P] `native/MuesliNative/Package.swift` :
  - **FluidAudio 0.15.5** (épinglé) ;
  - WhisperKit (branche main) ;
  - mlx-swift 0.31.6 ;
  - LLM.swift ;
  - `MimicScribe/dtln-aec-coreml` 0.4.0-beta ;
  - TelemetryDeck.
- **Ressources** :
  - `DTLNAecCoreML_DTLNAec512.bundle` (DTLN-aec en 2 `.mlpackage`) ;
  - `Models/localvqe/localvqe-v1.2-1.3M-f32.gguf` (4,9 Mo) ;
  - sons `quill-activate.wav` / `quill-release.wav` ;
  - police Inter, pour l'export ;
  - logos Zoom, Meet, Teams et Slack pour les notifications ;
  - pas de JS ni d'asar.

### 1.3 Modèles téléchargés sur ce Mac [P] `~/Library/Application Support/FluidAudio/Models`

| Dossier | Contenu | Taille |
|---|---|---|
| `parakeet-unified-en-0.6b-coreml` | `nvidia/parakeet-unified-en-0.6b` : encodeur int8, décodeur et joint (TDT/RNNT), 16 kHz, vocabulaire 1024 | 594 Mo |
| `silero-vad` | `silero-vad-unified-256ms-v6.2.1.mlmodelc` | 1 Mo |
| `speaker-diarization` | `pyannote_segmentation.mlmodelc` + `wespeaker_v2.mlmodelc`, plus `plda-parameters.json` et `xvector-transform.json` (« pyannote-speaker-diarization-community-1 », CC-BY-4.0) | 13 Mo |

Le `metadata.json` de Parakeet Unified précise :
- `compute_units: CPU_ONLY`, FLOAT16 ;
- hors ligne : 15 s maximum par passe ;
- **streaming 70/13/13** (contexte gauche 70 trames, morceau 13, droite 13), latence théorique **2,08 s**.

### 1.4 Modèles proposés au téléchargement [P] strings du binaire et `App/Models.swift`

**Transcription**
- Parakeet TDT v2 (anglais) et **v3** (25 langues, **dont le français**, avec filtre de script par langue).
- Parakeet Unified (anglais), Parakeet Realtime EOU 120M (aperçu live en anglais).
- **Nemotron 3.5 ASR Streaming Multilingual 0.6B**, morceaux de 2,24 s, plus de 100 langues.
- Cohere Transcribe 2B (CoreML en précision mixte, 14 langues).
- Whisper Tiny, Small et Large-v3-Turbo (WhisperKit, ANE), Qwen3-ASR, SenseVoice Small, Bodhan (langues indiennes), Gemma 4 E2B.
- **Apple SpeechAnalyzer** (macOS 26, sans téléchargement).

**Nettoyage local (GGUF)**
- `phequals/qwen35-postproc-v3` (Qwen3.5-0.8B affiné, Q4_K_M, ~505 Mo), réglé par défaut ici (`active_post_processor_id`).
- `superwhisper/s1-mini` (anglais).
- Qwen3.5-0.8B de base.
- Gemma 4 E2B (LiteRT).

**Mesures publiées**
- **Latence de dictée annoncée : ~0,13 s** avec Parakeet sur l'ANE [P] README.
- FluidAudio : Parakeet v3 en **français à 5,9 % de WER** (FLEURS, 350 fichiers) et environ **200× le temps réel** sur M4 Pro ; diarisation pyannote CoreML à environ 15 % de DER [O] docs.fluidinference.com/reference/benchmarks. C'est un chiffre éditeur, sur de la lecture, pas sur des réunions.

### 1.5 Réglages actifs sur ce Mac [P] `config.json` (noms et valeurs non secrets seulement)

| Réglage | Valeur |
|---|---|
| `stt_backend` / `meeting_transcription_backend` | `parakeet-unified` |
| `meeting_live_caption_backend` | `parakeet_realtime_eou` |
| `use_core_audio_tap` | `true` |
| `meeting_summary_backend` | `chatgpt` |
| `meeting_summary_retry_count` | `3` |
| `default_meeting_template_id` | `auto` |
| `enable_double_tap_dictation` | `true` |
| `dictation_combination_activation` | `push_to_talk` |
| `meeting_recording_save_policy` | `never` |
| `meeting_recording_file_format` | `m4a` |
| `indicator_anchor` | `mid_trailing` |
| `post_processor_gemma_model` | `litert-community/gemma-4-E2B-it-litert-lm` |

Autres réglages présents :
- **Réunions** : `meeting_hook_*` (script lancé après chaque réunion), `auto_export_markdown_*`, `muted_meeting_detection_app_bundle_ids`, `scheduled_meeting_notification_lead_time`, `show_meeting_transcript_on_indicator_hover`.
- **Dictée et contexte** : `mute_system_audio_during_dictation`, `pause_media_during_dictation`, `enable_dictation_ocr_context`, `enable_screen_context`.
- **Divers** : `computer_use_*` (pilotage vocal), `custom_llm_api_key_command` (clé via commande shell).

---

## 2. Schéma de données [P] `sqlite3 -readonly muesli.db .schema`

- **`dictations`**
  - colonnes : `raw_text`, `app_context`, `target_app_name`, `target_app_bundle_id`, `duration_seconds`, `word_count` ;
  - **`transcription_backend`, `transcription_model`, `transcription_endpoint`** : le moteur est tracé pour chaque dictée ;
  - champs de synchronisation iCloud (`cloud_record_name`, `sync_dirty`…) ;
  - suppression douce (`deleted_at`).
- **`meetings`**
  - liens calendrier : `calendar_event_id`, `calendar_occurrence_key` (occurrence d'un événement récurrent), `calendar_series_id`, `calendar_source` ;
  - contenu : `raw_transcript`, `formatted_notes`, **`manual_notes`** ;
  - audio : **`mic_audio_path` + `system_audio_path`**, soit **deux pistes audio distinctes**, et `saved_recording_path` ;
  - template : **`selected_template_id/name/kind/prompt`**, une copie du template au moment du résumé ;
  - **`follow_up_to_id`** : chaîne de réunions de suivi ;
  - **`visual_context`** : texte OCR et Accessibilité capturé pendant la réunion ;
  - `folder_id` : dossiers imbriqués via la table `meeting_folders` ;
  - `meeting_status`.
- **`meeting_participants`** : `display_name`, `email_address`, `source` (calendrier ou manuel), `is_suppressed`. Ce sont des **personnes invitées**, pas des voix.
- **`meeting_transcript_checkpoints`** : `speaker`, `start_seconds`, `end_seconds`, `text`. Chaque morceau transcrit est écrit **au fil de l'eau**, ce qui permet la reprise après plantage.
- **`meeting_resume_snapshots`** : reprise d'une réunion terminée.
- **`insights_*`** : statistiques et nuage de mots en cache incrémental.
- **`computer_use_traces`**, **`bodhan_wbcs_measurements`**.

**Ce qui est absent.**
- **Aucune table d'empreintes vocales.** Les locuteurs restent « Speaker N » et ne sont jamais reconnus d'une réunion à l'autre.
- **Aucune table de segments structurés** : le transcript final est un texte `[HH:mm:ss] Speaker: …`.
- **Pas de table de chat** dans ce fichier. [S] Les fils « Ask Meetings » sont stockés dans un autre fichier SQLite, que je n'ai pas vu sur ce Mac ; l'index FTS est décrit dans `docs/meeting-chat-architecture.md`.

---

## 3. Réunions : pipeline détaillé [P] code source

### 3.1 Capture en deux pistes
- **Deux flux complets en parallèle.** Le micro produit « You », le son du Mac produit « Others ». Chaque flux a son propre enregistreur, son propre VAD Silero et son propre collecteur, au format 16 kHz mono Int16. L'horodatage est calculé **en échantillons** (`index / 16000`), donc sans dérive d'horloge. `App/MeetingSession.swift:190-201`, `MeetingChunkTimingTracker.swift:17`.
- **Son du Mac par process tap CoreAudio** :
  - `CATapDescription(stereoGlobalTapButExcludeProcesses:)` (tap privé) dans un *aggregate device* privé, compensation de dérive activée ;
  - démarrage manuel, parce que l'autostart bloquait Zoom (issue #600) ;
  - pas besoin de l'autorisation « Enregistrement de l'écran » ;
  - repli possible sur ScreenCaptureKit (vidéo 2×2 px à 1 image/s, audio 16 kHz mono, excluant l'app elle-même).
  - `App/CoreAudioSystemRecorder.swift:363-390`, `SystemAudioRecorder.swift:161-174`.
- **Micro qui survit aux changements de périphérique (AirPods)** :
  - deux types d'enregistreur (AVAudioEngine et AudioQueue), avec bascule de l'un à l'autre ;
  - l'audio est mis en tampon pendant la bascule (jusqu'à 5 s), donc sans trou ;
  - « santé » du micro : signal nul pendant 3 s alors que le son du Mac est actif, ou micro muet ;
  - jusqu'à 3 tentatives, espacées de 15 s ;
  - distinction entre micro coupé par l'utilisateur et vraie panne.
  - `MeetingMicRecording.swift`, `MeetingMicHealthTracker.swift:62-68`, `MeetingMicRecoveryCoordinator.swift:94-100`.

### 3.2 Annulation d'écho (le point clé pour « Moi »)
- **Moteurs** :
  - **LocalVQE** v1.2 (1,3 M de paramètres, GGUF, trames de 256 échantillons) ;
  - repli sur **DTLN-aec CoreML** (trames de 512).
- **Référence** : le son du Mac, **aligné à l'échantillon**.
- **Estimateur de délai par enveloppes RMS** (pour DTLN) :
  - candidats de 0 à 800 ms par pas de 40 ms ;
  - fenêtre de 8 s, recalculée toutes les 2 s ;
  - score ≥ 0,55 ;
  - médiane pondérée sur 7 estimations.
- **Le VAD du micro lit le micro nettoyé**, sinon le haut-parleur crée de faux tours « You ». L'audio gardé est lui aussi le micro nettoyé.
- `App/MeetingNeuralAec.swift`, `LocalVQEProcessor.swift`, `MeetingSession.swift:1254-1303`.

### 3.3 Découpage et transcription pendant la réunion
- **Morceaux VAD Silero de 3 à 5 s** : on coupe à la fin de parole s'il s'est écoulé au moins 3 s, sinon un minuteur force la coupe à 5 s. `App/StreamingVadController.swift:40-42, 200-208`.
- Le modèle Silero tourne sur des blocs de 4096 échantillons (256 ms).
- **Morceau silencieux sauté avant l'ASR** si aucune trame n'a une probabilité de parole > 0,5. C'est la protection principale contre les hallucinations. `App/TranscriptionRuntime.swift:1082-1090`.
- Chaque morceau est transcrit **en tâche parallèle**, puis trié par heure de début. Il est écrit **en base** (checkpoint) avant même d'être affiché. `MeetingSession.swift:1021-1082`, `MuesliController.swift:7585-7609`.
- **Sous-titres live optionnels** (désactivés par défaut) : Parakeet Realtime EOU (blocs de 320 ms, publication toutes les 250 ms) ou Nemotron 3.5 (morceaux de 2,24 s). Le texte final vient d'un modèle séparé.
- **Filtre d'artefacts** : `[BLANK_AUDIO]`, `[music]`, `<|…|>`, fuite du prompt Whisper (seulement en début ou en fin), puis filtre des mots parasites. `App/TranscriptionEngineArtifactsFilter.swift`.

### 3.4 À l'arrêt
1. Arrêt de la capture, avec une échéance de 12 s (`MeetingCaptureShutdown.swift:14`).
2. Transcription des 2 derniers morceaux (≤ 5 s chacun).
3. **Diarisation unique, sur le fichier complet du son du Mac seulement.** Le micro reste « You ». `MeetingSession.swift:825-831`.
   - Moteur : FluidAudio `DiarizerManager.performCompleteDiarization` (segmentation pyannote + WeSpeaker v2, CoreML/ANE).
   - Réglages par défaut de FluidAudio, non modifiés par Muesli [P] `FluidAudio/Diarizer/Core/DiarizerTypes.swift` :

     | Réglage | Valeur |
     |---|---|
     | `clusteringThreshold` | 0.7 |
     | `minSpeechDuration` | 1.0 s |
     | `minSilenceGap` | 0.5 s |
     | `numClusters` | -1 (automatique) |
     | `chunkDuration` | 10 s |
     | `chunkOverlap` | 0 |
     | `minEmbeddingUpdateDuration` | 2.0 s |

   - Sur M1 avec macOS 15.1, le GPU est exclu (`cpuAndNeuralEngine`) à cause d'un crash. `DiarizerRuntimePolicy.swift:82`.
4. **Attribution sans re-transcription** (`TranscriptFormatter.swift:122-160`) :
   - chaque segment système prend le locuteur au **plus grand recouvrement** ;
   - à défaut, le plus proche à ≤ 2 s du milieu ;
   - sinon « Others » ;
   - un seul locuteur trouvé : tout lui revient ;
   - numérotation dans l'ordre d'apparition.
5. **Réconciliation** (`TranscriptReconciler.swift`) :
   - tours micro fusionnés si l'écart est ≤ 0,35 s ;
   - doublons système retirés (recouvrement ≥ 0,5 et texte contenu à 67 %) ;
   - **« préserver d'abord »** : on ne supprime jamais un tour « You » par comparaison de texte.
   - Le texte système est redécoupé en phrases (NLTokenizer), avec durées réparties au prorata des caractères.
6. **Formatage** : `[HH:mm:ss] Speaker: texte` à l'heure murale, tours du même locuteur fusionnés si l'écart est ≤ 2 s.
7. **Réparation de couverture** (`MeetingTranscriptHealthMonitor.swift:105-113`) : un VAD hors ligne est passé sur tout le son du Mac (`maxSpeechDuration` 10 s, marge 0,15 s).

   | Situation | Réaction |
   |---|---|
   | Couverture < 60 % | Re-transcription complète |
   | Parole non couverte ≥ max(8 s, 30 %) | Re-transcription complète |
   | Taux d'échec ≥ 35 % | Re-transcription complète |
   | Sinon | Réparation des seules zones couvertes à moins de 55 % |

8. Titre, puis compte rendu LLM en **un seul appel**. Si le LLM échoue, la note contient `## Summary failed` + `## Raw Transcript` : le transcript n'est jamais perdu.

**Temps d'attente** : aucune mesure n'est publiée. [S] Avec un ASR sur l'ANE (~100 à 200× le temps réel) et une diarisation CoreML d'environ 12 à 15 s pour 30 min (chiffre FluidAudio, déjà cité dans notre plan), le transcript est prêt en quelques secondes après l'arrêt, plus le temps du LLM.

### 3.5 Compte rendu (verbatim dans `App/MeetingSummaryClient.swift:197-209, 568-638`)
- **Prompt de base** (anglais), en substance :
  - « notes markdown concises et professionnelles » ;
  - « n'invente rien » et « propriétaires seulement s'ils sont cités » ;
  - « section vide → *None noted.* » ;
  - le contexte OCR sert à comprendre l'écran partagé ;
  - la liste des participants sert **à l'orthographe des noms, pas à deviner qui parle** ;
  - le contexte capturé est une donnée, jamais une instruction (anti-injection).
- **Contenu du message**, dans cet ordre :
  1. titre ;
  2. `<meeting_participants>` (noms du calendrier et de Contacts, 4 000 caractères maximum) ;
  3. contexte visuel (OCR de la fenêtre et texte Accessibilité toutes les 60 s, dédoublonné, 5 000 caractères maximum) ;
  4. notes de la réunion précédente (follow-up, 6 000 caractères) ;
  5. notes générées actuelles (cas d'un re-résumé) ;
  6. **notes tapées à la main**, en « contexte de premier rang, conserver le libellé » ;
  7. transcript brut.
- **Filet de sécurité** : tout bloc de notes manuelles absent de la sortie est ajouté sous `### Written notes`. `notesByRetainingManualNotes`, l.681.
- **Templates intégrés** (`App/MeetingTemplates.swift`) :

  | Template | Sections |
  |---|---|
  | **Auto** | Summary 2-3 phrases · Key Discussion Points · Decisions Made · Action Items `- [ ]` · Notable Quotes |
  | **1 to 1** | Check-In · Topics · Support Needed · Commitments · Manager Notes |
  | **Customer Discovery** | Context · Pain Points · Current Workflow · Buying Signals · Next Steps |
  | **Hiring** | Snapshot · Strengths · Concerns · Role Fit · Decision |
  | **Stand-Up** | Yesterday · Today · Blockers · Coordination |
  | **Weekly Team** | Overview · Progress · Decisions · Risks · Actions |

  Les templates perso sont libres (nom, prompt, icône). **Changer de template après coup** relance le résumé, et la copie du template est stockée sur la réunion.
- **Titre** : 3 extraits de 900 caractères (début, milieu, fin) plus les notes manuelles, pour un titre de 3 à 7 mots. **Le titre de l'événement calendrier passe avant celui du LLM.**
- **Pas de découpage en parties** : un seul appel, avec sortie en streaming SSE au-delà de 21 333 jetons.
- **Réessais** : 3 par défaut, délai exponentiel de 1, 2, 4 puis 8 s, sur les codes 408, 409, 425, 429 et 5xx. Pas de réessai sur un dépassement de contexte.
- **Fournisseurs** : OpenAI ou Anthropic par clé, ChatGPT par OAuth (abonnement Plus/Pro), OpenRouter (y compris des modèles gratuits à 256k de contexte), Claude Code (`claude -p`), Ollama ou LM Studio.

### 3.6 Autour de la réunion
- **Détection auto** (`MeetingDetector.swift`, `MeetingCandidateResolver.swift`, `CameraActivityMonitor.swift`) :
  - priorités : caméra + micro + app reconnue (P0), puis événement calendrier + micro, puis app au premier plan, puis navigateur + micro ;
  - caméra lue via CoreMediaIO, sans AVFoundation ;
  - **URL du navigateur lue par Accessibilité** : `meet.google.com/<code>`, `zoom.us/j/`, Teams, Webex, Slack huddle ;
  - apps reconnues : Zoom, FaceTime, Teams, Slack, Webex, WhatsApp ;
  - le candidat doit rester stable 3 s avant le panneau « Meeting detected » ;
  - le panneau se ferme seul à 15 s ; son bouton scindé propose **Join & Transcribe / Join Only / Transcribe Only**.
- **Calendrier** :
  - EventKit (iCloud, Google ou Exchange connectés au Mac), section « Coming Up » ;
  - rappels au début ou 1, 3 ou 5 minutes avant ;
  - lien de visio extrait de l'événement ;
  - organisateur et invités enregistrés comme participants ;
  - ajout de personnes depuis Contacts.
- **Pas d'arrêt automatique.** Si la source disparaît depuis 20 s **et** qu'il n'y a aucun nouveau texte depuis 45 s, une notification s'affiche : « Meeting signal lost. Recording continues. » avec un bouton Stop.
- **Ask Meetings** (`Core/MeetingChat*.swift`) :
  - index **FTS5 + bm25** (pas d'embeddings) ;
  - portée : toutes les réunions, un dossier, des dates ou une sélection `@réunion` ;
  - réponses avec citations `[[S1]]`, et « ouvrir dans la réunion » surligne le passage exact ;
  - outils exposés au LLM : `search`, `read_meeting_source` et `read_full_meeting` ;
  - budget de contexte de 8K en local, 32K dans le cloud ;
  - boutons rapides « My next steps / Decisions / Draft follow-up / Weekly recap » [O] capture `docs/screenshots/ask-meetings/chat.png`.
- **Export** :
  - PDF (US Letter) ou Markdown, au choix Notes, Transcript ou Full ;
  - auto-export vers un dossier ;
  - **script lancé après chaque réunion**, qui reçoit en JSON sur stdin seulement l'identifiant de la réunion, pas son contenu.
- **Fiche réunion** :
  - bascule Notes / Transcript ;
  - lecteur audio avec forme d'onde ;
  - éditeur Markdown riche pour les notes manuelles pendant la réunion ;
  - cases à cocher sur les actions ;
  - « Ask about this meeting » ;
  - **re-transcription** d'une réunion sauvegardée avec un autre modèle ;
  - **Resume** pour reprendre une réunion terminée, et **Follow-up** pour une suite liée.
- **Import de fichiers audio** (m4a, mp4, wav, mp3), avec diarisation par fenêtres de 10 s, et **CLI** `muesli-cli transcribe | meetings list/get/update-notes` en sortie JSON, conçue pour Claude Code et Codex.

---

## 4. Dictée [P] code source

- **Raccourcis** (`App/HotkeyMonitor.swift`) :
  - maintien de 250 ms pour démarrer ;
  - **le micro est « armé » dès 150 ms**, donc le début de phrase n'est jamais perdu ;
  - double appui en moins de 0,35 s = mains libres, puis on arrête par un nouvel appui ;
  - mode « appuyer pour basculer » avec combinaison de touches ;
  - Échap annule ;
  - touches possibles : Cmd gauche ou droit, Fn, Ctrl, Option, Shift.
- **Moteur** : Parakeet sur l'ANE (~0,13 s annoncé). Le modèle est **préchauffé** sur du silence pour compiler CoreML. Si le moteur cloud échoue, l'enregistrement gardé est re-transcrit en local.
- **Nettoyage (prompt par défaut, anglais)** :
  - ne changer qu'en cas d'erreur claire, sinon renvoyer tel quel ;
  - retirer les « um/uh/like », appliquer « scratch that », mettre en liste ce qui est dicté comme une liste ;
  - ne pas paraphraser ni ajouter de mots ;
  - `<APP-CONTEXT>` (app, URL, sélection, OCR, 1 200 caractères maximum) sert uniquement à corriger noms et acronymes.

  Garde-fous sur la sortie du LLM (`App/Qwen3PostProcessor.swift:36-144`) :
  - balises `<think>`, blocs de code et « Output: » retirés ;
  - **rejet si la sortie est trop longue** par rapport à l'entrée : plus de 4× si l'entrée fait moins de 50 caractères, plus de 2,5× sous 150 caractères, plus de 2× au-delà ;
  - **rejet si l'on y trouve des tournures d'assistant** (« the user is asking », « analysis: ») ;
  - **dans tous ces cas, retour au texte brut.**
- **Mots parasites** : liste anglaise fixe, sans LLM (`FillerWordFilter.swift`).
- **Dictionnaire** :
  - égalité exacte, sinon **Jaro-Winkler ≥ 0,85** (réglable de 0,70 à 0,95), y compris sur plusieurs mots ;
  - paires de remplacement.

  Suggestions apprises des corrections (désactivées par défaut) :
  - relecture du champ par Accessibilité pendant 45 s ;
  - la correction doit rester **stable 1,5 s** ;
  - alignement des mots, similarité ≥ 0,64 ;
  - au plus 3 suggestions par session ;
  - fenêtre « Ajouter / Ignorer » qui se ferme à 15 s.
- **Collage** (`PasteController.swift`) :
  - sauvegarde de **tous les types** du presse-papiers, puis ⌘V 50 ms plus tard ;
  - **restauration à 0,5 s seulement si l'utilisateur n'a rien copié entre-temps** (vérification de `changeCount`) ;
  - variantes par le menu Édition › Coller (Accessibilité) ou par frappe directe.

  Espace final ajouté seulement après une ponctuation de fin de phrase.
- **Médias** :
  - couper la sortie audio pendant la dictée, sauf si c'est un casque ;
  - mettre en pause la musique **seulement si la lecture est confirmée** (la touche média est une bascule aveugle) ;
  - la reprendre seulement si c'est Muesli qui l'a mise en pause.
- **Quill** : sélectionner du texte et dicter une consigne pour le réécrire, ou générer du texte au curseur s'il n'y a pas de sélection.
- **Computer Use** : changer les réglages à la voix, avec Gemma 4 en local ou ChatGPT.
- **Raccourcis Apple / Siri** : 6 actions (démarrer ou arrêter la dictée, démarrer ou arrêter la réunion, dernière dictée, dernières notes).

---

## 5. Interface [O] captures `assets/muesli-github-ss.png`, `docs/screenshots/ask-meetings/*` et [P] `App/MuesliTheme.swift`, `design-system/README.md`

- **Fenêtre** : sombre par défaut, police SF Pro, accent bleu `#6BA3F7`, rayons 6, 10, 14 et 20, grille de 4 pt, largeur de lecture de 720.
  - **Barre latérale** : Timeline · Dictations · Meetings (dossiers avec compteurs) · Insights · Dictionary · Models · Shortcuts · Settings · About.
  - **Timeline** : une seule frise, dictées, réunions et iPhone mélangés, avec badges `iOS` et `CUA`, filtres « This Mac / From iPhone / Apps », et 4 tuiles (série de jours, mots, mots par minute, réunions).
  - **Insights** : carte de chaleur, nuage de mots, classement des apps et des modèles.
- **Pastille** :
  - capsule de verre dépoli, 44×28 au repos et 76×22 pendant l'enregistrement ;
  - 5 barres de 3 pt dont la hauteur suit le niveau sonore (`3 + 11×amplitude`, lissage 0,48/0,52) à 30 images par seconde ;
  - teinte d'accent pleine pendant l'enregistrement ;
  - au survol, elle affiche le raccourci (« Hold Right Option to dictate ») ou **le transcript live de la réunion**.
- **Option « notch »** : ailes autour de l'encoche, panneau de 440 pt, bord lumineux, états Done (vert), Needs input (jaune) et Failed (rouge).
- **Sons** : sons système « Tink » au début et « Purr » à l'insertion.
- **Onboarding** : prénom, usage (dictée, notes vocales ou réunions), modèle conseillé, raccourci, autorisations une par une, test réel (« Try saying… »), résumé, puis calendrier. La progression est sauvegardée à chaque étape.

---

## 6. Comparaison avec CBW AI

Repères côté CBW AI :
- `docs/APP_API.md` ;
- `chantiers/notes-audit/01-audit-code.md` : architecture actuelle, coupe à 6 s, VAD à 0,01 RMS, diarisation sherpa avec TitaNet-small à seuil 0,8, re-transcription `splitAtTurns`, LLM en N parties ;
- `03-audit-terrain.md` : 14 locuteurs pour 3, 4 min 29 s d'attente dont 3 min 15 s de re-transcription, 587 replis vers whisper-cli ;
- `plan.md`.

### 6.1 Réunions

| # | Sujet | CBW AI aujourd'hui | Muesli | À reprendre | Effort |
|---|---|---|---|---|---|
| R1 | Pistes | Micro + Mac **mélangés** (somme écrêtée), diarisation sur le mélange ou mode deux pistes fragile (bascule si le Mac dépasse 0,01 RMS pendant 3 s) | Deux chaînes complètes ; **micro = « You », jamais diarisé ; diarisation sur la seule piste système** | Oui, c'est le plan 1.2. Garder la transcription par piste, sans mélange. | M |
| R2 | Écho micro ↔ haut-parleur | AEC désactivée, suppression de bruit WebRTC activée | **LocalVQE 1,3 M (GGUF/ggml)** avec repli DTLN-aec ; référence = son du Mac aligné à l'échantillon ; **VAD micro sur micro nettoyé** | Oui. LocalVQE est un `.gguf` de 4,9 Mo (HF `LocalAI-io/LocalVQE`) avec une lib C. À tester via un petit helper natif, ou sinon DTLN-aec en ONNX. En attendant : AEC WebRTC **activée** en mode réunion avec casque absent. | M–L |
| R3 | Découpage | VAD énergie 0,01 RMS, coupe forcée à 6 s au milieu des mots | **Silero**, 3 s minimum, coupe en fin de parole, 5 s maximum ; morceau sauté si aucune trame > 0,5 | Oui : Silero (déjà présent dans whisper.cpp `--vad` et sherpa-onnx). Mais **avec Whisper, viser 10 à 15 s** (Parakeet tolère 3 à 5 s, pas Whisper). | S |
| R4 | Après diarisation | `splitAtTurns` re-transcrit 74 segments (3 min 15 s) | **Aucune re-transcription** : plus grand recouvrement, sinon le plus proche à ≤ 2 s, sinon « Others » | Oui, en priorité absolue (plan 1.4/6). | S |
| R5 | Diarisation | sherpa : pyannote-seg 3.0 + TitaNet-small (anglais), seuil 0,8, nombre libre, aucune fusion | FluidAudio : pyannote seg + **WeSpeaker v2** CoreML, seuil 0,7, morceaux de 10 s, `minSpeechDuration` 1 s ; fichiers PLDA/VBx community-1 présents ; pas de nombre imposé | WeSpeaker existe aussi dans sherpa-onnx (`wespeaker_en_voxceleb_resnet34`…), test immédiat. Phase 2 : helper Swift FluidAudio (plan 2.7). **Muesli ne fait pas mieux sur « combien êtes-vous ? »** : garder notre idée. | S (modèle) / L (helper) |
| R6 | Points de reprise | Transcription orpheline récupérée | **Chaque morceau écrit en base avec locuteur et temps** ; au relancement, la réunion est reconstruite (« may be incomplete ») | Petit plus : JSONL par morceau. Nous avons déjà l'essentiel. | S |
| R7 | Réparation de couverture | Segments en échec perdus | VAD hors ligne sur la piste complète ; selon la couverture, re-transcription complète ou ciblée | Oui : rejouer depuis le WAV complet les zones non couvertes (audit 3.6 / quick win 11), avec leurs seuils (60 %, max(8 s, 30 %), 55 %). | M |
| R8 | Filtres d'hallucination | Regex sur le **début** du segment (jette « Merci d'avoir regardé le devis… ») | Jetons de contrôle et annotations entre crochets, fuite du prompt **seulement en début ou en fin**, saut du silence **avant** l'ASR | Oui (quick win 12). | S |
| R9 | Moteur ASR | whisper large-v3-turbo q5_0, `audio_ctx` 640, glouton | Parakeet sur l'ANE ; v3 multilingue (FR 5,9 % de WER FLEURS, ~200× le temps réel) | Plan 3.10 confirmé : `parakeet-tdt-0.6b-v3` existe aussi en **ONNX pour sherpa-onnx** (pas besoin de Swift). À mesurer sur nos réunions en français. | M |
| R10 | Live | Rien d'exploitable pendant l'attente | Bulles You / Others pendant la réunion, panneau flottant, transcript au survol de la pastille | Oui (plan 3.11). | M |
| R11 | Compte rendu | Jusqu'à 3 ou 4 appels en série (parties + fusion + couverture), 9 sections imposées | **Un appel**, sortie en streaming, retours exponentiels ; si échec, `## Summary failed` + transcript brut | Oui (plan 1.6). Garder notre mise en forme française plus riche, mais en un seul appel. | S |
| R12 | Templates | Un seul format (v2) | 6 templates + perso ; **changer de template après coup** (copie stockée) ; « None noted. » | Oui : 4 à 5 templates en français (Réunion, 1:1, Client/découverte, Recrutement, Point d'équipe) + menu « Refaire avec… ». | S–M |
| R13 | Notes à la main | Inexistant | Éditeur pendant la réunion ; **notes = contexte prioritaire + réinjection automatique de celles que le LLM a oubliées** | Oui, c'est la meilleure idée « Granola ». | M |
| R14 | Participants | « Combien êtes-vous ? » prévu | Invités du calendrier et de Contacts transmis comme liste **pour l'orthographe, sans deviner qui parle** | Oui (plan 2.9). Nous avons déjà `importContacts`. | S–M |
| R15 | Contexte écran | Non | OCR + Accessibilité toutes les 60 s (5 000 caractères), pour comprendre l'écran partagé | Optionnel, plus tard. | M |
| R16 | Détection et calendrier | Lancement manuel (Control ×3) | Caméra + micro + app ou URL Meet/Zoom/Teams ; rappel calendrier « Join & Transcribe » ; **pas d'arrêt auto**, alerte « signal perdu » | Oui, à reprendre par étapes : d'abord une notification « Réunion détectée → Prendre des notes », puis le calendrier. | M–L |
| R17 | Chat sur les réunions | Non | FTS5 + bm25, citations cliquables, outils de recherche ; fonctionne même avec 8K de contexte | Oui : SQLite FTS5 en Node (better-sqlite3) suffit. | M |
| R18 | Suite et reprise | Non | Follow-up lié (actions encore ouvertes reprises de la réunion précédente) ; Resume | Plus tard. | S–M |
| R19 | Export et automatisation | `.md` dans Documents | PDF/MD, auto-export, script après réunion, CLI JSON pour agents | Export PDF : S. CLI : plus tard. | S |
| R20 | Re-transcription | `reorganizeNote` (LLM seul) | Re-transcrire une réunion sauvegardée avec un autre modèle | Oui, si l'audio est gardé (« qualité max » en arrière-plan, audit §6.4). | S |

### 6.2 Dictée

| # | Sujet | CBW AI | Muesli | À reprendre | Effort |
|---|---|---|---|---|---|
| D1 | Début de phrase | — | **Micro armé à 150 ms**, démarrage confirmé à 250 ms | Vérifier notre pré-armement de la touche Control ; reprendre ce schéma s'il manque. | S |
| D2 | Garde-fous du LLM | Vérifications ad hoc | Rejet si la sortie est trop longue (×4, ×2,5 ou ×2 selon la longueur) ou contient des tournures d'assistant, puis **retour au texte brut** | Oui, peu coûteux, dans `src/llm/router.ts` ou `prompt.ts`. | S |
| D3 | Presse-papiers | Restauration avec délais | Sauvegarde de **tous les types**, restauration seulement si `changeCount` n'a pas bougé | Vérifier `paste` : ne jamais écraser une copie faite par l'utilisateur. | S |
| D4 | Pause musique | `audio.pauseMedia` | Pause **seulement si la lecture est confirmée** ; reprise seulement si c'est nous qui l'avons mise en pause | Vérifier que nous ne relançons pas une musique qui était arrêtée. | S |
| D5 | Dictionnaire appris | Déjà présent (`learn.ts`, 45 s, notification) | Même idée + stabilité de 1,5 s + **confirmation de l'utilisateur** (Ajouter / Ignorer) + Jaro-Winkler ≥ 0,85 sur le texte final | Ajouter la stabilité de 1,5 s et la correction floue post-ASR. | S |
| D6 | Moteur local rapide | whisper-server (~0,3 à 0,6 s) | Parakeet ANE ~0,13 s ; préchauffage ; repli cloud → local sur le même audio | Parakeet v3 ONNX (sherpa) à mesurer en français. | M |
| D7 | Nettoyage | Prompt v1.5/v1.6 en français, ton selon l'app, fournisseurs gratuits | Prompt anglais minimal ; petit LLM local affiné (Qwen3.5-0.8B, ~505 Mo) | **Nous faisons mieux en français.** Idée à garder pour plus tard : un petit modèle local affiné en dernier recours plutôt qu'Ollama/gemma (attention aux 16 Go). | — / L |
| D8 | Pastille | Pastille « NOTE · mm:ss » + niveau | Survol = transcript live de la réunion ; option notch | Survol avec transcript live en mode notes. | S–M |
| D9 | Historique | Accueil + Historique | Timeline unique (dictées + réunions) avec filtre par app, moteur enregistré pour chaque dictée | Option. | S |

### 6.3 Ce que CBW AI fait déjà aussi bien ou mieux
- Le français partout : prompts, typographie, ton selon l'app, extraits (snippets).
- Les fournisseurs gratuits en course hedgée.
- « Combien êtes-vous ? », prévu ; Muesli ne l'a pas.
- Le renommage des personnes et la reconnaissance des voix d'une réunion à l'autre, prévus en phase 2.8 ; **Muesli ne l'a pas**, ses locuteurs restent « Speaker N ».
- Le compte rendu « par personne » et la chronologie.

---

## 7. Ordre conseillé (s'insère dans `plan.md`)

1. **Phase 1 telle quelle**, avec en plus quatre réglages repris de Muesli :
   - attribution par plus grand recouvrement sans re-transcription (R4) ;
   - micro = « Moi » et diarisation sur la seule piste système (R1) ;
   - Silero avec saut des morceaux silencieux (R3) ;
   - un appel LLM, et transcript brut si échec (R11).
2. **Rapides (≤ 1 jour chacun)** :
   - garde-fous de sortie du LLM (D2) ;
   - filtres d'hallucination stricts (R8) ;
   - WeSpeaker dans sherpa-onnx à la place de TitaNet-small, avec un seuil autour de 0,7 à calibrer (R5) ;
   - templates français + « Refaire avec… » (R12) ;
   - liste des participants dans le prompt (R14).
3. **Notes à la main pendant la réunion avec réinjection (R13)**, puis **réparation de couverture (R7)**.
4. **Phase 2/3** :
   - AEC LocalVQE ou DTLN (R2) ;
   - Parakeet v3 ONNX en français (R9/D6) ;
   - live You / Autres (R10) ;
   - détection de réunion et calendrier (R16) ;
   - Ask Meetings FTS5 (R17).

## 8. Limites de cette analyse
- **Non lu** : le code de FluidAudio, à part `DiarizerTypes.swift`. Les seuils Silero par défaut (FluidAudio 0.15.5) ne sont donc pas vérifiés.
- **Diarisation** : le fichier `provenance.json` liste des modèles `Embedding/FBank/PLDA` alors que le dossier contient `pyannote_segmentation` + `wespeaker_v2`. Le pipeline exact (VBx ou clustering simple) n'est pas confirmé. [S] Muesli utilise `DiarizerManager`, donc segmentation + WeSpeaker + clustering à seuil.
- **Aucune mesure** de durée après l'arrêt : l'app n'a pas été lancée, conformément à la consigne.
- **Aucun avis indépendant trouvé** (Reddit, HN, Product Hunt) : les recherches ne renvoient que le dépôt, ses forks et le site officiel.
- **Volume `/Volumes/Muesli`** : il était déjà monté avant l'analyse (montage de Camille). Il a été laissé tel quel ; seul le montage fait pour cette analyse a été démonté.
