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
  const prev = await (opts.prev ?? snapshot());
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
  setTimeout(async () => {
    // ne restaure que si personne n'a modifié le presse-papiers entre-temps
    try {
      if ((await clipboard.readText()) === text) await restore(prev);
    } catch (e) {
      log('insert: restauration du presse-papiers échouée', e);
    }
  }, Math.max(150, opts.restoreDelayMs));
  return 'pasted';
}
