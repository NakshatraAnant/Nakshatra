/**
 * The score and sound design for the launch film, synthesised from nothing — no samples, no library music, nothing
 * to license. Every cue is placed on the film's own timeline (see src/film.js), at 120 bpm from the montage on.
 *
 *   0 – 4     suspense: low drone, a heartbeat at 66 bpm (the gate pulses with it), a riser into the opening
 *   4 – 9     the gate opens: impact and a full chord; the fly-through; the universe blooms
 *   9 – 17    montage: driving, uplifting — Am · F · C · G, one bar each, every cut on a beat
 *   17 – 23   product: the same pulse held back so the interface can register; each screen lands on the app's own
 *             "select" tone (660 Hz, from src/web/lib/sound.ts)
 *   23 – 27   launch: rise, then the crescendo on the hit at 25 s
 *   27 – 30   sonic signature: C–E–G rising, the notes of the app's own "celebrate" cue, answered an octave up
 *
 * It is a synthesised score: it stands in for an orchestral recording and leaves room for a voice-over.
 * Usage: node film/launch/scripts/score.mjs   →  out/nakshatra-launch-score.wav (48 kHz, 24-bit stereo)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';

const SR = 48000, SECONDS = 30, N = SR * SECONDS, TAU = Math.PI * 2;
const L = new Float32Array(N), R = new Float32Array(N), SL = new Float32Array(N), SR_ = new Float32Array(N);
let seed = 20261114;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const noise = () => rnd() * 2 - 1;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (t, a, b) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const n = (name) => { const m = /^([A-G]#?)(-?\d)$/.exec(name); return hz(12 * (Number(m[2]) + 1) + NOTE[m[1]]); };

/** State-variable low-pass (returns low-pass; .bp holds the band-pass of the same sample). */
function filter() {
  let a = 0, b = 0;
  const f = (x, fc, q = 0.7) => {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.45) / SR), k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - b, v1 = a1 * a + a2 * v3, v2 = b + a2 * a + a3 * v3;
    a = 2 * v1 - a; b = 2 * v2 - b; f.bp = v1; f.hp = x - k * v1 - v2;
    return v2;
  };
  return f;
}
/** Writes a mono voice into the mix. fn(t) → sample, t in seconds from the voice's start. */
function voice(at, dur, fn, { gain = 1, pan = 0, send = 0 } = {}) {
  const i0 = Math.max(0, Math.round(at * SR)), i1 = Math.min(N, Math.round((at + dur) * SR));
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = i0; i < i1; i++) { const s = fn((i - i0) / SR); L[i] += s * gl; R[i] += s * gr; SL[i] += s * gl * send; SR_[i] += s * gr * send; }
}
const env = (t, dur, a, r) => Math.min(1, t / a) * Math.min(1, Math.max(0, (dur - t) / r));

