# Dicta AI — identité visuelle

## Logo

**Variante retenue : A « Capsule »** — cinq barres verticales symétriques (hauteurs 240 / 400 / 560 / 400 / 240 sur une grille 1024), extrémités entièrement arrondies (pilules).

Pourquoi :
- La silhouette globale des cinq barres dessine une **capsule de micro** sans jamais montrer un micro : on lit à la fois « onde sonore » et « grille de micro ».
- Symétrie = calme, neutralité. Dicta corrige la parole, il n'en rajoute pas : le signe est posé, pas nerveux.
- Cinq barres de 2 px avec 1 px d'écart tiennent pile dans une icône de barre de menus 16 px, ce qui donne une famille cohérente de l'icône d'app au tray.

Variantes explorées (dans `design/brand/`) :
- **B « Trio »** — 3 barres larges. Très lisible, mais plus générique (proche de nombreux logos audio) et perd l'évocation de capsule.
- **C « Onde »** — 5 barres asymétriques à opacité dégressive. Plus dynamique, mais l'asymétrie et les transparences supportent mal le monochrome et les petites tailles.

Fichiers :
| Fichier | Usage |
|---|---|
| `assets/logo.svg` | Icône d'app (fond carré arrondi macOS, viewBox 1024) |
| `assets/icon.png` | Même icône en 1024×1024 pour electron-builder |
| `assets/logo-mark.svg` | Symbole seul, fond transparent, couleur `primary` |
| `assets/tray/*Template*.png` | Icônes de barre de menus (templates macOS) |

### Icônes de barre de menus
Images *template* (noir + alpha ; macOS les teinte selon le thème). Grille 16 pt, barres de 2 pt, écart 1 pt.
- `trayTemplate` — **repos** : capsule symétrique (4 / 8 / 12 / 8 / 4).
- `trayRecordingTemplate` — **enregistrement** : barres hautes et irrégulières (8 / 14 / 10 / 16 / 6), une onde vivante.
- `trayBusyTemplate` — **transcription / nettoyage** : cinq points alignés, opacité dégressive depuis le centre (« … »).
Côté Electron : `nativeImage.createFromPath('assets/tray/trayTemplate.png')` + `image.setTemplateImage(true)` ; le `@2x` est chargé automatiquement.

### Règles d'usage
- Zone de protection autour du symbole : au moins la largeur d'une barre.
- Taille minimale du symbole seul : 16 px de haut.
- Sur fond clair : symbole `primary` ; sur fond sombre ou photo : symbole blanc.
- Ne pas : ajouter un micro, contourner les barres, changer leur ordre/hauteurs, mettre des angles droits, déformer, ajouter des ombres portées ou d'autres couleurs que celles de la palette.
- Le nom s'écrit **Dicta AI** (pas « DictaAI », pas « Dicta Ai »).

## Palette

Dégradé de l'icône : `#6B5CFF` → `#3A2BD6` (haut → bas).

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `primary` | `#4B3CF0` | `#8579FF` | Marque, actions principales, focus |
| `primary-hover` | `#3A2BD6` | `#9C92FF` | Survol / pressé |
| `primary-soft` | `#EEECFF` | `#24203F` | Fonds de badge, sélection |
| `bg` | `#FFFFFF` | `#0E0E14` | Fond de fenêtre |
| `surface` | `#F6F6F9` | `#1A1A24` | Panneaux, cartes |
| `border` | `#E4E4EC` | `#2A2A38` | Séparateurs |
| `text` | `#14141F` | `#F2F2F7` | Texte principal |
| `text-muted` | `#6B6B7B` | `#9A9AAB` | Texte secondaire |
| `recording` | `#F2384A` | `#FF5A66` | État « enregistrement » |
| `busy` | `#E8930C` | `#FFB740` | État « transcription / nettoyage » |
| `success` | `#1FAF6B` | `#3DD68C` | État « terminé » |
| `error` | `#D92D20` | `#FF6B5E` | Erreurs |

Les couleurs d'état restent sobres et ne s'utilisent que pour l'indicateur d'état — jamais en décoration.

## Typographie

- **SF Pro** via la pile système : `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`.
- Titres : SF Pro Display, graisse 600, interlettrage −0,01 em.
- Interface : SF Pro Text 13 px (taille macOS standard), 400 / 500.
- Chiffres, raccourcis (⌥ Espace), logs : `ui-monospace, "SF Mono", Menlo, monospace`.
- Mot-symbole : « Dicta » en 600, « AI » en 400 couleur `text-muted`.

## Ton
Discret, précis, utile. Microcopie courte, en français, sans emphase : « Écoute… », « Transcription… », « Collé. », « Aucun micro détecté ».
