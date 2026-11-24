/**
 * Year in review — a member's own year, built only from their own records. Counts and calendar facts only:
 * never comparisons with other members, never anything inferred about them.
 *
 * Some facts are private by design (moods, journal) and can never be put on a shareable card; the server
 * accepts only SHAREABLE keys and computes every shared value itself.
 */

export const YEAR_FACTS = [
  { key: 'activeDays', label: 'Days you showed up', shareable: true },
  { key: 'longestRun', label: 'Longest run of days', shareable: true },
  { key: 'busiestMonth', label: 'Busiest month', shareable: true },
  { key: 'drops', label: 'Thought Drops', shareable: true },
  { key: 'reactions', label: 'Reactions on your drops', shareable: true },
  { key: 'circles', label: 'Circles joined', shareable: true },
  { key: 'games', label: 'Games played', shareable: true },
  { key: 'quizzes', label: 'Quizzes taken', shareable: true },
  { key: 'tournaments', label: 'Tournaments finished', shareable: true },
  { key: 'events', label: 'Circle events', shareable: true },
  { key: 'archetype', label: 'Archetype', shareable: true },
  { key: 'checkins', label: 'Mood check-ins', shareable: false },
  { key: 'topMood', label: 'Most common mood', shareable: false },
  { key: 'journalDays', label: 'Journal days', shareable: false },
] as const;

export type YearFactKey = (typeof YEAR_FACTS)[number]['key'];
export const SHAREABLE_FACTS = YEAR_FACTS.filter((f) => f.shareable).map((f) => f.key) as YearFactKey[];
export const FACT_LABEL: Record<string, string> = Object.fromEntries(YEAR_FACTS.map((f) => [f.key, f.label]));

export const YEAR_RULES = {
  /** A card shows at most this many facts. */
  maxCardFacts: 6,
  /** Live (unrevoked) cards per member. */
  maxActiveCards: 10,
  /** Below this many active days the year is "quiet": the recap still shows, sharing is not offered. */
  minActiveDaysToShare: 3,
} as const;

/** Activity sources that count towards active days and the busiest month. */
export const ACTIVITY_SOURCES = ['drops', 'games', 'quizzes', 'tournaments', 'events', 'checkins', 'journal'] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];
export type DayCount = { d: string; n: number };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Longest run of consecutive ISO dates. */
export function longestRun(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0, run = 0, prev = 0;
  for (const iso of sorted) {
    const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    run = run && t - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/**
 * Folds per-day counts from each source into the year's shape: totals per source, distinct active days,
 * the longest run, activity per month and the busiest month (ties go to the later month).
 */
export function summariseYear(year: number, perSource: Partial<Record<ActivitySource, DayCount[]>>) {
  const totals = Object.fromEntries(ACTIVITY_SOURCES.map((k) => [k, 0])) as Record<ActivitySource, number>;
  const months = Array.from({ length: 12 }, () => 0);
  const days = new Set<string>();
  for (const src of ACTIVITY_SOURCES) for (const { d, n } of perSource[src] ?? []) {
    if (!d || Number(d.slice(0, 4)) !== year || n <= 0) continue;
    totals[src] += n;
    months[Number(d.slice(5, 7)) - 1] += n;
    days.add(d);
  }
  let busiest = -1;
  months.forEach((n, i) => { if (n > 0 && (busiest < 0 || n >= months[busiest])) busiest = i; });
  return { totals, months, activeDays: days.size, longestRun: longestRun(days), busiestMonth: busiest < 0 ? null : MONTHS[busiest] };
}

export type YearFacts = {
  activeDays: number; longestRun: number; busiestMonth: string | null; drops: number; reactions: number; circles: number;
  games: number; quizzes: number; tournaments: number; events: number; archetype: string | null;
  checkins: number; topMood: string | null; journalDays: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Up to three plain, true sentences about the year, strongest first. Private facts never appear here. */
export function highlightsFor(f: YearFacts, soFar: boolean): string[] {
  const out: { score: number; text: string }[] = [];
  if (f.activeDays) out.push({ score: f.activeDays, text: `You showed up on ${plural(f.activeDays, 'day')}${soFar ? ' so far' : ''}.` });
  if (f.longestRun >= 3) out.push({ score: f.longestRun * 3, text: `Your longest run was ${f.longestRun} days in a row.` });
  if (f.busiestMonth) out.push({ score: 5, text: `${f.busiestMonth} was your busiest month.` });
  if (f.games) out.push({ score: f.games * 2, text: `You played ${plural(f.games, 'game')} with your people.` });
  if (f.drops) out.push({ score: f.drops, text: `You shared ${plural(f.drops, 'Thought Drop')}${f.reactions ? `, and they got ${plural(f.reactions, 'reaction')}` : ''}.` });
  if (f.circles) out.push({ score: f.circles * 4, text: `You joined ${plural(f.circles, 'circle')}.` });
  if (f.tournaments) out.push({ score: f.tournaments * 4, text: `You finished ${plural(f.tournaments, 'tournament')}.` });
  if (f.events) out.push({ score: f.events * 4, text: `You went to ${plural(f.events, 'circle event')}.` });
  return out.sort((a, b) => b.score - a.score).slice(0, 3).map((h) => h.text);
}

/** The value a shareable fact shows on a card, or null when there is nothing to show. */
export function cardValue(f: YearFacts, key: YearFactKey): string | null {
  const v = f[key];
  if (v === null || v === 0) return null;
  return typeof v === 'number' ? String(v) : v;
}
