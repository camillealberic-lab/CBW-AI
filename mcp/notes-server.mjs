#!/usr/bin/env node
// Serveur MCP local, LECTURE SEULE, des notes de réunion de CBW AI. stdio, JSON-RPC 2.0 (une requête par ligne),
// aucune dépendance. Lit uniquement ~/.dicta-ai/notes (index.json, <id>.json, <id>.txt) et les comptes rendus .md
// référencés par l'index, à condition qu'ils soient dans le dossier des notes (~/Documents/CBW AI/Notes).
// Ne lit jamais config.json, secrets.json, secret.key ni l'historique des dictées. N'écrit rien.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOME = process.env.DICTA_AI_HOME || path.join(os.homedir(), '.dicta-ai');
const NOTES = path.join(HOME, 'notes');
const OUT_DIR = path.resolve(process.env.DICTA_NOTES_DIR || path.join(os.homedir(), 'Documents', 'CBW AI', 'Notes'));
const ID_RE = /^[0-9]{8}T[0-9]{6}-[a-z0-9]{1,8}$/;
const MAX_MD = 400_000;

const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};
const index = () => {
  const v = readJson(path.join(NOTES, 'index.json'), []);
  return Array.isArray(v) ? v.filter((m) => m && ID_RE.test(String(m.id))) : [];
};
function readReport(meta) {
  const p = typeof meta.path === 'string' ? path.resolve(meta.path) : '';
  if (!p.endsWith('.md') || !p.startsWith(OUT_DIR + path.sep)) return '';
  try {
    return fs.readFileSync(p, 'utf8').slice(0, MAX_MD);
  } catch {
    return '';
  }
}
const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
function transcript(id) {
  const d = readJson(path.join(NOTES, `${id}.json`), null);
  if (d && Array.isArray(d.segments) && d.segments.length) {
    return d.segments.map((s) => `[${mmss(s.startMs || 0)}] ${s.speaker || 'Inconnu'} : ${s.text}`).join('\n');
  }
  try {
    return fs.readFileSync(path.join(NOTES, `${id}.txt`), 'utf8');
  } catch {
    return '';
  }
}
const summary = (m) => ({ id: m.id, title: m.title, createdAt: m.createdAt, durationMs: m.durationMs, words: m.words });

function listNotes({ limit = 20 } = {}) {
  const n = Math.max(1, Math.min(100, Number(limit) || 20));
  return index().slice(0, n).map(summary);
}
function getNote({ id }) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Identifiant de note invalide');
  const meta = index().find((m) => m.id === id);
  if (!meta) throw new Error('Note introuvable');
  return { ...summary(meta), report: readReport(meta), transcript: transcript(id) };
}
function searchNotes({ query, limit = 10 }) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) throw new Error('Requête vide');
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  const out = [];
  for (const m of index()) {
    const hay = { titre: m.title || '', 'compte rendu': readReport(m), transcription: transcript(m.id) };
    for (const [where, text] of Object.entries(hay)) {
      const i = text.toLowerCase().indexOf(q);
      if (i < 0) continue;
      out.push({ ...summary(m), where, excerpt: text.slice(Math.max(0, i - 80), i + q.length + 120).replace(/\s+/g, ' ').trim() });
      break;
    }
    if (out.length >= n) break;
  }
  return out;
}

const TOOLS = [
  {
    name: 'list_notes',
    description: 'Liste les notes de réunion CBW AI, les plus récentes d’abord (id, titre, date, durée, nombre de mots).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: '1 à 100 (défaut 20)' } } },
    run: listNotes,
  },
  {
    name: 'get_note',
    description: 'Lit une note : compte rendu organisé et transcription « qui a dit quoi » horodatée.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Identifiant renvoyé par list_notes' } }, required: ['id'] },
    run: getNote,
  },
  {
    name: 'search_notes',
    description: 'Recherche un mot ou une phrase dans les titres, comptes rendus et transcriptions des notes.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', description: '1 à 50 (défaut 10)' } },
      required: ['query'],
    },
    run: searchNotes,
  },
];

const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
function handle(msg) {
  const { id, method, params } = msg;
  const isReq = id !== undefined && id !== null;
  try {
    switch (method) {
      case 'initialize':
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'cbw-ai-notes', version: '1.0.0' },
          },
        });
      case 'ping':
        return isReq && send({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list':
        return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === params?.name);
        if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Outil inconnu : ${params?.name}` } });
        try {
          const data = tool.run(params?.arguments ?? {});
          return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
        } catch (e) {
          return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] } });
        }
      }
      default:
        if (isReq) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Méthode inconnue : ${method}` } });
    }
  } catch (e) {
    if (isReq) send({ jsonrpc: '2.0', id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
