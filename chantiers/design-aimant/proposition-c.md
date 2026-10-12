# Proposition C : « Silhouette vivante »

Démo : `chantiers/design-aimant/demo-c.html` (autonome, à ouvrir dans un navigateur).

## 1. Brief

- **Objectif** : pendant le glisser, montrer où la pastille revient et confirmer qu'elle s'est collée.
- **Cible** : Camille et les utilisateurs francophones de CBW AI, sur macOS, avec n'importe quel fond d'écran.
- **Ton** : sympa et soigné, dans la charte CBW (coins carrés, traits, aplats, accents à rôle fixe). Pas de pointillés, de halo, de flou ni de translucidité.
- **Contraintes** : fenêtre 520×64, insensible à la souris, animations de 250 ms max, CSS pur et `prefers-reduced-motion` respecté.
- **Ce qu'on doit comprendre en 5 secondes** : « c'est la place de ma pastille, elle se remplit quand j'approche, je lâche et c'est vert ».

Hypothèses :
- Je suis le brief pour la pastille au repos : 40×30, cinq barres blanc, orange, bleu, vert, blanc. Le fichier `overlay.html` du dépôt montre encore un repos à 44×16 avec trois carrés, je considère donc qu'il est en retard sur la version installée.
- Les hauteurs de repos des barres reprennent la silhouette du logo : 6/10/14/10/6 px, de largeur 3 px avec 2 px d'écart. La barre bleue utilise `#5A67FF`, le bleu éclairci que l'overlay emploie sur fond encre.
- Le processus principal connaît la position de la pastille pendant le glisser (`bridge('drag', …)`) et peut transmettre la distance à la fenêtre de l'emplacement.

## 2. Références

