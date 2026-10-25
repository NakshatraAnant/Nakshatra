import { forwardRef, useMemo } from 'react';
import { NAKSHATRAS, SIGNS } from '../../astro/constants';
import type { CosmicIdentity } from '../lib/cosmic';

/**
 * The Nakshatra sigil: the signature artwork of a Cosmic ID, drawn only from
 * calculated facts. The outer ring is the 27 nakshatras (the Janma Nakshatra is
 * lit), the inner ring the 12 sidereal signs (the Rashi is shaded), and the core
 * motif encodes the archetype's element (shape) and modality (structure).
 * Signs are numbered 1–12 and planets abbreviated (Su, Mo…) as in North Indian
 * charts, which also renders reliably without symbol fonts.
 * In `precise` mode planets sit at their real sidereal longitudes with the Lagna
 * on the left, as in a chart; share cards use precise={false} so a published card
 * cannot be used to reconstruct the birth moment.
 * Colours are literal palette values (not CSS variables) so the SVG can be
 * rasterised into a share image.
 */
export interface SigilProps {
  identity: Pick<CosmicIdentity, 'archetype' | 'sigil'>;
  precise?: boolean;
  animate?: boolean;
  size?: number | string;
  className?: string;
  title?: string;
}

const TAU = Math.PI * 2;

function polar(r: number, deg: number, ref: number) {
  // Zodiac runs anticlockwise from the reference longitude placed at 9 o'clock.
  const a = Math.PI + ((deg - ref) * Math.PI) / 180;
  return [r * Math.cos(a), -r * Math.sin(a)] as const;
}

