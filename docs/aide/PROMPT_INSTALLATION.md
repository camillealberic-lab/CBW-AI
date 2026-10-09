# Prompt d'installation express — CBW AI

À coller dans Claude Code (ou tout agent qui peut lancer des commandes sur ton Mac).
Il installe CBW AI, lève le blocage macOS, ouvre l'app et te guide pour les autorisations et la clé gratuite.

---

```text
Installe et configure l'application macOS « CBW AI » sur ce Mac, étape par étape, en m'expliquant en français ce que tu fais.

Contexte :
- CBW AI est une app gratuite de dictée vocale, prise de notes et brainstorm (Mac Apple Silicon, macOS 14 ou plus).
- Fichier : https://github.com/camillealberic-lab/CBW-AI/releases/latest/download/CBW-AI-arm64.dmg
- L'app n'est pas encore notarisée par Apple : macOS la bloque au premier lancement.

Étapes :
1. Vérifie que le Mac est Apple Silicon (uname -m = arm64) et sous macOS 14+ (sw_vers). Sinon, arrête-toi et explique-moi pourquoi.
2. Télécharge le .dmg dans ~/Downloads, monte-le, copie « CBW AI.app » dans /Applications (remplace l'ancienne version si elle existe, après me l'avoir dit), puis démonte le .dmg.
3. Retire l'attribut de quarantaine : xattr -dr com.apple.quarantine "/Applications/CBW AI.app"
4. Ouvre l'app (open -a "CBW AI").
5. Guide-moi pour les autorisations, sans les accorder à ma place : Micro, puis Accessibilité (Réglages Système › Confidentialité et sécurité › Accessibilité › cocher « CBW AI »), et Enregistrement de l'écran et audio système si je veux capter les visios.
6. Aide-moi à créer une clé Groq gratuite (https://console.groq.com/keys) : je la colle moi-même dans CBW AI › Réglages › Fournisseurs, puis je clique « Tester ». Ne me demande jamais de te donner la clé.
7. Termine par un récapitulatif : comment dicter (Control gauche ×2, puis ×1 pour coller), prendre une note (Control gauche ×3), lancer un brainstorm, et où sont les fichiers (~/Documents/CBW AI/).

Règles : ne modifie rien d'autre sur le Mac, n'installe aucun autre logiciel sans me demander, et arrête-toi en cas d'erreur pour m'expliquer.
```
