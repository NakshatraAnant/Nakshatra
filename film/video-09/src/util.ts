export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, linear between. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const smooth = (x: number) => { const c = clamp(x); return c * c * (3 - 2 * c); };
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const easeIn = (x: number) => Math.pow(clamp(x), 3);
export const easeInOut = (x: number) => { const c = clamp(x); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; };
/** Rises over [a,b], holds, falls over [c,d]. */
export const window4 = (t: number, a: number, b: number, c: number, d: number) => smooth(seg(t, a, b)) * (1 - smooth(seg(t, c, d)));
/** A short bump peaking at `at`. */
export const pulse = (t: number, at: number, attack: number, release: number) => (t < at ? smooth(seg(t, at - attack, at)) : 1 - smooth(seg(t, at, at + release)));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashKey = (key: string) => [...key].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
