# Publier une version de CBW AI

**Je pousse sur `main` → nouvelle version automatiquement.** La CI GitHub (`.github/workflows/release.yml`, Mac Apple Silicon) compile whisper.cpp + le helper fn, vérifie (typecheck), construit, signe ad hoc (même exigence désignée → autorisations conservées), puis publie la release avec le DMG, le zip et `latest.json`. Les apps installées se mettent à jour toutes seules (téléchargement en arrière-plan, installation au redémarrage).

## Numéro de version
`<majeur>.<mineur>` de `package.json` + numéro de build : `1.0.42`, `1.0.43`… Rien n'est commité par la CI.
Pas de nouvelle version si le push ne touche que `docs/`, `site*/`, des captures ou des `.md`. Si le typecheck ou le build échoue, rien n'est publié.

## Commandes
```bash
npm run release            # vérifie (main, arbre propre, typecheck) puis git push → v1.0.<build>
npm run release minor      # 1.0.x → 1.1.0 (commit « release v1.1.0 ») puis push → v1.1.<build>
npm run release major      # → 2.0.<build>
npm run release -- --dry-run
```
Relancer à la main : GitHub › Actions › release › *Run workflow*. Version précise : `git tag -a v1.2.0 -m "notes" && git push origin v1.2.0`.

## Mise en route (une seule fois)
1. `gh auth login` (GitHub.com, HTTPS, navigateur).
2. Remplacer `OWNER` par ton identifiant GitHub dans **`package.json` › `cbw.repo`** et **`site-2/vercel.json`** (3 redirections).
3. Créer le dépôt public et pousser : `git add -A && git commit -m "CBW AI 1.0" && gh repo create CBW-AI --public --source . --push`.
4. **Clé de signature des mises à jour** (sans elle, la CI refuse de publier) : la clé privée est déjà sur ce Mac, dans `~/.cbw-ai-signing/update-signing-key` (hors dépôt, lisible par toi seul ; la clé publique correspondante est dans `src/main/updateVerify.ts`).
   - Copier la clé : `pbcopy < ~/.cbw-ai-signing/update-signing-key`
   - github.com › le dépôt › **Settings › Secrets and variables › Actions › New repository secret** : nom `UPDATE_SIGNING_KEY`, valeur : coller (⌘V) → *Add secret*.
   - Vider ensuite le presse-papiers (copier n'importe quel autre texte). Garder une sauvegarde du fichier (ex. gestionnaire de mots de passe) : si elle est perdue, il faudra une nouvelle paire de clés **et** une app réinstallée à la main par chaque utilisateur.
5. Vérifier : Actions › release (≈ 15 min la 1re fois, whisper.cpp ensuite en cache) → Releases › `CBW-AI-arm64.dmg`.
6. Site : Vercel › New Project › ce dépôt › *Root Directory* `site-2` (aucun build). `/download` redirige vers le dernier DMG.

## Assets d'une release
`CBW-AI-arm64.dmg` (nom stable, lien du site) · `CBW-AI-<v>-arm64.dmg` · `CBW-AI-<v>-arm64.zip` (mise à jour in-app) · `latest.json` (`version, date, notes, zipUrl, dmgUrl, sha256`, `sig` = signature Ed25519 vérifiée par l'app ; toute mise à jour non signée ou hors `https://github.com` est refusée) · `SHA256SUMS.txt`.

## Tester en local (sans rien publier)
`npm run dist:release` fabrique tout dans `dist-app/release/` (`SKIP_DMG=1` : zip seul ; `ASSET_BASE=http://127.0.0.1:8765` pour un serveur local).
Test de l'updater sur une **copie** de l'app : `CBW_UPDATE_URL=http://127.0.0.1:8765/latest.json CBW_INSTALL_PATH=/tmp/x/CBW\ AI.app DICTA_AI_HOME=/tmp/x/home CBW_UPDATE_DELAY_MS=3000` — jamais sur `/Applications`.
L'app vérifie la signature de `latest.json` et n'accepte que des URL GitHub Releases : pour un test local, signer le manifeste (`UPDATE_SIGNING_KEY="$(cat ~/.cbw-ai-signing/update-signing-key)" node scripts/sign-update.mjs sign dist-app/release/latest.json`) et servir le zip depuis une URL GitHub, sinon la mise à jour est refusée (comportement voulu).
