# Baseline prompt v1.5 (niveau standard)

## ATTENTION : mesure incomplète et incident
- Aucune clé cloud lisible hors de l'app (loadConfig() ne renvoie ni clé Groq ni Gemini ; probablement dans le trousseau/secrets Electron). Le bench n'a donc pas pu viser Groq/Gemini.
- Sans clé, run.ts a utilisé sa cible par défaut `ollama:qwen3.5:4b` en dur sur localhost:11434 (OLLAMA_HOST est ignoré par bench/run.ts). Ollama a donc été chargé (~10 Go) une fois ; déchargé aussitôt (`keep_alive: 0`, /api/ps vide). Règle violée par inadvertance.
- Le chiffre ci-dessous est donc celui du modèle local de dernier recours, pas celui de production (Groq qwen3.8-27b / Gemini flash-lite). À refaire avec clés : `GROQ_API_KEY=… node --experimental-strip-types bench/run.ts groq:qwen/qwen3.8-27b --level standard` puis idem avec `--cases cases-fidelite.jsonl`.

## cases.jsonl (52 cas), ollama:qwen3.5:4b, v1.5/standard
Score moyen 9.43/10, contenu 47/52, rien d'abandonné 49/52, sans filler 52/52, F1 0.91, 1 rejet (c31 injection), p50/p90 501/1127 ms.
Faibles : injection 5.0 (c31 rejeté), idea_change 7.8 (c17), correction 8.8 (c07, c11), keep_meaning 8.9 (c43, c45), question 9.2 (c28).

## Outil ajouté
- `bench/run.ts` : option `--cases <fichier>` (défaut cases.jsonl). Seule modif.
- `bench/cases-fidelite.jsonl` : 15 cas (keep_words 5, no_structure 4, nuance_kept 3, word_search 3). Non exécutés faute de modèle autorisé.

## Défauts de fidélité attendus de v1.5 (lecture du prompt, à confirmer par mesure)
1. Règle 3 impose « je sais pas » -> « je ne sais pas », « truc(s) » -> « quelque chose/choses », « y a » -> « il y a » : contraire à la demande (f01-f05).
2. « Dictée longue à plusieurs idées : paragraphes » et « énumération >= 3 éléments : liste à tirets » : ajoute de la structure non dictée (f06-f09).
3. « À supprimer 7 » (reformulations successives : garder la dernière) écrase les reformulations qui ajoutent une nuance (f10-f12).
4. Aucune règle « chercher son mot » (truc/machin/comment ça s'appelle) : le niveau standard autorise seulement « le mot précis » pour « un truc » (f13-f15).
Pistes v1.6 : garder le registre (négation, truc) sauf bris de sens ; paragraphes/listes uniquement sur ordre explicite ; conserver une reformulation qui nuance ; règle « mot cherché ».
