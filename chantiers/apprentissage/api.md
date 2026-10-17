# Apprentissage continu de la dictée — contrat

Trois étages, tout en local, aucun appel LLM, rien d'envoyé.

## 1. Observer (`src/main/learn.ts`, `src/main/learnDiff.ts`)

- Après chaque collage (`learner.noteInserted`, appelé par `pipeline.ts`), relecture du champ ~45 s plus tard (ou à la
  dictée suivante) via `dicta-context` (`focusedField`).
- Brut Whisper retrouvé dans l'historique (`getRecent()`, même texte rendu, < 2 min).
- `analyzeCorrection(rendu, champ, brut)` → `{ final, edits[] }`. Types d'edit (`EditKind`) et clé de motif :
  - `delete-end:<expr>` suppression en fin de phrase (« voilà. ») · `delete:<expr>` suppression ailleurs
  - `insert:<expr>` ajout · `reinsert:<expr>` ajout d'un passage présent dans le brut et retiré par l'IA
  - `replace:<avant normalisé>=><après>` (≤ 3 mots de chaque côté) · `rephrase` (passage plus long)
  - `newline:<mot>` retour à la ligne ajouté avant ce mot · `newline-removed`
  - `punct:<avant>=><après>` ponctuation finale d'un mot (`∅` = rien)
- Limite connue : un ajout tout à la fin du texte collé est pris pour la suite tapée (ignoré).
- Stockage `~/.dicta-ai/learning/observations.bin` : JSON `{v:1, items: Observation[]}` chiffré AES-256-GCM avec la
  clé locale (`localcrypto.encryptBlob`, comme l'audio de l'historique). Sans clé : rien n'est écrit. 60 jours, ≤ 2000.
  `Observation = { at, app?, raw, rendered, final ('' si identique), edits }`.
- Journal : comptes seulement (`learn: observation {retouches, observations, nouvellesPreferences}`).
- Réglage `learning.observe` (booléen, défaut `true`) : « Observer mes retouches après une dictée » (Style et
  Réglages › Confidentialité). Indépendant de `dictionary.autoLearn` (termes du Dictionnaire).

## 2. Préférences apprises (`src/main/prefs.ts`, pur)

- Création : même motif ≥ 5 fois, dans ≥ 3 dictées, **zéro contre-exemple** sur les 60 jours
  (ex. « voilà » gardé en fin de phrase, mot remis après suppression, retour à la ligne absent devant le même mot).
- Motifs retenus : `delete-end`, `delete`, `replace`, `newline`, `reinsert` (→ kind `keep`), ≤ 3 mots.
- Désactivation automatique (`reason: 'contredite'`) si la personne fait l'inverse ≥ 2 fois après la création.
- Supprimer = motif mis dans `rejected`, jamais recréé. Désactiver / Réactiver = `active`.
- État `~/.dicta-ai/learning/prefs.bin` (chiffré) : `{ v:1, prefs: Pref[], rejected: string[], lastReportAt }`.
- Notification silencieuse « Préférence apprise » à la création.

### API pour le nettoyage

```ts
import { activePreferences, applyLearnedPreferences, DETERMINISTIC } from '../main/prefs';
activePreferences(): { kind: 'delete-end'|'delete'|'replace'|'newline'|'keep'; rule: string; text: string }[]
// rule : expression normalisée (minuscules) ; pour replace : « avant => après »
// text : libellé FR (« Retirer « voilà » en fin de phrase », « Aller à la ligne avant « Cordialement » »…)
applyLearnedPreferences(text: string): string   // applique seulement delete-end et replace (DETERMINISTIC)
```

- **Déterministes** (après le LLM, sans IA) : `delete-end` (« demain, voilà. » → « demain. » ; une phrase réduite à
  l'expression disparaît ; jamais devant ? ou !), `replace` (mots entiers, insensible à la casse).
  → **À brancher par le propriétaire de `pipeline.ts`** (une ligne, dans `finalizeText`, avant `matchSnippet`) :
  `text = applyLearnedPreferences(text);` — tant que ce n'est pas fait, les préférences sont visibles mais pas appliquées.
- **Pour le prompt (plus tard, agent `src/llm/`)** : `delete`, `newline`, `keep`. Proposition : passer
  `activePreferences().filter(p => !DETERMINISTIC.has(p.kind)).map(p => p.text)` dans `CleanOptions`
  (ex. `learnedPreferences: string[]`) et les ajouter au prompt sous « Préférences de l'utilisateur ». Rien n'est fait
  côté `src/llm/**` dans ce chantier.

## 3. Rapport (`src/main/learnReport.ts`, pur)

- `buildReport(observations, state, now, days = 7)` → Markdown : comptes, types de retouche, motifs qui reviennent
  (≤ 2 extraits courts chacun), préférences, candidats (≥ 3 fois), pistes pour le prompt **à valider par Camille**.
- Écrit dans `~/.dicta-ai/learning/rapport-AAAA-MM-JJ.md` (0600) + notification « Analyse de tes corrections prête »
  (clic : ouvre le fichier).
- Hebdomadaire : vérifié 2 min après le lancement puis toutes les 6 h ; si ≥ 7 jours depuis le dernier et ≥ 5 nouvelles
  dictées relues. À la demande : Style › « Analyser mes corrections ». Jamais d'écriture automatique du prompt.

## IPC (`window.dictaApp.learning`, `appWindow.ts` / `preload-app.ts`)

| Méthode | Retour |
|---|---|
| `get()` | `{ observe, observations, lastReport, prefs: [{ id, kind, text, hits, observations, active, reason?, examples, createdAt }] }` |
| `setActive(id, on)` | `boolean` |
| `remove(id)` | `boolean` (motif rejeté pour toujours) |
| `analyze()` | `{ path, observations, modified, motifs }` |
| `openReport()` | `boolean` |
| `clear()` | efface les observations (pas les préférences) |
| `onLearningChanged(cb)` | événement après tout changement |

## Tests

```
NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/prefs.test.ts      # analyse, préférences, rapport
NODE_NO_WARNINGS=1 node --experimental-strip-types src/main/learnDiff.test.ts
```
