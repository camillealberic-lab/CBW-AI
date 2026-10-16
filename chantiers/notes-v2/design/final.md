# Notes v2 : audit UX/UI de la maquette A (version finale à implémenter)

Source auditée : `maquette-a.html` + `proposition-a.md`, confrontée à `api-core.md`, `api-llm.md`, `api-engine.md` et `design/cbw/tokens.css`.
Verdict : le concept tient et on le garde tel quel (carnet, noir = toi, gris = IA, loupe dans la marge, décisions et actions en tête, mini-frise). Il y a cependant **3 bloquants** à corriger avant livraison : une promesse de confidentialité fausse, des voix affichées en direct alors que l'API ne les fournit pas, et un texte bleu illisible en thème sombre. Il y a aussi **14 majeurs**, surtout sur le clavier et sur l'alignement avec l'API.
Pas de nouvelle maquette : chaque ligne ci-dessous s'applique directement dans `design/app/*`. Les sélecteurs cités sont ceux de `maquette-a.html`.

## 1. Utilisateur et tâches
- **Qui** : salarié ou dirigeant de PME, francophone, sur un Mac de 13 à 16 pouces. Il est en visio (ou en salle), avec une attention partagée entre la conversation et le carnet.
- **Ses peurs** : que ça n'enregistre pas, que l'IA invente un chiffre ou un nom, que la conversation parte « dans le cloud » sans qu'il le sache, perdre ses propres notes.
- **Trois tâches à réussir**
  - T1 : démarrer la prise de notes en un clic et savoir que ça tourne.
  - T2 : après l'appel, trouver qui fait quoi et pour quand, puis le vérifier à la source.
  - T3 : retrouver une information dans une réunion passée (liste, recherche, question).

## 2. Corrections priorisées

