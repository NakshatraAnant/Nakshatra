import type { ChartResult, Placement } from '../../astro/types';
import { PLANETS, SIGNS } from '../../astro/constants';
import type { PlanetId } from '../../astro/constants';
import { cx } from '../components/ui/primitives';

const abbr = (id: string) => PLANETS[id as PlanetId]?.abbr ?? id;

/* ---------------- North Indian (diamond) chart ---------------- */

/** House polygons for the North Indian layout on a 300×300 box; house 1 is the top centre diamond. */
const NI_HOUSES: { pts: string; label: [number, number]; sign: [number, number] }[] = [
  { pts: '150,0 75,75 150,150 225,75', label: [150, 70], sign: [150, 132] },
  { pts: '0,0 150,0 75,75', label: [75, 28], sign: [72, 58] },
  { pts: '0,0 75,75 0,150', label: [26, 78], sign: [56, 76] },
  { pts: '0,150 75,75 150,150 75,225', label: [75, 150], sign: [128, 150] },
  { pts: '0,150 75,225 0,300', label: [26, 224], sign: [56, 226] },
  { pts: '0,300 75,225 150,300', label: [75, 274], sign: [72, 244] },
  { pts: '150,300 75,225 150,150 225,225', label: [150, 232], sign: [150, 170] },
  { pts: '150,300 225,225 300,300', label: [225, 274], sign: [228, 244] },
  { pts: '300,300 225,225 300,150', label: [274, 224], sign: [244, 226] },
  { pts: '300,150 225,225 150,150 225,75', label: [225, 150], sign: [172, 150] },
  { pts: '300,150 225,75 300,0', label: [274, 78], sign: [244, 76] },
  { pts: '300,0 225,75 150,0', label: [225, 28], sign: [228, 58] },
];

export function NorthIndianChart({ ascSign, placements, onSelect, selected, title = 'North Indian chart' }: { ascSign: number | null; placements: { id: string; sign: number; retrograde?: boolean }[]; onSelect?: (id: string) => void; selected?: string | null; title?: string }) {
  if (ascSign === null) {
    return <p className="rounded-[var(--radius-md)] border border-dashed border-line-strong p-6 text-center text-sm text-fg-2">House-based charts need a birth time. Your placements by sign are listed below.</p>;
  }
  return (
    <svg viewBox="-4 -4 308 308" role={onSelect ? 'group' : 'img'} aria-label={`${title}. Lagna in ${SIGNS[ascSign].vedic}.`} className="w-full max-w-[420px]">
      <rect x="0" y="0" width="300" height="300" fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="1.2" rx="4" />
      {NI_HOUSES.map((h, i) => {
        const sign = (ascSign + i) % 12;
        const here = placements.filter((p) => p.sign === sign);
        return (
          <g key={i}>
            <polygon points={h.pts} fill="none" stroke="var(--accent)" strokeOpacity=".45" strokeWidth="0.8" />
            <text x={h.sign[0]} y={h.sign[1]} textAnchor="middle" className="fill-[var(--text-3)] text-[10px] numeric">{sign + 1}</text>
            {here.map((p, k) => (
              <text key={p.id} x={h.label[0] + ((k % 3) - (Math.min(here.length, 3) - 1) / 2) * 22} y={h.label[1] + Math.floor(k / 3) * 15} textAnchor="middle"
                onClick={() => onSelect?.(p.id)} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(p.id); }}
                className={cx('font-display text-[14px] font-semibold', selected === p.id ? 'fill-[var(--accent-strong)]' : 'fill-[var(--accent)]', onSelect && 'cursor-pointer')}>
                {abbr(p.id)}{p.retrograde && p.id !== 'rahu' && p.id !== 'ketu' ? 'ᴿ' : ''}
              </text>
            ))}
          </g>
        );
      })}
      <text x="150" y="150" textAnchor="middle" dominantBaseline="central" className="fill-[var(--accent)] text-[18px]" opacity=".25">✦</text>
    </svg>
  );
}

/* ---------------- South Indian (fixed-sign grid) chart ---------------- */

const SI_CELLS: [number, number][] = [[1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0]];

