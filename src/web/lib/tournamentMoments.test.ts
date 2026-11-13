import { describe, expect, it } from 'vitest';
import { remaining, runOutcome } from './tournamentMoments';

describe('tournament moments', () => {
  it('formats time left from real timestamps', () => {
    expect(remaining(-5)).toBe('0:00');
    expect(remaining(65_000)).toBe('1:05');
    expect(remaining(2 * 3600_000 + 3 * 60_000)).toBe('2h 03m');
    expect(remaining(26 * 3600_000)).toBe('1d 2h');
  });

  it('only says "won" for first place in a closed tournament, and never while a run is held', () => {
    expect(runOutcome({ status: 'open', rank: 1, ranked: 3, flag: null })).toEqual({ title: 'Run complete', tone: 'done', final: false });
    expect(runOutcome({ status: 'closed', rank: 1, ranked: 3, flag: null })).toEqual({ title: 'You won', tone: 'win', final: true });
    expect(runOutcome({ status: 'closed', rank: 1, ranked: 1, flag: null }).title).toBe('You finished first');
    expect(runOutcome({ status: 'closed', rank: 2, ranked: 3, flag: null }).title).toBe('You finished #2 of 3');
    expect(runOutcome({ status: 'closed', rank: 1, ranked: 3, flag: 'too_fast' })).toEqual({ title: 'Run held for review', tone: 'held', final: false });
    expect(runOutcome({ status: 'closed', rank: null, ranked: 0, flag: null }).tone).toBe('done');
  });
});