/* ------------------------------------------------------------ instruments */
/** Detuned saw ensemble through a moving low-pass: strings, brass and pads, depending on envelope and cutoff. */
function ensemble(at, dur, freqs, { gain = 0.1, attack = 0.4, release = 1.2, cut = [400, 1800, 600], detune = 0.006, send = 0.35, width = 0.7, trem = 0 } = {}) {
  freqs.forEach((f, k) => {
    const voices = 5, ph = Array.from({ length: voices }, () => rnd()), dt = Array.from({ length: voices }, (_, v) => 1 + (v - 2) * detune * (0.7 + rnd() * 0.6));
    const lp = filter();
    voice(at, dur, (t) => {
      let s = 0;
      for (let v = 0; v < voices; v++) { ph[v] += (f * dt[v]) / SR; ph[v] -= Math.floor(ph[v]); s += 2 * ph[v] - 1; }
      const u = t / dur, c = u < 0.25 ? cut[0] + (cut[1] - cut[0]) * (u / 0.25) : cut[1] + (cut[2] - cut[1]) * ((u - 0.25) / 0.75);
      return lp(s / voices, c, 0.8) * env(t, dur, attack, release) * (1 - trem * (0.5 + 0.5 * Math.sin(TAU * 5.5 * t)));
    }, { gain: gain / Math.sqrt(freqs.length), pan: (k % 2 ? 1 : -1) * width * (0.3 + 0.7 * rnd()), send });
  });
}
/** A struck tone with a soft bell partial — the app's interface cues are sines like this. */
function bell(at, f, { gain = 0.2, decay = 1.2, pan = 0, send = 0.6, bright = 0.25 } = {}) {
  voice(at, decay * 5, (t) => (Math.sin(TAU * f * t) + bright * Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 6) + bright * 0.5 * Math.sin(TAU * f * 3.02 * t) * Math.exp(-t * 11)) * Math.exp(-t / decay) * Math.min(1, t / 0.006), { gain, pan, send });
}
/** Short bowed-string stroke (spiccato). */
function stab(at, f, { gain = 0.1, dur = 0.16, pan = 0, send = 0.3, cut = 2600 } = {}) {
  const lp = filter(); let p1 = rnd(), p2 = rnd();
  voice(at, dur + 0.1, (t) => { p1 += f / SR; p1 -= Math.floor(p1); p2 += (f * 1.007) / SR; p2 -= Math.floor(p2); return lp((2 * p1 - 1) + (2 * p2 - 1), cut * (0.5 + 0.5 * Math.exp(-t * 14)), 1.1) * 0.5 * Math.min(1, t / 0.008) * Math.exp(-t / (dur * 0.5)); }, { gain, pan, send });
}
/** Sub drop: a sine falling in pitch — booms, kicks and the heartbeat. */
function boom(at, { from = 90, to = 34, drop = 0.12, decay = 1.6, gain = 0.8, send = 0.15, click = 0 } = {}) {
  let ph = 0;
  voice(at, decay * 5, (t) => { const f = to + (from - to) * Math.exp(-t / drop); ph += f / SR; return (Math.sin(TAU * ph) + click * noise() * Math.exp(-t * 400)) * Math.exp(-t / decay) * Math.min(1, t / 0.002); }, { gain, send });
}
/** Filtered noise with a moving centre: risers, whooshes, crashes. shape(u) is the loudness curve over 0…1. */
function air(at, dur, { from = 400, to = 6000, q = 1.4, gain = 0.3, shape = (u) => u * u, pan = [0, 0], send = 0.4, band = true } = {}) {
  for (const side of [-1, 1]) {
    const lp = filter();
    voice(at, dur, (t) => { const u = t / dur; const y = lp(noise(), from * Math.pow(to / from, u), q); return (band ? lp.bp : y) * shape(u); }, { gain: gain * 0.7, pan: clamp(pan[0] + (pan[1] - pan[0]) * 0.5 + side * 0.6, -1, 1), send });
  }
}
const crash = (at, gain = 0.35, decay = 1.8) => air(at, decay * 3, { from: 9000, to: 3500, q: 0.6, gain, band: false, shape: (u) => Math.exp(-u * 3 * 3 / 1) * Math.min(1, u * 400), send: 0.5 });
function hat(at, gain = 0.04, pan = 0.2) { const lp = filter(); voice(at, 0.06, (t) => { lp(noise(), 7000, 0.8); return lp.hp * Math.exp(-t * 90); }, { gain, pan, send: 0.1 }); }
function snare(at, gain = 0.14) { const lp = filter(); voice(at, 0.3, (t) => { lp(noise(), 1900, 0.9); return (lp.bp * 1.6 + 0.5 * Math.sin(TAU * 190 * t) * Math.exp(-t * 30)) * Math.exp(-t * 16); }, { gain, send: 0.35 }); }
function bass(at, f, dur, gain = 0.2) { const lp = filter(); let p = 0; voice(at, dur + 0.05, (t) => { p += f / SR; p -= Math.floor(p); return (lp(2 * p - 1, 260 + 500 * Math.exp(-t * 18), 1.2) + 0.6 * Math.sin(TAU * f * t)) * Math.min(1, t / 0.004) * Math.min(1, Math.max(0, (dur - t) / 0.04)); }, { gain }); }

/* ------------------------------------------------------- 0–4  the last moment */
ensemble(0, 4.6, [n('C1'), n('C2'), n('G2')], { gain: 0.2, attack: 2.6, release: 0.7, cut: [90, 240, 520], detune: 0.004, send: 0.3 });
ensemble(0.6, 4.0, [n('C5'), n('G5'), n('D6')], { gain: 0.035, attack: 2.4, release: 0.5, cut: [900, 2400, 4200], send: 0.8, trem: 0.5 });
for (let k = 0; k < 5; k++) { // 66 bpm heartbeat; each beat lands a little harder
  const at = k / 1.1, g = 0.3 + k * 0.07;
  boom(at, { from: 70, to: 38, drop: 0.05, decay: 0.22, gain: g, send: 0.25 });
  boom(at + 0.165, { from: 60, to: 36, drop: 0.05, decay: 0.26, gain: g * 0.65, send: 0.25 });
}
air(2.3, 1.7, { from: 300, to: 7000, gain: 0.5, shape: (u) => Math.pow(u, 3.2) });
ensemble(2.6, 1.4, [n('C3'), n('G3'), n('C4'), n('G4')], { gain: 0.16, attack: 1.35, release: 0.03, cut: [300, 1400, 5200], send: 0.4 });

