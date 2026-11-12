import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Button, Card } from './ui/primitives';
import { prefersReducedMotion } from '../lib/session';
import { BEAT_SECONDS, filmBeats } from '../lib/yearFilm';

/* three.js stays behind this import: a page only pays for it when the film is shown. */
const YearFilm3D = lazy(() => import('../three/yearFilm').then((m) => ({ default: m.YearFilm3D })));

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** The months as a flat ring of bars: shown without WebGL and while the scene loads. */
function Months2D({ months, focus }: { months: number[]; focus: number | null }) {
  const max = Math.max(1, ...months);
  return (
    <svg viewBox="-5 -3.2 10 6" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <ellipse rx="3.4" ry="1.4" fill="none" stroke="#d9b26f" strokeOpacity="0.3" strokeWidth="0.03" />
      {months.map((n, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2, x = Math.cos(a) * 3.4, y = Math.sin(a) * 1.4 + 0.6, h = 0.06 + (n / max) * 2;
        const on = focus === i;
        return (
          <g key={i}>
            <rect x={x - 0.14} y={y - h} width="0.28" height={h} rx="0.06" fill={on ? '#ffffff' : n ? '#d9b26f' : '#3c4078'} fillOpacity={focus !== null && !on ? 0.4 : 0.9} />
            <text x={x} y={y + 0.35} textAnchor="middle" fontSize="0.26" fill="#cfc8bb">{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Year in Review as a short film. It only plays when asked, has no sound, and every beat is on screen as text
 * (and announced) — so it works the same without 3D. Previous/next work at any time; with reduced motion it
 * never advances by itself.
 */
export function YearFilm({ review }: { review: { year: number; soFar: boolean; months: number[]; highlights: string[] } }) {
  const beats = useMemo(() => filmBeats(review), [review]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const still = prefersReducedMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const last = i === beats.length - 1;
  useEffect(() => {
    if (!open || !playing || still || last) return;
    const t = window.setTimeout(() => setI((n) => n + 1), BEAT_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [open, playing, still, last, i]);
  useEffect(() => { if (last) setPlaying(false); }, [last]);
  // Escape closes the film like any other overlay-ish panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const beat = beats[i];
  const start = () => { setI(0); setOpen(true); setPlaying(!still); };
  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3" aria-label="Year film">
        <div>
          <p className="font-display text-2xl">Watch your {review.year}</p>
          <p className="text-sm text-fg-2">A short film of your year in {beats.length} moments. No sound.</p>
        </div>
        <Button onClick={start}>Play</Button>
      </Card>
    );
  }
  const still2d = <Months2D months={review.months} focus={beat.month} />;
  return (
    <section aria-label="Year film" className="space-y-2">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-xl)] border border-line bg-canvas-deep sm:aspect-[16/8]" data-theme="dark" data-film-beat={i}>
        <div className="absolute inset-0">
          <Suspense fallback={still2d}>
            <YearFilm3D months={review.months} focus={beat.month} label={`Your ${review.year} as twelve columns of light, one for each month.`} fallback={still2d} />
          </Suspense>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12 sm:p-6 sm:pt-16">
          <div key={beat.key} className="m-enter" aria-live="polite" role="status">
            <p className="font-display text-2xl leading-tight text-[#f2ece1] sm:text-3xl">{beat.title}</p>
            {beat.body && <p className="mt-1 text-sm text-[#cfc8bb]">{beat.body}</p>}
          </div>
        </div>
        <ol className="pointer-events-none absolute inset-x-4 top-3 flex gap-1" aria-hidden="true">
          {beats.map((b, k) => <li key={b.key} className="h-0.5 flex-1 rounded-full" style={{ background: k <= i ? '#f2ece1' : 'rgba(242,236,225,0.25)' }} />)}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => setI((n) => Math.max(0, n - 1))} aria-label="Previous moment">←</Button>
        {!still && !last && <Button size="sm" variant="ghost" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>}
        <Button size="sm" variant="ghost" disabled={last} onClick={() => setI((n) => Math.min(beats.length - 1, n + 1))} aria-label="Next moment">→</Button>
        <span className="text-xs text-fg-3 numeric">{i + 1} of {beats.length}</span>
        <span className="ml-auto flex gap-2">
          {last && <Button size="sm" variant="secondary" onClick={start}>Watch again</Button>}
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </span>
      </div>
    </section>
  );
}
