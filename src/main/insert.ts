import { clipboard, ClipboardItem } from 'electron';
import { execFile } from 'node:child_process';
import { log } from './paths';

type UiohookModule = typeof import('uiohook-napi');

/** Copie matérialisée du presse-papiers (API async ClipboardItem d'Electron ≥ 40). */
type ClipSnapshot = Record<string, Blob | Electron.ClipboardBookmark>[];

export async function snapshot(): Promise<ClipSnapshot> {
  try {
    const items = await clipboard.read();
    const out: ClipSnapshot = [];
    for (const it of items) {
      const rec: Record<string, Blob | Electron.ClipboardBookmark> = {};
      for (const t of it.types) {
        try {
          rec[t] = await it.getType(t);
        } catch {
          /* type non lisible : ignoré */
        }
      }
      if (Object.keys(rec).length) out.push(rec);
    }
    return out;
  } catch (e) {
    log('insert: lecture du presse-papiers impossible', e);
    return [];
  }
}

export async function restore(s: ClipSnapshot): Promise<void> {
  if (!s.length) {
    clipboard.clear();
    return;
  }
  await clipboard.write(s.map((rec) => new ClipboardItem(rec as Record<string, Blob>)));
}

function osascriptPaste(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to keystroke "v" using command down'],
      { timeout: 3000 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

/**
 * c8 : délai (ms) avant de restaurer le presse-papiers, par app. Les apps lentes (Electron, navigateurs, Office,
 * bureau à distance) lisent le presse-papiers APRÈS le ⌘V : restaurer trop tôt colle l'ancien contenu.
 */
export const RESTORE_DELAY_BY_APP: Record<string, number> = {
  'com.tinyspeck.slackmacgap': 900,
  'com.microsoft.teams2': 1500,
  'com.microsoft.teams': 1500,
  'com.microsoft.Word': 2500,
  'com.microsoft.Outlook': 2500,
  'com.microsoft.Powerpoint': 2000,
  'com.microsoft.Excel': 2000,
  'com.microsoft.rdc.macos': 4000,
  'com.apple.Safari': 700,
  'com.google.Chrome': 700,
  'com.google.Chrome.beta': 700,
  'company.thebrowser.Browser': 700,
  'com.microsoft.edgemac': 700,
  'com.brave.Browser': 700,
  'org.mozilla.firefox': 800,
  'com.hnc.Discord': 900,
  'notion.id': 900,
  'net.whatsapp.WhatsApp': 1500,
  'com.microsoft.VSCode': 700,
  'com.todesktop.230313mzl4w4u92': 700, // Cursor
  'md.obsidian': 700,
  'com.linear': 900,
};
/** Surcharge facultative : liste « bundleId=ms » dans le réglage `paste.restoreDelayOverrides`. */
export function restoreDelayFor(bundleId: string | undefined, baseMs: number, overrides: unknown = []): number {
  let ms = baseMs;
  if (bundleId) {
    ms = Math.max(baseMs, RESTORE_DELAY_BY_APP[bundleId] ?? 0);
    for (const o of Array.isArray(overrides) ? overrides : []) {
      const [id, v] = String(o).split('=');
      const n = Number(v);
      if (id?.trim() === bundleId && Number.isFinite(n)) ms = Math.max(0, Math.min(10_000, n));
    }
  }
  return ms;
}

/** Restauration en attente : un collage qui suit (dictées enchaînées) reprend la sauvegarde d'origine. */
let pendingRestore: { timer: NodeJS.Timeout; prev: Promise<ClipSnapshot> | ClipSnapshot; text: string } | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Insère le texte dans l'app active.
 *  - mode 'paste' : sauvegarde du presse-papiers → écrit le texte → Cmd+V → restauration après delay.
 *  - mode 'clipboard' : laisse le texte dans le presse-papiers.
 */
export async function insertText(
  text: string,
  opts: {
    mode: 'paste' | 'clipboard';
    restoreDelayMs: number;
    uiohook: UiohookModule | null;
    trusted: boolean;
    /** ⌘V natif (CGEvent posté par le helper dicta-fnwatch) ; false si indisponible. */
    nativePaste?: () => Promise<boolean>;
    /** Sauvegarde du presse-papiers déjà lancée (en parallèle de la transcription). */
    prev?: Promise<ClipSnapshot>;
  },
): Promise<'pasted' | 'clipboard'> {
  // Sortie du LLM = texte inerte : caractères de contrôle retirés (sauf \n, \t) et aucun retour à la ligne
  // final — collée dans un Terminal, une dictée « piégée » ne peut pas valider une commande toute seule.
  text = String(text ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+$/, '');
  if (opts.mode === 'clipboard' || !opts.trusted) {
    await clipboard.writeText(text);
    return 'clipboard';
  }
  // Un collage précédent attend encore sa restauration : le presse-papiers contient SON texte, pas celui de l'utilisateur.
  const carried = pendingRestore;
  if (carried) {
    clearTimeout(carried.timer);
    pendingRestore = null;
  }
  const prev = await (carried?.prev ?? opts.prev ?? snapshot());
  clipboard.writeText(text);
  try {
    if (opts.nativePaste && (await opts.nativePaste())) {
      /* collé par le helper natif */
    } else if (opts.uiohook) {
      const { uIOhook, UiohookKey } = opts.uiohook;
      uIOhook.keyTap(UiohookKey.V, [UiohookKey.Meta]);
    } else {
      await osascriptPaste();
    }
  } catch (e) {
    log('insert: keyTap a échoué, repli osascript', e);
    try {
      await osascriptPaste();
    } catch (e2) {
      log('insert: osascript a échoué', e2);
      return 'clipboard'; // le texte reste dans le presse-papiers
    }
  }
  const timer = setTimeout(async () => {
    if (pendingRestore?.timer === timer) pendingRestore = null;
    // ne restaure que si personne n'a modifié le presse-papiers entre-temps
    try {
      if ((await clipboard.readText()) === text) await restore(prev);
    } catch (e) {
      log('insert: restauration du presse-papiers échouée', e);
    }
  }, Math.max(150, opts.restoreDelayMs));
  pendingRestore = { timer, prev, text };
  return 'pasted';
}

/** ⌘ + touche (C : copier la sélection, Z : annuler) dans l'app active. */
export async function sendCommandKey(key: 'c' | 'z', uiohook: UiohookModule | null): Promise<void> {
  if (uiohook) {
    const { uIOhook, UiohookKey } = uiohook;
    uIOhook.keyTap(key === 'c' ? UiohookKey.C : UiohookKey.Z, [UiohookKey.Meta]);
    return;
  }
  await new Promise<void>((resolve, reject) =>
    execFile('osascript', ['-e', `tell application "System Events" to keystroke "${key}" using command down`], { timeout: 3000 }, (err) =>
      err ? reject(err) : resolve(),
    ),
  );
}
