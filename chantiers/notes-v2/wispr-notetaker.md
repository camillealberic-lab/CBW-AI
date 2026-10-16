# Wispr Flow Notetaker : veille + plan « identique » pour CBW AI

Veille du 15/10/2026, lecture seule. Légende : **PROUVÉ** = doc officielle Wispr / Granola ou changelog. **OBSERVÉ** = test indépendant ou maquette publique. **SUPPOSÉ** = déduction.
Limite : je n'ai pas pu voir les images (captures 9to5Mac, vidéos). Aucune vidéo YouTube ni fil Reddit exploitable n'est remonté. Les descriptions d'écran viennent du texte des docs, des légendes et des maquettes du site.

## Sources principales
- Annonce : https://wisprflow.ai/post/wispr-flow-notetaker (5/08/2026)
- Page produit : https://wisprflow.ai/notetaker
- Docs : enregistrer https://docs.wisprflow.ai/articles/9238501024-recording-a-meeting-with-notetaker-beta · le hub https://docs.wisprflow.ai/articles/9247277218-the-notetaker-hub-your-meetings-in-one-place-beta · page de note et éditeur https://docs.wisprflow.ai/articles/9406970664-meeting-notes-and-the-editor-in-notetaker-beta · réglages https://docs.wisprflow.ai/articles/9319084321-notetaker-settings-explained-beta · calendrier et rappels https://docs.wisprflow.ai/articles/8955305188-meeting-detection-reminders-and-calendar-in-notetaker-beta · dépannage https://docs.wisprflow.ai/articles/4251565280-troubleshooting-notetaker-transcripts-summaries-and-the-hub-beta
- Changelog : https://wisprflow.ai/whats-new
- Presse : https://9to5mac.com/2026/08/05/wispr-flow-takes-on-ai-meeting-assistants-with-notetaker-its-first-product-beyond-dictation/ · https://techcrunch.com/2026/08/05/wispr-flow-is-preparing-to-launch-a-meeting-notetaker-updated-terms-suggest/
- Tests : https://tldv.io/blog/wispr-flow-notetaker-review/ · https://hirekai.ai/blog/wispr-flow-notetaker · https://filipkonecny.com/blog/best-meeting-transcription-app/ · https://craftnote.com/blog/wispr-flow-notetaker-review-2026
- Granola : https://www.granola.ai/blog/get-the-best-from-granola · https://www.granola.ai/updates/upgraded-meeting-note-templates · https://www.granola.ai/blog/meeting-note-templates-by-type · https://docs.granola.ai/help-center/taking-notes/taking-notes-in-granola · https://zackproser.com/granola

---

## 1. Nom, place dans l'app, lancement, indicateur

