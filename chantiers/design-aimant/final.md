# Emplacement aimanté : version finale (piste C corrigée)

Démo : `chantiers/design-aimant/demo-final.html`. Elle est autonome : on l'ouvre dans un navigateur, et seules les polices Google sont chargées.
Base : `proposition-c.md` (« Silhouette vivante »). Emprunts à A : le double trait blanc et encre, et le dimensionnement sur la taille réelle de la pastille.
Forme réelle vérifiée dans `design/overlay/overlay.html` :
- au repos : `#pill[data-state="idle"]` mesure 44×16 en `border-box`, liseré 1 px `rgba(255,255,255,.25)`, ombre `0 0 0 1px rgba(0,0,0,.35), 0 4px 16px rgba(0,0,0,.30)` ;
- trois carrés de 5×5 espacés de 3 px : `--accent` (orange), `--bleu-vif` #5A67FF, `--vert` ;
- au survol : 220×38 ;
- pendant un enregistrement : 30 px de haut, largeur selon le contenu (jusqu'à environ 380 px).

Le brief se trompait (40×30, cinq barres). La piste C a retenu le brief et écarté le fichier source, ce qui était une erreur.

---

## 1. L'utilisateur

- **Qui** : Camille et les utilisateurs francophones de CBW AI, sur un Mac (souvent un portable, parfois un écran externe non Retina), avec n'importe quel fond d'écran (photo, gris, sombre).
- **Contexte** : la pastille gêne à un endroit (elle masque un bouton, ou on partage son écran), alors on la déplace. Plus tard, on veut la remettre à sa place. Le geste est rare, et on l'a oublié d'une fois sur l'autre.
- **Peurs** : la perdre, ne pas savoir où est sa place, lâcher et que rien ne se passe, ou croire que le micro s'est ouvert.
- **3 tâches à réussir** :
  1. Remettre la pastille à sa place sans viser au pixel près.
  2. Savoir avant de lâcher si elle va se coller.
  3. Avoir la confirmation que c'est fait.

## 2. Audit de la piste C

| # | Problème | Gravité | Preuve | Correction |
|---|---|---|---|---|
| 1 | L'empreinte ne correspond pas à la pastille réelle : 48×38 avec cinq barres, autour d'une pastille de 44×16 à trois carrés. La promesse « les barres tombent pile sur les barres fantômes » est fausse, et on voit un rectangle noir 2,6 fois plus grand que la pastille. | **Bloquant** | `overlay.html` l. 110-131 ; hypothèse 1 de `proposition-c.md` | L'empreinte vaut taille réelle + 4 px de marge (52×24 au repos), avec les trois carrés 5×5 aux mêmes coordonnées que ceux de la pastille. |
| 2 | Ordre des fenêtres : la fenêtre de l'emplacement est affichée (`slot.showInactive()`) après la pastille, au même niveau `screen-saver`. Elle passe donc **au-dessus**. Avec une plaque opaque, la pastille serait masquée au moment de l'aimantation. | **Bloquant** | `overlay.ts` l. 274-277 | Appeler `this.win.moveTop()` juste après `slot.showInactive()`. Dans la démo, la plaque est sous la pastille (z-index 3 contre 5). |
| 3 | Le contraste tombe sous 3:1 sur un gris moyen. Avec une plaque `#1C1C1E` et un trait `#B8B8B4`, le pire cas est un fond de luminance 0,13 (`#656565`), où les deux bords font **2,9:1**. Ce gris est courant sur les photos. | **Majeur** (WCAG 1.4.11) | Calcul : (L+0,05)² = 0,528 × 0,0617, d'où L = 0,131 et un rapport de 2,93 | Emprunt à A : 1 px encre, puis un filet **blanc de 2 px**, puis la plaque encre. Pour tout fond uni, au moins un des deux bords dépasse **4,1:1** (pire cas `#7D7D7D`). Sur `#656565` : 5,8:1. |
| 4 | Le signal « proche » est trop faible. La barre centrale passe de 14 à 16 px (+2 px), le trait de 1 à 2 px. C'est pourtant le seul signal binaire qui répond à « si je lâche, ça colle ? ». | **Majeur** (Nielsen 1, visibilité de l'état) | `proposition-c.md` §4 | Les carrés **se dressent en barres** (5×5 vers 5×10, soit 2 fois plus hauts) et le filet blanc passe de 2 à 3 px. Ce sont deux changements de forme, sans couleur, lisibles par les daltoniens. |
| 5 | Mesure de la taille : on commence souvent le glisser depuis la pastille survolée, qui fait 220×38 et se replie en 240 ms. Une mesure en direct (`offsetWidth`) donnerait une empreinte de 228×46. | **Majeur** (intégration) | `overlay.html` l. 376 et `collapse()` au début du glisser | L'overlay envoie la taille **au repos de l'état courant** : 44×16 au repos, ou la largeur calculée par `layout()` sur 30 px pendant un enregistrement. |
| 6 | Le remplissage part du centre, sur cinq barres. Avec trois carrés, « du centre vers l'extérieur » ne veut plus rien dire, et DESIGN.md §6 prévoit que les barres poussent depuis la gauche. | Mineur | DESIGN.md §4 et §6 (barres de couleur orange, bleu, vert utilisées comme indicateur de progression) | Le remplissage va **de gauche à droite**, carré par carré, en `scaleX` : c'est une mini-barre de progression. |
| 7 | Le vert tenu 160 ms est à la limite de la perception quand on ne regarde pas la pastille en face. | Mineur | `proposition-c.md` §5 | Le vert est tenu 200 ms (400 ms en mouvement réduit). Chaque segment animé reste sous 250 ms. |
| 8 | Glissement jusqu'à 180 ms : un aimant doit paraître immédiat. | Mineur | idem | `min(120, 40 + 2d)` ms. |
| 9 | « Lâchée ailleurs » se fait en deux temps (vidage 120 ms puis store 160 ms, soit 280 ms) pour un état sans enjeu. | Mineur (économie) | idem | Une seule étape : le store redescend en 160 ms. |
| 10 | Jusqu'à 60 messages par seconde du processus principal vers la fenêtre (`distance` brute). | Mineur (performance) | `proposition-c.md` §6 | Emprunt à A : `p` quantifié au 0,05, et envoi **seulement si `p` ou `near` change** (au plus une vingtaine de messages par approche). |
| 11 | Les hauteurs des barres sont animées avec `height`, ce qui recalcule la mise en page. | Mineur | `demo-c.html` l. 191 | Uniquement `transform` (`scaleX`, `scaleY`), `clip-path` et `box-shadow` sur un seul élément. |
| 12 | Démo : `aria-live` couvre la distance, ce qui fait annoncer un nombre à chaque image au lecteur d'écran. | Mineur (démo) | `demo-c.html` l. 325 | Une zone `aria-live` séparée annonce seulement les changements d'état (saisie, proche, aimantée, posée ailleurs, annulé). |
| 13 | Démo : Échap **dépose** au lieu d'annuler, les flèches saisissent sans confirmation, et perdre le focus dépose la pastille. | Mineur (Nielsen 3, contrôle et liberté) | `demo-c.html` l. 540-544 | Modèle de A : Espace pour saisir, flèches pour déplacer, Espace pour poser, Échap pour annuler. Perdre le focus annule aussi. |
| 14 | Démo : l'anneau de focus bleu est invisible sur un fond bleu. | Mineur (WCAG 2.4.7) | fond « aplats » `#2F6FEB` | Double anneau : blanc 2 px et bleu 2 px. |
| 15 | Démo : la légende « Fond d'écran » est masquée visuellement, si bien que le groupe de boutons n'a pas de libellé visible. | Mineur | `demo-c.html` l. 66 | Légendes visibles pour chaque groupe. |

