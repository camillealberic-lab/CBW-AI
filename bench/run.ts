// Benchmark du nettoyage : node --experimental-strip-types bench/run.ts <cible...> [--level light|standard] [--only c01,c12] [--cat correction]
// Cibles : ollama:qwen3.5:4b  gemini:gemini-2.5-flash-lite  groq:<model>  openrouter:<model>
//   --dry : aucun appel modèle ; vérifie les prompts, le repli sans IA (champ offline) et que postProcess accepte la sortie idéale.
//   Jeux : --cases cases-forme.jsonl (mise en forme v1.8), cases-contexte.jsonl, cases-fidelite.jsonl
// Résultats : bench/results/<cible>.json + résumé en console + bench/results/summary.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { finalizeText } from '../src/llm/router.ts';
import type { CleanLevel } from '../src/llm/prompt.ts';
import { thinkingConfigFor } from '../src/llm/providers/gemini.ts';
import { groqExtraBody } from '../src/llm/providers/groq.ts';
import { autoParagraphs } from '../src/llm/prompt.ts';
import { appProfile } from '../src/llm/format.ts';

interface Case { id: string; cat: string; raw: string; context?: import('../src/shared/types.ts').DictationContext; expected: string; must: string[]; mustNot: string[];
  /** Début attendu, casse comprise (raccord). */ starts?: string;
  /** Sortie attendue SANS IA (fallbackClean + passe finale) : vérifiée par --dry. */ offline?: string }