| Point | Détail | Statut |
|---|---|---|
| Nom | « Notetaker » (onglet du site, entrée de la barre latérale). En interne, « Wispr Notetaker ». | PROUVÉ |
| Place | Entrée **Notetaker** dans la barre latérale gauche de l'app (hub). On passe d'une page à l'autre avec Alt + flèches. Pendant un enregistrement, une **carte « réunion en cours »** apparaît dans la barre latérale. | PROUVÉ (doc hub, 9to5Mac) |
| Lancer (manuel) | Bouton **New note** pour une réunion non prévue ou en présentiel. Sur une réunion du calendrier : **Join + Start** (visible 10 min avant), **Join meeting** ou **Start**. Une seule réunion enregistrée à la fois. | PROUVÉ |
| Raccourci | **Option + M** (Mac) démarre Notetaker ou rejoint la réunion. **Triple appui sur la touche de dictée**, actif par défaut. | PROUVÉ (réglages) |
| Détection d'appel | « Automatically detect any call » est **actif** par défaut. Une carte **« Meeting detected »** apparaît avec un compte à rebours de 10 s (réglable de 5 à 60 s). Actions : Start Notetaker, pause, annuler, « Snooze for 2 min », refuser. « Start Notetaker automatically » est **désactivé** par défaut. Zoom, Meet, Teams, huddles Slack, Discord et navigateur sont reconnus. | PROUVÉ |
| Calendrier | Réglages → Connectors : Google ou Outlook. Rappel « Notify before scheduled meetings start », par défaut juste avant le début (15 s). Carte rappel : bouton **« Join meeting & start Notetaker »**, avec un menu (Join meeting / Start Notetaker / Start Notetaker automatically / Snooze). Le **nom et le compte à rebours de la prochaine réunion s'affichent dans la barre des menus**, actif par défaut. | PROUVÉ |
| Bloc-notes | « Open Notepad when starting Notetaker » est actif : une **fenêtre flottante Notepad** s'ouvre au démarrage, grande par défaut et redimensionnable. Option « Split the screen when joining » : la visio à gauche, le Notepad à droite. | PROUVÉ / OBSERVÉ (tl;dv) |
| Indicateur | La **Flow Bar** (pastille de dictée) devient une **« recording pill »** passive, qui sert à rouvrir la note. Le bouton **« Stop Notetaker »** arrête. On peut faire **pause / reprendre**, avec un séparateur « Paused / Resumed » dans la transcription. Pas de dictée pendant un enregistrement. Option pour masquer le Notepad et la Flow Bar des partages d'écran, désactivée par défaut. | PROUVÉ |
| Arrêt auto | « Stop Notetaker when a call ends » est actif. Messages près de la Flow Bar : « Notetaker stopping », « Meeting still going? », « Still taking notes », « Stop taking notes? ». Après l'arrêt, « Notetaker stopped » propose **Resume** pendant 4 s. Durée max : 2 h par défaut (30 min, 1 h, 2 h ou 3 h). Alerte 5 min avant. | PROUVÉ |
| Après l'arrêt | Sauvegarde de l'audio (≤ 15 s). Traitement en **3 étapes**, légende « processing a meeting, step 2 of 3 » : envoi, transcription, résumé. Puis une **notification système « résumé prêt »** avec le **titre généré** (ex. « Testing Award-Winning Beauty Products »). La note bascule seule sur l'onglet **Summary**. | PROUVÉ + OBSERVÉ (tl;dv) |
| Cas limites | Pour une réunion de 5 min ou moins, pas de résumé auto : bouton **Generate summary**. Enregistrement très court : « Started by mistake? » avec **Keep** / **Discard**. Si la note est vide : « No audio was recorded ». En cas d'échec : « We hit a snag processing your meeting » + **Retry**. | PROUVÉ |

## 2. L'écran

