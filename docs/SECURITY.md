# Sécurité et confidentialité — CBW AI

Audit du 09/10/2026, avant la publication du dépôt sur GitHub (public) et l'activation des mises à jour dans l'app.
Périmètre : clés API, données de la personne, durcissement Electron, IPC, services locaux, injection de prompt, mises à jour.

## 1. Ce qui sort du Mac

| Donnée | Destination | Quand |
|---|---|---|
| **Texte** transcrit (dictée, note complète) + vocabulaire perso | **Le seul** fournisseur LLM qui répond (ordre des Réglages : Groq, Gemini, Z.ai, OpenRouter) en HTTPS | À chaque nettoyage / organisation / compilation |
| Rien (requête vide de contenu) | Hugging Face (`huggingface.co`) | Téléchargement des modèles Whisper / voix (SHA-256 vérifié) |
| Version de l'app, adresse IP | GitHub Releases | Vérification des mises à jour |

- **L'audio ne sort jamais du Mac** : Whisper (transcription) et la séparation des voix tournent en local.
- **Aucune télémétrie**, aucun rapport de plantage envoyé, aucun service d'analyse (vérifié : pas de `crashReporter`, Sentry, analytics).
- Avec « Modèle local » (Ollama) en tête de liste, le texte ne sort pas non plus.
- Attention, côté fournisseurs : les offres gratuites de Gemini, OpenRouter et Z.ai (serveurs hors UE, juridiction chinoise) peuvent réutiliser les requêtes. À dire clairement dans l'onboarding.
- Les renderers (fenêtres) ne peuvent charger **aucun** contenu distant : CSP `default-src 'none'` dans chaque page + blocage des requêtes http(s)/ws dans la session (`security.ts`). Les appels LLM partent du process main.

## 2. Où sont les données

| Emplacement | Contenu | Permissions |
|---|---|---|
| Trousseau macOS, élément « CBW AI Safe Storage » | Clé de chiffrement `safeStorage` | ACL du trousseau (app signée) |
| `~/.dicta-ai/secrets.json` | Clés API **chiffrées** (base64) | 0600 |
| `~/.dicta-ai/config.json` | Réglages (plus aucune clé API depuis la migration) | 0600 |
| `~/.dicta-ai/history.json` | Dernières dictées (texte brut + nettoyé) | 0600 |
| `~/.dicta-ai/usage.json` | Compteurs par fournisseur, dernières erreurs (masquées) | 0600 |
| `~/.dicta-ai/notes/` | `<id>.txt` transcription, `<id>.json` segments + locuteurs, `index.json` ; `<id>.wav` pendant la session | 0700 / 0600 |
| `~/.dicta-ai/models/` | Modèles Whisper et voix (publics) | 0700 |
| `~/.dicta-ai/dicta.log` (+ `.1`) | Journal : durées, longueurs, identifiants — **ni texte dicté ni clé** | 0600, rotation 2 Mo |
| `~/.dicta-ai/ollama.log` | Journal d'Ollama s'il est lancé par l'app | 0600 |
| `~/Documents/CBW AI/Notes`, `…/Prompts` | Notes et master prompts `.md` (pour la personne) | `~/Documents` est déjà privé (0700) |
| `/var/folders/…/T/dicta-<pid>-<t>.wav` | WAV temporaire de whisper-cli (repli) | 0600, supprimé après usage et au lancement suivant |
| `~/Library/Application Support/CBW AI` | Profil Chromium (cache, `localStorage` du thème) | profil Electron |

- `umask 077` est posé au démarrage : tout fichier créé par l'app (et ses processus enfants) est privé ; les fichiers créés par les anciennes versions (0644) sont corrigés au lancement (`privacy.ts › hardenDataPermissions`).
- Audio des notes : les WAV sont supprimés après l'organisation (sauf réglage `notes.keepAudio`), à l'annulation, et au lancement suivant après un plantage.
- Le texte dicté n'apparaît dans le journal qu'avec `DICTA_LOG_TEXT=1` (débogage local). Les autotests (`DICTA_SELFTEST*`) journalisent encore les transcriptions : réservés au développement.

## 3. Clés API

