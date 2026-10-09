// Benchmark du nettoyage : node --experimental-strip-types bench/run.ts <cible...> [--level light|standard] [--only c01,c12] [--cat correction]
// Cibles : ollama:qwen3.5:4b  gemini:gemini-2.5-flash-lite  groq:<model>  openrouter:<model>
// Résultats : bench/results/<cible>.json + résumé en console + bench/results/summary.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { buildMessages, postProcess, GENERATION, PROMPT_VERSION, isEmptyDictation, shouldSkipLLM, fallbackClean } from '../src/llm/prompt.ts';
import type { CleanLevel } from '../src/llm/prompt.ts';
import { thinkingConfigFor } from '../src/llm/providers/gemini.ts';

interface Case { id: string; cat: string; raw: string; expected: string; must: string[]; mustNot: string[] }
interface Row {
  id: string; cat: string; raw: string; expected: string; output: string; rawModel: string;
  ms: number; rejected?: string; error?: string; skipped?: boolean;
  mustOk: boolean; missing: string[]; mustNotOk: boolean; leaked: string[]; fillerLeft: string[];
  f1: number; lenRatio: number; score: number;
}

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const level = (flag('--level') ?? 'standard') as CleanLevel;
const only = flag('--only')?.split(',');
const cat = flag('--cat');
const vocabulary = flag('--vocab')?.split(',') ?? [];
const delayMs = Number(flag('--delay') ?? 0);
const mark = args.includes('--mark') ? (args.splice(args.indexOf('--mark'), 1), true) : false;
const targets = args.length ? args : ['ollama:qwen3.5:4b'];

