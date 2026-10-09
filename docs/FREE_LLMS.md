# LLM gratuits pour Dicta AI : comparatif (8 octobre 2026)

Besoin de Dicta AI : prompt système FR d'environ **2 100 à 2 500 tokens**, une dictée de 300 tokens au plus, une sortie de 300 tokens au plus, **50 à 300 requêtes par jour**, latence visée **< 600 ms**, **0 €**.

Conséquence clé : ce qui limite, c'est le **TPM (tokens par minute)**, pas le RPD. Chaque requête consomme environ 2,2k tokens. Avec 8k TPM, on fait au plus **3 dictées par minute et par modèle**.

> Méthode : pages officielles (limites, tarifs, docs) consultées le 8/10/2026. J'ai fait 12 appels réels avec tes clés (`~/.dicta-ai/config.json`) : Groq ×4, Gemini ×7, OpenRouter ×1. Chaque appel envoie le vrai prompt v1.3 (`buildMessages`, niveau `light`) et la dictée *« euh alors on se voit demain à trois heures enfin non quatre heures pour parler du projet, et euh tu peux apporter le le dossier ? »*. Les latences sont mesurées de bout en bout depuis ton Mac, réseau compris, sans streaming.

---

## 1. Résultats mesurés (tes clés, 8/10/2026)

