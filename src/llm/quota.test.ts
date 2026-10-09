// Tests du suivi de quota proactif (fetch simulé, aucune requête réseau, Ollama jamais chargé).
//   NODE_NO_WARNINGS=1 node --experimental-strip-types src/llm/quota.test.ts

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'dicta-quota-test-'));
Object.assign(process.env, {
  DICTA_AI_HOME: home,
  OLLAMA_HOST: 'http://127.0.0.1:9',
  GROQ_API_KEY: 'test-groq',
  GEMINI_API_KEY: 'test-gemini',
  ZAI_API_KEY: 'test-zai',
  OPENROUTER_API_KEY: 'test-openrouter',
  DICTA_HEDGE_MS: '5000',
});

const { cleanTranscriptDetailed, refreshQuotas, usableCloudProviders, setRouterLogger } = await import('./router.ts');
const quota = await import('./quota.ts');

const logs: string[] = [];
setRouterLogger((m) => logs.push(m));

// ───────────── fetch simulé ─────────────
type Reply = { status: number; headers?: Record<string, string>; body: unknown };
type Handler = (model: string) => Reply;
const calls: { host: string; model: string }[] = [];
let handlers: Record<string, Handler> = {};

const CLEAN = 'Alors bonjour, je voulais dire que le projet avance bien et que la réunion est prévue demain matin à neuf heures.';
const RAW = 'euh alors bonjour je voulais dire que euh le projet avance bien et que la réunion est prévue demain matin à neuf heures';

const ok = (model: string, headers: Record<string, string> = {}): Reply => ({
  status: 200,
  headers,
  body: { model, choices: [{ message: { content: CLEAN }, finish_reason: 'stop' }] },
});
const okGemini = (model: string): Reply => ({
  status: 200,
  body: { modelVersion: model, candidates: [{ content: { parts: [{ text: CLEAN }] }, finishReason: 'STOP' }] },
});
const tooMany = (headers: Record<string, string>, message = 'Rate limit reached on tokens per minute (TPM)'): Reply => ({
  status: 429,
  headers,
  body: { error: { message } },
});

const hostOf = (url: string) => {
  const h = new URL(url).host;
  return h.includes('groq') ? 'groq' : h.includes('googleapis') ? 'gemini' : h.includes('z.ai') ? 'zai' : h.includes('openrouter') ? 'openrouter' : h;
};

globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  const host = hostOf(url);
  let model = '';
  if (host === 'gemini') model = decodeURIComponent(url.split('/models/')[1].split(':')[0]);
  else model = JSON.parse(init?.body ?? '{}').model ?? '';
  if (host === '127.0.0.1:9') throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  calls.push({ host, model });
  const h = handlers[host];
  if (!h) throw new Error(`fetch inattendu : ${host} ${model}`);
  const r = h(model);
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json', ...(r.headers ?? {}) } });
}) as typeof fetch;

// ───────────── mini-harnais ─────────────
let failed = 0;
const check = (cond: unknown, label: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) failed++;
};
const reset = (order: string) => {
  process.env.DICTA_PROVIDERS = order;
  calls.length = 0;
  logs.length = 0;
};
const count = (host: string) => calls.filter((c) => c.host === host).length;
const wipeUsage = () => rmSync(join(home, 'usage.json'), { force: true });

// 0. Analyse des en-têtes
{
  check(quota.parseDuration('2m59.56s') === 179560, 'parseDuration 2m59.56s');
  check(quota.parseDuration('7.66s') === 7660 && quota.parseDuration('120ms') === 120 && quota.parseDuration('30') === 30000, 'parseDuration 7.66s / 120ms / 30');
  const h = new Headers({ 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '1h2m', 'x-ratelimit-remaining-tokens': '120', 'x-ratelimit-reset-tokens': '7.5s', 'retry-after': '8' });
  const p = quota.parseRateHeaders(h, 1_000_000);
  check(p.remReq === 0 && p.resetReqAt === 1_000_000 + 3_720_000 && p.remTok === 120 && p.resetTokAt === 1_007_500 && p.retryAfterMs === 8000, 'parseRateHeaders Groq');
  const o = quota.parseRateHeaders(new Headers({ 'x-ratelimit-remaining': '3', 'x-ratelimit-reset': String(1_800_000_000_000) }));
  check(o.remReq === 3 && o.resetReqAt === 1_800_000_000_000, 'parseRateHeaders OpenRouter (epoch ms)');
}

