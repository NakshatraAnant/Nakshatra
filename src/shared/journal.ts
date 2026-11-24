import { hashSeed } from './hash';

/**
 * Private journal (journal-v1). Entries are encrypted at rest, visible only to their author, never sent to analytics,
 * never used for the feed, matching, ads or any model, included in data export and deleted with the account.
 * Daily prompts are general reflection questions chosen by date — not by anything about the member.
 */
export const JOURNAL_RULES = { maxChars: 5000, maxPerDay: 10 } as const;

export const JOURNAL_PROMPTS: { key: string; text: string }[] = [
  { key: 'small-good', text: 'What small thing went right today?' },
  { key: 'energy', text: 'What gave you energy today, and what drained it?' },
  { key: 'conversation', text: 'Which conversation is still on your mind? Why?' },
  { key: 'proud', text: 'What did you do today that past-you would be proud of?' },
  { key: 'unsaid', text: 'Is there something you wanted to say but didn’t?' },
  { key: 'notice', text: 'What did you notice today that you usually miss?' },
  { key: 'tomorrow', text: 'What would make tomorrow feel like a good day?' },
  { key: 'person', text: 'Who made your day a little better, and how?' },
  { key: 'worry', text: 'What’s one worry you can set down for tonight?' },
  { key: 'learned', text: 'What did you learn — about anything — today?' },
  { key: 'decision', text: 'What decision are you circling? Write both sides.' },
  { key: 'comfort', text: 'What comforted you this week?' },
  { key: 'change', text: 'What’s one thing you’d like to do differently next week?' },
  { key: 'laugh', text: 'What made you laugh recently?' },
  { key: 'boundary', text: 'Where did you say yes when you meant no — or the other way round?' },
  { key: 'curious', text: 'What are you curious about right now?' },
  { key: 'thanks', text: 'Who do you want to thank, even if you never tell them?' },
  { key: 'body', text: 'How did your body feel today? What did it need?' },
  { key: 'place', text: 'Describe a place you felt at ease today.' },
  { key: 'letter', text: 'Write two lines to yourself a year from now.' },
  { key: 'stuck', text: 'What feels stuck? What’s the smallest next step?' },
  { key: 'enough', text: 'What was “enough” today?' },
  { key: 'song', text: 'What song fits today, and why?' },
  { key: 'kind', text: 'What kind thing did you do, or see someone do?' },
];

export const PROMPT_BY_KEY: Record<string, string> = Object.fromEntries(JOURNAL_PROMPTS.map((p) => [p.key, p.text]));

/** Same prompt for everyone on a given date. */
export function promptForDate(isoDate: string): { key: string; text: string } {
  return JOURNAL_PROMPTS[hashSeed(`journal:${isoDate}`) % JOURNAL_PROMPTS.length];
}

export interface DaySummary { date: string; mood: string | null; journal: number; posts: number; events: number; games: number }

/** Most common mood across days that have one (ties: the most recent). */
export function topMood(days: DaySummary[]): string | null {
  const counts = new Map<string, { n: number; last: string }>();
  for (const d of days) if (d.mood) { const c = counts.get(d.mood) ?? { n: 0, last: '' }; counts.set(d.mood, { n: c.n + 1, last: d.date > c.last ? d.date : c.last }); }
  let best: [string, { n: number; last: string }] | null = null;
  for (const e of counts) if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].last > best[1].last)) best = e;
  return best?.[0] ?? null;
}
