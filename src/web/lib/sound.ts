/**
 * Interface sounds. Off by default and saved per device. When switched on, a few very short tones are
 * synthesised in the browser (no audio files, nothing to license or download) and played only straight after
 * something the person did — never on page load, never on a timer, never as music.
 */
const KEY = 'nk_sound';
const listeners = new Set<() => void>();

export function getSoundOn(): boolean {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
export function setSoundOn(on: boolean) {
  try { if (on) localStorage.setItem(KEY, 'on'); else localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}
export function onSoundChange(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export type Cue = 'react' | 'celebrate' | 'select';

/** Notes per cue: [frequency Hz, start s, length s]. Soft, short, quiet. */
export const CUES: Record<Cue, [number, number, number][]> = {
  select: [[660, 0, 0.08]],
  react: [[784, 0, 0.09], [1046, 0.07, 0.12]],
  celebrate: [[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.22]],
};

let ctx: AudioContext | null = null;

/** True only during the short window after a real tap, click or key press. */
function justActed(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return ua ? ua.isActive : true;
}

export function playCue(cue: Cue) {
  if (!getSoundOn() || !justActed()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [f, at, len] of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.05, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    }
  } catch { /* audio unavailable: stay silent */ }
}
