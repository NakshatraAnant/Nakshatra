#!/usr/bin/env python3
"""
Sound design and music for Video 09, synthesised from scratch (numpy only, nothing sampled or licensed).

    python3 film/video-09/scripts/audio.py          -> film/video-09/out/audio.wav  (48 kHz stereo, 30.0 s)

Every cue is placed from the same times the picture uses (src/film.ts, src/headScene.ts) and from the tap times
recorded in footage/meta.json. The interface tones in scene 04 and the closing three-note signature use the
product's own cue notes (src/web/lib/sound.ts: select 660 Hz, react 784/1046 Hz, celebrate 523/659/784 Hz).
There is no voiceover in this file: the VO is recorded separately against the timings in README.md.
"""
import json, os, wave
import numpy as np

SR, DUR = 48000, 30.0
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(9)
dry = np.zeros((N, 2))
wet = np.zeros((N, 2))

REFLECTION_CUTS = [1.5, 1.86, 2.2, 2.52, 2.82, 3.1, 3.36, 3.58, 3.76, 3.9]
DWELL = [5.75, 6.5, 7.25, 8.0, 8.75, 9.5, 10.3]
try:
    META = json.load(open(os.path.join(HERE, '../footage/meta.json')))
except FileNotFoundError:
    META = {'taps': [], 'exampleFrom': 3.0}

def note(n):  # MIDI note -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def put(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i + len(sig) <= 0: return
    a, b = max(i, 0), min(i + len(sig), N)
    s = sig[a - i:b - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[a:b, 0] += s * l
    buf[a:b, 1] += s * r

def env(dur, a=0.01, r=0.3, curve=3.0):
    n = int(dur * SR); t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / max(r, 1e-4))
    return e * np.minimum(1, (dur - t) / 0.01)

def swell(dur, peak=0.7, power=2.0, tail=0.15):
    n = int(dur * SR); x = np.arange(n) / n
    return np.where(x < peak, (x / peak) ** power, np.maximum(0, 1 - (x - peak) / max(1 - peak, 1e-4)) ** (1 / max(tail, 1e-3) * 0.3))

def tone(freq, dur, harmonics=8, rolloff=1.2, bright=None, detune=0.0, voices=1, vibrato=0.0):
    """Additive tone. `bright` (0..1 array) opens the upper harmonics over time, like a filter opening."""
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for v in range(voices):
        f = freq * (1 + detune * (v - (voices - 1) / 2))
        ph = 2 * np.pi * f * t + (vibrato * np.sin(2 * np.pi * 5.1 * t) if vibrato else 0) + rng.uniform(0, 6.28)
        for h in range(1, harmonics + 1):
            if f * h > SR * 0.45: break
            amp = 1 / h ** rolloff
            if bright is not None: amp = amp * np.clip(bright * harmonics - (h - 1), 0, 1)
            out += amp * np.sin(h * ph + h * 0.7)
    return out / voices

def noise(dur, lo, hi):
    n = int(dur * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= np.exp(-0.5 * (np.log(np.maximum(f, 1) / np.sqrt(lo * hi)) / (np.log(hi / lo) / 2.2)) ** 2)
    x = np.fft.irfft(spec, n)
    return x / (np.max(np.abs(x)) + 1e-9)

def sweep_noise(dur, f0, f1, bands=6):
    n = int(dur * SR); x = np.arange(n) / n
    out = np.zeros(n)
    for k in range(bands):
        c = f0 * (f1 / f0) ** (k / (bands - 1))
        w = np.exp(-0.5 * ((x - k / (bands - 1)) * bands / 1.1) ** 2)
        out += noise(dur, c / 1.5, c * 1.5) * w
    return out

def boom(dur=2.5, f0=95, f1=38, drop=0.12):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / drop)
    return 0.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2 / dur * 2.2) * np.minimum(1, t / 0.004)

def bell(freq, dur=3.0, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, dec in [(1, 1, 1.0), (2.0, 0.5 * bright, 1.6), (2.76, 0.32 * bright, 2.4), (4.07, 0.18 * bright, 3.6), (5.4, 0.1 * bright, 5), (0.5, 0.35, 0.8)]:
        if freq * ratio < SR * 0.45: out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t * dec * 3 / dur)
    return out * np.minimum(1, t / 0.003)

def pluck(freq, dur=0.5):
    b = np.exp(-np.arange(int(dur * SR)) / SR * 9)
    return tone(freq, dur, harmonics=7, rolloff=1.5, bright=0.25 + 0.75 * b) * env(dur, 0.004, dur * 0.5)

