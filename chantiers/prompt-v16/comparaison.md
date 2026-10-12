# Comparaison prompt v1.5 vs v1.6 (niveau standard)

Date : 2026-10-12. Mesure partielle : seul Gemini est exploitable (voir « Blocages »).

## Scores (bench/run.ts, standard)

| Modèle | Jeu | Prompt | Score moyen | Contenu (must) | Rejets | Fidélité (mustNot) | F1 |
|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | cases (52) | v1.5 | 9.84 | 51/52 | 0 | 51/52 | 0.95 |
| gemini-3.5-flash-lite | cases (52) | v1.6 | 9.86 | 52/52 | 0 | 51/52 | 0.95 |
| gemini-3.5-flash-lite | cases-fidelite (15) | v1.5 | 9.18 | 12/15 | 0 | 13/15 | 0.89 |
| gemini-3.5-flash-lite | cases-fidelite (15) | v1.6 | 9.69 | 14/15 | 0 | 15/15 | 0.94 |
| gpt-oss-120b / gpt-oss-20b | tous | v1.5 / v1.6 | NON MESURÉ | | | | |

Latence Gemini p50/p90 : v1.5 857/1007 ms (cases), v1.6 809/1087 ms. Équivalent.

## Blocages (Groq)
1. Quota journalier : gpt-oss-120b et gpt-oss-20b ont 200 000 tokens/jour (TPD) chacun ; une requête de nettoyage coûte ~3 300 tokens (prompt ~11 000 caractères). Soit ~60 dictées/jour/modèle. Un comparatif complet (134 requêtes/modèle) demande ~440 000 tokens : impossible en une journée. Les deux modèles sont épuisés pour ~24 h (rolling).
2. Le bench ne reproduit pas la prod pour gpt-oss : run.ts envoie `max_tokens` sans `reasoning_effort:'low'` ni `include_reasoning:false` ni la marge +512 de `providers/groq.ts`. Le raisonnement consomme tout le budget et la sortie est vide (22/51 sorties vides sur 120b v1.5, score 7.0 : invalide). Correctif prêt : `chantiers/prompt-v16/run-groq-gptoss.patch` (à appliquer par le propriétaire de bench/run.ts).
3. Gemini : 429 par minute à delay 0 ; OK avec `--delay 7000`.
À relancer demain, avec le patch, par lots (ex. `--only` ou un jeu à la fois, `--delay 30000`).

Point prod à vérifier : le commentaire de groq.ts parle de ~1 000 req/jour, mais le plafond réel est 200 k tokens/jour/modèle (~60 dictées), la rotation de modèles est donc critique.

## Régressions v1.6 (Gemini, cas par cas)
Score en baisse de plus de 0,5 : 2 cas.

- **c37 (long) 9.7 -> 7.2.** Raw : « Alors en fait euh pour le site de la boulangerie ... une page contact avec un formulaire. Et euh pour les couleurs je verrais bien un truc chaleureux, genre beige et marron, enfin pas trop marron quand même parce que ça fait vite triste. »
  v1.5 : paragraphe 1 « ...ensuite une page avec les produits (les pains, les viennoiseries, les gâteaux), et puis une page contact... » + saut de ligne + « Pour les couleurs, je verrais bien un ton chaleureux, comme du beige et du marron, mais pas trop marron ... cela fait vite triste. »
  v1.6 : un seul bloc, « ...produits, genre les pains, ... Et pour les couleurs, je verrais bien un truc chaleureux, genre beige et marron, enfin pas trop marron quand même parce que ça fait vite triste. »
  Cause : « genre » gardé (le scorer le compte comme filler) et plus de paragraphes (voulu en v1.6). Régression du scorer plus que de qualité ; discutable.
- **f13 (word_search) 9.9 -> 7.5.** Raw : « il faut mettre à jour le, comment ça s'appelle, le truc qui liste les dépendances du projet, le package point json »
  v1.5 : « Il faut mettre à jour le fichier qui liste les dépendances du projet, le package.json. »
  v1.6 : « Il faut mettre à jour le package.json. »
  v1.6 trouve le mot cherché (voulu) mais supprime l'indication « qui liste les dépendances » ; le scorer attend ce contenu. Acceptable.

Écarts mineurs (non comptés) : c18 v1.6 garde « on pourrait prendre MySQL, mais je préfère Postgres » (v1.5 supprimait MySQL : v1.5 plus propre) ; c41 v1.6 garde « premièrement/deuxièmement » dans la liste ; c28 v1.6 garde « C'est quoi la différence » (plus oral, fidèle).

## 5 exemples avant/après (Gemini)
1. Franchise des mots cherchés (f02) :
   - Dictée : « franchement ce truc-là il est génial, je l'utilise tous les jours »
   - v1.5 : « Franchement, cet outil est génial, je l'utilise tous les jours. »
   - v1.6 : « Franchement, ce truc-là, il est génial, je l'utilise tous les jours. »
2. Nuance gardée (f10) :
   - Dictée : « c'est lent, enfin pas lent lent, disons un peu poussif sur les gros fichiers »
   - v1.5 : « C'est un peu poussif sur les gros fichiers. »
   - v1.6 : « C'est lent, enfin pas lent lent, disons un peu poussif sur les gros fichiers. »
3. Pas de mise en forme non demandée (f06) :
   - Dictée : « faut que je te dise un truc, hier j'ai vu Marc ... sinon pour le budget on est à peu près bon, il reste deux mille euros, par contre le devis du graphiste il est pas encore arrivé »
   - v1.5 : « Il faut que je te dise quelque chose : ... » + coupure en deux paragraphes.
   - v1.6 : « Il faut que je te dise un truc : ... Sinon, pour le budget ... il reste 2 000 €. Par contre, le devis ... » en un seul bloc.
4. Voix conservée (f09) :
   - Dictée : « en gros l'idée c'est de commencer petit, de tester avec dix clients, et puis d'élargir si ça marche, et après on verra pour le prix »
   - v1.5 : « L'idée est de commencer petit, de tester avec 10 clients et d'élargir si cela fonctionne. Après, nous verrons pour le prix. »
   - v1.6 : « En gros, l'idée c'est de commencer petit, de tester avec 10 clients, et puis d'élargir si ça marche, et après on verra pour le prix. »
5. Correction tardive mieux comprise (c12) :
   - Dictée : « Je veux mettre trois boutons, enfin non quatre, parce que j'ai oublié le bouton de validation, mais attends, le bouton de validation je le veux finalement dans la popup. »
   - v1.5 : « Je veux mettre trois boutons, enfin non quatre, parce que ... » (garde l'erreur « trois » et le « enfin non »)
   - v1.6 : « Je veux mettre quatre boutons, parce que j'ai oublié le bouton de validation, mais le bouton de validation, je le veux finalement dans la popup. »
   Bonus (c46, ton) : « merci mec » -> v1.5 « Merci ! » ; v1.6 « merci mec. ».

## Verdict (provisoire, Gemini seul)
**v1.6 meilleure sur la fidélité à la voix** (jeu fidélité 9.18 -> 9.69, mustNot 13 -> 15/15, contenu 12 -> 14/15) et **équivalente sur le nettoyage général** (9.84 -> 9.86, aucun rejet, latence identique). Réserves : c37/f13 (scorer pénalise « genre » gardé et l'information « fichier des dépendances » perdue), c18 (option abandonnée MySQL conservée), c41 (« premièrement » conservé). Aucune confirmation sur les modèles de prod Groq : à relancer après correction du bench et reset du quota.
