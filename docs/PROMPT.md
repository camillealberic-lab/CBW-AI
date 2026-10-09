# Dicta AI — travail sur `src/llm/prompt.ts`

## Pipeline de nettoyage (v1.3)

```
texte Whisper brut
  → preClean()            supprime les hallucinations Whisper (« Sous-titres … Amara.org », « [Musique] », « Merci d'avoir regardé »)
  → isEmptyDictation()?   que des « euh / hum / bon » → rien n'est collé
  → shouldSkipLLM()?      ≤ 6 mots sans filler ni correction → fallbackClean(), pas d'appel LLM (latence ≈ 0)
  → buildMessages()       prompt système (règles d'or + règles + 10 exemples) ; dictée encadrée par <dictée>…</dictée>
  → LLM (router)          temperature 0
  → postProcess()         retire préambules, guillemets, balises ; REJETTE les sorties hors rôle :
                            · ouverture d'assistant (« Bien sûr », « Voici un… »)
                            · sortie > 1,2 × l'entrée + 6 mots (ajout / réponse)
                            · sortie < 0,2 × l'entrée (résumé / obéissance)
                            · copie d'un exemple du prompt
  → rejet → fournisseur suivant → au pire fallbackClean() (nettoyage déterministe : fillers + répétitions)
```

Options : `level` (`light` | `standard`), `vocabulary` (noms propres que Whisper déforme), `language`, `markCorrections` (expérimental, désactivé : n'aide pas).

## Benchmark (`bench/`, 50 phrases, 20 catégories)

Lancer : `node --experimental-strip-types --no-warnings bench/run.ts ollama:gemma4:e4b gemini:gemini-3.5-flash-lite [--level light]`
Résultats détaillés : `bench/results/*.json`, tableau cumulé : `bench/results/summary.md`.

| Modèle (local, M4 16 Go) | Score /10 | Latence p50 / p90 | Verdict |
|---|---|---|---|
| **gemma4:e4b** | **9.80** | **0,4 s / 1,0 s** | ✅ défaut local. N'obéit jamais aux injections, garde tu/vous |
| qwen3.5:4b | 9.45 | 0,9 s / 2,1 s | second choix ; obéit parfois (« dis-moi bonjour ») — rattrapé par les garde-fous |
| gemma4:e2b | 8.98 | 0,25 s / 0,7 s | trop faible sur les auto-corrections multiples ; traduit l'anglais |
| ministral-3:8b | 8.65 | 1,5 s / 4,0 s | ❌ répond aux questions dictées au lieu de les transcrire |
| Gemini Flash-Lite | — | — | à lancer dès que la clé est ajoutée |

Évolution du prompt sur qwen3.5:4b : v1.0 9.36 → v1.1 9.54 (règles d'or en tête, idées abandonnées, ponctuation dictée, doutes conservés).

### Erreurs restantes (gemma4:e4b)
- **c17 idée abandonnée** : « je voulais te proposer le ciné, enfin non laisse tomber, on peut juste faire un resto » → garde le ciné en contexte (« …mais on peut juste… »). Question ouverte ci-dessous.
- **c37 long** : garde « genre beige et marron » (registre oral conservé) — acceptable selon ta préférence.

### Points d'attention
- **RAM** : gemma4:e4b chargé ≈ 9–12 Go de mémoire unifiée (mémoire libre système ≈ 11 %). Le modèle reste chargé 30 min (`keep_alive`), il est préchargé au moment où tu appuies sur ⌥ Espace, chargement à froid ≈ 20–30 s.
- Le score automatique est un **filtre**, pas un juge : relire les sorties `~` et `KO` dans les JSON.
- Les 50 phrases sont écrites, pas dictées : la vraie étape suivante est d'enregistrer **tes** dictées (Whisper retire déjà une partie des « euh »).

## Questions pour toi (elles changent le prompt)

1. **Niveau par défaut** : `standard` (reformule légèrement : « une sorte de tableau pour voir où ils en sont » → « un tableau pour suivre leur avancement », comme dans ton cahier des charges) ou `light` (garde tes mots, retire seulement les scories) ?
2. **Idées abandonnées** (« on pourrait faire X, enfin non laisse tomber, Y ») : supprimer X complètement, ou garder la trace (« plutôt que X, Y ») ?
3. **Registre oral** : « t'es », « genre », « un truc » — garder tel quel (actuel) ou normaliser vers l'écrit (« tu es », « quelque chose ») ?
4. **Mise en forme** : listes à tirets automatiques pour les énumérations (actuel : seulement si « premièrement… » ou « trois choses : »), paragraphes pour les dictées longues — OK, ou toujours du texte brut sans markdown ?
5. **Nombres** : « trois boutons » → garder en lettres (actuel) ou toujours en chiffres ?
6. **Contexte de l'app active** : adapter selon l'app (Cursor/terminal → pas de majuscule ni point final, Mail → paragraphes, ChatGPT/Claude → prompt) ? C'est le « step supplémentaire » le plus utile selon moi.
7. **Step supplémentaire de vérification** : 2ᵉ passe LLM uniquement quand la dictée contient des auto-corrections (« enfin non », « pardon »…) pour vérifier qu'aucune version abandonnée ne reste ? (+0,4 s sur ces cas)
8. **Vocabulaire perso** : quels noms reviennent souvent (clients, outils, prénoms) ? Ils corrigent les erreurs de Whisper.
9. **Ollama au démarrage** : installer l'app officielle Ollama (démarre seule à la connexion) ou un service en arrière-plan géré par Dicta AI ? Et garder le modèle en mémoire en permanence (0 latence, ~10 Go occupés) ou 30 min (actuel) ?
