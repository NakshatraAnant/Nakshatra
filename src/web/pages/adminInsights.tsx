import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { Badge, Card, Field, Select, cx } from '../components/ui/primitives';
import { QueryState } from '../components/ui/feedback';

interface Step { key: string; label: string; unit: 'events' | 'people'; value: number; fromPrevious: number | null; fromFirst: number | null }
interface FunnelResp { days: number; visitor: Step[]; member: Step[]; biggestDropOff: { from: string; to: string; lost: number; base: number } | null; note: string }

function FunnelBars({ steps, title }: { steps: Step[]; title: string }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Card>
      <h3 className="font-display text-2xl">{title}</h3>
      <table className="mt-3 w-full text-sm">
        <thead className="sr-only"><tr><th>Step</th><th>Count</th><th>From previous step</th></tr></thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={s.key} className="align-middle">
              <th scope="row" className="w-[42%] py-1.5 pr-3 text-left font-normal text-fg-2">{s.label}</th>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-3 rounded-sm bg-accent" style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} aria-hidden="true" />
                  <span className="numeric text-fg">{s.value}</span>
                  <span className="text-xs text-fg-3">{s.unit}</span>
                </div>
              </td>
              <td className="w-24 py-1.5 text-right text-xs text-fg-3 numeric">{i === 0 || s.fromPrevious === null ? '—' : `${s.fromPrevious}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function FunnelAdmin() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['admin-funnel', days], queryFn: () => get<FunnelResp>(`admin/funnel?days=${days}`) });
  return (
    <div className="space-y-4">
      <Field label="Window" className="max-w-xs">{(id) => <Select id={id} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</Select>}</Field>
      <QueryState q={q}>{(d) => (
        <>
          {d.biggestDropOff && (
            <Card className="border-warning/50" role="note">
              <p className="text-sm text-fg-2">Biggest member drop-off</p>
              <p className="mt-1 text-fg"><strong>{d.biggestDropOff.from}</strong> → <strong>{d.biggestDropOff.to}</strong>: {d.biggestDropOff.lost} of {d.biggestDropOff.base} people ({Math.round((100 * d.biggestDropOff.lost) / d.biggestDropOff.base)}%) did not continue.</p>
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            <FunnelBars steps={d.visitor} title="Visitors (events)" />
            <FunnelBars steps={d.member} title={`New members, last ${d.days} days`} />
          </div>
          <p className="text-xs text-fg-3">{d.note}</p>
        </>
      )}</QueryState>
    </div>
  );
}

interface Dist { n: number; maxShare: number; minShare: number; maxOverMin: number; confidence: Record<string, number>; blendPct: number; share: Record<string, number> }
interface AssessmentResp {
  currentVersion: string;
  real: { version: string; total: number; byArchetype: { key: string; name: string; n: number; pct: number }[]; confidence: Record<string, number> }[];
  simulated: Record<'uniform' | 'persons' | 'mild', { v1: Dist; v2: Dist }>;
  note: string;
}

export function AssessmentAdmin() {
  const q = useQuery({ queryKey: ['admin-assessment'], queryFn: () => get<AssessmentResp>('admin/assessment') });
  const [pop, setPop] = useState<'uniform' | 'persons' | 'mild'>('persons');
  return (
    <QueryState q={q}>{(d) => {
      const sim = d.simulated[pop];
      const keys = Object.keys(sim.v2.share);
      const target = 100 / keys.length;
      return (
        <div className="space-y-4">
          <Card>
            <h3 className="font-display text-2xl">Scoring model</h3>
            <p className="mt-1 text-sm text-fg-2">Current version <Badge tone="accent">{d.currentVersion}</Badge>. Saved results keep the version that produced them.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {d.real.map((r) => (
                <li key={r.version} className="rounded-[var(--radius-sm)] border border-line p-3 text-sm">
                  <p className="text-fg">{r.version}: <span className="numeric">{r.total}</span> saved results</p>
                  <p className="text-xs text-fg-3">high {r.confidence.high ?? 0} · medium {r.confidence.medium ?? 0} · low {r.confidence.low ?? 0} · inconclusive {r.confidence.inconclusive ?? 0}</p>
                  {r.total > 0 && <p className="mt-1 text-xs text-fg-3">Most common: {[...r.byArchetype].sort((a, b) => b.n - a.n).slice(0, 3).map((a) => `${a.name} ${a.pct}%`).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-display text-2xl">Balance check (simulated)</h3>
              <Field label="Reference population">{(id) => <Select id={id} value={pop} onChange={(e) => setPop(e.target.value as typeof pop)}><option value="persons">Varied leanings</option><option value="mild">Mild leanings</option><option value="uniform">Random answers</option></Select>}</Field>
            </div>
            <p className="mt-2 text-sm text-fg-2">Even split is {target.toFixed(1)}% each. v1 max/min {(sim.v1.maxShare * 100).toFixed(1)}% / {(sim.v1.minShare * 100).toFixed(1)}% → v2 {(sim.v2.maxShare * 100).toFixed(1)}% / {(sim.v2.minShare * 100).toFixed(1)}%. v2 blends {sim.v2.blendPct}%; confident (high+medium) {(sim.v2.confidence.high + sim.v2.confidence.medium).toFixed(1)}%.</p>
            <table className="mt-3 w-full text-xs">
              <thead><tr className="text-left text-fg-3"><th className="py-1 font-normal">Archetype</th><th className="font-normal">v1</th><th className="font-normal">v2</th></tr></thead>
              <tbody>{keys.sort((a, b) => sim.v1.share[b] - sim.v1.share[a]).map((k) => (
                <tr key={k} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-normal text-fg-2">{k.replace(/_/g, ' ')}</th>
                  <td className={cx('numeric', Math.abs(sim.v1.share[k] - target) > target * 0.5 && 'text-warning')}>{sim.v1.share[k].toFixed(1)}%</td>
                  <td className={cx('numeric', Math.abs(sim.v2.share[k] - target) > target * 0.5 && 'text-warning')}>{sim.v2.share[k].toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-3 text-xs text-fg-3">{d.note}</p>
          </Card>
        </div>
      );
    }}</QueryState>
  );
}
