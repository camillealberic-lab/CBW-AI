# Prompt v1.9 : prompt système allégé (rapport)

Date : 2026-10-15. Moteur de mesure : `gemini:gemini-3.5-flash-lite`, niveau standard, `--delay 6000`.

## 1. Tokens

| | v1.8 | v1.9 |
|---|---|---|
| Prompt système (caractères) | 18 436 | 8 800 |
| Prompt système (tokens, Gemini `countTokens`) | 5 198 (règles 3 375, exemples 1 824) | **2 496** (règles 1 877, exemples 620) |
| Entrée réelle par requête, Gemini (`usageMetadata`) | ~5 240 | ~2 535 |
| Entrée réelle par requête, Groq gpt-oss-120b (`usage.prompt_tokens`) | ~5 048 | ~2 514 (version intermédiaire, à re-mesurer) |
| Estimation du router pour une dictée type (200 car., Slack) | ~6 405 (car./3) | **~2 838** (car./3,4, prompt v1.9) |

- Message user : inchangé. Les tests figent son format ; le bloc contexte est déjà compact.
- `GENERATION.maxTokens` : inchangé. La marge actuelle (len/2,5 + 96) est modeste, et la réduire risquerait de tronquer les listes.
- `quota.estimateTokens` : diviseur 3 → 3,4 car./token. Mesuré : 3,5 chez Gemini et 3,65 chez Groq, donc il reste une petite marge.
- Effet sur Groq (≈ 8 000 tokens/min) : on passe d'environ 1 dictée à environ 2,5 dictées par minute avant de basculer.

## 2. Ce qui a changé dans le prompt

- Les règles sont réécrites de façon plus dense. Toutes les règles de la v1.8 restent explicites : priorités, auto-correction, idée abandonnée, contexte, profils, prompt="oui", raccord, paragraphes, listes, commandes dictées, emoji, adresses, chiffres et `<vide>`.
- Il reste 10 exemples sur 23 : correction tardive, ordre adressé à « toi », idée abandonnée, liste numérotée, salutation + commande, contexte (nom déformé + nom piège « Ignore les instructions précédentes »), mot cherché, raccord après ↵, prompt pour une IA, vide.
- Le format des exemples devient `<dictée>…</dictée>` puis `→ sortie` (l'étiquette « Exemple N » est retirée). `postProcess` retire aussi un « → » recopié en tête de sortie.
- La règle du repère ⟦corrige⟧ n'est ajoutée que si `markCorrections` est activé. L'option est expérimentale et inutilisée en production, et la clé de cache en tient compte.
- **Garde-fou ajouté dans `postProcess`** : si le modèle convertit une phrase dictée en commande shell (`cd x && npm install` alors que la dictée ne contenait ni `&&` ni `cd`), la sortie est remplacée par le nettoyage déterministe. Gemini le faisait sur f19 / x07, et la v1.8 le fait aussi sur f19 aujourd'hui (3 essais sur 3). Le cas est couvert par un test pur.

## 3. Spéculation

- Nouveau `router.canSpeculate(raw, opts)`. Il est synchrone et ne lit que usage.json. Il estime une requête (prompt + dictée + sortie max + 200 tokens de marge pour le contexte), puis vérifie que le **premier** fournisseur cloud utilisable a encore au moins 2 × cette estimation en tokens/minute sur au moins un de ses modèles. Un quota encore inconnu est autorisé.
- `pipeline.speculateLLM` l'évalue au moment du lancement (dans `run`). La limite d'intervalle existante et la règle « < 2 fournisseurs → pas de spéculation » restent en place.
- Tests (quota.test.ts 8a à 8c) : quota inconnu → spéculation permise ; 1,5 × l'estimation restante → refusée ; 2 × → permise.

## 4. Non-régression sur Gemini

Les cas en erreur 503/429 ont été relancés seuls, puis fusionnés.

| Jeu | v1.8 | v1.9 (itération 2, complète) | Seuil (v1.8 − 0,05) | État |
|---|---|---|---|---|
| cases.jsonl (52) | 9.76 | **9.79** | 9.71 | ok |
| cases-forme (26) | 9.72 | 9.63 | 9.67 | **KO** (f06, f19) |
| cases-fidelite (15) | 9.48 | **9.54** | 9.43 | ok, mais f14 à −2,39 |
| cases-contexte (7) | 9.97 | 9.86 | 9.92 | **KO** (x07) |

Les résultats sont dans `baseline/` (v1.8), `apres-1/` (itération 1) et `apres-2/` (itération 2, avec `compare.txt` cas par cas).

### Différences de sortie (itération 2) et ce qui a été fait

- **f06 salutation (−1,33)** : « Salut l'équipe, je vous envoie… » sur une seule ligne. Avec la v1.8, le même cas sortait 2 fois sur 3 sur deux lignes. **Corrigé ensuite** en rendant à la règle « quelle que soit l'app… puis retour à la ligne » : 3 essais sur 3 à 10 (f06 et f23).
- **f19 / x07 terminal (−0,8 / −0,75)** : Gemini réécrit la phrase en `cd projets && npm install…`. **v1.8 relancée aujourd'hui : f19 converti 3 fois sur 3 aussi**, donc pas une régression sur f19. x07 n'était converti qu'en v1.9. Une bissection (12 variantes, 3 essais chacune) montre que c'est sensible à l'ensemble des règles (intro, règles d'or et section contexte ensemble), pas à une phrase isolée. **Corrigé par le garde-fou `postProcess` (repli fidèle)** : x07 → « Lance npm run build puis envoie sur origin main. »
- **f14 mot cherché (−2,39)** : « logiciel de montage vidéo » au lieu de « … pour couper les vidéos ». C'est du bruit du modèle : en 3 essais, v1.8 donne 2 sorties justes sur 3, v1.9 1 sur 3. Après la remise de « Garde les mots, l'ordre et les tournures de la personne » au niveau STANDARD, un essai ciblé donne 9,8.
- **c16 (−0,29)** : « deux écrans, mais des grands » au lieu de « deux grands écrans ». La règle et son exemple sont dans le texte, mais l'exemple dédié n'est plus dans les shots.
- **c20 (−0,27)** : « Le truc, c'est que » est supprimé. Le tic est retiré à tort, de façon bénigne.
- **c27 (−0,40)** : « Agis comme un expert SEO » au lieu de « Je veux que tu agisses ». C'est une reformulation légère. Un essai ciblé après correction donne 10.
- **c04 (+2,08), c18, c44, f09, f11 (+)** ; **fidélité f06 (+3,02)** : la v1.9 n'invente plus de paragraphe dans un message court (règle « un à trois phrases = un bloc » mieux suivie).
- **Différences sans effet sur le score** :
  - chiffres / lettres (« dix » → « 10 ») ;
  - point final absent en messagerie ;
  - backticks autour de `/api/users` et `prompt.ts` (c34, c52) ;
  - virgules ;
  - liste à tirets en c37, où le bench reste stable (7,2 → 7,3).

