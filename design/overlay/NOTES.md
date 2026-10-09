# Overlay d'état — notes de design

Fichiers :
- `overlay.html` : renderer Electron autonome (CSS + JS inline, aucune dépendance, CSP stricte).
- `demo.html` : banc d'essai navigateur. Il charge `overlay.html` en iframe et le pilote par `postMessage` (états, niveau micro simulé, texte live, mode idle, fond, accent).

## Intégration (App)

**Fenêtre : 520 × 64 px, taille fixe.** L'étiquette est centrée dedans et grandit en largeur sans redimensionner la fenêtre ; le reste de la fenêtre est transparent.

```js
new BrowserWindow({
  width: 520, height: 64, frame: false, transparent: true, resizable: false,
  alwaysOnTop: true, focusable: false, skipTaskbar: true, hasShadow: false,
  webPreferences: { preload } })
win.setAlwaysOnTop(true, 'screen-saver'); win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
win.setIgnoreMouseEvents(true);   // clic traversant
win.showInactive();               // ne vole jamais le focus
// position : x = workArea.x + (workArea.width - 520) / 2, y = workArea.y + workArea.height - 64 - 16
```

API du renderer :
- `window.setStatus(status: DictaStatus)`, appelable via `win.webContents.executeJavaScript(...)`, ou automatiquement si le preload expose `window.dicta.onStatus(cb)`.
- `window.setIdleMode('dim' | 'hidden')`, ou `?idle=hidden` dans l'URL.
- `postMessage({ type: 'dicta-status' | 'dicta-idle-mode' | 'dicta-accent', ... })`.
- `level` : envoyer à environ 30 Hz pendant `recording`. Le lissage est fait côté overlay (attaque rapide, relâchement lent, courbe `level^0.6`).
- `done` n'expire pas tout seul : l'App repasse en `idle` au bout d'environ 1 s, comme prévu dans `types.ts`.

## États (identité CBW Studio)

Étiquette encre `#1C1C1E`, coins droits, liseré 1 px `rgba(255,255,255,.25)` + ombre `0 0 0 1px rgba(0,0,0,.35), 0 4px 16px rgba(0,0,0,.30)` : le double contour (clair dedans, sombre dehors) la détache des fonds blancs, noirs et photo (AUDIT §4.7). La fenêtre est désormais un panneau **toujours visible** en bas de chaque écran, d'où l'importance de l'idle. Structure : 5 barres (concept du logo), filet vertical 1 px, pastille carrée 6 px, libellé JetBrains Mono 11 px en capitales (`letter-spacing .08em`). Le texte live (`partialText`) passe en Archivo 13 px, casse normale.

| État | Barres | Couleur | Libellé par défaut (`message` le remplace) |
|---|---|---|---|
| idle (dim) | étiquette 44 × 16 avec trois carrés 5 px orange / bleu / vert, immobile | — | — |
| recording | réactives au micro, pastille qui clignote | `--accent` (orange `#FF5A1F`) | « ÉCOUTE », ou `partialText` |
| recording + `mode:'note'` | réactives au micro | orange `#FF5A1F` ; carré 8 px `#FF3B1F` qui clignote lentement (2 s) | « NOTE » + chrono `mm:ss` (tabulaire, depuis `elapsedMs`, sinon lu dans `message`) |
| note en pause (`message` contient « pause ») | silhouette du logo, immobile, atténuée | carré gris fixe | « PAUSE » + chrono figé |
| transcribing | vague gauche → droite | bleu | « TRANSCRIPTION » (atténué) |
| cleaning | respiration depuis le centre + reflet sur le texte | bleu | « MISE AU PROPRE » |
| inserting | barres resserrées qui clignotent | bleu | « COLLAGE » (atténué) |
| done | silhouette du logo, montée en cascade | vert `#1FD26A` | « COLLÉ » |
| error | à plat sauf la barre centrale, liseré rouge, secousse | `#FF6B5E` | `message`, sinon « ÉCHEC DE LA DICTÉE » |

Le bleu des barres est éclairci (`#5A67FF`) car `#2B3BFF` est trop sombre sur noir ; la pastille garde `#2B3BFF` avec un liseré intérieur clair.

Barres : 3 px de large, 2 px d'écart, extrémités carrées. Au silence, silhouette du logo (4,3 / 7,1 / 10 / 7,1 / 4,3 px) ; en parlant, pics à 12,3 / 14,2 / 16 px. Lissage inchangé (attaque 0,45, relâchement 0,12, courbe `level^0.6`).

## Dimensions

