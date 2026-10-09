# Fenêtre principale CBW AI : notes de design

Fichier : `app.html`, autonome (CSS/JS/SVG inline). Il charge en option `charts.js` (graphiques de l'Accueil) et `notes.js` (écran Notes) depuis le même dossier. Contrat : `docs/APP_API.md`. Seul lien externe : `../../assets/fonts/fonts.css`. CSP : `script-src 'self' 'unsafe-inline'`.

## Identité
- Les jetons en tête du `<style>` sont copiés de `design/cbw/tokens.css`. **Les garder synchronisés.**
  - Base **blanche** #FFFFFF. Noir adouci : texte `--noir` #1E1E1C, surfaces `--encre` #1C1C1E.
  - Sombre « graphite » : #1A1B1D / #202124 / #25262A.
  - Contrastes calculés dans DESIGN.md.
- **Thème** : `appearance.theme` = `light` (défaut) | `dark` | `system`.
  - Appliqué en `data-theme` sur `<html>` par un script en `<head>`, avant le premier rendu.
  - Il lit le cache `localStorage['cbw.theme']`, que la page réécrit après `getConfig()`.
  - Le réglage se fait dans Réglages › Général › Apparence (Clair / Sombre / Système) ou avec ⌘K.
  - `?theme=dark|light` force le thème pour la revue.
- **Boutons** : trois niveaux et un seul principal par écran. Le principal est plein `--encre`, avec une flèche qui glisse et un reflet. Le secondaire est en contour. Le tertiaire est un lien qui se souligne.
  - États : chargement (barres et reflet), succès (coche dessinée), désactivé, et un focus de 3 px.
  - Le rayon lumineux est réservé à « Activer le nettoyage IA » après l'essai.
- **Mouvement** : 120–320 ms, `cubic-bezier(.2,.7,.2,1)`. Tout est coupé en mouvement réduit.
  - Indicateurs glissants : barre latérale, segments, index des Réglages.
  - Compteurs animés, révélation en cascade et titres en masque.
  - Toasts en haut à droite.
  - Modale CBW à la place de `confirm()`.
- **Préchargement** : au plus 900 ms, une fois par session (`sessionStorage['cbw.preloaded']`).
  - Les 5 barres montent en orange / bleu / vert, se résolvent en logo, puis « CBW AI » monte et trois rideaux (blanc, orange, bleu) se lèvent.
  - Un clic ou une touche le passe. Absent en mouvement réduit.
  - Purement visuel : le pont et le routage démarrent en parallèle. `?preload=0|1` le force pour la revue.

## Intégration Electron
- La fenêtre est redimensionnable (≈ 85 % de l'écran, min 960×640), avec `titleBarStyle: 'hiddenInset'`. La mise en page est fluide :
  - contenu centré, `max-width: clamp(1100px, 72vw, 1480px)` ;
  - marges `clamp(40px, 5vw, 88px)` ;
  - titres en `clamp()` ;
  - grille de 12 colonnes à l'Accueil ;
  - requêtes `@container` sur `.main`.
- **Onboarding** : une bande de 52 px (zone de glisser) porte le logo et la progression en 4 segments.
- **Hub** : une **barre d'outils** de 60 px, avec un filet de 2 px, sert de zone de glisser. Elle contient :
  - logo (marque 5 barres + mot-symbole) ;
  - fil d'Ariane ;
  - recherche ⌘K ;
  - « Nouvelle note » ;
  - pastille du moteur actif ;
  - bouton Réglages.

  En plein écran macOS (plus de feux tricolores), la classe `html.fs` ramène le logo au bord.
- Le preload expose `window.dictaApp`. S'il est absent, la page passe en **mode démo** (badge).
- **Routage** : `onboarding.done === true` mène au hub, sinon à l'onboarding.
  - Hash onboarding : `#onboarding`, `#onboarding:N` (N = 1…4), `#onboarding:engine`.
  - Hash hub : `#hub`, `#hub:home|notes|dictionary|style|settings`, `#notes`, `#notes:<id>`.
  - Alias : `#accueil`, `#dictionnaire`, `#style`, `#reglages`.
  - Même chose via `dicta:navigate`.

## Onboarding : 4 étapes (la première dictée arrive à l'étape 3)
1. **Bienvenue**
   - Hero à gauche : logo animé, « Parle. CBW écrit. », lede, « Commencer ».
   - Démo brut → propre et trio de couleurs à droite.
   - Au premier lancement, une barre « Préparation de la transcription… 42 % » s'affiche (`whisperStatus` / `downloadWhisper` / `onWhisperProgress`, protégés s'ils manquent).
2. **Autorisations**
   - Une checklist : Micro, puis Collage automatique (autorisation Accessibilité).
   - Le bouton principal enchaîne « Autoriser le micro » puis « Ouvrir les Réglages », puis « Continuer ».
   - L'illustration change selon la phase.
   - « Réparer l'autorisation » apparaît, replié, après 10 s d'attente.
3. **Essai** : le raccourci s'apprend en dictant.
   - Touches Control et position sur le clavier. Les touches s'enfoncent vraiment pour ⌃ gauche ou droite.
   - Brouillon et pastille live.
   - La consigne reste, et la comparaison s'empile dessous.
   - « Changer de raccourci » est replié : ⌃ gauche ×2 (défaut) / ⌃ droite ×2 / fn ×2 / ⌥ Espace / Autre…
   - « Régler pour moi 🌐 » ne s'affiche que pour fn ×2.
   - Si aucun moteur n'est testé, la carte « Active le nettoyage IA » (rayon lumineux) ouvre l'option.
4. **Prêt** : récap avec un bouton « Régler » sur chaque ligne en alerte. CTA « Terminer ».

**Option · Nettoyage IA** (`#onboarding:engine`, hors parcours obligatoire) :
- « Sur ton Mac (5 Go) » d'un côté, « En ligne, gratuit » de l'autre.
- **Groq recommandé** est déplié. Les 5 autres sont dans l'accordéon « Autres fournisseurs gratuits ».
- Un moteur ne compte que si un **test a réussi** (`testOk`) ou si le modèle local est présent. Le test se lance automatiquement au collage et à la perte de focus.
- Les erreurs sont reformulées (« Cette clé ne marche pas… »).

## Hub (Accueil · Notes · Dictionnaire · Style · Réglages)
- **Accueil** :
  - Salutation, rappel du geste, actions « Nouvelle note » et « Faire un essai de dictée ».
  - Bandeau d'autorisation si besoin.
  - `charts.js` (`CBWCharts.renderHome(#homeCharts, stats)`) affiche les KPI et l'activité. Sans lui, une rangée de KPI chiffrés sert de repli.
  - Dernières dictées : 6, puis « Afficher les N ». Badge « Brut » pour le texte brut.
- **Notes** :
  - `notes.js` (`CBWNotes.mount(#notesRoot, { api, navigate, noteId })`, puis `handle.open(id)`).
  - Sans lui, une version intégrée gère la liste et la recherche, la session (minuteur, niveau, Pause / Terminer / Annuler avec modale si plus de 30 s), le traitement (libellé scintillant) et la note (Markdown sûr, tâches en cases carrées, transcription brute repliée).
- **Réglages** :
  - Index collant avec indicateur : Général · Nettoyage IA · Transcription · Confidentialité.
  - Apparence.
  - Fournisseurs repliés sur une ligne (« Clé » déplie).
  - Précision de la transcription en mots simples.
  - « Revoir la présentation ».

## Mode démo
- Il simule le pont complet, y compris `daily` / `byProvider` (30 jours), le téléchargement Whisper (≈ 4 s) et les notes factices avec session et organisation 1/3 → 3/3.
- Pour dicter : appuyer deux fois sur Control gauche dans la fenêtre (maintenir = push-to-talk), ou « Simuler une dictée (démo) ».
- Aides : `__dictaDemo._simulate(ms)`, `_grantAll()`, `_whisperReady()`.

## Côté pont / main
- `cleaning.level` doit valoir `standard` par défaut (promesse de l'onboarding, audit P0).
- `appearance.theme` est une clé de config libre.
- Pour le niveau micro pendant une note : la page lit `NoteProgress.level` si présent, sinon `onStatus().level`.

## Vérification
`node --check` sur les scripts extraits. Captures Electron en mode démo dans `shots/` :
- `NN-*.png` (clair) et `dark-NN-*.png` à 1512×982 ;
- `00-preload-1…4` ;
- `sizes/WxH-*.png` à 960×640, 1728×1117, 1920×1080 et 2560×1440.
