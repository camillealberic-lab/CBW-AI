// Annulation d'écho du micro en mode réunion : le son du Mac (piste « système », alignée à l'échantillon sur le
// micro) sert de référence ; un filtre adaptatif NLMS retire du micro ce que le haut-parleur y a renvoyé.
// Sans cela, la voix distante est présente deux fois (piste système + écho capté par le micro, décalé) :
// Whisper transcrit en double et la piste « Moi » contient la voix des autres.
// Complémentaire de la contrainte getUserMedia { echoCancellation: true } (qui ne connaît que le son émis par
// Chromium, pas celui des autres applications).
//
// Pur (aucun import) : testable avec node --experimental-strip-types. Coût ≈ 2 × taps multiplications par
// échantillon, uniquement quand la référence est active (≈ 6 000 flops × 16 000 /s ≈ 100 Mflops/s à 3 072 taps).

export interface AecOpts {
  /** Longueur du filtre en échantillons (défaut 3072 ≈ 192 ms à 16 kHz : haut-parleur + pièce + tampons). */
  taps?: number;
  /** Pas d'adaptation NLMS (0..1, défaut 0,25). */
  mu?: number;
  /** Énergie RMS de la référence sous laquelle on ne fait rien (défaut 0,002). */
  refGate?: number;
}

export class EchoCanceller {
  private readonly taps: number;
  private readonly mu: number;
  private readonly refGate: number;
  private readonly w: Float32Array;
  /** Historique de la référence, doublé pour une lecture contiguë (hist[pos .. pos + taps[). */
  private readonly hist: Float32Array;
  private pos = 0;
  private energy = 0; // Σ x² sur la fenêtre
  private pd = 0; // puissance lissée du micro
  private pe = 0; // puissance lissée de l'erreur (micro nettoyé)
  private pf = 0; // idem, rapide
  private conv = false;
  private warm = 0; // échantillons adaptés (la moyenne lente doit être établie avant de juger la convergence)
  /** Atténuation moyenne de l'écho constatée (ERLE lissé, en dB) — diagnostic. */
  erleDb = 0;
  private inE = 0;
  private outE = 0;

  constructor(o: AecOpts = {}) {
    this.taps = o.taps ?? 3072;
    this.mu = o.mu ?? 0.25;
    this.refGate = o.refGate ?? 0.002;
    this.w = new Float32Array(this.taps);
    this.hist = new Float32Array(this.taps * 2);
  }

  reset(): void {
    this.w.fill(0);
    this.hist.fill(0);
    this.pos = 0;
    this.energy = 0;
    this.pd = 0;
    this.pe = 0;
    this.pf = 0;
    this.conv = false;
    this.warm = 0;
  }

  /** Micro nettoyé (nouveau tableau) ; `ref` = son du Mac de même longueur (null → micro inchangé). */
  process(mic: Float32Array, ref: Float32Array | null): Float32Array {
    const n = mic.length;
    const out = new Float32Array(n);
    const { taps, w, hist } = this;
    for (let i = 0; i < n; i++) {
      const x = ref ? (ref[i] ?? 0) : 0;
      // pousse x dans l'historique (le plus récent à l'indice pos) ; deux copies pour la lecture contiguë
      this.pos = this.pos === 0 ? taps - 1 : this.pos - 1;
      const old = hist[this.pos];
      hist[this.pos] = x;
      hist[this.pos + taps] = x;
      this.energy += x * x - old * old;
      if (this.energy < 0) this.energy = 0;
      const d = mic[i];
      const refRms = Math.sqrt(this.energy / taps);
      if (refRms < this.refGate) {
        out[i] = d; // pas de son du Mac : rien à retirer
        continue;
      }
      let y = 0;
      const b = this.pos;
      for (let k = 0; k < taps; k++) y += w[k] * hist[b + k];
      const e = d - y;
      out[i] = e;
      // double parole : une fois le filtre convergé (y fort), une erreur bien plus forte que l'écho estimé
      // vient de la voix proche → on n'adapte pas (sinon le filtre apprend à effacer « Moi »)
      this.pf += 0.03 * (e * e - this.pf);
      // convergé + erreur soudain forte face au micro « écho seul » = voix proche (double parole) : on gèle
      // l'adaptation ET les moyennes lentes (sinon elles rattrapent la voix proche et le filtre diverge)
      const doubleTalk = this.conv && this.pf > 0.7 * this.pd;
      if (!doubleTalk) {
        this.pd += 0.002 * (d * d - this.pd);
        this.pe += 0.002 * (e * e - this.pe);
        if (++this.warm > 24000 && this.pd > 1e-5 && this.pe < 0.3 * this.pd) this.conv = true; // le filtre a appris : l'écho recule d'au moins 5 dB
      }
      if (!doubleTalk) {
        const g = (this.mu * e) / (this.energy + 1e-3 * taps);
        for (let k = 0; k < taps; k++) w[k] += g * hist[b + k];
      }
      this.inE = 0.9999 * this.inE + 0.0001 * d * d;
      this.outE = 0.9999 * this.outE + 0.0001 * e * e;
    }
    this.erleDb = 10 * Math.log10((this.inE + 1e-12) / (this.outE + 1e-12));
    // garde-fou : un filtre qui diverge ajoute de l'énergie → on le remet à zéro
    if (this.outE > this.inE * 4 && this.inE > 1e-6) this.reset();
    return out;
  }
}