/* ---------------------------------------------------- 4–9  the gate opens */
boom(4.0, { from: 110, to: 30, drop: 0.2, decay: 2.2, gain: 1.05, click: 0.5 });
crash(4.0, 0.5, 2.2);
ensemble(4.0, 2.9, ['C2', 'G2', 'C3', 'E3', 'G3', 'C4', 'D4', 'G4'].map(n), { gain: 0.5, attack: 0.05, release: 1.6, cut: [3800, 2200, 700], send: 0.55 });
ensemble(4.0, 2.6, [n('C1'), n('C2')], { gain: 0.3, attack: 0.03, release: 1.4, cut: [300, 220, 120], detune: 0.003, send: 0.1 });
[['E5', 4.02], ['G5', 4.3], ['C6', 4.62]].forEach(([p, at], i) => bell(at, n(p), { gain: 0.07, decay: 1.4, pan: [-0.4, 0.4, 0][i] }));
air(5.0, 1.45, { from: 180, to: 5200, gain: 0.75, shape: (u) => Math.pow(u, 2.4) * (1 - smooth(u, 0.93, 1)), pan: [-0.3, 0.3] }); // the dive
boom(6.3, { from: 80, to: 32, drop: 0.25, decay: 1.9, gain: 0.8 });
crash(6.3, 0.3, 2.4);
ensemble(6.3, 2.9, ['F2', 'C3', 'F3', 'A3', 'C4', 'E4', 'G4', 'C5'].map(n), { gain: 0.44, attack: 0.25, release: 1.2, cut: [900, 3200, 1500], send: 0.6 }); // the universe
ensemble(6.5, 2.6, ['A5', 'C6', 'E6'].map(n), { gain: 0.05, attack: 1.0, release: 0.8, cut: [2000, 5200, 3600], send: 0.9, trem: 0.4 });
[['C5', 6.9], ['E5', 7.4], ['G5', 7.9], ['A5', 8.4]].forEach(([p, at], i) => bell(at, n(p), { gain: 0.085, decay: 1.2, pan: i % 2 ? 0.35 : -0.35 }));
ensemble(8.0, 1.06, ['G2', 'D3', 'G3', 'C4', 'D4', 'G4'].map(n), { gain: 0.32, attack: 0.7, release: 0.06, cut: [700, 2600, 5000], send: 0.5 }); // lift into the montage
air(8.2, 0.8, { from: 600, to: 9000, gain: 0.3, shape: (u) => Math.pow(u, 3) });
for (let k = 0; k < 8; k++) snare(8.5 + k * 0.0625, 0.03 + k * 0.012);

