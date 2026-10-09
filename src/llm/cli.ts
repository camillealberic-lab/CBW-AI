// CLI de test du router LLM.
//   node --experimental-strip-types src/llm/cli.ts "euh alors je voulais dire trois enfin non quatre"
//   node --experimental-strip-types src/llm/cli.ts --provider ollama "texte brut"
//   node --experimental-strip-types src/llm/cli.ts --status
// Options : --provider a,b (forcer l'ordre ; répétable), --level light|standard, --lang fr, --json, --test <id>

import type { ProviderId } from '../shared/types.ts';
import { ALL_PROVIDERS, configPath } from './config.ts';
import { PROMPT_VERSION } from './prompt.ts';
import { cleanTranscriptDetailed, providerStatuses, testProvider } from './router.ts';

const args = process.argv.slice(2);
const providers: ProviderId[] = [];
let status = false;
let json = false;
let level: 'light' | 'standard' | undefined;
let language: string | undefined;
let test: ProviderId | undefined;
const text: string[] = [];

const asProviders = (v: string | undefined): ProviderId[] => {
  const list = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const p of list) {
    if (!(ALL_PROVIDERS as string[]).includes(p)) {
      console.error(`fournisseur inconnu : ${p} (attendu : ${ALL_PROVIDERS.join(', ')})`);
      process.exit(2);
    }
  }
  return list as ProviderId[];
};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--provider' || a === '-p') providers.push(...asProviders(args[++i]));
  else if (a.startsWith('--provider=')) providers.push(...asProviders(a.slice(11)));
  else if (a === '--status') status = true;
  else if (a === '--json') json = true;
  else if (a === '--level') level = args[++i] === 'light' ? 'light' : 'standard';
  else if (a === '--lang') language = args[++i];
  else if (a === '--test') test = asProviders(args[++i])[0];
  else if (a === '-h' || a === '--help') {
    console.log('usage : cli.ts [--provider id[,id]] [--level light|standard] [--lang fr] [--json] "texte brut"\n        cli.ts --status | --test <id>');
    process.exit(0);
  } else text.push(a);
}

const fmtTime = (t: number | null) => (t ? new Date(t).toLocaleString('fr-FR') : '—');

if (status) {
  const st = await providerStatuses();
  if (json) console.log(JSON.stringify(st, null, 2));
  else {
    console.log(`config : ${configPath()}   prompt : ${PROMPT_VERSION}`);
    for (const s of st.sort((a, b) => (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank))) {
      const rank = s.rank < 0 ? '-' : String(s.rank + 1);
      const q = s.dailyLimit === null ? 'illimité' : `${s.usedToday}/${s.dailyLimit} aujourd'hui (reset ${fmtTime(s.resetAt)})`;
      console.log(`${rank}. ${s.id.padEnd(10)} ${s.uiStatus.padEnd(11)} ${s.model.padEnd(24)} ${q}`);
      if (s.reason) console.log(`   ↳ ${s.reason}`);
      if (s.lastError) console.log(`   ↳ dernière erreur (${fmtTime(s.lastError.at)}) ${s.lastError.kind} : ${s.lastError.message}`);
    }
  }
} else if (test) {
  const r = await testProvider(test);
  console.log(`${r.ok ? 'OK ' : 'ÉCHEC'} ${test} (${r.latencyMs} ms) — ${r.message}`);
  process.exitCode = r.ok ? 0 : 1;
} else {
  const raw = text.join(' ');
  if (!raw) {
    console.error('texte brut manquant (ou --status). --help pour l\'aide.');
    process.exit(2);
  }
  const r = await cleanTranscriptDetailed(raw, { providers: providers.length ? providers : undefined, level, language });
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(r.text);
    console.error(`\n— ${r.provider} · ${r.model} · ${r.latencyMs} ms`);
    for (const a of r.attempts) {
      console.error(`  ${a.provider}: ${a.outcome}${a.latencyMs !== undefined ? ` (${a.latencyMs} ms)` : ''}${a.message ? ` — ${a.message}` : ''}`);
    }
  }
}
