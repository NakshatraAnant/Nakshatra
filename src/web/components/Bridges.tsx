import { Suspense, lazy, useMemo, useState } from 'react';
import { Button, Card, cx } from './ui/primitives';
import { bridgeLayout, bridgeWord, type Bridge } from '../lib/bridges';
import { hubAngles, type HubGame } from '../lib/hub';

/* three.js stays behind these imports: a page only pays for it when a scene is shown. */
const CompatibilityBridges3D = lazy(() => import('../three/bridges').then((m) => ({ default: m.CompatibilityBridges3D })));
const GameHub3D = lazy(() => import('../three/hub').then((m) => ({ default: m.GameHub3D })));

const stage = 'relative w-full overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep';

/* ---------------- Compatibility visualiser ---------------- */

interface DimView extends Bridge { factors: { text: string; weight: number }[] }

function Bridges2D({ bridges, selected }: { bridges: Bridge[]; selected: string | null }) {
  const placed = bridgeLayout(bridges);
  return (
    <svg viewBox="-4.2 -3 8.4 4" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {placed.map((b) => {
        const on = b.key === selected;
        const cy = 0.4 - b.control[1] * 1.1, cx = b.control[2] * 0.4;
        return <path key={b.key} d={`M -2.6 0.4 Q ${cx} ${cy} 2.6 0.4`} fill="none" stroke={on ? '#ffffff' : '#f3e4c0'} strokeOpacity={selected && !on ? 0.12 : on ? 1 : 0.2 + 0.7 * b.strength} strokeWidth={b.width * 1.6} strokeLinecap="round" />;
      })}
      <circle cx="-3.2" cy="0.4" r="0.5" fill="#f3e4c0" />
      <circle cx="3.2" cy="0.4" r="0.5" fill="#b9adf0" />
    </svg>
  );
}

/**
 * You, them, and one bridge per compatibility dimension. Each bridge shows only its own dimension's score —
 * on purpose there is no combined number. The list drives the scene and works without it.
 */
export function CompatibilityBridges({ partner, dims }: { partner: string; dims: DimView[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const bridges = useMemo(() => dims.map(({ key, label, score }) => ({ key, label, score })), [dims]);
  const pick = (k: string) => setSelected((s) => (s === k ? null : k));
  const cur = dims.find((d) => d.key === selected);
  const top = cur ? [...cur.factors].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 2) : [];
  const still = <Bridges2D bridges={bridges} selected={selected} />;
  if (!dims.length) return null;
  return (
    <Card className="space-y-3" aria-label="Compatibility bridges">
      <div>
        <h2 className="font-display text-2xl">Bridges between you</h2>
        <p className="text-sm text-fg-2">One bridge for each dimension, never added up. A thicker, brighter bridge is an easier connection there.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-1">
          <div className={cx(stage, 'aspect-[16/10]')} data-theme="dark">
            <div className="absolute inset-0">
              <Suspense fallback={still}>
                <CompatibilityBridges3D bridges={bridges} selected={selected} onSelect={pick} label={`You and ${partner}, joined by ${dims.length} bridges, one for each compatibility dimension. Use the list beside it to look at each one.`} fallback={still} />
              </Suspense>
            </div>
          </div>
          <p className="flex justify-between text-xs text-fg-3" aria-hidden="true"><span>You</span><span>{partner}</span></p>
        </div>
        <div className="space-y-2">
          <div role="group" aria-label="Dimensions" className="flex flex-wrap gap-1.5">
            {dims.map((d) => (
              <button key={d.key} type="button" aria-pressed={selected === d.key} onClick={() => pick(d.key)}
                className={cx('rounded-full border px-2.5 py-1 text-xs', selected === d.key ? 'border-fg text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
                {d.label} <span className="numeric text-fg-3">{d.score}</span>
              </button>
            ))}
          </div>
          <div className="min-h-16 text-sm text-fg" role="status">
            {cur ? (
              <>
                <p>{cur.label}: {bridgeWord(cur.score)} ({cur.score} of 100).</p>
                {top.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-fg-2">{top.map((f) => <li key={f.text}>{f.weight > 0 ? '+' : f.weight < 0 ? '−' : '·'} {f.text}</li>)}</ul>}
              </>
            ) : <p>Pick a dimension to see its bridge.</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Game hub ---------------- */

function Hub2D({ games, selected }: { games: HubGame[]; selected: string | null }) {
  const angles = hubAngles(games);
  return (
    <svg viewBox="-5.4 -3 10.8 6" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <ellipse rx="4.2" ry="2.1" fill="none" stroke="#d9b26f" strokeOpacity="0.3" strokeWidth="0.02" />
      {games.map((g, i) => {
        const x = Math.cos(angles[i]) * 4.2, y = Math.sin(angles[i]) * 2.1, on = g.key === selected;
        return (
          <g key={g.key}>
            <circle cx={x} cy={y} r={on ? 0.5 : 0.36} fill={g.color} />
            {on && <circle cx={x} cy={y} r="0.72" fill="none" stroke="#f2ece1" strokeWidth="0.05" />}
            {g.live > 0 && <circle cx={x + 0.5} cy={y - 0.35} r="0.1" fill="#f2ece1" />}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The game library as a small solar system. Step through it (or tap a planet) and open a game's rules — the
 * same rules dialog as the cards below. Moons are your games in progress.
 */
export function GameHub({ games, categories, onOpen }: { games: HubGame[]; categories: Record<string, { label: string; color: string }>; onOpen: (key: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const idx = games.findIndex((g) => g.key === selected);
  const step = (d: number) => setSelected(games[((idx < 0 ? (d > 0 ? -1 : 0) : idx) + d + games.length) % games.length].key);
  const cur = games[idx];
  const live = games.reduce((n, g) => n + g.live, 0);
  const used = [...new Set(games.map((g) => g.category))];
  const still = <Hub2D games={games} selected={selected} />;
  if (!games.length) return null;
  return (
    <Card className="space-y-3" aria-label="Game hub">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Game hub</h2>
        <p className="text-sm text-fg-2">{live ? `${live} game${live === 1 ? '' : 's'} in progress` : `${games.length} games`}</p>
      </div>
      <div className={cx(stage, 'aspect-[16/9] sm:aspect-[21/9]')} data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <GameHub3D games={games} selected={selected} onSelect={(k) => setSelected(k)} label={`${games.length} games as planets, grouped by kind. Use the buttons below to step through them.`} fallback={still} />
          </Suspense>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3" aria-label="Kinds of game">
        {used.map((c) => <li key={c} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: categories[c]?.color }} />{categories[c]?.label ?? c}</li>)}
        {live > 0 && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-fg" />Moon = a game you’re in</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous game">←</Button>
        <p className="min-w-0 flex-1 text-sm text-fg" role="status">
          {cur ? `${cur.name} · ${categories[cur.category]?.label ?? cur.category}${cur.live ? ` · ${cur.live} in progress` : ''}` : 'Step through the games, or tap a planet.'}
        </p>
        <Button size="sm" variant="ghost" onClick={() => step(1)} aria-label="Next game">→</Button>
        <Button size="sm" disabled={!cur} onClick={() => cur && onOpen(cur.key)}>Rules &amp; play</Button>
      </div>
    </Card>
  );
}