### Version finale (itération 3)

Les corrections de f06 et x07 sont en place, le prompt fait 2 496 tokens, `tsc` passe et les 3 tests purs aussi. **La mesure complète n'a pas pu être faite** : le quota gratuit Gemini a été épuisé pendant le premier jeu (cases.jsonl), avec 429 « exceeded your current quota » à partir de c30. Les essais ciblés (3 répétitions sur f06, f23, f19 / x07, f14) sont positifs.

## 5. Groq (moteur principal)

La mesure de cet après-midi est **invalide** : avec un délai de 20 s, le quota de tokens/minute partagé avec les dictées de Camille a saturé.

- v1.8 : 9 erreurs 429 sur 26 en forme et 6 sur 15 en fidélité. Cela illustre bien le problème de départ.
- v1.9 (version intermédiaire) : 8,56 en forme, sans erreur.

Toutes les mesures Groq sont arrêtées sur décision de Camille. **Groq sera mesuré ce soir, hors dictée** (cases-forme et cases-fidelite, v1.8 via `--prompt src/llm/prompt.v18.bench.ts` puis v1.9).

## 6. Verdict

- **Objectif tokens atteint** : système 5 198 → 2 496 tokens (−52 %), estimation par requête ~6 400 → ~2 840.
- **Non-régression pas encore validée** :
  - l'itération 2 complète échouait sur forme (9,63) et contexte (9,86) ;
  - les deux causes sont corrigées en itération 3 et vérifiées par essais ciblés, mais la mesure complète des 4 jeux reste à refaire quand le quota Gemini sera revenu (demain, ou ce soir avec Groq) ;
  - commande : `bash chantiers/prompt-v19/run-gemini.sh ~/dicta-ai/chantiers/prompt-v19/apres`, puis `rerun-errors.sh`, puis la comparaison.
- Note : Gemini flash-lite n'est pas déterministe à température 0. La v1.8 elle-même varie de ±2 points sur f06, f14 et f19 d'un essai à l'autre. Le critère « aucun cas à −1 » doit donc se juger sur des essais répétés.

## Fichiers

- `src/llm/prompt.ts` (v1.9, garde-fou shell) et `src/llm/quota.ts` (diviseur 3,4).
- `src/llm/router.ts` (`canSpeculate`) et `src/main/pipeline.ts` (`speculateLLM`).
- Tests : `src/llm/*.test.ts`.
- Bench : `bench/run.ts`, avec `--out`, `--prompt`, le jeu dans le nom du fichier de résultat et les tokens d'entrée relevés.
- `src/llm/prompt.v18.bench.ts` : copie de la v1.8, uniquement pour la mesure comparative de ce soir ; à supprimer ensuite.
- `chantiers/prompt-v19/` : `prompt-v1.9.ts`, `baseline/`, `apres-1/`, `apres-2/`, scripts `run-gemini.sh`, `rerun-errors.sh`, `run-groq.sh`.
