// Logique pure des raccourcis / de la pastille (aucune dépendance Electron : testable avec node --experimental-strip-types).
import { EventEmitter } from 'node:events';

const MOUSE_HOLD_MS = 300; // bouton de souris : appui plus court = mains libres (re-cliquer arrête), plus long = push-to-talk

export const ACTION_SHORTCUTS = {
  pasteLast: { key: 'shortcuts.pasteLast', def: 'Control+Command+V' },
  copyLast: { key: 'shortcuts.copyLast', def: 'Control+Command+C' },
  rewrite: { key: 'shortcuts.rewrite', def: 'Control+Command+R' },
} as const;
export type ActionName = keyof typeof ACTION_SHORTCUTS;
export const MOUSE_KEY = 'shortcuts.mouseButton';

/** Accélérateur Electron plausible (modificateurs + 1 touche) : sinon on refuse sans lever d'exception. */
export function validAccelerator(acc: unknown): acc is string {
  if (typeof acc !== 'string' || acc.length > 60) return false;
  const parts = acc.split('+').map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => !p)) return false; // au moins un modificateur : pas de touche nue
  const mods = parts.slice(0, -1);
  return mods.every((m) => /^(command|cmd|control|ctrl|commandorcontrol|cmdorctrl|alt|option|shift|super|meta)$/i.test(m));
}

/** Numéro de bouton de souris valide (4..32) sinon 0 (désactivé). */
export const mouseButtonOf = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 4 && n <= 32 ? n : 0;
};

/**
 * Geste du bouton de souris (c15) : maintenu → push-to-talk (relâcher arrête) ; clic bref → mains libres,
 * un nouveau clic arrête. Émet 'arm', 'down', 'up' comme FnGesture. Testable sans helper.
 */
export class MouseGesture extends EventEmitter {
  private state: 'idle' | 'pressed' | 'free' = 'idle';
  private downAt = 0;
  private ignoreUp = false;

  buttonDown(now = Date.now()): void {
    if (this.state === 'free') {
      this.state = 'idle';
      this.ignoreUp = true;
      this.emit('up');
      return;
    }
    if (this.state !== 'idle') return;
    this.state = 'pressed';
    this.downAt = now;
    this.ignoreUp = false;
    this.emit('down');
  }

  buttonUp(now = Date.now()): void {
    if (this.ignoreUp) {
      this.ignoreUp = false;
      return;
    }
    if (this.state !== 'pressed') return;
    if (now - this.downAt >= MOUSE_HOLD_MS) {
      this.state = 'idle';
      this.emit('up');
    } else this.state = 'free';
  }

  /** Dictée annulée / arrêtée ailleurs (Échap, durée max) : repart de zéro. */
  reset(): void {
    this.state = 'idle';
    this.ignoreUp = false;
  }

  get active(): boolean {
    return this.state !== 'idle';
  }
}

/** Langues proposées dans le menu de la pastille (f8) ; `code` = valeur de `general.language`. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto (détection)' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'nl', label: 'Néerlandais' },
];
/** Code de langue accepté (liste fermée) ; sinon null. */
export const languageOf = (v: unknown): string | null => (typeof v === 'string' && LANGUAGES.some((l) => l.code === v) ? v : null);

/** Durée de masquage de la pastille (c13). */
export const HIDE_MS = 60 * 60 * 1000;
/** Pastille masquée à l'instant `now` ? `until` = date de réapparition (ms epoch) ou 0. */
export const isHiddenAt = (until: unknown, now = Date.now()): boolean => typeof until === 'number' && until > now;

/** Aperçu en direct (c14) : fin du texte, sur une ligne, borné — jamais plus de MAX caractères dans la pastille. */
export const PREVIEW_MAX = 64;
export function previewTail(text: unknown, max = PREVIEW_MAX): string {
  const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (t.length <= max) return t;
  const cut = t.slice(t.length - max + 1);
  return '…' + cut.slice(cut.indexOf(' ') > 0 && cut.indexOf(' ') < 12 ? cut.indexOf(' ') + 1 : 0);
}
