import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Button, cx } from './ui/primitives';
import { DIMENSIONS, DIMENSION_INFO, type Dimension } from '../../shared/personality';

/** One colour per dimension, used wherever the five are drawn together. */
export const DIMENSION_COLOR: Record<Dimension, string> = { energy: '#e9a23b', compass: '#c98a96', voice: '#8d7bd8', tempo: '#7fb69a', horizon: '#6fa8dc' };
const BLURB: Record<Dimension, string> = {
  energy: 'Where you get your energy: quiet corners or full rooms.',
  compass: 'What you trust first when you decide: reasons or feelings.',
  voice: 'How readily you say what you think.',
  tempo: 'Whether a plan frees you or boxes you in.',
  horizon: 'How strongly the new and unfamiliar pulls at you.',
};

/**
 * Identity introduction: the five dimensions the assessment measures, around one light. These are the product's
 * own five (shared/personality.ts) — names and poles are read from there, nothing is invented here. Picking a
 * dimension explains it; the main button takes you to the statements.
 */
export function IdentityIntro({ onStart }: { onStart: () => void }) {
  const [sel, setSel] = useState<Dimension | null>(null);
  const R = 78;
  const pts = DIMENSIONS.map((d, i) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return { d, x: Math.cos(a) * R, y: Math.sin(a) * R }; });
  const info = sel ? DIMENSION_INFO[sel] : null;
  return (
    <section aria-label="The five dimensions" className="space-y-4">
      <p className="eyebrow">Archetype · no account needed</p>
      <h1 className="font-display text-5xl leading-[1.04]">What kind of person are you?</h1>
      <p className="leading-relaxed text-fg-2">Twenty quick statements place you on five dimensions and match you to one of 24 archetypes. Tap a dimension to see what it measures.</p>
      <div className="relative mx-auto aspect-square w-full max-w-[300px]">
        <svg viewBox="-110 -110 220 220" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--line-strong)" strokeWidth="0.8" />
          {pts.map((p) => <line key={p.d} x1="0" y1="0" x2={p.x} y2={p.y} stroke={DIMENSION_COLOR[p.d]} strokeWidth={sel === p.d ? 2 : 0.9} strokeOpacity={sel && sel !== p.d ? 0.25 : 0.8} />)}
          <circle r="13" fill="var(--text)" className="m-pulse" />
          <circle r="22" fill="none" stroke="var(--text)" strokeOpacity="0.25" />
        </svg>
        {pts.map((p, i) => (
          <button key={p.d} type="button" aria-pressed={sel === p.d} onClick={() => setSel(sel === p.d ? null : p.d)}
            className={cx('absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-canvas text-center text-[10px] font-semibold leading-tight text-fg transition-transform', sel === p.d ? 'scale-110' : 'm-float')}
            style={{ left: `${50 + (p.x / 220) * 100}%`, top: `${50 + (p.y / 220) * 100}%`, borderColor: DIMENSION_COLOR[p.d], animationDelay: `${i * 0.5}s` }}>
            {DIMENSION_INFO[p.d].name}
          </button>
        ))}
      </div>
      <div className="min-h-20 text-sm" role="status">
        {sel && info ? (
          <>
            <p className="font-semibold text-fg">{info.name}: {info.low} ↔ {info.high}</p>
            <p className="text-fg-2">{BLURB[sel]}</p>
          </>
        ) : <p className="text-fg-2">Social energy, decision style, expression, pace and novelty. Each is a lean, not a label — and every result explains exactly why.</p>}
      </div>
      <Button size="lg" onClick={onStart}>Discover My Identity</Button>
      <ul className="space-y-1 text-sm text-fg-2">
        <li>✦ Nothing is stored unless you choose to save it.</li>
        <li>✦ Tendencies, not labels for life. Retake whenever you like.</li>
      </ul>
    </section>
  );
}

/* ---------------- Identity Studio navigation ---------------- */

const STUDIOS = [
  { to: '/identity', label: 'Identity', hint: 'Archetype, dimensions, evolution' },
  { to: '/avatar', label: 'Avatar', hint: 'Your drawn picture' },
  { to: '/theme', label: 'Universe', hint: 'Colours, graphics, sound' },
  { to: '/settings/profile', label: 'Profile', hint: 'Name, bio, visibility' },
];

/** The four rooms of the Identity Studio, shown at the top of each so they read as one place. */
export function StudioNav() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Identity Studio" className="mb-6 flex gap-1.5 overflow-x-auto scrollbar-thin">
      {STUDIOS.map((s) => {
        const on = pathname === s.to || (s.to === '/settings/profile' && pathname === '/settings');
        return (
          <Link key={s.to} to={s.to} aria-current={on ? 'page' : undefined} title={s.hint}
            className={cx('flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2 hover:border-line-strong')}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
