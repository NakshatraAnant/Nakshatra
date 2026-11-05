import { describe, expect, it } from 'vitest';
import { QUESTS, SEASONS, computeStreak, currentSeason, isoWeek } from './progression';

const days = (...d: string[]) => d;

describe('streaks', () => {
  it('counts consecutive days ending today or yesterday', () => {
    expect(computeStreak(days('2026-11-03', '2026-11-04', '2026-11-05'), '2026-11-05')).toMatchObject({ current: 3, activeToday: true });
    // Today not done yet: the streak is still alive.
    expect(computeStreak(days('2026-11-03', '2026-11-04'), '2026-11-05')).toMatchObject({ current: 2, activeToday: false });
  });

  it('forgives one missed day per week, but not two in a row', () => {
    expect(computeStreak(days('2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'), '2026-11-05')).toMatchObject({ current: 4, graceUsed: 1 });
    expect(computeStreak(days('2026-11-01', '2026-11-02', '2026-11-05'), '2026-11-05').current).toBe(1);
    // Two separate gaps inside one week: only one is bridged.
    expect(computeStreak(days('2026-10-30', '2026-11-01', '2026-11-03', '2026-11-04', '2026-11-05'), '2026-11-05').current).toBe(4);
  });

  it('a broken streak resets to zero without removing the best', () => {
    const r = computeStreak(days('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'), '2026-11-05');
    expect(r.current).toBe(0);
    expect(r.best).toBe(5);
  });

  it('is time-zone safe because it works on local calendar dates (year boundary)', () => {
    expect(computeStreak(days('2026-12-30', '2026-12-31', '2027-01-01'), '2027-01-01').current).toBe(3);
  });

  it('can be configured with no grace', () => {
    expect(computeStreak(days('2026-11-03', '2026-11-05'), '2026-11-05', 0).current).toBe(1);
  });
});

describe('periods and definitions', () => {
  it('ISO weeks', () => {
    expect(isoWeek('2026-11-05')).toBe('2026-W45');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
  });

  it('quest keys are unique, rewards modest, and every quest has steps', () => {
    expect(new Set(QUESTS.map((q) => q.key)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.steps.length).toBeGreaterThan(0);
      expect(q.xp).toBeGreaterThan(0);
      if (q.period === 'daily') expect(q.xp).toBeLessThanOrEqual(10);
    }
  });

  it('seasons do not overlap and the premium track stays off', () => {
    for (const s of SEASONS) {
      expect(s.premiumTrack.enabled).toBe(false);
      expect(s.milestones.map((m) => m.at)).toEqual([...s.milestones.map((m) => m.at)].sort((a, b) => a - b));
    }
    expect(currentSeason('2026-11-05')?.key).toBe('s1-first-light');
    expect(currentSeason('2030-01-01')).toBeNull();
  });
});
