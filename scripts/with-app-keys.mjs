#!/usr/bin/env node
// Lance une commande avec les clés API de l'app (secrets.json + secret.key, AES-256-GCM) en variables
// d'environnement, SANS jamais les afficher ni les écrire. Usage : node scripts/with-app-keys.mjs <commande> [args…]
// Ex. : node scripts/with-app-keys.mjs node --experimental-strip-types bench/run.ts groq:openai/gpt-oss-120b
import { spawn } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const home = process.env.DICTA_AI_HOME || path.join(os.homedir(), '.dicta-ai');
const ENV = { 'providers.groq.apiKey': 'GROQ_API_KEY', 'providers.gemini.apiKey': 'GEMINI_API_KEY', 'providers.openrouter.apiKey': 'OPENROUTER_API_KEY', 'providers.zai.apiKey': 'ZAI_API_KEY' };

const env = { ...process.env, OLLAMA_HOST: 'http://127.0.0.1:9' }; // jamais de modèle local en test
const found = [];
try {
  const key = Buffer.from(fs.readFileSync(path.join(home, 'secret.key'), 'utf8').trim(), 'base64');
  const { items } = JSON.parse(fs.readFileSync(path.join(home, 'secrets.json'), 'utf8'));
  for (const [k, item] of Object.entries(items ?? {})) {
    if (!ENV[k] || typeof item !== 'string' || !item.startsWith('v2:')) continue;
    try {
      const b = Buffer.from(item.slice(3), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      env[ENV[k]] = Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
      found.push(ENV[k]);
    } catch {
      /* élément illisible : ignoré */
    }
  }
} catch {
  console.error('with-app-keys : clés de l’app introuvables');
}
console.error(`with-app-keys : ${found.length ? found.join(', ') : 'aucune clé'} (valeurs jamais affichées)`);
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) process.exit(2);
const p = spawn(cmd, args, { env, stdio: 'inherit' });
p.on('exit', (code) => process.exit(code ?? 1));
