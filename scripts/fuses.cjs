// Fusibles Electron (docs/SECURITY.md › « Fusibles ») : désactivent à la compilation les portes d'entrée
// qui permettraient de détourner le binaire signé de CBW AI pour exécuter du code arbitraire avec SES
// autorisations macOS (Micro, Accessibilité, Surveillance de l'entrée, trousseau).
//
// À appeler depuis scripts/after-pack.cjs AVANT toute signature (modifier le binaire invalide la signature) :
//   const { applyFuses } = require('./fuses.cjs');
//   await applyFuses(appPath);            // juste après le calcul de appPath, avant les appels codesign
//
// (Alternative équivalente : clé "electronFuses" dans la config electron-builder de package.json.)
const path = require('node:path');
const fs = require('node:fs');

async function applyFuses(appPath) {
  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  const macos = path.join(appPath, 'Contents', 'MacOS');
  const exe = fs.readdirSync(macos).find((f) => !f.startsWith('.'));
  if (!exe) throw new Error(`fuses : exécutable introuvable dans ${macos}`);
  // EnableEmbeddedAsarIntegrityValidation exige la clé ElectronAsarIntegrity dans Info.plist (electron-builder
  // l'écrit pour une app asar) : sinon l'app refuserait de démarrer → on ne l'active que si elle est présente.
  const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8');
  const asarIntegrity = plist.includes('ElectronAsarIntegrity');
  await flipFuses(path.join(macos, exe), {
    version: FuseVersion.V1,
    // La signature ad hoc / Developer ID est refaite juste après par after-pack.cjs / electron-builder.
    resetAdHocDarwinSignature: true,
    [FuseV1Options.RunAsNode]: false, // ELECTRON_RUN_AS_NODE=1 "CBW AI" script.js → refusé (utilityProcess reste OK)
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // NODE_OPTIONS=--require … ignoré
    [FuseV1Options.EnableNodeCliInspectArguments]: false, // --inspect / --inspect-brk ignorés
    [FuseV1Options.OnlyLoadAppFromAsar]: true, // pas de dossier Resources/app/ substitué
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: asarIntegrity, // app.asar modifié → refus de démarrer
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: true, // pages chargées en file:// (loadFile) : garder
  });
  console.log(`  • fusibles Electron appliqués (${exe}${asarIntegrity ? ', intégrité asar' : ', SANS intégrité asar : clé Info.plist absente'})`);
}

module.exports = { applyFuses };

// Usage manuel : node scripts/fuses.cjs "dist-app/mac-arm64/CBW AI.app" (puis re-signer : codesign --force --deep -s - …)
if (require.main === module) {
  const p = process.argv[2];
  if (!p) {
    console.error('usage : node scripts/fuses.cjs "<chemin>/CBW AI.app"');
    process.exit(2);
  }
  applyFuses(path.resolve(p)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
