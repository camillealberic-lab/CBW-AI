import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * f10 : bloc-notes vocal. Mode activable (`notepad.enabled`, défaut false) : les dictées sont ajoutées ici au lieu
 * d'être collées. Stockage ~/.dicta-ai/notepad.json (0600), local uniquement. Module sans Electron (testable).
 * Vie privée : aucun texte dans les journaux.
 */
export interface NotepadEntry {
  id: string;
  text: string;
  /** ISO */
  at: string;
  /** App qui avait le focus au moment de la dictée (bundleId), si connue. */
  app?: string;
}
export const NOTEPAD_MAX_ENTRIES = 500;
export const NOTEPAD_MAX_CHARS = 20_000;

const file = (): string => path.join(process.env.DICTA_AI_HOME || path.join(os.homedir(), '.dicta-ai'), 'notepad.json');

function read(): NotepadEntry[] {
  try {
    const v = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const list = Array.isArray(v?.entries) ? v.entries : [];
    return list.filter((e: any) => e && typeof e.id === 'string' && typeof e.text === 'string' && typeof e.at === 'string');
  } catch {
    return [];
  }
}
function write(entries: NotepadEntry[]): void {
  const p = file();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, entries }, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, p);
  fs.chmodSync(p, 0o600);
}

/** Mode actif ? `get` = settings.get (clé `notepad.enabled`). */
export const notepadEnabled = (get: (key: string) => unknown): boolean => get('notepad.enabled') === true;

/** Entrées, les plus récentes d'abord. */
export function listNotepad(): NotepadEntry[] {
  return read();
}

/** Ajoute une dictée en tête. Texte vide : ignoré (null). Les plus anciennes au-delà de 500 sont retirées. */
export function addToNotepad(text: string, meta: { app?: string } = {}): NotepadEntry | null {
  const t = String(text ?? '').trim().slice(0, NOTEPAD_MAX_CHARS);
  if (!t) return null;
  const e: NotepadEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: t,
    at: new Date().toISOString(),
    ...(meta.app ? { app: String(meta.app).slice(0, 200) } : {}),
  };
  write([e, ...read()].slice(0, NOTEPAD_MAX_ENTRIES));
  return e;
}

/** Supprime une entrée ; false si introuvable. */
export function removeFromNotepad(id: string): boolean {
  if (typeof id !== 'string' || !/^[a-z0-9]{4,32}$/.test(id)) return false;
  const list = read();
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  write(next);
  return true;
}

/** Vide le bloc-notes. */
export function clearNotepad(): void {
  write([]);
}

/** Tout le bloc-notes en un texte (copie / export), ordre chronologique, une entrée par paragraphe. */
export function notepadAsText(): string {
  return [...read()].reverse().map((e) => e.text).join('\n\n');
}

/**
 * Point d'accroche pour Pipeline.pasteText() : si le mode est actif, range le texte dans le bloc-notes et renvoie
 * true (l'appelant ne colle pas). Sinon false.
 */
export function notepadIntercept(get: (key: string) => unknown, text: string, app?: string): boolean {
  if (!notepadEnabled(get)) return false;
  return addToNotepad(text, { app }) !== null;
}
