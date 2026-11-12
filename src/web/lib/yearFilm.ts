/**
 * The Year in Review film: a short sequence of beats built only from the person's own review (the same numbers
 * and highlights the page already shows). Each beat names a month the camera turns to, or none for the
 * opening and closing wide shots. Nothing is invented: a quiet year gets a short, honest film.
 */
export interface FilmBeat { key: string; title: string; body: string; month: number | null }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const BEAT_SECONDS = 3.4;

export function filmBeats(r: { year: number; soFar: boolean; months: number[]; highlights: string[] }): FilmBeat[] {
  const total = r.months.reduce((a, b) => a + b, 0);
  const beats: FilmBeat[] = [{ key: 'open', title: `${r.year}${r.soFar ? ' so far' : ''}`, body: total ? `${total} thing${total === 1 ? '' : 's'} you did on Nakshatra, month by month.` : 'A quiet year here so far.', month: null }];
  if (total) {
    const busiest = r.months.reduce((best, n, i) => (n > r.months[best] ? i : best), 0);
    const first = r.months.findIndex((n) => n > 0);
    if (first !== busiest) beats.push({ key: 'first', title: `It started in ${MONTH_NAMES[first]}`, body: `${r.months[first]} thing${r.months[first] === 1 ? '' : 's'} that month.`, month: first });
    beats.push({ key: 'busiest', title: `${MONTH_NAMES[busiest]} was your busiest month`, body: `${r.months[busiest]} thing${r.months[busiest] === 1 ? '' : 's'} that month.`, month: busiest });
  }
  r.highlights.slice(0, 4).forEach((h, i) => beats.push({ key: `h${i}`, title: h, body: '', month: null }));
  beats.push({ key: 'close', title: r.soFar ? 'And the year isn’t over yet.' : `That was your ${r.year}.`, body: 'Everything here came from your own activity, and only you can see it unless you share a card.', month: null });
  return beats;
}