### Bloquants (à corriger avant toute livraison)
| # | Écran | Problème (preuve) | Correction en une ligne |
|---|---|---|---|
| B1 | Pendant, bandeau | « Tout reste sur ce Mac » (`#prive`) et la phrase de consentement « rien ne quitte mon Mac » sont fausses. La note est rédigée par Groq, Gemini ou OpenRouter (`routeLong`, message de panne). Ce n'est pas honnête et ça pose un problème RGPD. | Afficher « L'audio reste sur ce Mac. Le texte part chez {fournisseur} pour rédiger la note. » Si Ollama seul est actif, afficher « Tout reste sur ce Mac ». Phrase à copier : « Je prends des notes avec CBW AI : l'audio reste sur mon ordinateur. » |
| B2 | Pendant, panneau | La transcription en direct et la frise affichent Personne 2, 3 et 4. L'événement `live` ne fournit que `source: 'mic'\|'system'`. Les voix n'arrivent qu'à l'arrêt (`stage 'voices'`). | Pendant l'appel, n'afficher que 2 étiquettes : « Moi » (mic) et « Les autres » (system). En présentiel (une piste), afficher « Micro ». Masquer la frise jusqu'à `voices`. |
| B3 | Thème sombre | Le texte bleu `.st-ia` et `.qa .attente` (`--bleu` #2B3BFF) sur #1A1B1D donne **2,6:1** (il faut 4,5:1). Le trait de progression `.regle i` en bleu donne 2,6:1 (il faut 3:1 pour un élément graphique). | Créer le jeton `--bleu-texte` : #2B3BFF en clair, #7C86FF en sombre (6,0:1). L'utiliser pour tout texte ou trait bleu. |

### Majeurs
| # | Écran | Problème (preuve) | Correction en une ligne |
|---|---|---|---|
| M1 | Avant | `numSpeakers` se passe à `notes.start()`. Le bandeau « Vous êtes 4 ? » s'affiche **après** le démarrage, donc la valeur est perdue. | Mettre le stepper dans la notification et dans la barre « Avant ». « Prendre des notes » démarre avec N. Le bandeau devient une correction possible jusqu'à « Terminer » (ticket CORE : `setNumSpeakers` avant l'arrêt). |
| M2 | Avant | Le stepper est borné de 2 à 12 (`#bMoins`, `#bPlus`), alors que l'API accepte de 1 à 30. N = 1 est le cas « seul en salle ou dictée longue ». | Bornes de 1 à 30, valeur par défaut = invités + 1. À 1, afficher « Tout sera attribué à toi ». |
| M3 | Pendant | Aucun état n'existe pour `device` (`lost`, `recovered`, `fallback`, `muted`), alors que c'est la peur n°1. | Dans la barre, en `role="status"` : « Micro débranché. On continue avec le micro du Mac. » ou « Micro coupé dans macOS. Rien n'est capté. » (texte `--erreur` + ondes grises). |
| M4 | Arrêt | La maquette passe directement à « CBW AI complète tes notes ». L'API émet `transcript` → `voices` → `summary` → `done`. | Libellés successifs : « Transcription prête », puis « Séparation des voix… », puis « Rédaction de la note… », puis « Note prête ». La transcription s'ouvre dès `transcript`. Les noms affichent « … » jusqu'à `voices`. |
| M5 | Arrêt | L'animation mot à mot est simulée (17 ms par mot). Le vrai flux est `onDelta(annotatedSoFar)` cumulé. `''` signifie qu'on change de fournisseur. Ollama envoie un seul bloc. | Afficher chaque delta tel qu'il arrive via `parseAnnotated` (fondu de 160 ms sur les nouvelles lignes seulement). Sur `''`, garder l'affichage et indiquer « Autre moteur, on reprend ». Supprimer « Tout afficher ». |
| M6 | Arrêt | Le trait bleu montre une progression par lignes, ce qui est faux pour les réunions longues (découpage en parties, flux seulement à la fusion). | Piloter le trait par `onProgress(step,total)` avec le texte « Partie 2 sur 4 ». S'il n'y a qu'une partie, afficher un trait indéterminé avec le chrono en secondes. |
| M7 | Après, Actions | Le tableau Quoi / Qui / Quand (`.u.act`, `.act-tete`) suppose des champs structurés. L'API ne renvoie qu'une ligne : `- [ ] [[ia mm:ss]]texte[[/ia]] (échéance …)`. | Afficher les actions comme une liste à cocher sur une seule colonne. Ne garder les colonnes que si la ligne finit par « (Qui, date) » (ticket LLM : imposer ce suffixe dans `templates.ts`). |
| M8 | Après, Actions | « Envoyer au Hub » n'existe dans aucune API. | Masquer ce bouton tant que l'API Hub n'existe pas. À la place, mettre « Copier les actions » (Markdown, cases non cochées seulement). |
| M9 | Après, clavier | Chaque `.tx` et `.ia-in` est `contenteditable`, donc 1 arrêt Tab par ligne en plus de la loupe et de la case. Une note de 25 lignes fait environ 75 tabulations avant le champ de question. | Faire de la note **une seule** zone éditable (un seul arrêt Tab). Loupes et cases en `tabindex="-1"`. Raccourci `⌥⏎` = « voir la source de la ligne », `⌘⏎` = cocher. Rappeler ces raccourcis dans la légende. |
| M10 | Après, loupe | Ouvrir la source envoie le focus sur `#jouer` dans le panneau. Échap ferme le panneau mais laisse le focus perdu. | À la fermeture du panneau (Échap ou ×), rendre le focus à la loupe ou à la ligne d'origine (mémoriser `ancre`). |
| M11 | Après, loupe | La maquette affiche jusqu'à 3 sources par ligne et une réécoute garantie. L'API donne 0 à 2 références par span. La réécoute dépend de `.mic.wav` / `.sys.wav` conservés. | Prendre la première référence du premier span IA. Pas de référence = pas de loupe. Afficher le bloc « Réécouter » seulement si le WAV existe, sinon seulement le surlignage. |
| M12 | Après, type de réunion | La liste de la maquette contient « Exhaustif » (absent de l'API) mais pas « Cours / conférence ». Le libellé « Gabarit » est du jargon. | Alimenter le menu avec `listTemplates()` (`label` + `hint`), y compris `cours`. Libellé du bouton : « Type de réunion : Point d'équipe (auto) ». |
| M13 | Après, type de réunion | « Refaire la note » écrase silencieusement les retouches faites sur le texte gris (devenu noir). | Sous le bouton, écrire « Tes lignes restent. Tes retouches sur le texte gris seront remplacées. » Garder l'`annotated` précédent et proposer « Revenir à la version précédente » dans le toast. |
| M14 | Toasts | Le bouton Annuler du toast disparaît après 6 s (`toastT`) et le focus n'y va jamais. Un utilisateur au clavier ou avec un lecteur d'écran n'a pas le temps de l'atteindre (WCAG 2.2.1). | Toasts avec action : 10 s minimum, pause au survol et au focus, `⌘Z` équivalent à Annuler, toast en `role="status"` avec le libellé de l'action. |

### Mineurs
| # | Écran | Problème (preuve) | Correction en une ligne |
|---|---|---|---|
| m1 | Après, en tête | Les titres de bloc (`.mgh` « Décisions », « Actions ») sont en mono 12 px dans la marge : c'est le contenu clé mais le moins visible au test des 5 secondes. | Passer `.mgh` en Archivo 15 px, 800, couleur `--texte` (il reste dans la marge). |
| m2 | Après, actions cochées | `.u.act:has(input:checked) .qui{opacity:.6}` donne un gris IA à environ 2,6:1. | Supprimer l'opacité. Le barré seul suffit à montrer que c'est fait. |
| m3 | Thème sombre | `--texte-3` #8C8C88 sur `--fond-3` #2C2D31 donne 4,1:1. Sur `--fond-3` en clair, on est à 4,3:1. | Règle : jamais `--texte-3` sur `--fond-3`, utiliser `--texte-sec` (déjà fait pour `.tr.hl .tt`, à appliquer partout, y compris au survol des lignes `.reu`). |
| m4 | Pendant, éditeur | `.ed{outline:none}` écrase `:focus-visible`. Le seul repère de focus est le curseur. | Au focus de `.ed`, passer le trait de marge (`.regle`) à 4 px, ou ajouter un liseré `--focus` de 2 px à gauche de la colonne. |
| m5 | Pendant, éditeur | L'aide `.ph` (Markdown `#`, `-`, `[]`) est en `aria-hidden` : un lecteur d'écran ne l'entend jamais. | Ajouter `aria-describedby` sur `.ed` vers un texte caché lisible : « Dièse pour un titre, tiret pour une puce, crochets pour une tâche. » |
| m6 | Pendant, fin d'appel | Arrêt automatique 10 s après la fin de la visio. Trop court si on finit de taper ou si on reste en salle. | Délai de 20 s, avec « Continuer l'enregistrement » qui reste en place et le raccourci `⌘.` annoncé. Ne pas voler le focus de l'éditeur. |
| m7 | Pendant, barre | « Pause » et « Terminer » sont collés (10 px d'écart). « Terminer » est irréversible (loi de Fitts : risque de clic voisin). | Ordre : [Transcription] [Pause], puis 24 px d'espace, puis [Terminer]. |
| m8 | Pendant, fenêtre étroite | Sous 680 px, `.rail` disparaît (navigation perdue) et `.etat-l` aussi (l'état « Enregistrement » ou « En pause » ne tient plus qu'à une couleur). | Largeur minimale de fenêtre à 720 px (`BrowserWindow.minWidth`). Ne jamais masquer le texte d'état. |
| m9 | Lecteur d'écran | La loupe est placée **avant** le texte dans le DOM. Résultat lu : « Source 12:40 … Ajout de CBW AI : … » sur chaque ligne. | Mettre la loupe après le texte dans le DOM (position inchangée à l'écran). Préfixe caché raccourci en « IA : ». Libellé de la loupe : « Source à 12:40 ». |
| m10 | Questions | « Recette » est ambigu en français pro (recette = phase de tests, et la note elle-même parle de « la recette du 30 octobre »). | Renommer en « Demandes rapides ». Placeholder : « Poser une question à cette réunion (/ pour les demandes rapides) ». |
| m11 | Questions | Les citations de la maquette sont en `mm:ss`. `askNotes` renvoie `[Sk]` avec `citations[]` (`label` peut être nul si la source est le compte rendu, ou si `noteId` est une autre réunion). | Remplacer `[Sk]` par un bouton `label`. Si nul, afficher « dans la note ». Si autre réunion, afficher « titre, mm:ss ». Phrase sans résultat : « Je ne trouve pas ça dans tes réunions. » |
| m12 | Questions | Annonce de la réponse à chaque delta : risque de bavardage du lecteur d'écran. | `aria-busy="true"` pendant le flux, une seule annonce à la fin (premiers 140 caractères + « Réponse prête »). |
| m13 | Panneau | Les deux onglets sont dans l'ordre de tabulation (pas de tabindex itinérant). | `tabindex="-1"` sur l'onglet non sélectionné. Les flèches restent comme aujourd'hui. |
| m14 | Panneau | « « Moi », c'est ton micro » est faux en mode `mix` (présentiel). | Texte selon `mode` : `two-track`, « Moi = ton micro » ; `mix`, « Voix séparées automatiquement : vérifie qui est qui. » |
| m15 | Note | Les heures des lignes tapées n'existent pas dans l'API (`userNotes` = texte). | Garder `{texte, t}` côté UI et les rattacher par correspondance exacte après `organizeNotes`. Sans correspondance, ne pas afficher d'heure. |
| m16 | Note | Remplacer tout l'affichage à chaque delta fait sauter la lecture. | Rendu par clé de ligne (index plus texte utilisateur), `overflow-anchor: auto`, pas de défilement automatique. |
| m17 | États vides et erreurs | Il manque : aucune parole détectée, quota ou clé absente. | Aucune parole : « Aucune parole captée. Vérifie le micro dans Réglages. » Quota ou clé : « Plus de crédit chez {fournisseur}. » avec un bouton « Ouvrir Réglages ». Ces états s'ajoutent à « Réessayer » (le texte « rien n'est perdu » est conservé). |
| m18 | Toast et barre | Le toast (bas, 84 px) peut recouvrir l'élément qui a le focus (WCAG 2.4.11). | `scroll-padding-bottom: 96px` sur `.defile`. |
| m19 | Bandeau voix | Le groupe stepper n'est pas relié à sa question. | `aria-labelledby="bQuestion"` sur `.pas`. |

### Moteur de transcription (api-engine) : hors de l'écran Réunion
- Ne **jamais** afficher le téléchargement des modèles dans l'écran Réunion. Pendant le téléchargement, la réunion fonctionne avec l'ancienne chaîne sans rien changer pour l'utilisateur.
- Dans Réglages > Réunions, ajouter une ligne d'état avec les textes de `api-engine.md` §5, une barre `--bleu-texte` en `role="progressbar"` (`aria-valuenow` = `percent`), et les boutons « Télécharger maintenant » et « Suspendre » (`notes.engineDownloadPaused`). Sur macOS 14, afficher la phrase dédiée, sans bouton.
- Dans « À propos », afficher la NOTICE (Apache-2.0 et CC-BY-4.0).

## 3. Décisions esthétiques
**Conservées** (elles servent l'usage) :
- carnet sur une colonne de 640 px (environ 68 caractères) ;
- carnet en 17/28 ;
- marge de 88 px pour les heures et la loupe ;
- repère noir de 4×16 px pour « ta main », ce qui évite que la distinction tienne seulement à la couleur ;
- gris IA #5F5F5A (6,4:1 sur blanc, 5,4:1 sur le surlignage) ;
- légende permanente ;
- teintes des voix ≥ 4,5:1, toujours accompagnées du nom ;
- frise hors tabulation, avec un équivalent clavier sur les heures ;
- `prefers-reduced-motion` respecté ;
- popovers non modaux avec retour du focus ;
- un seul bouton principal par écran.

**Ajustée** : le trait de marge reste la signature, mais l'état n'y repose plus seul. Le texte d'état est toujours visible dans la barre, y compris en fenêtre étroite (WCAG 1.4.1).

**Refusée** :
- le tableau à 3 colonnes imposé (M7, données absentes) ;
- l'écriture simulée mot à mot (M5, elle retarde le vrai texte) ;
- « Tout afficher » (devient inutile).

## 4. Checklist accessibilité (WCAG 2.2 AA)
- [ ] Contraste du texte ≥ 4,5:1 dans les deux thèmes, y compris `--bleu-texte` en sombre (B3) et sans opacité sur le texte (m2, m3).
- [ ] Éléments graphiques d'état ≥ 3:1 (orange 3,1:1 sur blanc, trait bleu en sombre via `--bleu-texte`).
- [ ] L'état n'est jamais porté par la couleur seule : texte d'état visible, repère noir pour l'utilisateur, nom à côté de chaque teinte.
- [ ] Clavier : la note fait un seul arrêt Tab, `⌥⏎` ouvre la source, `⌘⏎` coche, `⌘J` mène à la question, `⌘.` termine, Échap ferme avec retour du focus (M9, M10).
- [ ] Focus visible partout, éditeur compris (m4). Le focus n'est pas masqué par le toast (m18).
- [ ] Cibles ≥ 24×24 (boutons à 44). Exceptions documentées : citations en ligne, segments de frise (équivalent clavier).
- [ ] Lecteurs d'écran : préfixe « IA : », loupe après le texte, `aria-busy` pendant le flux, une seule annonce à la fin, états `device` et `stage` annoncés en `role="status"`.
- [ ] Délais : action du toast ≥ 10 s avec pause et `⌘Z`. Arrêt automatique en 20 s, annulable.
- [ ] `prefers-reduced-motion` : pas de fondu, ondes figées, barres de chargement statiques avec texte, défilement instantané.
- [ ] Champs : libellé accessible sur chaque recherche et question, stepper relié à sa question (m19), aide Markdown lisible par les lecteurs d'écran (m5).
- [ ] Langue `lang="fr"`, espaces insécables avant `? ! : ;` (déjà géré par `fr()`).

## 5. Trois tests utilisateur rapides (5 personnes, 10 min chacun, vraie visio)
1. **Démarrer et se rassurer (T1)** : « Ta réunion commence, prends des notes. » On mesure : temps avant le premier clic, et la réponse à « Est-ce que ça enregistre ? Où va ta conversation ? » après 5 s. Réussite : moins de 5 s, et la réponse sur le cloud est juste (valide B1).
2. **Qui fait quoi, vérifié (T2)** : sur une note prête, « Qu'est-ce que Marc doit faire, pour quand ? Prouve-le. » On mesure : temps jusqu'à la bonne action, puis l'usage de la loupe sans aide. Une variante au clavier seul valide M9 et M10. Réussite : moins de 20 s, la loupe est trouvée seul, et le gris n'est pas pris pour du texte désactivé.
3. **Retrouver (T3)** : « Quel budget photo avait-on fixé il y a deux semaines ? » à partir de la liste. On note le chemin choisi (recherche, dossier ou question) et la confiance dans la citation. Réussite : moins de 45 s, et la citation est ouverte.