- Étiquette : hauteur 30, rayon 0, padding 11 / 12. Largeur **mesurée** (`.inner.scrollWidth`), donc juste quelle que soit la police chargée ; remesure à l'arrivée des polices.
- Libellé limité à 380 px ; au-delà, rogné **à gauche** avec un fondu de 28 px.
- Polices : `../../assets/fonts/fonts.css` (Archivo + JetBrains Mono hors ligne), repli système. La CSP autorise `style-src 'self'` et `font-src 'self'` pour cela.
- `?accent=` / `dicta-accent` change la couleur d'enregistrement (barres, pastille, premier carré idle).

## Timings

| Animation | Durée / courbe |
|---|---|
| Largeur / hauteur / opacité idle ↔ actif | 240 ms `cubic-bezier(.16,1,.3,1)` ; contenu en fondu (décalé de 60–80 ms) |
| Chrono note | interpolé localement toutes les 250 ms entre deux statuts (plafonné à +1,5 s), recalé à chaque statut |
| Carré d'enregistrement note | 2 s en boucle, fondu doux (coupé en mouvement réduit) |
| Fondu du libellé au changement | 200 ms |
| Mètre micro | rAF 60 fps ; lissage attaque 0,45 / relâchement 0,12 par image |
| Vague (transcribing) | 960 ms en boucle, décalage de 110 ms par barre |
| Respiration (cleaning) | 1400 ms en boucle, décalage de 180 ms depuis le centre ; reflet du texte 1600 ms |
| Clignotement (inserting) | 500 ms en alternance |
| Montée (done) | 340 ms, décalage de 45 ms par barre |
| Secousse (error) | 320 ms, une seule fois |

`prefers-reduced-motion` : pas de secousse, de ressort, de vague ni de reflet. Les états de réflexion deviennent un fondu d'opacité lent (2,4 s). Le mètre micro reste actif, puisqu'il porte une information, mais sans oscillation et plus lissé.

## Idle : recommandation

**Recommandé : la mini-étiquette discrète (`dim`, par défaut).** C'est le « pas en cours » demandé par la spec : on voit d'un coup d'œil que CBW AI est prêt, sans bruit visuel (44 × 16 px, trois carrés CBW de 5 px, aucune animation au repos). `dim` ne doit jamais être invisible : liseré clair + ombre sombre garantissent le contraste sur tout fond. C'est aussi le parti pris de Wispr Flow, et la transition vers `recording`, où l'étiquette se déploie, raconte bien « ça démarre ».
`hidden` reste disponible pour les utilisateurs qui ne veulent rien à l'écran (à proposer dans les réglages). L'icône de barre de menus suffit alors comme indicateur de repos.

## Survol : barre d'actions (façon Wispr Flow)

Au survol, l'étiquette se déplie en barre d'actions. La fenêtre ignore la souris mais relaie les `mousemove` ; l'overlay écoute `mouseenter` / `mouseleave` sur `#zone` (l'étiquette + une marge de 10 / 14 px, pour que la mini-étiquette idle soit facile à viser).

| État | Survol |
|---|---|
| idle (`dim`) | 44 × 16 → **210 × 38** : « ▮▮▮ DICTER ⌃⌃ » \| filet 1 px \| « ● NOTE ⌃⌃⌃ » |
| recording | même largeur (au minimum celle du bouton) : « ■ ARRÊTER » → `action('dictate')` |
| recording + `mode:'note'` (et pause) | « ■ TERMINER LA NOTE » (carré rouge) → `action('note')` |
| transcribing / cleaning / inserting / done / error | aucun dépliage |
| idle `hidden` | aucun dépliage (rien à l'écran) |

Bridge (preload) : `window.dicta.setHover(true)` dès l'entrée du pointeur (fenêtre cliquable), `setHover(false)` à la sortie, au clic, sur `document` `mouseleave` et sur `blur` (filet de sécurité). `window.dicta.action('dictate' | 'note')` au clic. Sans bridge (démo), l'overlay envoie `postMessage({ type: 'dicta-action', action })` au parent ; `postMessage({ type: 'dicta-hover', on })` simule le survol.

Timings : intention de survol 120 ms avant dépliage ; repli 250 ms après la sortie. Dépliage largeur / hauteur 260 ms `cubic-bezier(.16,1,.3,1)` ; contenu au repos masqué en 90 ms, actions en fondu 180 ms décalé de 60 ms. Bouton survolé : fond `rgba(255,255,255,.09)` ; pressé : `.14` + `scale(.97)`. Libellés JetBrains Mono 10 px capitales, raccourci atténué. Au clic : repli immédiat, et pas de redépliage tant que le pointeur n'est pas ressorti puis revenu (le statut poussé par l'App prend le relais). Si l'état change pendant le survol, le contenu suit (ou se replie pendant le traitement). Mouvement réduit : tout instantané, sans délai d'intention.
