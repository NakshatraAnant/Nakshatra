/**
 * Words for the tournament's two moments — waiting to start and having finished. Both read only what the server
 * returned (times, rank, review flag); nothing here decides a result or a reward.
 */
export function remaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export interface Outcome { title: string; tone: 'win' | 'done' | 'held'; final: boolean }

/** The headline for a finished run. "Won" is only ever said once the tournament is closed and the rank is 1. */
export function runOutcome(o: { status: string; rank: number | null; ranked: number; flag: string | null }): Outcome {
  if (o.flag) return { title: 'Run held for review', tone: 'held', final: false };
  const final = o.status === 'closed';
  if (o.rank === null) return { title: 'Run complete', tone: 'done', final };
  if (final) return o.rank === 1 ? { title: o.ranked > 1 ? 'You won' : 'You finished first', tone: 'win', final } : { title: `You finished #${o.rank} of ${o.ranked}`, tone: 'done', final };
  return { title: 'Run complete', tone: 'done', final };
}
