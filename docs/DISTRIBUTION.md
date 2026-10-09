# Distribuer CBW AI (macOS, Apple Silicon)

Ce document explique comment fabriquer le `.dmg`, le publier, ce que verront les utilisateurs tant que l'app n'est pas notariée, et comment passer à une distribution « propre » (Developer ID + notarisation + mises à jour automatiques).

---

## 1. Fabriquer le DMG

```bash
export PATH=~/.local/node/bin:$PATH
npm run typecheck
npm run dist:dmg
```

Résultat dans `dist-app/` :

| Fichier | Rôle |
|---|---|
| `CBW AI-1.0.0-arm64.dmg` | DMG versionné (archive, notes de version) |
| `CBW-AI-arm64.dmg` | **même fichier**, nom stable (sans espace ni version) pour le lien « dernière version » |
| `mac-arm64/CBW AI.app` | l'app décompressée (signée ad hoc) |

Le script `scripts/stable-dmg.mjs` fait la copie et affiche taille + SHA-256. Taille mesurée (v1.0.0) : **≈ 117 Mo** (DMG compressé lzfse/ULFO ; app installée ≈ 258 Mo).

Contenu / réglages (dans `package.json › build`) :
- `version` : **1.0.0** (à incrémenter à chaque release).
- `dmg` : fenêtre 540×380 avec fond `build/background.tiff` (1× + 2× Retina, régénérable par `npm run dmg:background`), icône de l'app à gauche, alias **Applications** à droite, flèche entre les deux.
- `mac.minimumSystemVersion` : 14.0. Les binaires embarqués (`whisper-cli`, `whisper-server`, `dicta-fnwatch`) sont compilés avec `CMAKE_OSX_DEPLOYMENT_TARGET=14.0` ; `scripts/after-pack.cjs` **refuse de packager** si l'un d'eux exige un macOS plus récent.
- Signature : **ad hoc** (`identity: null` + `scripts/after-pack.cjs`), car aucun Developer ID n'est disponible.

### Ce qui n'est PAS dans le DMG
- Aucune clé API, aucun `config.json` / `history.json` / `usage.json` : vérifié avec `npx asar list` + recherche des clés réelles dans tout le bundle (0 occurrence).
- Aucun modèle Whisper : au premier lancement l'app télécharge `ggml-large-v3-turbo-q5_0.bin` (≈ 574 Mo, dépôt officiel `ggerganov/whisper.cpp` sur Hugging Face) dans `~/.dicta-ai/models`, avec reprise et vérification SHA-256. **Une connexion Internet est donc nécessaire au premier lancement.**
- Ollama n'est pas fourni : il est optionnel (l'app fonctionne en cloud seul ; statut « Non installé »).

Chaque utilisateur obtient un `~/.dicta-ai/` neuf : pas de clés, ordre des fournisseurs par défaut, raccourci `LCtrl×2`, thème clair, onboarding au premier lancement.

---

## 2. Héberger le DMG : GitHub Releases (et pas Vercel)

**Pourquoi pas directement sur Vercel ?** Vercel est fait pour servir un site, pas des binaires de 100+ Mo : la taille des fichiers d'un déploiement est plafonnée (de l'ordre de 100 Mo par fichier selon l'offre — notre DMG est déjà à la limite), chaque téléchargement consomme le quota de bande passante du plan (facturé au-delà), et chaque nouvelle version obligerait à redéployer le site. Il faudrait aussi éviter de committer un binaire de 117 Mo dans le dépôt du site.

**GitHub Releases** : fichiers jusqu'à 2 Gio par asset, bande passante gratuite, URL stable vers « la dernière version », historique des versions, et c'est la source native d'`electron-updater` (cf. §5).