| Fournisseur · modèle | Latence totale | Tokens prompt / sortie | Sortie | Limites lues dans les en-têtes `x-ratelimit-*` |
|---|---|---|---|---|
| Groq · `qwen/qwen3.8-27b` (`reasoning_effort: "none"`) | **622 ms** (serveur 205 ms) | 2160 / 21 | « On se voit demain à 4 h pour parler du projet, et tu peux apporter le dossier ? » (met en chiffres) | **1 000 req/jour, 8 000 TPM** |
| Groq · `openai/gpt-oss-120b` (`reasoning_effort: "low"`) | **564 ms** (serveur 294 ms) | 2090 / 92 (dont 63 de raisonnement) | « …à quatre heures… dossier ? » (espace fine insécable avant « ? ») ✅ | 1 000 req/jour, 8 000 TPM |
| Groq · `openai/gpt-oss-20b` (`reasoning_effort: "low"`) | 635 ms (serveur 289 ms) | 2090 / 92 (dont 64 de raisonnement) | « …à quatre heures… dossier? » ✅ (sans espace avant « ? ») | 1 000 req/jour, 8 000 TPM |
| Groq · `allam-2-7b` | 367 ms | 2820 / 65 | ❌ sortie cassée (recopie le prompt) ; contexte de 4k seulement | 7 000 req/jour, 6 000 TPM |
| Gemini · `gemini-3.5-flash-lite` (`thinkingLevel: minimal`) | ❌ **9,4 s puis 7,4 s** | 2121 / 21 | « …à 16 h… » puis « …à 4 h… » (interprète l'heure) | non exposées (voir AI Studio) |
| Gemini · `gemini-3.1-flash-lite` (minimal) | ❌ 8,1 s | 2121 / 21 | « …à 16 h… » | idem |
| Gemini · `gemini-flash-lite-latest` (pointe vers 3.5-flash-lite) | ❌ 11,7 s | 2121 / 21 | « …à 16 h… » | idem |
| Gemini · `gemma-4-26b-a4b-it` | ❌ délai > 30 s dépassé | — | — | — |
| Gemini · `gemma-4-31b-it` | ❌ 503 « high demand » | — | — | — |
| OpenRouter · `google/gemma-4-26b-a4b-it:free` | ❌ 429 (« rate-limited upstream », pool partagé Google AI Studio) | — | — | clé : `free_model_daily_requests` **50/jour** (48 restantes), `is_free_tier: true` |

À retenir :
- **Seul Groq atteint l'objectif de < 600 ms.** Sa latence est d'environ 0,2 à 0,3 s côté serveur, plus environ 0,3 s de réseau.
- **Ce jour-là, l'offre gratuite Gemini répondait en 7 à 12 s**, environ 10 fois plus lentement que ce que note `config.ts` (« ≈ 1 s »). C'est peut-être une saturation passagère (les modèles Gemma renvoyaient 503 au même moment), mais avec `hedgeMs: 700` Gemini ne gagnera presque jamais la course.
- Catalogue Groq de ta clé (`GET /openai/v1/models`) : `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b`, `allam-2-7b`. Le reste, ce sont des modèles audio ou des garde-fous. Il n'y a plus aucun Llama.
- Modèles Gemini visibles par ta clé : `gemini-3.5/3.6/3.7/3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite(-preview)`, `gemini-flash(-lite)-latest`, `gemma-4-26b-a4b-it`, `gemma-4-31b-it`, et aussi `gemini-2.5-flash(-lite)` (ton compte y a encore droit).

---

## 2. Comparatif des offres

Légende : **Durable** = gratuit sans limite de durée. **Crédit unique** = cadeau ponctuel qui s'épuise ou expire, donc pas viable pour un usage à 0 € permanent.

| Fournisseur | Type | Modèles pertinents (FR, instruct, raisonnement coupable) | Limites gratuites | Latence | OpenAI-compatible | Données / entraînement | UE |
|---|---|---|---|---|---|---|---|
| **Groq** | ✅ Durable, sans carte | `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `openai/gpt-oss-20b` | **par modèle** : 30 RPM, **1 000 RPD, 8 000 TPM**, 200 000 TPD ([doc](https://console.groq.com/docs/rate-limits)). Les tokens en cache ne comptent pas. | **0,56 à 0,64 s mesurés** | ✅ `https://api.groq.com/openai/v1` | Pas de rétention par défaut ; logs ≤ 30 j en cas d'abus ; ZDR activable ([doc](https://console.groq.com/docs/your-data)) | Données stockées aux US |
| **Google Gemini API** | ✅ Durable, sans carte (ne pas activer la facturation) | `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` | RPM/TPM/RPD **non publiés** : visibles seulement dans AI Studio → Rate limit, **par projet** ; remise à zéro à minuit heure du Pacifique ([doc](https://ai.google.dev/gemini-api/docs/rate-limits), màj 2/9/2026). Des comparatifs tiers citent environ 15 RPM / 1 000 RPD pour les Flash-Lite, chiffre non confirmé. | ❌ **7 à 12 s mesurés** | ✅ (`/v1beta/openai/`) ou natif | **Offre gratuite = données utilisées pour améliorer les produits**, relecture humaine possible ([tarifs](https://ai.google.dev/gemini-api/docs/pricing), màj 7/10/2026) | OK (ta clé fonctionne depuis la France) |
| **OpenRouter `:free`** | ✅ Durable, sans carte | `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3-super-120b-a12b:free` | 20 RPM ; **50 req/jour**, ou **1 000 req/jour une fois 10 crédits achetés au total** (un seul achat de 10 $, qu'on n'a pas besoin de dépenser) ([doc](https://openrouter.ai/docs/api-reference/limits)). Pool partagé : 429 fréquents. | ❌ 429 lors du test | ✅ | Dépend du fournisseur ; l'option « ne pas router vers les fournisseurs qui entraînent » peut supprimer les modèles gratuits ([doc](https://openrouter.ai/docs/features/privacy-and-logging)) | — |
| **NVIDIA build.nvidia.com (NIM)** | ⚠️ Gratuit « prototypage », sans carte ; usage en production exclu par les CGU | Llama, Gemma, Nemotron… | Environ **40 RPM**, pas de plafond quotidien rapporté. Pas de chiffres officiels : forum NVIDIA ([fil](https://forums.developer.nvidia.com/t/api-rate-limit-increase-is-not-granted-by-requesting-it-here/368420)). | Variable (file d'attente partagée) | ✅ `https://integrate.api.nvidia.com/v1` | Non précisé | US |
| **Cerebras** | ❌ **Crédit unique** : 5 $ valables 30 jours, **carte obligatoire** depuis mi-2026 ([tarifs](https://www.cerebras.ai/pricing)) | `gpt-oss-120b`, `qwen-3.8-27b` | 5 RPM, 30k TPM non mis en cache, 1M TPD ([doc](https://inference-docs.cerebras.ai/support/rate-limits)) | Très rapide | ✅ | — | — |
| **SambaNova Cloud** | ⚠️ Gratuit sans carte mais très limité | DeepSeek V3.x, MiniMax, Gemma 4 31B (aperçu) | Sources tierces : **20 RPM, 20 RPD**, 200k TPD par modèle (page officielle introuvable, 404) | — | ✅ | — | — |
| **Cohere** (clé d'essai) | ⚠️ Durable mais **1 000 appels/mois**, usage non commercial | Command R7B / Command A, Aya (bon en FR) | 20 RPM chat, **1 000 appels/mois** ([doc](https://docs.cohere.com/docs/rate-limits)), soit environ 33/jour : insuffisant | — | Partiel (endpoint de compatibilité) | — | — |
| **Hugging Face Inference Providers** | ❌ **0 crédit pour un compte gratuit** ; 2 $/mois avec PRO (payant) ([tarifs](https://huggingface.co/docs/inference-providers/pricing)) | — | — | — | ✅ | — | — |
| **GitHub Models** | ❌ **Fermé le 30/07/2026** ([doc](https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models)) | — | — | — | — | — | — |
| **Together AI** | ❌ Pas d'essai gratuit, 5 $ d'achat minimum ([support](https://support.together.ai/articles/1862638756-changes-to-free-tier-and-billing-july-2025)) | — | — | — | — | — | — |
| **Fireworks AI** | ❌ Crédit unique de 1 $ | — | — | — | — | — | — |
| Nouveaux acteurs 2026 cités ([OpenRouter, 24/9/2026](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)) | Chutes (offre communautaire, variable) ; Vercel AI Gateway (BYOK) ; crédits uniques chez Nebius (1 $), AI21 (10 $), DeepSeek (10M tokens) et Baseten (30 $) | — | — | — | — | — | — |

### Qui donne le plus de requêtes par jour, pour nous ?
1. **Groq** : 3 modèles × 1 000 RPD = **3 000 req/jour**, mais 8k TPM par modèle, soit environ 3 dictées par minute et par modèle, **environ 9 par minute en alternant les 3 modèles**.
2. **Gemini** : RPD à lire dans AI Studio. Pour les modèles visibles par ta clé, ce sont en principe les **Flash-Lite** (`gemini-3.5-flash-lite` / `3.1-flash-lite`) qui ont le RPD le plus élevé ; les `3.6/3.7/3.8-flash` sont plus limités et plus lents. **Va vérifier dans AI Studio → Rate limit**, puis règle `providers.gemini.dailyLimit` en conséquence.
3. **OpenRouter** : 50/jour, ou 1 000/jour après un achat unique de 10 $ (ce n'est plus 0 €, mais c'est fait une fois pour toutes).

---

## 3. Recommandation (0 €, latence d'abord)

### Ordre conseillé
| Rang | Fournisseur · modèle | Pourquoi |
|---|---|---|
| **1. Principal** | **Groq `openai/gpt-oss-120b`** avec `reasoning_effort: "low"` | Le plus rapide mesuré (0,56 s) ; respecte la règle « nombres en lettres » et la typographie FR. Environ 60 tokens de raisonnement : à prévoir dans `max_tokens` (≥ 400). |
| 2. Rotation Groq | **`qwen/qwen3.8-27b`** (`reasoning_effort: "none"`), puis **`openai/gpt-oss-20b`** (`low`) | Chaque modèle a **son propre quota** (1 000 RPD / 8k TPM). Sur 429, ou quand `x-ratelimit-remaining-tokens` < 2 500, passer au modèle Groq suivant **avant** de changer de fournisseur. Ça triple le débit par minute. |
| 3. Secours lent | Gemini `gemini-3.5-flash-lite` (thinking minimal) | 7 à 12 s le 8/10 : à garder seulement comme filet, pas en course « hedgée ». |
| 4. Local | Ollama, version allégée (voir §4) | Hors ligne, confidentiel. |
| 5. Dernier recours | OpenRouter `google/gemma-4-31b-it:free` | 50/jour, 429 fréquents. |

À déconseiller : `allam-2-7b` (sortie cassée, contexte de 4k), Cerebras (carte et crédit de 30 jours), Hugging Face, GitHub Models (fermé), Together, Fireworks, Cohere (trop peu de requêtes).

### Leviers pour tenir dans le TPM de Groq (pas de code modifié ici, ce sont des pistes)
- **Raccourcir le prompt système.** Passer de 2,1k à environ 1,2k tokens (moins d'exemples) donne environ 6 dictées par minute et par modèle au lieu de 3.
- **Préfixe stable.** Groq indique que les « cached tokens do not count towards your rate limits ». Il faut que le prompt système soit identique octet pour octet à chaque appel (vocabulaire en fin de prompt, ou dans le message utilisateur), pour profiter du cache sur les modèles qui le supportent.
- Lire `x-ratelimit-remaining-tokens` / `x-ratelimit-reset-tokens` pour choisir le modèle Groq suivant.

### Clés à créer (pas à pas)
1. **Groq** (déjà en place) : active **Zero Data Retention** dans https://console.groq.com/settings/data-controls.
2. **Gemini** (déjà en place) : lis ton RPD réel dans https://aistudio.google.com/rate-limit et n'active pas la facturation.
3. Optionnel : NVIDIA https://build.nvidia.com (compte développeur gratuit, environ 40 RPM) comme secours supplémentaire.

---

## 4. Local : alléger gemma4:e4b sur un Mac M4 16 Go

### Diagnostic
- `ollama show gemma4:e4b` (Ollama 0.40.1) indique **quantization `nvfp4`**, taille 9,5 Go. C'est la variante **MLX**, que Ollama choisit par défaut sur Apple Silicon. Les poids MLX nvfp4 sont plus gros que le GGUF (vision et audio compris).
- Sur le registre, le même modèle en **GGUF** (`gemma4:e4b-it-q4_K_M`) pèse **5,49 Go de poids texte**, plus 0,99 Go de projecteur vision/audio et 0,1 Go de « draft ». La variante `e4b-it-qat` pèse 5,15 Go plus 0,99 Go. (Valeurs lues dans les manifestes du registre, sans téléchargement.)
- **Le runner est choisi selon le format du modèle, pas par une option globale.** Les GGUF passent par llama.cpp, les safetensors nvfp4/mxfp8 par MLX. Ton `ministral-3:8b` (Q4_K_M) affiche bien `runner llamacpp`. Il n'existe **pas** de variable `OLLAMA_*` documentée pour forcer llama.cpp. La seule méthode consiste à **tirer un tag GGUF explicite**.
- Contexte : Ollama prend par défaut 4k, 32k ou 256k selon la VRAM. Sur 16 Go, c'est en principe 4k, ce qui suffit (2,2k + 300).

### Configuration plus légère proposée
```sh
~/.local/ollama/ollama pull gemma4:e4b-it-qat        # 6,1 Go téléchargés, GGUF → runner llama.cpp
# ou gemma4:e4b-it-q4_K_M (6,6 Go)
~/.local/ollama/ollama ps                            # vérifier RUNNER = llamacpp
```
Variables d'environnement d'`ollama serve` :
```sh
OLLAMA_CONTEXT_LENGTH=4096      # 2,5k de prompt + 300 de sortie suffisent
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0       # cache KV divisé par 2
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_KEEP_ALIVE=5m
```
Et dans la requête : `options.num_ctx: 4096`.

### RAM attendue (estimations, à vérifier avec `ollama ps` et le Moniteur d'activité)
| Configuration | Poids | RAM chargée estimée | Qualité FR (bench) |
|---|---|---|---|
| `gemma4:e4b` MLX nvfp4 (actuel) | 9,5 Go | **≈ 10 à 12 Go mesurés** → le Mac gèle | 9,80 |
| `gemma4:e4b-it-qat` GGUF, ctx 4k, KV q8 | 5,15 + 0,99 Go | **≈ 6,5 à 7 Go** | Même modèle, quantification QAT (Google) : qualité attendue ≈ identique, **à vérifier avec `bench/run.ts`** |
| `gemma4:e4b-it-q4_K_M` GGUF | 5,49 + 0,99 Go | ≈ 7 à 7,5 Go | ≈ identique, à vérifier |
| `qwen3.5:4b` (nvfp4, déjà installé) | 4,0 Go | ≈ 4,5 à 5 Go | 9,45 |
| `gemma4:e2b-it-qat` GGUF | 3,35 + 0,99 Go | ≈ 4,5 à 5 Go | ≈ 8,98 (faible sur les auto-corrections) |

Note : llama.cpp charge le GGUF par `mmap`. Les grosses tables d'embeddings par couche de Gemma 4 ne sont lues que pour les tokens utilisés, donc la mémoire réellement occupée peut être plus basse que la taille du fichier. Je ne l'ai pas mesuré.

**Conclusion locale :** passe à `gemma4:e4b-it-qat` (ou `-q4_K_M`) avec un contexte de 4k. Tu gagnes environ 3 à 5 Go par rapport au MLX nvfp4, pour une qualité normalement équivalente. Valide avec `node --experimental-strip-types --no-warnings bench/run.ts ollama:gemma4:e4b-it-qat`. Si 7 Go reste trop lourd, `qwen3.5:4b` (déjà installé, 9,45) est le meilleur compromis à environ 5 Go. Le MLX est plus rapide en génération, mais pour des sorties de moins de 100 tokens, c'est surtout le préremplissage de 2k tokens qui compte, et l'écart reste faible.

---

## Sources (consultées le 8/10/2026)
- Groq, limites : https://console.groq.com/docs/rate-limits · données : https://console.groq.com/docs/your-data
- Gemini, limites : https://ai.google.dev/gemini-api/docs/rate-limits (màj 2/9/2026) · tarifs : https://ai.google.dev/gemini-api/docs/pricing (màj 7/10/2026)
- Cerebras : https://inference-docs.cerebras.ai/support/rate-limits · https://www.cerebras.ai/pricing
- OpenRouter : https://openrouter.ai/docs/api-reference/limits · https://openrouter.ai/blog/tutorials/free-llm-apis-compared/ (màj 24/9/2026)
- GitHub Models (fermeture) : https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models
- Hugging Face : https://huggingface.co/docs/inference-providers/pricing
- Cohere : https://docs.cohere.com/docs/rate-limits
- Together : https://support.together.ai/articles/1862638756-changes-to-free-tier-and-billing-july-2025
- NVIDIA (forum) : https://forums.developer.nvidia.com/t/api-rate-limit-increase-is-not-granted-by-requesting-it-here/368420
- SambaNova (tiers, non officiel) : https://www.costbench.com/software/llm-api-providers/sambanova-cloud/free-plan/
- Ollama, tags gemma4 : https://ollama.com/library/gemma4/tags
