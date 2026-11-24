export function money(paise: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
}

export function dateLong(iso: string | Date, locale = 'en-IN', tz?: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date(iso));
}

export function dateShort(iso: string | Date, locale = 'en-IN', tz?: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: tz }).format(new Date(iso));
}

export function time(iso: string | Date, locale = 'en-IN', tz?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

export function dateTime(iso: string | Date, locale = 'en-IN', tz?: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
}

/** Calendar date strings (YYYY-MM-DD) are formatted without time-zone shifting. */
export function civilDate(ymd: string, locale = 'en-IN', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function relative(iso: string | Date, locale = 'en'): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return dateShort(iso);
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function initials(name?: string | null): string {
  return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