interface Row {
  id: string; cat: string; raw: string; expected: string; output: string; rawModel: string;
  ms: number; inTok?: number; rejected?: string; error?: string; skipped?: boolean;
  mustOk: boolean; missing: string[]; mustNotOk: boolean; leaked: string[]; fillerLeft: string[];
  /** Blocs (séparés par une ligne vide) attendus / obtenus ; paraOk = même structure (1 bloc vs plusieurs). */
  paraExp: number; paraOut: number; paraOk: boolean;
  /** Formes orales restées (t'as, y a, faut, négation sans « ne ») absentes de l'attendu. */
  oralLeft: string[];
  f1: number; lenRatio: number; score: number;
}

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
// --prompt <module> : autre version du prompt (ex. src/llm/prompt.v18.bench.ts) pour une mesure de non-régression.
const promptArg = flag('--prompt');
const { buildMessages, postProcess, GENERATION, PROMPT_VERSION, isEmptyDictation, shouldSkipLLM, fallbackClean } = (await import(
  promptArg ? new URL('../' + promptArg.replace(/^\.?\//, ''), import.meta.url).href : '../src/llm/prompt.ts'
)) as typeof import('../src/llm/prompt.ts');
const level = (flag('--level') ?? 'standard') as CleanLevel;
const only = flag('--only')?.split(',');
const cat = flag('--cat');
const vocabulary = flag('--vocab')?.split(',') ?? [];
const delayMs = Number(flag('--delay') ?? 0);
const casesFile = flag('--cases') ?? 'cases.jsonl';
const outDir = flag('--out'); // dossier des résultats JSON (défaut bench/results)
const mark = args.includes('--mark') ? (args.splice(args.indexOf('--mark'), 1), true) : false;
// --autopara : applique la passe de paragraphes de finalizeText (v1.10) à la sortie, comme l'app.
const autopara = args.includes('--autopara') ? (args.splice(args.indexOf('--autopara'), 1), true) : false;
// --rescore <fichier.json> : rejoue le score d'un résultat existant (avec --autopara : après la passe), sans appel modèle.
const rescore = flag('--rescore');
const dry = args.includes('--dry') ? (args.splice(args.indexOf('--dry'), 1), true) : false;
const targets = args.length ? args : [];
if (!targets.length && !dry && !rescore) {
  console.error('Précisez une cible (ex. groq:<modèle>). Plus de cible Ollama par défaut : Mac 16 Go, jamais charger un modèle local en test.');
  process.exit(1);
}
if (targets.some((t) => t.startsWith('ollama:')) && process.env.BENCH_ALLOW_OLLAMA !== '1') {
  console.error('Cible Ollama refusée (Mac 16 Go). BENCH_ALLOW_OLLAMA=1 pour forcer, uniquement sur accord explicite.');
  process.exit(1);
}

const ROOT = new URL('.', import.meta.url).pathname;
let cases: Case[] = readFileSync(casesFile.startsWith('/') ? casesFile : ROOT + casesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
if (only) cases = cases.filter((c) => only.includes(c.id));
if (cat) cases = cases.filter((c) => c.cat === cat);

// ───────────────────────────────────────────── appels modèles (autonomes)
/** Tokens d'entrée facturés par le dernier appel (usage renvoyé par l'API), pour mesurer le poids du prompt. */
let lastInTok: number | undefined;
async function call(target: string, system: string, user: string, maxTokens: number): Promise<string> {
  lastInTok = undefined;
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
    lastInTok = j.usageMetadata?.promptTokenCount;
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  }
  const base = prov === 'groq' ? 'https://api.groq.com/openai/v1' : prov === 'openrouter' ? 'https://openrouter.ai/api/v1' : '';
  if (!base) throw new Error(`fournisseur inconnu : ${prov}`);
  const key = process.env[prov === 'groq' ? 'GROQ_API_KEY' : 'OPENROUTER_API_KEY'];
  if (!key) throw new Error(`clé ${prov} manquante`);
  // Groq : exactement le corps de src/llm/providers/groq.ts (gpt-oss : raisonnement bas + marge ; qwen3 : sans réflexion).
  const body = JSON.stringify({ model, temperature: t, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(prov === 'groq' ? groqExtraBody(model, maxTokens) : { max_tokens: maxTokens }) });
  let r!: Response, j: any;
  // 429 (quota tokens/minute partagé avec les dictées de Camille) : on attend ce que l'API demande, 3 fois au plus.
  for (let attempt = 0; ; attempt++) {
    r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body, signal: AbortSignal.timeout(45_000) });
    j = await r.json();
    if (r.status !== 429 || attempt >= 3) break;
    const m = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(JSON.stringify(j));
    const waitS = Math.min(90, (m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : Number(r.headers.get('retry-after') ?? 20)) + 2);
    process.stdout.write(`    (429, attente ${Math.round(waitS)} s)\n`);
    await new Promise((res) => setTimeout(res, waitS * 1000));
  }
  if (!r.ok) throw new Error(`${r.status} ${String(j?.error?.message ?? JSON.stringify(j)).replace(/org_\w+/g, 'org_…').slice(0, 300)}`);
  lastInTok = j.usage?.prompt_tokens;
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
const FILLERS = ['euh', 'heu', 'hum', 'bah', 'ben ', 'du coup', 'genre ', 'tu vois', ' quoi.', ' quoi,', ' hein'];

/** Blocs séparés par une ligne vide ; une liste (lignes « 1. » / « - ») compte comme un bloc à part. */
function blocks(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\n\s*\n/).reduce((n, b) => n + (/\n(?:\d+\.|-) /.test(b) ? 2 : 1), 0);
}
/** Formes orales : t'as / t'es, y a, faut sans « il », négation sans « ne ». */
function oralForms(s: string): string[] {
  const t = ' ' + norm(s).replace(/\n/g, ' ') + ' ';
  const out: string[] = [];
  const count = (re: RegExp) => (t.match(re) ?? []).length;
  const pats: [string, RegExp][] = [
    ["t'as/t'es", /[\s,.](t'as|t'es)\s/g],
    ['y a', /[\s,.]y a\s/g],
    ['faut', /(?<!\bil )\b(faut|faudra|faudrait)\b/g],
  ];
  for (const [k, re] of pats) for (let i = count(re); i > 0; i--) out.push(k);
  const w = t.trim().split(/[\s,.;:!?]+/);
  w.forEach((x, i) => {
    if (x !== 'pas') return;
    const prev = w.slice(Math.max(0, i - 4), i);
    if (prev.some((p) => p === 'ne' || p.startsWith("n'"))) return;
    if (['ou', 'non', 'pourquoi', 'surtout', 'meme', 'mais'].includes(w[i - 1] ?? '') || w[i + 1] === 'mal') return;
    out.push('pas sans ne');
  });
  return out;
}

