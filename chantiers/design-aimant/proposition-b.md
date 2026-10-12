# Proposition B — « Socle mécanique »

> L'emplacement n'est pas une cible dessinée, c'est **une baie** : un socle noir plein, à rive blanche, creusé à l'empreinte exacte de la pastille. On ne la « dépose » pas, on l'**enclenche**, et ça fait clic.

Démo : `chantiers/design-aimant/demo-b.html` (ouvrir dans Chrome ou Safari, glisser la pastille ; flèches du clavier possibles).

---

## 1. Brief (5 lignes)

1. **Objectif** : remplacer le rectangle en pointillés orange par un emplacement aimanté que Camille trouve sympa et soigné.
2. **Cible** : utilisatrice francophone de CBW AI qui déplace sa pastille, souvent sans y penser, sur n'importe quel fond d'écran.
3. **Ton** : CBW Studio, suisse et brutaliste. Plein, net, mécanique, sans flou, halo, translucidité ni dégradé.
4. **Contraintes** : fenêtre de 520×64 max, non cliquable ; aimant à 60 px ; 3 états ; animations de 250 ms max, en CSS pur ; `prefers-reduced-motion`.
5. **Évident en 5 secondes** : *« ici, c'est sa place, et si je lâche maintenant, elle s'y enclenche »*.

**Hypothèses (écrites, pas inventées)**
- La pastille au repos fait **40×30**, avec 5 barres blanc · orange · bleu · vert · blanc (brief). Le fichier `design/overlay/overlay.html` du dépôt montre encore un repos en 44×16 avec 3 carrés. Je suis le brief. Toutes les cotes du socle dérivent de la pastille (+4 px de jeu, +12 px de parois), elles se recalculent donc si la pastille change.
- La fenêtre de l'emplacement et celle de la pastille ont les mêmes coordonnées (`overlayBounds`). Leurs centres coïncident donc au pixel près.
- Le « clic » se joue sur deux fenêtres (emplacement et pastille). Il faut une petite coordination dans `overlay.ts` (§7).
- Le son est optionnel et suit le réglage des sons existant (`sounds.ts`).

---

## 2. Références

