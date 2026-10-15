# Veille Wispr Flow (3/3) : fonctionnalités, intégrations, historique, concurrents

Date : 14 oct. 2026. Recherche web en lecture seule. Légende :
- **PROUVÉ** : source primaire Wispr (changelog officiel, centre d'aide, page tarifs, blog).
- **OBSERVÉ** : tiers identifiable (presse, avis datés, rétro-ingénierie, fil HN). Les pages de **concurrents** (Voibe, Spokenly, EmberType, Yaps…) sont marquées *(concurrent)*.
- **SUPPOSÉ** : déduction de ma part.

Limites : reddit.com est bloqué pour mes outils (les avis Reddit cités viennent de sources secondaires). Je n'ai trouvé ni Discord public ni tableau de votes public : l'ancien `roadmap.wisprflow.ai` redirige (308) vers `wisprflow.ai/whats-new`, un changelog sans votes. Aucun « Wrapped » annuel trouvé.

Sources clés : changelog https://wisprflow.ai/whats-new · tarifs https://wisprflow.ai/pricing · fonctionnalités https://wisprflow.ai/features · blog https://wisprflow.ai/blog · aide https://docs.wisprflow.ai

---

## 1. Inventaire des fonctionnalités

| Fonctionnalité | Ce que fait Wispr | Statut | Source |
|---|---|---|---|
| **Dictionnaire manuel** | Ajout de termes à la main. Onglets Tous / Perso / Équipe. Étoile = priorité (31 mars 2026). Classement par usage | PROUVÉ | whats-new (Desktop v1.4.661) ; https://wisprflow.ai/features |
| **Ajout auto au dictionnaire** | « Flow learns your words as you go » : une orthographe corrigée par l'utilisateur est ajoutée. Ancienne doc : correction d'un seul mot puis Entrée, entrée marquée « Auto-learned ». Filtre des apostrophes ajouté en mars 2026 | PROUVÉ (principe) ; détail du déclencheur = ancienne doc Notion | https://wisprflow.ai/features ; https://wispr.notion.site/Dictionary-1992ebdc733481a08064efd983f19f0f |
| **Snippets** | Une phrase-déclencheur dite au milieu d'une phrase insère un texte enregistré. Déclencheur ≤ 60 car., contenu ≤ 4 000 car. Texte riche depuis le 29 juil. 2026 (texte brut sur mobile). Partage en équipe | PROUVÉ | https://docs.wisprflow.ai/articles/5784437944-create-and-use-snippets ; https://wisprflow.ai/post/snippets (12 nov. 2025) |
| **Styles par type d'app** | 4 catégories : messages perso, messages pro, e-mails, autres. Styles Formel / Décontracté / Très décontracté / Enthousiaste. Défaut : perso = décontracté, le reste = formel. En anglais seulement | PROUVÉ | https://docs.wisprflow.ai/articles/2368263928-how-to-setup-flow-styles ; blog 29 oct. 2025 |
| **Nettoyage automatique (Auto Cleanup)** | Aucun / Léger / Moyen / Fort, avec « Annuler l'édition IA ». Remplace l'interrupteur Smart Formatting le 24 avr. 2026. Jugé trop agressif, corrigé le 9 juil. 2026 | PROUVÉ | whats-new |
| **Contexte (Context awareness)** | Lit le texte avant, sélectionné et après le curseur, le texte à l'écran, les noms de variables et de fichiers, l'app, le domaine du site et les apps de la session. Pas de capture d'écran (selon la doc). Ignore les mots de passe, les champs numériques et les apps bancaires. Désactivable (même désactivé, le nom de l'app et le domaine partent). Mac, Windows, iOS (champ seul) | PROUVÉ (doc) | https://docs.wisprflow.ai/articles/4678293671-feature-context-awareness |
| Controverse « captures d'écran » 2025 | Un utilisateur aurait vu partir des captures de la fenêtre active. Il aurait été banni, puis le CTO se serait excusé. La doc a ensuite été réécrite (« texte, pas de captures ») | OBSERVÉ *(concurrent)* | https://embertype.com/blog/the-day-wispr-flow-banned-a-user/ ; https://www.getvoibe.com/resources/is-wispr-flow-safe/ |
| **IDE : étiquetage de fichiers** | Dans le chat IA de Cursor ou Windsurf, un nom de fichier prononcé devient @fichier. Correspondance camelCase / snake_case, mot-déclencheur « tag » ou « at » | PROUVÉ | https://wisprflow.ai/post/file-tagging-in-cursor (30 juil. 2025) ; https://docs.wisprflow.ai/articles/9805771321-file-tagging |
| **IDE : reconnaissance des variables** | camelCase, snake_case, sigles, commandes CLI. 9 langages. Désactivé par défaut dans Cursor et Windsurf (exige le mode lecteur d'écran de l'IDE). Support partiel dans VS Code | PROUVÉ | https://docs.wisprflow.ai/articles/8554805225-variable-recognition (28 août 2025) |
| **Command Mode** | Raccourci dédié (Fn+Ctrl sur Mac) puis une consigne vocale. Avec une sélection : la remplace par la réécriture. Sans sélection : rédige ou répond au curseur. Peut aussi lancer une recherche Perplexity ou « créer une app ». Bêta, activé dans Réglages > Expérimental, payant ou essai. iOS : recherche seulement. Déclencheur « Hey Flow » en anglais | PROUVÉ | https://docs.wisprflow.ai/articles/4816967992-how-to-use-command-mode |
| **Transforms** (bêta, mai 2026) | Réécrit la sélection par raccourci : Polish (⌥1), Prompt Engineer (⌥2), comparaison (⌥O). Jusqu'à 8 prompts perso avec 5 exemples d'écriture chacun. Option « appliquer après chaque dictée », avec repli sur le texte brut si l'IA échoue | PROUVÉ | https://docs.wisprflow.ai/articles/8068950331-how-to-use-transforms-beta |
| **Notes → Scratchpad** | Flow Notes, puis Scratchpad (1er mai 2026) : éditeur riche à onglets, 50 versions, images, raccourci ⌥S, synchronisé avec l'iPhone. iOS : « Dictée rapide vers Notes » sur le bouton Action | PROUVÉ | https://docs.wisprflow.ai/articles/9618237082-using-the-scratchpad-to-save-and-edit-notes ; whats-new |
| **Historique** | Accueil = historique cherchable par date : copier, signaler, réessayer. Lecture audio sur 14 j (août 2026). Stockage local au choix : normal, effacé après 24 h, ou jamais | PROUVÉ | https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android ; whats-new |
| **Statistiques (Insights)** | Mots/min sur les 100 dernières dictées, avec rang « Top X % » face aux dactylos. Corrections faites par Flow (mots de remplissage, dictionnaire). Total de mots avec comparaison au mois précédent. Usage par catégorie (6). Carte de chaleur et séries (streaks). Cartes à partager sur X / LinkedIn. Pas de « temps gagné » dans la doc | PROUVÉ | https://docs.wisprflow.ai/articles/8760230576-your-usage-tab-track-your-dictation-stats-in-wispr-flow |
| **Classement (Leaderboard)** | Tri par mots, mots/min ou série. Pro teams depuis le 29 juil. 2026. Une version de la doc (mai 2026) le dit encore « en test interne » | PROUVÉ, déploiement flou | https://docs.wisprflow.ai/articles/7413787433-leaderboard-see-how-you-rank-among-wispr-flow-users |
| **Parrainage** | Le filleul a 30 j d'essai (au lieu de 14). Le parrain gagne 1 mois de Pro quand le filleul a dicté 2 000 mots. Seulement pour les abonnés via le site. Affiliation séparée (25 % du revenu, Dub) | PROUVÉ | https://docs.wisprflow.ai/articles/6496688316-how-to-find-your-referral-link ; https://partners.dub.co/flow |
| **Équipes** | Dictionnaire et snippets partagés (par organisation ou département depuis le 4 sept. 2026). Liens d'invitation. Essai de 14 j pour chaque nouveau membre. Tableau d'usage. Interrupteurs admin (Notetaker, MCP, Transforms, Scratchpad). Journaux d'audit, SCIM, SSO, entraînement désactivé de force (2 oct. 2026) | PROUVÉ | whats-new ; pricing ; https://docs.wisprflow.ai/articles/9639977157-view-shared-dictionary-words-and-snippets-in-the-admin-portal |
| **Notetaker** (réunions) | Mac le 5 août 2026, Windows le 15 sept. Sans bot. Agenda Google / Outlook. 22 langues, traduction (bêta). Import Otter / Granola. @mentions et fiches contact (9 oct.) | PROUVÉ | https://wisprflow.ai/blog ; whats-new |
| **MCP / Claude / ChatGPT** | Serveur MCP distant en lecture seule (10 sept. 2026) : transcriptions, notes, agenda, Scratchpad. **Pas les dictées.** Plugin officiel. Configuration en 1 clic pour Claude, ChatGPT, Gemini | PROUVÉ | https://github.com/Wispr-AI/wispr-flow-plugin ; whats-new |
| **Slack / Gmail / Notion** | **Aucune intégration API.** Ce sont des apps ciblées par la dictée système et par les catégories de style / contexte. La page « Extensions » de la barre latérale n'est pas documentée | PROUVÉ (absence de doc) / SUPPOSÉ | https://docs.wisprflow.ai/articles/5096240724-… |
| **Raccourcis** | Push-to-talk, mains libres (double appui, raccourci dédié devenu optionnel en août 2026), Échap pour annuler, « Mouse Flow » (boutons de souris), jusqu'à 4 combinaisons par action, 20 min max (contre 5 avant mars 2026) | PROUVÉ | whats-new ; doc Command Mode |
| **Murmure** | « Flow even works when you're whispering » ; guide de dictée discrète (19 août 2026) | PROUVÉ (revendication) | https://wisprflow.ai/features |
| **Langues** | 100+, changement de langue au fil de la phrase. Sélecteur dans la barre Flow (mars 2026). Carte « Vous parlez une autre langue ? » (sept. 2026) | PROUVÉ | whats-new |
| **Modèle** | Canto, premier modèle de reconnaissance maison, déployé le 17 sept. 2026 (avant : ASR tiers + Llama affiné sur Baseten). 100 % cloud, pas de mode hors ligne | PROUVÉ | whats-new ; https://www.baseten.co/resources/customers/wispr-flow/ |
| **Onboarding** | Micro, Accessibilité, raccourci (Fn par défaut sur MacBook), langues, essai dans une vraie app. Ensuite : greeting avec le raccourci jusqu'à 2 000 mots, stats débloquées à 500 mots. iOS : onglets verrouillés tant qu'on n'a pas dicté dans une autre app. Refonte vers « dicter dans tes apps » après que des débutants restaient dans l'app Wispr | PROUVÉ (doc) / OBSERVÉ (refonte) | doc navigation ; https://www.productgrowth.blog/p/wispr-flow-growth-teardown |
| **Clavier iOS** | Clavier tiers avec « Flow Sessions » (fenêtre micro) et retour automatique vers l'app d'origine (étendu à Claude, ChatGPT… le 2 juil. 2026). Accès complet requis, en ligne obligatoire. iOS 26.4 a retiré le retour rapide et le style par app (contrainte Apple) | PROUVÉ | https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone ; whats-new |
| **Android** | 23 févr. 2026 : bulle flottante via Accessibilité. Pause dans 50+ apps bancaires. Opacité de la bulle réglable | PROUVÉ | https://techcrunch.com/2026/02/23/wispr-flow-launches-an-android-app-for-ai-powered-dictation/ |
| **Windows** | 12 mars 2025 (sans permission spéciale pour le contexte) | PROUVÉ | https://www.prnewswire.com/news-releases/developers-are-ditching-their-keyboards-as-wispr-flow-expands-to-new-platforms-302399506.html |
| **Confidentialité** | Privacy Mode (pas d'entraînement) séparé de Cloud Sync (stockage serveur) depuis le 17 juin 2026. Avant, Privacy Mode = zéro rétention. HIPAA sur tous les plans (6 août 2025) | PROUVÉ | whats-new ; blog |

### Tarifs (page officielle, 14 oct. 2026)
| Plan | Prix | Limites |
|---|---|---|
| Free (Basic) | 0 $ | 2 000 mots/sem. sur ordinateur, 1 000 sur mobile. Dictionnaire et snippets inclus. Notetaker limité |
| Pro | 15 $/mois ou 12 $/mois en annuel | Illimité, partage d'équipe, analytics d'équipe |
| Growth | 23 $ ou 18 $/utilisateur/mois | SSO, HIPAA BAA, entraînement contrôlé par l'admin, Notetaker illimité |
| Enterprise | Sur devis | SCIM, MDM, audit, sièges admin IT gratuits |

Autres conditions : essai Pro de 14 j ; −50 % étudiants. Un plan étudiant gratuit et illimité est apparu fin juillet 2026 puis a été retiré le 11 août (OBSERVÉ, https://www.usagepricing.com/blueprint/activity/wisprflow-2026-08-11-deprecation). Android est passé d'illimité à 1 000 mots/sem. en sept. 2026 (OBSERVÉ, https://pricingsaas.com/companies/wisprflow/diffs/2026W39).

---

## 2. Chronologie

| Date | Événement | Statut |
|---|---|---|
| 30 sept. / oct. 2024 | Lancement Mac (Show HN, Product Hunt). Auto-édition, Command Mode déjà présent, 100+ langues | PROUVÉ https://news.ycombinator.com/item?id=41696153 |
| 2024-2025 | Command Mode en bêta (Fn+Cmd), réponse via Perplexity sans sélection | PROUVÉ https://wispr.notion.site/Command-Mode-Beta-1992ebdc7334819b81e2d8cb62a93e83 |
| 12 mars 2025 | Windows | PROUVÉ |
| 2 / 3 juin 2025 | iPhone (clavier) | PROUVÉ |
| 30 juil. 2025 | Étiquetage de fichiers dans Cursor | PROUVÉ |
| 6 août 2025 | HIPAA sur tous les plans | PROUVÉ |
| 28 août 2025 | Reconnaissance des variables (Cursor, Windsurf…) | PROUVÉ |
| 2025 (date floue) | Controverse des captures d'écran, bannissement, excuses | OBSERVÉ *(concurrents)* |
| 29 oct. 2025 | Styles par type d'app (anglais, ordinateur ; iOS ensuite) | PROUVÉ (blog) ; https://alternativeto.net/news/2025/10/wispr-flow-introduces-personalized-text-formatting-by-app-type |
| 4 nov. 2025 | Essai Pro en équipe sans risque | PROUVÉ (blog) |
| 12 nov. 2025 | Article Snippets (fonction déjà là ; ancienne mise à jour « shared dictionaries + voice snippets » pour les équipes) | PROUVÉ |
| 15 déc. 2025 | Rachat de Yapify | PROUVÉ (blog) |
| 23 févr. 2026 | Android | PROUVÉ |
| mars 2026 | Scandale d'audit Delve (SOC 2 / ISO de façade), nouvel audit A-LIGN | OBSERVÉ https://techcrunch.com/2026/03/22/delve-accused-of-misleading-customers-with-fake-compliance/ |
| 31 mars 2026 | Sessions de 20 min, Mouse Flow, étoile dans le dictionnaire, nouvelle tentative inline, sélecteur de langue, nouvelles apps dans Styles | PROUVÉ |
| 4 avr. 2026 | Rétro-ingénierie : interception clavier globale, base locale de 694 Mo, envois horaires | OBSERVÉ https://www.wensenwu.com/thoughts/wispr-flow-investigation |
| 24 avr. 2026 | Onglet Insights, Auto Cleanup en 4 niveaux avec annulation, options de stockage local, liens d'invitation | PROUVÉ |
| 1er mai 2026 | Scratchpad remplace Flow Notes, Transforms (bêta), récupération de l'audio | PROUVÉ |
| 4 → 24 juin 2026 | **Crise** : pannes et précision en baisse, retour arrière d'Auto Cleanup testé, tout le monde ramené sur le même modèle (certains tournaient sur d'anciens) | PROUVÉ (aveu dans le changelog) |
| 17 juin 2026 | Privacy Mode et Cloud Sync séparés (fin du « Privacy Mode = zéro rétention ») | PROUVÉ |
| 9 juil. 2026 | **Auto Cleanup trop agressif corrigé** ; la barre Flow devient déplaçable (elle était fixe en bas) | PROUVÉ |
| 29 juil. 2026 | Snippets en texte riche, Leaderboard pour les équipes Pro | PROUVÉ |
| 5 août 2026 | Notetaker (Mac), lecture audio dans l'historique sur 14 j | PROUVÉ |
| 21 août 2026 | Micros virtuels (Krisp, BlackHole), raccourci mains libres optionnel, démarrage silencieux sous Windows | PROUVÉ |
| 4 sept. 2026 | Dictionnaire partagé par département, mises à jour appliquées seulement quand l'utilisateur est inactif | PROUVÉ |
| 10-15 sept. 2026 | MCP (Claude, ChatGPT, Gemini), Notetaker sur Windows | PROUVÉ |
| 17 sept. 2026 | Canto (modèle de reconnaissance maison) | PROUVÉ |
| 2-9 oct. 2026 | Entraînement désactivé de force en Growth / Enterprise, audit des accès. Alerte « micro muet », proposition d'ajouter une langue | PROUVÉ |

**Retraits et retours en arrière après plaintes (PROUVÉ, whats-new)** : Smart Formatting remplacé par Auto Cleanup, lui-même jugé trop agressif puis corrigé en juillet. Notification Android permanente supprimée. Secousse anti-snooze Android restreinte (faux déclenchements, batterie). Barre fixe rendue déplaçable. Raccourci mains libres dédié rendu optionnel. Mises à jour qui redémarraient l'app en pleine tâche, différées. Android v2.0.9 « suite aux signalements d'instabilité ».

---

## 3. Ce que les utilisateurs aiment / réclament

**Aimé (OBSERVÉ : Product Hunt 4,8/5 sur 81 avis https://www.producthunt.com/products/wisprflow/reviews ; G2 https://www.g2.com/products/wispr-flow/reviews_and_filters)**
1. Vitesse : « 3,5× plus vite que taper », de 54 à 106 mots/min. Étiquettes PH : « productivity boost » (25), « fast performance » (19).
2. Fonctionne partout où l'on tape, sans changer d'app.
3. Nettoyage des « euh » et ponctuation juste : 50-70 % de messages sans retouche revendiqués (Show HN).
4. Termes techniques bien reconnus, et mélange de langues (les mots anglais restent en anglais dans une phrase tchèque).
5. Dicter ses prompts pour Claude ou ChatGPT, ce qui est le cas d'usage phare.

**Reproché / réclamé**
| Demande | Statut | Source |
|---|---|---|
| Mode hors ligne / local, « privacy-first » | OBSERVÉ (PH, HN « non-cloud alternative ? ») | https://news.ycombinator.com/item?id=49809670 |
| Mémoire / CPU (Electron, ~800 Mo de RAM au repos) ; Wispr annonce −27 % de mémoire en oct. 2026 | OBSERVÉ | PH ; https://x.com/WisprFlow |
| Confidentialité (captures, interception clavier, audit Delve) | OBSERVÉ *(sources en partie concurrentes)* | voir §1-2 |
| Texte qui s'affiche pendant la dictée (streaming) plutôt qu'en un bloc à la fin | OBSERVÉ | PH (Jenny Liu) ; https://news.ycombinator.com/item?id=46824506 ; Aqua le vend en « Realtime Mode » |
| Nettoyage trop zélé (« sur-normalise ») | PROUVÉ (corrigé le 9 juil.) + OBSERVÉ | whats-new ; PH |
| Fiabilité Windows et Android, pannes de juin | PROUVÉ / OBSERVÉ | whats-new ; Trustpilot |
| Linux | OBSERVÉ (non proposé) | https://www.opensourcealternatives.to/alternative-to/wispr-flow |
| Mobile moins « conscient du contexte » que l'ordinateur ; notation mathématique | OBSERVÉ | PH |
| Achat à vie (pas d'option) | OBSERVÉ *(concurrent)* | getvoibe.com |
| Sessions plus longues (5 → 20 min), barre déplaçable, choix du micro | PROUVÉ (livrés après demandes, SUPPOSÉ) | whats-new |

---

## 4. Concurrents (sur ces fonctionnalités)

| | Dictionnaire | Remplacements / snippets | Contexte écran | Commande / réécriture vocale | IDE | Notes / réunions | Stats | Local | Plateformes | Prix |
|---|---|---|---|---|---|---|---|---|---|---|
| **Wispr Flow** | Oui + auto + équipe | Snippets (riches) | Texte AX | Command Mode + Transforms | Fichiers + variables | Scratchpad + Notetaker | Très riches + classement | Non | Mac, Win, iOS, Android | 15 $/mois, 2 000 mots/sem. gratuits |
| **Superwhisper** | Oui | Non confirmé | Super Mode (app, sélection, presse-papiers) | Modes perso (prompt, modèle au choix) | CLI + MCP | Enregistreur de réunions | ? | Oui (Whisper, Parakeet) | Mac, Win, iOS, Android | Gratuit / Pro / à vie (~250 $) |
| **Aqua Voice** | Oui (élargi en Pro, d'équipe en Business) | ? | Lecture AX de l'écran | Instructions perso, « Send it », temps réel (Max) | Mise en forme du code | ? | ? | Non | Mac, Win, iOS, Android | 8-10 $ Pro, 24-30 $ Max, 1 000 mots gratuits |
| **VoiceInk** (open source) | « Custom words » + Auto Learn (code) | Smart Replace | OCR local / sélection (Power Mode par app ou URL) | Réécriture de la sélection | — | Journal Markdown | ? | Oui | Mac | 25-49 $ à vie |
| **Willow Voice** | Oui + équipe | Raccourcis perso (non confirmé) | Oui | « Scribe » | ? | ? | ? | Non | Mac, Win, iOS (Android bientôt) | gratuit (modèle Mini) / 15 $ |
| **Monologue** (Every) | Oui | ? | Capture d'écran « deep context » | Modes (mail, doc, code) | Mode code | Notes de réunion sans bot | ? | Optionnel | Mac, iOS | 1 000 mots gratuits, 15 $ |
| **MacWhisper** | Oui | Remplacements | Non | IA (Pro) | — | Enregistrement de réunions + locuteurs | — | Oui | Mac | ~59-64 € à vie |
| **Spokenly** | Oui | Remplacements | ? | Prompts perso ; actions agentiques ; MCP pour Claude Code / Cursor | MCP | Diarisation, fichiers | ? | Oui (gratuit) | Mac, Win, Linux, iOS | Gratuit (local / BYOK), 9,99 $ Pro |

Sources : https://superwhisper.com ; https://aquavoice.com/pricing ; https://tryvoiceink.com ; https://willowvoice.com/pricing ; https://monologue.to/pricing ; https://spokenly.app ; https://www.getvoibe.com/resources/macwhisper-pricing/ *(concurrent)*. Les « ? » n'ont pas été vérifiés. Statut global : OBSERVÉ (pages éditeurs, souvent marketing).

Lecture : Wispr gagne sur l'**étendue** (équipes, stats, mobile, IDE). Les concurrents gagnent sur le **local, l'achat à vie et la confidentialité** (VoiceInk, Spokenly, MacWhisper, Superwhisper) et sur le **temps réel** (Aqua Max).

---

## 5. Comparaison avec CBW AI

État de CBW AI, lu dans `CLAUDE.md`, `docs/APP_API.md`, `docs/PAUSE.md` et `src/main/settings.ts` :
- dictée Control ×2 (mains libres, maintien = push-to-talk, Échap) ;
- Whisper **local**, nettoyage par LLM (Groq, Gemini, Z.ai, OpenRouter, Ollama en repli) ;
- dictionnaire de 200 termes, avec apprentissage des corrections et notification ;
- contexte de l'app active par AX, exclusions, aucune capture ;
- styles Léger / Standard ;
- 20 dernières dictées ;
- stats : mots, dictées, mots/min, série, minutes gagnées, 30 jours, par moteur ;
- notes de réunion avec qui a dit quoi et son du Mac ;
- onboarding en 7 étapes, mises à jour signées, « tout effacer » ;
- langue fr / en / auto.

Effort : S ≤ 1 j · M 2-5 j · L 1-2 sem. · XL > 2 sem.

| Fonctionnalité | Wispr | CBW AI | Intérêt pour l'utilisatrice | Effort |
|---|---|---|---|---|
| Dictionnaire manuel | Oui (étoile, classement par usage) | Oui (200 termes) | Acquis ; l'étoile « prioritaire » est un petit plus | S |
| Ajout auto depuis les corrections | Oui | Oui (`learn.ts`, notification) | Acquis, au niveau de Wispr | — |
| **Snippets** (phrase → texte) | Oui | **Non** | **Élevé** : signature, adresse, lien d'agenda, réponses types. Remplacement local après le nettoyage, sans LLM | **S-M** |
| Styles par type d'app | 4 catégories × 4 tons | Partiel (niveau global) | Moyen-élevé : Slack décontracté, Mail formel. Le contexte détecte déjà l'app, il suffit de mapper bundle → catégorie → consigne | M |
| Niveaux de nettoyage + annuler l'édition IA | 4 niveaux + annulation | Partiel (2 niveaux ; `keepRawOnFailure`) | Moyen : un « coller la version brute » en 1 raccourci rassure | S |
| Contexte (noms à l'écran) | Oui | Oui (AX, ≤ 40 noms, exclusions) | Acquis ; CBW est plus sobre (seuls les noms sont transmis) | — |
| **Command Mode / réécriture de la sélection** | Oui (bêta, payant) | **Non** | **Élevé** : « rends ça plus poli », « fais une liste ». Le helper lit déjà la sélection (`dicta-context`) et le router LLM existe | **M** |
| Transforms (prompts perso par raccourci) | Oui (8) | Non | Moyen : à faire après le Command Mode | M |
| IDE : @fichier, variables | Oui | Non | Faible pour Camille, sauf si elle dicte dans Cursor ou Claude Code | L |
| Slack, Gmail, Notion (API) | Non (dictée système) | Non (dictée système) | Nul : ni l'un ni l'autre n'a d'intégration API ; ne pas en faire | — |
| MCP (notes lisibles par Claude) | Oui (réunions, pas les dictées) | Non | Moyen : les notes sont déjà des `.md` dans `~/Documents/CBW AI/Notes`, donc lisibles par Claude Code sans MCP | M |
| Notes / réunions | Notetaker (cloud, agenda) | **Oui** (local, qui a dit quoi, son du Mac) | Acquis ; CBW est en avance sur le local et la gratuité | — |
| Bloc-notes vocal (Scratchpad) | Oui | Non | Faible-moyen | M |
| Historique | Cherchable, audio 14 j, réessayer | Partiel (20 dernières, brut ↔ propre) | Moyen : **réessayer une dictée ratée** (garder le WAV de la dernière) et la recherche | S-M |
| Stats | Riches (rang, carte de chaleur, partage) | Oui (mots, mots/min, série, temps gagné, 30 j) | Acquis ; une carte de chaleur et une carte à partager restent optionnelles | S |
| Classement, « Wrapped » | Leaderboard (équipes) ; pas de Wrapped trouvé | Non | Faible (usage solo) | — |
| Parrainage | Oui (1 mois offert) | Non | Faible tant que l'app est gratuite et sans compte | — |
| Équipes (dictionnaire partagé, admin) | Oui | Non | Faible aujourd'hui ; utile si CBW Studio vend aux PME (export / import du dictionnaire suffirait d'abord) | S (export) / XL (vraies équipes) |
| Onboarding | Guidé, essai dans une vraie app | Oui (7 étapes, essai intégré) | Acquis ; idée Wispr : afficher le raccourci sur l'Accueil tant que < 2 000 mots | S |
| Tarifs, limites | 2 000 mots/sem. gratuits, 15 $ | Gratuit (clés gratuites, local) | Avantage CBW : rien à payer, pas de plafond | — |
| Hors ligne | Non | Partiel (Whisper local ; LLM cloud avec repli Ollama) | **Fort argument** face à la demande n° 1 des déçus de Wispr | — |
| Texte affiché pendant qu'on parle (streaming) | Non (demandé) | Non | Moyen : un aperçu live dans la pastille ; coûteux avec whisper.cpp | L |
| Alerte « micro muet » au début de la dictée | Oui (oct. 2026) | ? (non vu) | Moyen, évite les dictées perdues | S |
| Sélecteur de langue rapide, détection « autre langue » | Oui | Partiel (réglage fr / en / auto) | Faible-moyen | S |
| Durée max de dictée | 20 min | 5 min (notes illimitées) | Faible (les notes couvrent le besoin) | S |
| Mains libres, push-to-talk, Échap | Oui | Oui | Acquis | — |
| Boutons de souris | Oui | Non | Faible | M |
| iOS (clavier), Android, Windows | Oui | Non (macOS seul) | Faible pour Camille (Mac) ; XL chacun | XL |
| Contrôles de confidentialité | Privacy Mode + Cloud Sync | Local par défaut, journaux sans texte, tout effacer | Avantage CBW ; à mettre en avant sur le site | — |

### Priorités suggérées (SUPPOSÉ, à arbitrer par Camille)
1. **Snippets** (S-M) : le meilleur gain par jour de travail, entièrement local.
2. **Réécriture vocale de la sélection** (Command Mode, M) : réutilise `dicta-context` et le router.
3. **Styles par catégorie d'app** (M) : réutilise le contexte déjà en place.
4. Petits gains (S) : réessayer la dernière dictée, coller la version brute, alerte micro muet, étoile dans le dictionnaire.
5. Sur le site : vendre le **local / gratuit / sans plafond / sans capture**, c'est-à-dire exactement les plaintes adressées à Wispr.
