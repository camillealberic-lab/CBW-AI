// Mesure du poids des prompts de dictée (v1.5 / v1.11 / v1.12) : tokens du prompt système, d'une requête type
// (courte, ~60 mots, ~300 mots) et budget de sortie (maxTokens). Compte exact via l'API countTokens de Gemini
// (gratuite, ne consomme pas le quota de génération) si GEMINI_API_KEY est présente, sinon estimation 3,4 car./token.
//   node scripts/with-app-keys.mjs node --experimental-strip-types bench/tokens.ts [--json chemin]
import { readFileSync, writeFileSync } from 'node:fs';

type PromptModule = typeof import('../src/llm/prompt.ts');
const VERSIONS: [string, string][] = [
  ['v1.5', './prompt.v15.bench.ts'],
  ['v1.11', './prompt.v111.bench.ts'],
  ['v1.12', '../src/llm/prompt.ts'],
];
const ROOT = new URL('.', import.meta.url).pathname;
const raws = (f: string) => readFileSync(ROOT + f, 'utf8').trim().split('\n').map((l) => JSON.parse(l).raw as string);
const oral = raws('cases-oral-long.jsonl');
const REQUESTS: [string, string][] = [
  ['courte', 'euh alors on se voit demain à trois heures enfin non quatre heures pour parler du projet'],
  ['~60 mots', oral.find((r) => r.split(/\s+/).length >= 60 && r.split(/\s+/).length <= 75) ?? oral[0]],
  ['~300 mots', oral.slice(0, 4).join(' ')],
];

const key = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.5-flash-lite';
async function count(text: string): Promise<number> {
  if (!key) return Math.ceil(text.length / 3.4);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }] }] }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.totalTokens;
}

const out: any = { source: key ? `countTokens ${MODEL}` : 'estimation 3,4 car./token', versions: {} };
for (const [v, path] of VERSIONS) {
  const m = (await import(new URL(path, import.meta.url).href)) as PromptModule;
  const system = m.buildSystemPrompt({ level: 'standard' });
  const sysTok = await count(system);
  const reqs: any[] = [];
  for (const [name, raw] of REQUESTS) {
    const { user } = m.buildMessages(raw, { level: 'standard' });
    reqs.push({ name, words: raw.split(/\s+/).length, userTok: await count(user), maxTokens: m.GENERATION.maxTokens(raw) });
  }
  out.versions[v] = { sysChars: system.length, sysTok, reqs };
  console.log(`${v.padEnd(6)} système ${system.length} car. = ${sysTok} tokens · ` + reqs.map((r) => `${r.name} (${r.words} mots) : user ${r.userTok}, total entrée ${sysTok + r.userTok}, maxTokens ${r.maxTokens}`).join(' · '));
}
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 2));
