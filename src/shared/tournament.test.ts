import { describe, expect, it } from 'vitest';
import { TOURNAMENT_RULES as R, judgeEntry, rankByPoints, rankEntries, timeLimitMs, tournamentStatus } from './tournament';

describe('tournament rules', () => {
  it('status follows the window; cancellation wins', () => {
    const opensAt = new Date('2026-11-06T10:00:00Z');
    const closesAt = new Date('2026-11-06T12:00:00Z');
    expect(tournamentStatus({ opensAt, closesAt, cancelledAt: null }, new Date('2026-11-06T09:00:00Z'))).toBe('upcoming');
    expect(tournamentStatus({ opensAt, closesAt, cancelledAt: null }, new Date('2026-11-06T11:00:00Z'))).toBe('open');
    expect(tournamentStatus({ opensAt, closesAt, cancelledAt: null }, closesAt)).toBe('closed');
    expect(tournamentStatus({ opensAt, closesAt, cancelledAt: new Date() }, new Date('2026-11-06T11:00:00Z'))).toBe('cancelled');
  });

  it('flags implausibly fast and over-time runs', () => {
    expect(timeLimitMs(5, 20)).toBe((100 + R.graceSeconds) * 1000);
    expect(judgeEntry(5 * R.minMsPerQuestion - 1, 5, 20)).toBe('too_fast');
    expect(judgeEntry(5 * R.minMsPerQuestion, 5, 20)).toBeNull();
    expect(judgeEntry(timeLimitMs(5, 20), 5, 20)).toBeNull();
    expect(judgeEntry(timeLimitMs(5, 20) + 1, 5, 20)).toBe('over_time');
  });

  it('ranks by score, then time; exact ties share a rank (1, 1, 3)', () => {
    const r = rankEntries([
      { userId: 'c', score: 2, durationMs: 9000, finishedAt: '2026-11-06T10:03:00Z' },
      { userId: 'a', score: 3, durationMs: 9000, finishedAt: '2026-11-06T10:05:00Z' },
      { userId: 'b', score: 3, durationMs: 9000, finishedAt: '2026-11-06T10:01:00Z' },
      { userId: 'd', score: 3, durationMs: 12000, finishedAt: '2026-11-06T10:00:00Z' },
    ]);
    expect(r.map((x) => [x.userId, x.rank])).toEqual([['b', 1], ['a', 1], ['d', 3], ['c', 4]]);
  });

  it('ranks points with shared ranks and a stable name order', () => {
    expect(rankByPoints([{ name: 'Zed', points: 10 }, { name: 'Ama', points: 10 }, { name: 'Bo', points: 40 }, { name: 'Cy', points: 0 }]).map((x) => `${x.rank}${x.name}`))
      .toEqual(['1Bo', '2Ama', '2Zed', '4Cy']);
  });
});