- **Au repos** : chiffrées par Electron `safeStorage` (`src/main/secrets.ts`). Migration transparente au premier lancement : les clés en clair de `config.json` (forme plate ou imbriquée) sont chiffrées puis effacées du fichier. Si le trousseau est indisponible, l'app garde l'ancien stockage (0600) et le journalise.
- **Priorité** : variables d'env (`GROQ_API_KEY`…) > trousseau. Le router LLM (bundle séparé) lit les clés via `setSecretAccessor()` ; les valeurs `apiKey` venant de l'UI ou de `config.json` sont alors ignorées.
- **Vers l'UI** : jamais en clair. `settings.all()` renvoie `"gsk_…a3f2"` + `providers.<id>.hasKey`. Une valeur masquée renvoyée par l'UI est ignorée ; coller une nouvelle clé la remplace (sélection automatique au focus dans `app.html`). « Tester » s'exécute dans le process main.
- **En transit** : HTTPS uniquement, clé dans un en-tête (`Authorization: Bearer`, Gemini : `x-goog-api-key`, jamais dans l'URL).
- **Journaux / erreurs** : `redact()` (`src/shared/redact.ts`) masque les formats connus (`gsk_`, `AIza`, `AQ.`, `sk-or-v1-`, `sk-`, `xai-`, Z.ai `hex32.alnum16`, `Bearer …`, `?key=`) **et** les valeurs exactes des clés configurées, dans `log()`, les `ProviderError`, `usage.json` et les messages de test.
- **CLI / bench** (`src/llm/cli.ts`, `bench/`) : pas de trousseau hors Electron → passer les clés par variables d'env (`GROQ_API_KEY=… node --experimental-strip-types src/llm/cli.ts "…"`).
- Scan du 09/10 (refait après les correctifs : 266 fichiers de `git add -n .`, motifs + 4 préfixes connus, 0 constat ; clé privée de signature absente de l'arborescence et du build) : aucune clé dans `dicta.log`, `ollama.log`, `usage.json`, `history.json`, le dépôt (`git add -n .`), l'`app.asar` packagé ni les sites. Seules occurrences : `~/.dicta-ai/config.json` (4 clés : Groq, Gemini, OpenRouter, Z.ai), migrées au prochain lancement. Le journal contenait 305 transcriptions + 30 résultats de dictée en clair : purgés (longueurs seulement).

## 4. Électron

| Contrôle | État |
|---|---|
| `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true` | Toutes les fenêtres ; toute fenêtre créée avec des préférences non sûres est fermée (`security.ts`) |
| Navigation, redirections, `window.open`, `<webview>` | Bloqués pour tout `webContents` (hors pages de `dist/`) |
| Contenu distant | Aucun : CSP sur toutes les pages + requêtes http(s) des renderers annulées |
| Permissions | Refus par défaut ; micro (audio seul, jamais la caméra) et son du Mac pour la fenêtre de capture cachée uniquement |
| `shell.openExternal` | Filtré globalement : https vers une liste d'hôtes (fournisseurs, GitHub, Hugging Face, Ollama, cbw.studio) + volets Confidentialité des Réglages Système |
| IPC | Émetteur vérifié (cadre principal d'une page `file://` de l'app, fenêtre attendue) pour `rec:*`, `overlay:*`, `bubbles:*`, `settings:*`, `app:*` ; types et tailles bornés ; aucun canal générique `invoke`/`eval` |
| Fusibles | `scripts/fuses.cjs` : RunAsNode off, NODE_OPTIONS off, `--inspect` off, OnlyLoadAppFromAsar on, intégrité asar on (si `ElectronAsarIntegrity` est dans Info.plist), cookies chiffrés. Appliqués par `scripts/after-pack.cjs` avant les `codesign` (local et CI, même hook) ; vérifié sur le build du 09/10 (`@electron/fuses read`, `ELECTRON_RUN_AS_NODE` refusé) |

CSP : `script-src 'unsafe-inline'` reste nécessaire (scripts en ligne dans `app.html`, `overlay.html`, `bubbles.html`). Les rendus Markdown / bulles échappent tout texte (`esc()`), mais déplacer les scripts dans des fichiers et retirer `'unsafe-inline'` supprimerait la dernière marge d'une XSS.

## 5. Services locaux et processus

- `whisper-server` : `--host 127.0.0.1`, port aléatoire, tué avec l'app (chien de garde). whisper.cpp renvoie `Access-Control-Allow-Origin: *` : une page web ouverte dans le navigateur pourrait, en devinant le port, envoyer de l'audio ou `POST /load` (déni de service, pas de fuite). Risque faible ; Chrome bloque déjà l'accès réseau local depuis le web public.
- Ollama lancé par l'app : `OLLAMA_HOST` local, `OLLAMA_ORIGINS` hérité **retiré** (CORS par défaut). Avertissement si `OLLAMA_HOST` n'est pas local.
- Tous les `spawn` / `execFile` utilisent des tableaux d'arguments (aucun shell avec des données de la personne) ; le seul `sh -c` (chien de garde whisper) reçoit les chemins en paramètres positionnels. `osascript` (⌘V), `tccutil`, `defaults`, `afplay`, `security` : arguments fixes.

## 6. Injection de prompt

- La dictée peut contenir des instructions : la sortie du LLM n'est **jamais exécutée**, seulement collée comme texte. Garde-fous `postProcess()` : rôle (réponse d'assistant refusée), longueur (+20 % max / −80 %), recopie d'exemple.
- Collage (`insert.ts`) : caractères de contrôle et marques bidi retirés, pas de retour à la ligne final (une dictée piégée ne valide pas une commande dans un Terminal).
- Fichiers `.md` : titres proposés par le LLM nettoyés (séparateurs, contrôles, « . » en tête) et préfixés par la date → pas d'injection de chemin. Suppressions limitées aux dossiers `~/Documents/CBW AI/Notes|Prompts`.
- Identifiants venant de l'UI : notes `^\d{8}T\d{6}-[a-z0-9]{1,8}$`, vérifiés avant tout chemin. `renameSpeaker` : seulement un locuteur existant, nouveau nom en texte simple (60 car.).

## 7. Mises à jour (modèle de menace)

`latest.json` (HTTPS, GitHub Releases) donne l'URL du zip et son SHA-256 ; l'updater vérifie la **signature Ed25519** du manifeste, le SHA-256, `codesign --verify`, l'identifiant et l'exigence désignée `identifier "com.dicta-ai.app"`.
**Faiblesse (corrigée le 09/10)** : le SHA-256 vient de la même origine que le zip, et la signature est ad hoc (n'importe qui peut produire un bundle qui satisfait cette exigence). Un jeton GitHub volé ou une CI compromise = mise à jour malveillante installée sur tous les Mac, avec les autorisations Micro / Accessibilité de CBW AI.

Correctif (intégré le 09/10) :
1. Paire générée en local : clé privée dans `~/.cbw-ai-signing/update-signing-key` (0600, dossier 0700, hors dépôt) → à copier dans le secret GitHub `UPDATE_SIGNING_KEY` (docs/RELEASE.md, **étape manuelle restante**) ; clé publique dans `src/main/updateVerify.ts › UPDATE_PUBLIC_KEY_B64`.
2. CI (`release.yml`), après génération de `latest.json` : `node scripts/sign-update.mjs sign dist-app/release/latest.json` puis `verify` ; la release échoue si le secret manque (ajoute `sig`, Ed25519 sur `cbw-ai-update-v1\nversion\nsha256\nzipUrl\ndmgUrl\ndate`).
3. Updater (`updater.ts › check()`), juste après `res.json()` : `verifyManifest(m)` sinon erreur — refuse aussi les URL hors `https://github.com` / CDN GitHub. Sans clé embarquée, tout est refusé.
4. Garder : version strictement supérieure (anti-retour arrière), SHA-256 du zip, `codesign --verify`.
5. À terme : signature Developer ID + notarisation (l'exigence désignée inclut alors l'ID d'équipe ; aujourd'hui les autorisations TCC et l'accès au trousseau reposent sur l'identifiant seul).

## 8. « Supprimer toutes mes données » (design)

- Emplacement : Réglages › Confidentialité, bouton rouge « Supprimer toutes mes données… ».
- Dialogue de confirmation : liste de ce qui sera effacé (clés API et élément du trousseau, réglages, historique, notes internes, audio, journaux, cache), case « Supprimer aussi mes notes et prompts exportés dans Documents » (décochée), case « Supprimer les modèles téléchargés (≈ 600 Mo) » (décochée). Bouton « Tout supprimer » activé après saisie de « SUPPRIMER ».
- Côté main : `wipeAllUserData({ documents, models })` dans `src/main/privacy.ts` (implémenté), puis `app.relaunch(); app.exit(0)` → l'app repart sur l'onboarding.
- Exposé : `app:wipeAllData` (émetteur vérifié, options booléennes strictes) dans `appWindow.ts`, `wipeAllData(opts)` dans `preload-app.ts`, contrat dans `docs/APP_API.md`. Reste à faire : le bouton et le dialogue dans `app.html`.

## 9. Constats

| # | Sévérité | Fichier | Constat | Statut |
|---|---|---|---|---|
| 1 | Critique | `src/main/notes.ts` | Identifiant de note non validé : `deleteNote('../config')` effaçait `~/.dicta-ai/config.json` (traversée de chemin via IPC) | Corrigé (regex + chemins `.md` confinés) |
| 2 | Élevée | `src/main/settings.ts`, `src/llm/config.ts` | Clés API en clair dans `config.json` | Corrigé (safeStorage + migration) |
| 3 | Élevée | `settings.ts` › `all()` (`app:getConfig`, `settings:getAll`) | Clés API envoyées en clair aux renderers | Corrigé (masquées + `hasKey`) |
| 4 | Élevée | `src/main/whisper.ts`, `pipeline.ts` | Transcriptions et dictées complètes dans `dicta.log` (305 + 30 entrées) | Corrigé + journal purgé |
| 5 | Élevée | `src/main/updater.ts` | `latest.json` non signé, signature ad hoc | Corrigé (Ed25519 vérifié dans l'updater, CI signe) — reste : secret `UPDATE_SIGNING_KEY` à ajouter sur GitHub |
| 6 | Élevée | `package.json` / `after-pack.cjs` | Fusibles Electron non appliqués (RunAsNode, NODE_OPTIONS, `--inspect` permettent d'utiliser les autorisations de l'app) | Corrigé (`after-pack.cjs` → `fuses.cjs`, avant signature) |
| 7 | Élevée | `src/main/settingsWindow.ts` | `downloadWhisper` : nom de fichier venant de la page (traversée), sans SHA-256 | Corrigé (catalogue vérifié) |
| 8 | Moyenne | `src/main/recorder.ts` | Permission `media` accordée à toute fenêtre (caméra comprise) | Corrigé (fenêtre de capture, audio seul) |
| 9 | Moyenne | `settings.ts` | `setConfig` acceptait toute clé (`__proto__`, valeurs géantes) | Corrigé (`validateSetting`) |
| 10 | Moyenne | `providers/common.ts`, `quota.ts` | Erreurs des fournisseurs pouvant recopier la clé → `usage.json`, journal, UI | Corrigé (`redact()`) |
| 11 | Moyenne | toutes les fenêtres | Pas de garde de navigation commune, pas de blocage du contenu distant, `openExternal` http accepté (Réglages) | Corrigé (`security.ts`) |
| 12 | Moyenne | `settings.html`, `src/renderer/*.html` | 4 pages sans CSP ; `base-uri` / `form-action` absents ailleurs | Corrigé |
| 13 | Moyenne | `~/.dicta-ai/*` | Fichiers 0644, dossiers 0755 (notes, journal) | Corrigé (umask 077 + rattrapage) |
| 14 | Moyenne | IPC `rec:*`, `overlay:*`, `bubbles:*`, `settings:*` | Émetteur non vérifié | Corrigé |
| 15 | Moyenne | `src/main/appWindow.ts` | Handlers `app:*` sans vérification d'émetteur ; ancien handler « reveal » sur un chemin lu dans un JSON (fonction retirée) | Corrigé (`isTrustedSender` sur tous les `app:*`, `testProvider` limité aux fournisseurs connus) |
| 16 | Moyenne | `design/*.html` | `script-src 'unsafe-inline'` | Documenté (scripts à externaliser) |
| 17 | Moyenne | `after-pack.cjs` | Exigence désignée `identifier` seule (ad hoc) : un autre binaire avec cet identifiant hérite de Micro / Accessibilité / trousseau | Documenté (Developer ID) |
| 18 | Faible | `src/main/ollama.ts` | `OLLAMA_ORIGINS` hérité pouvait ouvrir le CORS d'Ollama | Corrigé |
| 19 | Faible | `whisper-server` | CORS `*` côté whisper.cpp (port aléatoire, local) | Documenté |
| 20 | Faible | `src/main/insert.ts` | Retour à la ligne final / caractères de contrôle collés | Corrigé |
| 21 | Faible | `notes.ts` | Titres LLM : caractères de contrôle, « . » en tête | Corrigé |
| 22 | Faible | `renameSpeaker` | Remplaçait n'importe quel mot ; noms journalisés | Corrigé |
| 23 | Faible | binaires `whisper-*` | Chemin `/Users/<nom>/…` compilé dans les binaires | Corrigé (`-ffile-prefix-map`, binaires recompilés le 09/10 : 0 chemin `/Users/`) |
| 24 | Faible | `whisper.ts` | WAV temporaire 0644, orphelin après plantage | Corrigé (0600 + nettoyage) |
| 25 | Faible | `dist/design/*` | Pages démo / pont factice embarqués dans l'app | Corrigé (`build.files` : démos, pont factice, captures, propositions exclus de `app.asar`) |
| 26 | Info | sites, docs | « Camille Breton, Bordeaux », `contact@cbw.studio` : signature publique volontaire ; aucune adresse perso, aucun chemin `/Users/` dans le dépôt | OK |
