# Veille Wispr Flow : prompt de nettoyage et orthographe des noms propres

Date : 2026-10-14. Lecture seule. Légende : **PROUVÉ** = citation d'une source primaire (Wispr, Baseten, code ou docs publics) ; **TIERS** = observation d'un tiers (rétro-ingénierie, avis) ; **SUPPOSÉ** = déduction.

## 1. Le prompt de Wispr Flow

**Verdict : aucun prompt système publié, fuité ou extrait n'a été trouvé.** Pas dans les gists, issues GitHub, posts publics, le blog technique, ni les interviews/podcasts lus. Pas de brevet identifié. Limite honnête : je n'ai pas lu les transcriptions intégrales des podcasts (SE Radio 703, Village Global, Notable) ni le `TECHNICAL_DETAILS.md` du SDK ; le prompt n'y figure probablement pas, mais ce n'est pas vérifié.

Ce qui est PROUVÉ sur le *modèle* (pas sur le prompt) :
- Le nettoyage n'est probablement pas un « prompt » sur modèle généraliste mais un **Llama affiné** : « Llama is controllable and customizable, which lets us focus on the output » (Sahaj Garg, CTO). Le pipeline complet ASR + nettoyage Llama tient en moins de 700 ms ; le Llama doit traiter 100+ tokens en moins de 250 ms. https://www.baseten.co/resources/customers/wispr-flow/
- Le blog technique : « LLMs are phenomenal at recall, but very low precision » ; budget réseau max 200 ms ; l'utilisateur attend le résultat « within 700ms of when they stop speaking » ; « most personalization data must live on a user's device ». https://wisprflow.ai/post/technical-challenges
- Fournisseurs LLM listés (formatage, mode commande) : OpenAI, Anthropic, Cerebras, Baseten, Fireworks AI, selon la page sous-traitants du centre d'aide (https://docs.wisprflow.ai/articles/5375461355-subprocessors-third-party-security, mise à jour 06/03/2026 ; la page a répondu 404 à mon accès direct, donc info venue du résumé de recherche, à revérifier). Zéro rétention revendiquée : https://wisprflow.ai/data-controls
- Un correctif de version cité par la veille précédente parle d'un « Auto Cleanup trop agressif » (https://releases.sh/wispr-flow/overview), donc un réglage de niveau de nettoyage existe.