function score(c: Case, output: string, extra: Partial<Row>): Row {
  const missing = c.must.filter((m) => !has(output, m));
  if (c.starts && !output.startsWith(c.starts)) missing.push(`^${c.starts}`);
  const leaked = c.mustNot.filter((m) => has(output, m));
  const fillerLeft = FILLERS.filter((f) => ` ${norm(output)} `.includes(f) && !` ${norm(c.expected)} `.includes(f));
  const oe = oralForms(c.expected);
  const oralLeft = oralForms(output).filter((k) => { const i = oe.indexOf(k); if (i >= 0) { oe.splice(i, 1); return false; } return true; });
  const paraExp = blocks(c.expected), paraOut = blocks(output);
  const paraOk = !output.trim() ? paraExp === 0 : paraExp > 1 ? paraOut > 1 : paraOut === 1;
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
    mustOk: !missing.length, missing, mustNotOk: !leaked.length, leaked, fillerLeft, paraExp, paraOut, paraOk, oralLeft,
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


const codeLike = (c: Case) => ['terminal', 'code'].includes(appProfile(c.context));
const finish = (c: Case, out: string) => (autopara && out && !codeLike(c) ? autoParagraphs(out) : out);

if (rescore) {
  const j = JSON.parse(readFileSync(rescore, 'utf8'));
  const byId = new Map(cases.map((c) => [c.id, c]));
  const rows: Row[] = j.rows.filter((r: Row) => byId.has(r.id)).map((r: Row) => {
    const c = byId.get(r.id)!;
    return score(c, r.skipped || r.error || r.rejected ? r.output : finish(c, r.output), { rejected: r.rejected, error: r.error, skipped: r.skipped });
  });
  const avg = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0) / Math.max(1, rows.length);
  for (const r of rows) if (!r.paraOk || r.score < 9) console.log(`  ${r.id} ${r.score} ¶${r.paraOut}/${r.paraExp}  ${r.output.replace(/\n/g, ' ⏎ ').slice(0, 140)}`);
  console.log(`| ${j.target} | ${j.prompt}${autopara ? '+¶' : ''} | **${avg((r) => r.score).toFixed(2)}** | ${rows.filter((r) => r.mustOk).length}/${rows.length} | ${rows.filter((r) => r.mustNotOk).length}/${rows.length} | ${rows.filter((r) => !r.fillerLeft.length).length}/${rows.length} | ${rows.filter((r) => r.paraOk).length}/${rows.length} | ${rows.filter((r) => !r.oralLeft.length).length}/${rows.length} | ${avg((r) => r.f1).toFixed(2)} |`);
  process.exit(0);
}

