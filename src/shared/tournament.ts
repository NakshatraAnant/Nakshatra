/**
 * Async trivia tournaments and seasonal leaderboards — pure rules shared by server and client.
 *
 * A tournament is a host-written trivia set (validated by the quiz engine) that invited members play once, inside a
 * time window, on a server clock. Questions are sent only when an entrant presses Start; answers and the correct
 * options never leave the server until the tournament closes. Ranking is score, then time taken, then who finished
 * first. Entries that are implausibly fast or over time are held out of the ranking (not deleted) until a moderator
 * clears them. Nothing here can be bought: no paid retries, boosts or hints.
 */
export const TOURNAMENT_RULES = {
  secondsPerQuestion: { min: 10, max: 60, default: 20 },
  /** Extra seconds allowed for network and page load on top of the question timer. */
  graceSeconds: 15,
  /** Faster than this per question is not humanly reading and answering; held for review. */
  minMsPerQuestion: 1200,
  maxEntrants: 64,
  maxInvitees: 30,
  minWindowMinutes: 30,
  maxWindowDays: 14,
  /** Tournaments a member can host that have not closed yet. */
  maxOpenHosted: 3,
} as const;

export type TournamentStatus = 'upcoming' | 'open' | 'closed' | 'cancelled';
export type EntryFlag = 'too_fast' | 'over_time';

export function tournamentStatus(t: { opensAt: Date; closesAt: Date; cancelledAt: Date | null }, now = new Date()): TournamentStatus {
  if (t.cancelledAt) return 'cancelled';
  if (now < t.opensAt) return 'upcoming';
  if (now < t.closesAt) return 'open';
  return 'closed';
}

/** Total time an entrant has from pressing Start. */
export function timeLimitMs(questions: number, secondsPerQuestion: number): number {
  return (questions * secondsPerQuestion + TOURNAMENT_RULES.graceSeconds) * 1000;
}

/** Server-side plausibility check on the measured duration (start → submit on the server clock). */
export function judgeEntry(durationMs: number, questions: number, secondsPerQuestion: number): EntryFlag | null {
  if (durationMs < questions * TOURNAMENT_RULES.minMsPerQuestion) return 'too_fast';
  if (durationMs > timeLimitMs(questions, secondsPerQuestion)) return 'over_time';
  return null;
}

export interface RankRow { userId: string; score: number; durationMs: number; finishedAt: Date | string }

/**
 * Standard competition ranking (1, 1, 3): higher score first, then less time; equal score and time share a rank.
 * Finishing earlier only orders rows inside a shared rank — it never breaks the tie.
 */
export function rankEntries<T extends RankRow>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.durationMs - b.durationMs || +new Date(a.finishedAt) - +new Date(b.finishedAt));
  let rank = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.score !== r.score || prev.durationMs !== r.durationMs) rank = i + 1;
    return { ...r, rank };
  });
}

/** Competition ranking by points (seasonal leaderboards). Ties share a rank; order inside a tie is by name. */
export function rankByPoints<T extends { points: number; name: string }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.map((r, i) => {
    if (i === 0 || sorted[i - 1].points !== r.points) rank = i + 1;
    return { ...r, rank };
  });
}
