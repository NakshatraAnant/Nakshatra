import { DateTime } from 'luxon';

/**
 * Recurring circle events (recurrence-v1). A series keeps its wall-clock time in the circle's time zone, so a
 * 7 pm weekly event stays at 7 pm across daylight-saving changes. Monthly series repeat on the same weekday of
 * the same week of the month as the first occurrence ("2nd Tuesday"); a 5th-week start repeats on the last one.
 * Occurrences are materialised a few weeks ahead as ordinary events, so RSVPs and reminders work unchanged.
 */
export type Frequency = 'weekly' | 'fortnightly' | 'monthly';
export const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly'];
export const FREQUENCY_LABEL: Record<Frequency, string> = { weekly: 'Every week', fortnightly: 'Every two weeks', monthly: 'Every month' };
export const RECURRENCE_RULES = { horizonDays: 42, maxAhead: 6, maxSeriesPerCircle: 10, maxChannels: 10 } as const;

export interface SeriesSpec { firstStartsAt: Date; timezone: string; frequency: Frequency; until: Date | null }

function nthWeekday(year: number, month: number, weekday: number, ordinal: number, base: DateTime): DateTime {
  const first = base.set({ year, month, day: 1 });
  const offset = (weekday - first.weekday + 7) % 7;
  let d = first.plus({ days: offset + (ordinal - 1) * 7 });
  if (ordinal >= 5 || d.month !== month) {
    // Last such weekday in the month.
    const last = first.endOf('month').startOf('day').set({ hour: base.hour, minute: base.minute, second: 0, millisecond: 0 });
    d = last.minus({ days: (last.weekday - weekday + 7) % 7 });
  }
  return d;
}

/** The k-th occurrence (k = 0 is the first). */
export function occurrenceAt(spec: SeriesSpec, k: number): Date {
  const start = DateTime.fromJSDate(spec.firstStartsAt, { zone: spec.timezone });
  if (spec.frequency === 'weekly') return start.plus({ weeks: k }).toJSDate();
  if (spec.frequency === 'fortnightly') return start.plus({ weeks: 2 * k }).toJSDate();
  const ordinal = Math.ceil(start.day / 7);
  const target = start.startOf('month').plus({ months: k });
  return nthWeekday(target.year, target.month, start.weekday, ordinal, start).toJSDate();
}

/** Occurrences starting after `after` (exclusive) and no later than `before`, capped at `max`, respecting `until`. */
export function occurrencesBetween(spec: SeriesSpec, after: Date, before: Date, max: number): Date[] {
  const out: Date[] = [];
  for (let k = 0; k < 520 && out.length < max; k++) {
    const at = occurrenceAt(spec, k);
    if (spec.until && at > spec.until) break;
    if (at > before) break;
    if (at > after) out.push(at);
  }
  return out;
}
