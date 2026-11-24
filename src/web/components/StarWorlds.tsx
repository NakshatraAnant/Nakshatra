import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card, cx } from './ui/primitives';
import { archetypeAccent } from '../lib/visual';
import { MAX_STARS, layoutStars, project2d, type MapStar } from '../lib/starmap';
import { environmentFor } from '../../shared/circleEnvironments';

/* three.js stays behind this import: a page only pays for it when a scene is shown. */
const StarMap3D = lazy(() => import('../three/starmap').then((m) => ({ default: m.StarMap3D })));

/** The same map as a flat drawing: shown without WebGL and while the 3D scene loads. */
function StarMap2D({ stars, centre, progress, selected }: { stars: MapStar[]; centre: string; progress: number | null; selected: string | null }) {
  const placed = layoutStars(stars);
  const rings = [0, 1, 2].filter((r) => placed.some((p) => p.ring === r));
  const R = [2.3, 3.65, 5];
  const arc = progress === null ? 0 : Math.max(0.04, Math.min(1, progress));
  return (
    <svg viewBox="-5.6 -3.4 11.2 6.8" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {rings.map((r) => <ellipse key={r} rx={R[r]} ry={R[r] * 0.5} fill="none" stroke={centre} strokeOpacity="0.25" strokeWidth="0.02" />)}
      {placed.filter((p) => p.linked).map((p) => { const { x, y } = project2d(p); return <line key={p.id} x1="0" y1="0" x2={x} y2={y} stroke={centre} strokeOpacity="0.3" strokeWidth="0.02" />; })}
      <circle r="0.42" fill={centre} />
      {progress !== null && <circle r="0.7" fill="none" stroke={centre} strokeWidth="0.07" pathLength="1" strokeDasharray={`${arc} 1`} transform="rotate(-90)" />}
      {placed.map((p) => {
        const { x, y } = project2d(p);
        const on = p.id === selected;
        return (
          <g key={p.id}>
            {p.halo && <circle cx={x} cy={y} r={0.24 * p.size} fill="none" stroke={p.halo} strokeWidth="0.04" />}
            <circle cx={x} cy={y} r={0.13 * p.size * (on ? 1.5 : 1)} fill={on ? '#f2ece1' : p.color} fillOpacity={p.bright || on ? 1 : 0.4} />
            {on && <circle cx={x} cy={y} r={0.36 * p.size} fill="none" stroke="#f2ece1" strokeWidth="0.03" />}
          </g>
        );
      })}
    </svg>
  );
}

function Stage({ stars, centre, progress = null, selected, onSelect, label, environment = null }: { stars: MapStar[]; centre: string; progress?: number | null; selected: string | null; onSelect: (id: string) => void; label: string; environment?: string | null }) {
  const env = environment ? environmentFor(environment) : null;
  const still = <StarMap2D stars={stars} centre={centre} progress={progress} selected={selected} />;
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep" data-theme="dark" data-environment={env?.key} style={env ? { background: `linear-gradient(180deg, ${env.sky[0]}, ${env.sky[1]})` } : undefined}>
      <div className="absolute inset-0">
        <Suspense fallback={still}>
          <StarMap3D stars={stars} centre={centre} progress={progress} selected={selected} onSelect={onSelect} label={label} fallback={still} environment={environment} />
        </Suspense>
      </div>
    </div>
  );
}

const chip = (on: boolean, strong: boolean) => cx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', on ? 'border-fg text-fg' : strong ? 'border-line-strong text-fg hover:border-fg-3' : 'border-line text-fg-2 hover:border-line-strong');

/* ---------------- Circle world ---------------- */

export interface CircleWorldMember { userId: string; name: string; role: string; contributed: boolean; you: boolean; archetype: string | null; tier: { name: string; hex: string } | null }

const roleName = (r: string) => (r === 'owner' ? 'Owner' : r === 'moderator' ? 'Admin' : 'Member');

/**
 * A circle as a small world: the circle at the centre, its members as stars. Owner and admins sit on the inner
 * ring; members who have joined in are bright, the rest are dim until they do. A coloured band is the member's
 * tier. The arc around the centre fills as the circle comes to life. Everything shown is already visible to
 * members in the list below.
 */
