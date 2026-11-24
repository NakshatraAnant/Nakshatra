/**
 * Layout for the tournament arena (three/arena.tsx and its flat fallback) and the season path
 * (three/season.tsx). Pure functions so both drawings agree and so they can be tested without a GPU.
 */

export interface ArenaRun { rank: number; you: boolean; score: number }
export interface PlacedRun extends ArenaRun { x: number; z: number; height: number; podium: boolean }

export const ARENA_MAX = 24;

/**
 * Finished runs as pillars. Places 1–3 stand on the podium in the classic 2-1-3 order; everyone else stands
 * on an arc behind it. Height follows the score as a share of the questions, so a tie looks like a tie.
 * Runs that share a place (same score and time) stand side by side at the same height.
 */
export function arenaLayout(runs: ArenaRun[], questions: number): PlacedRun[] {
  const shown = runs.slice(0, ARENA_MAX);
  const podiumX: Record<number, number> = { 1: 0, 2: -1.7, 3: 1.7 };
  const onPodium = shown.filter((r) => r.rank <= 3);
  const rest = shown.filter((r) => r.rank > 3);
  const placed: PlacedRun[] = [];
  for (const rank of [1, 2, 3]) {
    const same = onPodium.filter((r) => r.rank === rank);
    same.forEach((r, i) => placed.push({ ...r, podium: true, x: podiumX[rank] + (i - (same.length - 1) / 2) * 0.7, z: 0, height: pillar(r.score, questions) }));
  }
  rest.forEach((r, i) => {
    const t = rest.length === 1 ? 0.5 : i / (rest.length - 1);
    const a = Math.PI * (0.15 + 0.7 * t);
    placed.push({ ...r, podium: false, x: -Math.cos(a) * 4.2, z: -Math.sin(a) * 2.4 - 0.6, height: pillar(r.score, questions) });
  });
  // Keep the original order (by rank) for anyone reading the list.
  return placed.sort((a, b) => a.rank - b.rank);
}

const pillar = (score: number, questions: number) => 0.25 + 2.2 * Math.max(0, Math.min(1, questions ? score / questions : 0));

/* ---------------- Season path ---------------- */

export interface SeasonStop { at: number; title: string; reached: boolean; claimed: boolean; claimable: boolean }
export interface PlacedStop extends SeasonStop { x: number; y: number; z: number }

/** Where along the path a points total sits, 0…1 (milestones are spaced evenly, points between them interpolate). */
export function seasonProgress(points: number, stops: { at: number }[]): number {
  if (!stops.length) return 0;
  const n = stops.length;
  if (points >= stops[n - 1].at) return 1;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const at = stops[i].at;
    if (points < at) return (i + (points - prev) / Math.max(1, at - prev)) / n;
    prev = at;
  }
  return 1;
}

/** A path that climbs from left to right with a gentle wave towards and away from you, so the order is always clear. */
export function seasonPoint(t: number): [number, number, number] {
  return [-3.9 + 7.8 * t, -1.3 + 2.5 * t, Math.sin(t * Math.PI * 2) * 0.9];
}

export function seasonLayout(stops: SeasonStop[]): PlacedStop[] {
  const n = stops.length;
  return stops.map((s, i) => { const [x, y, z] = seasonPoint((i + 1) / n); return { ...s, x, y, z }; });
}
