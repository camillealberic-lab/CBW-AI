# Brief — emplacement aimanté de la pastille (CBW AI)

## Contexte
La pastille CBW AI (fenêtre flottante, `design/overlay/overlay.html`) est collée en bas au centre de l'écran, à 5 px du bas (ou 5 px au-dessus du Dock). On peut la glisser ailleurs ; pendant le glisser, un **emplacement aimanté** apparaît à sa place par défaut. Lâchée à moins de 60 px, elle s'y colle.

Pastille au repos : rectangle `#1C1C1E` 40×30 px, coins carrés, liseré 1px rgba(255,255,255,.25), 5 barres verticales blanc · orange · bleu · vert · blanc. Survol : 220×38 px.

## Ce que Camille n'aime pas (version actuelle)
Rectangle 44×30 en **pointillés blancs** 2px + fond gris translucide ; « chaud » (< 60 px) = bordure **orange** + fond orange translucide + **halo** (box-shadow 6px). Elle n'aime ni le « délire », ni la couleur, ni l'animation. Elle veut quelque chose de **sympa**, soigné.

## Contraintes (design/cbw/DESIGN.md — langage CBW Studio)
- Suisse / brutaliste, coins carrés, traits plutôt qu'ombres, **pas de flou, pas de halo, pas de translucidité, pas de dégradé**. Ombre dure décalée autorisée avec parcimonie.
- Couleurs : noir doux #1E1E1C / encre #1C1C1E, blanc, gris #F4F4F2 ; accents à rôle fixe : orange #FF5A1F = enregistrement, bleu #2B3BFF = traitement/IA, vert #1FD26A = terminé/succès. Pas d'accent décoratif.
- Typo : Archivo (grotesque condensée), JetBrains Mono pour les labels.
- Doit rester lisible sur **n'importe quel fond d'écran** (clair, sombre, photo) — c'est une fenêtre transparente au-dessus du bureau.
- Fenêtre de l'emplacement : 520×64 px max, pastille centrée ; non cliquable (ignore la souris).
- 3 états : **apparition** (début du glisser), **proche** (< 60 px, va s'aimanter), **aimanté** (lâchée dedans → pastille se pose, emplacement disparaît). + respecter `prefers-reduced-motion`.
- Animations courtes (≤ 250 ms), CSS pur.

## Livrable de chaque designer
1. `proposition-<a|b|c>.md` : intention, références, specs (tailles, couleurs, timings, courbes) pour les 3 états.
2. `demo-<a|b|c>.html` autonome (aucune dépendance externe sauf Google Fonts Archivo/JetBrains Mono) : un faux bureau 16:10 avec 3 fonds au choix (clair, sombre, photo/couleurs vives en aplats), le Dock, la pastille **glissable à la souris** et l'emplacement avec les 3 états fonctionnels (aimant à 60 px). Fidèle à la pastille réelle.