### Le hub (liste) — PROUVÉ (doc hub)
Sections de haut en bas :
1. **Up Next** : la réunion imminente ou en cours, avec l'étiquette **Conflict** si deux se chevauchent.
2. **Upcoming** : les 7 prochains jours, 3 visibles, puis **Show more** / **Show less**. Clic sur une ligne : aperçu dans un panneau latéral. Au survol : bouton **…** à gauche de **Join**, qui ouvre les réglages propres à la réunion (partage auto, mention dans l'agenda). Pendant un enregistrement, la ligne affiche **Open Note**, les autres **Switch**.
3. **Past notes** : réunions terminées, avec **View more**.
4. **Shared with me** : notes partagées, en lecture seule.

En plus : un **bouton de recherche dans l'en-tête** (réunions et notes), un bandeau d'**import Granola / Otter** et un bouton **« Connect calendar »** (OBSERVÉ, légende tl;dv). La recherche par MCP ne couvre pas les transcriptions (OBSERVÉ tl;dv).

### La page d'une note — PROUVÉ (doc éditeur) + OBSERVÉ (maquette du site, Kai)
Ordre vertical :
1. **Back** (retour à la liste) · **Open note in window** (Notepad flottant) · **Share** · menu **…** avec **Copy as Markdown**.
2. **Titre** modifiable (120 caractères max). Priorité au titre de l'agenda, sinon titre généré, sinon le tien.
3. **Pastille date** : au clic, titre et horaire de l'événement. Puis les **participants** (invités de l'agenda). La **durée** n'apparaît pas dans la doc (non prouvé).
4. **Onglets dans cet ordre** : **My thoughts** · **Transcript** · **Summary** · (**Docs** s'il y a des pièces jointes). L'app retient le dernier onglet ouvert.
   - *My thoughts* : tes notes, avec enregistrement auto et **@** pour mentionner quelqu'un (invités en premier, « Add new contact »). Jamais incluses dans un partage.
   - *Summary* : éditable une fois prêt, recherche avec ⌘F ou « / », bouton copier. **Update summary** après une reprise.
   - *Transcript* : lecture seule. **Horodatage non documenté**. Les chevauchements sont attribués à une seule personne.
5. **Barre du bas** : champ **« Ask anything »** (Entrée envoie, Maj+Entrée fait un saut de ligne). Il répond aux questions **et modifie** la note, le résumé ou le titre. Puis **Stop / Resume**.
6. Pendant la réunion, la maquette montre aussi **« What did I miss? »** (3 puces sur les dernières minutes), **« Make me sound smart »** et **« Suggest questions »** (OBSERVÉ, maquette wisprflow.ai/notetaker).

**Maquette publique** (wisprflow.ai/notetaker), décrite à partir du texte de la page :
- Titre « Q3 Campaign Planning ».
- Onglets « My thoughts / Transcript / Summary ».
- Voix nommées Nathalie, Stephen, Mikel.
- Bloc **« Enhanced summary »** avec les sections **« Creative Direction »**, **« Channel Strategy »**, **« Next Steps »**.
- Puces au style factuel : « Hero image confirmed: lifestyle photography over product shots ». Actions au format « **Emily to send Tomás the design brief by end of day** ».
- Dans la transcription, les termes du dictionnaire sont mis en évidence (Raphael, Asana, Tableau).
- Bloc **« Catch up in seconds »** : 3 axes (Budget reallocation, Channel strategy, Creative timeline).
- Bloc **Ask** : « What's blocking the launch this week? », réponse en 3 puces sourcées.

**Survol des noms** (changelog 9/10) : une carte de contact s'affiche (photo, nom, poste, entreprise, LinkedIn). Un nom non lié se clique pour l'associer à un contact. PROUVÉ.

**Partage** (PROUVÉ) :
- Le lien donne accès au **résumé seul**. La transcription complète demande une **invitation par e-mail**.
- Droits du lien : Private / Shared with team / Anyone with the link.
- Partage auto possible après la réunion : personne, tous les invités ou le domaine.
- Le destinataire tombe sur notes.wisprflow.ai, avec une carte d'invitation à télécharger l'app (OBSERVÉ, Kai).
- Export : uniquement **Copy as Markdown** et MCP (Claude, ChatGPT, Gemini, Cursor).

## 3. Identification des interlocuteurs
- **Pendant** la réunion : seulement **« You » / « Them »**, deux pistes (micro et audio système). PROUVÉ.
- **Après** : une deuxième passe sur tout l'audio. Les **noms réels** viennent de l'invitation calendrier, du dictionnaire, du contexte de la conversation, de Slack et Gmail, et des noms affichés à l'écran dans Teams et Meet (la fenêtre doit rester visible, Teams en anglais). Le nombre de personnes **n'est jamais demandé**. Pas d'empreinte vocale. PROUVÉ.
- Une voix non identifiée reste **« Speaker 1 », « Speaker 2 »**. Le résumé peut écrire « Speakers 1 and 5 ». Dans les exports et le résumé, « You » devient ton nom de profil. PROUVÉ.
- **Renommer** : clic sur le locuteur, recherche par nom ou e-mail, ou « Add new contact », puis choix « partout dans la réunion » ou « ce bloc seulement ». Seul le propriétaire peut le faire. PROUVÉ. Une **fenêtre d'attribution** fait écouter **2 courtes citations par voix inconnue** et propose des noms. Un clic renomme partout, y compris dans les Next steps, avec une bulle « **Who is this?** ». OBSERVÉ (Kai).
- Fiabilité : sur 5 voix, 3 ont été bien séparées et 2 fusionnées (Kai). Sur 3 voix, « trois étiquettes, mais pas les bonnes » (tl;dv). OBSERVÉ.
- Couleurs et avatars par locuteur : non documentés. SUPPOSÉ : de simples noms en gras.

## 4. Le résumé

### Wispr
- Le résumé est **organisé par sujet** (sections titrées par thème), avec les **décisions**, les **dates clés** et **« who owes what »**, c'est-à-dire les **next steps pour chaque personne**, « in short lines ». PROUVÉ (annonce, changelog, page « capture decisions »).
- En tête : un paragraphe **TL;DR** marqué « 1 min read ». Puis des sections thématiques en puces, la liste des décisions et les Next steps attribués. OBSERVÉ (Kai).
- Maquette : sujets (« Creative Direction », « Channel Strategy »), puis **« Next Steps »** en dernier. Format d'action : « **Prénom** to + verbe + objet + échéance ». OBSERVÉ.
- Le résumé est généré en moins d'une minute (OBSERVÉ). Pas de gabarits documentés chez Wispr : un seul format, retouché ensuite avec « Ask anything ». PROUVÉ, par absence dans la doc et le changelog.
- Langue : le résumé est rédigé dans la langue parlée, mais **titres de sections et étiquettes restent en anglais**. OBSERVÉ (tl;dv). Pour nous, c'est un défaut à éviter.

### Granola
- Les « enhanced notes » partent de **tes notes en noir**, complétées en **gris** par l'IA à partir de la transcription et de l'agenda. Tes titres (« # Decisions », « # Questions », « # Next steps ») structurent la note finale. PROUVÉ (blog Granola, docs).
- Défaut **SUPPOSÉ** (non publié) : 3 à 6 sections nommées d'après les sujets abordés, puces courtes, puis « Next steps ».
- Gabarits : une bibliothèque (Customer Discovery, Sprint Planning, One-on-Ones, Investor Updates…). Granola **suggère** un gabarit selon le titre, les invités et l'historique. PROUVÉ.
- Un bon gabarit contient : métadonnées, ordre du jour, décisions, actions (une personne, un livrable, une échéance), prochaines étapes. PROUVÉ (blog).
- Un utilisateur avancé écrit ses gabarits section par section, avec une ligne de consigne chacun (ex. 1:1 : « What they brought / What I asked / Career thread / Risks / What I owe by Friday »). OBSERVÉ (zackproser).

## 5. Langues, français, limites
- À la sortie : **anglais seulement**. Depuis le 15/09/2026, la transcription couvre **21 langues, dont le français**. Résumés et autres fonctions « peuvent être moins fiables ». Une langue non prise en charge déclenche l'alerte « This sounds like a language we don't support yet ». PROUVÉ (changelog, dépannage).
- **Qualité en français : aucun test public trouvé**. Côté Wispr, on sait que les titres restent en anglais dans les résumés non anglais, qu'il n'y a pas de réglage de langue, et que la langue dominante l'emporte. OBSERVÉ (tl;dv).
- Limites :
  - pas d'audio réécoutable (rien à vérifier à la source) ;
  - traitement dans le cloud ;
  - Cloud Sync obligatoire ;
  - environ 1 Go de RAM, avec du lag sur un Mac de 8 Go ;
  - détection d'appel parfois lente (10 min dans un test) ;
  - limite hebdomadaire non chiffrée sur l'offre gratuite (les réunions de moins de 5 min ne comptent pas) ;
  - audio local effacé après 7 jours, donc plus de reprise possible ;
  - deux participants au même nom affiché sont fusionnés ;
  - plusieurs personnes sur un même micro sont mal séparées.

  OBSERVÉ et PROUVÉ.
- **Nos atouts** face à Wispr : audio local réécoutable, horodatage, titres en français, aucun envoi dans le cloud obligatoire.

---

## État actuel de CBW AI (survol)
- `design/app/notes.js`, maquette A « le carnet d'abord » : liste (« Réunions », recherche, dossiers par type, regroupement par jour) + feuille unique. Tes notes en noir, l'IA en gris avec l'heure dans la marge.
- Barre du haut : sélecteur « Type de réunion », bascule « Note complète / Mes notes », copier en Markdown, menu ….
- **Panneau latéral** : onglets « Transcription / Questions », avec réécoute, frise, recherche.
- Avant de démarrer : **stepper « Combien êtes-vous ? »** + « Prendre des notes ». Pendant : « Moi / Les autres ». Après : champ « Poser une question… » avec demandes rapides en « / ». Renommage par la fenêtre « Qui est Personne 2 ? » puis « Renommer partout ».
- `src/llm/templates.ts` : Auto/Général = En bref · Points abordés (### par thème) · Décisions · Actions (`- [ ] qui : action (échéance)`) · Questions ouvertes. S'y ajoutent 6 gabarits (équipe, 1:1, client, recrutement, atelier, cours). Une section vide est omise.

## (a) Changements d'écran pour être identique en structure

1. **Barre latérale** : l'entrée s'appelle « Réunions » (équivalent de « Notetaker »). Pendant un enregistrement, ajouter une **carte « réunion en cours »** sous la navigation (titre, chrono, Arrêter), visible depuis toutes les pages.
2. **Hub (liste)** : remplacer la liste « par jour + dossiers » par 4 sections. **À suivre** (Up Next, étiquette « Conflit »), **À venir** (7 jours, 3 visibles + « Voir plus »), **Notes passées** (« Voir plus »), puis **Partagées avec moi** (plus tard). Bouton **« Nouvelle note »** en haut, **loupe** dans l'en-tête, bandeau « Connecter l'agenda » si l'agenda n'est pas relié. Sur chaque ligne à venir : **Rejoindre + Démarrer** (10 min avant), **Démarrer**, et **…** au survol. Les dossiers par type passent en filtre secondaire.
3. **Supprimer le stepper « Combien êtes-vous ? »** (bandeau, barre et notification). Wispr ne demande jamais le nombre : le moteur l'estime, le calendrier aide pour les noms. Garder la phrase de consentement à copier.
4. **Page de note, en-tête** : Retour · titre éditable · **pastille date** (clic : événement de l'agenda) · **durée** (notre plus) · **participants** (invités, puis voix détectées). À droite : **Partager** (pour nous : copier le lien ou le Markdown, rien de publié), **Ouvrir dans une fenêtre**, menu **…** (Copier en Markdown, Afficher dans le Finder, Supprimer).
5. **Trois onglets dans cet ordre : « Mes notes » · « Transcription » · « Résumé »**, à la place de la feuille unique, de la bascule « Note complète / Mes notes » et du panneau latéral. Basculer seul sur **Résumé** à la fin. Retenir le dernier onglet. Garder le texte gris et l'heure dans la marge *dans* l'onglet Résumé.
6. **Onglet Transcription** : pendant la réunion, « Moi / Les autres » ; après, les noms ou « Personne 1, 2… ». Garder notre horodatage et la réécoute (atout). Rendu lecture seule, avec séparateur « En pause / Reprise ».
7. **Renommer** : clic sur un nom, puis une fenêtre avec **2 extraits audio par voix inconnue**, des noms suggérés (invités), « Ajouter un contact », et le choix **« Partout » / « Ce passage seulement »**. Bulle **« Qui est-ce ? »** sur les « Personne N » du résumé.
8. **Barre du bas permanente** : champ **« Demander… »** (questions **et** modifications : « raccourcis le résumé », « renomme »). Puis **Arrêter / Reprendre**. Pendant la réunion, ajouter **« Qu'est-ce que j'ai raté ? »** (3 puces sur les 3 à 5 dernières minutes) et **« Suggérer des questions »**.
9. **Pendant l'enregistrement** : à l'ouverture, un **bloc-notes flottant** (fenêtre compacte : Mes notes + Transcription en direct). La pastille passe à l'état « enregistrement réunion » (point + chrono, clic pour rouvrir la note). **⌥M** pour démarrer, **triple appui sur Control** en option. **Arrêt auto** en fin d'appel, avec « Toujours en réunion ? » et **Reprendre** pendant 4 s.
10. **Après l'arrêt** : barre de progression **« Étape 1/2/3 : sauvegarde · transcription · résumé »**, puis une **notification macOS « Résumé prêt : <titre> »**. Pour moins de 5 min : bouton « Générer le résumé ». Si l'enregistrement est presque vide : « Démarré par erreur ? Garder / Jeter ».
11. **Détection** : carte **« Réunion détectée »** avec compte à rebours de 10 s (Démarrer maintenant · Pause · Plus tard 2 min · Non). Option « Démarrer automatiquement », désactivée par défaut. Prochaine réunion et compte à rebours dans la barre des menus.
12. **Type de réunion** : le sélecteur sort de la barre du haut et passe dans le menu … de l'onglet Résumé (« Refaire avec un autre gabarit »), plus discret, comme chez Wispr qui n'en montre pas. Le choix Auto reste par défaut.

## (b) Gabarit de résumé par défaut « style Wispr / Granola » en français

À mettre comme `GENERAL` (id `auto`) dans `src/llm/templates.ts`. Titres **toujours en français**.

1. **En bref** : un paragraphe de 2 à 4 phrases, sans puces. De quoi il s'agissait, ce qui est acquis, ce qui reste à faire. Lisible en moins d'une minute.
2. **Une section par sujet abordé** : `## <Sujet>`, 2 à 6 sujets, **titre nommé d'après le contenu** (« Budget du salon », pas « Point 1 »), dans l'ordre chronologique. Sous chaque sujet, 2 à 6 puces factuelles d'une ligne. On garde chiffres, dates, noms et termes du dictionnaire. Une décision prise dans ce sujet commence par **« Décidé : »**. Une citation marquante est permise si elle compte.
3. **Décisions** : liste récapitulative, une décision par ligne. On précise qui l'a prise si c'est dit. Section omise si rien n'est décidé.
4. **Dates clés** : échéances et rendez-vous cités, au format « jeu. 23 oct. : … ». Omise s'il n'y en a pas.
5. **Prochaines étapes** : **toujours en dernier**, **groupées par personne** (« who owes what »). Format `- [ ] **Prénom** : verbe à l'infinitif + objet (échéance)`, ex. `- [ ] **Emma** : envoyer le brief à Tomás (ce soir)`. « Moi » devient le prénom du profil. Une voix non identifiée s'écrit « Personne 2 ». On n'invente ni personne ni échéance : si personne n'est désigné, `- [ ] À attribuer : …`.
6. **Questions ouvertes** (facultatif) : seulement s'il reste des points explicitement non tranchés.

Consignes de rédaction :
- Ton neutre et factuel, phrases courtes, au présent.
- Longueur : environ 10 à 15 % de la transcription, plafonnée à environ une page.
- Aucune section vide, jamais « Aucune ».
- Les notes de l'utilisateur (Mes notes) **orientent** la note, à la manière de Granola. Ses titres « # » deviennent des sections, ses lignes sont reprises telles quelles en noir.
- Aucun mot anglais dans les titres.

Les gabarits spécialisés existants (équipe, 1:1, client, recrutement, atelier, cours) restent proposés en option, sans changement.