### Publier une version (manuel)
1. `npm run dist:dmg`
2. Sur GitHub : *Releases › Draft a new release* → tag `v1.0.0` → titre « CBW AI 1.0.0 ».
3. Joindre **`dist-app/CBW-AI-arm64.dmg`** (le nom stable ; GitHub remplace les espaces par des points, d'où ce nom sans espace). Optionnel : joindre aussi le DMG versionné.
4. Coller dans les notes le SHA-256 affiché par `stable-dmg.mjs`.
5. Publier (pas en *pre-release*, sinon « latest » ne la pointe pas).

En ligne de commande (avec `gh` connecté) :
```bash
gh release create v1.0.0 dist-app/CBW-AI-arm64.dmg --title "CBW AI 1.0.0" --notes "…"
```

### Lien depuis la landing page Vercel
GitHub redirige toujours vers l'asset portant ce nom dans la release la plus récente :

```
https://github.com/<owner>/<repo>/releases/latest/download/CBW-AI-arm64.dmg
```

Sur la landing : `<a href="https://github.com/<owner>/<repo>/releases/latest/download/CBW-AI-arm64.dmg">Télécharger pour Mac (Apple Silicon)</a>`. Rien à changer sur le site à chaque version, tant que l'asset garde le nom `CBW-AI-arm64.dmg`.
Option : une redirection Vercel (`vercel.json` → `"redirects": [{ "source": "/download", "destination": "https://github.com/<owner>/<repo>/releases/latest/download/CBW-AI-arm64.dmg" }]`) pour afficher `monsite.fr/download`.

Le dépôt doit être **public** (ou les releases d'un dépôt public dédié) pour que le lien marche sans compte GitHub.

À indiquer sur la landing : Mac Apple Silicon (M1 ou plus récent), macOS 14 ou plus récent, ~1 Go d'espace libre (app + modèle), connexion Internet au premier lancement.

---

## 3. Ce que voient les utilisateurs (app non signée Developer ID, non notariée)

Le navigateur ajoute l'attribut `com.apple.quarantine` au DMG téléchargé ; il est propagé à l'app copiée dans Applications. Au premier lancement, Gatekeeper vérifie la signature + la notarisation. Notre app est seulement signée ad hoc, donc :

> « CBW AI » ne peut pas être ouvert, car Apple ne peut pas vérifier qu'il ne contient pas de logiciel malveillant.

(boutons « Terminé » / « Placer dans la corbeille »). Procédure à donner aux utilisateurs :

**macOS 15 Sequoia et plus récent** (le clic droit ne suffit plus) :
1. Ouvrir une première fois CBW AI (le message ci-dessus apparaît) → « Terminé ».
2. **Réglages Système › Confidentialité et sécurité** → descendre jusqu'à « “CBW AI” a été bloqué… » → **« Ouvrir quand même »**.
3. Confirmer avec le mot de passe / Touch ID → « Ouvrir ». C'est à faire une seule fois.

**macOS 14 Sonoma** : clic droit (ou Ctrl-clic) sur l'app dans Applications › **Ouvrir** → « Ouvrir » dans la boîte de dialogue (ou même procédure via Réglages).

**Alternative Terminal** (utilisateurs avancés) — supprime l'attribut de quarantaine :
```bash
xattr -dr com.apple.quarantine "/Applications/CBW AI.app"
```

Ensuite, comme toute app de dictée : autoriser **Micro**, **Accessibilité** (collage automatique, raccourci) et éventuellement **Surveillance de l'entrée** — l'onboarding guide ces étapes. Grâce à l'exigence désignée stable (`identifier "com.dicta-ai.app"`), ces autorisations survivent aux mises à jour.

Conséquences de l'absence de notarisation : friction au premier lancement, message anxiogène, certains Mac d'entreprise (MDM) bloquent totalement les apps non notariées, et pas de mise à jour automatique possible (cf. §5).

---

## 4. La vraie solution : Developer ID + notarisation

### 4.1 Prérequis
1. **Apple Developer Program** : 99 $/an — https://developer.apple.com/programs/ (compte individuel ou organisation ; une organisation nécessite un numéro D-U-N-S). Validation : de quelques heures à quelques jours.
2. Un Mac avec Xcode ou les Command Line Tools (`xcrun notarytool` inclus).

### 4.2 Certificat « Developer ID Application »
1. developer.apple.com › *Certificates, IDs & Profiles* › Certificates › **+** › **Developer ID Application** (seul le titulaire du compte peut le créer).
2. Générer la CSR : Trousseau d'accès › Assistant de certification › *Demander un certificat à une autorité…* (enregistrer sur disque), l'envoyer, télécharger le `.cer`, double-cliquer → il arrive dans le trousseau « session ».
3. Vérifier : `security find-identity -v -p codesigning` → `Developer ID Application: Nom (TEAMID)`.
4. Pour la CI : exporter certificat + clé privée en `.p12` (Trousseau › clic droit › Exporter), avec mot de passe.

### 4.3 Identifiants de notarisation (au choix)
- **Clé API App Store Connect** (recommandé, CI) : appstoreconnect.apple.com › Utilisateurs et accès › Intégrations › Clés › rôle *Developer* → télécharger `AuthKey_XXXX.p8` (une seule fois), noter *Key ID* et *Issuer ID*.
- **Apple ID + mot de passe d'app** : appleid.apple.com › Mots de passe pour app → générer ; + Team ID (developer.apple.com › Membership).

### 4.4 Modifier `package.json › build.mac`
```jsonc
"mac": {
  "target": [{ "target": "dmg", "arch": ["arm64"] }, { "target": "zip", "arch": ["arm64"] }], // zip : requis par l'auto-update
  "identity": "Developer ID Application: Nom (TEAMID)",   // au lieu de null (ou omettre + CSC_LINK)
  "hardenedRuntime": true,                               // obligatoire pour la notarisation
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "notarize": true,                                      // electron-builder ≥ 25 : identifiants lus dans l'environnement
  "minimumSystemVersion": "14.0",
  …
}
```

`build/entitlements.mac.plist` (le runtime renforcé coupe sinon le micro et les modules natifs) :
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>   <!-- uiohook-napi (.node) -->
  <key>com.apple.security.device.audio-input</key><true/>              <!-- micro sous runtime renforcé -->
</dict></plist>
```

`scripts/after-pack.cjs` ne fait plus la signature ad hoc quand une vraie identité est fournie (electron-builder signe lui-même, y compris `Resources/bin/*` avec le runtime renforcé) — déjà en place : la signature ad hoc est sautée si `CSC_LINK`, `CSC_NAME` ou `mac.identity` est défini ; le contrôle `minos` reste actif.

### 4.5 Variables d'environnement
```bash
# Signature (si le certificat n'est pas dans le trousseau, ex. CI)
export CSC_LINK=/chemin/DeveloperID.p12        # ou contenu base64
export CSC_KEY_PASSWORD='…'

# Notarisation — option A : clé API
export APPLE_API_KEY=/chemin/AuthKey_XXXX.p8
export APPLE_API_KEY_ID=XXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# — option B : Apple ID
export APPLE_ID=moi@exemple.com
export APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop
export APPLE_TEAM_ID=TEAMID

npm run dist:dmg
```
Ne jamais committer ces valeurs (secrets GitHub Actions en CI).

### 4.6 Vérifier
```bash
codesign -dv --verbose=4 "dist-app/mac-arm64/CBW AI.app"        # Authority=Developer ID Application…, flags=runtime
spctl -a -vvv -t exec "dist-app/mac-arm64/CBW AI.app"           # source=Notarized Developer ID
xcrun stapler validate "dist-app/mac-arm64/CBW AI.app"
xcrun stapler staple "dist-app/CBW AI-1.0.0-arm64.dmg"           # agrafer aussi le DMG (vérif hors ligne)
spctl -a -vvv -t open --context context:primary-signature "dist-app/CBW AI-1.0.0-arm64.dmg"
```
La notarisation prend en général 1 à 15 min. En cas d'échec : `xcrun notarytool log <id> --key … --key-id … --issuer …`.

Attention : changer de signature (ad hoc → Developer ID) change l'exigence désignée → les utilisateurs devront ré-autoriser Micro / Accessibilité une fois.

---

## 5. Mises à jour automatiques

> **Implémenté sans Developer ID** : voir `docs/RELEASE.md` (CI à chaque push sur main) et `src/main/updater.ts` (latest.json → zip vérifié → remplacement au redémarrage). La suite décrit l'option `electron-updater`, possible seulement une fois l'app signée Developer ID.


`electron-updater` + fournisseur GitHub :
- `npm i electron-updater`, puis dans `package.json › build` :
  `"publish": [{ "provider": "github", "owner": "<owner>", "repo": "<repo>" }]`, cible `zip` en plus de `dmg` (Squirrel.Mac met à jour depuis le zip) et retirer `"writeUpdateInfo": false` du bloc `dmg`.
- `electron-builder --publish always` (avec `GH_TOKEN`) envoie `CBW-AI-…-arm64.zip`, le DMG et `latest-mac.yml` dans la release.
- Dans `src/main/main.ts`, après `app.whenReady()` et seulement si `app.isPackaged` :
  ```ts
  import { autoUpdater } from 'electron-updater';
  autoUpdater.checkForUpdatesAndNotify();   // télécharge en arrière-plan, installe au prochain redémarrage
  ```
  (+ une entrée « Rechercher les mises à jour » dans le menu de la barre de menus, et éventuellement un événement vers la fenêtre).
- **Prérequis bloquant : l'app doit être signée Developer ID** (Squirrel.Mac vérifie que la mise à jour porte la même signature ; une app ad hoc ne peut pas se mettre à jour). Tant que l'app n'est pas signée, la mise à jour reste manuelle : télécharger le nouveau DMG et remplacer l'app dans Applications (les réglages et le modèle dans `~/.dicta-ai` sont conservés).

---

## 6. Check-list de release
- [ ] `version` incrémentée dans `package.json`
- [ ] `npm run typecheck && npm run dist:dmg` sans erreur (le contrôle `minos` passe)
- [ ] Test sur un compte macOS neuf (ou `DICTA_AI_HOME=$(mktemp -d)`) : onboarding, téléchargement du modèle, dictée
- [ ] Aucune clé dans le bundle (`npx asar list "dist-app/mac-arm64/CBW AI.app/Contents/Resources/app.asar"`)
- [ ] Release GitHub avec l'asset `CBW-AI-arm64.dmg` + SHA-256 dans les notes
- [ ] Le lien `…/releases/latest/download/CBW-AI-arm64.dmg` télécharge bien la nouvelle version
