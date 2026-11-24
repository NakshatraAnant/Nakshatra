import type { ReactNode } from 'react';
import { Button, cx } from './primitives';
import { Icon, type IconName } from './icons';

export function StatTile({ label, value, sub, icon, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: IconName; className?: string }) {
  return (
    <div className={cx('card flex flex-col gap-1 p-4', className)}>
      <div className="flex items-center justify-between eyebrow">
        {label}
        {icon && <Icon name={icon} size={16} className="text-accent" />}
      </div>
      <div className="font-display text-3xl text-fg numeric">{value}</div>
      {sub && <div className="text-xs text-fg-3">{sub}</div>}
    </div>
  );
}

/** Horizontal meter for 0–100 dimension scores. Always paired with its numeric value for accessibility. */
export function Meter({ value, max = 100, label, tone = 'accent' }: { value: number; max?: number; label: string; tone?: 'accent' | 'violet' | 'celestial' }) {
  const pctValue = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === 'violet' ? 'var(--violet)' : tone === 'celestial' ? 'var(--celestial)' : 'var(--accent)';
  return (
    <div className="flex items-center gap-3" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pctValue}%`, background: `linear-gradient(90deg, ${color}, var(--violet))` }} />
      </div>
      <span className="w-14 text-right text-sm text-fg numeric">{value}{max === 100 ? '' : ` / ${max}`}</span>
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 5, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(value * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-[var(--text)] text-[13px] font-semibold">{Math.round(value * 100)}%</text>
    </svg>
  );
}

export function DataTable<T>({ rows, columns, empty = 'No records', keyOf }: { rows: T[]; columns: { key: string; header: string; cell: (r: T) => ReactNode; className?: string }[]; empty?: string; keyOf: (r: T) => string }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-fg-3">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line scrollbar-thin">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-2 eyebrow">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('px-4 py-3 font-semibold', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((r) => <tr key={keyOf(r)} className="hover:bg-surface-2/60">{columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-top text-fg-2', c.className)}>{c.cell(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3">
      <Button variant="secondary" size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="text-sm text-fg-2 numeric">Page {page} of {pages}</span>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next <Icon name="chevronRight" size={16} /></Button>
    </nav>
  );
}

export function TimelineItem({ date, title, body, kind, calculated, actions }: { date: string; title: ReactNode; body?: ReactNode; kind: string; calculated?: boolean; actions?: ReactNode }) {
  return (
    <li className="relative pl-8">
      <span className={cx('absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2', calculated ? 'border-celestial bg-canvas' : 'border-accent bg-accent')} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
        <time className="numeric">{date}</time>
        <span className={cx('rounded-full px-2 py-0.5', calculated ? 'bg-celestial/10 text-celestial' : 'bg-accent/10 text-accent')}>{calculated ? `Calculated · ${kind}` : kind}</span>
      </div>
      <p className="mt-1 font-medium text-fg">{title}</p>
      {body && <p className="mt-1 text-sm text-fg-2 whitespace-pre-line">{body}</p>}
      {actions && <div className="mt-2 flex gap-2">{actions}</div>}
    </li>
  );
}

/** Small constellation glyph drawn from an achievement's point pattern. */
export function Constellation({ points, size = 56, lit = true }: { points: number[][]; size?: number; lit?: boolean }) {
  const maxX = Math.max(...points.map((p) => p[0]), 1);
  const maxY = Math.max(...points.map((p) => p[1]), 1);
  const pad = 8;
  const xy = points.map(([x, y]) => [pad + (x / maxX) * (size - pad * 2), pad + (y / maxY) * (size - pad * 2)]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={lit ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth="1" opacity=".7" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={lit ? 2.6 : 2} fill={lit ? 'var(--accent-strong)' : 'var(--text-3)'} />)}
    </svg>
  );
}

export function Money({ paise }: { paise: number }) {
  return <span className="numeric">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100)}</span>;
}