export function SouthIndianChart({ ascSign, placements, onSelect, selected }: { ascSign: number | null; placements: { id: string; sign: number; retrograde?: boolean }[]; onSelect?: (id: string) => void; selected?: string | null }) {
  // Cell order: Pisces top-left, then clockwise Aries… (traditional South Indian layout).
  const cellOf = (sign: number) => SI_CELLS[(sign + 1) % 12];
  return (
    <svg viewBox="-2 -2 324 324" role={onSelect ? 'group' : 'img'} aria-label="South Indian chart with fixed signs" className="w-full max-w-[420px]">
      {SIGNS.map((s) => {
        const [cx0, cy0] = cellOf(s.index);
        const here = placements.filter((p) => p.sign === s.index);
        const isAsc = ascSign === s.index;
        return (
          <g key={s.index} transform={`translate(${cx0 * 80},${cy0 * 80})`}>
            <rect width="80" height="80" fill="var(--surface-2)" stroke="var(--accent)" strokeOpacity=".45" strokeWidth="0.8" />
            {isAsc && <line x1="0" y1="18" x2="18" y2="0" stroke="var(--accent)" strokeWidth="1.5" />}
            <text x="76" y="13" textAnchor="end" className="fill-[var(--text-3)] text-[9px]">{s.vedic}</text>
            {here.map((p, k) => (
              <text key={p.id} x={14 + (k % 3) * 24} y={36 + Math.floor(k / 3) * 18} onClick={() => onSelect?.(p.id)} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(p.id); }}
                className={cx('font-display text-[14px] font-semibold', selected === p.id ? 'fill-[var(--accent-strong)]' : 'fill-[var(--accent)]', onSelect && 'cursor-pointer')}>
                {abbr(p.id)}{p.retrograde && p.id !== 'rahu' && p.id !== 'ketu' ? 'ᴿ' : ''}
              </text>
            ))}
          </g>
        );
      })}
      <rect x="80" y="80" width="160" height="160" fill="var(--surface)" />
      <text x="160" y="160" textAnchor="middle" dominantBaseline="central" className="fill-[var(--text-3)] text-[11px]">{ascSign !== null ? `Lagna: ${SIGNS[ascSign].vedic}` : 'Lagna unknown'}</text>
    </svg>
  );
}

/* ---------------- Western chart wheel ---------------- */