TIERS (rétro-ingénierie du client, pas de texte de prompt) :
- Analyse du client Mac par Wensen Wu : colonnes locales `axText`, `axHTML`, `textboxContents`, `editedText`, `userEditMetaData` ; logs « Sent context update over gRPC stream », « Extracted 5 proper nouns », endpoint `/llm/extract_asr_words` ; contexte envoyé avec l'audio : nom d'app, bundle ID, URL, texte de l'arbre d'accessibilité, noms propres extraits, contenu de la zone de texte. L'auteur précise qu'aucun prompt n'apparaît. https://www.wensenwu.com/thoughts/wispr-flow-investigation
- SDK Python non officiel (gRPC, Windows) : paramètres `style="FORMAL"`, `cleanup="MEDIUM"`, `app_type="email"`, `before_text`, `after_text`, `selected_text`, `content_text`, `app_name`, `url`. Confirme le *schéma* d'entrée, pas le prompt. https://github.com/ThisisShashwat/wisprflow-sdk
- Électron avec `EnableEmbeddedAsarIntegrityValidation` actif (donc le paquet n'est pas modifiable simplement) : https://github.com/ll1li/wispr-flow-dark-smokey/issues/9

SUPPOSÉ : le prompt (s'il existe côté serveur) reçoit niveau de nettoyage (LOW/MEDIUM/HIGH), style (FORMAL…), catégorie d'app, texte avant/après le curseur, noms extraits et dictionnaire. Rien ne prouve son contenu ; ces paramètres sont des noms de champs.

## 2. Mécanismes pour les noms propres

| Mécanisme | Statut | Source |
|---|---|---|
| Lecture du contexte via Accessibilité (Mac) : « Flow reads text near your cursor » ; zone de texte avant/sélection/après le curseur + « on-screen text » ; app classée en 4 catégories (e-mail, messagerie pro, perso, autre) ; site identifié dans les navigateurs | PROUVÉ | https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness |
| Aucune capture d'écran : « Context Awareness works from text and does not take screenshots » ; Mac : permission Accessibilité requise | PROUVÉ (doc) ; des avis tiers affirment le contraire, et la table locale a une colonne `screenshot` (TIERS) | idem + wensenwu.com |
| Noms : « Flow uses names and context visible on screen, such as email recipients, to recognize proper nouns » | PROUVÉ | idem |
| Extraction des noms propres par un appel LLM dédié (`/llm/extract_asr_words`) avant/pendant l'ASR | TIERS | wensenwu.com |
| ASR « mixed-modal, context driven » : entrées = contexte de l'app, « History of relevant topics », « Information about names or terms they commonly use », embeddings de la voix ; exemple « Lauren or Laurent » tranché par le contexte | PROUVÉ (objectif décrit, « building ») | https://wisprflow.ai/post/speech-recognition-challenges ; https://wisprflow.ai/post/technical-challenges |
| Dictionnaire perso : onglets Tous/Perso/Équipe, étoile = priorité ; « Auto-add to Dictionary » : Flow surveille la zone de texte pour détecter les corrections de l'utilisateur et ajoute le mot corrigé (désactivable) | PROUVÉ (réglage et onglets) ; le mécanisme exact vient de la doc résumée | https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android ; centre d'aide |
| Snippets : raccourcis vocaux vers un texte ; ne relèvent pas de l'orthographe des noms | PROUVÉ (existence) | idem |
| Modèle : ASR cloud (audio vers Baseten, gRPC) + Llama affiné ; pas d'ASR local ; « Transcription always happens in the cloud » | PROUVÉ / TIERS | data-controls ; baseten.co |
| Confidentialité : mots de passe jamais lus, apps bancaires ignorées, texte capturé effacé à la fin de la dictée ; contexte désactivable (Réglages > Données et confidentialité) ; avec contexte désactivé, seul le nom d'app et le domaine partent | PROUVÉ (doc) | doc context-awareness ; https://wisprflow.ai/privacy-policy |
| Bémol : la base locale conserve `axText`/`textboxContents` (une enquête de tiers parle de ~198 Mo d'audio) | TIERS | wensenwu.com ; https://www.getvoibe.com/resources/is-wispr-flow-safe/ (source concurrente, prudence) |

## 3. Concurrents (code lisible ou docs)

| Outil | Contexte lu | Noms / apprentissage | Où dans le code |
|---|---|---|---|
| **VoiceInk** (Swift, GPL) | Texte sélectionné (Accessibilité), presse-papiers, fenêtre active par capture + OCR local Apple Vision (l'image n'est pas envoyée) ; injecté en balises dans le prompt | **Auto Learn** : lit le champ édité par Accessibilité après collage, calcule le diff de correction, fait relire les candidats par un LLM (JSON : ajout de vocabulaire ou remplacement), exige que le terme soit « grounded » dans le texte corrigé, file d'attente de validation | https://github.com/Beingpax/VoiceInk/tree/main/VoiceInk/Features/Dictionary/AutoLearn (`AutoLearnAXTextReader.swift`, `AutoLearnAIReviewer.swift`, `CorrectionDiffEngine.swift`) ; `.../Infrastructure/SystemIntegration/ScreenCapture/ScreenCaptureService.swift` ; doc https://tryvoiceink.com/docs/context-awareness |
| **FreeFlow** (Swift) | Métadonnées d'app + capture d'écran réduite (1024 px) résumée par un petit LLM vision en deux phrases (« context synthesis assistant for a speech-to-text pipeline ») | Vocabulaire manuel, bouton « ajouter au vocabulaire » | https://github.com/zachlatta/freeflow/blob/main/Sources/AppContextService.swift |
| **OpenWhispr** (Electron) | Capture d'écran (1568 px max) envoyée à un modèle vision avec transcript, prompt et dictionnaire ; Mac : permission Enregistrement d'écran | Dictionnaire + réglage auto-learn | https://github.com/OpenWhispr/openwhispr/blob/main/src/helpers/screenContextCapture.js ; `autoLearnSetting.js` |
| **Superwhisper** (fermé) | Super Mode via Accessibilité : app active, texte sélectionné, presse-papiers ; « correcting spelling based on app-specific terms, names, and vocabulary » | Vocabulaire manuel | https://superwhisper.com/docs/modes/super ; https://superwhisper.com/docs/common-issues/context |
| **Aqua Voice** (fermé) | « Lit l'écran » (destinataire, canal, ton) ; modèle ASR maison Avalon ; pas de détail d'implémentation | Dictionnaire (noms, marques) + instructions de style | https://aquavoice.com/use-cases/slack (marketing, revendications de l'éditeur) |

Lecture : seul Wispr (et Superwhisper) s'appuient sur le **texte** d'Accessibilité sans capture d'écran ; les clones open source préfèrent OCR ou capture (plus simple, plus invasif). VoiceInk Auto Learn est la meilleure référence lisible pour l'apprentissage par corrections.

## 4. Propositions pour CBW AI (classées)

État actuel lu : `prompt.ts` v1.6 accepte déjà `vocabulary` (section « Vocabulaire de la personne », champ `cleaning.vocabulary` via `config.ts`/`router.ts`). `pipeline.ts` construit le prompt Whisper avec `settings.get('whisper.prompt')` (« Dictée en français… ») + 200 derniers caractères validés ; `whisper.ts` le transmet (`--prompt` / champ `prompt` du serveur). Le helper `scripts/fnwatch.swift` utilise déjà `AXIsProcessTrusted()`. Il n'y a donc aucune lecture de l'app active ni d'apprentissage pour l'instant.

| # | Idée | Gain | Coût (latence, tokens) | Vie privée | Effort |
|---|---|---|---|---|---|
| 1 | **Noms visibles via Accessibilité** : au début de la dictée, un second mode du helper Swift lit l'app active (nom, champ focalisé : ~500 caractères avant le curseur, titre de fenêtre, destinataires/en-têtes si exposés), extrait les mots capitalisés/inconnus, et les ajoute au vocabulaire LLM (`vocabulary`) et au `--prompt` whisper | Élevé sur noms de collègues et marques (cas Lauren/Laurent) ; aucun gain sur dictées sans contexte | Lecture AX ~100-350 ms (Wispr mesure 336 ms), à lancer en parallèle de l'enregistrement donc hors chemin critique ; +30-80 tokens | Moyen : texte à l'écran peut contenir du sensible, il part vers Groq/Gemini ; n'envoyer que 5-15 noms extraits, jamais le texte brut ; exclure champs mot de passe, apps bancaires, gestionnaire de mots de passe ; réglage « Contexte » désactivable | M (3-5 j) : Swift + pont + liste d'exclusion + test sur Slack/Mail/Chrome/Notes |
| 2 | **Prompt initial Whisper enrichi** : injecter ces noms (et le dictionnaire perso) dans `--prompt`, 224 tokens max ; priorité aux noms fréquents | Moyen-élevé : corrige à la source (l'ASR), moins de dépendance au LLM | Nul en latence ; attention à ne pas déclencher d'hallucinations ou de boucle si la liste est longue (sortie dégénérée déjà gérée) | Faible : reste local (whisper local) | S (1 j) une fois le #1 en place, ou tout de suite avec le seul dictionnaire |
| 3 | **Dictionnaire appris des corrections** (modèle VoiceInk Auto Learn) : après collage, relire le champ par AX quelques secondes plus tard / au changement de focus, diff mot à mot, proposer les termes corrigés dans une file de validation « Ajouter à votre dictionnaire ? » | Élevé à moyen terme (la liste se construit seule, Wispr en fait un argument central) | Aucun sur le chemin critique ; un LLM optionnel pour trier les candidats (appel différé) | Moyen : lit du texte tapé par l'utilisateur ; ne rien envoyer au LLM sans accord, filtrage local par diff, validation manuelle, rien de persistant hors vocabulaire ; ne jamais lire les champs sécurisés | L (1-2 sem) : diff, file, UI page Dictionnaire, cas Electron/web (AXManualAccessibility), sélection robuste du champ |
| 4 | **Contexte d'usage en 1 ligne dans le prompt** (catégorie d'app : mail, chat, code, notes ; domaine du site) pour ajuster le ton sans réécrire | Moyen (ton), conforme à la v1.6 « fidèle » si limité à des indices | +20 tokens ; nom de l'app via NSWorkspace, sans permission | Très faible (nom d'app/domaine seulement, comme Wispr avec contexte coupé) | S (0,5-1 j) |
| 5 | **Dictionnaire manuel avec priorité (étoile) et import** des noms depuis Contacts/Calendrier (opt-in) | Moyen, fiable | Aucun | Moyen (accès Contacts, permission dédiée) ; local seulement | S-M |
| 6 | **Capture d'écran + OCR local** (Vision) comme repli quand l'AX ne renvoie rien (apps Electron/jeux) | Moyen, couvre les apps sans AX | OCR 200-500 ms | Élevé : permission Enregistrement d'écran, plus intrusif (Wispr s'en tient au texte) ; à éviter en v1 | M |
| 7 | **Modèle ASR affiné/maison** | Fort mais hors portée | — | — | XL, à écarter ; le prompt Whisper + dictionnaire donnent l'essentiel |

Ordre conseillé : 4 (rapide, sans risque) puis 2 avec le dictionnaire existant, puis 1, puis 3. Garde-fous communs : réglage unique « Contexte » désactivé par défaut, journal sans texte (déjà la règle du `dicta.log`), liste d'exclusion d'apps, aucune persistance du texte lu (effacé en fin de dictée, comme Wispr), et mention honnête dans la politique de confidentialité du site.

Piège à noter pour le prompt v1.6 : conserver « en cas de doute, garde le mot transcrit » ; les noms contextuels ne doivent servir qu'à corriger une déformation phonétique, pas à insérer un nom non prononcé (même règle que FreeFlow : « Use context only as a formatting hint and spelling reference for words already spoken »).

## 5. Non vérifié
- Contenu des transcriptions complètes (SE Radio 703, Village Global, Notable, Product-Market Fit Show).
- `TECHNICAL_DETAILS.md` du SDK non officiel, qui décrit la structure gRPC.
- Offres d'emploi et brevets Wispr : non explorés en profondeur.
- Page sous-traitants Wispr : 404 en accès direct, contenu issu d'un résumé de recherche.
