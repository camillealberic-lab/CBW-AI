# Wispr Flow Notetaker : organisation réelle de l'écran (analyse statique de l'app)

Source : `/Applications/Wispr Flow.app` v1.6.1147, `app.asar` extrait dans le scratchpad (lecture seule). L'app n'a pas été lancée et aucune donnée utilisateur n'a été lue.
Méthode : chaînes de traduction anglaises (dans le bundle `hub`) et françaises officielles (chunk de traduction FR), puis ordre des éléments dans le JSX compilé et CSS modules.
Ce document décrit la structure. Il ne reprend ni code, ni icône, ni marque. Les libellés FR cités sont ceux de la traduction officielle de Wispr, donnés comme référence (« Notetaker » n'y est pas traduit).
Statut : tout ce qui suit est **lu dans le code**, sauf mention « supposé ».

---

## 1. Navigation

- **Barre latérale**, dans l'ordre du code : Accueil · (Ma voix) · **Notetaker** · Analyses · Dictionnaire · Extraits · Style · Transforms · Scratchpad · Mes tâches · Extensions. Ensuite : Parrainer, Équipe, Raccourcis, Paramètres, Aide. Notetaker est donc la 2e entrée utile, juste après Accueil. CBW fait déjà pareil : Notes en n° 02.
- **Pas de sous-pages dans la barre latérale.** Tout se passe dans la page Notetaker, sur 2 niveaux :
  - **L1** : la liste, avec un panneau d'aperçu à droite ;
  - **L2** : la note ouverte, qui **remplace** la liste dans la même page. Retour via « Back », flèches précédente/suivante.
- **Carte « réunion en cours » dans la barre latérale : absente du code** (la veille l'annonçait). L'indicateur « en direct » est ailleurs :
  - dans la **ligne** de la réunion (liste À venir ou liste des notes), une **pastille onde animée + chrono** (`Open live meeting note` / « Ouvrir la note de réunion en direct »). Un clic ramène la fenêtre de note au premier plan ;
  - dans la pastille de dictée (Flow Bar), qui devient « Listening / Écoute en cours », puis « Wrapping up… / Finalisation… ». Info-bulle : « Stop Notetaker / Arrêter Notetaker ».
- **Fenêtre séparée** pendant l'appel : le bloc-notes s'ouvre dans sa propre fenêtre (défaut 500 × 700, minimum 500 × 500). Dans la L2, le bouton « Open note in window » l'ouvre aussi.

## 2. Page liste (L1)

### En-tête (une rangée)
- À gauche : **h1 « Notetaker »**.
- À droite, dans l'ordre : bouton réglages (engrenage) · « Start tutorial » (seulement en découverte) · loupe de recherche (si la recherche globale est active) · **bouton « New note / Nouvelle note »** (secondaire, petit, raccourci ⌘N).
  - Variante test A/B : « Start Notetaker / Démarrer Notetaker ».
  - Quand la limite hebdo est atteinte, le bouton est désactivé et une info-bulle donne la date de réinitialisation.

### Corps, de haut en bas
1. Bandeaux éventuels : limite hebdo, import Granola/Otter, calendrier à connecter, rétention.
2. **Barre « Ask »** sur toutes les réunions. Elle n'apparaît qu'après une première vraie réunion.
   - Placeholder : « Ask Wispr anything about your meetings / Posez toutes vos questions à Wispr sur vos réunions ».
   - Suggestions : « Coach me », « List recent todos », « Write a weekly recap ».
   - Elle flotte en bas quand on fait défiler.
3. Héros de découverte : uniquement quand il n'y a encore aucune note.
4. **Bloc « À venir »** : un cadre arrondi, fond teinté. Il contient :
   - un surtitre **« TODAY / Aujourd'hui »**, avec à droite un bouton de synchro du calendrier ;
   - les événements de l'agenda : **3 visibles**, puis « Show {{count}} more / Afficher {{count}} de plus » et « Show less / Afficher moins » ;
   - un surtitre par jour : Aujourd'hui, Demain, puis le jour de la semaine en long ;
   - une **barre de couleur** à gauche (couleur de l'agenda) ;
   - en cas de chevauchement, une barre de conflit commune et la puce « Conflict / Conflit » ;
   - les puces « Declined / Refusé » et « Maybe / Peut-être ».
   - Ligne À venir, de gauche à droite :
     - barre couleur ;
     - pile d'avatars des invités ;
     - **titre**, en gras si la réunion est en cours ;
     - sous-ligne : puces éventuelles + **plage horaire** ;
     - à droite, un compte à rebours (« In 5 min / Dans 5 min », « Now / Maintenant ») ;
     - au survol ou à la sélection, un **bouton double** : « Join meeting & start Notetaker » / « Start », plus un menu (Rejoindre seulement, Ouvrir sans rejoindre). S'il n'y a pas de lien visio, il ne reste que « Start » ;
     - pendant l'enregistrement : la pastille en direct + chrono.
   - États vides :
     - aucune réunion aujourd'hui : « No meetings today / Aucune réunion aujourd'hui » ;
     - journée finie : bannière « Done for today / Terminé pour aujourd'hui » + stats (« • 3 réunions », « • 1 h 20 sur 3 réunions ») ;
     - agenda non connecté : « No meetings found / Aucune réunion trouvée » + « Connect calendar / Connecter le calendrier ».
5. **Onglets des notes** (soulignés), avec à droite la recherche du bloc. Onglets :
   - « Past notes / Notes précédentes » ;
   - « Shared with me / Partagés avec moi » ;
   - « Folders / Dossiers » (si activé).
   Recherche : « Search past notes / Rechercher dans les notes ». Recherche avancée : filtres Date (N'importe quand, Aujourd'hui, 7 derniers jours, 30 derniers jours), Participant, Dossier, Source (Toutes, Les miennes, Partagées).
6. **Liste des notes passées**, groupée par jour :
   - surtitre en capitales, petit et gris : `TODAY, OCT 15`, `YESTERDAY, OCT 14`, `TUE, OCT 13`. Le premier groupe met son surtitre dans l'en-tête de section ;
   - **ligne d'une note**, de gauche à droite :
     - pile d'avatars des participants (ou logo d'import) ;
     - **titre** (sinon « Untitled ») ;
     - sous-ligne : **heure seule** (ex. « 10:30 AM »), puis, selon le cas, un statut de traitement qui défile (« Transcribing audio… », « Generating summary… »), « Failed. » + « Retry », ou « Generate summary » ;
     - à droite : dossier, compteur de tâches « (2/5) », menu « … » visible au survol.
   - **Pas de durée et pas de nombre de participants** dans la ligne. La clé « {{count}} people » existe, mais elle ne sert qu'aux salles/groupes de voix.
   - Menu « … » d'une ligne, dans l'ordre : **Copy as Markdown / Copier au format Markdown** · Audio settings · Copy link · Share · Report / Signaler · **Delete / Supprimer**.
   - Confirmation de suppression : « Delete meeting? / Supprimer la réunion ? » + « This will permanently delete the note and transcript… ».
   - Chargement : 3 lignes squelette.
   - Recherche sans résultat : « No notes found for "{{query}}" / Aucune note trouvée pour "{{query}}" ».
7. **Panneau d'aperçu à droite** (fixe, 280 px, fond légèrement plus clair, filet gauche). Il suit le survol ou la sélection :
   - badge « Up Next / À venir » sur la prochaine réunion ;
   - **titre** ;
   - ligne d'horaire « Aujourd'hui • 10:00–10:30 • Dans 5 min » ; pour une note passée : jour • heure • **durée** ;
   - **« Attendees / Participants »** : 5 noms, puis « +N de plus » / « Afficher moins ». « (vous) » marque soi-même ;
   - pour une note passée : section **« Overview / Vue d'ensemble »**, qui reprend le début du résumé ou le statut de traitement ;
   - pour une réunion à venir : le « Brief », c'est-à-dire la préparation.
   - Clic ou Entrée sur une ligne : ouvre la L2. Pour la réunion en cours, la fenêtre de note passe au premier plan.

## 3. Page d'une note (L2 dans le hub, ou fenêtre de note)

### En-tête L2 (rangée du haut)
- À gauche : **Back**.
- À droite, dans l'ordre :
  - menu **« … » (More actions)** : Copy as Markdown, Report, Delete ;
  - **Share** (lien) + **Copy link** ;
  - **Previous note (J)** / **Next note (K)** ;
  - **Open note in window**.

### Zone titre
- **Titre modifiable** : très gros (32 px, gras), placeholder « New note / Nouvelle note ».
- Ligne sous le titre :
  - pastille **date** (« Today / Aujourd'hui », « Yesterday / Hier » ou la date) ;
  - **participants** (pile + popover « Participants ») ;
  - « Rooms / Salles » (groupes de voix d'une même salle) ;
  - dossier.

### Barre d'onglets
Juste sous le titre, soulignée sur toute la largeur. L'ordre est fixe dans le code :

| # | Onglet (EN / FR officiel) | Visible quand |
|---|---|---|
| 1 | My thoughts / Mes pensées | note à moi (pas une note partagée) |
| 2 | Transcript / Transcription | toujours (verrouillé avec info-bulle si le partage l'interdit). Pendant l'écoute, une petite onde animée précède le libellé. |
| 3 | Summary / Résumé | toujours. Petite étoile devant ; libellé qui scintille pendant la génération. |
| 4 | Tasks / Tâches « (2/5) » | après le résumé, s'il y a des tâches |
| 5 | Docs / Documents « (N) » | s'il y a des pièces générées |

**Onglet par défaut :**
- fenêtre de note (en direct) : **My thoughts**. À la fin de la réunion, bascule seule sur **Summary** si le résumé arrive et que l'utilisateur n'a pas choisi d'onglet ;
- L2 du hub (note passée) : **Summary** ;
- la notification « notes prêtes » ouvre aussi sur Summary ;
- le dernier onglet choisi est mémorisé, sauf Summary.

### Contenu des onglets
- **My thoughts** : éditeur libre.
  - Placeholder : « Write your notes here. We'll make a separate summary at the end. »
  - En tête, un bloc repliable « Brief » (préparation).
  - Quand le résumé est prêt : « Your summary is ready. Check it out → ».
  - Mention : « *My thoughts* won't be included when you share this note. »
- **Transcript** :
  - **rangée d'outils** en tête : icône + libellé + actions. Le libellé vaut :
    - pendant l'écoute : chrono `12:34` ;
    - après : « 3 speakers • 42 min » (« {{count}} intervenants ») ;
  - actions dans l'ordre :
    1. recherche (« Search transcript… », ⌘F ou /, compteur 2/7, flèches) ;
    2. traduire (bêta) ;
    3. **copier tout** (⌘C sans sélection) ;
    4. **« Assign speaker names / Attribuer des noms aux intervenants »**, qui devient « Rename » une fois les noms posés ;
  - corps : blocs par intervenant. Nom en tête, avec un petit chevron et un bouton **lecture de la voix** (« Play audio / Lire l'audio »), puis les phrases en bulles ;
  - au survol d'une phrase : Modifier / Supprimer / Signaler. Marque « Edited / Modifié », popover « Original transcript » + « Revert » ;
  - séparateurs : « Your device slept for… », « Offline for… » ;
  - bouton « Jump to bottom » ;
  - pendant l'écoute, les interlocuteurs s'appellent « You / Them » (« Eux »). Info-bulle : « We'll add speaker names after the meeting / Nous ajouterons les noms des intervenants après la réunion » ;
  - premier usage : « Welcome to Notetaker! » + « Try saying "Hi Notetaker" ».
- **Summary** :
  - rangée d'outils : icône + **« N min read / N min de lecture »** + recherche (« Search summary… ») + **copier** ;
  - corps éditable ;
  - états :
    - pendant la réunion : « Summaries appear when a meeting ends » + « No summary yet » ;
    - génération : écran d'étapes (voir § États) ;
    - trop court : « The meeting was too short to summarize. » ;
    - pas de son : « No transcript or audio available for a summary » ;
    - ≤ 5 min : « Not auto-generated » + bouton flottant **« Generate summary / Générer le résumé »** ;
    - après une reprise : « New recording since this summary. » + **« Update Summary / Mettre à jour le résumé »** ;
  - au premier résumé, un toast de célébration (« {{duration}} meeting compressed to a 2 min read »).
- **Tasks** : liste à cocher, avec « Add action item », « Mark all as completed », « View all in Tasks ».

### Barre du bas (flottante, centrée, coins très ronds)
De haut en bas :
1. Une ligne d'info au-dessus du champ :
   - en direct : « Always get consent when transcribing others. Learn more » ;
   - sur l'onglet My thoughts après la réunion : mention « non partagé ».
2. Un **tiroir** qui s'ouvre vers le haut. Il contient la **discussion** :
   - historique des conversations, « New chat », « Minimize » ;
   - état vide : « Ask anything about this meeting / Posez n'importe quelle question sur cette réunion ».
3. Des suggestions qui apparaissent au focus quand le champ est vide :
   - en direct : « What did I miss? » ;
   - sinon : « Write a follow-up email », « Suggest questions », « Identify blind spots », « Make notes longer », « Make me sound smart ».
4. La rangée principale, dans l'ordre :
   - **[bouton Enregistrer]** : Start / Stop / Resume / « Finishing up… » ;
   - **[champ « Ask anything / Posez n'importe quelle question »]**, avec la puce **« What did I miss? / Qu'est-ce que j'ai manqué ? »** en direct.
   - Le champ **répond et modifie** la note : « Updated meeting notes. ».

### États
- **Avant** : onglets vides ; bouton Start.
- **Enregistrement** :
  - onde sur l'onglet Transcript ;
  - bouton Stop (« Stop listening ») ;
  - chrono dans la rangée d'outils ;
  - « You're offline. Don't worry, we're still recording! » ;
  - « System audio turned off » + « Turn on ».
  - **Pas de pause.** On fait Stop puis Resume ; une reprise refusée propose « Record as new meeting ».
- **Traitement** :
  - superposition en **3 étapes**, avec un compteur « step {{n}} of {{total}} » : envoi de l'audio → transcription → résumé ;
  - titres variés (« Getting every word {{count}} speakers said », « Turning your 42-minute meeting into a two-minute read », « Finding the action items and decisions ») ;
  - réussite : « Your notes are ready » ;
  - erreurs :
    - « We hit a snag processing your meeting » + Retry ;
    - « We couldn't process your meeting » ;
    - « Waiting for a connection » ;
    - « Servers are busy. Flow will retry at {{time}}. ».
  - Dans la liste, les mêmes étapes défilent en sous-ligne (« Uploading audio », « Transcribing audio », « Refining transcript », « Generating summary », « Complete »).
- **Prêt** :
  - onglet Summary + celebration ;
  - modale « première réunion » : « Your meeting notes are ready », aperçu Décisions / Prochaines étapes ;
  - **notification système**.

### Renommer les interlocuteurs
- **Fenêtre « Assign speakers / Attribuer les intervenants »** :
  - sous-titre : « Name each voice and we'll relabel the whole transcript. » ;
  - une ligne par voix : extrait audio + champ « Type a name » ;
  - suggestions « In this meeting / Dans cette réunion » (invités), contacts, « Add new person "{{name}}" » ;
  - fusion : étiquette « Same person / Même personne » ;
  - bouton **« Save names / Enregistrer les noms »**.
- **Clic sur un nom** (« Label Speaker ») : popover de recherche avec 2 choix de portée :
  - **« Update everywhere / Mettre à jour toutes les occurrences de "{{name}}" »** ;
  - **« Update only this block / Mettre à jour uniquement cette section »**.
- Salles (plusieurs voix sur un même micro) : « Who is {{voice}} in {{room}}? », « Combine all voices », « Separate N voices ».

### Partage / export
- Share : le lien donne **le résumé seul** ; « Invite for transcript access ».
- **Copy as Markdown** : « All meeting contents copied to clipboard ».
- Copier le résumé ; copier la transcription.
- Report : catégories « Speaker labels », « Summary quality », « Missing data », « Auto-stop », « Notifications », « Other ».

## 4. Fenêtres et cartes annexes

- **Pastille-rappel près de la Flow Bar** (fenêtre status). Elle sert aussi à **« Meeting detected / Réunion détectée »**.
  - Cartes empilées, avec un badge de compteur. 3 niveaux : mini → carte au survol → carte dépliée (avec le Brief).
  - Contenu d'une carte :
    - icône de la plateforme ;
    - **titre**, sinon « Meeting detected » (autodétection) ou « Meeting starting / Réunion sur le point de commencer » (agenda) ;
    - « Now / In {{minutes}} min » ;
    - **bouton principal** : autodétection = « Start Notetaker / Démarrer Notetaker » ; agenda = « Join meeting » + sous-libellé « & start Notetaker » ;
    - **chevron menu**, dans l'ordre : Join meeting · Start Notetaker · **Snooze for 2 min** · séparateur · interrupteur **« Start Notetaker automatically »** · **« Notification settings »** ;
    - croix de fermeture au survol ;
    - en autodémarrage : compte à rebours + « Starts automatically when the countdown ends ».
  - Changement de réunion en cours : « Stop Notetaker? / Arrêter Notetaker ? » + « Stop and switch / Arrêter et changer ».
- **Fenêtre de note** pendant l'appel (500 × 700) : même composant que la L2, sans la rangée Back/flèches.
- Bannière dans la note : « Want Notetaker to start automatically? » + Turn on / Not now.
- Modales : bienvenue (« Try Notetaker for meetings ») ; première réunion (« Your meeting notes are ready » / « Congrats on your first meeting! », pour moins de 5 min).

## 5. Libellés clés (EN → FR officiel Wispr → proposition CBW)

| Rôle | EN | FR Wispr | Proposition CBW |
|---|---|---|---|
| Entrée nav / titre page | Notetaker | Notetaker | **Notes** (décision) |
| Nouveau | New note | Nouvelle note | Nouvelle note |
| Section agenda | Upcoming / Up Next / Today | À venir / Aujourd'hui | À venir / Aujourd'hui |
| Section passée | Past notes | Notes précédentes | Notes précédentes |
| Recherche | Search past notes | Rechercher dans les notes | Chercher dans les notes |
| Aperçu | Overview / Attendees | Vue d'ensemble / Participants | En bref / Participants |
| Onglets | Transcript · Summary | Transcription · Résumé | Transcription · Résumé |
| Lecture | {{n}} min read | {{n}} min de lecture | {{n}} min de lecture |
| Enregistrer | Start / Stop / Resume / Finishing up… | Démarrer / Arrêter / Reprendre / Finalisation… | idem |
| Demander | Ask anything | Posez n'importe quelle question | Demander… |
| Étapes | step {{n}} of {{total}} | étape {{n}} sur {{total}} | Étape n sur 3 |
| Renommer | Assign speakers / Save names | Attribuer les intervenants / Enregistrer les noms | Nommer les voix / Enregistrer |
| Portée | Update everywhere / Update only this block | toutes les occurrences / uniquement cette section | Partout / Ce passage seulement |
| Détection | Meeting detected / Snooze for 2 min | Réunion détectée / Reporter la notification | Réunion détectée / Plus tard (2 min) |
| Menu | Copy as Markdown / Delete | Copier au format Markdown / Supprimer | Copier en Markdown / Supprimer… |
| Vide | No notes yet / Notes from your meetings will show up here | Aucune note pour le moment / Les notes de vos réunions apparaîtront ici | idem |

La traduction FR de Wispr est inégale : « Mes pensées », « Eux », plusieurs chaînes restées en anglais, « Masquer le résumé » pour « Hide brief ». Mieux vaut ne pas la reprendre telle quelle.

## 6. Mise en page et visuel (décrit d'après le CSS)

- **Page** : une carte de contenu arrondie (24 px en haut, 16 px en bas), filet 1 px, fond clair chaud (« sable »), posée à côté de la barre latérale.
- **Liste** : marges 40 px. Contenu centré, **largeur max ≈ 1 046 px**. Espacement vertical de 32 px entre les blocs.
- **Panneau d'aperçu** : colonne fixe de **280 px** à droite, fond un cran plus clair, filet à gauche.
- **Typographie** : police sans empattement géométrique et humaniste pour l'interface. Une serif est réservée à quelques titres marketing.
  - Titre de page : 24/32, demi-gras.
  - Titre de note : 32 px, gras, interligne 1,2.
  - Ligne de liste : titre 15/20 regular, heure plus discrète.
  - Surtitres de jour : 12/20, capitales, demi-gras, interlettrage +0,075 em, gris.
- **Lignes** : hauteur min 60 px, padding 12, coins de 12 px, sans bordure. Le fond se teinte au survol ou à la sélection. Le texte est à 70 % d'opacité au repos, 100 % au survol. Les actions apparaissent au survol.
- **Bloc À venir** : un seul cadre arrondi (16 px) sur fond teinté. Lignes espacées de 4 px. La barre de couleur d'agenda est à gauche.
- **L2** : marge de 24 px. Les onglets sont collés sous le titre. Le corps forme une carte pleine largeur arrondie (16 px).
- **Barre du bas** : pastille flottante à 16 px du bas, coins de 32 px, padding 10, ombre à l'activation. Elle se superpose au contenu, avec un fondu en bas de page.
- **Thème** : clair « sable » ; sombre en bleu nuit très foncé. Accent discret, surtout pour les états (onde, conflit).

---

## 7. Écart avec CBW AI aujourd'hui (`design/app/notes.js`, `app.html`)

État actuel :
- **disposition maître-détail permanente** : liste à gauche (« Notes », « Nouvelle note », recherche, groupes par jour) + feuille à droite ;
- en-tête « liste / fil d'Ariane / … » ;
- écran d'intro, puis onglets Transcription · Résumé, avec les actions du résumé dans la barre d'onglets ;
- barre du bas : Démarrer → [Annuler · Pause · Arrêter] → étapes → « Demander… » ;
- cartes détection / fin d'appel / agenda ;
- la ligne de liste affiche « heure, durée, genre ».

### Changements pour avoir la même organisation (en gardant les décisions de Camille)
1. **Deux niveaux au lieu du maître-détail.** L1 = la liste sur toute la largeur. L2 = la note, qui remplace la liste. Supprimer le bouton « liste » et le fil d'Ariane.
2. **En-tête L1** :
   - h1 « Notes » à gauche ;
   - à droite : bouton réglages des notes (vers Réglages › Notes), puis **« + Nouvelle note » (⌘N)**.
   - La recherche quitte l'en-tête de colonne et va **au-dessus de la liste, alignée à droite** (cf. point 4).
3. **Groupes par jour** : surtitre en petites capitales grises « AUJOURD'HUI, 15 OCT. » / « HIER, 14 OCT. » / « MAR. 13 OCT. ».
   - Ligne d'une note :
     - avatars ou initiales des voix nommées ;
     - **titre** ;
     - sous-ligne **heure seule**, plus le statut de traitement si besoin (« Transcription… », « Échec. Réessayer », « Générer le résumé ») ;
     - à droite au survol : **menu …** (Copier en Markdown · Afficher dans le Finder · Supprimer…).
   - **Retirer la durée et le genre de la ligne** : ils passent dans l'aperçu et la L2.
4. **Panneau d'aperçu à droite (280 px)** au survol ou à la sélection :
   - titre ;
   - « Aujourd'hui • 10:02 • 42 min » ;
   - Participants (voix nommées) ;
   - « En bref » (début du résumé) ou l'étape en cours.
   - Entrée ou clic ouvre la L2.
5. **L2, en-tête** :
   - à gauche : « ← Notes » ;
   - à droite : menu … (Copier en Markdown, Afficher dans le Finder, Supprimer…), puis **Note précédente / suivante (J / K)**.
   - Pas de Share (pas de cloud) ni d'« Ouvrir dans une fenêtre » (décision : pas de bloc-notes flottant).
6. **L2, titre + sous-ligne** :
   - gros titre modifiable ;
   - dessous : **pastille date** + **voix nommées** (pile + liste). Pas de nombre de personnes demandé.
   - Supprimer l'écran d'intro long. Le garder seulement comme état vide de l'onglet Transcription, à la manière de « Bienvenue… ».
7. **Onglets** : **Transcription · Résumé**, dans cet ordre (c'est déjà l'ordre de Wispr).
   - Défaut : Transcription pendant l'enregistrement, **bascule sur Résumé à la fin** ; une note passée s'ouvre sur Résumé.
   - Mettre une **onde animée** devant « Transcription » pendant l'écoute et un **scintillement** sur « Résumé » pendant la génération.
8. **Rangée d'outils dans chaque onglet**, et non plus dans la barre d'onglets :
   - Transcription : « 12:34 » en direct, puis « 3 voix • 42 min » ; Chercher (⌘F, /) · Copier tout · **Nommer les voix** ;
   - Résumé : « 3 min de lecture » ; Chercher · Copier · menu … (Type de résumé…, Copier les prochaines étapes, Revenir à la version précédente, Régénérer). Le sélecteur de type reste dans ce menu, comme décidé.
9. **Transcription** :
   - blocs par voix (nom + bouton ▶ « Écouter la voix ») ;
   - au survol d'une phrase : Modifier / Supprimer ;
   - **on garde l'horodatage** (décision CBW, Wispr n'en a pas) ;
   - « Moi / Les autres » pendant, puis noms ou « Personne N » ;
   - bouton « Aller en bas ».
10. **Renommer** :
    - garder le popover sur le nom (2 extraits, suggestions agenda, **Partout / Ce passage seulement**) ;
    - **ajouter la fenêtre « Nommer les voix »** : toutes les voix d'un coup, extrait + champ + suggestions, « Même personne » pour fusionner, bouton « Enregistrer les noms ». On l'ouvre depuis la rangée d'outils.
11. **Barre du bas = pastille flottante** :
    - au-dessus, ligne d'info « Préviens les participants… » (remplace le bloc d'intro) ;
    - rangée **[Démarrer | Arrêter | Reprendre | Finalisation…] [Demander…]** ;
    - le tiroir des réponses s'ouvre vers le haut ;
    - **supprimer Pause et Annuler**, comme Wispr et la décision « Arrêter / Reprendre ». « Démarré par erreur ? Garder / Jeter » remplace Annuler.
12. **Traitement** : étapes en superposition « Étape n sur 3 » (déjà là) ; la même info défile dans la ligne de liste et dans l'aperçu.
13. **Carte « Réunion détectée »** :
    - un **bouton principal** « Démarrer les notes » + chevron menu (Plus tard (2 min) · Démarrer automatiquement [interrupteur] · Réglages des notifications) + croix ;
    - aujourd'hui, la carte a 3 boutons à plat. Garder le compte à rebours de 10 s.
14. **Indicateur en direct** : pastille onde + chrono dans la ligne de la note en cours (en haut de la liste). Rien dans la barre latérale (Wispr n'en a pas non plus).
15. **Visuel** :
    - contenu centré, largeur max ~1 040 px, marges de 40 px ;
    - lignes de 60 px sans bordure, survol teinté, texte atténué au repos ;
    - titre de note très gros ;
    - surtitres en capitales espacées ;
    - à faire avec les jetons CBW (`design/cbw/`), sans reprendre la palette sable ni les polices Wispr.

### Contradictions avec Wispr : questions pour Camille
1. **Bloc « À venir » (agenda) en haut de la liste** : c'est le cœur de l'organisation Wispr (3 réunions, « Afficher plus », Rejoindre + Démarrer), mais tu avais écrit « Non retenus : liste À venir/Passées ». Si on veut la même organisation, on l'ajoute (on a `calendar.ts`). À défaut, la liste ne montre que les notes précédentes. **À trancher.**
2. **« Qu'ai-je raté ? »** et la barre « Demander » active **pendant** l'enregistrement : chez Wispr, le champ est là en direct. Tu avais écarté « Qu'ai-je raté ? ». On garde « Demander… » seulement après l'arrêt ?
3. **Onglet « Mes notes »** : Wispr l'ouvre par défaut en direct. Toi : pas de carnet. Divergence assumée, mais l'onglet par défaut en direct devient alors Transcription. OK ?
4. **Onglet Tâches** : Wispr sépare les actions dans un 3e onglet. Toi : 2 onglets, prochaines étapes dans le résumé. On garde 2 onglets ?
5. **Onglets « Partagés avec moi / Dossiers »** et le **Partage par lien** : sans objet en local. On n'a qu'une liste, sans onglets ; d'accord ?
6. **Pause** : Wispr n'en a pas (Arrêter puis Reprendre). On la retire ?
7. **Durée dans la ligne** : Wispr ne montre que l'heure dans la liste (la durée est dans l'aperçu). On aligne ?
8. **Texte gris IA / noir retouché et heures dans la marge du résumé** : rien de tel chez Wispr (résumé simple éditable + « N min de lecture »). On garde notre marge source (atout « vérifier à la source ») ou on simplifie ?
