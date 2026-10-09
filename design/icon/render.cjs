// Rendu PNG via Electron : npx electron design/icon/render.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const dir = __dirname;
const names = ['icon-a-graphite', 'icon-b-blanc', 'icon-c-halo'];
async function shot(html, w, h, out) {
  win.setContentSize(w, h);
  const tmp = path.join(dir, '.render-' + path.basename(out) + '.html'); fs.writeFileSync(tmp, html); await win.loadFile(tmp); fs.unlinkSync(tmp);
  await new Promise(r => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  fs.writeFileSync(out, img.toPNG());
}
let win;
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  for (const n of names) {
    const svg = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
    await shot(`<html><body style="margin:0;background:transparent">${svg}</body></html>`, 1024, 1024, path.join(dir, n + '.png'));
  }
  const sizes = [128, 64, 32, 16];
  const row = (bg, fg) => `<div style="background:${bg};padding:24px 28px;display:flex;flex-direction:column;gap:18px">` +
    names.map(n => `<div style="display:flex;align-items:center;gap:26px"><span style="width:120px;font:600 13px -apple-system;color:${fg}">${n.replace('icon-', '')}</span>` +
      sizes.map(s => `<img src="file://${dir}/${n}.png" width="${s}" height="${s}">`).join('') + '</div>').join('') + '</div>';
  const html = `<html><body style="margin:0">${row('#ECECEC', '#333')}${row('#1E1E20', '#ccc')}</body></html>`;
  await shot(html, 560, 2 * (48 + 3 * 128 + 36), path.join(dir, 'dock-preview.png'));
  app.quit();
});
