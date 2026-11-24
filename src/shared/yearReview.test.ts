import { describe, expect, it } from 'vitest';
import { SHAREABLE_FACTS, cardValue, highlightsFor, longestRun, summariseYear, type YearFacts } from './yearReview';

const base: YearFacts = { activeDays: 0, longestRun: 0, busiestMonth: null, drops: 0, reactions: 0, circles: 0, games: 0, quizzes: 0, tournaments: 0, events: 0, archetype: null, checkins: 0, topMood: null, journalDays: 0 };

describe('year in review', () => {
  it('never allows private facts on a card', () => {
    for (const k of ['checkins', 'topMood', 'journalDays']) expect(SHAREABLE_FACTS).not.toContain(k);
    expect(SHAREABLE_FACTS).toContain('activeDays');
  });

  it('counts the longest run across month and year boundaries, ignoring duplicates', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun(['2026-01-31', '2026-02-01', '2026-02-02', '2026-02-02', '2026-02-05'])).toBe(3);
    expect(longestRun(['2024-02-28', '2024-02-29', '2024-03-01'])).toBe(3);
  });

  it('folds sources into active days, months and the busiest month; other years are ignored', () => {
    const y = summariseYear(2026, {
      drops: [{ d: '2026-03-01', n: 2 }, { d: '2026-03-02', n: 1 }],
      journal: [{ d: '2026-03-02', n: 1 }, { d: '2025-12-31', n: 4 }],
      games: [{ d: '2026-07-10', n: 3 }],
    });
    expect(y.totals.drops).toBe(3);
    expect(y.totals.journal).toBe(1);
    expect(y.activeDays).toBe(3);
    expect(y.longestRun).toBe(2);
    expect(y.months[2]).toBe(4);
    expect(y.busiestMonth).toBe('March');
    expect(summariseYear(2026, {}).busiestMonth).toBeNull();
    expect(summariseYear(2026, { drops: [{ d: '2026-01-05', n: 2 }], games: [{ d: '2026-02-05', n: 2 }] }).busiestMonth).toBe('February');
  });

  it('writes at most three true highlights and never mentions moods or the journal', () => {
    expect(highlightsFor(base, false)).toEqual([]);
    const h = highlightsFor({ ...base, activeDays: 40, longestRun: 12, busiestMonth: 'May', games: 1, drops: 5, reactions: 1, checkins: 30, topMood: 'calm', journalDays: 20 }, true);
    expect(h).toHaveLength(3);
    expect(h[0]).toBe('You showed up on 40 days so far.');
    expect(h.join(' ')).not.toMatch(/calm|journal|mood/i);
    expect(highlightsFor({ ...base, drops: 1, reactions: 1 }, false)).toEqual(['You shared 1 Thought Drop, and they got 1 reaction.']);
  });

  it('shows nothing on a card for empty facts', () => {
    expect(cardValue(base, 'drops')).toBeNull();
    expect(cardValue({ ...base, drops: 4 }, 'drops')).toBe('4');
    expect(cardValue({ ...base, archetype: 'The Lantern' }, 'archetype')).toBe('The Lantern');
  });
});