const ROOT = new URL('.', import.meta.url).pathname;
let cases: Case[] = readFileSync(ROOT + 'cases.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
if (only) cases = cases.filter((c) => only.includes(c.id));
if (cat) cases = cases.filter((c) => c.cat === cat);

// ───────────────────────────────────────────── appels modèles (autonomes)
async function call(target: string, system: string, user: string, maxTokens: number): Promise<string> {
  const [prov, ...rest] = target.split(':');
  const model = rest.join(':');
  const t = GENERATION.temperature;
  if (prov === 'ollama') {
    const r = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: '30m',
        options: { temperature: t, num_predict: maxTokens, num_ctx: 4096 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`);
    return j.message?.content ?? '';
  }
  if (prov === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY manquante');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: t, maxOutputTokens: maxTokens, thinkingConfig: thinkingConfigFor(model) },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  }
  const base = prov === 'groq' ? 'https://api.groq.com/openai/v1' : prov === 'openrouter' ? 'https://openrouter.ai/api/v1' : '';
  if (!base) throw new Error(`fournisseur inconnu : ${prov}`);
  const key = process.env[prov === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'];
  if (!key) throw new Error(`clé ${prov} manquante`);
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: t, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(30_000),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j.choices?.[0]?.message?.content ?? '';
}

// ───────────────────────────────────────────── scoring
const NUM: Record<string, string> = { un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9', dix: '10' };
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[’]/g, "'").replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1');
const numNorm = (s: string) => norm(s).replace(/\b(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/g, (w) => NUM[w]);
const has = (hay: string, needle: string) => norm(hay).includes(norm(needle)) || numNorm(hay).includes(numNorm(needle));
const tokens = (s: string) => numNorm(s).split(/[^\p{L}\p{N}']+/u).filter(Boolean);
function f1(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return A.length === B.length ? 1 : 0;
  const bag = new Map<string, number>();
  for (const w of B) bag.set(w, (bag.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of A) { const n = bag.get(w) ?? 0; if (n > 0) { hit++; bag.set(w, n - 1); } }
  const p = hit / A.length, r = hit / B.length;
  return p + r ? (2 * p * r) / (p + r) : 0;
}
const FILLERS = ['euh', 'heu', 'hum', 'bah', 'ben ', 'du coup', 'genre ', 'tu vois', ' quoi.', ' quoi,'];

function score(c: Case, output: string, extra: Partial<Row>): Row {
  const missing = c.must.filter((m) => !has(output, m));
  const leaked = c.mustNot.filter((m) => has(output, m));
  const fillerLeft = FILLERS.filter((f) => ` ${norm(output)} `.includes(f) && !` ${norm(c.expected)} `.includes(f));
  const fs = f1(output, c.expected);
  const lenRatio = tokens(output).length / Math.max(1, tokens(c.expected).length);
  // Score /10 : contenu obligatoire 4, rien d'abandonné 3, fillers 1, proximité 2. Rejet = 0.
  let s = 0;
  if (!extra.rejected && !extra.error) {
    s += 4 * (c.must.length ? (c.must.length - missing.length) / c.must.length : 1);
    s += 3 * (c.mustNot.length ? (c.mustNot.length - leaked.length) / c.mustNot.length : 1);
    s += fillerLeft.length ? 0 : 1;
    s += 2 * fs;
  }
  return {
    id: c.id, cat: c.cat, raw: c.raw, expected: c.expected, output, rawModel: '', ms: 0, ...extra,
    mustOk: !missing.length, missing, mustNotOk: !leaked.length, leaked, fillerLeft,
    f1: +fs.toFixed(3), lenRatio: +lenRatio.toFixed(2), score: +s.toFixed(2),
  } as Row;
}

async function ollamaMem(model: string): Promise<string> {
  try {
    const j: any = await (await fetch('http://localhost:11434/api/ps')).json();
    const m = j.models?.find((x: any) => x.name === model || x.model === model);
    return m ? `${(m.size / 1e9).toFixed(1)} Go` : '?';
  } catch { return '?'; }
}

// ───────────────────────────────────────────── main
mkdirSync(ROOT + 'results', { recursive: true });
const summary: string[] = [];
for (const target of targets) {
  const rows: Row[] = [];
  process.stdout.write(`\n▶ ${target} (prompt ${PROMPT_VERSION}, niveau ${level}, ${cases.length} cas)\n`);
  if (target.startsWith('ollama:')) { // préchauffe : ne pas compter le chargement du modèle
    try { await call(target, 'Réponds OK.', 'OK', 4); } catch (e) { console.log('  préchauffe échouée :', (e as Error).message); }
  }
  for (const c of cases) {
    if (isEmptyDictation(c.raw)) { rows.push(score(c, '', { skipped: true })); continue; }
    if (shouldSkipLLM(c.raw)) { rows.push(score(c, fallbackClean(c.raw), { skipped: true })); continue; }
    const { system, user } = buildMessages(c.raw, { level, vocabulary, markCorrections: mark });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const t0 = performance.now();
    let rawModel = '', output = '', rejected: string | undefined, error: string | undefined;
    try {
      rawModel = await call(target, system, user, GENERATION.maxTokens(c.raw));
      try { output = postProcess(rawModel, c.raw); } catch (e) { rejected = (e as Error).message; output = rawModel.trim(); }
    } catch (e) { error = (e as Error).message; }
    const ms = Math.round(performance.now() - t0);
    const row = score(c, output, { rawModel, ms, rejected, error });
    rows.push(row);
    const flagStr = error ? 'ERR' : rejected ? 'REJ' : row.score >= 9 ? ' ok' : row.score >= 7 ? '  ~' : ' KO';
    process.stdout.write(`  ${flagStr} ${c.id} ${c.cat.padEnd(16)} ${String(row.score).padStart(5)}  ${ms}ms  ${(error ?? output).replace(/\n/g, ' ⏎ ').slice(0, 110)}\n`);
  }
  const run = rows.filter((r) => !r.skipped);
  const avg = (f: (r: Row) => number, rs = rows) => rs.reduce((a, r) => a + f(r), 0) / Math.max(1, rs.length);
  const lat = run.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0, p90 = lat[Math.floor(lat.length * 0.9)] ?? 0;
  const mem = target.startsWith('ollama:') ? await ollamaMem(target.slice(7)) : '—';
  const byCat = new Map<string, Row[]>();
  for (const r of rows) byCat.set(r.cat, [...(byCat.get(r.cat) ?? []), r]);
  const line = `| ${target} | ${PROMPT_VERSION}/${level}${mark ? '+mark' : ''} | **${avg((r) => r.score).toFixed(2)}** | ${rows.filter((r) => r.mustOk).length}/${rows.length} | ${rows.filter((r) => r.mustNotOk).length}/${rows.length} | ${rows.filter((r) => !r.fillerLeft.length).length}/${rows.length} | ${avg((r) => r.f1).toFixed(2)} | ${rows.filter((r) => r.rejected).length} | ${rows.filter((r) => r.error).length} | ${p50} / ${p90} | ${mem} |`;
  summary.push(line);
  console.log('\n' + line);
  console.log('  par catégorie : ' + [...byCat].map(([k, v]) => `${k} ${avg((r) => r.score, v).toFixed(1)}`).join(' · '));
  const file = `${ROOT}results/${target.replace(/[:/]/g, '_')}__${PROMPT_VERSION}_${level}${mark ? '_mark' : ''}.json`;
  writeFileSync(file, JSON.stringify({ target, prompt: PROMPT_VERSION, level, date: new Date().toISOString(), p50, p90, mem, rows }, null, 2));
}
const head = '| cible | prompt | score /10 | contenu ✔ | abandonné ✘ | sans filler | F1 | rejets | erreurs | latence p50/p90 ms | RAM |\n|---|---|---|---|---|---|---|---|---|---|---|';
const sumFile = ROOT + 'results/summary.md';
const prev = existsSync(sumFile) ? readFileSync(sumFile, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| cible')) : [];
writeFileSync(sumFile, `# Benchmark Dicta AI\n\n${head}\n${[...prev, ...summary].join('\n')}\n`);
