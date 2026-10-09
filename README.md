# Dicta AI

Dictée vocale pour macOS : une vraie app (Dock + barre de menus). **Appuyez deux fois sur fn, parlez, appuyez une fois sur fn** (ou maintenez fn pendant que vous parlez) : Whisper transcrit en local, un LLM fait un nettoyage léger (euh, répétitions, « trois, enfin non quatre » → « quatre »), puis le texte est collé dans l’app active (navigateur, ChatGPT, Claude, Cursor…).

C’est un correcteur de parole, pas un co-auteur : il n’invente rien et ne répond pas à ce que vous dictez.

## Prérequis

- Mac Apple Silicon, macOS 14 ou plus récent (testé sur M4 / macOS 26)
- Node.js 22+ (par exemple dans `~/.local/node/bin`, à ajouter au `PATH`)
- Xcode Command Line Tools (`xcode-select --install`) et git
- Pas besoin de Homebrew : si `cmake` est absent, le script l’installe avec `pip --user`

## Installation (app dans /Applications)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run setup:whisper          # une fois : compile whisper.cpp (Metal) + télécharge large-v3-turbo-q5_0 (≈ 550 Mo)
# ou : npm run setup:whisper:small   (modèle small, ≈ 470 Mo, un peu moins précis)
npm run install-app            # build → « Dicta AI.app » → /Applications, épinglée dans le Dock, puis lancée
```

`npm run install-app` :
- compile et empaquette l’app (`npm run dist` → `dist-app/mac-arm64/Dicta AI.app`, signée ad hoc) ;
- remplace `/Applications/Dicta AI.app` (en quittant d’abord l’ancienne version si elle tourne) ;
- ajoute l’icône au Dock de façon permanente si elle n’y est pas encore ;
- ouvre l’app.

Les binaires `whisper-cli` / `whisper-server` sont embarqués dans l’app (`Contents/Resources/bin`). Le modèle Whisper reste dans `~/.dicta-ai/models/` (non embarqué). `npm run dist:dmg` produit en plus un `.dmg` dans `dist-app/`.

### Premier lancement : l’onboarding

Au premier lancement, la fenêtre **Dicta AI** s’ouvre sur l’onboarding :
1. **Micro** : bouton « Autoriser le micro » (popup macOS).
2. **Accessibilité** : bouton « Ouvrir les Réglages », puis cochez **Dicta AI** dans Réglages Système › Confidentialité et sécurité › Accessibilité. L’écran passe au vert tout seul, et le raccourci passe en mode « maintenir » sans redémarrage.
3. **Raccourci** : fn ×2 par défaut (⌥ Espace en alternative). Le bouton « Régler pour moi » met « Appuyer sur 🌐 pour » sur « Ne rien faire » (sinon fn ouvre les emoji / la Dictée Apple). Puis **moteur IA** (local Ollama et/ou clés cloud gratuites), **essai**.

Ensuite, la fenêtre devient le **hub** (Accueil, Dictionnaire, Style, Réglages). Fermer la fenêtre ne quitte pas l’app : elle reste dans la barre de menus avec la pastille. Un clic sur l’icône du Dock (ou « Ouvrir Dicta AI » dans le menu de la barre) rouvre la fenêtre. « Revoir l’onboarding » est dans Réglages.

> L’app est signée ad hoc : chaque réinstallation change sa signature, et macOS peut redemander Micro / Accessibilité. Dans ce cas, retirez l’ancienne entrée « Dicta AI » de la liste Accessibilité (bouton −) puis réactivez-la.

### Où vont les clés API et les données

| Fichier | Contenu |
|---|---|
| `~/.dicta-ai/config.json` (chmod 600) | réglages + clés (`providers.gemini.apiKey`, `providers.groq.apiKey`, `providers.openrouter.apiKey`), saisies dans Réglages ou l’onboarding |
| `~/.dicta-ai/history.json` | 20 dernières dictées + compteurs (mots, série de jours) ; effaçable depuis le hub |
| `~/.dicta-ai/models/` | modèles Whisper |
| `~/.dicta-ai/dicta.log` | journal (`ollama.log` si l’app a lancé Ollama) |

Pour obtenir des clés gratuites, voir `docs/API_KEYS.md`.

### Ollama (nettoyage 100 % local)

Si Ollama ne tourne pas au démarrage, l’app lance elle-même `ollama serve` (binaire cherché dans `~/.local/ollama/ollama`, `/Applications/Ollama.app`, puis le `PATH`), avec `OLLAMA_KEEP_ALIVE=30m`, et l’arrête en quittant (seulement si c’est elle qui l’a lancé). Le modèle par défaut `gemma4:e4b` se télécharge depuis l’onboarding.

### Lancer au démarrage

Option « Lancer au démarrage » dans Réglages (élément d’ouverture macOS ; actif seulement pour l’app installée).

### Développement

```bash
npm run dev                    # compile puis lance depuis le dépôt (sans empaqueter)
```

`npm run build` compile seulement (dans `dist/`), et `npm start` lance la dernière version compilée. En développement, macOS attribue les permissions à l’app qui lance le processus (Terminal, iTerm, éditeur) : c’est elle qu’il faut cocher.

## Permissions macOS

| Permission | Pourquoi |
|---|---|
| **Micro** | capturer la voix |
| **Accessibilité** | savoir quand le raccourci est *relâché* (push-to-talk) et simuler ⌘V |

**Sans Accessibilité**, l’app reste utilisable en mode dégradé : le raccourci fonctionne en bascule (un appui pour démarrer, un pour arrêter) et le texte est copié dans le presse-papiers (collez avec ⌘V).

## Utilisation

1. Placez le curseur là où le texte doit aller.
2. **Appuyez deux fois sur fn** (mains libres) et parlez, ou **maintenez fn** pendant que vous parlez. La pastille affiche « J’écoute… » et le texte transcrit au fil de l’eau.
3. **Un appui sur fn** (ou relâchez fn) : le texte propre est collé. **Échap** annule.

La touche fn est lue par un petit helper natif (`dicta-fnwatch`, CGEventTap) qui a besoin de l’Accessibilité. Sans elle, ⌥ Espace reste disponible en mode bascule.

Votre presse-papiers d’origine est restauré environ 400 ms après le collage.

Menu de la barre :
- état actuel ;
- Ouvrir Dicta AI ;
- raccourci actif ;
- option « Presse-papiers seulement » ;
- journal ;
- Réglages… (ouvre le hub sur Réglages) ;
- Quitter.

### Réglages

Dans le hub, **Réglages** regroupe : raccourci, mode d’insertion, langue, modèle Whisper, fournisseurs LLM et leurs clés, niveau de nettoyage, lancement au démarrage. Tout est enregistré dans `~/.dicta-ai/config.json` (clés plates, par exemple `"general.shortcut": "Control+Alt+Space"`), fichier partagé avec le routeur LLM.

### Nettoyage LLM

Le routeur essaie les fournisseurs dans cet ordre : Gemini Flash-Lite, puis Groq, puis OpenRouter, puis Ollama en local. Si aucun ne répond, le texte brut de Whisper est inséré tel quel. Pour obtenir des clés gratuites, voir `docs/API_KEYS.md`.

## Performances mesurées (M4, 16 Go)

Mesures faites sur une phrase de 7,2 s (voix `say -v Thomas`) avec le modèle large-v3-turbo-q5_0 :

| Configuration | Durée de transcription |
|---|---|
| `whisper-server` persistant, chaud (utilisé par défaut) | **≈ 1,1 s** (de 1,6 à 2,3 s si le GPU est occupé, par exemple par Ollama) |
| `whisper-cli` (repli), à chaud | ≈ 1,4 à 1,6 s, dont ≈ 0,2 s de chargement du modèle |
| `whisper-cli`, démarrage à froid | jusqu’à 7 à 8 s : c’est la raison du serveur persistant |
| Nettoyage par Ollama `gemma4:e4b` en local | ≈ 0,5 s (p50), 1,6 s (p90, dictées longues) |

Le serveur Whisper garde environ 600 Mo en mémoire tant que l’app tourne.

## Dépannage

- **Journal** : `~/.dicta-ai/dicta.log`, accessible aussi par le menu « Ouvrir le journal ».
- **Self-test sans micro ni clavier** :
  ```bash
  DICTA_NO_PROMPT=1 DICTA_SELFTEST=/chemin/test.wav npx electron .
  ```
  Il transcrit, nettoie, capture l’overlay et la fenêtre principale, puis quitte. Pour produire un fichier de test :
  ```bash
  say -v Thomas "Bonjour…" -o t.aiff && afconvert -f WAVE -d LEI16@16000 -c 1 t.aiff t.wav
  ```
- **Erreur `tapi error: unknown architecture arm64e.x1` au build de whisper.cpp** : le SDK des CLT est plus récent que le linker. Le script force alors le SDK `MacOSX26.sdk`. Vous pouvez aussi définir vous-même `SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk`.
- **fn ouvre les emoji ou la Dictée Apple** : Réglages › Touche 🌐 › « Régler pour moi » (ou Réglages Système › Clavier › « Appuyer sur 🌐 pour » → Ne rien faire).
- **Accessibilité cochée mais non reconnue** (ancienne installation) : onboarding › Accessibilité › « Réparer l’autorisation ». Depuis cette version, la signature a une exigence stable (identifiant) : les autorisations survivent aux réinstallations.
- **Latence** : chaque dictée écrit une ligne `timing` dans le journal (fin de parole → relâchement → whisper → LLM → collage). Bench reproductible : `node --experimental-strip-types scripts/bench-latency.ts a.wav b.wav`.

## Structure

```
src/main/       process principal Electron (fenêtre principale, Dock, barre de menus, raccourci, pipeline, whisper, Ollama, historique, insertion, overlay)
src/renderer/   capture micro (fenêtre cachée, AudioWorklet → WAV 16 kHz mono) + pages de repli
src/llm/        routeur LLM (cleanTranscript) et prompt
src/shared/     types partagés
design/         fenêtre principale (app/), overlay, réglages (HTML autonomes), copiés dans dist/ au build
assets/         icônes (barre de menus : *Template.png)
scripts/        build.mjs, setup-whisper.sh, make-icns.sh, after-pack.cjs (signature ad hoc), install-app.sh
```
