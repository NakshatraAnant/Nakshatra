import { DateTime, IANAZone } from 'luxon';

/**
 * Birth-data normalisation: converts a civil (wall-clock) birth moment at a
 * named IANA zone into UTC using the zone's *historical* rules for that date.
 * Node/ICU ships the full IANA tz database, so offsets such as India's
 * 1942–45 war time (+06:30) or US DST history are respected.
 */

export type TimePrecision = 'exact' | 'within_15m' | 'within_1h' | 'unknown';

export interface BirthInput {
  /** YYYY-MM-DD civil date at the birthplace. */
  date: string;
  /** HH:mm (24h) civil time, or null when unknown. */
  time: string | null;
  timePrecision: TimePrecision;
  latitude: number;
  longitude: number;
  /** IANA zone name, e.g. Asia/Kolkata. */
  timezone: string;
}

export interface NormalizedBirth {
  utc: Date;
  /** Offset from UTC in minutes that applied at the birth moment. */
  utcOffsetMinutes: number;
  /** True when the time was unknown and noon was used as the calculation moment. */
  timeAssumed: boolean;
  /** Civil time actually used for calculation (HH:mm). */
  calculationTime: string;
  /** Flags raised during normalisation (e.g. ambiguous DST fold). */
  warnings: string[];
  /** Uncertainty window in minutes either side of the calculation moment. */
  uncertaintyMinutes: number;
}

export class BirthDataError extends Error {
  constructor(message: string, readonly field: string) {
    super(message);
    this.name = 'BirthDataError';
  }
}

const PRECISION_MINUTES: Record<TimePrecision, number> = {
  exact: 2,
  within_15m: 15,
  within_1h: 60,
  unknown: 720,
};

export function validateBirthInput(input: BirthInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new BirthDataError('Date must be YYYY-MM-DD', 'date');
  if (input.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    throw new BirthDataError('Time must be HH:mm (24-hour)', 'time');
  }
  if (input.time === null && input.timePrecision !== 'unknown') {
    throw new BirthDataError('A missing time must be marked as unknown precision', 'timePrecision');
  }
  if (!(input.latitude >= -90 && input.latitude <= 90)) throw new BirthDataError('Latitude out of range', 'latitude');
  if (!(input.longitude >= -180 && input.longitude <= 180)) throw new BirthDataError('Longitude out of range', 'longitude');
  if (!IANAZone.isValidZone(input.timezone)) throw new BirthDataError(`Unknown time zone ${input.timezone}`, 'timezone');
  const [y] = input.date.split('-').map(Number);
  if (y < 1800 || y > 2200) throw new BirthDataError('Year must be between 1800 and 2200', 'date');
}

export function normalizeBirth(input: BirthInput): NormalizedBirth {
  validateBirthInput(input);
  const warnings: string[] = [];
  const timeAssumed = input.time === null;
  const calculationTime = input.time ?? '12:00';
  if (timeAssumed) warnings.push('Birth time unknown: positions computed for local noon; Ascendant, houses and Moon-based factors are uncertain.');

  const [year, month, day] = input.date.split('-').map(Number);
  const [hour, minute] = calculationTime.split(':').map(Number);
  const dt = DateTime.fromObject({ year, month, day, hour, minute }, { zone: input.timezone });
  if (!dt.isValid) throw new BirthDataError(`Invalid date/time: ${dt.invalidExplanation ?? 'unknown'}`, 'date');
  if (dt.day !== day || dt.month !== month) throw new BirthDataError('Date does not exist in the calendar', 'date');

  // Spring-forward gap: Luxon shifts non-existent wall times forward. Detect and flag it.
  if (dt.hour !== hour || dt.minute !== minute) {
    warnings.push(`The local time ${calculationTime} did not exist on this date (clock change); ${dt.toFormat('HH:mm')} was used.`);
  }
  // Fall-back fold: the same wall time occurred twice under two offsets.
  const offsets = new Set([dt.minus({ hours: 3 }).offset, dt.plus({ hours: 3 }).offset]);
  if (offsets.size > 1) {
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    const matches = [...offsets].filter((off) => {
      const instant = DateTime.fromMillis(wall - off * 60000, { zone: input.timezone });
      return instant.hour === hour && instant.minute === minute && instant.day === day;
    });
    if (matches.length > 1) {
      warnings.push(`This local time occurred twice (clock change, offsets ${matches.map(formatOffset).join(' / ')}); offset ${formatOffset(dt.offset)} was used.`);
    }
  }

  return {
    utc: dt.toUTC().toJSDate(),
    utcOffsetMinutes: dt.offset,
    timeAssumed,
    calculationTime,
    warnings,
    uncertaintyMinutes: PRECISION_MINUTES[input.timePrecision],
  };
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Julian Day (UT) of a JS Date. */
export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Julian centuries since J2000.0 (TT approximated by UT; sub-minute error is irrelevant to precession). */
export function centuriesSinceJ2000(date: Date): number {
  return (julianDay(date) - 2451545.0) / 36525;
}

/** Local civil date string (YYYY-MM-DD) of an instant at a zone. */
export function localDate(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone }).toISODate()!;
}

export function zonedDateTime(date: Date, zone: string): DateTime {
  return DateTime.fromJSDate(date, { zone });
}