Points que je garde de C parce qu'ils servent l'usage : la plaque opaque (pas de translucidité, donc lisible sur une photo), le remplissage continu piloté par la distance (retour continu, HIG), l'état « armé » (un retour sur place n'est pas un succès), l'absence d'orange pour « proche » et le vert réservé au succès.

## 3. Spécifications finales

### 3.1 Géométrie (fenêtre 520×64 existante, insensible à la souris, **sous** la pastille)

| Élément | Valeur |
|---|---|
| Plaque | `(w + 8) × (h + 8)`, où `w × h` est la taille au repos de la pastille dans son état courant. Au repos : **52×24**. Pendant une note : `w × 30`, soit `(w+8) × 38`, et jusqu'à 388×38, qui tient dans 520×64. Centrée dans la fenêtre : son centre est celui de la pastille posée. |
| Bord | 1 px encre `#1C1C1E`, puis filet blanc `--l` = **2 px** (3 px quand la pastille est proche), puis le fond encre. Le tout en `box-shadow: inset` sans flou (c'est un trait, pas une ombre). |
| Empreinte | Les 3 carrés de la pastille, 5×5 et espacés de 3 px (21×5 au total), centrés. Contour 1 px `#8C8C88` et remplissage aux couleurs exactes de la pastille (`--accent`, `#5A67FF`, `#1FD26A`). Si l'overlay reçoit `?accent=`, l'emplacement reçoit la même valeur. |
| Pendant une note | Même plaque, à la taille de la pastille. L'empreinte reste les 3 carrés au centre : c'est la forme « au repos », donc « chez elle ». |

### 3.2 Couleurs et contrastes (WCAG 1.4.11, ≥ 3:1). Valeurs calculées avec la luminance relative WCAG.

| Paire | Rapport |
|---|---|
| Bord encre sur fond blanc | 17:1 |
| Filet blanc sur fond sombre `#1A1B1D` | 17,4:1 |
| Gris `#656565` (pire cas de C) : blanc / encre | **5,8** / 2,9 |
| Gris `#7D7D7D` (pire cas final) : blanc / encre | **4,1** / **4,1** |
| Bleu `#2F6FEB` : blanc / encre | **4,6** / 3,7 |
| Contour fantôme `#8C8C88` sur la plaque | 5,0:1 |
| Carrés remplis sur la plaque : orange, bleu vif, vert | 5,5 ; 3,9 ; 8,5:1 |
| Aimanté : vert `#1FD26A` sur fond sombre, liseré encre sur fond clair, encre sur vert | 8,7 ; 17 ; 8,5:1 |

Garantie : pour tout fond uni, `max(contraste blanc, contraste encre) ≥ 4,1:1`. L'emplacement ne contient aucun texte, aucune transparence partielle, aucun dégradé ni aucun halo.

### 3.3 États

| État | Déclencheur | Rendu | Durée et courbe |
|---|---|---|---|
| **Apparition** | Glisser au-delà de 5 px (comme aujourd'hui) | La plaque monte comme un store (`clip-path: inset(100% 0 0 0)` vers `inset(0)`), puis les 3 carrés se tracent de gauche à droite. | Plaque 200 ms `--ease-sortie` ; carrés 120 ms, délais de 60, 80 et 100 ms. Total 220 ms. |
| **Approche** (continu) | `d` entre 260 et 60 px | `p = clamp((260 − d) / 200)`, quantifié au 0,05. Le carré `i` (0, 1, 2) est rempli à `clamp(3p − i)` en `scaleX` depuis la gauche : orange, puis bleu, puis vert. | 70 ms linéaire, pour lisser les paliers |
| **Proche** | `d < 60` **et** armé | Carrés pleins, qui se dressent en barres 5×10 (`scaleY(2)`, décalés de 0, 20 et 40 ms) ; filet blanc de 2 à 3 px. Aucun changement de couleur. | 120 ms (`--ease-sortie` pour les barres, `--ease` pour le filet) |
| **Aimanté** | Lâchée avec `d < 60` et armé | 1. La pastille glisse à sa place. 2. La plaque devient verte `#1FD26A` avec un liseré encre de 1 px : un cadre vert de 3 px borde la pastille. 3. Le cadre se resserre sous la pastille (`clip-path: inset(4px)`), puis la fenêtre est masquée. | Glissement `min(120, 40 + 2d)` ms `--ease-sortie` ; vert instantané, tenu **200 ms** ; fermeture 140 ms `--ease-rideau` |
| Retour sur place sans être sorti | Lâchée avec `d < 60`, jamais armée | Glissement, puis fermeture, **sans vert** : ce n'est pas un succès. | Mêmes durées, sans les 200 ms |
| **Lâchée ailleurs** | `d ≥ 60` | La plaque redescend (store inverse). La pastille reste là où on l'a lâchée. | 160 ms `--ease-rideau` |

**Armé** : faux au début du glisser, vrai dès que `d ≥ 60` une première fois. On ne voit donc jamais « proche » ni le vert si l'on part de la place sans la quitter.
**Seuil exact, sans hystérésis** : ce qu'on voit correspond à la règle de dépôt de `overlay.ts` (`homeDistance < MAGNET`). Montrer la vérité vaut mieux qu'un affichage stable qui mentirait à 1 px près.

### 3.4 `prefers-reduced-motion: reduce`

- Pas de store, pas de tracé, pas de glissement : chaque état s'affiche d'un coup, et la pastille saute à sa place.
- Remplissage par paliers : chaque carré est plein si sa part atteint 0,5, vide sinon.
- « Proche » : les barres sont dressées et le filet épaissi tout de suite. La forme change, mais rien ne bouge.
- Le vert est conservé (c'est une couleur, pas un mouvement) et **tenu 400 ms**, puis tout disparaît d'un coup.
- Côté processus principal : `systemPreferences.getAnimationSettings().prefersReducedMotion` supprime le glissement de la fenêtre.

### 3.5 Intégration (pour le développeur)

- **`overlay.ts`**
  - Remplacer le HTML de `slotWindow()` par le bloc « EMPLACEMENT » de `demo-final.html` : la `.plaque` devient `#s`, le `<body>` remplace `.slotwin`, et on ajoute `@media (prefers-reduced-motion: reduce)` à la place de `.rm`.
  - Exposer `window.S = { show(w,h), set(p,near), snap(), close(), out(), hide() }`.
  - Dans `dragStart()`, juste après `slot.showInactive()` : `this.win.moveTop()` (correction bloquante n° 2).
  - Remplacer `setSlotHot(bool)` par `setSlotProximity(d, armed)`. Elle calcule `p` (quantifié au 0,05) et `near = armed && d < MAGNET`, mémorise `${p}|${near}` et n'appelle `executeJavaScript('S.set(…)')` que si cette valeur change.
  - Ajouter la constante `FAR = 260`.
  - `dragEnd()`, lâchée près et armée : `S.snap()`, glissement de la fenêtre de la pastille en images de 16 ms pendant `min(120, 40+2d)` ms, `S.close()` à +200 ms, `slot.hide()` 150 ms plus tard, puis `settings.set(POS_KEY, '')`.
  - `dragEnd()`, lâchée près sans être armée : glissement, `S.close()`, puis `hide()`.
  - `dragEnd()`, lâchée loin : `S.out()`, puis `slot.hide()` à 170 ms.
- **`overlay.html`** : envoyer la taille au repos au début du glisser, avec `bridge('drag', { phase: 'start', w, h })`. On prend `w = 44, h = 16` au repos, sinon `parseFloat(pill.style.width)` et `30`. Il faut étendre le preload ; en cas d'échec, on se replie sur 44×16.
- **Ne pas modifier** la pastille elle-même.

## 4. Tableau des changements (C vers la version finale)

| Élément | Avant (C) | Après | Pourquoi |
|---|---|---|---|
| Forme de référence | 40×30, 5 barres (brief) | 44×16, 3 carrés (`overlay.html`) | C'est la pastille réelle : l'empreinte doit lui correspondre au pixel près. |
| Taille de la plaque | 48×38 fixe | `(w+8)×(h+8)`, soit 52×24 au repos et jusqu'à 388×38 pendant une note | Emprunt à A : une place plus grande ou plus petite que la pastille ment sur le résultat. |
| Bord | Trait intérieur 1 px `#B8B8B4` | 1 px encre, puis filet blanc 2 px | Emprunt à A : on passe de 2,9:1 à au moins 4,1:1 sur tout fond, et le bord reste net sur un écran 1x. |
| Empreinte | 5 barres creuses de 3 px | 3 carrés creux de 5×5 | Même forme que la pastille, pour que les carrés se superposent exactement. |
| Remplissage | Du centre vers l'extérieur, `scaleY` | De gauche à droite, `scaleX`, carré par carré | Cela se lit comme une barre de progression (DESIGN.md §6). |
| Signal « proche » | +2 px sur la barre centrale, trait de 1 à 2 px | Carrés en barres (hauteur x2), filet de 2 à 3 px | Le seul signal binaire doit se voir du premier coup d'œil. |
| Vert | 160 ms | 200 ms (400 ms en mouvement réduit) | Confirmation perceptible en vision périphérique. |
| Glissement | Jusqu'à 180 ms | Jusqu'à 120 ms | Un aimant doit paraître immédiat. |
| Lâchée ailleurs | Vidage puis store (280 ms) | Store seul (160 ms) | Moins de mouvement pour un état sans enjeu. |
| Ordre des fenêtres | Non traité | `moveTop()` de la pastille | Sinon la plaque opaque masque la pastille. |
| Mesure de la taille | Non traitée | Taille au repos envoyée par l'overlay | Évite une empreinte de 228×46 copiée sur la pastille survolée. |
| Messages entre processus | Distance brute, jusqu'à 60/s | `p` quantifié, envoi au changement seulement | Moins de charge, même rendu. |
| Propriétés animées | `height` | `transform`, `clip-path`, `box-shadow` | Pas de recalcul de mise en page. |
| Démo, clavier | Flèches = saisir, Échap = déposer | Espace saisit et pose, Échap annule, perte du focus = annuler | Contrôle et liberté de l'utilisateur. |
| Démo, annonces | Distance en `aria-live` | Seulement les états | Pas d'avalanche d'annonces au lecteur d'écran. |
| Démo, focus | Anneau bleu | Anneau blanc et bleu | Visible sur un fond bleu. |
| Démo, pastille | 1 état | « Au repos » et « Note en cours » | Montre que la plaque suit la taille réelle. |
| Démo, planche | 3 fonds | 3 fonds + gris moyen `#656565` | Prouve la correction du contraste. |

### Décisions esthétiques conservées

- Le store qui monte : il dit « ça apparaît là, depuis le bas ».
- La plaque encre : c'est le même matériau que la pastille.
- Le cadre vert qui se resserre sous la pastille : la confirmation disparaît **dans** l'objet.
- Pour l'apparition, je garde `--ease-sortie` plutôt que le `--ease-rideau` prévu par DESIGN.md pour les masques. Le rideau démarre lentement et retarderait la réponse au début du geste : le retour doit arriver en moins de 100 ms.

### Décisions refusées

- Les hauteurs de barres « 6/10/14/10/6 » et le repérage sur les cinq barres : ils ne correspondent pas au produit.
- Le départ du remplissage par le centre : avec trois éléments, il ne veut plus rien dire.

## 5. Checklist d'accessibilité

- [x] Bords de la plaque ≥ 3:1 sur tout fond uni (pire cas 4,1:1), vérifié sur clair, sombre, bleu, jaune, gris `#656565` et `#7D7D7D`.
- [x] Éléments internes ≥ 3:1 sur la plaque (contour fantôme 5,0 ; carrés 3,9 à 17).
- [x] « Proche » n'est jamais signalé par la seule couleur : ce sont la forme (barres) et l'épaisseur (filet).
- [x] Aucun accent détourné : pas d'orange pour « proche », vert seulement pour un succès réel (et jamais pour un retour sur place).
- [x] Pas de flou, de halo, de translucidité ni de dégradé dans l'emplacement.
- [x] Aucune animation au-delà de 250 ms par segment ; aucune boucle ; `prefers-reduced-motion` géré (paliers, pas de déplacement, vert tenu 400 ms).
- [x] Aucun clignotement : le vert apparaît une fois, sans répétition (WCAG 2.3.1).
- [x] La fenêtre de l'emplacement ignore la souris, ne prend pas le focus et n'a aucun contenu à lire (décoratif). L'information d'état reste portée par la pastille, avec son `role="status"`.
- [x] Alternative au glisser pour revenir à la place (WCAG 2.5.7) : le double-clic sur la pastille et Réglages › « Remettre en bas » existent déjà (`resetPosition()`).
- [ ] **À faire hors de ce chantier** : il n'existe pas d'alternative sans glisser pour **placer la pastille ailleurs**. Recommandation : des positions prédéfinies dans Réglages › Pastille (bas centre, haut centre, coins).
- [ ] **À vérifier** : en mode `idle=hidden`, la pastille redevient invisible (opacité 0) dès que le glisser replie le survol. On déplacerait alors un objet invisible.
- [x] Démo : focus visible sur tout fond, clavier complet (Espace, flèches, Échap), annonces d'état en `aria-live` sans spam, cibles de 40 à 44 px, libellés de groupes visibles.

## 6. Trois tests rapides avec de vraies personnes (5 personnes, 10 minutes chacune)

Le test se fait sur leur Mac, avec **leur** fond d'écran, sur la version installée et non sur la démo.

1. **Retour à la place, à froid.**
   - Déroulé : on déplace la pastille en haut à droite à leur place, sans rien expliquer, puis on demande : « Remettez-la où elle était. »
   - Mesures : le temps jusqu'au dépôt, le nombre d'essais, et s'ils lâchent du premier coup dans la zone.
   - Réussite : 4 personnes sur 5 la remettent en un essai, en moins de 5 s.
   - Ensuite, on demande : « Qu'est-ce que le vert voulait dire ? » La réponse attendue est « c'est rangé » ou « c'est bon ». Si quelqu'un répond « c'est collé » ou « le texte est parti », il y a confusion avec l'état « Collé » de la dictée, et il faut le noter.
2. **Test des 5 secondes sur fonds difficiles.**
   - Déroulé : on montre 5 s une capture de l'état « apparition » sur trois fonds (le leur, un gris moyen uni, une photo chargée), puis on cache l'écran.
   - Questions : « Qu'avez-vous vu en bas de l'écran ? À quoi ça sert ? »
   - Réussite : la plaque est repérée sur les trois fonds, et au moins 3 personnes sur 5 la relient à la pastille (« sa place »).
3. **Seuil « proche ».**
   - Consigne : « Rapprochez la pastille de sa place et lâchez au moment où vous êtes sûr qu'elle va se coller. » On recommence 3 fois.
   - Observation : lâchent-ils au moment où les carrés se dressent ? Ensuite, on demande : « Qu'est-ce qui a changé juste avant que vous lâchiez ? »
   - Réussite : le changement de forme est cité spontanément par au moins 3 personnes sur 5.
   - Si possible, refaire ce test avec une personne qui a activé « Réduire les animations » et une personne daltonienne.
