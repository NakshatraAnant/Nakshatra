import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { occurrenceAt, occurrencesBetween } from './recurrence';

const local = (d: Date, tz: string) => DateTime.fromJSDate(d, { zone: tz }).toFormat('ccc yyyy-LL-dd HH:mm');

describe('recurrence', () => {
  it('weekly and fortnightly keep the same local time', () => {
    const spec = { firstStartsAt: DateTime.fromISO('2026-11-10T19:00', { zone: 'Asia/Kolkata' }).toJSDate(), timezone: 'Asia/Kolkata', frequency: 'weekly' as const, until: null };
    expect([0, 1, 2].map((k) => local(occurrenceAt(spec, k), 'Asia/Kolkata'))).toEqual(['Tue 2026-11-10 19:00', 'Tue 2026-11-17 19:00', 'Tue 2026-11-24 19:00']);
    expect(local(occurrenceAt({ ...spec, frequency: 'fortnightly' }, 2), 'Asia/Kolkata')).toBe('Tue 2026-12-08 19:00');
  });

  it('keeps wall-clock time across a daylight-saving change', () => {
    const spec = { firstStartsAt: DateTime.fromISO('2027-03-01T18:30', { zone: 'Europe/London' }).toJSDate(), timezone: 'Europe/London', frequency: 'weekly' as const, until: null };
    const after = occurrenceAt(spec, 4); // 29 March 2027, after the clocks go forward
    expect(local(after, 'Europe/London')).toBe('Mon 2027-03-29 18:30');
    expect(after.getTime() - occurrenceAt(spec, 3).getTime()).toBe(7 * 864e5 - 3600e3);
  });

  it('monthly repeats on the same weekday of the same week; a 5th-week start uses the last one', () => {
    const second = { firstStartsAt: DateTime.fromISO('2026-11-10T19:00', { zone: 'Asia/Kolkata' }).toJSDate(), timezone: 'Asia/Kolkata', frequency: 'monthly' as const, until: null };
    expect([1, 2, 3].map((k) => local(occurrenceAt(second, k), 'Asia/Kolkata'))).toEqual(['Tue 2026-12-08 19:00', 'Tue 2027-01-12 19:00', 'Tue 2027-02-09 19:00']);
    const fifth = { ...second, firstStartsAt: DateTime.fromISO('2026-12-29T19:00', { zone: 'Asia/Kolkata' }).toJSDate() };
    expect(local(occurrenceAt(fifth, 1), 'Asia/Kolkata')).toBe('Tue 2027-01-26 19:00');
    expect(local(occurrenceAt(fifth, 2), 'Asia/Kolkata')).toBe('Tue 2027-02-23 19:00');
  });

  it('stops at the end date and the window', () => {
    const first = DateTime.fromISO('2026-11-10T19:00', { zone: 'Asia/Kolkata' }).toJSDate();
    const spec = { firstStartsAt: first, timezone: 'Asia/Kolkata', frequency: 'weekly' as const, until: DateTime.fromISO('2026-11-25', { zone: 'Asia/Kolkata' }).toJSDate() };
    expect(occurrencesBetween(spec, new Date(first.getTime() - 1), new Date(first.getTime() + 365 * 864e5), 10)).toHaveLength(3);
    expect(occurrencesBetween({ ...spec, until: null }, new Date(first.getTime() - 1), new Date(first.getTime() + 15 * 864e5), 10)).toHaveLength(3);
    expect(occurrencesBetween({ ...spec, until: null }, first, new Date(first.getTime() + 365 * 864e5), 2)).toHaveLength(2);
  });
});