// ───────────────────────────────────────────── --dry : sans aucun appel modèle
if (dry) {
  let bad = 0;
  const sysLen = buildMessages('x', { level }).system.length;
  console.log(`\n▶ dry (prompt ${PROMPT_VERSION}, niveau ${level}, ${cases.length} cas, système ${sysLen} car.)`);
  for (const c of cases) {
    const problems: string[] = [];
    const offline = isEmptyDictation(c.raw) ? '' : finalizeText(fallbackClean(c.raw), c.raw, { context: c.context });
    if (c.offline !== undefined && offline !== c.offline) problems.push(`repli sans IA : attendu ${JSON.stringify(c.offline)}, obtenu ${JSON.stringify(offline)}`);
    if (!isEmptyDictation(c.raw)) {
      try { postProcess(c.expected, c.raw); } catch (e) { problems.push(`postProcess rejette la sortie idéale : ${(e as Error).message}`); }
      const m = buildMessages(c.raw, { level, context: c.context });
      if (!m.user.startsWith('<dictée>')) problems.push('message user mal formé');
    }
    for (const x of c.must) if (!has(c.expected, x)) problems.push(`expected ne contient pas must « ${x} »`);
    for (const x of c.mustNot) if (has(c.expected, x)) problems.push(`expected contient mustNot « ${x} »`);
    if (c.starts && !c.expected.startsWith(c.starts)) problems.push(`expected ne commence pas par « ${c.starts} »`);
    if (problems.length) bad++;
    console.log(`  ${problems.length ? 'KO' : 'ok'} ${c.id} ${c.cat.padEnd(18)} ${shouldSkipLLM(c.raw) ? 'sans LLM' : 'LLM     '}${problems.map((p) => '\n       ' + p).join('')}`);
  }
  console.log(bad ? `\n${bad} cas en échec` : '\ntous les cas passent');
  process.exit(bad ? 1 : 0);
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
    const { system, user } = buildMessages(c.raw, { level, vocabulary, markCorrections: mark, context: c.context });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const t0 = performance.now();
    let rawModel = '', output = '', rejected: string | undefined, error: string | undefined;
    try {
      rawModel = await call(target, system, user, GENERATION.maxTokens(c.raw));
      try { output = finish(c, postProcess(rawModel, c.raw)); } catch (e) { rejected = (e as Error).message; output = rawModel.trim(); }
    } catch (e) { error = (e as Error).message; }
    const ms = Math.round(performance.now() - t0);
    const row = score(c, output, { rawModel, ms, inTok: lastInTok, rejected, error });
    rows.push(row);
    const flagStr = error ? 'ERR' : rejected ? 'REJ' : row.score >= 9 ? ' ok' : row.score >= 7 ? '  ~' : ' KO';
    const tags = `${row.paraOk ? '' : ` ¶${row.paraOut}/${row.paraExp}`}${row.oralLeft.length ? ` oral:${row.oralLeft.join(',')}` : ''}${row.fillerLeft.length ? ` filler:${row.fillerLeft.join(',').trim()}` : ''}`;
    process.stdout.write(`  ${flagStr} ${c.id} ${c.cat.padEnd(16)} ${String(row.score).padStart(5)}  ${ms}ms${tags}  ${(error ?? output).replace(/\n/g, ' ⏎ ').slice(0, 110)}\n`);
  }
  const run = rows.filter((r) => !r.skipped);
  const avg = (f: (r: Row) => number, rs = rows) => rs.reduce((a, r) => a + f(r), 0) / Math.max(1, rs.length);
  const lat = run.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)] ?? 0, p90 = lat[Math.floor(lat.length * 0.9)] ?? 0;
  const mem = target.startsWith('ollama:') ? await ollamaMem(target.slice(7)) : '—';
  const byCat = new Map<string, Row[]>();
  for (const r of rows) byCat.set(r.cat, [...(byCat.get(r.cat) ?? []), r]);
  const line = `| ${target} | ${PROMPT_VERSION}/${level}${mark ? '+mark' : ''} | **${avg((r) => r.score).toFixed(2)}** | ${rows.filter((r) => r.mustOk).length}/${rows.length} | ${rows.filter((r) => r.mustNotOk).length}/${rows.length} | ${rows.filter((r) => !r.fillerLeft.length).length}/${rows.length} | ${rows.filter((r) => r.paraOk).length}/${rows.length} | ${rows.filter((r) => !r.oralLeft.length).length}/${rows.length} | ${avg((r) => r.f1).toFixed(2)} | ${rows.filter((r) => r.rejected).length} | ${rows.filter((r) => r.error).length} | ${p50} / ${p90} | ${mem} |`;
  summary.push(line);
  console.log('\n' + line);
  const toks = run.map((r) => r.inTok).filter((n): n is number => typeof n === 'number');
  if (toks.length) console.log(`  tokens d'entrée (API) : moyenne ${Math.round(toks.reduce((a, b) => a + b, 0) / toks.length)}, min ${Math.min(...toks)}, max ${Math.max(...toks)}`);
  console.log('  par catégorie : ' + [...byCat].map(([k, v]) => `${k} ${avg((r) => r.score, v).toFixed(1)}`).join(' · '));
  const setTag = casesFile === 'cases.jsonl' ? '' : '_' + casesFile.replace(/^.*\//, '').replace(/\.jsonl$/, '');
  const dir = outDir ? (outDir.endsWith('/') ? outDir : outDir + '/') : `${ROOT}results/`;
  mkdirSync(dir, { recursive: true });
  const file = `${dir}${target.replace(/[:/]/g, '_')}__${PROMPT_VERSION}_${level}${mark ? '_mark' : ''}${setTag}.json`;
  writeFileSync(file, JSON.stringify({ target, prompt: PROMPT_VERSION, level, date: new Date().toISOString(), p50, p90, mem, rows }, null, 2));
}
const head = '| cible | prompt | score /10 | contenu ✔ | abandonné ✘ | sans filler | paragraphes ✔ | oral→écrit ✔ | F1 | rejets | erreurs | latence p50/p90 ms | RAM |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const sumFile = ROOT + 'results/summary.md';
const prev = existsSync(sumFile) ? readFileSync(sumFile, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| cible')) : [];
writeFileSync(sumFile, `# Benchmark Dicta AI\n\n${head}\n${[...prev, ...summary].join('\n')}\n`);
