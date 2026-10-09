// Alignement « qui a dit quoi » : segments Whisper horodatés × tours de parole de la diarisation.
// Pur (sans Electron) : testable avec node --experimental-strip-types.

export interface NoteSegment {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
}
export interface SpeakerTurn {
  start: number; // s
  end: number; // s
  speaker: string; // 'Moi' | 'S0' | 'S1'…
}

/** Un tour de la transcription envoyée à l'organisation ne dépasse pas cette durée (repères mm:ss utiles). */
const MAX_TURN_MS = 120000;

/**
 * Chaque segment reçoit le locuteur qui le recouvre le plus ; sans recouvrement, le tour le plus proche
 * (≤ 2 s), sinon le locuteur du segment précédent. Les identifiants de clusters deviennent
 * « Personne 1…n » par ordre d'apparition ; « Moi » est conservé.
 */
export function assignSpeakers(segs: { startMs: number; endMs: number; text: string }[], turns: SpeakerTurn[]): NoteSegment[] {
  const raw: string[] = [];
  for (const s of segs) {
    const a = s.startMs / 1000;
    const b = s.endMs / 1000;
    const ov = new Map<string, number>();
    let near = '';
    let nearGap = 2;
    for (const t of turns) {
      const o = Math.min(b, t.end) - Math.max(a, t.start);
      if (o > 0) ov.set(t.speaker, (ov.get(t.speaker) ?? 0) + o);
      else {
        const gap = Math.max(t.start - b, a - t.end);
        if (gap < nearGap) {
          nearGap = gap;
          near = t.speaker;
        }
      }
    }
    let best = '';
    let bestO = 0;
    for (const [k, o] of ov)
      if (o > bestO) {
        bestO = o;
        best = k;
      }
    raw.push(best || near || raw[raw.length - 1] || '');
  }
  const first = raw.find((r) => r) ?? 'S0';
  const names = new Map<string, string>();
  let n = 0;
  return segs.map((s, i) => {
    const id = raw[i] || first;
    if (!names.has(id)) names.set(id, id === 'Moi' ? 'Moi' : `Personne ${++n}`);
    return { startMs: s.startMs, endMs: s.endMs, text: s.text, speaker: names.get(id)! };
  });
}

/**
 * Un segment Whisper (coupé par le VAD) peut chevaucher un changement de locuteur sans pause nette.
 * Renvoie les points de coupe (ms) aux changements de locuteur internes, si chaque morceau dure ≥ minMs
 * (le texte des morceaux est alors re-transcrit séparément depuis le WAV de session).
 */
export function speakerSplits(seg: { startMs: number; endMs: number }, turns: SpeakerTurn[], minMs = 700): number[] {
  const a = seg.startMs / 1000;
  const b = seg.endMs / 1000;
  const parts = turns
    .filter((t) => t.end > a && t.start < b)
    .map((t) => ({ speaker: t.speaker, start: Math.max(a, t.start), end: Math.min(b, t.end) }))
    .sort((x, y) => x.start - y.start);
  const merged: { speaker: string; start: number; end: number }[] = [];
  for (const p of parts) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === p.speaker) last.end = Math.max(last.end, p.end);
    else if (last && p.end <= last.end) continue; // entièrement couvert (chevauchement) : ignoré
    else merged.push({ ...p });
  }
  const big = merged.filter((m) => (m.end - m.start) * 1000 >= minMs);
  const cuts: number[] = [];
  for (let i = 1; i < big.length; i++) {
    if (big[i].speaker === big[i - 1].speaker) continue;
    const cut = Math.round(((big[i - 1].end + big[i].start) / 2) * 1000);
    const prev = cuts.length ? cuts[cuts.length - 1] : seg.startMs;
    if (cut - prev >= minMs && seg.endMs - cut >= minMs) cuts.push(cut);
  }
  return cuts;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** mm:ss (les minutes continuent au-delà de 59 : « 75:12 »). */
export const mmss = (ms: number): string => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor((ms % 60000) / 1000))}`;

/** Tours fusionnés : segments consécutifs du même locuteur (≤ MAX_TURN_MS par ligne). */
export function mergeTurns(segs: NoteSegment[]): NoteSegment[] {
  const out: NoteSegment[] = [];
  for (const s of segs) {
    if (!s.text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === s.speaker && s.endMs - last.startMs <= MAX_TURN_MS) {
      last.endMs = s.endMs;
      last.text = `${last.text} ${s.text}`.replace(/\s+/g, ' ').trim();
    } else out.push({ ...s, text: s.text.trim() });
  }
  return out;
}

/** Format fixe transmis à organizeNotes : une ligne par tour, « [mm:ss] Personne 2 : texte… ». */
export function speakerTranscript(segs: NoteSegment[]): string {
  return mergeTurns(segs)
    .map((t) => `[${mmss(t.startMs)}] ${t.speaker} : ${t.text}`)
    .join('\n');
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Remplace un nom de locuteur entier (« Personne 1 » ne touche pas « Personne 12 »). */
export function replaceSpeaker(text: string, from: string, to: string): string {
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(from)}(?![\\p{L}\\p{N}])`, 'gu'), () => to);
}
