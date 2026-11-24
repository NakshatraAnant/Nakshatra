import { afterEach, describe, expect, it, vi } from 'vitest';
import { CUES, getSoundOn, onSoundChange, playCue, setSoundOn } from './sound';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });

afterEach(() => { store.clear(); vi.unstubAllGlobals(); vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }); });

describe('interface sounds', () => {
  it('are off by default and remember the choice', () => {
    expect(getSoundOn()).toBe(false);
    const seen: boolean[] = [];
    const off = onSoundChange(() => seen.push(getSoundOn()));
    setSoundOn(true);
    setSoundOn(false);
    off();
    expect(seen).toEqual([true, false]);
  });

  it('never create audio while switched off, or outside a user action', () => {
    const made = vi.fn();
    vi.stubGlobal('window', { AudioContext: class { constructor() { made(); } } });
    vi.stubGlobal('navigator', { userActivation: { isActive: true } });
    playCue('react');
    expect(made).not.toHaveBeenCalled();
    setSoundOn(true);
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    playCue('react');
    expect(made).not.toHaveBeenCalled();
  });

  it('keeps every cue short and quiet enough to be a tick, not music', () => {
    for (const notes of Object.values(CUES)) {
      const end = Math.max(...notes.map(([, at, len]) => at + len));
      expect(end).toBeLessThanOrEqual(0.5);
    }
  });
});
