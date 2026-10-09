# Dicta AI — obtenir les clés API (gratuites)

Dicta AI nettoie ta dictée avec un LLM. Il essaie les fournisseurs **dans l'ordre** et passe au suivant en cas de quota, de clé invalide ou de délai dépassé :

**Gemini (Google) → Groq → OpenRouter → Ollama (local)** → sinon nettoyage basique sans LLM.

Aucune clé n'est obligatoire : sans clé, l'app utilise Ollama s'il est installé, sinon un nettoyage simple (retrait des « euh », mots doublés). Objectif : **0 € par mois**. Aucune de ces offres ne demande de carte bancaire.

> Données vérifiées le 8 octobre 2026 dans les docs officielles. Les offres gratuites changent souvent : en cas de doute, la page « limites » de chaque console fait foi.

---

## Ordre conseillé

1. **Ollama** (local) — 10 min, aucune clé, rien ne sort du Mac. Le filet de sécurité.
2. **Gemini** — 2 min, rapide et le meilleur en français.
3. **Groq** — 2 min, très rapide, gros quota quotidien.
4. **OpenRouter** — optionnel, petit quota gratuit (50 requêtes/jour).

---

## Où coller les clés

Au choix (la variable d'environnement gagne sur le fichier) :

**A. Fenêtre Réglages de Dicta AI** → onglet *Fournisseurs* → champ de la clé → « Tester ».

**B. Fichier `~/.dicta-ai/config.json`** (à créer si absent) :

```json
{
  "providers": {
    "order": ["gemini", "groq", "openrouter", "ollama"],
    "localFirst": false,
    "gemini": { "apiKey": "AIza..." },
    "groq": { "apiKey": "gsk_..." },
    "openrouter": { "apiKey": "sk-or-v1-..." },
    "ollama": { "model": "gemma4:e4b" }
  },
  "cleaning": { "level": "standard", "vocabulary": ["Claude", "Cursor", "Supabase"] }
}
```

Protège-le : `chmod 600 ~/.dicta-ai/config.json`.

**C. Variables d'environnement** (dans `~/.zshrc`) :

```sh
export GEMINI_API_KEY="AIza..."
export GROQ_API_KEY="gsk_..."
export OPENROUTER_API_KEY="sk-or-v1-..."
```

Attention : une app lancée depuis le Finder/Dock ne lit **pas** `~/.zshrc`. Pour l'app, utilise A ou B ; les variables servent surtout pour le CLI.

**Vérifier** :

```sh
node --experimental-strip-types src/llm/cli.ts --status
node --experimental-strip-types src/llm/cli.ts --test gemini
node --experimental-strip-types src/llm/cli.ts "euh alors on se voit trois heures enfin non quatre heures"
```

---

## 1. Google Gemini (AI Studio)

1. Va sur **https://aistudio.google.com/apikey** et connecte-toi avec ton compte Google.
2. Accepte les conditions d'utilisation si on te le demande.
3. Clique sur **« Create API key »** (Créer une clé API). Choisis un projet existant ou laisse AI Studio en créer un.
4. Copie la clé (elle commence par `AIza`).
5. Colle-la dans Réglages → Gemini, ou dans `providers.gemini.apiKey`, ou dans `GEMINI_API_KEY`.
6. **N'active pas la facturation** (« Set up billing ») : la clé reste alors en offre gratuite et ne peut rien te coûter.

**Modèle utilisé** : `gemini-3.5-flash-lite`. C'est le modèle que Google recommande pour les nouveaux projets. La réflexion (« thinking ») est réglée au minimum (`thinkingLevel: "minimal"`) pour la latence. Alternatives gratuites : `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.8-flash` (plus lent). `gemini-2.0-flash(-lite)` n'existe plus et `gemini-2.5-*` est réservé aux anciens utilisateurs.

**Limites gratuites** : Google ne publie plus de tableau fixe. Tes limites (requêtes/minute, requêtes/jour) s'affichent dans AI Studio → menu **Rate limit** / « Usage », pour le projet de ta clé. Elles s'appliquent **par projet**, pas par clé, et le quota du jour **se remet à zéro à minuit, heure du Pacifique** (9 h à Paris). Dicta AI s'arrête par précaution à **250 requêtes/jour** ; tu peux ajuster cette valeur avec `"providers": { "gemini": { "dailyLimit": 500 } }`.

**Confidentialité** :
- En général, l'offre gratuite (« Unpaid Services ») autorise Google à utiliser tes requêtes pour améliorer ses produits, et des humains peuvent les relire.
- **Exception Europe (EEE, Suisse, Royaume-Uni)** : les conditions de l'API Gemini appliquent à tous les services, gratuits compris, les règles des services payants (*« the terms under "How Google uses Your Data" in "Paid Services" apply to all Services »*). Depuis la France, tes dictées ne servent donc pas à l'entraînement.
- Les mêmes conditions précisent qu'une app **distribuée** à des utilisateurs européens doit utiliser les services payants. Pour un usage personnel, aucun problème.
- Dans tous les cas, évite de dicter des données très sensibles (mots de passe, santé) vers un service cloud. Pour ça, utilise `localFirst` (voir Ollama).

---

## 2. Groq

1. Va sur **https://console.groq.com** → connexion (Google, GitHub ou e-mail).
2. Ouvre **https://console.groq.com/keys** → **« Create API Key »**, donne-lui un nom (« Dicta AI ») → **Submit**.
3. Copie la clé tout de suite (elle commence par `gsk_` et ne s'affiche qu'une fois).
4. Colle-la dans Réglages → Groq, ou dans `providers.groq.apiKey`, ou dans `GROQ_API_KEY`.

**Modèle utilisé** : `llama-3.1-8b-instant` (production, ~560 tokens/s). Alternatives : `openai/gpt-oss-20b` (plus intelligent, ~1000 tokens/s, raisonnement réglé sur « low »), `llama-3.3-70b-versatile` (meilleur français, quota plus petit), `qwen/qwen3.8-27b` (preview).

**Limites gratuites** (plan Free, par organisation ; tes limites exactes : https://console.groq.com/settings/limits) :

| Modèle | Req./min | Req./jour | Tokens/min |
|---|---|---|---|
| `llama-3.1-8b-instant` | 30 | 14 400 | 6 000 |
| `openai/gpt-oss-20b` | 30 | 1 000 | 8 000 |
| `llama-3.3-70b-versatile` | 30 | 1 000 | 12 000 |

**Confidentialité** : par défaut, Groq ne conserve pas les entrées et sorties d'inférence. Exception : des journaux de fiabilité ou d'abus peuvent être gardés jusqu'à 30 jours. Tu peux les désactiver dans *Settings → Data Controls*, avec l'option « Zero Data Retention ».

---

## 3. OpenRouter (optionnel)

1. Va sur **https://openrouter.ai** → **Sign in**.
2. Ouvre **https://openrouter.ai/settings/keys** → **« Create Key »**. Nom : « Dicta AI ». Tu peux mettre une limite de crédit à **0** par sécurité.
3. Copie la clé (`sk-or-v1-…`) et colle-la dans Réglages → OpenRouter, ou dans `providers.openrouter.apiKey`, ou dans `OPENROUTER_API_KEY`.
4. Va dans **https://openrouter.ai/settings/privacy** et vérifie que les modèles gratuits sont autorisés. Plusieurs fournisseurs gratuits **peuvent entraîner leurs modèles sur tes requêtes** (voir ci-dessous).

**Modèle utilisé** : `openrouter/free`, un routeur qui choisit automatiquement un modèle gratuit disponible. Tu peux en imposer un avec `"providers": { "openrouter": { "model": "…:free" } }`. La liste des modèles gratuits change souvent : https://openrouter.ai/models?q=free. En octobre 2026, elle ne contient pas de Llama, Qwen ni Gemma gratuits.

**Limites gratuites** (modèles `:free`) :

| Crédits achetés (cumul) | Req./min | Req./jour |
|---|---|---|
| moins de 10 $ | 20 | **50** |
| au moins 10 $ (achat unique) | 20 | 1 000 |

Aucun crédit n'est nécessaire pour les modèles gratuits. Une erreur 402 signifie « crédits insuffisants » : Dicta AI la traite comme un quota atteint.

**Confidentialité** : « gratuit » ne veut pas dire « privé ». OpenRouter ne garde pas le texte des requêtes par défaut, mais **certains fournisseurs gratuits utilisent les requêtes pour entraîner leurs modèles**. Si ça te gêne, ajoute `"providers": { "openrouter": { "dataCollection": "deny" } }`. Attention : ce réglage peut ne laisser **aucun** modèle gratuit, et OpenRouter sera alors simplement sauté.

---

## 4. Ollama (local, sans clé, sans Homebrew)

Tout reste sur le Mac et fonctionne hors ligne. Sur un MacBook M4 avec 16 Go, un modèle de 4 milliards de paramètres répond en **1 à 3 s** une fois chargé.

**Installation** :
1. Télécharge **https://ollama.com/download/Ollama.dmg** (page : https://ollama.com/download/mac).
2. Ouvre le .dmg et glisse **Ollama** dans **Applications**.
3. Lance Ollama une fois. Une icône de lama apparaît dans la barre de menus et l'app propose d'installer la commande `ollama` (accepte).
4. Le serveur écoute sur `http://localhost:11434`. Ollama doit tourner pour que Dicta AI l'utilise : active « lancer au démarrage » dans ses réglages.

Alternative en ligne de commande : `curl -fsSL https://ollama.com/install.sh | sh`.

**Télécharger un modèle** (dans le Terminal) :

```sh
ollama pull gemma4:e4b        # recommandé (benchmark Dicta : 9,78/10, ~0,5 s)
ollama run gemma4:e4b "Bonjour"   # test rapide (Ctrl+D pour quitter)
```

**Modèles recommandés pour 16 Go** (noms exacts de la bibliothèque Ollama) :

| Modèle | Taille disque | Pour qui |
|---|---|---|
| `gemma4:e4b` | ~5 Go disque | **par défaut** : meilleur score au benchmark Dicta (9,78/10), p50 0,5 s, ne répond jamais aux prompts dictés |
| `qwen3.5:4b` | ~4 Go | bon second choix (9,45/10), plus lent, obéit parfois aux injections (rattrapé par les garde-fous) |
| `gemma4:e4b` | ~4 Go | alternative Google, bon français |
| `ministral-3:8b` | ~6 Go | **déconseillé** : au benchmark Dicta il répond aux questions dictées au lieu de les transcrire (8,65/10) |
| `qwen3.5:9b` | ~6,6–7,6 Go | qualité maximale raisonnable, ~2× plus lent |
| `llama3.2:3b` / `ministral-3:3b` | ~2 Go | si la mémoire manque |

Choix du modèle : Réglages → Ollama → Modèle, ou `"providers": { "ollama": { "model": "gemma4:e4b" } }`. Dicta AI désactive la réflexion (`think: false`) et garde le modèle en mémoire 30 min (`keep_alive`).

**Tout en local** : `"providers": { "localFirst": true }` met Ollama en premier ; les services cloud ne servent alors que si Ollama ne répond pas. Pour **ne jamais** utiliser le cloud : `"providers": { "order": ["ollama"] }`.

---

## Résumé des limites gratuites

| Fournisseur | Modèle par défaut | Req./jour gratuites | Req./min | Reset quotidien | Entraînement sur tes données |
|---|---|---|---|---|---|
| Gemini | `gemini-3.5-flash-lite` | voir AI Studio (Dicta AI : garde-fou à 250) | voir AI Studio | minuit, heure du Pacifique | non depuis l'UE (oui hors EEE/CH/UK en gratuit) |
| Groq | `llama-3.1-8b-instant` | 14 400 | 30 | — | non (pas de conservation par défaut) |
| OpenRouter | `openrouter/free` | 50 (1 000 après 10 $ de crédits) | 20 | — | **possible** selon le fournisseur |
| Ollama | `gemma4:e4b` | illimité | — | — | non (100 % local) |

Dicta AI compte tes requêtes dans `~/.dicta-ai/usage.json`, visible dans l'onglet *Quotas*. Après une erreur 429 (quota atteint), le fournisseur est mis en pause jusqu'au délai indiqué par le serveur, ou jusqu'au reset quotidien. Une clé refusée met le fournisseur en pause 30 min ; le bouton « Tester » lève cette pause.

---

## Règles du jeu

- **Un seul compte par fournisseur.** Ne crée pas plusieurs comptes ou projets pour contourner les quotas : c'est interdit par les conditions des trois services et peut entraîner un bannissement. Si les quotas ne suffisent pas, active `localFirst` (Ollama).
- **Ne partage jamais tes clés** (captures d'écran, dépôts Git). Si une clé fuit, supprime-la dans la console et crées-en une nouvelle.
- Pas de facturation activée = pas de mauvaise surprise : sans moyen de paiement, aucun de ces services ne peut te facturer.