| # | Référence | Ce que je retiens | Ce que je rejette |
|---|---|---|---|
| 1 | [Teenage Engineering TP‑7 (Domus)](https://domusweb.it/en/news/gallery/2023/05/19/teenage-engineerings-new-recorder-is-a-triumph-of-physical-skeuomorphism.amp.html) | Un **dictaphone** (notre métier) dont l'organe mécanique montre l'état ; le retour est physique, pas décoratif. | Le skeuomorphisme de matière (alu brossé, reflets). |
| 2 | [TE OP‑1 field](https://teenage.engineering/products/op-1) | Un châssis monochrome où la couleur n'apparaît que sur l'organe qui a un rôle, comme nos accents à rôle fixe. | Le gris aluminium clair, qu'on ne lirait pas sur un fond clair. |
| 3 | [TE field system](https://teenage.engineering/products/field-system) | Des objets au même gabarit qui s'emboîtent en système : la cavité est au **gabarit exact** de la pastille. | La multiplication des modules. |
| 4 | [Braun ET66, V&A](https://collections.vam.ac.uk/item/O1360553) | Une couleur = une fonction (le jaune pour « égal »). Le socle n'utilise **aucun** accent, puisqu'il n'est ni enregistrement, ni IA, ni succès. | Les touches convexes et la rondeur. |
| 5 | [Dieter Rams, Design Museum](https://designmuseum.org/designers/dieter-rams) | « Moins, mais mieux » : deux matières seulement (noir doux, blanc), aucune ornementation. | La nostalgie Braun citée telle quelle. |
| 6 | [Brevet Nintendo US5669781, mécanisme de connexion de cartouche](https://patents.google.com/patent/US5669781) | Un guide d'insertion puis un **organe d'engagement à clic**, d'où nos 4 griffes qui se ferment cran par cran. | Toute représentation littérale d'une fente ou d'un connecteur. |
| 7 | [Game Pak (Wikipedia)](https://en.wikipedia.org/wiki/Game_Pak) | Une fente ne reçoit qu'un objet, d'où la cavité qui porte **l'empreinte des 5 barres**. | L'iconographie rétro-gaming. |
| 8 | [Playdate Stereo Dock (Yanko)](https://www.yankodesign.com/?p=486298) | Le dock est un socle plein qui reçoit l'objet, et l'objet se clipse dessus. | Le jaune vif décoratif. |
| 9 | [Analogue Pocket (Wallpaper)](https://www.wallpaper.com/technology/analogue-pocket-gaming-review) · [critique du logement](https://retrododo.com/?p=15581) | Le logement est un plateau assumé. | La fente sans parois, critiquée comme instable : notre socle a des **parois** (rive blanche) et des **griffes**. |
| 10 | [Nothing Phone (3), Glyph Matrix](https://design-milk.com/the-nothing-phone-3s-glyph-matrix-turns-notifications-into-pixel-art/) | Un signal par **paliers discrets** plutôt que par fondus, d'où les animations en `steps()`. | Le dos transparent, puisque la translucidité est interdite. |
| 11 | [HARDSTOP, système de boutons brutaliste](https://superdesign.dev/library/hardstop-buttons-with-a-spine-a-brutalist-button-system) | « Enfoncé » veut dire que l'ombre dure s'écrase. Notre tassement fait passer l'ombre de 3 à 1 puis 0 px. | Les bordures de 3 à 4 px partout et les couleurs acides. |
| 12 | [Rauno Freiberg, Invisible Details of Interaction Design](https://rauno.me/craft/interaction-design) · [« Fidgetability »](https://designlobster.substack.com/p/150-fidgetability) | Ce qui « s'emboîte et clique » rassure. Un geste doit rester **interruptible** : reprendre la pastille pendant le clic annule tout proprement. | Les micro-effets gratuits. |
| 13 | [Pavage des fenêtres de macOS Sequoia (9to5Mac)](https://9to5mac.com/2024/06/13/use-automatic-window-tiling-macos-sequoia/) | La cible apparaît pendant le glisser, à sa vraie taille, et c'est tout. | **Anti-référence** : l'aperçu translucide et flou, exactement ce que Camille n'aime pas. |
| 14 | Skill ui-ux-pro-max : styles *Neubrutalism* (#38) et *Tactile Digital* (#60) | Ombre dure sans flou, coins à 0, retour immédiat comme un interrupteur physique. | `scale(.95)` avec rebond `cubic-bezier(.34,1.56,…)` : le rebond est interdit hors des toggles (DESIGN.md §6). |

Clichés évités : pas de dégradé violet, pas de verre, pas de halo, pas de pointillés, pas d'orange hors enregistrement.

---

## 3. Concept

**Une phrase** : *la pastille est une cartouche et son emplacement une baie ; on la voit sortir, se verrouiller, puis s'effacer sous l'objet.*

Conséquences :
- **Ton** : un objet, pas un signal. Le socle est **plein et opaque**, comme un bloc de matière. Il ne clignote pas et ne pulse pas.
- **Image** : le socle noir doux, sa rive blanche de 2 px, son ombre dure, une cavité au gabarit de la pastille avec l'empreinte de ses 5 barres, et 4 griffes en équerre.
- **Mouvement** : **par crans** (`steps()`), jamais en fondu mou. Le socle sort en 3 crans, les griffes se ferment en 2 crans, et l'enclenchement suit 4 temps : course, choc, tassement, retrait. Aucun rebond.
- **Couleur** : aucune. Seuls le noir doux et le blanc. La couleur reste à la pastille, qui en a le rôle.

---

## 4. Système

### 4.1 Cotes (px, échelle de 2 et 4)

```
fenêtre 520×64, centre commun avec la pastille

   ┌─                    ─┐    griffes : équerres de 10 px
       ██████████████████         à 6 px du filet (apparition), 2 px (proche)
       █┌──────────────┐█▓     socle 56×46 : corps #1E1E1C, rive blanche 2 px,
       █│   ▮ ▮ ▮ ▮ ▮  │█▓       filet noir 1 px, ombre dure 3 px (▓)
       █└──────────────┘█▓     cavité 44×34 : #2C2D31 + empreinte des 5 barres
       ██████████████████▓
        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   └─                    ─┘
```

| Élément | Valeur |
|---|---|
| Pastille (repos) | 40×30, `#1C1C1E`, liseré 1 px `rgba(255,255,255,.25)` (inchangée) |
| Cavité | **44×34** (pastille + 2 px de jeu de chaque côté), centrée |
| Socle | **56×46** (cavité + 6 px de paroi), bordure **2 px `#FFFFFF`** (la rive) |
| Filet extérieur | 1 px `#1E1E1C` (`box-shadow: 0 0 0 1px`) : il détache la rive blanche d'un fond clair |
| Ombre dure | `3px 3px 0 1px #1E1E1C` (décalage de 3 px au-delà du filet), sans flou |
| Empreinte | 5 barres de 3 px, espacées de 2 px, hautes de 6 / 10 / 14 / 10 / 6 px, comme celles de la pastille |
| Griffes | 4 équerres de 10 px de bras, trait blanc de 2 px sur trait noir de 4 px (1 px de contour noir) |
| Écart des griffes | apparition **6 px**, proche **2 px** (mesuré depuis le filet) |
| Encombrement vertical | 23 + 1 + 6 + 2 = **32 px** depuis le centre, soit exactement la demi-hauteur de la fenêtre de 64 px |

### 4.2 Palette (opaque uniquement)

| Rôle | Hex | Contraste | Usage |
|---|---|---|---|
| Corps du socle | `#1E1E1C` (noir doux) | blanc/noir **16,7:1** | bloc, filet, ombre dure |
| Rive | `#FFFFFF` | sur le corps : 16,7:1 | bordure de 2 px, griffes, empreinte à l'état « proche » |
| Fond de cavité | `#2C2D31` (fond-3 sombre) | blanc dessus : **13,8:1** | creux |
| Fil de cavité / empreinte au repos | `#55565B` (fil-fort sombre) | sur `#2C2D31` : 1,9:1 | gravure **décorative** volontairement discrète ; l'info « proche » passe par le blanc (13,8:1) et par les griffes |

**Lisible sur tout fond** grâce au sandwich noir / blanc / noir. Quel que soit le fond, l'un des deux bords (blanc ou `#1E1E1C`) offre au moins **4:1**, au-delà du minimum WCAG 1.4.11 (3:1, éléments non textuels). Les trois cas extrêmes :
- fond blanc : le corps et le filet noirs ressortent (16,7:1) ;
- fond noir : la rive et les griffes blanches ressortent ;
- fond gris moyen ou photo : les deux bords coexistent sur 2 à 3 px, donc l'un des deux ressort toujours.

**Aucun accent.** L'orange est réservé à l'enregistrement, le bleu à l'IA, le vert au succès. L'emplacement n'est aucun des trois.

### 4.3 Mouvement

| Moment | Ce qui bouge | Durée | Courbe | Crans |
|---|---|---|---|---|
| **Apparition** | le socle sort de sous la pastille : 48×38 → 52×42 → 56×46, ombre 1 → 2 → 3 px | 120 ms | `steps(1,end)` par segment | 3 crans de 40 ms |
| | les griffes apparaissent, ouvertes ou fermées selon la distance | à 120 ms | `steps(1,end)` | 1 cran |
| **Proche** (< 60 px) | griffes : écart 6 → 4 → 2 px ; empreinte : `#55565B` → `#FFFFFF` | 80 ms | `steps(2,end)` | 2 crans (« cric-crac ») |
| Retour hors du rayon | les griffes se rouvrent, l'empreinte redevient grise | 80 ms | `steps(2,end)` | 2 crans |
| **Aimanté** : course | la pastille rejoint sa place | 0 → 80 ms | `cubic-bezier(.6,0,1,1)` (elle accélère, happée par le loquet) | dans l'app, 5 pas de `setBounds` de 16 ms |
| choc | la pastille passe à `scale(.92)` en 25 ms ; l'ombre du socle passe de 3 à 1 px (tassement) | 80 → 105 ms | `cubic-bezier(.5,0,1,1)` | |
| relâche | la pastille revient à `scale(1)`, sans dépassement | 105 → 250 ms | `cubic-bezier(.16,1,.3,1)` (`--ease-sortie`) | |
| retrait | le socle rentre : 50×40 avec ombre à 0 (190 ms), puis disparaît (220 ms) ; les griffes disparaissent à 190 ms | 190 → 250 ms | `steps(1,end)` | 2 crans |
| **Lâchée ailleurs** | le socle rentre : 52 → 48 puis disparaît, sans clic | 90 ms | `steps(1,end)` | 2 crans |

Total de l'enclenchement : **250 ms**, la limite du brief. Les seules propriétés animées sont la taille d'un bloc de 56 px (3 à 4 calculs de mise en page au total, négligeable), `box-shadow`, `translate`, `scale` et `opacity`.

**`prefers-reduced-motion`** : aucun cran de taille, aucune course, aucune compression. Le socle apparaît d'un coup ; les griffes sautent directement en position fermée et l'empreinte passe au blanc, donc l'état « proche » reste lisible sans mouvement. À l'enclenchement, la pastille est posée immédiatement, le socle reste **tassé** (ombre à 1 px) pendant **160 ms**, puis disparaît. Changement d'état, pas de mouvement.

**Son (optionnel, avec le réglage « Sons »)** : un « clic-clac » de deux transitoires de bruit filtré (passe-bande à 3,6 puis 2,4 kHz), 6 ms chacune, espacées de 14 ms, gain de 0,5 puis 0,35, joué à 80 ms, au moment du choc. Il est activable dans la démo.

### 4.4 Interactions et robustesse

- **Interruptible** : si on reprend la pastille pendant l'enclenchement ou le retrait, les minuteries sont annulées et le socle repart de l'état « apparition » sans saut.
- **Pas d'hystérésis visuelle** : le seuil est 60 px, pour l'affichage comme pour l'aimant. Si « proche » était affiché à 64 px, ce serait mentir.
- **Au début du glisser**, la pastille est encore dans le rayon. Les griffes apparaissent donc *fermées*, puis s'ouvrent en 2 crans quand on s'éloigne. On sent le **déverrouillage**, et ça raconte la même histoire.
- Fenêtre non cliquable (`setIgnoreMouseEvents(true)`), inchangé.

---

## 5. États (écrans clés)

Contexte : surcouche macOS, pas de version mobile du produit. La démo, elle, s'adapte jusqu'à 360 px.

**0. Repos.** Rien n'est affiché. La pastille est à sa place, 5 px au-dessus du Dock.

**1. Apparition** (début du glisser, dès 5 px de déplacement)
```
        ┌─         ─┐
          ┌───────┐
          │ ┌───┐ │▓        ← sort en 3 crans de sous la pastille
          │ │▮▮▮│ │▓          empreinte grise #55565B
          │ └───┘ │▓
          └───────┘▓
        └─ ▓▓▓▓▓▓▓ ─┘       griffes à 6 px
```

**2. Proche** (< 60 px, centre à centre)
```
          ┌───────┐
         ┌┤ ┌───┐ ├┐        ← griffes à 2 px, fermées en 2 crans
          │ │███│ │▓          empreinte blanche : « contacts prêts »
          │ └───┘ │▓
         └┤───────├┘
           ▓▓▓▓▓▓▓
```
Ce qui reste visible même si la pastille couvre la cavité : les 4 griffes et la rive. L'information ne dépend pas d'une zone que la pastille peut cacher.

**3. Aimanté** (lâchée dans le rayon) : course de 80 ms, choc et tassement, relâche, puis le socle rentre sous la pastille. Il ne reste que la pastille, à sa place.

**3 bis. Lâchée ailleurs** : le socle rentre en 2 crans (90 ms), sans clic. La pastille reste où on l'a posée.

---

## 6. Pourquoi : 5 décisions

1. **Un socle plein plutôt qu'un contour.** Besoin : *reconnaître la place sur n'importe quel fond.* Un trait seul disparaît sur une photo chargée, alors qu'un bloc opaque à rive blanche et filet noir passe partout sans halo ni translucidité.
2. **Une cavité au gabarit, avec l'empreinte des 5 barres.** Besoin : *comprendre sans texte que c'est la place de la pastille.* La forme en creux nomme l'objet attendu.
3. **Des griffes qui se ferment, plutôt qu'un changement de couleur.** Besoin : *savoir que si je lâche maintenant, ça prend.* Le signal est géométrique (l'écart passe de 6 à 2 px) et il reste visible quand la pastille masque le centre. Il ne pique aucun accent (Camille a rejeté l'orange) et reste lisible sans couleur, donc pour les daltoniens.
4. **Des crans (`steps()`) au lieu de fondus.** Besoin : *une sensation tangible et satisfaisante.* Un mécanisme avance par crans ; c'est ce qui distingue « mécanique » de « délire ». C'est aussi plus court et plus net.
5. **Le socle disparaît sous la pastille.** Besoin : *qu'une fois posée, il ne reste rien à l'écran.* La disparition prolonge le geste (la baie se referme) au lieu d'un fondu qui laisserait une trace.

### Risques et parades

| Risque | Parade |
|---|---|
| Un bloc noir de 56×46 sur le bureau peut paraître lourd. | Il n'existe que pendant le glisser et fait 60 px de large au total. Sur fond sombre, seules la rive et les griffes se voient. |
| Les crans à 40 ms peuvent paraître saccadés sur un écran à 60 Hz. | 40 ms font 2 à 3 images par cran, ce qui reste perceptible et voulu. On peut réduire à 2 crans de 50 ms si besoin. |
| Coordonner deux fenêtres pour le clic. | La fenêtre de l'emplacement porte son propre minutage, avec un délai interne de 80 ms. `overlay.ts` lance les deux au même instant et masque à 260 ms (§7). |
| Animer la taille déclenche des calculs de mise en page. | Un seul bloc de 56 px, au plus 4 calculs par geste. Sinon, on peut passer à `clip-path`. |
| Le son peut agacer. | Il est désactivé si les sons de l'app sont coupés, et ne joue qu'à l'enclenchement, jamais au survol ni pendant le glisser. |

---

## 7. Intégration dans l'app (sans toucher au reste)

**Fenêtre de l'emplacement** (`slotWindow()` dans `src/main/overlay.ts`) : remplacer le HTML `data:` par le bloc `SOCLE` de `demo-b.html` (CSS de `.slot`, `.socle`, `.cavite`, `.griffe` et keyframes), avec les classes portées par `body` :

| Classe | Quand | Effet |
|---|---|---|
| `on` | `dragStart` (remise à zéro puis ajout, pour relancer l'animation) | apparition |
| `hot` | `setSlotHot(true)` (nom actuel conservé) | griffes fermées, empreinte blanche |
| `seat` | `dragEnd` lâchée dans le rayon | course, choc, tassement, retrait (250 ms) |
| `out` | `dragEnd` lâchée hors du rayon | retrait (90 ms) |

**Séquence `dragEnd`, dans le rayon** :
1. `slot` : ajouter `seat`.
2. Pastille : 5 appels à `setBounds` espacés de 16 ms, de la position actuelle vers `home` (interpolation `t²`).
3. À 80 ms, `win.webContents.executeJavaScript('window.seat&&window.seat()')`.
4. À 260 ms, `slot.hide()`, puis `resetPosition()` (déjà appelé : il faut juste le décaler après la course).
5. Hors du rayon : ajouter `out`, puis `hide()` à 100 ms.

Si `dragStart` arrive pendant ces 260 ms, on annule les minuteries et on remet `on`.

**Pastille** (`design/overlay/overlay.html`), deux ajouts :
```css
#pill.seat { animation: seat 170ms both; }
@keyframes seat {
  0%   { scale: 1;   animation-timing-function: cubic-bezier(.5,0,1,1); }
  15%  { scale: .92; animation-timing-function: cubic-bezier(.16,1,.3,1); }
  100% { scale: 1; }
}
@media (prefers-reduced-motion: reduce) { #pill.seat { animation: none; } }
```
```js
window.seat = function () { pill.classList.remove('seat'); void pill.offsetWidth; pill.classList.add('seat'); };
```
(`scale` est une propriété indépendante : elle ne gêne ni `transform`, ni la secousse d'erreur sur `translate`.)

---

## 8. Pourquoi cet axe plutôt que les deux autres

- **Face à un emplacement « fantôme »** (contour fin, filet, marque discrète) : sur une photo chargée, il se perd, et il n'offre **aucune sensation d'arrivée**. Camille veut du *sympa* ; un trait n'est pas sympa, il est neutre.
- **Face à un aimant « champ / attraction »** (onde, ressort, aspiration élastique) : on retombe dans le halo et le rebond que Camille et DESIGN.md refusent, et dans le « délire ».
- **Le socle** est le seul des trois à être un *objet* : il a une forme lisible sans couleur, un geste qui finit par un clic, et un vocabulaire (aplat noir, rive blanche, ombre dure, coins carrés) pris tel quel dans la charte CBW. C'est la charte appliquée à un geste, pas un effet ajouté.
