import { app } from 'electron';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { distDir, firstExisting, log } from './paths';
import { settings } from './settings';

/** Sons d'identité CBW AI (assets/sounds, régénérés par scripts/make-sounds.py). */
export type SoundName = 'start' | 'stop' | 'note-start' | 'error';

const VOLUME = 0.35;
const THROTTLE_MS = 150;
const last = new Map<SoundName, number>();

/** Packagée : Resources/assets/sounds (hors asar, lisible par afplay) ; en dev : dist/assets/sounds. */
function soundFile(name: SoundName): string | undefined {
  const f = `${name}.wav`;
  return firstExisting([
    app.isPackaged ? path.join(process.resourcesPath, 'assets', 'sounds', f) : undefined,
    path.join(distDir(), 'assets', 'sounds', f),
  ]);
}

/** Joue un son sans bloquer (afplay détaché). Respecte `general.sounds` à chaud. */
export function playSound(name: SoundName): void {
  if (settings.get('general.sounds') === false) return;
  const now = Date.now();
  if (now - (last.get(name) ?? 0) < THROTTLE_MS) return;
  last.set(name, now);
  const file = soundFile(name);
  if (!file) return void log('son introuvable', name);
  try {
    const p = spawn('/usr/bin/afplay', ['-v', String(VOLUME), file], { detached: true, stdio: 'ignore' });
    p.on('error', (e) => log('afplay', e.message));
    p.unref();
  } catch (e) {
    log('afplay', e);
  }
}