export function WesternWheel({ chart, aspects = [], onSelect, selected }: { chart: ChartResult; aspects?: { a: string; b: string; type: string }[]; onSelect?: (id: string) => void; selected?: string | null }) {
  const asc = chart.ascendant?.longitude ?? 0;
  const R = 150;
  const pt = (lon: number, r: number) => {
    const a = ((lon - asc + 180) * Math.PI) / 180;
    return [R + Math.cos(a) * r, R - Math.sin(a) * r];
  };
  const placements = chart.placements.filter((p) => p.id !== 'ketu');
  const byId = new Map(placements.map((p) => [p.id, p]));
  const aspectColor: Record<string, string> = { trine: 'var(--celestial)', sextile: 'var(--celestial)', square: 'var(--danger)', opposition: 'var(--danger)', conjunction: 'var(--accent)' };
  // Spread clustered planets so glyphs do not overlap.
  const sorted = [...placements].sort((a, b) => a.longitude - b.longitude);
  const display = new Map<string, number>();
  let last = -999;
  for (const p of sorted) { const l = p.longitude - last < 7 ? last + 7 : p.longitude; display.set(p.id, l); last = l; }
  return (
    <svg viewBox="0 0 300 300" role={onSelect ? 'group' : 'img'} aria-label={`Western chart wheel${chart.ascendant ? `, Ascendant ${chart.ascendant.signName}` : ''}`} className="w-full max-w-[460px]">
      <circle cx={R} cy={R} r={146} fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="1" />
      <circle cx={R} cy={R} r={122} fill="none" stroke="var(--accent)" strokeOpacity=".5" strokeWidth="0.8" />
      <circle cx={R} cy={R} r={70} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="0.8" />
      {SIGNS.map((s) => {
        const [x1, y1] = pt(s.index * 30, 122);
        const [x2, y2] = pt(s.index * 30, 146);
        const [gx, gy] = pt(s.index * 30 + 15, 134);
        return (
          <g key={s.index}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent)" strokeOpacity=".5" strokeWidth="0.8" />
            <text x={gx} y={gy} textAnchor="middle" dominantBaseline="central" className="fill-[var(--accent)] text-[13px]">{s.glyph}</text>
          </g>
        );
      })}
      {chart.cusps?.map((c, i) => {
        const [x1, y1] = pt(c, 70);
        const [x2, y2] = pt(c, 122);
        const [tx, ty] = pt(c + 4, 78);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 3 === 0 ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth={i % 3 === 0 ? 1.2 : 0.6} />
            <text x={tx} y={ty} className="fill-[var(--text-3)] text-[7px] numeric" textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
      {aspects.filter((a) => byId.has(a.a as never) && byId.has(a.b as never)).slice(0, 30).map((a, i) => {
        const pa = byId.get(a.a as never)!;
        const pb = byId.get(a.b as never)!;
        const [x1, y1] = pt(pa.longitude, 68);
        const [x2, y2] = pt(pb.longitude, 68);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={aspectColor[a.type] ?? 'var(--line-strong)'} strokeOpacity=".55" strokeWidth="0.7" />;
      })}
      {placements.map((p) => {
        const [x, y] = pt(display.get(p.id)!, 104);
        const [mx, my] = pt(p.longitude, 122);
        return (
          <g key={p.id} onClick={() => onSelect?.(p.id)} className={onSelect ? 'cursor-pointer' : undefined} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={`${PLANETS[p.id].name} ${p.signName} ${p.dms}`} onKeyDown={(e) => { if (e.key === 'Enter') onSelect?.(p.id); }}>
            <line x1={mx} y1={my} x2={pt(p.longitude, 116)[0]} y2={pt(p.longitude, 116)[1]} stroke="var(--text-2)" strokeWidth="0.8" />
            <circle cx={x} cy={y} r="8" fill={selected === p.id ? 'var(--accent)' : 'var(--surface)'} stroke="var(--accent)" strokeOpacity=".6" strokeWidth=".6" />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className={cx('text-[10px]', selected === p.id ? 'fill-[var(--accent-ink)]' : 'fill-[var(--text)]')}>{PLANETS[p.id].glyph}</text>
          </g>
        );
      })}
      {chart.ascendant && <text x={10} y={R - 4} className="fill-[var(--accent)] text-[8px] font-semibold">ASC</text>}
    </svg>
  );
}

/* ---------------- Aspect grid ---------------- */

const ASPECT_GLYPH: Record<string, string> = { conjunction: '☌', opposition: '☍', trine: '△', square: '□', sextile: '⚹', quincunx: '⚻', semisextile: '⚺' };

export function AspectGrid({ placements, aspects }: { placements: Placement[]; aspects: { a: string; b: string; type: string; orb: number }[] }) {
  const ids = placements.filter((p) => p.id !== 'ketu').map((p) => p.id as string);
  const find = (x: string, y: string) => aspects.find((a) => (a.a === x && a.b === y) || (a.a === y && a.b === x));
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="border-collapse text-xs" aria-label="Aspect grid">
        <tbody>
          {ids.map((row, i) => (
            <tr key={row}>
              <th scope="row" className="pr-2 text-right font-normal text-fg-3">{PLANETS[row as PlanetId].glyph}</th>
              {ids.slice(0, i).map((col) => {
                const a = find(row, col);
                return (
                  <td key={col} className="h-7 w-7 border border-line text-center" title={a ? `${PLANETS[row as PlanetId].name} ${a.type} ${PLANETS[col as PlanetId].name} (orb ${a.orb.toFixed(1)}°)` : undefined}>
                    {a && <span className={['square', 'opposition', 'quincunx'].includes(a.type) ? 'text-danger' : a.type === 'conjunction' ? 'text-accent' : 'text-celestial'}>{ASPECT_GLYPH[a.type]}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr><td />{ids.slice(0, -1).map((c) => <td key={c} className="text-center text-fg-3">{PLANETS[c as PlanetId].glyph}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Dasha timeline ---------------- */

export function DashaTimeline({ mahadashas, now = new Date() }: { mahadashas: { lord: string; start: string; end: string; years: number; sub?: { lord: string; start: string; end: string }[] }[]; now?: Date }) {
  const start = Date.parse(mahadashas[0].start);
  const end = Date.parse(mahadashas[mahadashas.length - 1].end);
  const span = end - start;
  const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
  const nowPct = ((now.getTime() - start) / span) * 100;
  const current = mahadashas.find((m) => Date.parse(m.start) <= now.getTime() && now.getTime() < Date.parse(m.end));
  return (
    <div>
      <div className="relative h-10 overflow-hidden rounded-[var(--radius-sm)] border border-line" role="img" aria-label={`Vimshottari mahadasha timeline. Current: ${current ? PLANETS[current.lord as PlanetId].vedic : 'none'}.`}>
        {mahadashas.map((m, i) => {
          const left = ((Date.parse(m.start) - start) / span) * 100;
          const width = ((Date.parse(m.end) - Date.parse(m.start)) / span) * 100;
          return (
            <div key={i} className="absolute inset-y-0 flex items-center justify-center border-r border-canvas text-[11px] font-semibold text-accent-ink" style={{ left: `${left}%`, width: `${width}%`, background: palette[i % palette.length], opacity: m === current ? 1 : 0.55 }} title={`${PLANETS[m.lord as PlanetId].vedic} ${m.start.slice(0, 10)} → ${m.end.slice(0, 10)}`}>
              {width > 6 ? PLANETS[m.lord as PlanetId].abbr : ''}
            </div>
          );
        })}
        {nowPct > 0 && nowPct < 100 && <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${nowPct}%` }} aria-hidden="true" />}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {mahadashas.map((m, i) => (
          <li key={i} className={cx('rounded-[var(--radius-sm)] border px-3 py-2 text-sm', m === current ? 'border-accent bg-accent/10' : 'border-line')}>
            <span className="font-medium text-fg">{PLANETS[m.lord as PlanetId].vedic}</span>
            <span className="ml-2 text-xs text-fg-3 numeric">{m.start.slice(0, 10)} → {m.end.slice(0, 10)}</span>
            {m === current && m.sub && (
              <ul className="mt-2 space-y-0.5 text-xs text-fg-2">
                {m.sub.filter((s) => Date.parse(s.end) > now.getTime()).slice(0, 4).map((s) => <li key={s.start} className="numeric">{PLANETS[s.lord as PlanetId].vedic} antardasha · {s.start.slice(0, 10)} → {s.end.slice(0, 10)}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------- 2D bonds graph (fallback & keyboard view) ---------------- */

export function BondsGraph2D({ nodes, edges, positions, selected, onSelect, colors }: {
  nodes: { id: string; label: string; self: boolean; external: boolean }[];
  edges: { id: string; source: string; target: string; kind: string; status: string }[];
  positions: Map<string, [number, number, number]>;
  selected: string | null;
  onSelect: (id: string) => void;
  colors: Record<string, string>;
}) {
  const xs = [...positions.values()].map((p) => p[0]);
  const ys = [...positions.values()].map((p) => p[1]);
  const pad = 2;
  const minX = Math.min(...xs, -3) - pad, maxX = Math.max(...xs, 3) + pad, minY = Math.min(...ys, -3) - pad, maxY = Math.max(...ys, 3) + pad;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Relationship constellation (2D view)" className="h-full w-full">
      {edges.map((e) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;
        return <line key={e.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={colors[e.kind] ?? 'var(--line-strong)'} strokeWidth={selected === e.id ? 0.12 : 0.06} opacity={e.status === 'revoked' ? 0.3 : 0.8} onClick={() => onSelect(e.id)} className="cursor-pointer" />;
      })}
      {nodes.map((n) => {
        const p = positions.get(n.id)!;
        return (
          <g key={n.id}>
            <circle cx={p[0]} cy={p[1]} r={n.self ? 0.4 : 0.26} fill={n.self ? 'var(--accent)' : n.external ? 'var(--text-3)' : 'var(--text)'} />
            <text x={p[0]} y={p[1] + 0.75} textAnchor="middle" fontSize="0.42" className="fill-[var(--text-2)]">{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
