import { ChildProcess, spawn } from 'node:child_process';
import * as readline from 'node:readline';
import type { DictationContext } from '../shared/types';
import { domainOnly, extractNames } from './contextNames';
import { log } from './paths';
import { settings } from './settings';
import { findBin } from './whisper';

/**
 * Contexte de l'app active via le helper natif dicta-context (scripts/context.swift, Accessibilité, sans capture
 * d'écran). Process persistant (comme dicta-fnwatch) : une requête JSON par ligne sur stdin, une réponse par ligne
 * sur stdout. Le texte lu reste dans ce process : seuls les noms extraits (≤ 40) en sortent, et rien n'est
 * journalisé hors des comptes. Désactivable (`context.enabled`) : aucun appel au helper dans ce cas.
 */
export const contextBin = (): string | undefined => findBin('dicta-context', process.env.DICTA_CONTEXT_BIN);

interface HelperReply {
  id?: number;
  ok?: boolean;
  error?: string;
  excluded?: boolean;
  secure?: boolean;
  app?: string;
  bundleId?: string;
  pid?: number;
  url?: string;
  title?: string;
  focused?: string;
  before?: string;
  selected?: string;
  visible?: string;
  value?: string;
  ms?: number;
}

const IDLE_KILL_MS = 5 * 60 * 1000;

class ContextHelper {
  private proc: ChildProcess | null = null;
  private seq = 0;
  private pending = new Map<number, (r: HelperReply | null) => void>();
  private idle: NodeJS.Timeout | null = null;
  private broken = false;

  private start(): ChildProcess | null {
    if (this.proc) return this.proc;
    if (this.broken) return null;
    const bin = contextBin();
    if (!bin) {
      this.broken = true;
      log('context: helper dicta-context introuvable');
      return null;
    }
    const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc = p;
    readline.createInterface({ input: p.stdout! }).on('line', (line) => {
      try {
        const r = JSON.parse(line) as HelperReply;
        const cb = r.id != null ? this.pending.get(r.id) : undefined;
        if (cb) {
          this.pending.delete(r.id!);
          cb(r);
        }
      } catch {
        /* ligne illisible : ignorée (jamais journalisée, elle peut contenir du texte) */
      }
    });
    p.on('error', (e) => {
      log('context: lancement du helper échoué', e instanceof Error ? e.message : e);
      this.broken = true;
      this.drop(p);
    });
    p.on('exit', () => this.drop(p));
    p.stdin!.on('error', () => undefined);
    return p;
  }

  private drop(p: ChildProcess): void {
    if (this.proc === p) this.proc = null;
    for (const [id, cb] of this.pending) (this.pending.delete(id), cb(null));
  }

  /** Requête avec délai : null si le helper est absent, lent ou en erreur. */
  ask(cmd: 'snapshot' | 'focused-value' | 'selected-text', timeoutMs = 400): Promise<HelperReply | null> {
    const p = this.start();
    if (!p || !p.stdin?.writable) return Promise.resolve(null);
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), IDLE_KILL_MS);
    this.idle.unref?.();
    const id = ++this.seq;
    const exclude = settings.get('context.excludedApps');
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      p.stdin!.write(JSON.stringify({ id, cmd, budgetMs: 150, exclude: Array.isArray(exclude) ? exclude : [] }) + '\n');
    });
  }

  stop(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    const p = this.proc;
    this.proc = null;
    p?.kill();
  }
}

export const contextHelper = new ContextHelper();

export const contextEnabled = (): boolean => settings.get('context.enabled') !== false;

/**
 * Photographie de l'app active au début d'une dictée : app, bundleId, domaine (navigateurs) et noms extraits
 * localement. undefined si désactivé, app exclue (gestionnaire de mots de passe…), champ sécurisé ou helper
 * indisponible (la dictée part alors sans contexte).
 */
export type DictationContextEx = DictationContext & {
  /** Texte avant le curseur (≤ 300 car.) : raccord de majuscule / ponctuation (m14). Jamais journalisé. */
  before?: string;
};

export async function snapshotContext(): Promise<DictationContextEx | undefined> {
  if (!contextEnabled()) return undefined;
  const t0 = Date.now();
  const r = await contextHelper.ask('snapshot');
  if (!r || !r.ok) {
    if (r?.error === 'no-access') log('context: Accessibilité refusée → dictée sans contexte');
    return undefined;
  }
  if (r.excluded) {
    log('context: app exclue ou champ sécurisé → aucun contexte');
    return undefined;
  }
  const names = extractNames([r.title, r.focused, r.visible]);
  const ctx: DictationContextEx = {};
  if (r.app) ctx.app = r.app.slice(0, 80);
  if (r.bundleId) ctx.bundleId = r.bundleId.slice(0, 120);
  const url = domainOnly(r.url);
  if (url) ctx.url = url;
  if (names.length) ctx.names = names;
  if (typeof r.before === 'string' && r.before) ctx.before = r.before.slice(-300);
  // Journal : comptes seulement (jamais les noms ni le texte lu).
  log('context: snapshot', { app: ctx.app, site: !!ctx.url, names: names.length, helperMs: r.ms, totalMs: Date.now() - t0 });
  return ctx;
}

/** Valeur du champ focalisé (≤ 20 000 car. autour du curseur) + app, pour l'apprentissage. Jamais journalisée. */
export async function focusedField(): Promise<{ value: string; bundleId: string } | null> {
  const r = await contextHelper.ask('focused-value', 600);
  if (!r || !r.ok || r.excluded || r.secure || typeof r.value !== 'string' || !r.bundleId) return null;
  return { value: r.value, bundleId: r.bundleId };
}

/** Sélection de l'app active (AXSelectedText, ≤ 20 000 car.), null si rien / app exclue / champ sécurisé / helper absent. */
export async function selectedText(): Promise<{ text: string; bundleId: string } | null> {
  if (!contextEnabled()) return null;
  const r = await contextHelper.ask('selected-text', 600);
  if (!r || !r.ok || r.excluded || r.secure || typeof r.selected !== 'string' || !r.selected.trim()) return null;
  return { text: r.selected, bundleId: r.bundleId ?? '' };
}
