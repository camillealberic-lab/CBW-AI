# Veille Wispr Flow (2/…) : captation de la voix et pipeline technique

Date : 2026-10-14. Lecture seule, web + code CBW AI.
Légende : **PROUVÉ** = source primaire Wispr (docs.wisprflow.ai, wisprflow.ai, api-docs) ou fournisseur (Baseten) ; **OBSERVÉ** = tiers (rétro-ingénierie, avis, presse, concurrents) ; **SUPPOSÉ** = déduction.
Complète `chantiers/prompt-v16/veille-wispr.md` (prompt, contexte, noms propres), sans la répéter.

---

## 1. Raccourcis et cycle d'une dictée

| Point | Wispr Flow | Statut | Source |
|---|---|---|---|
| Push-to-talk (maintenir) | Mac **Fn**, Windows **Ctrl+Win** | PROUVÉ | https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts |
| Mains libres | Mac **Fn+Espace**, Windows Ctrl+Win+Espace ; et « Double-tapping Push to talk still starts hands-free dictation without a dedicated Hands-free binding » ; un nouvel appui arrête et colle | PROUVÉ | idem ; changelog 21/08/2026 https://wisprflow.ai/whats-new |
| Mac sans touche Fn Apple | bascule auto à l'onboarding : Ctrl+Opt (PTT), Ctrl+Opt+Espace, Cmd+Ctrl+Opt (commande) | PROUVÉ | idem |
| Mode commande | Fn+Ctrl (Mac) | PROUVÉ | idem |
| Coller / copier la dernière dictée | Cmd+Ctrl+V / Cmd+Ctrl+C (Win : Shift+Alt+Z / X) | PROUVÉ | idem |
| Annuler | **Échap** seul (seul raccourci autorisé sans modificateur) ; ou clic sur X ; l'ordre compte (« Ctrl then Esc records Ctrl+Esc, while Esc then Ctrl cancels ») ; un « Transcript cancelled » propose **Undo** (récupère le texte) | PROUVÉ | idem ; https://docs.wisprflow.ai/articles/4841123325-longer-dictation-sessions-now-up-to-20-minutes |
| Personnalisation | jusqu'à 4 raccourcis par action, ≤ 3 touches, modificateur obligatoire ; Verr. Maj seul possible pour PTT/mains libres ; boutons de souris (Middle, 4/5, 6-10 sur Mac, Logitech MX), avalés par Flow ; touche « Entrée » bindable ; par appareil, non synchronisé | PROUVÉ | idem ; « Mouse Flow » 31/03/2026 |
| Relâcher trop vite | annule la dictée (« releasing too quickly cancels ») ; seuil non publié | PROUVÉ (seuil inconnu) | https://docs.wisprflow.ai/articles/3566082841-fix-missing-first-words-in-transcriptions |
| Durée max | **20 min** desktop (alerte sonore + message à 19 min, arrêt et collage auto à 20, bouton « Recover text ») ; 5 min iOS ; Android 5 min (docs contradictoires) | PROUVÉ | article 4841123325 ; https://docs.wisprflow.ai/articles/2312866822-dictation-session-time-limits-on-android |
| Silence | « No audio received » après **5 s et 15 s** de silence ; « Unable to access mic » après 8 s ; depuis 09/10/2026 alerte **immédiate** si le micro ne capte aucun son au démarrage | PROUVÉ | article 3566082841 ; whats-new 09/10/2026 |
| Chevauchement | nouvelle dictée pendant le traitement de la précédente : refusée (« Flow was processing your last transcript ») ; appuis rapides ignorés | PROUVÉ | article 4841123325 |
| Pause en cours de dictée | pas de « pause » utilisateur documentée en dictée ; un appel / une coupure audio **arrête** la dictée | PROUVÉ (absence) | https://docs.wisprflow.ai/articles/9192039587-using-wispr-flow-discreetly-microphone-guide |
| Raccourcis bloqués | Secure Event Input (champs mot de passe, certains terminaux) bloque les raccourcis | PROUVÉ (titre d'article) | https://docs.wisprflow.ai/articles/8841649969-fix-flow-shortcuts-blocked-by-macos-secure-keyboard-entry-secure-event-input |

## 2. Micro, chuchotement, bruit, média, sons, Flow Bar

**Chuchotement.** Un « Whispering mode » en bêta (toggle) a existé en 08/2024 (ancien changelog, désormais redirigé vers /whats-new : OBSERVÉ via extrait de recherche). La doc actuelle ne parle plus d'un mode : « Flow works with soft speech, but microphone position matters » ; micro à quelques centimètres de la bouche ; casque filaire ou micro de bureau recommandés (PROUVÉ, guide 9192039587). Le blog reconnaît que la parole très basse (« sub-audible ») a un taux d'erreur plus élevé car aucun ASR n'a été entraîné dessus (PROUVÉ, https://wisprflow.ai/post/technical-challenges). Canto est annoncé comme entraîné sur audio « low-volume » (OBSERVÉ, https://benchlm.ai/voice-benchmarks/wispr-canto-launch-evaluation).

**Choix du micro (PROUVÉ, guide 9192039587 + whats-new).**
- Réglages › Général › Micro › Changer ; vumètre live seulement sur le micro sélectionné ; « Auto-detect » avec classement des micros ; un micro choisi explicitement est prioritaire ; un micro mieux classé branché en cours de dictée s'applique à la suivante.
- Sélecteur de micro **directement sur la Flow Bar** (21/08/2026) ; micros virtuels (Krisp, NVIDIA Broadcast, BlackHole) sous « Show other devices » (21/08/2026).
- Mac capot fermé : micro intégré non sélectionnable, libellé « Laptop lid is closed », bascule auto (24/06/2026).
- Débrancher le micro actif arrête la dictée, bouton **Insert** pour garder ce qui a été capté.
- Interface audio multi-entrées (Focusrite) → dictée silencieuse, article dédié (canal 1 vs 2).

**AirPods / Bluetooth (PROUVÉ).** « Bluetooth earbuds add audio delay » ; réveil du micro sans fil **0,5 à 2 s** (version 03/2026 de l'article) → premiers mots perdus : c'est un « known issue » officiel (https://docs.wisprflow.ai/articles/3566082841-fix-missing-first-words-in-transcriptions). Conseil : attendre un instant après l'appui, ou passer au micro intégré / filaire. Flow suggère un micro filaire après un changement de profil Bluetooth (au plus 3 fois, 1 fois/semaine). Le passage en profil « casque » (HFP) peut couper/étouffer la sortie : Flow tente de le réparer (Mac seulement, 3 essais), restauration jusqu'à ~5,5 s après l'arrêt, son de fin sauté dans ce cas.

**Réduction de bruit.** Pas de réglage de débruitage documenté côté client ; la réponse officielle = micro directionnel + modèle Canto (PROUVÉ pour le conseil micro ; Canto : WER en conditions difficiles « de plus de 30 % à 5-10 % », 2 milliards de paramètres, OBSERVÉ presse https://www.reworked.co/ai-platforms/wispr-hits-2b-valuation-launches-canto-voice-model/). SUPPOSÉ : les contraintes WebRTC (noiseSuppression/AGC) de Chromium sont utilisées ou non, rien de publié.

**Couper la musique (PROUVÉ, https://docs.wisprflow.ai/articles/7231650589-auto-mute-music-while-dictating-on-macos-how-audio-detection-works).**
- « Mute all audio while dictating » (Réglages › Système › Son) : **off par défaut sur Mac, on sur Windows**. Mac : coupe la sortie par défaut entière, seulement si une lecture est détectée au démarrage ; ~300 ms de latence de coupure ; restauration du volume exact ; sons de Flow exclus de la détection (macOS ≥ 14.2).
- « Pause » (expérimental, payant) : met en pause le lecteur actif et le relance à la fin ; jamais de repli sur la coupure ; ignore Zoom/Teams/Slack ; exclusif avec « mute ».
- iOS : ne peut pas mettre en pause l'audio de fond (article dédié 8415579688).
- Un utilisateur a publié un outil tiers pour mettre en pause au lieu de couper (interfaces USB que macOS ne peut pas muter) : https://trendshift.io/repositories/160345 (OBSERVÉ).

**Sons.** « Dictation and notification sounds » désactivables sur Mac/Windows ; iOS « Interaction sounds » ; Android non désactivable (PROUVÉ, guide 9192039587). Son d'alerte à 19 min ; « fewer duplicate notification sounds » (31/03/2026). Le guide reconnaît que chuchoter ne masque pas les sons de Flow pour les voisins.

**Flow Bar (PROUVÉ, https://docs.wisprflow.ai/articles/5002934560-why-is-the-wispr-bar-is-not-appearing-or-disappearing + whats-new 09/07/2026).**
- Mac : « sits just above the Dock » sur tous les Spaces ; en plein écran, collée au bord ; disparaît brièvement à l'entrée/sortie du plein écran.
- **Masquée par défaut sur les nouvelles installations** ; « Show Flow Bar at all times » ; « Hide for 1 hour » avec Undo ; affichage via raccourci ou icône de barre des menus.
- Déplaçable vers le bord gauche ou droit, position mémorisée ; ne chevauche plus le Dock (07/2026).
- Porte : sélecteur de langue (03/2026), sélecteur de micro (08/2026). Cliquable pour dicter (ancienne FAQ Notion, OBSERVÉ).
- iOS : minuteur dans la Dynamic Island et l'écran verrouillé (06/2026). Android : « Flow Bubble ».

## 3. Pipeline technique

```
[Mac] helper Swift (CGEventTap, AX, CoreAudio) ──JSON stdin/stdout── Electron
   audio PCM → encodage OPUS (WebCodecs) ──gRPC TLS, flux pendant l'enregistrement──► Baseten (AWS, multi-région)
   contexte (app, URL, AX, noms extraits) ──même flux gRPC──►       ASR (Canto depuis 09/2026) → Llama affiné (TensorRT-LLM)
   repli HTTP (chain …/run_remote) si gRPC KO, cooldown 30 min                      + LLM tiers pour formatage / commande
   ◄── texte final ── collage presse-papiers + Cmd+V (helper « text-injector ») → restauration presse-papiers ~0,5 s
```

| Élément | Constat | Statut | Source |
|---|---|---|---|
| Budget latence | « within 700ms of when they stop speaking » ; ASR < 200 ms, LLM < 200 ms, réseau ≤ 200 ms | PROUVÉ (objectif) | https://wisprflow.ai/post/technical-challenges |
| Mesure fournisseur | pipeline complet < 700 ms **au p99** ; Llama : 100+ tokens en < 250 ms ; TensorRT-LLM, Baseten Chains, GPU à mise à l'échelle auto, multi-région AWS ; « We're optimizing the p99 experience for the p99 user » (Sahaj Garg, CTO) | PROUVÉ (marketing fournisseur) | https://www.baseten.co/resources/customers/wispr-flow/ |
| Latence réelle | « Dictation latency is down 30% since the start of the year » (09/07/2026) ; tiers : ~1-2 s ressenties (Spokenly), 1 399 ms (Aqua), 1 805 ms fin de parole → dernier caractère (LumeVoice) — tous concurrents | PROUVÉ (relatif) / OBSERVÉ (absolus, biaisés) | whats-new ; https://spokenly.app/blog/wispr-flow-review ; https://aquavoice.com/blog/aqua-vs-wispr-flow-v3 ; https://lumevoice.com/blog/wispr-flow-pricing-2026/ |
| ASR | jusqu'en 09/2026 : fournisseur non nommé (SUPPOSÉ : modèle open source affiné ou API tierce). **Canto**, 1er modèle maison, déployé pour tous le 17/09/2026 ; « lowest word error rate of every model we tested » sur enregistrements réels anglais ; labo « Wispr Advanced Interfaces Lab » dirigé par Ariya Rastrow | PROUVÉ (whats-new) / OBSERVÉ (presse) | https://wisprflow.ai/whats-new ; reworked.co ci-dessus |
| LLM | Llama affiné hébergé sur Baseten ; « Llama is controllable and customizable » (Garg) ; sous-traitants publics du Trust Center : AWS, Baseten, Vercel, OpenAI, Supabase ; Anthropic (ZDR signé 12/2025) cité dans la FAQ sécurité ; Cerebras / Fireworks / OpenRouter cités seulement par des concurrents | PROUVÉ (Baseten, Trust Center, FAQ) / OBSERVÉ (reste) | https://trust.wispr.ai/ ; https://docs.wisprflow.ai/articles/3467817258-security-and-compliance-faq ; https://www.getvoibe.com/resources/is-wispr-flow-safe/ |
| Redondance | depuis 06/2026 : « redundancy is now in place so a single provider outage doesn't take Flow down » après plusieurs semaines de pannes reconnues (« Flow has been less reliable than it should be ») ; uptime 99,9 % annoncé ensuite ; page de statut | PROUVÉ | whats-new 04/06, 10/06, 17/06, 09/07/2026 ; https://releases.sh/wispr-flow/releases |
| Streaming | client Mac : audio OPUS envoyé **pendant** l'enregistrement sur un flux gRPC vers `model-…grpc.api.baseten.co`, repli WAV/HTTP ; API publique : WebSocket, PCM 16 kHz mono 16 bits en paquets d'~1 s, `append` puis `commit`, partiels (~30 s), contexte dans `auth` (app, dictionnaire, texte avant/après curseur, capture, conversation) | OBSERVÉ (client) / PROUVÉ (API) | https://www.wensenwu.com/thoughts/wispr-flow-investigation ; https://api-docs.wisprflow.ai/websocket_api |
| Hors ligne | **aucun** : tout passe par le cloud ; Android affiche « No internet. Try again later » ; un test concurrent sans Wi-Fi échoue | PROUVÉ (Android) / OBSERVÉ | https://docs.wisprflow.ai/articles/4984532368-fix-taking-longer-than-usual-and-transcription-errors ; https://lumevoice.com/blog/does-wispr-flow-work-offline-complete-guide/ |
| Stockage local | `~/Library/Application Support/Wispr Flow/flow.sqlite` : 694 Mo, 3 404 lignes, **198 Mo d'audio brut** (colonnes `audio`, `opusChunks`), `axText`, `axHTML`, colonne `screenshot` ; envoi `POST /history/upload` horaire ; télémétrie PostHog, Sentry, Segment, Datadog | OBSERVÉ | wensenwu.com |
| Rétention / Privacy Mode | Privacy Mode = zéro rétention (audio traité puis jeté) ; **off par défaut** sauf Enterprise/HIPAA ; BAA HIPAA ; SOC 2 Type II, ISO 27001 (rapport réservé Enterprise) ; audio réécoutable / réessayable **14 jours** ; « never-store » d'organisation → « History disabled » ; un rapport de bug envoie le texte même en Privacy Mode ; entraînement sur données en opt-in (après la polémique de 05/2026 sur les captures envoyées) | PROUVÉ (docs) / OBSERVÉ (défaut off, polémique) | https://docs.wisprflow.ai/articles/4218718535-hipaa-compliance-healthcare-use ; article 7971211038 ; https://www.laxis.com/blog/wispr-flow/ ; https://medium.com/ai-tools-tips-and-news/is-wispr-flow-safe-i-read-11-subprocessor-names-so-you-dont-have-to-f181b48b4db6 |
| Personnalisation | « most personalization data must live on a user's device » ; capture des corrections sur l'appareil, politique RL locale (objectif) | PROUVÉ (objectif) | technical-challenges |

Interviews : épisodes Generative Now (10/2025, « training in-house models, beating sub-second latency »), Village Global (métrique **« zero edit rate »** plutôt que WER), Forward Obsessed, World of DaaS. Aucune citation verbatim de Tanay Kothari sur l'ASR trouvée dans les pages lues ; seule citation produit : Canto est fait « for the places people actually talk » (X, via reworked.co). Transcriptions intégrales non lues : limite de cette veille.

## 4. Insertion, historique, réessai

PROUVÉ, https://docs.wisprflow.ai/articles/7971211038-fix-text-not-pasting-after-dictation et article 4984532368 :
- Collage par **presse-papiers temporaire + Cmd/Ctrl+V**, restauration ~0,5 s après (sauf si l'utilisateur a copié autre chose) ; exceptions Windows : ~3 s pour Outlook, Word, WhatsApp ; ~5 s en bureau à distance. Formats restaurés sur Windows : texte, HTML, images (pas fichiers, PDF, RTF).
- Échec de collage → texte laissé dans le presse-papiers + notification ; « Click a textbox and use [shortcut] to paste » quand rien n'a été produit.
- Mac : **Scratchpad** (Option+S, 05/2026) ; « Paste last transcript » Cmd+Ctrl+V ; test dans Notes pour isoler l'app fautive. Windows : apps élevées → « Run Flow as Administrator » ; terminaux qui collent avec Ctrl+Shift+V.
- Historique : clic = copie ; **Retry** (renvoie l'audio sauvegardé, ≥ 5 s, < 14 jours), **Recover** (dictée annulée), **Undo** (annulation), lecture audio dans l'historique (05/08/2026). Notice « Something's not right » avec Retry qui recolle dans le champ actif.
- **Audio sauvé automatiquement si Flow quitte/plante en pleine dictée** (01/05/2026) ; avant, la session était perdue.
- Correctifs d'insertion : longues dictées dans les terminaux IA ne se replient plus en « [Pasted N lines] » (05/2026) ; « improved text insertion reliability » (24/04/2026) ; formatage des snippets préservé (29/07/2026).
- Problème connu : détection de champ / insertion incorrecte avec dispositions **non-QWERTY** (AZERTY concerné) : https://docs.wisprflow.ai/collections/5686269587-known_issues

## 5. Plateformes et ressources

| | Constat | Statut | Source |
|---|---|---|---|
| macOS | Electron + helper Swift `accessibility-mac-app` (12 files GCD : event tap, IPC, callbacks audio, focus), binaires `keyboard-listener`, `text-injector` ; non sandboxé ; permissions Accessibilité + Micro | OBSERVÉ / PROUVÉ (permissions) | wensenwu.com ; article 5002934560 |
| Windows | même base Electron ; pas de permission d'accessibilité ; démarre « quietly in the background » (08/2026) ; plus de plaintes que Mac (gel d'apps, plantage version Store) | PROUVÉ / OBSERVÉ | whats-new ; https://www.laxis.com/blog/wispr-flow/ ; Trustpilot |
| iOS | clavier personnalisé (accès complet requis) ; le micro doit être ouvert par l'app principale → aller-retour d'app, aggravé par iOS 26.4 (« Apple now requires this to activate the microphone ») ; limite 5 min ; pas de sélecteur de micro | PROUVÉ | https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone ; https://docs.wisprflow.ai/articles/6269634092-adapting-to-ios-26-4 |
| Android | « Flow Bubble » au-dessus du clavier (02/2026) ; perte réseau en push-to-talk n'annule pas | PROUVÉ | https://techcrunch.com/2026/02/23/wispr-flow-launches-an-android-app-for-ai-powered-dictation/ |
| CPU/RAM | ~800 Mo RAM et ~8 % CPU au repos (vieilles mesures Reddit, Mac 2021, reprises par des concurrents) ; instantané interne : processus Electron 40-65 Mo chacun + helper Swift ~70 Mo, 10+ processus ; démarrage 8-10 s (avis) ; batterie : aucune mesure trouvée | OBSERVÉ | https://www.eesel.ai/blog/wispr-flow-review ; wensenwu.com |

## 6. Problèmes rapportés et corrections

| Problème | Réponse de Wispr | Statut |
|---|---|---|
| Premiers mots perdus (AirPods/Bluetooth) | article « known issue », conseil d'attendre ou micro filaire ; tip auto | PROUVÉ |
| Pannes / lenteurs (05-06/2026) | redondance multi-fournisseurs, montée en charge, page de statut, bannières « slow dictation » | PROUVÉ |
| Dictées perdues au crash/quit | sauvegarde auto de l'audio (05/2026), Retry/Recover | PROUVÉ |
| Micro silencieux non détecté | alerte immédiate au démarrage (10/2026) | PROUVÉ |
| Texte affiché mais non collé après mise à jour macOS | permissions à revalider après mise à jour (article 5510622673) | OBSERVÉ (récit tiers https://dictaflow.io/blog/dictation-text-vanished-macos-2026.html) / PROUVÉ (article) |
| Nettoyage trop agressif | rollback « auto cleanup » (06/2026) | PROUVÉ (releases.sh) |
| iOS : morceaux d'audio perdus sur réseau instable | « known issue » | PROUVÉ |
| Support lent / bot | avis App Store, Trustpilot | OBSERVÉ |

---

## 7. CBW AI face à Wispr (lecture de `pipeline.ts`, `recorder.ts`, `fnkey.ts`, `overlay.ts`, `sounds.ts`, `insert.ts`)

### Déjà fait (souvent mieux)
- **Gestes de la touche** (`fnkey.ts`, `FnGesture`) : maintien ≥ 350 ms = push-to-talk, double appui < 350 ms = mains libres, appui simple = arrêt, **triple appui = prise de notes**, Échap annule (enregistrement ou traitement), Ctrl+lettre pendant le maintien = annulation (raccourci, pas dictée). Fn, Control gauche ou droit.
- **Pré-ouverture du micro** au 1er appui (`recorder.arm`, refermé après 1,2 s) + **pré-écoute de 300 ms** (`PREROLL` dans `renderer/recorder.ts`) : protège les premiers mots mieux que Wispr (qui demande d'attendre).
- **Transcription locale** (whisper-server) et **streaming par segments VAD pendant la dictée**, transcription spéculative de la fin, **nettoyage LLM spéculatif** borné (quota) : Wispr est 100 % cloud, CBW fonctionne sans réseau pour l'ASR (texte brut si aucun LLM).
- Mesure fine : `speechEnd_to_pasted`, `release_to_pasted`… dans `dicta.log` (équivalent de leur obsession p99, mais local).
- Filtrage du silence (durée, parole VAD, hallucinations Whisper « merci d'avoir regardé »).
- Contexte de l'app (`snapshotContext`) et noms injectés dans le prompt Whisper, apprentissage (`learner.noteInserted`) — en avance sur la veille précédente.
- **Insertion** (`insert.ts`) : sauvegarde du presse-papiers *en parallèle* de la transcription, Cmd+V natif via le helper (CGEvent), replis uiohook puis osascript, restauration seulement si le presse-papiers n'a pas changé, texte assaini (caractères de contrôle, pas de retour final → sûr dans un Terminal). Mode « presse-papiers seul ».
- **Pastille** (`overlay.ts`) : NSPanel au-dessus du plein écran, collée au Dock (5 px) ou au bord en plein écran (helper `dicta-fullscreen`), Dock masqué suivi, glisser-déposer aimanté avec position mémorisée — au niveau de la Flow Bar (07/2026).
- Sons d'identité (`sounds.ts`) désactivables, anti-rafale 150 ms. « Copier la dernière dictée » dans la barre des menus (`tray.copyLast`).

### Fait moins bien
| Sujet | CBW aujourd'hui | Wispr | Proposition |
|---|---|---|---|
| Durée max | 5 min, arrêt silencieux (`MAX_DURATION_MS`, `onForcedStop`) | 20 min, alerte sonore + message à 19 min, collage auto | Passer à 15-20 min (le streaming par segments le permet), avertir à T-60 s (son `error` doux + texte sur la pastille). Effort S. |
| Micro silencieux | rien avant la fin (« trop court ou silencieux ») | alerte immédiate, puis 5 s / 15 s | Si niveau ≈ 0 pendant 1,5 s après le début : pastille « Aucun son du micro » ; à 8 s sans flux : « Micro inaccessible ». Effort S (`level` existe déjà). |
| Échec d'insertion | `'clipboard'` + message « Copié… (⌘V) » | notification + Retry/Insert + Scratchpad | Garder, mais ajouter un raccourci global « coller la dernière dictée » (Cmd+Ctrl+V) en plus du menu. Effort S. |
| Dernière dictée | copie depuis le menu seulement | raccourcis coller/copier, historique cliquable | Raccourcis + clic pour copier dans la page Accueil/historique. Effort S. |
| Restauration presse-papiers | délai fixe `paste.restoreDelayMs` (250 ms) | ~0,5 s, 3-5 s pour Word/Outlook/bureau à distance | Délai par app (bundleId déjà connu via le contexte) : 250 ms par défaut, 1,5-3 s pour Word, Outlook, Microsoft Remote Desktop, apps Electron lentes. Effort S. |
| AZERTY | Cmd+V via CGEvent : à vérifier que le keycode est celui de « V » quel que soit le clavier (piège connu de Wispr) | bug connu non-QWERTY | Test sur AZERTY/Dvorak ; utiliser le keycode virtuel 9 (`kVK_ANSI_V`) qui suit la position, ou résoudre la touche via `UCKeyTranslate`. Effort S. |

### Pas fait
| Manque | Intérêt | Proposition concrète | Effort |
|---|---|---|---|
| **Choix du micro** | élevé (AirPods, capot fermé, micros USB) | Réglage « Micro » (liste `enumerateDevices` dans la fenêtre de capture, `deviceId` passé à `getUserMedia`), vumètre de test, « Automatique » qui préfère intégré/filaire au Bluetooth ; détection capot fermé (micro intégré absent). Plus tard : sélecteur au clic droit sur la pastille. | M |
| **Bluetooth / AirPods** | élevé (premiers mots, son étouffé en HFP) | Si l'entrée par défaut est Bluetooth : forcer le micro intégré pour la dictée (option, défaut activé) — évite aussi la bascule HFP qui dégrade la musique. Conseil unique sinon. | S-M |
| **Couper / mettre en pause la musique** | moyen-élevé (Whisper + musique = erreurs) | Option « Mettre en pause la musique pendant la dictée » : via le helper Swift, MediaRemote (privé) ou plus simple AppleScript Music/Spotify si en lecture ; sinon baisse du volume de sortie et restauration exacte. Exclure les appels (Zoom, Teams, FaceTime). Off par défaut, comme Wispr Mac. | M |
| **Historique avec réessai** | élevé (zéro perte) | Garder le WAV des N dernières dictées (ex. 7 jours, chiffré AES local comme les clés, supprimable) ; boutons Réessayer (re-transcrire + re-nettoyer) et Copier dans l'historique ; sauver l'audio si l'app quitte pendant la dictée. Respecte la promesse « local ». | M |
| Annulation récupérable | moyen | Échap → toast « Dictée annulée · Récupérer » 5 s (l'audio est encore en mémoire). | S |
| Coupure du micro / appel entrant | moyen | Sur `devicechange` ou piste terminée : arrêter proprement et transcrire ce qui a été capté (comme leur « Insert »), au lieu d'échouer. | S |
| Secure Event Input | faible-moyen | Détecter `IsSecureEventInputEnabled()` dans le helper et afficher « Saisie sécurisée active (champ mot de passe / Terminal) » quand le raccourci ne répond plus. | S |
| Masquer la pastille | faible | « Masquer 1 h » au clic droit + réglage « toujours visible / seulement pendant la dictée ». | S |
| Mode chuchotement | faible-moyen | Pas de mode spécial : profil de gain (AGC déjà actif, `noiseSuppression: true`) + seuil VAD abaissé en option « Voix basse » ; tester d'abord si le seuil VAD actuel coupe la voix chuchotée. | S |
| Raccourcis souris / personnalisables | faible | Plus tard : bouton 4/5 de souris via le helper CGEventTap. | M |

### Ce qu'il ne faut pas copier
- Envoi de l'audio et du texte AX au cloud par défaut, base locale de 700 Mo avec audio et `axText` non chiffrés, télémétrie multiple : l'avantage de CBW est l'ASR local et le chiffrement local ; le garder.
- Refuser une nouvelle dictée pendant le traitement : CBW abandonne la précédente (`doBegin` → `abort`) ; mieux vaut les **chaîner** (finir de coller la première) que perdre le texte. À vérifier.

### Priorités suggérées
1. Choix du micro + préférence intégré si Bluetooth (S-M) — plus gros gain de fiabilité perçue.
2. Alerte micro silencieux + durée max 20 min avec avertissement (S).
3. Historique avec audio, Réessayer, Récupérer après Échap / plantage (M).
4. Raccourcis « coller / copier la dernière dictée » + délai de restauration par app + test AZERTY (S).
5. Pause musique (M).
