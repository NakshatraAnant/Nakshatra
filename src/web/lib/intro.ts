/**
 * First-visit cinematic introduction: seven scenes over fifteen seconds. The timeline lives here so the 3D scene,
 * the words on screen and the tests all agree. No sound. Shown once per device to signed-out first-time visitors
 * with motion allowed; it can always be replayed on request.
 */
export interface IntroScene { key: string; at: number; title: string; line: string }

export const INTRO_SCENES: IntroScene[] = [
  { key: 'beginning', at: 0, title: '', line: '' },
  { key: 'awakening', at: 2, title: '', line: 'Everyone starts as a single light.' },
  { key: 'formation', at: 4, title: '', line: 'What you think, say and choose gives it a shape.' },
  { key: 'expansion', at: 6, title: '', line: 'And a shape finds others like it.' },
  { key: 'portal', at: 9, title: '', line: 'This is where they meet.' },
  { key: 'brand', at: 11, title: 'Nakshatra', line: '' },
  { key: 'invitation', at: 13, title: 'Nakshatra', line: 'Discover your kind of person.' },
];
export const INTRO_LENGTH = 15;

export function introSceneAt(t: number): number {
  let i = 0;
  INTRO_SCENES.forEach((s, k) => { if (t >= s.at) i = k; });
  return i;
}

const KEY = 'nk_intro_seen';
export function introSeen(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
export function markIntroSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ } }

/** Auto-play only for a signed-out visitor who has not seen it, with motion allowed. A replay request always plays. */
export function shouldPlayIntro(o: { replay: boolean; signedIn: boolean; seen: boolean; reducedMotion: boolean }): boolean {
  if (o.replay) return true;
  return !o.signedIn && !o.seen && !o.reducedMotion;
}

/** 0…1 eased progress of t between a and b. */
export const phase = (t: number, a: number, b: number) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
