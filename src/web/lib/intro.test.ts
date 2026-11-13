import { describe, expect, it } from 'vitest';
import { INTRO_LENGTH, INTRO_SCENES, introSceneAt, phase, shouldPlayIntro } from './intro';

describe('cinematic introduction', () => {
  it('has seven scenes in order inside fifteen seconds, ending on the invitation', () => {
    expect(INTRO_SCENES).toHaveLength(7);
    const at = INTRO_SCENES.map((s) => s.at);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(INTRO_LENGTH).toBe(15);
    expect(INTRO_SCENES[6].line).toBe('Discover your kind of person.');
    expect([0, 1.9, 2, 5, 8.9, 10, 12, 14.9].map(introSceneAt)).toEqual([0, 0, 1, 2, 3, 4, 5, 6]);
  });

  it('plays itself only for a first-time signed-out visitor with motion allowed', () => {
    const base = { replay: false, signedIn: false, seen: false, reducedMotion: false };
    expect(shouldPlayIntro(base)).toBe(true);
    expect(shouldPlayIntro({ ...base, seen: true })).toBe(false);
    expect(shouldPlayIntro({ ...base, signedIn: true })).toBe(false);
    expect(shouldPlayIntro({ ...base, reducedMotion: true })).toBe(false);
    // A replay is an explicit request, so it always plays.
    expect(shouldPlayIntro({ replay: true, signedIn: true, seen: true, reducedMotion: true })).toBe(true);
  });

  it('eases phases between 0 and 1', () => {
    expect(phase(1, 2, 4)).toBe(0);
    expect(phase(3, 2, 4)).toBe(0.5);
    expect(phase(9, 2, 4)).toBe(1);
  });
});