function arc(r: number, from: number, to: number, ref: number) {
  const [x1, y1] = polar(r, from, ref);
  const [x2, y2] = polar(r, to, ref);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function sector(r1: number, r2: number, from: number, to: number, ref: number) {
  const [a, b] = polar(r2, from, ref);
  const [c, d] = polar(r2, to, ref);
  const [e, f] = polar(r1, to, ref);
  const [g, h] = polar(r1, from, ref);
  return `M ${a.toFixed(2)} ${b.toFixed(2)} A ${r2} ${r2} 0 0 0 ${c.toFixed(2)} ${d.toFixed(2)} L ${e.toFixed(2)} ${f.toFixed(2)} A ${r1} ${r1} 0 0 1 ${g.toFixed(2)} ${h.toFixed(2)} Z`;
}

function regular(n: number, r: number, rot: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * TAU;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** Planets within 8° of each other step inward onto separate lanes so their labels never overlap. */
function lanes<T extends { longitude: number }>(bodies: T[]): { b: T; lane: number }[] {
  const sorted = [...bodies].sort((a, b) => a.longitude - b.longitude);
  const out: { b: T; lane: number }[] = [];
  sorted.forEach((b, i) => {
    const prev = out[i - 1];
    const lane = prev && b.longitude - prev.b.longitude < 8 ? (prev.lane + 1) % 3 : 0;
    out.push({ b, lane });
  });
  return out;
}

/** Core motif: element sets the shape family, modality how it is structured. */
function Motif({ element, modality, glow, accent }: { element: string; modality: string; glow: string; accent: string }) {
  const layers = modality === 'fixed' ? [40, 33, 26] : modality === 'cardinal' ? [40, 28] : [40, 31, 22, 13];
  const twist = modality === 'mutable' ? 0.32 : 0;
  const stroke = { fill: 'none', stroke: glow, strokeWidth: 0.9, strokeLinejoin: 'round' as const };
  const shapes = layers.map((r, i) => {
    const rot = -Math.PI / 2 + i * twist;
    const key = `${element}-${i}`;
    const style = { ...stroke, opacity: 1 - i * 0.18, '--i': i } as React.CSSProperties;
    if (element === 'fire') return <polygon key={key} className="sigil-draw" points={regular(3, r, rot)} style={style} />;
    if (element === 'earth') return <polygon key={key} className="sigil-draw" points={regular(4, r, rot + Math.PI / 4)} style={style} />;
    if (element === 'air') return <circle key={key} className="sigil-draw" r={r * 0.92} style={style} />;
    const waves = 9 + i * 3;
    const d = Array.from({ length: 121 }, (_, k) => {
      const t = (k / 120) * TAU;
      const rr = r * 0.9 + Math.sin(t * waves + i) * 2.2;
      return `${k ? 'L' : 'M'} ${(rr * Math.cos(t)).toFixed(2)} ${(rr * Math.sin(t)).toFixed(2)}`;
    }).join(' ');
    return <path key={key} className="sigil-draw" d={`${d} Z`} style={style} />;
  });
  return (
    <g>
      {modality === 'cardinal' && [0, 1, 2, 3].map((k) => {
        const a = (k / 4) * TAU;
        return <line key={k} className="sigil-draw" x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * 50} y2={Math.sin(a) * 50} stroke={accent} strokeWidth={0.6} opacity={0.7} style={{ '--i': 4 } as React.CSSProperties} />;
      })}
      {modality === 'mutable' && (
        <path className="sigil-draw" fill="none" stroke={accent} strokeWidth={0.6} opacity={0.75} style={{ '--i': 4 } as React.CSSProperties}
          d={Array.from({ length: 160 }, (_, k) => { const t = (k / 159) * TAU * 2.25; const r = 4 + t * 3.1; return `${k ? 'L' : 'M'} ${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`; }).join(' ')} />
      )}
      {shapes}
      <circle r={modality === 'fixed' ? 5 : 3.5} fill={accent} className="sigil-core" />
    </g>
  );
}

export const CosmicSigil = forwardRef<SVGSVGElement, SigilProps>(function CosmicSigil({ identity, precise = true, animate = false, size = '100%', className, title }, ref) {
  const { archetype, sigil } = identity;
  const { ink, glow, accent } = archetype.palette;
  const ref0 = sigil.ascendant && precise ? sigil.ascendant.longitude : 0;
  const nak = NAKSHATRAS[sigil.moonNakshatra];
  const label = title ?? `${archetype.name} sigil: Janma Nakshatra ${nak.name}, Moon in ${SIGNS[sigil.moonSign].vedic}${precise && sigil.ascendant ? `, Lagna ${SIGNS[sigil.ascendant.sign].vedic}` : ''}.`;
  const gradId = useMemo(() => `sg-${archetype.key}-${Math.random().toString(36).slice(2, 8)}`, [archetype.key]);
  const span = 360 / 27;
  return (
    <svg ref={ref} viewBox="-100 -100 200 200" width={size} height={size} role="img" aria-label={label} className={className} data-animate={animate ? 'true' : undefined} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={gradId} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={glow} stopOpacity="0.32" />
          <stop offset="0.55" stopColor={ink} stopOpacity="0.9" />
          <stop offset="1" stopColor={ink} stopOpacity="1" />
        </radialGradient>
      </defs>
      <rect x="-100" y="-100" width="200" height="200" fill={`url(#${gradId})`} />
      {/* Rashi sector */}
      <path d={sector(66, 82, sigil.moonSign * 30, sigil.moonSign * 30 + 30, ref0)} fill={glow} opacity={0.16} />
      {/* 12 sign boundaries */}
      <circle r={82} fill="none" stroke={accent} strokeOpacity={0.35} strokeWidth={0.4} />
      <circle r={66} fill="none" stroke={accent} strokeOpacity={0.2} strokeWidth={0.4} />
      {SIGNS.map((s) => {
        const [x1, y1] = polar(66, s.index * 30, ref0);
        const [x2, y2] = polar(82, s.index * 30, ref0);
        const [tx, ty] = polar(74, s.index * 30 + 15, ref0);
        return (
          <g key={s.index}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeOpacity={0.3} strokeWidth={0.4} />
            <text x={tx} y={ty} fontSize={5.5} textAnchor="middle" dominantBaseline="central" fill={s.index === sigil.moonSign ? accent : glow} opacity={s.index === sigil.moonSign ? 1 : 0.55} fontFamily="'Hanken Grotesk', system-ui, sans-serif">{s.index + 1}</text>
          </g>
        );
      })}
      {/* 27 nakshatras */}
      {NAKSHATRAS.map((n, i) => (
        <path key={n.name} className="sigil-tick" d={arc(91, i * span + 0.8, (i + 1) * span - 0.8, ref0)} fill="none"
          stroke={i === sigil.moonNakshatra ? accent : glow} strokeWidth={i === sigil.moonNakshatra ? 4 : 1.2} strokeLinecap="round"
          opacity={i === sigil.moonNakshatra ? 1 : 0.35} style={{ '--i': i } as React.CSSProperties} />
      ))}
      <Motif element={archetype.element} modality={archetype.modality} glow={glow} accent={accent} />
      {precise && sigil.ascendant && (() => {
        const [x1, y1] = polar(56, sigil.ascendant.longitude, ref0);
        const [x2, y2] = polar(97, sigil.ascendant.longitude, ref0);
        return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth={0.8} strokeDasharray="2 1.5" />;
      })()}
      {precise && lanes(sigil.bodies).map(({ b, lane }, i) => {
        const [x, y] = polar(60 - lane * 8, b.longitude, ref0);
        return (
          <g key={b.id} className="sigil-body" style={{ '--i': i } as React.CSSProperties}>
            <circle cx={x} cy={y} r={1.4} fill={accent} />
            <text x={x * 0.86} y={y * 0.86} fontSize={4.2} textAnchor="middle" dominantBaseline="central" fill={glow} opacity={0.9} fontFamily="'Hanken Grotesk', system-ui, sans-serif">{b.abbr}</text>
          </g>
        );
      })}
    </svg>
  );
});
