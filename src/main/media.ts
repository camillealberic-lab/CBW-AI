// Pause de la musique / vidéo pendant la dictée (c9). Réglage `audio.pauseMedia` (défaut true), lu par recorder.ts.
// Lecteurs pilotés : Musique et Spotify (osascript). On n'allume JAMAIS une app fermée (« is running » ne la lance pas)
// et on ne relance que ce qu'on a mis en pause nous-mêmes, s'il est toujours en pause à la fin.
// Les navigateurs (YouTube…) ne sont pas pilotés : une touche média relancerait ce qui ne jouait pas.
import { execFile } from 'node:child_process';
import { log } from './paths';

export const MEDIA_APPS = ['Music', 'Spotify'] as const;
type MediaApp = (typeof MEDIA_APPS)[number];

function osa(script: string, timeoutMs = 1500): Promise<string> {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: timeoutMs }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}

/** État du lecteur : 'playing' | 'paused' | 'stopped' | '' (app fermée / erreur / pas d'autorisation). */
export function playerState(app: MediaApp): Promise<string> {
  return osa(`if application "${app}" is running then
tell application "${app}" to return (player state as text)
end if
return ""`);
}

export class MediaPauser {
  private paused: MediaApp[] = [];
  private chain: Promise<void> = Promise.resolve();

  /** Met en pause ce qui joue (n'attend pas : à appeler sans await dans le chemin critique). */
  pause(): Promise<void> {
    return this.enqueue(async () => {
      if (this.paused.length) return;
      const states = await Promise.all(MEDIA_APPS.map(async (a) => [a, await playerState(a)] as const));
      for (const [app, st] of states) {
        if (st !== 'playing') continue;
        await osa(`tell application "${app}" to pause`);
        this.paused.push(app);
      }
      if (this.paused.length) log(`media: pause (${this.paused.join(', ')})`);
    });
  }

  /** Relance uniquement ce qu'on a mis en pause, s'il est encore en pause. */
  resume(): Promise<void> {
    return this.enqueue(async () => {
      const list = this.paused;
      this.paused = [];
      for (const app of list) {
        if ((await playerState(app)) !== 'paused') continue;
        await osa(`tell application "${app}" to play`);
        log(`media: reprise (${app})`);
      }
    });
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn, fn).catch(() => undefined);
    return this.chain;
  }
}

export const media = new MediaPauser();
