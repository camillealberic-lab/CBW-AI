# API KEYS (agent KEYS) — b3, c7, c11, c13, c14, c15, f8, raccourci f2

Fichiers : `src/main/hotkey.ts`, `fnkey.ts`, `keysLogic.ts` (logique pure + `keysLogic.test.ts`), `overlay.ts`, `preload-overlay.ts`, `design/overlay/overlay.html`, `scripts/fnwatch.swift` (helper recompilé). Les modules lisent eux-mêmes `settings.get(clé) ?? défaut` ET écoutent `settings.on('change')` : l'agent UI n'a qu'à ajouter les défauts/UI et brancher les événements ci-dessous.

## Réglages (clé / défaut / libellé FR)
| Clé | Défaut | Libellé UI |
|---|---|---|
| `shortcuts.pasteLast` | `Control+Command+V` | Coller la dernière dictée (vide = désactivé) |
| `shortcuts.copyLast` | `Control+Command+C` | Copier la dernière dictée (vide = désactivé) |
| `shortcuts.rewrite` | `Control+Command+R` | Réécrire la sélection (vide = désactivé) |
| `shortcuts.mouseButton` | `0` (aucun) | Dicter avec un bouton de souris : Aucun / Bouton 4 (précédent) / Bouton 5 (suivant). Valeurs 0, 4, 5 (4..32 acceptés) |
| `overlay.livePreview` | `false` | Aperçu du texte pendant que je parle (dans la pastille) |
| `overlay.hiddenUntil` | `0` | (interne, epoch ms) pastille masquée jusqu'à… ; ne pas éditer à la main |
| `general.language` (existant) | `fr` | Langue de dictée : `auto`, `fr`, `en`, `es`, `de`, `it`, `pt`, `nl` (liste `LANGUAGES` dans keysLogic.ts) |
Accélérateurs : format Electron, au moins un modificateur (`validAccelerator`). Un raccourci en double ou pris par une autre app est ignoré (journal `ÉCHEC`). Écrire via `settings.set` suffit : réenregistrement automatique.

## Événements `hotkey` (PushToTalk) à brancher dans main.ts
- `hotkey.on('pasteLast', …)` : **attente PIPE** — coller le dernier texte de l'historique dans l'app active (même chemin que `insertText`, `mode:'paste'`, sans toucher au presse-papiers définitivement).
- `hotkey.on('copyLast', …)` : **attente PIPE** — `clipboard.writeText(dernierTexte)` + notification courte « Copié ». Fonctions attendues : `history.lastText(): string | null` (dernier texte final).
- `hotkey.on('rewrite', …)` : appeler `startRewrite()` exporté par `src/main/rewrite.ts` (PIPE). Branché par événement : aucun import dans hotkey.ts.
- `hotkey.on('secureInput', (active: boolean, app: string) => …)` (c11) : saisie sécurisée détectée (`IsSecureEventInputEnabled`, nom de l'app qui la tient si connu, sinon ''). Pendant qu'elle dure, le raccourci Control×2 ne reçoit rien. À faire côté UI : notification « Saisie sécurisée active (app) : le raccourci ne répond pas » à l'apparition, et un indicateur dans Réglages. Getter : `hotkey.secureInput`.
- `arm` / `down` / `up` : le bouton de souris (c15) émet les mêmes événements que Control×2 (maintien = push-to-talk, clic bref = mains libres, re-clic = arrêt). Échap annule. Il fonctionne aussi quand le raccourci principal est un accélérateur classique (helper lancé avec `--trigger none`). Le clic est retenu (pas de « page précédente ») si l'Accessibilité est accordée.
- Après changement de réglage de souris/raccourcis : rien à appeler (auto) ; `hotkey.applyMouse()` / `hotkey.applyActionShortcuts()` existent si besoin. `hotkey.configure()` les applique au démarrage.

## Pastille (`Overlay`, extends EventEmitter)
- `overlay.hideFor(ms = 3 600 000)` / `overlay.unhide()` / `overlay.hidden` / `overlay.hiddenUntil` ; événement `'hiddenChange'` `(hidden: boolean, until: number)`. Masquée au repos seulement : elle réapparaît pendant une dictée/note (retour d'état), puis se recache ; réapparition automatique à l'échéance (persistée, survit à un redémarrage). Entrée suggérée pour tray.ts : « Réafficher la pastille » → `overlay.unhide()`.
- Clic droit sur la pastille : menu natif (Langue de dictée ▸ radio, Aperçu du texte pendant la dictée, Masquer 1 heure, Remettre la pastille en bas). IPC `overlay:menu` (sans payload), géré dans overlay.ts, vérifié par `e.sender === win.webContents`. Aucun branchement requis. Le menu écrit `general.language` et `overlay.livePreview` via `settings.set`.
- Aperçu (c14) : si `overlay.livePreview === true`, `partialText` n'est transmis qu'en dictée (`state==='recording'`, pas en note), tronqué aux 64 derniers caractères ; sinon jamais de texte (comportement actuel). Les statuts `transcribing`/`cleaning` n'exposent jamais le texte. Pas de journal du texte.
- Preload : `window.dicta.menu()` ajouté (envoie `overlay:menu`). Placement (5 px, plein écran, Dock, emplacement aimanté) inchangé.

## Helper `dicta-fnwatch` (protocole)
- Sortie : `secure on [app]` / `secure off`, `mouse-down N` / `mouse-up N`. Entrée : `mouse N` (0 = off), `paste`. Options : `--trigger fn|lctrl|rctrl|none`, `--probe-v [idDisposition]`.
- b3 : le collage `paste` poste ⌘V avec le keycode de « V » trouvé via `UCKeyTranslate` sur la disposition courante (repli ASCII, repli 9). Résultats `--probe-v` : French 9, ABC 9, German 9, Colemak 9, Russian 9 (repli ASCII), Dvorak 47, Dvorak–QWERTY⌘ 9. Les chemins de repli (uiohook `keyTap`, osascript) sont dans insert.ts (PIPE) : non modifiés.
- Tests : `NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/keysLogic.test.ts` (OK). `tsc` : seule erreur restante = `snippets.test.ts` (fichier PIPE).
