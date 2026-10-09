# Fenêtre Réglages — notes de design

Fichier : `settings.html` (autonome, aucun import externe). Ouvrir dans un navigateur pour voir la maquette ; `settings.html#providers` ouvre directement un onglet.

## Intentions

- **Léger, natif macOS** : fenêtre ~720×520, barre latérale translucide (vibrancy simulée via `backdrop-filter`), groupes arrondis type Réglages Système, police système SF, contrôles natifs (popups, interrupteurs, contrôle segmenté). Pas de dashboard, pas d'historique.
- **Palette de marque** (`design/brand/BRAND.md`) : `--accent` = primary `#4B3CF0` clair / `#8579FF` sombre (+ `--accent-hover`, `--accent-soft`), `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, et états `--success #1FAF6B`, `--busy #E8930C`, `--error #D92D20` (variantes sombres de BRAND.md). Tokens sur `:root`, redéfinis via `prefers-color-scheme` (forçable avec `<html data-theme="light|dark">`). Les couleurs d'état ne servent qu'aux indicateurs (points de statut, jauges).
- **Logo** : `assets/logo-mark.svg` inline (fill `currentColor` → accent) + mot-symbole « Dicta » 600 / « AI » 400 muted. Raccourcis, clés, chiffres et vocabulaire en SF Mono.
- **Statuts lisibles d'un coup d'œil** : point coloré + libellé (jamais la couleur seule). success = Disponible, busy = Clé manquante, error = Quota atteint, gris = Hors-ligne, accent pulsant = Test en cours.
- **Ordre de fallback explicite** : rang numéroté, glisser via la poignée (seule la poignée active le drag pour garder la sélection de texte dans les champs) + flèches ↑/↓ accessibles au clavier.
- **« Local d'abord (0 €) »** : en l'activant, Ollama remonte visuellement en tête. Le router doit appliquer la même règle (Ollama premier quand `providers.localFirst = true`).
- **Clés API masquées** (password + bouton œil), « Tester » renvoie un message inline sous la ligne.
- **Quotas** : jauge par fournisseur cloud ; success < 80 %, busy ≥ 80 %, error à 100 %. Ollama n'a pas de quota.
- **Nettoyage** : rappel du principe « correcteur, pas co-auteur ». L'aide sous « Niveau » change selon Léger / Standard. « Vocabulaire personnel » : un terme par ligne, transmis au prompt pour respecter l'orthographe des noms propres.
- **Dernière dictée** : brut vs nettoyé côte à côte, une seule entrée, en mémoire uniquement ; méta optionnelle (fournisseur · modèle · latence, cf. `CleanResult`). Si nettoyage absent → message « texte brut inséré » (cas passthrough).

## Intégration Electron

- Ajouter `class="embedded"` sur `<html>` pour supprimer le faux cadre (feux tricolores, ombre) ; la barre latérale porte `-webkit-app-region: drag` (prévoir `titleBarStyle: 'hiddenInset'`, `vibrancy: 'sidebar'`).
- Définir `window.__DICTA_WIRED__ = true` **avant** le script pour désactiver les données de démo et les faux résultats de test/téléchargement.
- Tous les champs persistants ont `data-setting="<clé>"`.

### API `window.dicta`

| Méthode | Rôle |
|---|---|
| `onChange(cb(key, value))` | Chaque modification utilisateur. Retourne une fonction de désabonnement. |
| `onAction(cb(name, payload))` | Actions ponctuelles : `testProvider {id}`, `downloadWhisper {model}`, `whisperModelChanged {model}`, `openExternal {url}` (liens « Obtenir une clé » en mode câblé). |
| `setValues(obj)` | Applique des valeurs (clés plates ci-dessous) **sans** émettre `onChange`. |
| `setProviderStatus(id, status)` | `status` ∈ `available` · `missing_key` · `quota` · `offline` · `testing`. |
| `setTestResult(id, ok, message)` | Message sous la ligne après « Tester ». |
| `setQuota(id, used, limit)` | `id` ∈ `gemini` · `groq` · `openrouter`. |
| `setWhisperStatus(state, progress?)` | `state` ∈ `downloaded` · `missing` · `downloading` (progress 0–100). Bouton « Télécharger » visible si `missing`. |
| `setLastDictation(raw, clean, meta?)` | `meta = { provider, model, latencyMs }`. |
| `openTab(name)` | `general` · `providers` · `quotas` · `whisper` · `cleaning` · `last`. |

`id` des fournisseurs = `ProviderId` de `src/shared/types.ts`.

## Clés de réglages

| Clé | Type | Défaut | Valeurs |
|---|---|---|---|
| `general.shortcut` | string (accélérateur Electron) | `Alt+Space` | modificateur requis, ex. `Control+Shift+D` |
| `general.insertMode` | enum | `paste` | `paste` (coller automatiquement) · `clipboard` (presse-papiers seulement) |
| `general.language` | string | `fr` | `fr` · `en` · `auto` |
| `general.launchAtLogin` | boolean | `true` | |
| `providers.order` | ProviderId[] | `["gemini","groq","openrouter","ollama"]` | |
| `providers.localFirst` | boolean | `false` | |
| `providers.gemini.apiKey` | string | `""` | à stocker dans le trousseau (safeStorage), pas en clair |
| `providers.groq.apiKey` | string | `""` | idem |
| `providers.openrouter.apiKey` | string | `""` | idem |
| `providers.ollama.model` | string | `qwen2.5:7b` | |
| `whisper.model` | enum | `large-v3-turbo` | `tiny` · `base` · `small` · `medium` · `large-v3-turbo` |
| `cleaning.level` | enum | `light` | `light` (Léger) · `standard` (Standard) |
| `cleaning.keepRawOnFailure` | boolean | `true` | copie le brut dans le presse-papiers si le nettoyage échoue |
| `cleaning.vocabulary` | string[] | `[]` | un terme par ligne dans l'UI ; émis/accepté en tableau (lignes vides retirées), ex. `["Claude","Cursor","Supabase"]` |

NB : `cleaning.vocabulary` garde le nom demandé par la coordination, alors que les autres réglages de nettoyage sont en `cleaning.*` — à unifier si souhaité.

Le mode « maintenir pour parler » est fixe pour le MVP (pas de clé).