export function CircleWorld({ name, glow, members, activation, environment }: { name: string; glow: string; members: CircleWorldMember[]; activation: { contributors: number; needed: number }; environment: string }) {
  const env = environmentFor(environment);
  const [selected, setSelected] = useState<string | null>(null);
  const shown = members.slice(0, MAX_STARS);
  const stars = useMemo<MapStar[]>(() => members.map((m) => ({
    id: m.userId, ring: m.role === 'owner' || m.role === 'moderator' ? 0 : m.contributed ? 1 : 2, color: glow,
    size: m.role === 'owner' ? 1.5 : m.role === 'moderator' ? 1.25 : 1, bright: m.contributed, halo: m.tier?.hex ?? null,
  })), [members, glow]);
  const pick = (id: string) => setSelected((s) => (s === id ? null : id));
  const cur = members.find((m) => m.userId === selected);
  const joined = members.filter((m) => m.contributed).length;
  return (
    <Card className="space-y-3" aria-label="Circle world">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><h2 className="font-display text-2xl">Circle world</h2><p className="text-xs text-fg-3">{env.label} · {env.line}</p></div>
        <p className="text-sm text-fg-2 numeric">{joined} of {members.length} have joined in</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Stage stars={stars} centre={glow} environment={env.key} progress={activation.needed ? activation.contributors / activation.needed : null} selected={selected} onSelect={pick}
          label={`${name} in the ${env.label}: ${members.length} member${members.length === 1 ? '' : 's'} as stars around the circle. Use the list beside it to find someone.`} />
        <div className="space-y-2">
          <p className="text-xs text-fg-3">Owner and admins sit closest. Bright stars have joined in; a coloured band is a tier.</p>
          <div role="group" aria-label="Members" className="flex flex-wrap gap-1.5">
            {shown.map((m) => (
              <span key={m.userId}>
                <button type="button" aria-pressed={selected === m.userId} onClick={() => pick(m.userId)} className={chip(selected === m.userId, m.contributed)}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: m.tier?.hex ?? glow, opacity: m.contributed ? 1 : 0.4 }} />
                  {m.name}{m.you ? ' (you)' : ''}
                </button>
              </span>
            ))}
          </div>
          {members.length > shown.length && <p className="text-xs text-fg-3">Showing the first {shown.length} members. Everyone is in the list below.</p>}
          <p className="min-h-10 text-sm text-fg" role="status">
            {cur ? `${cur.name}: ${[roleName(cur.role), cur.tier?.name, cur.archetype, cur.contributed ? 'has joined in' : 'has not joined in yet'].filter(Boolean).join(' · ')}` : 'Pick someone to find their star.'}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Discovery constellation ---------------- */

export interface ConstellationPerson { userId: string; handle: string; displayName: string; archetype: { key: string; name: string } | null; sharedIntents: string[]; sharedLabels: string[] }

/**
 * People who chose to be found, drawn around you. Distance is only what you both said about yourselves: the
 * things you are both open to and the labels you both picked. Nothing here is guessed or inferred, and a star's
 * colour is the person's archetype only when they have made it public.
 */
export function PeopleConstellation({ people, intentLabel }: { people: ConstellationPerson[]; intentLabel: (key: string) => string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const shown = people.slice(0, MAX_STARS);
  const stars = useMemo<MapStar[]>(() => people.map((p) => {
    const n = p.sharedIntents.length + p.sharedLabels.length;
    return { id: p.userId, ring: n >= 2 ? 0 : n === 1 ? 1 : 2, color: p.archetype ? archetypeAccent(p.archetype.key) : '#9a98b8', size: 1, bright: n > 0, linked: n > 0 };
  }), [people]);
  const pick = (id: string) => setSelected((s) => (s === id ? null : id));
  const cur = people.find((p) => p.userId === selected);
  const shared = cur ? [...cur.sharedIntents.map(intentLabel), ...cur.sharedLabels] : [];
  if (!people.length) return null;
  return (
    <Card className="space-y-3" aria-label="People constellation">
      <div>
        <h3 className="font-display text-2xl">Your constellation</h3>
        <p className="text-sm text-fg-2">You are at the centre. Closer stars share more of what you said you’re open to. Nothing here is guessed.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Stage stars={stars} centre="#f3e4c0" selected={selected} onSelect={pick} label={`${people.length} ${people.length === 1 ? 'person' : 'people'} who chose to be found, as stars around you. Use the list beside it to look through them.`} />
        <div className="space-y-2">
          <div role="group" aria-label="People near you" className="flex flex-wrap gap-1.5">
            {shown.map((p) => {
              const n = p.sharedIntents.length + p.sharedLabels.length;
              return (
                <span key={p.userId}>
                  <button type="button" aria-pressed={selected === p.userId} onClick={() => pick(p.userId)} className={chip(selected === p.userId, n > 0)}>
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: p.archetype ? archetypeAccent(p.archetype.key) : '#9a98b8' }} />
                    {p.displayName}
                  </button>
                </span>
              );
            })}
          </div>
          <div className="min-h-14 text-sm text-fg" role="status">
            {cur ? (
              <>
                <p>{cur.displayName}{cur.archetype ? ` · ${cur.archetype.name}` : ''}</p>
                <p className="text-fg-2">{shared.length ? `You both said: ${shared.join(', ')}.` : 'Nothing in common listed yet.'}</p>
              </>
            ) : <p>Pick someone to find their star.</p>}
          </div>
          {cur && <Link to={`/u/${cur.handle}`} className="inline-block text-sm text-accent hover:underline">View {cur.displayName}’s profile →</Link>}
        </div>
      </div>
    </Card>
  );
}
