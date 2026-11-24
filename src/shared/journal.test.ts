import { describe, expect, it } from 'vitest';
import { JOURNAL_PROMPTS, promptForDate, topMood } from './journal';

describe('journal', () => {
  it('gives everyone the same prompt for a date, and rotates across dates', () => {
    expect(promptForDate('2026-11-07')).toEqual(promptForDate('2026-11-07'));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => promptForDate(`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`).key));
    expect(seen.size).toBeGreaterThan(10);
    expect(new Set(JOURNAL_PROMPTS.map((p) => p.key)).size).toBe(JOURNAL_PROMPTS.length);
  });

  it('picks the most common mood, ties going to the most recent', () => {
    const d = (date: string, mood: string | null) => ({ date, mood, journal: 0, posts: 0, events: 0, games: 0 });
    expect(topMood([d('2026-11-01', 'calm'), d('2026-11-02', 'busy'), d('2026-11-03', 'calm')])).toBe('calm');
    expect(topMood([d('2026-11-01', 'calm'), d('2026-11-02', 'busy')])).toBe('busy');
    expect(topMood([d('2026-11-01', null)])).toBeNull();
  });
});
