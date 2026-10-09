#!/usr/bin/env python3
"""Synthèse des sons de CBW AI (stdlib seulement) → assets/sounds/*.wav.

Identité : trois notes brèves = les trois barres de couleur (orange / bleu / vert) qui s'allument.
Sinus + un soupçon d'harmonique 2, attaque 4 ms, décroissance exponentielle, aucune réverbération.
44,1 kHz mono 16 bits, crête normalisée à −18 dBFS. Usage : python3 scripts/make-sounds.py
"""
import math
import os
import struct
import wave

SR = 44100
PEAK_DBFS = -18.0
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sounds')

E5, GS5, B5 = 659.26, 830.61, 987.77
C5, E4, GS4, B4 = 523.25, 329.63, 415.30, 493.88


def tone(freq, ms, amp=1.0, h2=0.12, attack_ms=4.0, tau_ms=None, release_ms=6.0):
    """Note sinusoïdale : attaque linéaire, décroissance exponentielle, fondu final (pas de clic)."""
    n = int(SR * ms / 1000)
    a = max(1, int(SR * attack_ms / 1000))
    r = max(1, int(SR * release_ms / 1000))
    tau = (tau_ms or ms / 2.5) / 1000
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t / tau)
        if i < a:
            env *= i / a
        if i > n - r:
            env *= max(0.0, (n - i) / r)
        s = math.sin(2 * math.pi * freq * t) + h2 * math.sin(4 * math.pi * freq * t)
        out.append(amp * env * s)
    return out


def silence(ms):
    return [0.0] * int(SR * ms / 1000)


def seq(notes, gap_ms=15):
    out = []
    for i, nt in enumerate(notes):
        if i:
            out += silence(gap_ms)
        out += nt
    return out


def mix(a, b, offset_ms=0):
    off = int(SR * offset_ms / 1000)
    n = max(len(a), len(b) + off)
    out = a + [0.0] * (n - len(a))
    for i, v in enumerate(b):
        out[i + off] += v
    return out


def write(name, samples, peak_dbfs=PEAK_DBFS):
    samples = silence(2) + samples + silence(4)  # marge : début/fin exactement à zéro
    m = max(abs(s) for s in samples) or 1.0
    g = 10 ** (peak_dbfs / 20) / m
    ints = [int(round(max(-1.0, min(1.0, s * g)) * 32767)) for s in samples]
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(struct.pack('<%dh' % len(ints), *ints))
    peak = max(abs(v) for v in ints) / 32767
    rms = math.sqrt(sum(v * v for v in ints) / len(ints)) / 32767
    clip = sum(1 for v in ints if abs(v) >= 32767)
    print('%-15s %4d ms  peak %6.1f dBFS  rms %6.1f dBFS  clip %d  edges %d/%d  %d o' % (
        name, len(ints) * 1000 // SR, 20 * math.log10(peak), 20 * math.log10(rms or 1e-9), clip,
        ints[0], ints[-1], os.path.getsize(path)))


def main():
    os.makedirs(OUT, exist_ok=True)
    # Démarrage : trois barres qui s'allument (montant). 3×45 + 2×15 = 165 ms.
    start = seq([tone(E5, 45, 0.85), tone(GS5, 45, 0.92), tone(B5, 45, 1.0)])
    write('start.wav', start)
    # Arrêt : même motif descendant (D#5 · C5 · G#4), plus bas et plus doux.
    stop = seq([tone(B4 * 1.26, 45, 1.0), tone(GS4 * 1.26, 45, 0.9), tone(E4 * 1.26, 45, 0.8)])
    write('stop.wav', stop, PEAK_DBFS - 3)
    # Prise de notes : motif de démarrage + pulsation grave douce (E4, une octave sous la tonique).
    pulse = tone(E4, 110, 0.6, h2=0.05, attack_ms=8, tau_ms=45, release_ms=20)
    write('note-start.wav', mix(start, pulse, offset_ms=125))
    # Erreur : deux notes graves étouffées (sans harmonique), descente d'un demi-ton.
    err = seq([tone(C5 / 2 * 1.5, 70, 1.0, h2=0.0, tau_ms=30), tone(C5 / 2 * 1.414, 90, 0.9, h2=0.0, tau_ms=35)], gap_ms=30)
    write('error.wav', err, PEAK_DBFS - 2)


if __name__ == '__main__':
    main()