/* ------------------------------------------ 9–17 montage · 17–23 product */
const BEAT = 0.5;
const BARS = [ // each bar is four beats
  { at: 9, root: 'A1', chord: ['A2', 'E3', 'A3', 'C4', 'E4'], arp: ['A4', 'C5', 'E5', 'A5'] },
  { at: 11, root: 'F1', chord: ['F2', 'C3', 'F3', 'A3', 'C4'], arp: ['A4', 'C5', 'F5', 'A5'] },
  { at: 13, root: 'C2', chord: ['C3', 'G3', 'C4', 'E4', 'G4'], arp: ['G4', 'C5', 'E5', 'G5'] },
  { at: 15, root: 'G1', chord: ['G2', 'D3', 'G3', 'B3', 'D4'], arp: ['G4', 'B4', 'D5', 'G5'] },
  { at: 17, root: 'A1', chord: ['A2', 'E3', 'A3', 'C4', 'E4'], arp: ['A4', 'C5', 'E5', 'A5'], calm: true },
  { at: 19, root: 'F1', chord: ['F2', 'C3', 'F3', 'A3', 'C4'], arp: ['A4', 'C5', 'F5', 'A5'], calm: true },
  { at: 21, root: 'G1', chord: ['G2', 'D3', 'G3', 'B3', 'D4'], arp: ['G4', 'B4', 'D5', 'G5'], calm: true },
];
BARS.forEach((bar, b) => {
  const calm = !!bar.calm, lift = calm ? 0 : b / 3; // the montage grows bar by bar
  ensemble(bar.at, 2.02, bar.chord.map(n), { gain: calm ? 0.13 : 0.2 + lift * 0.07, attack: 0.05, release: 0.2, cut: calm ? [700, 1100, 800] : [1400, 2400 + lift * 900, 1500], send: 0.4 });
  for (let k = 0; k < 4; k++) {
    const at = bar.at + k * BEAT;
    if (!calm || k % 2 === 0) boom(at, { from: 120, to: 46, drop: 0.035, decay: calm ? 0.16 : 0.2, gain: calm ? 0.42 : 0.62, send: 0.05, click: 0.25 });
    if (!calm && (k === 1 || k === 3)) snare(at, 0.11 + lift * 0.05);
    for (let e = 0; e < 2; e++) { // bass and hats in eighths
      bass(at + e * 0.25, n(bar.root) * 2, 0.2, calm ? 0.1 : 0.17);
      hat(at + e * 0.25, calm ? 0.022 : 0.04 + (e ? 0.02 : 0), e ? 0.3 : -0.2);
    }
    if (!calm) for (let s = 0; s < 4; s++) { // sixteenth-note strings on the chord
      const tone = bar.chord[1 + ((k * 4 + s) * 3) % 4];
      stab(at + s * 0.125, n(tone) * 2, { gain: 0.05 + lift * 0.025 + (s === 0 ? 0.02 : 0), pan: s % 2 ? 0.45 : -0.45 });
    }
    const up = bar.arp[k]; // one rising figure per bar
    bell(at, n(up), { gain: calm ? 0.05 : 0.075 + lift * 0.02, decay: calm ? 0.5 : 0.7, pan: k % 2 ? 0.3 : -0.3, send: 0.5 });
    if (!calm) bell(at + 0.25, n(bar.arp[(k + 2) % 4]), { gain: 0.04, decay: 0.4, pan: k % 2 ? -0.5 : 0.5, send: 0.5 });
  }
});
boom(9.0, { from: 100, to: 34, drop: 0.2, decay: 1.2, gain: 0.7 });
crash(9.0, 0.3, 1.6);
for (const cut of [10.0, 11.0, 12.5, 14.0, 15.0, 16.0]) air(cut - 0.22, 0.34, { from: 900, to: 7000, gain: 0.16, shape: (u) => Math.sin(Math.PI * u) ** 2, pan: [-0.6, 0.6] });
crash(13.0, 0.16, 1.2);
air(16.3, 0.7, { from: 500, to: 8000, gain: 0.26, shape: (u) => Math.pow(u, 2.6) });
boom(17.0, { from: 90, to: 36, drop: 0.18, decay: 1.0, gain: 0.55 });
// Each product screen lands on the app's own "select" tone.
for (const at of [17.0, 18.0, 18.75, 19.5, 20.5, 21.25, 22.0]) { bell(at, 660, { gain: 0.085, decay: 0.16, bright: 0.05, send: 0.45 }); bell(at + 0.07, 990, { gain: 0.035, decay: 0.2, bright: 0, send: 0.5, pan: 0.2 }); }