// 1. Groq 429 (avec en-têtes) sur ses 3 modèles → bascule Gemini ; dictée suivante : Groq sauté SANS requête.
{
  wipeUsage();
  reset('groq,gemini');
  handlers = {
    groq: () => tooMany({ 'retry-after': '30', 'x-ratelimit-remaining-tokens': '0', 'x-ratelimit-reset-tokens': '30s' }),
    gemini: okGemini,
  };
  const r1 = await cleanTranscriptDetailed(RAW);
  check(r1.provider === 'gemini', `1a. groq 429 ×3 modèles → gemini nettoie (${r1.provider}, groq essayé ${count('groq')}×)`);
  check(logs.some((l) => l.includes('après bascule')), '1a. bascule journalisée');
  reset('groq,gemini');
  const r2 = await cleanTranscriptDetailed(RAW);
  check(r2.provider === 'gemini' && count('groq') === 0, `1b. dictée suivante : groq sauté sans requête (${count('groq')} appel), gemini nettoie`);
  check(r2.attempts.some((a) => a.provider === 'groq' && a.outcome === 'skipped' && /quota épuisé/.test(a.message ?? '')), '1b. raison « quota épuisé » dans les tentatives');
}

// 1c. Succès Groq mais en-tête « 0 requête restante » (quota journalier) → sauté à la dictée suivante.
{
  wipeUsage();
  reset('groq,gemini');
  handlers = { groq: (m) => ok(m, { 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '3h' }), gemini: okGemini };
  const r1 = await cleanTranscriptDetailed(RAW);
  check(r1.provider === 'groq', '1c. groq répond (dernière requête du jour)');
  reset('groq,gemini');
  const r2 = await cleanTranscriptDetailed(RAW);
  // Le 1er modèle est épuisé → Groq passe directement au modèle suivant de sa rotation (sans requête au 1er).
  const firstModel = calls.find((c) => c.host === 'groq')?.model;
  check(r2.provider === 'groq' && firstModel !== 'qwen/qwen3.8-27b', `1c. modèle épuisé sauté, rotation Groq → ${firstModel}`);
}

