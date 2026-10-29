#!/usr/bin/env node
// Rapport de latence des dictées : node scripts/latency-report.mjs [N=60] [chemin du journal]
// Lit ~/.dicta-ai/dicta.log (`pipeline: résultat` et `router: mesure`). Aucun texte dicté : comptes et ms seulement.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const N = Math.max(1, parseInt(process.argv[2] ?? '', 10) || 60);
const file = process.argv[3] || path.join(os.homedir(), '.dicta-ai', 'dicta.log');
let lines;
try { lines = fs.readFileSync(file, 'utf8').split('\n'); } catch (e) { console.error(`Journal illisible : ${file}`); process.exit(1); }

const parse = (l, marker) => {
  const i = l.indexOf(marker);
  if (i < 0) return null;
  try { return JSON.parse(l.slice(i + marker.length).trim()); } catch { return null; }
};

// Regroupe : les « router: mesure » qui précèdent un « pipeline: résultat » lui appartiennent.
const dictations = [];
let pending = [];
for (const l of lines) {
  if (l.includes('router: mesure')) { const m = parse(l, 'router: mesure'); if (m) pending.push(m); }
  else if (l.includes('pipeline: résultat')) {
    const r = parse(l, 'pipeline: résultat');
    if (r?.timings) dictations.push({ r, mesures: pending });
    pending = [];
  }
}
const last = dictations.slice(-N);
if (!last.length) { console.log('Aucune dictée dans le journal.'); process.exit(0); }

const pct = (arr, p) => {
  const a = arr.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.min(a.length - 1, Math.ceil((p / 100) * a.length) - 1)];
};
const fmt = (v) => (v === null || v === undefined ? '  n/a' : String(Math.round(v)).padStart(5));
const row = (label, arr) => console.log(`${label.padEnd(34)} méd ${fmt(pct(arr, 50))} ms   p90 ${fmt(pct(arr, 90))} ms   (n=${arr.filter(Number.isFinite).length})`);
const t = (k) => last.map((d) => d.r.timings[k]);

console.log(`Rapport de latence : ${last.length} dernières dictées (journal : ${dictations.length})`);
console.log('');
row('Relâchement → collage (total)', t('totalAfterReleaseMs'));
row('  Whisper', t('whisperMs'));
row('  Nettoyage LLM', t('cleanMs'));
row('  Collage', t('insertMs'));

const skipped = last.filter((d) => /^(skip-short|leading-commands|empty|snippet)/.test(d.r.model ?? '') || d.r.choice === 'saut-llm' || d.r.choice === 'snippet').length;
const withLlm = last.filter((d) => d.r.provider !== 'passthrough' || /fallbackClean/.test(d.r.model ?? ''));
console.log('');
console.log(`Saut du LLM : ${skipped}/${last.length} (${Math.round((100 * skipped) / last.length)} %)`);
const cleanWithLlm = last.filter((d) => d.r.provider !== 'passthrough').map((d) => d.r.timings.cleanMs);
row('Nettoyage (dictées passées par LLM)', cleanWithLlm);

// Détail par tentative (lignes « router: mesure », absentes des anciennes dictées)
const ms = last.flatMap((d) => d.mesures);
console.log('');
if (!ms.length) {
  console.log('Pas encore de lignes « router: mesure » pour ces dictées (anciennes versions) : répartition attente/réseau/rejets indisponible.');
} else {
  const decisive = last.map((d) => d.mesures.filter((m) => m.status === 'ok').pop()).filter(Boolean);
  row('Tentative gagnante : attente avant envoi', decisive.map((m) => m.waitMs));
  row('Tentative gagnante : appel réseau+génération', decisive.map((m) => m.netMs));
  row('Tentative gagnante : post-traitement', decisive.map((m) => (m.callMs ?? NaN) - (m.netMs ?? NaN)));
  const tries = last.map((d) => d.r.tries).filter(Number.isFinite);
  if (tries.length) console.log(`Tentatives par dictée : moy ${(tries.reduce((a, b) => a + b, 0) / tries.length).toFixed(2)}, max ${Math.max(...tries)}`);
  console.log('');
  console.log('Statuts des tentatives :');
  const by = {};
  for (const m of ms) by[m.status] = (by[m.status] ?? 0) + 1;
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${String(v).padStart(4)}  (${Math.round((100 * v) / ms.length)} %)`);
  const rej = ms.filter((m) => String(m.status).startsWith('rejet:')).length;
  console.log(`Taux de rejets : ${rej}/${ms.length} tentatives (${Math.round((100 * rej) / ms.length)} %), ${last.filter((d) => d.mesures.some((m) => String(m.status).startsWith('rejet:'))).length}/${last.length} dictées`);
}

console.log('');
console.log('Choix final :');
const ch = {};
for (const d of last) ch[d.r.choice ?? '(non journalisé)'] = (ch[d.r.choice ?? '(non journalisé)'] ?? 0) + 1;
for (const [k, v] of Object.entries(ch).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${String(v).padStart(4)}`);

