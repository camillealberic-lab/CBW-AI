# Proposition A : repérage d'imprimerie

Démo : `chantiers/design-aimant/demo-a.html` (à ouvrir dans un navigateur, sans serveur).

## 1. Brief (5 lignes)
- **Objectif** : pendant le glisser, montrer où est la place par défaut de la pastille et dire clairement « si vous lâchez ici, elle s'y colle ».
- **Cible** : Camille et les utilisateurs francophones de CBW AI, sur macOS, avec n'importe quel fond d'écran.
- **Ton** : CBW Studio, suisse, précis. « Sympa » doit venir du geste et du mouvement, pas d'une couleur ni d'un effet.
- **Contraintes** : fenêtre de 520×64 qui ignore la souris, pas de flou, pas de halo, pas de translucidité, pas de dégradé, animations de 250 ms au plus, CSS pur, `prefers-reduced-motion` respecté.
- **Ce qui doit se voir en 5 s** : (1) la place est ici, (2) je suis assez près, (3) c'est posé.

**Hypothèses retenues**
- H1. La pastille au repos fait **40×30** avec 5 barres blanc, orange, bleu, vert, blanc (d'après le brief). `overlay.html` décrit encore 44×16 avec 3 carrés. Comme l'emplacement reçoit la taille réelle de la pastille (`w`, `h`), il fonctionne dans les deux cas, et aussi pendant un enregistrement, où la pastille est plus large.
- H2. La distance est mesurée de centre à centre, comme `homeDistance()`. Le seuil reste 60 px. Ce qu'on voit suit exactement la règle de dépôt, sans hystérésis cachée.
- H3. La fenêtre de l'emplacement passe **sous** la pastille (`this.win.moveTop()` après `slot.showInactive()`).
- H4. Hauteur disponible : (64 − 30) / 2 = **17 px** au-dessus et au-dessous de la pastille. Les marques doivent tenir dans ces 17 px dans tous les états.

## 2. Références (13)
| # | Référence | Ce que je retiens | Ce que je rejette |
|---|---|---|---|
| 1 | Boxcar Press, *Crop marks and registration marks* : https://www.boxcarpress.com/?p=22257 | Les traits de coupe sont posés **sur le prolongement des bords**, décalés du coin et jamais en contact avec le format. Le format est décrit sans être dessiné. | La mire ronde de repérage (cercle et croix) : le cercle est hors langage CBW. |
| 2 | Frontend Masters, *Simulating Crop Marks* : https://frontendmasters.com/blog/?p=8246 | Les marques de coupe se font en CSS avec quelques éléments absolus, sans image. | Le côté « clin d'œil rétro » décoratif. Ici, chaque trait a une fonction. |
| 3 | Rauno Freiberg, *Vercel* : https://rauno.me/craft/vercel | Des repères d'angle empruntés au **center mark** d'imprimerie pour **guider l'œil** vers un point précis. | La grille permanente en fond : l'emplacement n'existe que pendant le geste. |
| 4 | Vercel Geist, Grid : https://vercel.com/geist/grid | Des croix aux intersections : un repère minuscule suffit à fixer un point. | La couleur gris clair : elle disparaît sur un fond photo. |
| 5 | Müller-Brockmann, *Grid Systems in Graphic Design* : https://designreviewed.com/artefacts/grid-systems-in-graphic-design-josef-muller-brockmann-niggli-verlag-2015/ | Une rigueur chiffrée : un seul module (2 px), des longueurs et des écarts entiers. | Rien. |
| 6 | Leica, cadres collimatés du télémètre : https://leica-camera.com/en-BE/blog/photography/the-leica-rangefinder-explained | Les **cadres lumineux se déplacent avec la distance** (correction de parallaxe). C'est exactement mon resserrement continu à l'approche. | L'éclairage lumineux, qui serait un halo. |
| 7 | iPhone, verrouillage AE/AF : https://iphonephotographyschool.com/ae-af-lock/ | Un état binaire « verrouillé » rendu par **un rétrécissement du cadre**, pas par un texte. | Le jaune, qui serait un accent de plus. |
| 8 | Canon EOS R6, coins de la zone AF : https://community.usa.canon.com/t5/EOS-DSLR-Mirrorless-Cameras/EOS-R6-Can-t-remove-bracket-from-screen/td-p/471988 | Quatre coins blancs suffisent à délimiter une zone sur une image en mouvement. | Le trait simple, illisible sur un ciel clair. |
| 9 | macOS Sequoia, aperçu de la disposition en mosaïque : https://macmost.com/macos-sequoia-window-tiling-preview.html | L'aperçu n'existe que pendant le glisser, et lâcher aligne la fenêtre. | La zone grise translucide pleine : c'est exactement ce que Camille rejette. |
| 10 | Figma, guides d'accroche rouges : https://forum.figma.com/t/disable-snap-to-smart-guides/13000 | Des **traits seuls**, qui n'apparaissent qu'au moment de l'alignement. | Le rouge, qui entrerait en collision avec l'orange « enregistrement ». |
| 11 | CleanShot X, réticule de capture : https://www.macworld.com/article/617854/cleanshot-x-review.html | Un réticule lisible sur n'importe quelle capture. | La loupe : inutile pour une cible de 40 px. |
| 12 | Experimental Jetset, Whitney « Responsive W » : https://www.dezeen.com/2013/05/21/whitney-graphic-identity-by-experimental-jetset/ | Un seul trait comme identité, qui **change de forme selon le contexte**. | Le zigzag, trop expressif ici. |
| 13 | Teenage Engineering, OP-1 Field : https://www.thisispaper.com/mag/op-1-field-teenage-engineering | Un mouvement d'instrument : bref, mécanique et lié à une action. | Les illustrations animées, qui seraient décoratives. |

Pour la lisibilité, je m'appuie aussi sur le **pointeur macOS** (flèche noire à contour blanc), que tout le monde voit déjà sur tous les fonds : https://developer.apple.com/design/human-interface-guidelines/pointing-devices.

**Clichés évités** : aucun dégradé violet, aucun verre, aucun halo, aucune zone pleine translucide, aucune couleur d'accent.

## 3. Concept
**« La place de la pastille est un format d'imprimeur : on ne la dessine pas, on la repère. »**

Huit traits de coupe et une croix de repérage décrivent un rectangle vide de la taille exacte de la pastille. Plus elle approche, plus les traits se resserrent, comme le cadre d'un télémètre. Sous 60 px, ils se verrouillent. Au lâcher, ils claquent sur ses coins puis s'éteignent.

Ce que ça implique :
- **Ton** : rigueur d'atelier, rien d'ornemental. L'élément sympa est le geste : l'emplacement *répond* à la main de l'utilisateur.
- **Image** : seulement des traits, noir doux et blanc, doublés. Aucun aplat et aucune couleur. Le fond d'écran reste entièrement visible dans l'emplacement.
- **Mouvement** : chaque transition traduit une distance. Pas de rebond ni de ressort. Le seul écart au linéaire est le « claquement », une accélération franche jusqu'au contact.

**Pourquoi cet axe plutôt que les deux autres** : une forme pleine (silhouette, socle, ombre) masque le fond et oblige à choisir une couleur, alors que c'est précisément la couleur qui a été rejetée. Un mouvement ludique ou élastique dépasse 250 ms et contredit le système, qui réserve le ressort aux interrupteurs. Ici, zéro couleur garantit aussi qu'**aucun signal d'état n'est volé** : la pastille peut être orange (enregistrement) pendant qu'on la glisse sans que l'emplacement lui fasse concurrence.

## 4. Système

### 4.1 Géométrie (module 2 px, fenêtre 520×64)
```
            ┃ 7          ┃ 7                 traits verticaux : prolongent les bords gauche/droit
            ┃            ┃
   ━━━━━   ┌────────────┐   ━━━━━          traits horizontaux : prolongent les bords haut/bas
     7  g  │    ╋       │  g  7             ╋ = croix de repérage 12×12, au centre
   ━━━━━   └────────────┘   ━━━━━          g = écart entre le trait et le coin
            ┃            ┃
            ┃            ┃
```
| Élément | Valeur |
|---|---|
| Format repéré | `w × h` de la pastille réelle (40×30 au repos, environ 131×30 en « Écoute ») |
| Trait (8 en tout) | âme blanche **2 px** + contour `#1C1C1E` **1 px** de chaque côté = **4 px** visibles. Longueur de base 10 px, mise à l'échelle par `--k`. |
| Position | sur le prolongement des bords : les horizontaux dans l'alignement du bord haut ou bas, les verticaux dans l'alignement du bord gauche ou droit |
| Écart `g`, loin (≥ 240 px) | **10 px**, longueur **7 px** (`--k` .7). Débord vertical 17 px, ce qui tient pile dans la fenêtre. |
| Écart `g`, approche (240 → 60 px) | `g = 10 − 4·p`, avec `p = (240 − d) / 180` arrondi au 0,05. Donc 10 → 6 px. |
| Écart `g`, proche (< 60 px) | **2 px**, longueur **10 px** (`--k` 1) |
| Écart `g`, aimanté | **0 px** : les traits touchent les coins et deviennent le prolongement des bords de la pastille |
| Croix de repérage | 12×12 : traits encre 4 px, âme blanche 2 px. Visible tant que la pastille n'est pas proche. |

### 4.2 Palette (2 couleurs, zéro accent)
| Rôle | Hex | Usage |
|---|---|---|
| Âme du trait | `#FFFFFF` | lisible sur les fonds sombres |
| Contour du trait | `#1C1C1E` (encre CBW) | lisible sur les fonds clairs |

**Contrastes vérifiés** (WCAG 1.4.11, objets graphiques ≥ 3:1)

| Fond | Blanc | Encre | Trait porteur |
|---|---|---|---|
| Clair `#E6E8EC` | 1,3:1 | **13:1** | encre |
| Sombre `#121418` | **18,6:1** | 1,1:1 | blanc |
| Gris moyen `#7A7A7A` (pire cas) | **4,3:1** | **4,0:1** | les deux |
| Jaune `#FFC21A` | 1,6:1 | **10,5:1** | encre |
| Rouge `#E8402C` | **4,0:1** | **4,2:1** | les deux |
| Bleu `#1E5BFF` | **5,3:1** | 3,2:1 | blanc |
| Pastille `#1C1C1E` | **17:1** | | blanc |

**Garantie mathématique** : pour tout fond uni, au moins un des deux traits dépasse **4,1:1**. Le pire cas est un fond de luminance relative 0,205, où les deux traits donnent 4,13:1. Il n'existe aucun fond où le repère disparaît.

### 4.3 Typographie
L'emplacement ne contient **aucun texte**. Sur 40 px, un texte serait illisible sur une photo et inutile, puisque la forme suffit. La page de démo utilise Archivo (titres 32/800, corps 15/400) et JetBrains Mono (étiquettes 12/500, majuscules, +.06em), conformément à DESIGN.md.

### 4.4 Mouvement (toutes les durées sont de 250 ms au plus)
| Moment | Propriété | Durée | Courbe | Délai |
|---|---|---|---|---|
| **Apparition** (début du glisser) | traits `scale` 0 → `k`, depuis le côté du coin, comme un traceur | 140 ms | `cubic-bezier(.16,1,.3,1)` | 0 |
| | opacité 0 → 1 | 80 ms | linéaire | 0 |
| | croix `scale` 0 → 1 | 140 ms | `cubic-bezier(.16,1,.3,1)` | 40 ms |
| **Approche** (continue) | `translate` (écart `g`) | 80 ms | linéaire (lisse les pas de 16 ms) | 0 |
| **Proche** (entrée ou sortie sous 60 px) | `translate` 6 → 2 px et `scale` .7 → 1 | 90 ms | `cubic-bezier(.3,0,0,1)` (verrou sec) | 0 |
| | croix `scale` → 0 | 90 ms | idem | 0 |
| **Aimanté** (lâchée sous 60 px) | pastille : glisse vers sa place | 100 ms | ease-out cubique | 0 |
| | traits : 2 → 0 px, **claquement** | 50 ms | `cubic-bezier(.6,0,1,1)` (accélère jusqu'au contact) | 100 ms |
| | traits : extinction en 2 crans (1 → .5 → 0) | 80 ms | `steps(2, end)` | 150 ms |
| | **total** | **230 ms** | | |
| **Lâchée ailleurs** | traits `scale` → 0 (rentrent vers le coin), opacité → 0 | 120 ms | `cubic-bezier(.2,.7,.2,1)` | 0 |

Seuls `transform` (`translate` et `scale`, en propriétés séparées) et `opacity` sont animés. Les propriétés `translate` et `scale` individuelles sont gérées par Chromium dans Electron 44.

**`prefers-reduced-motion: reduce`** : aucune translation ni mise à l'échelle animée. Les états changent d'un coup : loin 10 px et 7 px, proche 2 px et 10 px, croix masquée. Le resserrement continu est remplacé par ces deux paliers. À l'aimantation, les traits se placent à 0 px, restent **120 ms** puis s'éteignent d'un coup, et la pastille saute à sa place sans glisser. L'information (forme, position, verrou) reste complète.

## 5. Écrans (états)
Hors sujet ici : version mobile (c'est une fenêtre macOS). La page de démo, elle, s'adapte : barre d'outils empilée sous 720 px et bureau en 16:10 fluide. La pastille et les traits restent toujours à 1:1 px.

1. **Repos** : pas d'emplacement. La fenêtre de l'emplacement est masquée.
2. **Apparition** (glisser au-delà de 5 px) : 8 traits tracés depuis les coins (140 ms) et une croix au centre. Le format vide se lit immédiatement, même sur une photo.
3. **Approche** (de 240 à 60 px) : les traits se rapprochent en continu, de 10 à 6 px. L'utilisateur sent qu'il est « chaud » sans qu'aucun seuil ne soit encore franchi.
4. **Proche** (< 60 px) : verrouillage net. Écart de 2 px, traits rallongés de 7 à 10 px, croix effacée. Le changement est discret mais **binaire** : forme et position, sans couleur.
5. **Aimanté** : la pastille glisse vers sa place (100 ms), les traits claquent sur ses coins puis s'éteignent en deux crans. L'emplacement disparaît.
6. **Lâchée ailleurs** : les traits se rétractent vers les coins (120 ms). L'emplacement disparaît.

## 6. Pourquoi : 5 décisions et le besoin qu'elles servent
1. **Des traits doublés blanc et encre au lieu d'une zone pleine** → *Besoin : voir la place sur n'importe quel fond.* Au moins un des deux traits donne 4,1:1 sur tout fond, et le fond reste visible : aucun gris sale sur une photo.
2. **Aucune couleur** → *Besoin : ne pas confondre les signaux.* L'orange veut dire « enregistrement ». Le mettre sur l'emplacement mentait, et c'était la critique de Camille. Le verrou passe par la forme, ce qui le rend aussi lisible pour les daltoniens.
3. **Un resserrement continu, puis un verrou binaire** → *Besoin : savoir avant de lâcher.* Le continu guide la main, comme le cadre du télémètre. Le binaire répond à la question « si je lâche, ça colle ? ».
4. **Le claquement sur les coins** → *Besoin : confirmer que c'est fait.* Au contact, les traits prolongent exactement les bords de la pastille : elle est « au repérage ». C'est la seule animation accélérée, réservée à l'événement qui la mérite.
5. **Le format repéré prend la taille réelle de la pastille** → *Besoin : précision.* Un emplacement plus grand ou plus petit que la pastille mentirait sur le résultat. En « Écoute », le format s'élargit avec elle.

**Risques et parades**
| Risque | Parade |
|---|---|
| Trop discret ou « froid » pour une demande de quelque chose de « sympa » | Le plaisir vient de la réponse au geste (resserrement, puis claquement). Option : un « tic » de 30 ms via `sounds.ts` au claquement, désactivé par défaut. |
| Clignotement autour de 60 px | La quantification de `p` à 0,05 et une transition de 90 ms absorbent les oscillations. Ce que l'on voit reste identique à la règle de dépôt : on montre la vérité. |
| 60 messages par seconde de `main` vers la fenêtre | N'envoyer que si `p` ou `hot` change, soit au plus environ 21 appels `executeJavaScript` par approche. |
| Traits au-dessus de la pastille | `this.win.moveTop()` après l'affichage de l'emplacement. |
| Écran non Retina | Âme de 2 px et contour de 1 px, sur des pixels entiers : nets à 1x comme à 2x. |
| Fond rayé ou très chargé | Démo : bande rayée 4 px noir et blanc dans le thème « aplats vifs ». Le double trait reste lisible et la croix aide à trouver le centre. |

## 7. Intégration (src/main/overlay.ts, pour le développeur)
Le CSS et le JS de l'emplacement sont ceux de `demo-a.html` (bloc « EMPLACEMENT », copiable tel quel). Une fois lancé dans la fenêtre de l'emplacement, il expose `window.S` :
```js
S.show(w, h, p, hot)  // début du glisser : taille réelle de la pastille, proximité, verrou
S.p(p, hot)           // à chaque tick, seulement si (p, hot) change
S.snap()              // lâchée sous 60 px  → masquer la fenêtre 240 ms plus tard
S.out()               // lâchée ailleurs    → masquer la fenêtre 140 ms plus tard
```
Côté `main` :
- `RANGE = 240`. `p = round(clamp((RANGE − d) / (RANGE − MAGNET), 0, 1) × 20) / 20`.
- Remplacer `setSlotHot()` par `setSlotProximity(d)` (mémorise `${p}|${hot}` et n'envoie que s'il change).
- Taille de la pastille : `overlay.html` l'envoie au début du glisser (`dicta.drag('start', { w: pill.offsetWidth, h: pill.offsetHeight })`, preload à étendre, repli 40×30).
- `dragEnd()` lâchée près : `S.snap()`, glissement de la pastille en 6 images (16 ms, ease-out cubique) vers `overlayBounds()`, puis `slot.hide()` à 240 ms et `settings.set(POS_KEY, '')`. Si `systemPreferences.getAnimationSettings().prefersReducedMotion` est actif, pas de glissement.
- `dragEnd()` lâchée loin : `S.out()`, puis `slot.hide()` à 140 ms.
