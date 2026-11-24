import { useMemo } from 'react';
import { SKY, assessmentGlow, journalConstellation, moonLight, skyTime, starField } from '../lib/atmosphere';
import { DIMENSIONS, QUESTIONS, type Dimension } from '../../shared/personality';
import { DIMENSION_COLOR } from './IdentityIntro';

/**
 * Journal atmosphere: a sky for the time of day where you are, and this month's journal days joined as a
 * constellation. Decorative, so it is hidden from screen readers except for the one line of words under it.
 * Stars twinkle only when motion is allowed (styles/app.css .atmo-star).
 */
export function JournalSky({ month, days }: { month: string; days: { date: string; journal: number }[] }) {
  const time = skyTime(new Date().getHours());
  const sky = SKY[time];
  const stars = useMemo(() => starField(month, Math.round(40 * sky.stars)), [month, sky.stars]);
  const constellation = useMemo(() => journalConstellation(days), [days]);
  const n = constellation.length;
  return (
    <figure className="space-y-1" aria-label="Journal sky">
      <div className="relative h-28 overflow-hidden rounded-[var(--radius-lg)] border border-line" style={{ background: `linear-gradient(180deg, ${sky.top}, ${sky.bottom})` }} data-sky={time}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {stars.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r * 0.6} fill="#f2ece1" className="atmo-star" style={{ animationDelay: `${(i % 7) * 0.6}s` }} opacity="0.7" />)}
          {constellation.slice(1).map((s, i) => <line key={s.date} x1={constellation[i].x} y1={constellation[i].y} x2={s.x} y2={s.y} stroke="#f3e4c0" strokeOpacity="0.55" strokeWidth="0.35" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {/* Stars drawn as HTML dots so they stay round in a stretched sky. */}
        {constellation.map((s) => <span key={s.date} aria-hidden="true" className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#f3e4c0] shadow-[0_0_8px_#f3e4c0]" style={{ left: `${s.x}%`, top: `${s.y}%` }} />)}
      </div>
      <figcaption className="text-xs text-fg-3">{sky.words} where you are. {n ? `This month’s ${n} journal day${n === 1 ? '' : 's'}, joined as a constellation.` : 'Each day you write adds a star to this month’s sky.'}</figcaption>
    </figure>
  );
}

/** Calendar atmosphere: the chosen day's real Moon over a night sky, with its tithi and nakshatra in words. */
export function MoonSky({ date, label, phaseAngle, tithi, paksha, nakshatra }: { date: string; label: string; phaseAngle: number; tithi: string; paksha: string; nakshatra: string }) {
  const stars = useMemo(() => starField(date.slice(0, 7), 34), [date]);
  const size = 64, r = size / 2 - 2;
  const k = Math.cos((phaseAngle * Math.PI) / 180), waxing = phaseAngle < 180;
  const d = `M ${size / 2} 2 A ${r} ${r} 0 0 ${waxing ? 1 : 0} ${size / 2} ${size - 2} A ${Math.abs(k) * r} ${r} 0 0 ${(k > 0) === waxing ? 0 : 1} ${size / 2} 2`;
  // The Moon sits higher the more of it is lit, so the month reads as a rise and fall.
  const lit = (1 - k) / 2;
  return (
    <figure className="mb-4 space-y-1" aria-label="Moon sky">
      <div className="relative flex h-24 items-center overflow-hidden rounded-[var(--radius-md)] border border-line bg-[linear-gradient(180deg,#07081a,#1d1f45)] px-4" data-theme="dark">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {stars.map(([x, y, rr], i) => <circle key={i} cx={x} cy={y} r={rr * 0.55} fill="#f2ece1" opacity="0.6" className="atmo-star" style={{ animationDelay: `${(i % 5) * 0.8}s` }} />)}
        </svg>
        <svg key={date} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="relative m-reveal shrink-0" style={{ transform: `translateY(${(0.5 - lit) * 14}px)` }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="#2a2d5c" />
          <path d={d} fill="#f3eee2" />
        </svg>
        <div className="relative ml-4 min-w-0 text-[#f2ece1]">
          <p className="font-display text-xl leading-tight">{tithi} · {paksha.charAt(0).toUpperCase() + paksha.slice(1)}</p>
          <p className="text-xs text-[#cfc8bb]">{label} · Moon in {nakshatra}</p>
        </div>
      </div>
      <figcaption className="text-xs text-fg-3">{moonLight(phaseAngle)}.</figcaption>
    </figure>
  );
}

/**
 * Assessment atmosphere: five soft lights behind the statements, one per dimension, that fill in as that
 * dimension's statements are answered and drift slightly with the direction of the answers. CSS only (no 3D on
 * this focused screen); it eases gently when motion is allowed and simply updates when it is not.
 */
export function AssessmentAtmosphere({ answers }: { answers: Record<string, number> }) {
  const glow = useMemo(() => assessmentGlow(QUESTIONS, DIMENSIONS, answers), [answers]);
  const answered = Object.keys(answers).length;
  return (
    <div className="pointer-events-none absolute -inset-6 -z-10 overflow-hidden" aria-hidden="true" data-testid="assessment-atmosphere" data-progress={answered}>
      {glow.map((g, i) => (
        <span key={g.dimension} className="atmo-glow absolute h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full" data-dimension={g.dimension} data-glow={g.glow.toFixed(2)}
          style={{ left: `${12 + i * 19 + g.lean * 6}%`, top: `${i % 2 ? 72 : 24}%`, opacity: 0.08 + g.glow * 0.34, background: `radial-gradient(circle, ${DIMENSION_COLOR[g.dimension as Dimension]} 0, transparent 68%)` }} />
      ))}
    </div>
  );
}
