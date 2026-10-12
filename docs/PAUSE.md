# État — 12 oct. 2026

## Installé et fonctionnel
Dictée (Control gauche ×2, prompt v1.5), notes v2 + qui a dit quoi (diarisation sherpa-onnx, son du Mac), preloader A1 « Il parle », icône 5 barres blanc·orange·bleu·vert·blanc, menu repliable ⌘\, survols, garde-fou mémoire Ollama, sons de marque.

## Publié — v1.0.13 (12 oct.)
Pastille à 5 px du bas / du Dock, plein écran des autres apps (helper `dicta-fullscreen`), emplacement aimanté « silhouette » + son `dock`, clés API en AES local (`secret.key`, plus de trousseau), prompt v1.6 (standard fidèle).

## À faire
- Bench v1.6 sur Groq gpt-oss-120b / 20b (quota Groq ~60 dictées/jour/modèle : un jeu à la fois, `--delay 30000`, via `scripts/with-app-keys.mjs`). Gemini : v1.6 ≥ v1.5 (fidélité 9,18 → 9,69).

## À tester par l'utilisateur
- Note réelle avec son du Mac (permission « audio système »).
- Clic sur une bulle depuis une autre app (focus).

## En attente
- Site : site-2 seul (site-1 et site-3 supprimés le 9 oct.) → version finale, page aide, prompt d'installation (docs/aide/PROMPT_INSTALLATION.md).
- Publication GitHub Releases + Vercel : uniquement avec accord (lien OWNER/REPO à remplacer).
- Connu : quelques mots perdus quand un segment est recoupé au changement de locuteur (passer les timestamps de mots de whisper).
