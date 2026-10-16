# Régression v1.9 → correctif v1.10 (paragraphes, oral → écrit)

Date : 2026-10-15. Moteur : Groq, niveau standard. Aucune donnée de Camille lue : 10 dictées de test réalistes ont été écrites dans `bench/cases-oral-long.jsonl` (25 à 40 s, 300 à 560 caractères, avec fillers, « t'as », « y a », auto-corrections, idée abandonnée et plusieurs sujets).

## Cause

La v1.9 a compressé le prompt de 5 200 à 2 500 tokens. Trois pertes se cumulent :

1. **Il n'y avait plus aucun exemple de dictée longue.** Les 10 exemples gardés font tous un seul bloc, sauf la liste et la salutation. Les exemples de la v1.8 qui montraient des paragraphes (mail à Claire, « coucou… nouveau paragraphe ») et l'oral → écrit (« franchement je sais pas ») avaient été retirés. Les modèles imitent les exemples, donc ils rendaient un seul bloc.
2. **La règle des paragraphes avait été affaiblie.** Elle disait « (au-delà de trois phrases) … ; dans le doute, pas de paragraphe ». Ce « dans le doute » l'emportait sur tout le reste.
3. **La phrase « Dans le doute, ne touche pas » du niveau STANDARD** était lue comme « ne touche à rien ». Résultat : les tics (« tu vois », « genre ») restaient, ainsi que « t'as » et les négations sans « ne ». L'oral → écrit tenait en une parenthèse.

**À part : gpt-oss-20b** ne fait aucun paragraphe, quelle que soit la version du prompt (v1.8 comprise, 2/10). C'est une limite du modèle, d'où le filet déterministe ci-dessous.

## Changements v1.10 (ciblés, le reste est inchangé)

`src/llm/prompt.ts` :
- **Règle 3, oral → écrit « TOUJOURS »** : négation complète (c'est pas → ce n'est pas, y a plus → il n'y a plus), t'as → tu as, sujet doublé retiré (la maquette elle est → la maquette est).
- **Fillers** : « tics … dès qu'ils remplissent », avec « hein » ajouté et l'exemple « genre vers 19 h → vers 19 h ».
- **Paragraphes** : retour à la formulation de la v1.8, « dès que la dictée dépasse trois phrases, ligne vide à chaque changement de sujet ou d'étape », marqueurs explicites, 5 phrases maximum, « une à trois phrases sur un seul sujet = un bloc ». Le « dans le doute, pas de paragraphe » est retiré.
- **STANDARD** : « Applique TOUJOURS les suppressions, l'oral → écrit, la ponctuation et les paragraphes. » Le doute ne porte plus que sur les mots.
- **1 exemple long ajouté** : fournisseur et salon, avec fillers, t'as, y a, faut, « que » sans « ne » et un paragraphe.
- Taille : système 10 043 caractères (~2 870 tokens estimés) ; entrée Groq mesurée ~3 030 tokens, message compris. La v1.9 en mesure ~2 680 et la v1.8 ~5 390.

`src/llm/prompt.ts` `autoParagraphs()`, appelé par `router.finalizeText` (filet pour gpt-oss-20b et le repli sans IA) :
- Agit seulement sur une sortie **sans aucun retour à la ligne**, d'au moins 4 phrases et 60 mots, jamais en terminal ni en code.
- Coupe uniquement devant une phrase qui commence par un marqueur net (Sinon, Autre chose / point, Par contre, Ensuite, Pour finir, Dernière chose, Concernant…), ou devant une courte formule de fin. Il faut au moins 2 phrases avant chaque coupure.
- Aucun mot n'est modifié ni déplacé.
- Vérifié sur les ~110 sorties attendues de tous les jeux : **aucune n'est modifiée**. Sur les attendus d'oral-long aplatis en un bloc, il retrouve 7 paragraphages sur 10.
- Tests purs ajoutés dans `format.test.ts`.

Bench (`bench/run.ts`) :
- Nouvelles colonnes **paragraphes ✔** et **oral→écrit ✔**.
- Corps Groq identique à l'app (`groqExtraBody`, qwen3 sans réflexion).
- Réessai sur 429.
- `--autopara`, et `--rescore <json>` pour rejouer le score sans appel modèle.
- Copies figées `bench/prompt.v18.bench.ts` et `bench/prompt.v19.bench.ts`.
- Script : `chantiers/prompt-v19/regression/run.sh <modèle> <jeu> v18|v19|v110`.

## Scores — cases-oral-long (10 cas, Groq)

| Modèle | Prompt | Score /10 | Contenu ✔ | Abandonné ✘ | Sans filler | **Paragraphes ✔** | **Oral→écrit ✔** | F1 |
|---|---|---|---|---|---|---|---|---|
| qwen3.8-27b (modèle par défaut) | v1.8 | 9.30 | 7/10 | 7/10 | 8/10 | 8/10 | 8/10 | 0.99 |
| | v1.9 | 9.06 | 6/10 | 6/10 | 8/10 | **3/10** | 6/10 | 0.99 |
| | **v1.10** | **9.84** | 10/10 | 9/10 | 9/10 | **10/10** | **10/10** | 1.00 |
| gpt-oss-20b | v1.8 | 7.12 | 3/10 | 3/10 | 5/10 | 2/10 | 7/10 | 0.82 |
| | v1.9 | 7.99 | 4/10 | 4/10 | 6/10 | 2/10 | 6/10 | 0.94 |
| | v1.10 | 9.21 | 7/10 | 7/10 | 8/10 | 2/10 | **10/10** | 0.97 |
| | **v1.10 + filet ¶** | **9.21** | 7/10 | 7/10 | 8/10 | **6/10** | 10/10 | 0.97 |
| gpt-oss-120b | – | non mesuré : 429 dès le 1er cas (quota) | | | | | | |

Le filet ¶ ne change rien chez qwen v1.10 (déjà 10/10). Il fait passer qwen v1.9 de 3 à 7/10 et v1.8 de 8 à 9/10.

Les échecs restants de gpt-oss-20b ne viennent pas du prompt. Le modèle laisse passer des auto-corrections (« branche dev, enfin non… pardon », « 10 h, mais on attend à 10 h 30 »), comme il le fait avec la v1.8. C'est le dernier modèle de la rotation Groq (qwen → 120b → 20b).

## Non-régression cases-forme et cases-fidelite : NON FAITE sur Groq

Le quota Groq de qwen3.8-27b, puis celui de gpt-oss-120b, a saturé : 429 persistants, au-delà de 270 s d'attente. Les dictées de Camille passent par ces mêmes quotas. J'ai arrêté les mesures pour ne pas la priver de dictée.

Ce qui a été vérifié sans appel modèle :
- **Le filet ¶** a été rejoué sur toutes les sorties forme / fidélité déjà enregistrées (Gemini v1.8/v1.9, Groq 120b v1.8/v1.9). Le seul changement est un gain : forme 120b 8.56 → 8.61 (paragraphes 20 → 21/26). Aucune perte.
- `--dry` passe sur les 5 jeux, `tsc` passe et les 4 tests purs de `src/llm` aussi.

**À lancer hors dictée** (ce soir), un modèle à la fois :

```
R=chantiers/prompt-v19/regression/run.sh
for C in cases-forme.jsonl cases-fidelite.jsonl; do for T in v19 v110; do $R qwen/qwen3.8-27b $C $T; done; done
```

Les résultats vont dans `chantiers/prompt-v19/regression/<tag>/`. Critère : v1.10 ≥ v1.9 − 0,05 sur forme et fidélité. Point de vigilance : sur un message court, le filet ne s'applique pas (moins de 4 phrases ou moins de 60 mots), mais la règle de prompt est plus incitative.

## Fichiers

- `src/llm/prompt.ts` : v1.10, `autoParagraphs`.
- `src/llm/router.ts` : `finalizeText` appelle `autoParagraphs` hors terminal / code.
- `src/llm/context.test.ts`, `src/llm/format.test.ts` : version, tests du filet.
- `bench/run.ts`, `bench/cases-oral-long.jsonl`, `bench/prompt.v18.bench.ts`, `bench/prompt.v19.bench.ts`.
- `chantiers/prompt-v19/regression/` : scripts, résultats JSON par version et journaux.
