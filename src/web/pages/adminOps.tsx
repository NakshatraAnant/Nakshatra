import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { Card, cx } from '../components/ui/primitives';
import { QueryState } from '../components/ui/feedback';

type Light = 'green' | 'amber' | 'red' | 'grey';
interface Item { key: string; area: string; feature: string; status: Light; reason: string; dependency: string | null; works: string; launchImpact: string; link: string | null }
interface Readiness { generatedAt: string; summary: Record<Light, number>; items: Item[] }

const LIGHT: Record<Light, { label: string; dot: string; text: string }> = {
  red: { label: 'Blocks launch', dot: 'bg-danger', text: 'text-danger' },
  amber: { label: 'Works with a caveat', dot: 'bg-warning', text: 'text-warning' },
  green: { label: 'Ready', dot: 'bg-success', text: 'text-success' },
  grey: { label: 'Off / not built', dot: 'bg-fg-3', text: 'text-fg-3' },
};
const ORDER: Light[] = ['red', 'amber', 'green', 'grey'];

export function LaunchReadiness() {
  const q = useQuery({ queryKey: ['admin-readiness'], queryFn: () => get<Readiness>('admin/launch-readiness'), refetchInterval: 60_000 });
  const [filter, setFilter] = useState<Light | ''>('');
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Filter by status">
          {ORDER.map((l) => (
            <button key={l} type="button" aria-pressed={filter === l} onClick={() => setFilter(filter === l ? '' : l)} className={cx('card p-3 text-left', filter === l && 'border-accent')}>
              <span className="flex items-center gap-2 text-sm text-fg-2"><span className={cx('h-2.5 w-2.5 rounded-full', LIGHT[l].dot)} aria-hidden="true" />{LIGHT[l].label}</span>
              <span className="mt-1 block font-display text-3xl numeric">{d.summary[l]}</span>
            </button>
          ))}
        </div>
        <ul className="space-y-3">
          {d.items.filter((i) => !filter || i.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map((i) => (
            <li key={i.key} className="card p-4" data-status={i.status}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-fg-3">{i.area}</p>
                  <h3 className="font-display text-xl">{i.feature}</h3>
                </div>
                <span className={cx('inline-flex items-center gap-1.5 text-sm', LIGHT[i.status].text)}><span className={cx('h-2.5 w-2.5 rounded-full', LIGHT[i.status].dot)} aria-hidden="true" />{LIGHT[i.status].label}</span>
              </div>
              <p className="mt-2 text-sm text-fg">{i.reason}</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
                <dt className="text-fg-3">What works</dt><dd className="text-fg-2">{i.works}</dd>
                {i.dependency && <><dt className="text-fg-3">Needs</dt><dd className="text-fg-2">{i.dependency}</dd></>}
                <dt className="text-fg-3">Launch impact</dt><dd className="text-fg-2">{i.launchImpact}</dd>
              </dl>
              {i.link && <Link to={i.link} className="mt-2 inline-flex text-sm text-accent underline underline-offset-2">Open</Link>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-3">Computed live from configuration and data at {new Date(d.generatedAt).toLocaleString()}.</p>
      </div>
    )}</QueryState>
  );
}

interface Perf { since: string; overallApi: { sampled: number; p50: number; p95: number; p99: number }; routes: { route: string; requests: number; sampled: number; p50: number; p95: number; p99: number; max: number; serverErrors: number }[]; memoryMb: number; uptimeSeconds: number; dbPingMs: number; note: string }

export function PerformanceAdmin() {
  const q = useQuery({ queryKey: ['admin-perf'], queryFn: () => get<Perf>('admin/performance'), refetchInterval: 15_000 });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['API p50', `${Math.round(d.overallApi.p50)} ms`], ['API p95', `${Math.round(d.overallApi.p95)} ms`], ['API p99', `${Math.round(d.overallApi.p99)} ms`], ['DB ping', `${d.dbPingMs} ms`], ['Memory', `${d.memoryMb} MB`]].map(([k, v]) => (
            <Card key={k} className="p-3"><p className="text-xs text-fg-3">{k}</p><p className="font-display text-2xl numeric">{v}</p></Card>
          ))}
        </div>
        <Card>
          <h3 className="font-display text-2xl">Slowest routes (by p95)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-fg-3"><th className="py-1 font-normal">Route</th><th className="font-normal">Requests</th><th className="font-normal">p50</th><th className="font-normal">p95</th><th className="font-normal">p99</th><th className="font-normal">5xx</th></tr></thead>
              <tbody>{d.routes.slice(0, 40).map((r) => (
                <tr key={r.route} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-2 text-left font-mono text-xs font-normal text-fg-2">{r.route}</th>
                  <td className="numeric">{r.requests}</td><td className="numeric">{r.p50}</td>
                  <td className={cx('numeric', r.p95 > 1000 ? 'text-danger' : r.p95 > 300 && 'text-warning')}>{r.p95}</td>
                  <td className="numeric">{r.p99}</td><td className={cx('numeric', r.serverErrors > 0 && 'text-danger')}>{r.serverErrors}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-3">{d.note} Up {Math.round(d.uptimeSeconds / 60)} min.</p>
        </Card>
      </div>
    )}</QueryState>
  );
}
