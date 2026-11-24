import { forwardRef, useMemo } from 'react';
import { PERSONA_BY_KEY, DIMENSIONS } from '../../shared/personality';
import { personaPalette } from '../lib/persona';

/**
 * Archetype sigil: a five-axis star drawn from the archetype's own prototype (the
 * outer, fixed glyph — recognisable at any size) with the person's actual scores as
 * the inner, filled shape. Axes clockwise from the top: social energy, decision
 * style, expression, pace, novelty. Pure SVG with literal colours so it can be
 * rasterised for share cards; works without WebGL.
 */
const AXES = DIMENSIONS.length;
const pt = (i: number, r: number) => {
  const a = -Math.PI / 2 + (i / AXES) * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r] as const;
};
const radius = (v: number) => 34 + ((v + 1) / 2) * 52;

export const PersonaSigil = forwardRef<SVGSVGElement, { archetypeKey: string; scores?: Record<string, number>; style?: string; size?: number | string; animate?: boolean; className?: string }>(
  function PersonaSigil({ archetypeKey, scores, style = 'classic', size = '100%', animate = false, className }, ref) {
    const a = PERSONA_BY_KEY[archetypeKey];
    const pal = personaPalette(archetypeKey, style);
    const gid = useMemo(() => `ps-${archetypeKey}-${Math.random().toString(36).slice(2, 7)}`, [archetypeKey]);
    if (!a) return null;
    const proto = DIMENSIONS.map((d, i) => pt(i, radius(a.prototype[d])));
    const mine = scores ? DIMENSIONS.map((d, i) => pt(i, radius(scores[d] ?? 0))) : null;
    const path = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ' Z';
    // A star polygon (every second vertex) gives each archetype a distinctive crossing pattern.
    const star = [0, 2, 4, 1, 3].map((i) => proto[i]);
    return (
      <svg ref={ref} viewBox="-100 -100 200 200" width={size} height={size} role="img" aria-label={`${a.name} sigil`} className={className} data-animate={animate ? 'true' : undefined} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={gid} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={pal.glow} stopOpacity="0.45" />
            <stop offset="0.7" stopColor={pal.ink} stopOpacity="0.95" />
            <stop offset="1" stopColor={pal.ink} />
          </radialGradient>
        </defs>
        <circle r="98" fill={`url(#${gid})`} />
        {[90, 70, 50].map((r, i) => <circle key={r} r={r} fill="none" stroke={pal.accent} strokeOpacity={0.18 + i * 0.06} strokeWidth={0.5} />)}
        {proto.map(([x, y], i) => <line key={i} x1={0} y1={0} x2={x * 1.08} y2={y * 1.08} stroke={pal.accent} strokeOpacity={0.25} strokeWidth={0.5} />)}
        <path className="sigil-draw" d={path(star)} fill="none" stroke={pal.hue} strokeWidth={1.4} strokeLinejoin="round" style={{ '--i': 0 } as React.CSSProperties} />
        <path className="sigil-draw" d={path(proto)} fill="none" stroke={pal.accent} strokeWidth={0.9} style={{ '--i': 1 } as React.CSSProperties} />
        {mine && <path className="sigil-core" d={path(mine)} fill={pal.hue2} fillOpacity={0.28} stroke={pal.hue2} strokeWidth={1.1} />}
        {proto.map(([x, y], i) => <circle key={`d${i}`} cx={x} cy={y} r={2.2} fill={pal.accent} />)}
        <circle r={4} fill={pal.accent} />
      </svg>
    );
  },
);
