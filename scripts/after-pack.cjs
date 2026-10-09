// electron-builder afterPack : fusibles Electron puis signature ad hoc (identity: null) pour que macOS (TCC)
// attribue Micro / Accessibilité à « CBW AI » lui-même, et non au terminal.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const appPath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  // Fusibles Electron (RunAsNode, NODE_OPTIONS, --inspect off…) AVANT toute signature : modifier le binaire
  // invalide la signature. Même hook en local et en CI (package-release.sh → electron-builder → afterPack).
  await require('./fuses.cjs').applyFuses(appPath);
  const bin = path.join(appPath, 'Contents', 'Resources', 'bin');
  const run = (...a) => execFileSync('codesign', a, { stdio: 'inherit' });
  // Garde-fou : un binaire compilé pour un macOS plus récent que minimumSystemVersion ne se lancerait pas
  // chez les utilisateurs (ex. whisper-server « minos 26.0 » sur macOS 14/15).
  const minOs = ctx.packager.platformSpecificBuildOptions.minimumSystemVersion || '14.0';
  if (fs.existsSync(bin))
    for (const f of fs.readdirSync(bin)) {
      const out = execFileSync('vtool', ['-show-build', path.join(bin, f)], { encoding: 'utf8' });
      const m = out.match(/minos (\d+(?:\.\d+)?)/);
      if (m && parseFloat(m[1]) > parseFloat(minOs))
        throw new Error(`${f} exige macOS ${m[1]} > ${minOs} : recompiler (npm run setup:whisper / build:fnwatch)`);
    }
  // Vraie identité Developer ID (cf. docs/DISTRIBUTION.md) : electron-builder signe lui-même.
  if (process.env.CSC_LINK || process.env.CSC_NAME || ctx.packager.platformSpecificBuildOptions.identity) return;
  if (fs.existsSync(bin))
    for (const f of fs.readdirSync(bin)) run('--force', '-s', '-', path.join(bin, f));
  run('--force', '--deep', '-s', '-', appPath);
  // Exigence désignée stable (identifiant, pas le cdhash) : les autorisations Micro / Accessibilité
  // accordées à « CBW AI » restent valides d'une réinstallation à l'autre.
  run('--force', '-s', '-', '-r=designated => identifier "com.dicta-ai.app"', appPath);
  run('--verify', '--deep', '--strict', appPath);
  console.log('  • signature ad hoc OK', appPath);
};
