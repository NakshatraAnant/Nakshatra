/**
 * Voice-note waveform: peaks computed from the recording's real samples (decoded in the browser), never invented.
 * `peaks` is pure so it can be tested; `decodePeaks` does the browser decoding.
 */
export const WAVE_BARS = 40;

/** Loudest absolute sample in each of `bars` equal slices, scaled so the loudest bar is 1. */
export function peaks(samples: Float32Array, bars = WAVE_BARS): number[] {
  if (!samples.length) return Array(bars).fill(0);
  const size = Math.max(1, Math.floor(samples.length / bars));
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    let max = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) { const v = Math.abs(samples[i]); if (v > max) max = v; }
    out.push(max);
  }
  const top = Math.max(...out);
  return top > 0 ? out.map((v) => Math.round((v / top) * 1000) / 1000) : out;
}

const cache = new Map<string, Promise<number[] | null>>();

/** Decodes a same-origin voice note once and returns its peaks; null when the browser cannot decode it. */
export function decodePeaks(url: string): Promise<number[] | null> {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        const buf = await fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))));
        const ctx = new AC();
        try { return peaks((await ctx.decodeAudioData(buf)).getChannelData(0)); } finally { void ctx.close(); }
      } catch { return null; }
    })());
  }
  return cache.get(url)!;
}