console.log('');
console.log('Part par modèle (résultat collé) :');
const mod = {};
for (const d of last) {
  const k = `${d.r.provider}/${d.r.model || '-'}`;
  (mod[k] ??= []).push(d.r.timings.cleanMs);
}
for (const [k, arr] of Object.entries(mod).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(40)} ${String(arr.length).padStart(3)} (${String(Math.round((100 * arr.length) / last.length)).padStart(2)} %)  nettoyage méd ${fmt(pct(arr, 50))} ms  p90 ${fmt(pct(arr, 90))} ms`);
}

// ─── Qualité en usage réel (nombres seulement) : ~/.dicta-ai/history.json, champs facultatifs ───
// path (llm / saut / repli), editRatio (retouches après collage, si relu), reverted (retour au brut).
console.log('');
console.log('Qualité (historique ~/.dicta-ai/history.json) :');
try {
  const h = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.dicta-ai', 'history.json'), 'utf8'));
  const rec = (Array.isArray(h?.recent) ? h.recent : []).filter((d) => (d.status ?? 'ok') === 'ok');
  const pathOf = (d) => d.path ?? (d.provider === 'passthrough' ? (d.model === 'skip-short' ? 'saut' : /^fallbackClean/.test(d.model ?? '') ? 'repli' : null) : d.provider && d.provider !== 'snippet' ? 'llm' : null);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  let any = false;
  for (const p of ['llm', 'saut', 'repli']) {
    const ds = rec.filter((d) => pathOf(d) === p);
    if (!ds.length) { console.log(`  ${p.padEnd(6)} 0 dictée`); continue; }
    any = true;
    const er = ds.map((d) => num(d.editRatio)).filter((v) => v !== null);
    const rr = ds.map((d) => num(d.rawToCleanRatio)).filter((v) => v !== null);
    const rev = ds.filter((d) => d.reverted === true).length;
    const f = (v) => (v === null ? 'n/a' : v.toFixed(3));
    console.log(`  ${p.padEnd(6)} ${String(ds.length).padStart(3)} dictées   editRatio moy ${f(avg(er))} (relues : ${er.length})   brut→nettoyé moy ${f(avg(rr))} (${rr.length})   retours au brut ${rev}/${ds.length} (${Math.round((100 * rev) / ds.length)} %)`);
  }
  // Cumul quotidien (perDay), plus long que les 50 dernières entrées
  const days = Object.values(h?.perDay ?? {}).map((b) => b?.quality).filter(Boolean);
  if (days.length) {
    console.log('  Cumul quotidien (perDay) :');
    for (const p of ['llm', 'saut', 'repli']) {
      const t = { n: 0, observed: 0, editSum: 0, reverted: 0 };
      for (const q of days) { const c = q[p]; if (c) for (const k of Object.keys(t)) t[k] += c[k] ?? 0; }
      if (!t.n) continue;
      console.log(`    ${p.padEnd(6)} ${String(t.n).padStart(4)} dictées   editRatio moy ${t.observed ? (t.editSum / t.observed).toFixed(3) : 'n/a'} (relues : ${t.observed})   retours au brut ${Math.round((100 * t.reverted) / t.n)} %`);
    }
  } else if (any) console.log('  (pas encore de cumul quotidien : champs ajoutés aux prochaines dictées)');
} catch {
  console.log('  Historique illisible ou absent.');
}