// 2. Tous épuisés sauf un → le dernier nettoie, sans requête vers les autres.
{
  wipeUsage();
  const far = Date.now() + 3_600_000;
  for (const m of ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']) quota.blockModel('groq', m, 3_600_000, 'RPD', false);
  for (const m of ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']) quota.blockModel('gemini', m, far - Date.now(), 'per day', false);
  for (const m of ['glm-4.5-flash', 'glm-4.7-flash']) quota.blockModel('zai', m, 3_600_000, 'quota', false);
  reset('groq,gemini,zai,openrouter');
  handlers = { openrouter: ok };
  const r = await cleanTranscriptDetailed(RAW);
  check(r.provider === 'openrouter' && calls.every((c) => c.host === 'openrouter'), `2. seul openrouter disponible → il nettoie (${r.provider}, appels : ${calls.map((c) => c.host).join(',')})`);
  check(JSON.stringify(usableCloudProviders()) === '["openrouter"]', `2. usableCloudProviders = ${JSON.stringify(usableCloudProviders())}`);
}

// 3. Reset passé → le fournisseur revient.
{
  wipeUsage();
  reset('groq,gemini');
  handlers = { groq: () => tooMany({ 'retry-after': '1' }), gemini: okGemini };
  await cleanTranscriptDetailed(RAW);
  reset('groq,gemini');
  await cleanTranscriptDetailed(RAW);
  check(count('groq') === 0, '3a. groq en pause (retry-after 1 s) : sauté');
  await new Promise((r) => setTimeout(r, 1100));
  reset('groq,gemini');
  handlers = { groq: ok, gemini: okGemini };
  const r = await cleanTranscriptDetailed(RAW);
  check(r.provider === 'groq' && count('groq') === 1, `3b. après le reset, groq revient (${r.provider})`);
}

// 4. Tout est en pause « estimée » → dernier recours : on réessaie quand même plutôt que coller le texte brut.
{
  wipeUsage();
  for (const m of ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']) quota.blockModel('groq', m, 50_000, '429 sans info', true);
  for (const m of ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']) quota.blockModel('gemini', m, 40_000, 'RPM', false);
  reset('groq,gemini');
  handlers = { groq: () => tooMany({}), gemini: okGemini };
  const r = await cleanTranscriptDetailed(RAW);
  check(r.provider === 'gemini', `4a. tout en pause courte → dernier recours, gemini nettoie (${r.provider})`);
  // Spéculatif : pas de dernier recours (quota gardé pour l'appel final).
  for (const m of ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']) quota.blockModel('gemini', m, 40_000, 'RPM', false);
  reset('groq,gemini');
  const s = await cleanTranscriptDetailed(RAW, { speculative: true } as any);
  check(s.provider === 'passthrough' && calls.length === 0, `4b. spéculatif + tout en pause → aucun appel (${calls.length})`);
}

// 5. Vraiment tout échoue → texte brut, journal explicite avec la raison par fournisseur.
{
  wipeUsage();
  reset('groq,gemini');
  handlers = { groq: () => tooMany({ 'retry-after': '20' }), gemini: () => ({ status: 503, body: { error: { message: 'unavailable' } } }) };
  const r = await cleanTranscriptDetailed(RAW);
  const line = logs.find((l) => l.includes('ÉCHEC'));
  check(r.provider === 'passthrough' && r.model === 'fallbackClean' && !!line, `5. tout échoue → texte brut + journal « ${line?.slice(0, 60)}… »`);
}

// 6. Sonde de quota (début de dictée) : apprend l'épuisement AVANT la dictée.
{
  wipeUsage();
  reset('groq,zai,gemini');
  handlers = { groq: () => tooMany({ 'retry-after': '40' }, 'Rate limit reached on requests per day (RPD)'), zai: ok, gemini: okGemini };
  const probed = await refreshQuotas();
  check(probed.join(',') === 'groq,zai', `6a. sonde des 2 premiers : ${probed.join(',')}`);
  reset('groq,zai,gemini');
  const r = await cleanTranscriptDetailed(RAW);
  check(r.provider !== 'groq' && !calls.some((c) => c.host === 'groq' && c.model === 'qwen/qwen3.8-27b'), `6b. modèle sondé épuisé non réessayé (nettoyé par ${r.provider})`);
  const again = await refreshQuotas();
  check(!again.includes('zai') && !again.includes('groq'), `6c. pas de nouvelle sonde des fournisseurs vus < 5 min (sondés : ${again.join(',') || 'aucun'})`);
}

// 7. Modèle local (qwen3.5:4b) : ULTIME recours seulement — jamais appelé si un cloud répond, ni en spéculatif.
{
  process.env.OLLAMA_HOST = 'http://ollama.test';
  const ollama: Handler = (model) =>
    model ? { status: 200, body: { model, message: { content: CLEAN }, done: true, done_reason: 'stop' } } : { status: 200, body: { models: [{ name: 'qwen3.5:4b' }] } };
  wipeUsage();
  reset('groq,gemini,ollama');
  handlers = { groq: (m) => ok(m), gemini: okGemini, 'ollama.test': ollama };
  const r1 = await cleanTranscriptDetailed(RAW);
  check(r1.provider === 'groq' && count('ollama.test') === 0, `7a. cloud disponible → local jamais contacté (${count('ollama.test')} appel)`);
  wipeUsage();
  reset('groq,gemini,ollama');
  handlers = { groq: () => tooMany({ 'retry-after': '600' }), gemini: () => tooMany({ 'retry-after': '600' }, 'quota exceeded'), 'ollama.test': ollama };
  const r3 = await cleanTranscriptDetailed(RAW, { speculative: true } as any);
  check(r3.provider !== 'ollama' && count('ollama.test') === 0, `7b. nettoyage spéculatif : jamais de local (${r3.provider})`);
  reset('groq,gemini,ollama');
  const r2 = await cleanTranscriptDetailed(RAW);
  check(r2.provider === 'ollama' && r2.model === 'qwen3.5:4b', `7c. tous les quotas cloud épuisés → qwen3.5:4b en ultime recours (${r2.provider} ${r2.model})`);
  process.env.OLLAMA_HOST = 'http://127.0.0.1:9';
}

const usage = JSON.parse(readFileSync(join(home, 'usage.json'), 'utf8'));
check(usage.models && typeof usage.models === 'object', 'usage.json contient les quotas par modèle');
writeFileSync(join(home, 'done'), '');
rmSync(home, { recursive: true, force: true });
console.log(failed ? `\n${failed} échec(s)` : '\ntous les tests passent');
process.exitCode = failed ? 1 : 0;