| # | Référence | Ce que je retiens | Ce que je rejette |
|---|---|---|---|
| 1 | [Teenage Engineering EP-133 K.O. II](https://teenage.engineering/products/ep-133), écran « super segment » ([MusicTech](https://musictech.com/news/gear/teenage-engineering-ep-133-k-o-ii-sampler-sequencer-composer/)) | Les segments éteints restent visibles. C'est l'idée de base : la forme existe avant d'être allumée. | La teinte LCD rétro et le pastiche de jeu électronique |
| 2 | [Nothing Glyph Matrix, progression en direct](https://9to5google.com/2025/07/01/heres-what-you-can-do-with-nothing-phone-3-new-glyph-matrix/) | Une lumière qui se remplit à mesure qu'un VTC approche : **la distance devient un remplissage**. C'est exactement le mécanisme que je veux. | La matrice de points et le rendu « LED » |
| 3 | Vumètre à segments LED ([brevet US4532472](https://patents.google.com/patent/US4532472)) | Remplissage du bas vers le haut, lu sans effort, avec des segments au contour net | Les gradations vert/jaune/rouge, qui entreraient en conflit avec les rôles CBW |
| 4 | [Apple HIG, Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) | Le retour doit être « clair et continu » tout au long du geste, pas seulement au survol de la cible. | L'image de glisser translucide |
| 5 | [Things 3, Magic Plus](https://culturedcode.com/things/support/articles/2803582) | La cible annonce l'endroit exact où l'objet va atterrir, et le dépôt est immédiat. | Le ressort et le rebond |
| 6 | [Atlassian Pragmatic drag and drop, indicateur](https://www.jsdelivr.com/package/npm/@atlaskit/pragmatic-drag-and-drop-react-drop-indicator) | L'indicateur montre la position finale exacte, d'un trait. | Le bleu générique de sélection |
| 7 | [Semrush Intergalactic, drag and drop](https://developer.semrush.com/intergalactic/components/drag-and-drop/drag-and-drop) | Contre-exemple : bordure en pointillés et fond teinté au survol. C'est précisément ce que Camille n'aime pas. | Tout le motif |
| 8 | [Framer, Animated Dropzone](https://www.framer.com/marketplace/components/animated-dropzone/) | Il y a un état de succès distinct de l'état de survol. | L'agrandissement, la teinte et la pulsation |
| 9 | Rauno Freiberg, « Invisible Details » et la notion de « fidgetability » ([Design Lobster](https://designlobster.substack.com/p/150-fidgetability), [devouringdetails.com](https://devouringdetails.com)) | Une interaction qu'on a envie de rejouer : on approche, ça se remplit, on recule, ça se vide. | La démonstration pour elle-même |
| 10 | SenseGlove, zone de dépôt précise ([doc](https://unity.docs.senseglove.com/_sources/Components/PrecisePlaceZone.rst.txt)) | Un aimant qui n'agit que sous un seuil de distance, avec un état « armé » | Le lissage long, propre au jeu |
| 11 | [Linear](https://linear.app) | Changements d'état en 120 à 200 ms, filets de 1 px, aucun décor : la sobriété des états | Le gris sur gris à faible contraste |
| 12 | [Teenage Engineering OP-1 field](https://teenage.engineering/products/op-1) | Des couleurs franches à rôle fixe, sur fond noir | L'illustration ludique, hors charte |

Je laisse volontairement de côté trois clichés : le dégradé violet, les cartes en verre et le halo de « zone chaude ».

## 3. Concept

**La place a la forme de la pastille, et elle se remplit à mesure qu'on s'en approche.**

Conséquences :
- **Image** : l'emplacement est une empreinte de la pastille, une plaque encre dont les cinq barres sont dessinées en creux, au trait. Les deux objets parlent la même langue et aucun signe nouveau n'apparaît à l'écran.
- **Mouvement** : la distance pilote directement le remplissage des barres, du bas vers le haut, à commencer par la barre centrale. L'animation suit la main ; elle ne joue pas toute seule.
- **Ton** : c'est ludique parce que c'est réactif (on joue avec la jauge), pas parce que c'est décoré. Le seul instant « fête » est le signal vert final, bref, dans son rôle de succès.

## 4. Système

### Géométrie (grille de 4 px)
- Fenêtre : 520×64, centrée sur la position par défaut de la pastille, `setIgnoreMouseEvents(true)`.
- **Empreinte** : 48×38, soit la pastille 40×30 plus 4 px de marge de chaque côté. Les deux centres sont confondus. Une fois posée, la pastille couvre exactement le centre de l'empreinte et ses barres tombent pile sur les barres fantômes, comme un repérage d'imprimerie.
- **Barres fantômes** : 5 barres de 3 px, 2 px d'écart (23 px au total), centrées verticalement comme dans la pastille. Hauteurs de repos 6/10/14/10/6, hauteurs « proche » 12/14/16/14/12.

### Couleurs et contrastes (WCAG 1.4.11, objets graphiques ≥ 3:1)
| Rôle | Valeur | Contraste |
|---|---|---|
| Plaque | `#1C1C1E` (encre) | 16:1 sur clair ; 5,5:1 sur orange ; 3,7:1 sur un bleu de fond `#2F6FEB` |
| Trait de la plaque (repos) | 1 px `#B8B8B4`, intérieur (`inset 0 0 0 1px`, sans flou) | 8,6:1 sur la plaque ; 3,3:1 même sur `#2B3BFF` saturé |
| Trait des barres fantômes | 1 px `#8C8C88`, intérieur | 5,0:1 sur la plaque |
| Trait « proche » | 2 px `#FFFFFF`, intérieur | 17:1 sur la plaque |
| Remplissage des barres | `#FFFFFF`, `#FF5A1F`, `#5A67FF`, `#1FD26A`, `#FFFFFF` (les couleurs de la pastille) | 17 ; 5,5 ; 3,9 ; 8,5 ; 17:1 sur la plaque |
| Succès | plaque `#1FD26A` et liseré 1 px `#1C1C1E` | encre sur vert 8,5:1, ce qui tient aussi sur un fond vert ou blanc |

Règle de lisibilité : sur n'importe quel fond, au moins un des deux bords dépasse 3:1. La plaque encre se détache des fonds clairs et vifs, le trait clair des fonds sombres et saturés. Il n'y a aucune transparence partielle.

### Mouvement
Courbes : `--ease-sortie` `cubic-bezier(.16,1,.3,1)` pour les entrées, `--ease-rideau` `cubic-bezier(.7,0,.15,1)` pour les fermetures, `--ease` `cubic-bezier(.2,.7,.2,1)` pour les couleurs. Aucune animation ne tourne en boucle.

**Jauge de distance.** Soit `d` la distance en px entre le centre de la pastille et le centre de l'empreinte.
- `p = clamp((260 − d) / 200, 0, 1)` : le remplissage commence à 260 px et il est complet à 60 px.
- Barre `i` : `f_i = clamp((p − o_i) / 0,7, 0, 1)`, avec `o = 0,30 / 0,15 / 0 / 0,15 / 0,30`. La barre centrale part la première, puis les autres s'allument vers l'extérieur.
- Rendu : `transform: scaleY(f_i)`, origine en bas, transition linéaire de 70 ms pour lisser les à-coups du pointeur. Seuls `transform` et `opacity` sont animés.

## 5. États

| État | Déclencheur | Rendu | Durée / courbe |
|---|---|---|---|
| **Apparition** | début du glisser (au-delà de 4 px) | La plaque monte comme un store : `clip-path inset(100% 0 0 0) → inset(0)`. Puis les barres fantômes se tracent (`scaleY 0 → 1`) en partant du centre. Ensuite, la jauge suit la distance. | Plaque 200 ms ease-sortie ; barres 140 ms, délais 60/80/100 ms. Total 240 ms. |
| **Proche** | `d < 60` **et** emplacement armé | Les barres sont pleines. Le trait passe à 2 px blanc et les barres se dressent (12/14/16/14/12), en partant du centre. Ça signifie « lâche, je te prends ». | Trait 120 ms ease ; hauteurs 160 ms ease-sortie, délais 0/25/50 ms |
| **Aimanté** | lâchée avec `d < 60` | 1. La pastille glisse au centre. 2. La plaque passe au vert `#1FD26A` avec un liseré encre de 1 px : on voit un cadre vert de 4 px autour de la pastille, c'est le signal « terminé ». 3. Le cadre se resserre sous la pastille (`clip-path inset(0) → inset(4px)`) et disparaît. | Glisse `min(180, 60 + 2d)` ms ease-sortie ; vert instantané, tenu 160 ms ; fermeture 140 ms ease-rideau. Chaque segment fait 250 ms au plus. |
| Lâchée ailleurs | relâchée avec `d ≥ 60` | La jauge se vide, puis la plaque redescend (store inverse). La pastille reste où elle est. | Vidage 120 ms ; plaque 160 ms ease-rideau, plus rapide que l'entrée |

**État armé.** Si le glisser part de la place par défaut, `d` vaut environ 0 au départ. L'empreinte apparaît alors pleine, sans trait blanc ni barres dressées. Elle devient « armée » dès que `d > 60` une première fois. Si l'on relâche sans avoir quitté la zone, la pastille se recale sans signal vert : un retour sur place n'est pas un succès. Quand on éloigne la pastille, la jauge se vide derrière elle : la place « attend ».

**prefers-reduced-motion.**
- Pas de store, pas de tracé, pas de glisse : tout est instantané.
- La jauge passe en mode discret : chaque barre est allumée ou éteinte (`f_i ≥ 0,5`), sans transition d'échelle.
- Le signal vert est conservé, car c'est un changement de couleur et non un mouvement. Il est tenu 400 ms, puis l'empreinte disparaît d'un coup.

## 6. Pourquoi ces choix

1. **L'empreinte reprend la forme de la pastille**, au lieu d'un rectangle générique. L'utilisateur reconnaît sa pastille sans apprendre de nouveau signe : la place est une copie à vide.
2. **La distance pilote le remplissage.** On sait à tout moment si l'on se rapproche, avant même le seuil de 60 px. Le retour est continu (HIG) et non binaire comme l'actuel « chaud / froid ».
3. **Pas d'orange pour « proche ».** L'orange veut dire « enregistrement ». Le mettre sur un emplacement fait croire que le micro est ouvert. « Proche » s'exprime par une forme (trait de 2 px, barres dressées) et non par un accent.
4. **Le vert seulement à l'aimantation**, dans son rôle « terminé », avec un liseré encre pour rester lisible sur un fond vert ou blanc. C'est la confirmation que le geste a réussi.
5. **Une plaque encre opaque avec un trait clair** plutôt que des pointillés sur fond translucide. C'est lisible sur tout fond sans halo ni flou : la plaque porte le contraste sur les fonds clairs, le trait sur les fonds sombres.

**Face aux deux autres axes.** Un emplacement plus neutre (cadre seul) est plus discret, mais il ne dit ni où l'on en est ni pourquoi c'est là. Un emplacement plus démonstratif ajoute du signe là où la pastille en a déjà un. Ici, l'emplacement n'invente rien : il réutilise l'identité existante, il est réactif sans animation autonome, et il est sympa sans décor.

**Risques et parades.**
- *Confusion avec une seconde pastille.* L'empreinte est plus grande (48×38), ses barres sont creuses au repos et elle n'a pas d'ombre. Elle n'apparaît que pendant le glisser.
- *Barres de 3 px en creux, avec un vide intérieur de 1 px.* Sur un écran Retina, cela fait 6 px physiques avec 2 px de trait, ce qui reste lisible. Si le test sur un écran non Retina déçoit, on passe la plaque à 52×42 et les barres à 4 px, mais on perd alors le repérage exact.
- *Coût IPC de la jauge.* On envoie au plus une distance par image (rAF côté overlay, throttle de 16 ms) vers la fenêtre de l'emplacement : `window.setSlot({ state, distance })`. Seuls `transform` et `clip-path` sont animés, sur cinq éléments.
- *Fond vert vif.* Le vert de succès s'y fond, mais le liseré encre de 1 px et la pastille au centre gardent le cadre lisible.

## 7. Intégration (pour le développeur)
- Fenêtre de l'emplacement : HTML statique, avec l'empreinte et les cinq barres en `<span>` contenant chacune un `<i>` de remplissage. API : `setSlot({ state: 'in' | 'near' | 'snap' | 'out', distance })`. L'état armé est calculé côté processus principal.
- Seuils : `SNAP = 60`, `FAR = 260` (px, en coordonnées écran).
- La pastille elle-même n'est pas modifiée.
- Le code de référence est dans `demo-c.html`, fonctions `setFill`, `update` et `release`.
