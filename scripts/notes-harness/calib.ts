// Calibrage de refineDiarization sur des sorties brutes en cache (<x>.di.json, voir diarize-cache.ts) :
// nombre de voix et répartition du temps de parole, avant (réglage du 15 oct., copié ici) / après (code actuel).
// Avec <x>.truth.json (fichiers synthétiques) : pureté = part du temps attribuée à la bonne voix (meilleure correspondance).
//   node --experimental-strip-types scripts/notes-harness/calib.ts <a.di.json> [b.di.json…]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { refineDiarization, type EngineDiarization, type EngineTurn } from '../../src/main/meetingEngineCore.ts';

/** Réglage du 15 oct. (avant recalibrage) : fusion par centroïdes pondérés cos ≥ 0,62, groupes < 1,5 s → tour voisin. */
function refineBefore(d: EngineDiarization): EngineDiarization {
  const minSim = 0.62;
  const minSec = 1.5;
  const dur = new Map<string, number>();
  for (const t of d.turns) dur.set(t.speaker, (dur.get(t.speaker) ?? 0) + t.end - t.start);
  let turns = d.turns;
  const emb = d.embeddings ?? {};
  const norm = (v: Float64Array) => { const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; for (let i = 0; i < v.length; i++) v[i] /= n; return v; };
  const g = [...dur.keys()].filter((k) => emb[k]).map((k) => ({ ids: [k], e: norm(Float64Array.from(emb[k])), w: dur.get(k)! }));
  const dot = (a: Float64Array, b: Float64Array) => a.reduce((s, x, i) => s + x * b[i], 0);
  while (g.length > 1) {
    let bi = 0, bj = 1, bs = -2;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const v = dot(g[i].e, g[j].e); if (v > bs) [bs, bi, bj] = [v, i, j]; }
    if (bs < minSim) break;
    const A = g[bi], B = g[bj];
    const e = norm(A.e.map((x, i) => (x * A.w + B.e[i] * B.w) / (A.w + B.w)));
    g.splice(bj, 1);
    g[bi] = { ids: [...A.ids, ...B.ids], e, w: A.w + B.w };
  }
  const map = new Map<string, string>();
  for (const x of g) for (const id of x.ids) map.set(id, x.ids[0]);
  turns = turns.map((t) => ({ ...t, speaker: map.get(t.speaker) ?? t.speaker }));
  const tot = new Map<string, number>();
  for (const t of turns) tot.set(t.speaker, (tot.get(t.speaker) ?? 0) + t.end - t.start);
  const small = new Set([...tot].filter(([, v]) => v < minSec).map(([k]) => k));
  if (small.size && small.size < tot.size) {
    const big = turns.filter((t) => !small.has(t.speaker));
    turns = turns.map((t) => {
      if (!small.has(t.speaker)) return t;
      let best = big[0], gap = Infinity;
      for (const b of big) { const x = Math.max(0, b.start - t.end, t.start - b.end); if (x < gap) { gap = x; best = b; } }
      return { ...t, speaker: best.speaker };
    });
  }
  const merged: EngineTurn[] = [];
  for (const t of turns.slice().sort((a, b) => a.start - b.start)) {
    const l = merged[merged.length - 1];
    if (l && l.speaker === t.speaker && t.start - l.end < 0.3) l.end = Math.max(l.end, t.end);
    else merged.push({ ...t });
  }
  return { ...d, turns: merged, speakerCount: new Set(merged.map((t) => t.speaker)).size };
}

function shares(turns: EngineTurn[]): string {
  const dur = new Map<string, number>();
  for (const t of turns) dur.set(t.speaker, (dur.get(t.speaker) ?? 0) + t.end - t.start);
  const tot = [...dur.values()].reduce((a, b) => a + b, 0) || 1;
  return [...dur.values()].sort((a, b) => b - a).map((v) => `${Math.round((100 * v) / tot)} %`).join(' / ');
}
/** Part du temps de parole réel (vérité) attribuée au groupe majoritaire de chaque voix, groupes distincts. */
function purity(turns: EngineTurn[], truth: { s: number; e: number; voice: string }[]): number {
  const m = new Map<string, Map<string, number>>();
  for (const v of truth)
    for (const t of turns) {
      const o = Math.min(v.e, t.end) - Math.max(v.s, t.start);
      if (o <= 0) continue;
      const x = m.get(v.voice) ?? new Map<string, number>();
      x.set(t.speaker, (x.get(t.speaker) ?? 0) + o);
      m.set(v.voice, x);
    }
  // affectation gloutonne voix → groupe (un groupe ne sert qu'une voix)
  const pairs = [...m].flatMap(([v, x]) => [...x].map(([g, o]) => ({ v, g, o }))).sort((a, b) => b.o - a.o);
  const usedV = new Set<string>(), usedG = new Set<string>();
  let ok = 0;
  for (const p of pairs) if (!usedV.has(p.v) && !usedG.has(p.g)) { usedV.add(p.v); usedG.add(p.g); ok += p.o; }
  const tot = truth.reduce((a, t) => a + t.e - t.s, 0) || 1;
  return ok / tot;
}

for (const f of process.argv.slice(2)) {
  const d: EngineDiarization = JSON.parse(fs.readFileSync(f, 'utf8'));
  const truthFile = f.replace(/\.di\.json$/, '.truth.json');
  const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, 'utf8')) : null;
  const a = refineBefore(d);
  const b = refineDiarization(d);
  const p = (r: EngineDiarization) => (truth ? `, pureté ${Math.round(100 * purity(r.turns, truth.turns))} %` : '');
  console.log(`${path.basename(f, '.di.json')}${truth ? ` (vérité ${truth.voices})` : ''} : bruts ${d.speakerCount} | avant ${a.speakerCount} [${shares(a.turns)}]${p(a)} | après ${b.speakerCount} [${shares(b.turns)}]${p(b)}`);
}
