import { Suspense, lazy, useMemo } from 'react';
import { hashSeed } from '../../shared/hash';
import { arenaLayout, seasonLayout, seasonPoint, seasonProgress, type ArenaRun, type SeasonStop } from '../lib/arena';

/* three.js stays behind these imports: a page only pays for it when a scene is shown. */
const TournamentArena3D = lazy(() => import('../three/arena').then((m) => ({ default: m.TournamentArena3D })));
const SeasonPath3D = lazy(() => import('../three/arena').then((m) => ({ default: m.SeasonPath3D })));

const stage = 'relative w-full overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep';
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/* ---------------- Tournament arena ---------------- */

function Arena2D({ runs, questions }: { runs: ArenaRun[]; questions: number }) {
  const placed = arenaLayout(runs, questions);
  return (
    <svg viewBox="-5 -3.4 10 4.4" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {placed.map((p, i) => {
        const x = p.x, base = 0.6 - p.z * 0.25, h = p.height * 1.1;
        const fill = p.you ? '#f3e4c0' : p.rank === 1 ? '#d9b26f' : p.rank === 2 ? '#c9c5d8' : p.rank === 3 ? '#c27c54' : '#6c6a8f';
        return <rect key={i} x={x - 0.28} y={base - h} width="0.56" height={h} rx="0.08" fill={fill} fillOpacity={p.you ? 1 : 0.75} />;
      })}
    </svg>
  );
}

/**
 * Finished runs as pillars: places 1–3 on the podium, everyone else behind. It draws only what the Standings
 * list beside it already shows (held runs are not in it), so it adds nothing a player could not already see.
 */
export function TournamentArena({ standings, questions, closed }: { standings: { rank: number; you: boolean; score: number }[]; questions: number; closed: boolean }) {
  const runs = useMemo(() => standings.map((s) => ({ rank: s.rank, you: s.you, score: s.score })), [standings]);
  if (!runs.length) return null;
  const me = runs.find((r) => r.you);
  const top = runs.filter((r) => r.rank === 1);
  const summary = `${runs.length} finished run${runs.length === 1 ? '' : 's'}. ${top.length > 1 ? `${top.length} share first place` : `First place scored ${top[0].score} of ${questions}`}.${me ? ` You are ${ordinal(me.rank)}.` : ''}`;
  const still = <Arena2D runs={runs} questions={questions} />;
  return (
    <section aria-label="Tournament arena" className="space-y-1.5">
      <div className={`${stage} aspect-[16/8]`} data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <TournamentArena3D runs={runs} questions={questions} label={`${closed ? 'Final podium' : 'The arena so far'}: ${summary}`} fallback={still} />
          </Suspense>
        </div>
        <p className="pointer-events-none absolute left-3 top-3 text-xs uppercase tracking-[0.16em] text-fg-2">{closed ? 'Final podium' : 'The arena so far'}</p>
      </div>
      <p className="text-sm text-fg-2">{summary}{me ? ' Your pillar is the bright one.' : ''}</p>
    </section>
  );
}

/* ---------------- Season path ---------------- */

/** A season's own colour, from its key — the same for everyone. */
export const seasonColor = (key: string) => `hsl(${hashSeed(key) % 360}, 62%, 66%)`;

function Season2D({ stops, points, color }: { stops: SeasonStop[]; points: number; color: string }) {
  const placed = seasonLayout(stops);
  const at = seasonPoint(seasonProgress(points, stops));
  const xy = (p: [number, number, number]) => [p[0], -p[1] - p[2] * 0.3] as const;
  const path = Array.from({ length: 41 }, (_, i) => xy(seasonPoint(i / 40)));
  const [cx, cy] = xy(at);
  return (
    <svg viewBox="-4.6 -2.8 9.2 5" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <polyline points={path.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="0.03" strokeDasharray="0.1 0.1" />
      {placed.map((p) => {
        const [x, y] = xy([p.x, p.y, p.z]);
        return (
          <g key={p.at}>
            <circle cx={x} cy={y} r="0.3" fill={p.claimed || p.reached ? color : '#3c4078'} />
            {p.claimable && <circle cx={x} cy={y} r="0.46" fill="none" stroke="#f2ece1" strokeWidth="0.04" />}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="0.14" fill="#ffffff" />
    </svg>
  );
}

/**
 * The season as a rising path of milestone worlds, with a comet at your season points. The milestone list
 * under it holds the same information (and the Claim buttons).
 */
export function SeasonPath({ seasonKey, name, points, milestones }: { seasonKey: string; name: string; points: number; milestones: SeasonStop[] }) {
  const stops = useMemo(() => milestones.map((m) => ({ at: m.at, title: m.title, reached: m.reached, claimed: m.claimed, claimable: m.claimable })), [milestones]);
  if (!stops.length) return null;
  const color = seasonColor(seasonKey);
  const next = stops.find((s) => points < s.at);
  const waiting = stops.filter((s) => s.claimable).length;
  const summary = `${next ? `${next.at - points} points to ${next.title}.` : 'Every milestone reached.'}${waiting ? ` ${waiting} reward${waiting === 1 ? ' is' : 's are'} waiting to be claimed.` : ''}`;
  const still = <Season2D stops={stops} points={points} color={color} />;
  return (
    <section aria-label="Season path" className="space-y-1.5">
      <div className={`${stage} aspect-[16/7]`} data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <SeasonPath3D stops={stops} points={points} color={color} label={`${name} as a path of ${stops.length} milestones. You have ${points} season points. ${summary}`} fallback={still} />
          </Suspense>
        </div>
      </div>
      <p className="text-sm text-fg-2">{summary}</p>
    </section>
  );
}
