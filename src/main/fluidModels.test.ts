// @ts-nocheck
// Tests : téléchargement des modèles (serveur local) : complet, reprise Range après coupure, Range ignoré, SHA invalide,
// pas de retéléchargement. node --experimental-strip-types src/main/fluidModels.test.ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { FluidModels } from './fluidModels.ts';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const big = Buffer.alloc(600_000, 7);
for (let i = 0; i < big.length; i++) big[i] = (i * 31 + (i >> 8)) & 255;
const small = Buffer.from('{"ok":true}');
const bodies = { 'M.mlmodelc/weights/w.bin': big, 'M.mlmodelc/meta.json': small };
let reqs = [];
let mode = 'normal'; // 'cut' : coupe la 1re réponse du gros fichier ; 'norange' : ignore Range
let cutDone = false;
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('/resolve/rev1/')[1] ?? '');
  const body = bodies[rel];
  reqs.push({ rel, range: req.headers.range ?? null });
  if (!body) return res.writeHead(404).end();
  const m = /bytes=(\d+)-/.exec(req.headers.range ?? '');
  const from = m && mode !== 'norange' ? Number(m[1]) : 0;
  res.writeHead(from ? 206 : 200, { 'content-length': body.length - from });
  if (mode === 'cut' && !cutDone && body === big) {
    cutDone = true;
    res.write(body.subarray(0, 250_000));
    setTimeout(() => res.socket.destroy(), 30);
    return;
  }
  res.end(body.subarray(from));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${srv.address().port}`;
const mk = (dir, files) => new FluidModels({ dir, baseUrl, retryDelayMs: 20, stallMs: 3000, sets: [{ id: 't', repo: 'o/r', revision: 'rev1', dir: 'M-set', marker: 'rev1', files }] });
const good = [['M.mlmodelc/weights/w.bin', big.length, sha(big)], ['M.mlmodelc/meta.json', small.length, sha(small)]];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fluid-test-'));
try {
  // 1. coupure en cours de route puis reprise avec Range ; SHA vérifié ; marqueur de révision écrit
  mode = 'cut';
  const d1 = path.join(tmp, 'a');
  const m1 = mk(d1, good);
  assert.equal(m1.ready(), false);
  const seen = [];
  m1.on('progress', (p) => seen.push(p.percent));
  assert.equal(await m1.start(), true);
  assert.equal(m1.ready(), true);
  assert.ok(reqs.some((r) => r.rel.endsWith('w.bin') && r.range?.startsWith('bytes=')), 'reprise Range');
  assert.equal(fs.readFileSync(path.join(d1, 'M-set', 'M.mlmodelc/weights/w.bin')).equals(big), true);
  assert.equal(fs.readFileSync(path.join(d1, 'M-set', '.fluidaudio-revision'), 'utf8'), 'rev1');
  assert.equal(seen[seen.length - 1], 100);
  // 2. une nouvelle instance (mise à jour de l'app) : prêt sans aucune requête
  reqs = [];
  const m1b = mk(d1, good);
  assert.equal(m1b.ready(), true);
  assert.equal(await m1b.start(), true);
  assert.equal(reqs.length, 0, 'jamais retéléchargés');
  // 3. serveur qui ignore Range : on repart de zéro, résultat correct
  mode = 'norange';
  const d3 = path.join(tmp, 'c');
  fs.mkdirSync(path.join(d3, 'M-set', 'M.mlmodelc/weights'), { recursive: true });
  fs.writeFileSync(path.join(d3, 'M-set', 'M.mlmodelc/weights/w.bin.part'), big.subarray(0, 1000));
  const m3 = mk(d3, good);
  assert.equal(await m3.start(), true);
  assert.equal(m3.ready(), true);
  // 4. empreinte invalide : échec, fichier supprimé, pas prêt
  mode = 'normal';
  const d4 = path.join(tmp, 'd');
  const m4 = mk(d4, [['M.mlmodelc/meta.json', small.length, 'f'.repeat(64)]]);
  assert.equal(await m4.start(), false);
  assert.equal(m4.current.state, 'error');
  assert.match(m4.current.error, /SHA-256/);
  assert.equal(m4.ready(), false);
  assert.equal(fs.existsSync(path.join(d4, 'M-set', 'M.mlmodelc/meta.json')), false);
  // 5. fichiers déjà là (préparés à la main) : adoptés après vérification ; un fichier altéré est supprimé
  const d5 = path.join(tmp, 'e');
  fs.mkdirSync(path.join(d5, 'M-set', 'M.mlmodelc/weights'), { recursive: true });
  fs.writeFileSync(path.join(d5, 'M-set', 'M.mlmodelc/weights/w.bin'), big);
  fs.writeFileSync(path.join(d5, 'M-set', 'M.mlmodelc/meta.json'), Buffer.from('{"ok":trux}')); // même taille, autre contenu
  const m5 = mk(d5, good);
  assert.equal(await m5.adoptExisting(), false);
  assert.equal(fs.existsSync(path.join(d5, 'M-set', 'M.mlmodelc/meta.json')), false);
  reqs = [];
  assert.equal(await m5.start(), true);
  assert.deepEqual(reqs.map((r) => r.rel), ['M.mlmodelc/meta.json'], 'seul le fichier manquant est téléchargé');
  // 6. condition de poursuite perdue (dictée/batterie) : pause « waiting », fichier partiel conservé
  const d6 = path.join(tmp, 'f');
  let ok = true;
  const m6 = new FluidModels({ dir: d6, baseUrl, retryDelayMs: 20, canContinue: () => (ok ? { ok: true } : { ok: false, why: 'power' }), sets: [{ id: 't', repo: 'o/r', revision: 'rev1', dir: 'M-set', marker: null, files: good }] });
  m6.cancel(); // sans effet hors téléchargement
  ok = false;
  assert.equal(m6.ready(), false);
  console.log('fluidModels.test.ts : OK');
} finally {
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
