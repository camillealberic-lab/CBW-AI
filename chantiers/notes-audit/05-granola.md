# Veille Granola — ce qui rend l'outil excellent, et ce que CBW AI doit reprendre

Veille du 15/10/2026, lecture seule sur le web. Complète `02-veille.md`, qui couvrait déjà Granola côté identification des voix.
Légende : **PROUVÉ** = doc officielle ou annonce Granola · **OBSERVÉ** = revue ou témoignage tiers (un seul site, parfois intéressé) · **SUPPOSÉ** = déduction de notre part.

---

## 0. En une phrase

Granola n'est **pas** un enregistreur qui résume. C'est un **bloc-notes** (« ça ressemble à Apple Notes pendant la réunion », Chris Pedregal, CEO) qui écoute en arrière-plan. À la fin, l'IA **complète tes propres notes** avec la transcription, puis s'efface. Tes mots restent en noir, ses ajouts en gris, et chaque point renvoie à sa source. Toute la magie tient dans ce contrat : **l'utilisateur garde la main, l'IA fait 85 % du chemin**.

---

## 1. Le principe

| Élément | Détail | Statut / source |
|---|---|---|
| Pas de bot | Capture du **micro et du son système** sur l'ordinateur. Aucun participant ajouté à l'appel. | PROUVÉ, https://docs.granola.ai/help-center/taking-notes/transcription.md |
| Audio mélangé | Granola capte le son système et le micro **combinés**. Impossible d'isoler une app : la musique et les alertes passent aussi. Dans la transcription, micro = « Me » (bulles vertes à droite), système = « Them » (bulles grises à gauche). | PROUVÉ, même page |
| Bloc-notes | À l'ouverture de la réunion, l'éditeur de notes est une page blanche. On tape en Markdown léger (`#`, `-`, `[]`, gras/italique ⌘B/⌘I/⌘U, images glissées-déposées). Les fautes et abréviations sont permises : l'IA corrige. Prendre des notes reste **facultatif**. | PROUVÉ, https://docs.granola.ai/help-center/taking-notes/taking-notes-in-granola.md |
| « Enhance » | Génération **automatique** quand l'appel semble terminé ou à l'arrêt manuel. Trois entrées : la transcription, les notes brutes et l'événement du calendrier. Les titres et puces de l'utilisateur **structurent** la sortie, et son contenu est **prioritaire**. | PROUVÉ, https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes.md |
| Noir / gris | « Les points que tu as écrits restent visibles en noir ; le détail ajouté par Granola apparaît en gris. » | PROUVÉ, https://www.granola.ai/blog/get-the-best-from-granola |
| Loupe | Une loupe à côté de chaque point montre le passage de la transcription ou la note brute d'où il vient. | PROUVÉ, mêmes pages |
| Retour aux notes brutes | Une icône « trois lignes » réaffiche tes notes. On peut modifier les notes brutes puis relancer l'enhance. | PROUVÉ, ai-enhanced-notes |
| Philosophie | Augmenter plutôt qu'automatiser. Rester « invisible, mais là dès que tu trébuches » (image de la rampe). L'équipe a essayé une IA qui écrit en direct et l'a abandonnée : « tu ne peux pas t'empêcher de lire ce que l'IA écrit ». **50 % des fonctions coupées** avant le lancement. Viser « 85 % du chemin », le jugement reste humain. | PROUVÉ (propos du CEO), https://every.to/podcast/transcript ; https://podwise.ai/dashboard/episodes/2853882 |

**À retenir** : l'IA ne tourne pas pendant la réunion. Pendant l'appel, l'écran est calme : une page blanche et un petit indicateur. L'effet « waouh » arrive à la fin, en quelques secondes.

---

## 2. L'expérience complète