def pad(freqs, dur, level, bright0=0.25, bright1=0.5):
    n = int(dur * SR)
    b = np.linspace(bright0, bright1, n) if np.isscalar(bright0) else bright0
    out = np.zeros(n)
    for f in freqs: out += tone(f, dur, harmonics=10, rolloff=1.35, bright=b, detune=0.004, voices=3)
    return out / len(freqs) * level

def app_cue(notes):  # the product's own interface tones (lib/sound.ts): [Hz, start s, length s]
    total = max(a + l for _, a, l in notes) + 0.05
    out = np.zeros(int(total * SR))
    for f, at, ln in notes:
        n = int((ln + 0.02) * SR); t = np.arange(n) / SR
        e = np.minimum(1, t / 0.012) * np.exp(-np.maximum(0, t - 0.012) * 7 / ln)
        i = int(at * SR); out[i:i + n] += np.sin(2 * np.pi * f * t) * e
    return out

fade = lambda dur, a, b: np.linspace(a, b, int(dur * SR))
def shaped(dur, points):  # piecewise-linear level curve [(t, level), ...]
    t = np.arange(int(dur * SR)) / SR
    return np.interp(t, [p[0] for p in points], [p[1] for p in points])

# ---------------------------------------------------------------- scene 01: the question (0-4)
put(dry, boom(3.0, 70, 36, 0.2), 0.08, 0.75)
put(wet, bell(note(57), 4.5, 0.7), 0.1, 0.5)                    # the single mysterious pulse (A3)
put(wet, bell(note(64), 3.5, 0.5), 0.14, 0.14, 0.3)
put(dry, pad([note(33), note(45)], 4.0, 1.0, 0.12, 0.3) * shaped(4.0, [(0, 0), (0.6, 0.16), (3.0, 0.3), (4.0, 0.5)]), 0)
for i, c in enumerate(REFLECTION_CUTS):                          # each new reflection: a glass tick, climbing
    f = note(81 + [0, 3, 7, 10, 12, 15, 19, 22, 24, 27][i])
    put(wet, bell(f, 0.7, 1.4), c, 0.11 + i * 0.012, (-1) ** i * 0.5)
    put(dry, noise(0.05, 3000, 9000) * env(0.05, 0.001, 0.02), c, 0.1, (-1) ** i * 0.4)
put(wet, sweep_noise(1.5, 500, 9000) * swell(1.5, 0.97, 2.6), 2.5, 0.42)          # reverse swell into the cut
put(dry, tone(note(33), 1.5, 14, 1.0, bright=fade(1.5, 0.1, 1.0), detune=0.006, voices=3) * swell(1.5, 0.98, 3.0), 2.5, 0.22)

# ---------------------------------------------------------------- scene 02: 24 identities (4-11)
def impact(at, gain=1.0, root=33, major=False):
    put(dry, boom(3.2, 110, 34, 0.1), at, 0.95 * gain)
    put(wet, noise(2.8, 900, 9000) * env(2.8, 0.002, 0.9, 3.2), at, 0.34 * gain)
    put(dry, noise(0.12, 60, 900) * env(0.12, 0.001, 0.05), at, 0.6 * gain)
    third = 4 if major else 3
    chord = [root, root + 12, root + 19, root + 24, root + 24 + third, root + 31]
    b = 0.25 + 0.75 * np.exp(-np.arange(int(3.4 * SR)) / SR * 1.6)
    for k, m in enumerate(chord):
        put(wet, tone(note(m), 3.4, 14, 1.05, bright=b, detune=0.005, voices=3, vibrato=0.02) * env(3.4, 0.03, 1.6, 2.6), at, 0.2 * gain, (k % 3 - 1) * 0.5)
