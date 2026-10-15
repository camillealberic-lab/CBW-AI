import { clipboard, Notification } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { selectedText } from './context';
import { restore, sendCommandKey, snapshot } from './insert';
import { distDir, log, textForLog } from './paths';
import type { Pipeline } from './pipeline';
import { settings } from './settings';

/**
 * Réécrire la sélection à la voix (f2) et raccourcis de réécriture personnalisés (f3).
 * Flux f2 : startRewrite() capte la sélection de l'app active, démarre l'enregistrement de la CONSIGNE ; au
 * relâchement (pipeline.end(), même geste que la dictée) la consigne est transcrite, rewriteSelection() produit
 * le texte, qui est collé à la place de la sélection (toujours active dans l'app). Aucun texte n'est journalisé.
 */
export interface RewriteOptions {
  language?: string;
  signal?: AbortSignal;
  context?: { app?: string; bundleId?: string; url?: string; names?: string[] };
}
/** Signature attendue de src/llm/rewrite.ts (agent LLM, en parallèle). Interface locale tant que le fichier n'existe pas. */
export interface RewriteModule {
  rewriteSelection(selected: string, instruction: string, opts: RewriteOptions): Promise<string | { text: string }>;
}

export const MAX_SELECTION = 12_000;
let mod: RewriteModule | null = null;
function loadModule(): RewriteModule | null {
  if (mod) return mod;
  const p = path.join(distDir(), 'llm', 'rewrite.js');
  if (!fs.existsSync(p)) return null;
  try {
    const m = require(p);
    if (typeof m.rewriteSelection === 'function') mod = m as RewriteModule;
  } catch (e) {
    log('rewrite: chargement de llm/rewrite impossible', e instanceof Error ? e.message : e);
  }
  return mod;
}

export const rewriteEnabled = (): boolean => settings.get('rewrite.enabled') !== false;

export async function performRewrite(selected: string, instruction: string, opts: RewriteOptions = {}): Promise<string> {
  const m = loadModule();
  if (!m) throw new Error('Réécriture indisponible (module IA absent)');
  const t0 = Date.now();
  const out = await m.rewriteSelection(selected, instruction, opts);
  const text = (typeof out === 'string' ? out : out?.text ?? '').trim();
  if (!text) throw new Error('Réécriture vide');
  log('rewrite: ok', { sel: textForLog(selected), instr: textForLog(instruction), out: textForLog(text), ms: Date.now() - t0 });
  return text;
}

/** Sélection de l'app active : Accessibilité (AXSelectedText) d'abord, repli ⌘C (presse-papiers restauré). */
export async function captureSelection(pipeline: Pipeline): Promise<{ text: string; bundleId?: string } | null> {
  const ax = await selectedText();
  if (ax) return { text: ax.text, bundleId: ax.bundleId || undefined };
  if (!pipeline.trusted()) return null;
  const prev = snapshot();
  const marker = `​${Date.now()}`;
  try {
    clipboard.writeText(marker);
    await sendCommandKey('c', pipeline.uiohook());
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const t = await clipboard.readText();
      if (t !== marker) return t.trim() ? { text: t } : null;
    }
    return null;
  } catch (e) {
    log('rewrite: ⌘C échoué', e instanceof Error ? e.message : e);
    return null;
  } finally {
    void prev.then((p) => restore(p)).catch(() => undefined);
  }
}

let host: Pipeline | null = null;
export const bindRewrite = (p: Pipeline): void => {
  host = p;
};

function alert(kind: 'no-selection' | 'too-long' | 'disabled' | 'error', message: string): void {
  host?.emit('alert', { kind, message });
  if (Notification.isSupported()) new Notification({ title: 'CBW AI', body: message, silent: true }).show();
}

/**
 * f2 — Déclencheur pour KEYS : appeler au début du geste (appui). Retourne false si rien n'est sélectionné.
 * Le relâchement appelle pipeline.end() comme pour une dictée.
 */
export async function startRewrite(): Promise<boolean> {
  if (!host) return false;
  if (!rewriteEnabled()) return (alert('disabled', 'Réécriture désactivée dans les réglages'), false);
  const sel = await captureSelection(host);
  if (!sel) return (alert('no-selection', 'Sélectionne d’abord du texte à réécrire'), false);
  if (sel.text.length > MAX_SELECTION) return (alert('too-long', 'Sélection trop longue (12 000 caractères max)'), false);
  await host.begin({ rewrite: { selected: sel.text } });
  return true;
}

export interface RewritePreset {
  id: string;
  name: string;
  instruction: string;
}
/** Réglage `rewrite.presets` : chaîne JSON [{id,name,instruction}] (≤ 20 raccourcis). */
export function getRewritePresets(): RewritePreset[] {
  try {
    const arr = JSON.parse(String(settings.get('rewrite.presets') || '[]'));
    return (Array.isArray(arr) ? arr : [])
      .filter((x) => x && typeof x.id === 'string' && typeof x.instruction === 'string' && x.instruction.trim())
      .slice(0, 20)
      .map((x) => ({ id: String(x.id).slice(0, 40), name: String(x.name ?? x.id).slice(0, 60), instruction: String(x.instruction).slice(0, 500) }));
  } catch {
    return [];
  }
}
export function saveRewritePresets(list: RewritePreset[]): void {
  const s = JSON.stringify(list.slice(0, 20));
  if (s.length > 19_500) throw new Error('Trop de consignes');
  settings.set('rewrite.presets', s);
}

/** f3 — réécrit la sélection avec la consigne enregistrée `id`, sans dicter, et colle le résultat. */
export async function runRewritePreset(id: string): Promise<boolean> {
  if (!host) return false;
  if (!rewriteEnabled()) return (alert('disabled', 'Réécriture désactivée dans les réglages'), false);
  const preset = getRewritePresets().find((p) => p.id === id);
  if (!preset) return false;
  const sel = await captureSelection(host);
  if (!sel) return (alert('no-selection', 'Sélectionne d’abord du texte à réécrire'), false);
  if (sel.text.length > MAX_SELECTION) return (alert('too-long', 'Sélection trop longue (12 000 caractères max)'), false);
  try {
    host.emit('status', { state: 'cleaning' });
    const out = await performRewrite(sel.text, preset.instruction, { language: String(settings.get('general.language') || 'fr') });
    await host.pasteText(out, sel.bundleId);
    host.emit('status', { state: 'done' });
    host.emit('status', { state: 'idle' });
    return true;
  } catch (e) {
    alert('error', e instanceof Error ? e.message.slice(0, 100) : 'Réécriture impossible');
    host.emit('status', { state: 'idle' });
    return false;
  }
}