/* --------------------------------------------------------- 23–27  the launch */
ensemble(23, 1.02, ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'].map(n), { gain: 0.3, attack: 0.3, release: 0.08, cut: [800, 2200, 3000], send: 0.5 });
ensemble(24, 1.0, ['G2', 'D3', 'G3', 'B3', 'D4', 'G4', 'B4'].map(n), { gain: 0.38, attack: 0.2, release: 0.04, cut: [1400, 3600, 6000], send: 0.5 });
air(23.0, 2.0, { from: 250, to: 9000, gain: 0.55, shape: (u) => Math.pow(u, 2.8) });
for (let k = 0, at = 23; at < 24.97; k++) { boom(at, { from: 110, to: 52, drop: 0.03, decay: 0.12, gain: 0.3 + 0.3 * ((at - 23) / 2), send: 0.2 }); if (at > 24) snare(at, 0.05 + 0.1 * (at - 24)); at += Math.max(0.0625, 0.5 * Math.pow(0.5, Math.floor((at - 23) / 0.5))); }
[['B4', 24.0], ['D5', 24.25], ['G5', 24.5], ['B5', 24.75]].forEach(([p, at]) => bell(at, n(p), { gain: 0.07, decay: 0.5 }));
boom(25.0, { from: 120, to: 30, drop: 0.24, decay: 2.6, gain: 1.1, click: 0.5 });
crash(25.0, 0.5, 2.8);
ensemble(25.0, 2.6, ['C2', 'G2', 'C3', 'E3', 'G3', 'C4', 'E4', 'G4', 'C5', 'E5'].map(n), { gain: 0.6, attack: 0.04, release: 1.5, cut: [4600, 3000, 900], send: 0.6 });
ensemble(25.0, 2.4, [n('C1'), n('C2')], { gain: 0.3, attack: 0.03, release: 1.2, cut: [320, 240, 120], detune: 0.003, send: 0.1 });
[['G5', 25.02], ['C6', 25.5], ['E6', 26.0], ['G6', 26.5]].forEach(([p, at], i) => bell(at, n(p), { gain: 0.06, decay: 1.5, pan: [-0.3, 0.3, -0.2, 0.2][i], send: 0.8 }));

/* --------------------------------------------------- 27–30  sonic signature */
// The app's "celebrate" cue is C5 · E5 · G5 on soft sines. The signature is that figure, slower, answered by C6.
ensemble(27.0, 2.95, ['C2', 'C3', 'G3', 'E4'].map(n), { gain: 0.2, attack: 0.5, release: 1.9, cut: [500, 900, 420], send: 0.5 });
[[523.25, 27.25], [659.25, 27.5], [783.99, 27.75]].forEach(([f, at], i) => bell(at, f, { gain: 0.2, decay: 0.75, pan: (i - 1) * 0.3, send: 0.75, bright: 0.12 }));
bell(28.15, 1046.5, { gain: 0.22, decay: 1.5, send: 0.9, bright: 0.1 });
bell(28.15, 523.25, { gain: 0.1, decay: 1.6, send: 0.8, bright: 0.05 });

/* ------------------------------------------------------------------- reverb */
function reverb(input, spread) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => ({ buf: new Float32Array(Math.round((d + spread) * SR / 44100)), i: 0, lp: 0 }));
  const alls = [225, 556, 441, 341].map((d) => ({ buf: new Float32Array(Math.round((d + spread) * SR / 44100)), i: 0 }));
  const fb = 0.88, damp = 0.28;
  for (let i = 0; i < N; i++) {
    let x = input[i] * 0.03, y = 0;
    for (const c of combs) { const o = c.buf[c.i]; c.lp = o * (1 - damp) + c.lp * damp; c.buf[c.i] = x + c.lp * fb; c.i = (c.i + 1) % c.buf.length; y += o; }
    for (const a of alls) { const o = a.buf[a.i]; a.buf[a.i] = y + o * 0.5; a.i = (a.i + 1) % a.buf.length; y = o - y; }
    out[i] = y;
  }
  return out;
}
const WL = reverb(SL, 0), WR = reverb(SR_, 23);

/* ------------------------------------------------------------------ master */
let peak = 0;
const hpL = filter(), hpR = filter();
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = smooth(t, 0, 0.15) * (1 - smooth(t, 29.55, 29.97));
  hpL(L[i] + WL[i], 24, 0.7); hpR(R[i] + WR[i], 24, 0.7); // remove rumble below hearing
  L[i] = Math.tanh(hpL.hp * 1.05) * fade; R[i] = Math.tanh(hpR.hp * 1.05) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak; // −1 dBFS
const bytes = Buffer.alloc(44 + N * 6);
bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + N * 6, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 6, 28); bytes.writeUInt16LE(6, 32); bytes.writeUInt16LE(24, 34); bytes.write('data', 36); bytes.writeUInt32LE(N * 6, 40);
for (let i = 0; i < N; i++) { bytes.writeIntLE(Math.round(clamp(L[i] * norm, -1, 1) * 8388607), 44 + i * 6, 3); bytes.writeIntLE(Math.round(clamp(R[i] * norm, -1, 1) * 8388607), 47 + i * 6, 3); }
const out = resolve(ROOT, 'out');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'nakshatra-launch-score.wav'), bytes);
console.log(`✓ score: ${SECONDS}s, peak before normalising ${peak.toFixed(3)}`);