impact(4.0)
put(dry, pad([note(33), note(45), note(52), note(57)], 7.2, 1.0, 0.3, 0.55) * shaped(7.2, [(0, 0.5), (1.5, 0.3), (6.6, 0.42), (7.2, 0.25)]), 4.0)
ost = [57, 64, 60, 64, 57, 64, 62, 64]                           # staccato string figure, sixteenths at 120 bpm
t = 5.5; k = 0
while t < 10.95:
    lvl = 0.07 + 0.09 * (t - 5.5) / 5.5
    put(dry, pluck(note(ost[k % 8] + (12 if (k // 16) % 2 else 0)), 0.3), t, lvl, 0.35 * (-1) ** k)
    put(wet, pluck(note(ost[k % 8]), 0.3), t, lvl * 0.5, -0.35 * (-1) ** k)
    if k % 2 == 0: put(dry, noise(0.04, 5000, 12000) * env(0.04, 0.001, 0.015), t, 0.05)
    t += 0.125; k += 1
for i, d in enumerate(DWELL):                                    # the camera lands on a statue: drum; between: whoosh
    put(dry, boom(1.1, 130, 48, 0.05), d - 0.03, 0.62)
    put(dry, noise(0.09, 80, 1400) * env(0.09, 0.001, 0.04), d - 0.03, 0.4)
    put(wet, bell(note(69 + [0, 3, 7, 5, 10, 7, 12][i]), 1.2, 0.8), d - 0.03, 0.1, (-1) ** i * 0.4)
    if i: put(wet, sweep_noise(0.34, 700, 6000) * swell(0.34, 0.6, 1.6), d - 0.36, 0.3, (-1) ** i * 0.6)
put(wet, sweep_noise(0.5, 400, 5000) * swell(0.5, 0.75, 2.0), 5.0, 0.3)

# ---------------------------------------------------------------- scene 03: your unique blend (11-18)
put(dry, boom(4.5, 80, 30, 0.25), 11.0, 0.9)                     # deep resonant sound
put(wet, bell(note(45), 5.0, 0.4), 11.0, 0.4)
put(wet, sweep_noise(1.2, 5000, 300) * swell(1.2, 0.1, 1.0), 11.0, 0.22)
layers = [(11.0, [33, 45]), (12.5, [52]), (13.4, [57, 60]), (14.3, [64]), (15.2, [67, 69]), (16.0, [72, 76])]
for at, ms in layers:                                            # rising musical layers
    d = 18.0 - at
    put(wet, pad([note(m) for m in ms], d, 1.0, 0.2, 0.75) * shaped(d, [(0, 0), (0.7, 0.3), (d - 0.25, 0.6), (d, 0.0)]), at)
for i in range(5):                                               # one chime per dimension ring
    put(wet, bell(note([69, 72, 74, 76, 79][i]), 2.2, 0.9), 12.5 + i * 0.3, 0.16, (i - 2) * 0.35)
put(wet, sweep_noise(1.95, 300, 7000) * swell(1.95, 0.95, 2.2), 14.3, 0.26)       # two energies converge
put(dry, tone(note(45), 1.95, 12, 1.1, bright=fade(1.95, 0.1, 0.9), detune=0.008, voices=3) * swell(1.95, 0.97, 2.4) * (1 + 0.3 * np.sin(2 * np.pi * np.cumsum(fade(1.95, 4, 16)) / SR)), 14.3, 0.16)
for k in range(8):                                               # the sculpture tries every form
    put(wet, bell(note(81 + [0, 2, 4, 7, 9, 12, 14, 16][k]), 0.5, 1.2), 15.95 + k * 0.14, 0.1, (-1) ** k * 0.6)
put(dry, boom(2.0, 100, 45, 0.08), 17.05, 0.55)                  # it settles
for m, g in [(69, 0.2), (76, 0.16), (81, 0.14), (83, 0.1)]: put(wet, bell(note(m), 3.0, 1.0), 17.05, g)
put(wet, sweep_noise(0.5, 600, 10000) * swell(0.5, 0.96, 2.4), 17.5, 0.36)

# ---------------------------------------------------------------- scene 04: the discovery (18-24)
put(dry, boom(1.6, 90, 42, 0.08), 18.0, 0.5)
put(wet, sweep_noise(0.7, 8000, 500) * swell(0.7, 0.05, 1.0), 18.0, 0.22)
put(wet, pad([note(41), note(53), note(57), note(60)], 6.0, 1.0, 0.2, 0.42) * shaped(6.0, [(0, 0), (0.5, 0.24), (5.2, 0.28), (6.0, 0.12)]), 18.0)
arp = [65, 69, 72, 77, 72, 69]
t = 18.5; k = 0
while t < 23.7:
    put(wet, pluck(note(arp[k % 6]), 0.45), t, 0.055, 0.5 * (-1) ** k)
    t += 0.25; k += 1
taps = META['taps']
for i, tp in enumerate(taps):                                    # subtle digital interaction sounds: the app's own
    last = i == len(taps) - 1
    put(dry, app_cue([[784, 0, 0.09], [1046, 0.07, 0.12]] if last else [[660, 0, 0.08]]), 18 + tp['t'], 0.34)
    put(wet, app_cue([[660, 0, 0.08]]), 18 + tp['t'], 0.1)
    put(dry, noise(0.02, 1500, 5000) * env(0.02, 0.001, 0.008), 18 + tp['t'], 0.12)
ex = 18 + META.get('exampleFrom', 3.0)
put(wet, sweep_noise(1.9, 400, 4000) * swell(1.9, 0.9, 1.6), ex, 0.12)          # the reveal assembles
put(dry, app_cue([[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.22]]), ex + 2.05, 0.3)   # celebrate, as the app plays it
put(wet, app_cue([[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.22]]), ex + 2.05, 0.2)
put(wet, sweep_noise(0.45, 600, 9000) * swell(0.45, 0.96, 2.4), 23.55, 0.34)

# ---------------------------------------------------------------- scene 05: the call to action (24-30)
impact(24.0, 0.8, root=31, major=True)                           # G: the dominant, held open
d = 3.3
put(wet, pad([note(m) for m in [31, 43, 50, 55, 59, 62, 67]], d, 1.0, 0.25, 0.95) * shaped(d, [(0, 0.4), (1.2, 0.5), (3.15, 0.95), (d, 0.0)]), 24.0)
put(wet, tone(note(74), d, 6, 1.6, detune=0.004, voices=3, vibrato=0.04) * shaped(d, [(0, 0), (1.5, 0.05), (3.15, 0.16), (d, 0)]), 24.0)
roll = noise(2.2, 50, 320) * swell(2.2, 0.97, 2.0) * (0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(fade(2.2, 9, 24)) / SR))
put(dry, roll, 25.1, 0.5)                                        # timpani roll into the light
for k in range(6): put(wet, bell(note(79 + [0, 4, 7, 12, 16, 19][k]), 0.9, 1.1), 26.0 + k * 0.12, 0.08, (-1) ** k * 0.5)
put(wet, sweep_noise(0.95, 500, 11000) * swell(0.95, 0.97, 2.6), 26.35, 0.5)
impact(27.3, 1.0, root=36, major=True)                           # resolution: C major, with the wordmark
put(wet, pad([note(m) for m in [36, 48, 55, 60, 64, 67, 72]], 2.7, 1.0, 0.6, 0.35) * shaped(2.7, [(0, 0.5), (0.4, 0.4), (2.0, 0.25), (2.7, 0.0)]), 27.3)
# Sonic signature: the product's celebrate notes (C5, E5, G5), rung as bells, answered an octave up.
for (f, at, g) in [(523.25, 0.0, 0.34), (659.25, 0.17, 0.32), (783.99, 0.34, 0.34), (1046.5, 0.62, 0.22)]:
    put(wet, bell(f, 2.6, 0.9), 27.92 + at, g, (at - 0.3) * 0.8)
    put(dry, bell(f, 1.2, 0.6), 27.92 + at, g * 0.5, (at - 0.3) * 0.8)
put(dry, boom(1.4, 70, 40, 0.1), 28.54, 0.3)

# ---------------------------------------------------------------- space, glue, level
ir_n = int(3.4 * SR); tt = np.arange(ir_n) / SR
ir = rng.standard_normal((ir_n, 2)) * np.exp(-tt * 2.1)[:, None] * np.minimum(1, tt / 0.012)[:, None]
spec_f = np.fft.rfftfreq(N + ir_n, 1 / SR)
tilt = 1 / (1 + (spec_f / 5200) ** 2) * (spec_f > 90)
rev = np.zeros((N, 2))
for c in range(2):
    W = np.fft.rfft(wet[:, c], N + ir_n) * np.fft.rfft(ir[:, c], N + ir_n) * tilt
    rev[:, c] = np.fft.irfft(W, N + ir_n)[:N]
rev /= np.max(np.abs(rev)) + 1e-9
mix = dry * 0.72 + wet * 0.95 + rev * 0.62 * np.max(np.abs(wet))
mix = np.tanh(mix * 0.8 / np.percentile(np.abs(mix), 99.9)) 
edge = int(0.02 * SR); mix[:edge] *= np.linspace(0, 1, edge)[:, None]
out_fade = int(0.45 * SR); mix[-out_fade:] *= (np.linspace(1, 0, out_fade) ** 1.5)[:, None]
mix *= 0.89 / np.max(np.abs(mix))

os.makedirs(os.path.join(HERE, '../out'), exist_ok=True)
path = os.path.join(HERE, '../out/audio.wav')
with wave.open(path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'wrote {path}  {N / SR:.2f}s  peak {np.max(np.abs(mix)):.2f}  rms {np.sqrt(np.mean(mix ** 2)):.3f}')
