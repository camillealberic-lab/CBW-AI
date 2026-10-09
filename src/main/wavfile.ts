import * as fs from 'node:fs';

/**
 * WAV PCM16 mono écrit au fil de l'eau (sessions longues : rien ne reste en mémoire).
 * En-tête provisoire (tailles à 0) réécrit à la fermeture ; un fichier non refermé (plantage)
 * reste lisible avec repairWav().
 */
export class WavWriter {
  private fd: number | null;
  private bytes = 0;
  readonly path: string;

  constructor(file: string, private rate = 16000) {
    this.path = file;
    this.fd = fs.openSync(file, 'w');
    fs.writeSync(this.fd, header(0, rate));
  }

  get samples(): number {
    return this.bytes / 2;
  }

  /** PCM16 little-endian (déjà converti par la fenêtre de capture). */
  append(pcm16: Buffer): void {
    if (this.fd == null || !pcm16.length) return;
    fs.writeSync(this.fd, pcm16);
    this.bytes += pcm16.length;
  }

  close(): void {
    if (this.fd == null) return;
    fs.writeSync(this.fd, header(this.bytes, this.rate), 0, 44, 0);
    fs.closeSync(this.fd);
    this.fd = null;
  }
}

function header(dataBytes: number, rate: number): Buffer {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataBytes, 40);
  return b;
}

/** Fichier interrompu (en-tête à 0) : tailles recalculées d'après la taille du fichier. */
export function repairWav(file: string): void {
  const size = fs.statSync(file).size;
  if (size < 44) return;
  const fd = fs.openSync(file, 'r+');
  try {
    const data = (size - 44) & ~1;
    fs.writeSync(fd, header(data, 16000), 0, 44, 0);
  } finally {
    fs.closeSync(fd);
  }
}

/** Extrait [fromMs, toMs[ d'un WAV PCM16 mono 16 kHz (en-tête de 44 octets) → nouveau WAV en mémoire. */
export function readWavSlice(file: string, fromMs: number, toMs: number): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const a = Math.min(size, 44 + Math.max(0, Math.floor((fromMs * 16) | 0)) * 2);
    const b = Math.min(size, 44 + Math.max(0, Math.floor((toMs * 16) | 0)) * 2);
    const data = Buffer.alloc(Math.max(0, b - a) & ~1);
    if (data.length) fs.readSync(fd, data, 0, data.length, a);
    return Buffer.concat([header(data.length, 16000), data]);
  } finally {
    fs.closeSync(fd);
  }
}