### Avant la réunion
- **Agenda connecté** (Google / Microsoft ; exigé à l'inscription selon HappyScribe). La page d'accueil liste les réunions à venir (« Coming up »). PROUVÉ (docs calendrier) / OBSERVÉ (exigence d'accès complet, https://www.happyscribe.com/blog/granola-ai-review).
- **Notification maison** en haut à droite, **1 min avant** une réunion qui a au moins 2 participants. Un clic ouvre le lien de visio et la note, et lance la transcription. Granola peut aussi repositionner sa fenêtre au début de la réunion (désactivable). PROUVÉ, https://docs.granola.ai/help-center/taking-notes/notifications.md
- **Détection d'appel hors agenda** dès que le micro est utilisé. Titres : « Huddle detected » (Slack), « Call detected » (FaceTime, WhatsApp), « Meeting detected » (autres). Le corps nomme l'app et propose un bouton **Take Notes**. Une barre en pointillés distingue cette notification de celle du calendrier (barre pleine colorée). Un appel qui démarre moins de 15 min après une réunion prévue en reprend le nom. PROUVÉ, même page.
- **Briefs** (mai 2026) : fiche préparée **la nuit** pour les réunions externes. Elle résume les participants, les échanges passés, les sujets ouverts et un e-mail pertinent si Gmail est connecté. PROUVÉ, https://www.granola.ai/updates ; https://www.createwith.com/tool/granola/updates/granola-launches-briefs-to-automate-meeting-prep-overnight
- On peut écrire l'ordre du jour dans la note **avant** l'appel.

### Pendant
- Le démarrage se fait en un clic : notification, ouverture de la note après l'heure prévue, ou « + New Note ». Il n'y a **pas d'enregistrement automatique** sans geste de l'utilisateur. PROUVÉ, transcription.md
- **Indicateur** : des barres vertes animées en bas de la note. Un clic dessus ouvre le panneau de transcription en direct (icône « ondes » à gauche de la barre « Ask anything »). PROUVÉ/OBSERVÉ, https://docs.granola.ai/help-center/troubleshooting/notes-not-generating
- **Chat en direct** (janv. 2025) : « Qu'est-ce que j'ai raté ? », « Sur quoi est-on encore en désaccord ? ». PROUVÉ, updates + get-the-best
- On peut consulter d'autres notes pendant que la transcription continue (mars 2025). PROUVÉ, updates
- **Arrêt automatique** : fin d'appel détectée, 15 min sans son, ou Mac en veille. Sans heure de fin prévue, l'arrêt est moins fiable. Deux appels enchaînés peuvent se fusionner. PROUVÉ, transcription.md

### Après
- **Génération automatique**, en « quelques secondes » selon Zapier (OBSERVÉ, https://zapier.com/blog/granola-ai/). La doc reste prudente : « peut prendre quelques minutes pour les longues réunions », avec une notification quand c'est prêt et un bouton Réessayer qui passe par une autre voie vers les LLM (PROUVÉ, notes-not-generating).
- Le résultat par défaut est une **liste à puces courtes regroupées par sujet**. On survole un point puis on clique sur la loupe pour voir le détail. OBSERVÉ, Zapier.
- **Templates** (gabarits de compte rendu, oct. 2024) : sélecteur en bas ou bouton ✨ en haut à droite, réglé sur **« Auto »** par défaut. Granola suggère un gabarit selon le titre, la description, les rôles des participants et l'historique des réunions. Environ 29 gabarits intégrés : 1:1, Stand-up, Weekly team, Customer discovery, Sprint planning, Investor update, entretien d'embauche, appel commercial… Les gabarits proposés dépendent du profil choisi à l'installation. Un gabarit perso se décrit par son but, sa longueur et son style, puis ses sections avec une consigne chacune. On peut taper `/` dans la note pour en choisir un pendant l'appel. Un bouton 🔁 régénère la note. PROUVÉ, https://www.granola.ai/updates/upgraded-meeting-note-templates ; https://docs.granola.ai/help-center/taking-notes/customise-notes-with-templates.md
- **Retouche par la conversation** (juil. 2025) : « rends la section prochaines étapes plus détaillée ». PROUVÉ, updates
- **Recipes** (sept. 2025) : prompts enregistrés, lancés avec `/` dans la barre de chat. On les trouve dans Discover, Mes recipes et Workspace. Chaque recipe vise **une réunion** (« Draft the follow-up email », « Coach me ») ou **plusieurs** (« List recent to-dos », synthèse des retours produit). Pas de variables. PROUVÉ, https://docs.granola.ai/help-center/getting-more-from-your-notes/recipes
- **Ask Granola** (⌘J) sur une note, un dossier, des réunions cochées ou tout l'historique. Réponses avec **citations en ligne** qui renvoient à la ligne de transcription. Chat refait en agent en avril 2026. Modèle « Auto », ou choix entre standard et thinking sur les offres payantes. PROUVÉ, https://docs.granola.ai/help-center/getting-more-from-your-notes/chatting-with-your-meetings ; https://www.granola.ai/blog/two-dot-zero
- **Organisation** : dossiers privés ou d'équipe (Granola 2.0), vues **Personnes** et **Entreprises** (sept. 2025), « Shared with me », @mentions, corbeille. PROUVÉ, updates
- **Partage** : lien public sans compte. Le destinataire lit le résumé et peut chatter, mais ne voit pas la transcription. Notes privées par défaut. PROUVÉ/OBSERVÉ, Zapier + docs. La presse a critiqué un lien « visible par quiconque l'a » (https://www.techbuzz.ai/articles/granola-s-private-ai-notes-are-public-by-default).
- **Intégrations** : Slack (publication auto du résumé et des actions, avec un bouton « Chat with this meeting »), Notion en un clic, HubSpot, Attio, Affinity, Zapier (8 000 apps), API (payante), **MCP** (févr. 2026, vers Claude, ChatGPT, Cursor). PROUVÉ, llms.txt + updates
- **Mobile** : iOS (avr. 2025) pour le présentiel, appels téléphoniques (sept. 2025), Windows (juin 2025), Android (juil. 2026), Apple Watch (juil. 2026). Sur mobile, la transcription se fait *après* la réunion, à partir d'un audio mis en cache temporairement. PROUVÉ, updates + security

---

## 3. Technique

| Sujet | Ce qu'on sait | Statut |
|---|---|---|
| Transcription | **Deepgram et AssemblyAI** (cloud), **en temps réel** sur ordinateur. L'audio part chez le fournisseur pendant l'appel. Une option locale existe, mais en anglais seulement (voir §9.3). | PROUVÉ, https://www.granola.ai/security ; OBSERVÉ, https://zackproser.com/blog/granola-ai-review (« appeler ça "sur l'appareil" est trompeur ») |
| LLM | **OpenAI et Anthropic** principalement (« mélange de modèles »). Google et d'autres sont proposés dans le chat. Mode « Auto » par défaut. Pas d'entraînement chez les fournisseurs. | PROUVÉ, security + ai-enhanced-notes + 2.0 |
| Pari produit | Le temps réel plutôt que le différé : « un jour, la transcription en direct sera aussi bonne que l'asynchrone ». Les notes doivent être prêtes **immédiatement**. | PROUVÉ (CEO), every.to |
| Audio conservé | **Jamais** sur ordinateur (on ne peut donc pas réécouter). Seuls la transcription et les notes sont stockées, sur AWS aux États-Unis. SOC 2 Type 2 (juil. 2025). | PROUVÉ, security |
| Entraînement | Granola entraîne ses modèles sur des données anonymisées, **activé par défaut** sur les offres d'entrée (désactivable), désactivé par défaut en Enterprise. | PROUVÉ, security |
| Locuteurs | « Me / Them » par défaut (deux flux séparés, micro nettoyé par AEC3, §9.2). Les vrais noms passent par la **lecture de l'interface de visio** : extension Chrome pour Meet, permission Accessibilité pour Zoom sur Mac, et Teams. Sinon, l'IA « déduit souvent les noms du contexte », et on corrige à la main. Pas de diarisation par empreinte vocale annoncée sur ordinateur, mais une version d'essai est présente dans l'app (§9.4). Le mobile sait séparer les voix en présentiel. | PROUVÉ, transcription.md + speaker-attribution (voir 02-veille) |
| Langues | **31 langues sur ordinateur, dont le français**, 17 sur mobile (32 annoncées en sept. 2026). Mode « Multi-language » pour les réunions mixtes. Langue du résumé : English ou **Auto** (langue majoritaire). **L'interface est en anglais uniquement.** Un « jargon » personnel ou d'équipe améliore la reconnaissance. | PROUVÉ, https://docs.granola.ai/help-center/customising-granola/multi-language.md |
| Fiabilité | Erreurs de chiffres et de codes (« 312 000 $ » devenu « 312,1 M$ ») et confusions de noms. Précision estimée à 85–90 % par un concurrent. | OBSERVÉ (source intéressée), HappyScribe |
| Stockage local | Le cache `cache-v3.json`, d'abord lisible, a été chiffré en mai 2026, puis sa clé a été verrouillée dans le Trousseau en juillet 2026. Les outils communautaires ont cessé de fonctionner, l'API est devenue payante et la colère a été publique (excuses du CEO). | OBSERVÉ (source concurrente), https://www.getvoibe.com/resources/granola-encrypted-notes/ |
| Consommation | Pas de chiffre publié. Sans doute faible, puisque tout se passe dans le cloud. | SUPPOSÉ |

---

## 4. Design / interface

- **Identité** (refonte de févr. 2026, studio Ragged Edge) : Granola a gardé son **vert** et en a fait un vrai système de couleurs. Typographies : **Quadrant** (serif à empattements carrés, un peu mécanique) pour les titres, **Melange** (neutre, avec une pointe de caractère) pour l'interface. Le logo est dessiné à la main, « volontairement imparfait », avec une écriture tirée de celle du cofondateur. Le ton se résume en « calme, mais avec de l'énergie dessous » et la devise est « progress over process ». PROUVÉ, https://www.granola.ai/blog/a-new-look-for-granola ; https://www.creativeboom.com/news/ragged-edge-rebrands-ai-notepad-granola-with-a-co-founders-handwriting-and-a-deliberately-imperfect-logo/
- **Accueil** : réunions à venir en haut, notes passées classées par jour, barre « Ask Granola » flottante. OBSERVÉ, HappyScribe + Wonder Tools.
- **Note** : un **document plein écran** à la façon d'Apple Notes : titre, participants et date en en-tête, puis du texte libre. Une **barre flottante en bas** réunit l'indicateur d'enregistrement (barres vertes qui dansent), le bouton transcription et le champ « Ask anything ». Le sélecteur de gabarit (✨) est en haut à droite. La note a deux vues, **mes notes** et **Enhanced**. PROUVÉ/OBSERVÉ, docs.
- **Panneau de transcription** : il glisse sur le côté. Les bulles façon messagerie sont grises à gauche (eux) et vertes à droite (moi). On peut copier, supprimer un passage ou chercher. PROUVÉ, transcription.md
- **Note enrichie** : **deux niveaux de gris**, le noir pour l'humain et le gris pour l'IA. C'est le cœur de la confiance : on voit d'un coup d'œil ce qu'on a vraiment noté. On trouve des titres de section, des puces courtes, et une loupe au survol pour remonter à la source. PROUVÉ
- **Animation de génération** : rien d'officiel. Les témoignages parlent de notes qui apparaissent en quelques secondes. SUPPOSÉ : un affichage progressif.
- **Notifications** maison discrètes (coin supérieur droit, barre de couleur pleine ou en pointillés) au lieu des notifications macOS. PROUVÉ
- **Ce qui rend l'outil agréable** : rien ne bouge pendant la réunion (pas d'IA qui écrit en direct), on retrouve la sensation d'un carnet, il y a peu de boutons, et le résultat se modifie comme un document au lieu d'un rapport figé. OBSERVÉ (CEO + revues)

---

## 5. Ce que les utilisateurs adorent et critiquent

**Adorent** (OBSERVÉ : Zapier, Wonder Tools, HN https://news.ycombinator.com/item?id=43023464, HappyScribe) :
- Pas de bot, donc pas de malaise dans l'appel.
- **Leurs notes guident l'IA**, et on distingue leurs notes de celles de l'IA.
- Le résultat est immédiat et se modifie comme un document.
- On peut chatter sur des semaines de réunions (« second cerveau ») et lancer des recipes prêtes à l'emploi.
- L'interface est soignée et la même sur tous les appareils.
- Le prix est simple, sans quota de minutes.

**Critiquent** :
- **Consentement** : une action collective (*Chamberlain v. Granola*, 30/07/2026, Californie) reproche des enregistrements non signalés et un entraînement par défaut. Le message automatique dans le chat et le filigrane vidéo existent mais sont désactivés par défaut. OBSERVÉ, https://www.computerworld.com/article/4206255/granola-lawsuit-raises-concerns-over-ai-note-taking-app-privacy.html ; https://btlaw.com/en/insights/alerts/2026/what-the-granola-class-action-means-for-companies-building-and-deploying-conversation-capture-tools
- **Pas de réécoute** possible pour vérifier un chiffre, et **pas d'import** de fichier audio.
- Erreurs sur les chiffres et les noms ; « Me / Them » seulement hors Meet, Zoom et Teams.
- **Tout passe par le cloud** (gênant pour les données réglementées), et l'accès complet au calendrier est exigé.
- L'offre gratuite limite l'historique à 30 jours. Le chiffrement du cache et l'API payante ont fermé les données.
- Démarrage et arrêt parfois manqués, appels enchaînés fusionnés.
- Interface uniquement en anglais.

**Prix** (OBSERVÉ, plusieurs sources concordantes, sept. 2026) : **Basic 0 $** (réunions illimitées, 30 jours d'historique ; certaines sources parlent de 25 réunions à vie), **Business 14 $/utilisateur/mois** (intégrations, historique complet, API, choix du modèle), **Enterprise 35 $/utilisateur/mois** (SSO, contrôles, HIPAA). https://justinmckelvey.com/blog/granola-pricing ; https://www.granola.ai/blog/granola-pricing-teams-per-user-enterprise

**Alternatives citées** : Otter, Fireflies, tl;dv, Read.ai et Fathom (avec bot) ; Jamie ; Notion AI Meeting Notes ; Wispr ; open source et local : Hyprnote/Char, Meetily, OpenGranola (https://news.ycombinator.com/item?id=47425646).

---

## 6. Chronologie (PROUVÉ, https://www.granola.ai/updates)

| Date | Annonce |
|---|---|
| oct. 2024 | Gabarits améliorés (suggestion automatique) |
| janv. 2025 | Ask Granola pendant la réunion |
| févr. 2025 | Partage vers Notion |
| mars 2025 | Consulter d'autres notes en réunion ; chat sur les personnes et entreprises |
| avr. 2025 | iOS |
| mai 2025 | Chat sur toutes les réunions (8/05) ; **Granola 2.0** (14/05) : dossiers d'équipe, chat avec citations, choix du modèle, Slack auto, levée de 43 M$ ; 10 langues (22/05) |
| juin 2025 | Import de fichiers ; Windows |
| juil. 2025 | SOC 2 ; Team Folders ; modifier la note par le chat ; Zapier |
| sept. 2025 | Vues Personnes / Entreprises, Attio ; appels téléphoniques ; Shared with me ; **Recipes dans le nouveau chat** |
| déc. 2025 | « Granola Crunched » (bilan de l'année) ; @mentions, corbeille, temps restant dans la réunion |
| janv. 2026 | Supprimer un passage de la transcription ; connexion Microsoft |
| févr. 2026 | **MCP** ; nouvelle identité |
| mars–juil. 2026 | Changement de format du cache, API personnelle payante, cache chiffré (polémique) |
| avr. 2026 | **Chat refait en agent** (citations, nouvelles recipes) |
| mai 2026 | **Briefs** (préparation des réunions) |
| juil. 2026 | Android ; Apple Watch ; action collective |
| sept. 2026 | 32 langues |

---

## 7. Comparaison avec CBW AI

État de CBW AI d'après `docs/APP_API.md`, `plan.md`, `03-audit-terrain.md` et `design/app/notes.js` :
- **Pendant la réunion** : un écran plein (minuteur, onde, Pause / Terminer / Annuler) et un champ **« Repère »** qui horodate des notes tapées. Ces repères partent vers l'organisation comme « priorité de structure » (`src/main/notes.ts:440`).
- **Après** : une note Markdown à sections fixes, découpée en onglets : Résumé, Par personne, Décisions & actions, Transcription, Chronologie.
- **Le reste** : renommer un locuteur, réorganiser, rechercher, copier, afficher dans le Finder. Le Calendrier sert seulement à importer des noms dans le dictionnaire.

| Granola fait | CBW AI fait | À reprendre | Effort |
|---|---|---|---|
| Pas de bot, micro + son système | **Oui** (deux sources, permission audio système) | — | — |
| Me / Them par piste | Partiel : « Moi » si deux pistes, sinon diarisation et erreurs (14 voix pour 3) | Phase 1 du plan : micro toujours = Moi, ne trier que la piste du Mac | S (prévu) |
| Noms via l'interface de visio | Non | Lire la liste des participants Zoom / Meet / Teams par Accessibilité (phase 2, point 9) | M |
| Bloc-notes libre, **notes de l'utilisateur augmentées** | Embryon : « Repères » sur une ligne, horodatés, transmis comme structure | **Remplacer le champ Repère par un vrai bloc-notes** (titres `#`, puces, cases) ; prompt « tes notes = squelette prioritaire, à compléter » | M |
| Noir = toi, gris = IA | Non (tout le compte rendu a la même couleur) | Garder les lignes de l'utilisateur et les rendre en noir, le reste en gris (`--n-sec`) | M (prompt + marquage + rendu) |
| Loupe vers la source | Partiel : chronologie horodatée, transcription consultable | Lien `[mm:ss]` sur chaque point vers la ligne de transcription (+ extrait audio si gardé) | S–M |
| Notification « réunion qui commence » (calendrier, 1 min avant) | Non | EventKit en local (lecture seule, sur autorisation) : notification maison 1 min avant, « Prendre des notes » | M |
| Détection d'appel (micro utilisé par Zoom / Meet / Teams / FaceTime) | Non | Surveiller l'usage du micro par une app de visio → pastille « Appel détecté · Prendre des notes » | M |
| Arrêt automatique (fin d'appel, 15 min de silence, veille) | Non (arrêt manuel, Control gauche) | Arrêt quand l'app de visio libère le micro, ou après X min de silence (avec un compte à rebours annulable) | S–M |
| Note prête en quelques secondes | ~4 min 30 s mesurées (3 min 15 s de re-transcription) | Phase 1 : supprimer la re-transcription, une seule passe IA en streaming | S (prévu) |
| Gabarits (Auto + 1:1, stand-up, client, recrutement…) | Un seul format v2 très exhaustif | 5–6 gabarits FR + « Auto » (choix selon titre, participants, contenu), plus un gabarit perso (sections + consigne) | M |
| Régénérer / changer de gabarit / « rends ça plus court » | « Réorganiser » seulement | Menu gabarit + champ de consigne libre | S |
| Ask (une note, plusieurs, pendant la réunion) | Non | Chat sur une note (contexte = transcription), puis sur plusieurs (recherche plein texte, puis IA) | M–L |
| Recipes (`/`) : e-mail de suivi, actions, coaching | Non | 6 recettes FR intégrées (« E-mail de suivi », « Mes actions », « Points en suspens »…) | S |
| Briefs avant réunion | Non | Plus tard : rappel des notes passées avec les mêmes participants | L |
| Dossiers, Personnes, Entreprises | Liste par jour + recherche | Vue Personnes (à partir des noms renommés) | M |
| Partage par lien, Slack, Notion, CRM, MCP | Copier le Markdown, fichier `.md` dans Documents | Rester local : Copier / Exporter / « Envoyer vers Notes, Mail ». Un MCP local en lecture serait un vrai plus pour PME/ETI. | S (export) / M (MCP) |
| Transcription cloud, pas d'audio conservé | **Local** (whisper), audio supprimé par défaut, option « garder l'audio » | **Avantage CBW** : réécoute possible (ce que Granola n'a pas) et confidentialité | — |
| Consentement : message / filigrane désactivés par défaut | Rien | Dès la première réunion, un rappel « Préviens les participants » + une phrase à copier dans le chat | S |
| Interface en anglais | Interface **en français** | Avantage CBW | — |
| Payant au-delà de 30 jours | Gratuit, historique illimité, fichiers Markdown ouverts | Avantage CBW : ne jamais chiffrer ou enfermer les notes | — |

Effort : S < 1 jour · M 1–3 jours · L > 1 semaine (SUPPOSÉ, ordre de grandeur).

---

## 8. Proposition : la réunion « à la Granola » pour CBW AI (locale, gratuite, en français)

**Promesse** : « Tu prends trois notes, CBW AI écrit le reste. Tout reste sur ton Mac. »

1. **Avant** (lecture locale du Calendrier via EventKit, après une autorisation explicite) :
   - Une minute avant une réunion qui a au moins deux participants, une **pastille CBW** propose « Réunion avec Léa, Marc · Prendre des notes ».
   - Hors agenda, quand Zoom, Meet, Teams ou FaceTime prend le micro, la pastille affiche « Appel détecté ».
   - Un clic ouvre la note **déjà titrée**, avec les **participants pré-remplis**. Ces noms servent aussi au vocabulaire whisper et aux noms des voix.
2. **Pendant** :
   - L'écran est une **page blanche façon carnet**. Le minuteur et une petite onde se déplacent en bas, dans une barre discrète avec Pause, Terminer et « Transcription ».
   - On tape librement (`#`, `-`, `[]`). Chaque ligne est horodatée en silence, ce qui prolonge les Repères actuels.
   - La transcription en direct reste **masquée par défaut** (leçon Granola : l'IA qui écrit distrait). Un panneau latéral la montre au besoin, avec les bulles Moi à droite et Eux à gauche.
   - Le rappel de consentement apparaît une fois, avec une phrase prête à coller dans le chat de la visio.
3. **Fin** :
   - Arrêt quand l'app de visio libère le micro, ou au bout de 10 min de silence, avec un compte à rebours annulable. Control gauche reste disponible.
   - La transcription est disponible tout de suite. L'enrichissement **s'affiche pendant qu'il s'écrit**. Objectif : moins de 60 s pour 30 min de réunion (plan, phase 1).
4. **Note enrichie** :
   - Tes lignes, en **noir**, gardent leur place et servent de squelette. Les compléments de l'IA, en **gris**, se placent sous chacune.
   - Chaque point porte un `mm:ss` cliquable qui ouvre la transcription au bon endroit (et l'extrait audio si l'option est active).
   - Les onglets actuels restent dessous : Décisions & actions, Par personne, Transcription.
5. **Gabarits FR** : Auto (par défaut), Point 1:1, Point d'équipe / stand-up, Rendez-vous client, Entretien de recrutement, Atelier / brainstorming, et Exhaustif (l'actuel v2). Un bouton permet de changer de gabarit et de régénérer, et un champ « Consigne » accepte par exemple « plus court », « en anglais » ou « ajoute les échéances ».
6. **Recettes** (`/` dans un champ « Demander à la note ») : E-mail de suivi, Mes actions, Ce qui reste ouvert, Résumé pour Slack, Questions pour la prochaine fois. Elles tournent avec le moteur IA déjà en place (router hedgé) ; Ollama ne sert qu'en ultime recours.
7. **Ce que CBW AI garde contre Granola** : tout en local et gratuit, audio réécoutable sur option, notes en `.md` ouvertes (jamais chiffrées pour enfermer), interface et compte rendu en français, et identification des voix en présentiel (que Granola n'offre que sur mobile).

**Ordre conseillé** (après la phase 1 du plan, qui reste prioritaire, car la vitesse et Moi/Eux sont des prérequis) :
1. Bloc-notes, noir / gris et `mm:ss` cliquables : c'est le cœur Granola (environ 3 jours).
2. Gabarits, consigne et recettes (environ 2 jours).
3. Calendrier, détection d'appel et arrêt automatique (environ 3 jours).
4. Chat sur une note, puis sur plusieurs (environ 1 semaine).

---

## 9. Analyse du bundle installé (Granola 7.645.2, lecture seule, app non lancée)

Méthode : `Info.plist`, `npx @electron/asar extract` de `Contents/Resources/app.asar` (dans le scratchpad), lecture du JS et du CSS minifiés, puis `strings` ciblé sur les binaires natifs. Aucun secret ni jeton n'est reproduit ici. Chemins relatifs à `/Applications/Granola.app/Contents/` ; `asar:` désigne le contenu extrait. Tout est **PROUVÉ** pour cette version (le code ne dit pas ce qui est activé côté serveur : plusieurs fonctions sont derrière des drapeaux).

### 9.1 Architecture et autorisations
- **Electron**. Le code principal est découpé en **processus utilitaires** : `audio_process`, `local_asr_process`, `local_diarization_process`, `mic_monitor_v2_process`, `accessibility_process`, `eventkit_process`, `tcc_process`, `sqlite_process`, `dictation_utils_process`, `third_party_meeting_automation_process`, `network_doctor_process` (`asar:dist-electron/*`). Une panne audio ou ASR ne fait donc pas tomber l'interface.
- **Info.plist** déclare les autorisations suivantes : micro (« transcribes your microphone »), `NSAudioCaptureUsageDescription` (son système), enregistrement d'écran (« uses screen capture to transcribe system audio », en solution de repli), Calendriers (« show upcoming meetings »), **caméra** (« watermark in meetings »), une extension système de **webcam virtuelle** (filigrane de consentement, `Helpers/GranolaMacWebcam.app`, `Library/SystemExtensions/`), Contacts (pour composer un numéro), Bluetooth. Schéma d'URL `granola://`. macOS 13 minimum.
- **Modules natifs** (`Resources/native/`) : `macos_audio_capture.node`, `macos_mic_apps_with_devices.node`, `ax_meeting_detector.node`, `eventkit.node`, `third_party_meeting_automation.node` + `libThirdPartyMeetingAutomationBridge.dylib` (10 Mo), `pause-currently-playing-media`, `clamshell_state.node`, `sleep.node`, `haptics.node`, `docktile.node`, `keychain.node`, `dictation_utils.node`, `tcc.node`. On trouve aussi `Resources/keyspy/MacKeyServer` (écoute globale du clavier, pour la dictée) et `Resources/native-host/meet-consent-host` (hôte natif de l'extension Chrome pour Meet).
- **Stockage local** : `better-sqlite3-multiple-ciphers` (SQLite **chiffré**, `app.asar.unpacked/node_modules/`). C'est cohérent avec la fermeture du cache décrite au §3.

### 9.2 Capture audio et Moi / Eux
- **Son système** : un **Core Audio process tap** branché sur un *aggregate device* (événements `audio-capture-system-creating-tap`, `added-taps-to-aggregate-device`), avec repli sur `SCStream` (ScreenCaptureKit) (`strings Resources/native/macos_audio_capture.node`).
- **Annulation d'écho WebRTC AEC3**, embarquée dans ce module (`webrtc_AEC3/audio_processing/aec3/echo_canceller3.cc`, `aec_sample_rate`, `aecEnergyPreMicAbsSum`/`PostMic`/`Ref`). Le micro est nettoyé en prenant **le son système comme référence**. Il existe une option `disableEchoCancellationOnHeadphones` (pas d'AEC au casque) et un **gain automatique** (`enableAutomaticGainCompensation`, `asar:dist-electron/main/index.js`).
- **Deux flux distincts** côté interface : les jetons `--color-background-chat-mic` (vert) et `--color-background-chat-sys` (blanc translucide) (`asar:dist-app/assets/*.css`). La doc qui parle d'un audio « combiné » (§1) simplifie donc les choses : en pratique, micro et système restent séparés, ce qui donne Moi et Eux.
- **Détection d'appel** : `MicActivityTrackerV2` suit les sessions micro **par processus** (`session_active`/`session_inactive`, avec `processName`) (`asar:dist-electron/mic_monitor_v2_process/index.js`). Cela sert à la notification « Meeting detected » et à repérer la fin de l'appel.
- **Lecture des visios par Accessibilité** : `AXMeetingDetector.readMeeting` reconnaît Zoom (« Zoom Meeting », « Zoom Workplace »), Teams (`com.microsoft.teams2`, `teams.microsoft.com`) et Meet dans le navigateur (`strings native/ax_meeting_detector.node`). Une extension de navigateur remonte `browser-extension:meeting-ended` pour Meet.
- **Pause des médias** au démarrage (`native/pause-currently-playing-media`), comme notre `audio.pauseMedia`. Quatre sons : `desktop-start-a.wav`, `desktop-start-b.wav`, `desktop-pause.wav`, `desktop-resume.wav` (`asar:dist-app/sounds/`).

### 9.3 Transcription
- **Cloud par défaut** :
  - **Deepgram** `wss://api.deepgram.com/v1/listen`, modèles `nova-3` / `nova-3-mega`, `interim_results`, `smart_format`, `channels:1`, **`keyterms`** (vocabulaire), `mip_opt_out` (refus du programme d'amélioration des modèles), `endpointing:100` en mode `multi`.
  - **AssemblyAI** `wss://streaming{.us,.eu}.assemblyai.com/v3/ws`, modèles `universal-streaming-english`/`-multilingual`, `universal-3-5-pro`, `universal-3-6-pro`, avec des réglages de fin de tour (`end_of_turn_confidence_threshold:.8`, `min_end_of_turn_silence_when_confident:800`, `max_turn_silence:2400` ou `3600`).
  - Proxy maison `wss://transcription.granola.club` / `ws.api.granola.ai`.
  - Tout cela est piloté par des drapeaux serveur (`transcription_fallback_supported_languages` : le **français** figure dans `nova-3`, `nova-3-mega` et `universal-3-5-pro`) (`asar:dist-electron/main/index.js`).
- **Transcription locale, présente mais en anglais seulement** : réglage `localTranscription`. Deux moteurs :
  - **Parakeet TDT 110M int8** avec *hotwords*, via sherpa-onnx (`nemo-parakeet_tdt_transducer_110m-en-36000-int8`) ;
  - **whisper-server v1.9.1 Metal** + `ggml-small.en-q5_1.bin` (190 Mo), nommé `whisper-small-en-q5-keyterms`.
  Les modèles sont téléchargés à la demande et vérifiés par SHA-256 (`asar:dist-electron/main/local-asr-protocol-*.js`).
- **Découpage local** (`asar:dist-electron/local_asr_process/index.js`) : VAD ONNX par pas de 512 échantillons à 16 kHz (32 ms). Une **pré-marge de 8 pas (≈ 256 ms)** est ajoutée avant chaque segment. Un segment se **ferme après 25 pas de silence (≈ 800 ms)** et est **plafonné à 25 s**. Il faut au moins 6 pas de parole. Des **résultats partiels** sont calculés environ chaque seconde (31 pas), avec un **préfixe stable** : seuls les mots identiques d'une passe à l'autre sont validés. Avec un vocabulaire, Whisper est lancé **deux fois en parallèle, avec et sans `prompt`**, puis les deux sorties sont fusionnées (protection contre les hallucinations dues au prompt). Réglages : `temperature 0.0`, `--suppress-nst`.

### 9.4 Diarisation et empreintes vocales (en test, derrière un drapeau)
- `Resources/granola-diarizer` (Mach-O arm64, 7 Mo) est construit sur **FluidAudio** (`_TtC10FluidAudio…`, `OfflineDiarizerManager`, `SortformerDiarizer`, `LSEENDDiarizer`, `pyannote_segmentation.mlmodelc`, `fluidaudio-0.14-community1-wespeakerv2`). C'est **exactement la brique prévue en phase 2 de notre plan**.
- En JS (`asar:dist-electron/local_diarization_process/index.js`) : pipeline **pyannote Community-1** (segmentation *powerset* à 7 classes pour 3 locuteurs par fenêtre de 10 s, embeddings, **PLDA + VBx**), avec un appariement des locuteurs d'une fenêtre à l'autre (diarisation en continu), un gain automatique (jusqu'à ×8, calé sur le 95ᵉ centile du niveau), un centroïde « empreinte » par locuteur et une fusion des tours proches (`marginCosine .05`, `maxGapMs 800`).
- **Profil vocal de l'utilisateur** (`voice-fingerprint-*`, `asar:dist-electron/main/index.js`) : *enrôlement* automatique de la voix **dominante sur le micro** (`dual-enrollment`), *classification en présentiel* (`in-person-classification`), *deuxième passe* et réétiquetage (`relabel-completed`). Le message d'erreur parle d'un « POC flag ». Autrement dit, Granola travaille à identifier « Moi » par la voix quand tout le monde parle dans le même micro, **le problème exact de notre audit terrain (3 personnes → 14)**.

### 9.5 IA, compte rendu et dictée
- **La génération est côté serveur**. Les prompts d'enhance ne sont **pas** dans l'app. Points d'accès : `stream.api.granola.ai/v1/generate-summary`, `trigger-summary-generation`, `llm-proxy-stream`, `pre-meeting-brief`, `rewrite-follow-up-email-stream`, `regenerate-action-items-preview-stream`, `mcp-server`, `granny-agent` (`asar:dist-electron/main/index.js`). La télémétrie mentionne OpenAI et Anthropic.
- **États affichés pendant la génération** (`asar:dist-app/assets/primary-*.js`) : « **Enhancing notes** » si l'utilisateur a tapé plus de 20 caractères, sinon « **Writing notes** », puis « Analyzing transcript (and images) ». Les lignes générées s'affichent au fil de l'eau (`generated_lines`). Pour un fichier importé, les étapes sont Waiting → Uploading → Transcribing → Generating notes → Ready.
- **Granola fait aussi de la dictée**, comme CBW AI : `dictation_utils.node`, `keyspy/MacKeyServer` et un prompt client « *voice transcription formatter, not a chatbot* » (`asar:dist-app/assets/primary-*.js`). Ses règles : résoudre les autocorrections (« lundi, enfin mardi » → « mardi »), retirer les hésitations, interpréter la ponctuation dictée, ne jamais exécuter une demande dictée, ne jamais traduire, **ne pas utiliser de tiret cadratin**. C'est très proche de notre `prompt.ts` ; Granola devient donc un **concurrent direct sur la dictée** aussi.
- **Réglages par défaut** (schéma des préférences, `asar:dist-electron/main/index.js`) :
  - `defaultSharingLinkVisibility: 'public'` confirme la critique « public par défaut » ;
  - `chatPasteEnabled: false` / `chatPasteMessage: ''` : le message de consentement est **désactivé** par défaut ;
  - `autoPositioningOnMeetingJoin: true` ;
  - `userDictionary` (vocabulaire perso), `transcriptionLanguage` / `summaryLanguage` ∈ `en` / `multi`.

### 9.6 Design (jetons CSS, `asar:dist-app/assets/*.css`)
- **Typographies** :
  - `--font-display` : **« Quadrant Notepad »** (repli IBM Plex Serif) ;
  - `--font-body`/`--font-sans` : **« KMR Melange Grotesk »** (repli Inter), avec une graisse « book » à 430 ;
  - `--font-mono` : JetBrains Mono.
  - Éditeur en **16 px** (`--text-editor`), 15 px en petit ; interface en 14 px / 18 px.
- **Palette « oats »** :
  - neutres chauds légèrement jaunis : `#fcfcf8` (fond), `#f7f7f2`, `#eaebe5`, `#d5d5d2`, `#acada8`, `#818179`, `#4e4d4b`, `#212121`, `#1e1e1e` (sombre) ;
  - verts olive : `#f2f6e1`, `#e5eacd`, `#d1e043`, `#b2c248`, `#788c15`, **`#5b6f00`** (accent), `#434625` ;
  - **`#74bd00`** pour les barres d'enregistrement (« dancing bars ») ;
  - bordures en noir olive translucide (`#625a220f`, `#56512e1f`) plutôt qu'en gris pur.
- **Mouvement** : transitions de 150 ms en `cubic-bezier(.4,0,.2,1)`, `--ease-out-expo` `(.16,1,.3,1)`, `fade-in` de 0,3 s avec translateY de 10 px. Pendant la génération : un **texte « shimmer »** (dégradé qui balaie le texte en 5 s) et une **vague de lettres** (`chromaGeneratingLetterWave`). On trouve aussi un tracé animé du logo (`logoStrokeLoop`, 3,2 s) et `gradient-text-slide` (0,9 s).
- Mention en bas de note : « Granola uses AI and can make mistakes. »

### 9.7 Ce que cela change pour CBW AI
1. **FluidAudio est validé par Granola** : diarisation hors ligne et Sortformer en Core ML. Notre phase 2 (point 7) est le bon choix. Il faut aussi viser l'**empreinte de la voix de l'utilisateur**, apprise sur le micro quand il est seul, pour reconnaître « Moi » en présentiel (`voice-fingerprint`).
2. **AEC3 avec le son du Mac comme référence**, désactivée au casque. C'est la pièce qui manque pour séparer proprement Moi et Eux sur haut-parleurs (02-veille la signalait déjà).
3. **Paramètres de découpage à copier** dans la phase 1, point 4 : 256 ms de marge avant, fin de segment après 800 ms de silence, 25 s maximum, partiels à préfixe stable, et double décodage avec et sans prompt de vocabulaire (contre les boucles et hallucinations de `looksLooping`).
4. **Notre avantage reste réel** : chez Granola, le local est **anglais seulement** et le compte rendu reste dans le cloud. CBW AI est local **en français** de bout en bout.
5. **Jetons de design** : Granola utilise des neutres chauds légèrement jaunis, un seul accent olive, un serif pour les titres et une grotesque pour le texte. **Ne pas copier ces jetons** (identité CBW Studio) ; en retenir la retenue et l'animation « shimmer » sur le libellé « Écriture de la note… ».
