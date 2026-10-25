import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '../lib/api';
import { useMe } from '../lib/session';
import { useI18n } from '../lib/i18n';
import { dateShort } from '../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Select, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState } from '../components/ui/feedback';
import { Segmented, Tabs, useToast } from '../components/ui/overlays';
import { AspectGrid, DashaTimeline, NorthIndianChart, SouthIndianChart, WesternWheel } from '../charts/charts';
import type { ChartResult, Placement } from '../../astro/types';
import { PLANETS, SIGNS, type PlanetId } from '../../astro/constants';
import type { Interp } from './identity';

const ChartWheel3D = lazy(() => import('../three/scenes').then((m) => ({ default: m.ChartWheel3D })));

interface VedicExtras {
  dasha: { mahadashas: { lord: string; start: string; end: string; years: number; sub?: { lord: string; start: string; end: string }[] }[]; balanceAtBirth: { lord: string; years: number }; yearDays: number };
  activeDasha: { lord: string; start: string; end: string }[];
  vargas: { varga: string; name: string; theme: string; ascendantSign: number | null; placements: { id: string; sign: number }[]; timeSensitive: boolean }[];
  yogas: { key: string; name: string; present: boolean; rule: string; factors: string[]; requiresBirthTime: boolean; caveat: string }[];
  manglik: { present: boolean; convention: string; fromLagna: { house: number | null }; fromMoon: { house: number }; fromVenus: { house: number }; traditionalExceptions: string[]; note: string };
  kaalSarp: { present: boolean; rule: string; factors: string[] };
  ashtakavarga: { available: boolean; reason?: string; bhinna: Record<string, number[]>; sarva: number[]; totals: Record<string, number> };
  interpretations: Interp[];
  unsupported: { feature: string; reason: string }[];
}
interface WesternExtras { aspects: { a: string; b: string; type: string; orb: number; applying: boolean | null; nature: string }[]; elements: { elements: Record<string, number>; modalities: Record<string, number>; dominantElement: string; dominantModality: string; method: string }; patterns: { type: string; bodies: string[]; description: string }[]; interpretations: Interp[] }
interface ChartResp { chartId: string; configKey: string; chart: ChartResult; vedic?: VedicExtras; western?: WesternExtras }

const CONFIG_LABELS: Record<string, string> = {
  vedic_default: 'Lahiri · whole-sign · true node', vedic_mean_node: 'Lahiri · whole-sign · mean node', vedic_equal: 'Lahiri · equal houses',
  western_default: 'Tropical · Placidus', western_whole_sign: 'Tropical · whole-sign', western_equal: 'Tropical · equal houses', western_porphyry: 'Tropical · Porphyry',
};

type Tab = 'overview' | 'explore3d' | 'dasha' | 'vargas' | 'yogas' | 'ashtakavarga' | 'aspects' | 'transits' | 'progressions' | 'numerology' | 'snapshots';

export function ChartPage() {
  const me = useMe().data?.user;
  const [params, setParams] = useSearchParams();
  const [system, setSystem] = useState<'vedic' | 'western'>((params.get('system') as 'vedic' | 'western') ?? me?.profile?.preferredSystem ?? 'vedic');
  const [config, setConfig] = useState(system === 'vedic' ? 'vedic_default' : 'western_default');
  const tab = (params.get('tab') as Tab) ?? 'overview';
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  const q = useQuery({ queryKey: ['chart', config], queryFn: () => get<ChartResp>(`charts/me?config=${config}`) });
  const switchSystem = (s: 'vedic' | 'western') => { setSystem(s); setConfig(s === 'vedic' ? 'vedic_default' : 'western_default'); if (['dasha', 'vargas', 'yogas', 'ashtakavarga'].includes(tab) && s === 'western') setTab('overview'); if (tab === 'aspects' && s === 'vedic') setTab('overview'); };
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' }, { value: 'explore3d', label: '3D explorer' },
    ...(system === 'vedic' ? [{ value: 'dasha' as Tab, label: 'Dasha' }, { value: 'vargas' as Tab, label: 'Divisional charts' }, { value: 'yogas' as Tab, label: 'Yogas & doshas' }, { value: 'ashtakavarga' as Tab, label: 'Ashtakavarga' }] : [{ value: 'aspects' as Tab, label: 'Aspects & patterns' }, { value: 'progressions' as Tab, label: 'Progressions & returns' }]),
    { value: 'transits', label: 'Transits' }, { value: 'numerology', label: 'Numerology' }, { value: 'snapshots', label: 'Snapshots' },
  ];
  return (
    <div>
      <PageHeader kicker="Chart" title={system === 'vedic' ? 'Your Kundli' : 'Your natal chart'} subtitle="Every position below is calculated from your birth moment with the method shown. Choose another convention to compare."
        actions={<>
          <Segmented label="System" value={system} onChange={switchSystem} options={[{ value: 'vedic', label: 'Vedic' }, { value: 'western', label: 'Western' }]} />
          <label className="sr-only" htmlFor="cfg">Calculation convention</label>
          <Select id="cfg" value={config} onChange={(e) => setConfig(e.target.value)} className="h-10 w-auto text-sm">
            {Object.entries(CONFIG_LABELS).filter(([k]) => k.startsWith(system)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />
      <QueryState q={q}>{(d) => (
        <>
          {d.chart.warnings.length > 0 && <Notice tone="warning" className="mb-5" title="Calculation notes">{d.chart.warnings.map((w) => <p key={w}>{w}</p>)}</Notice>}
          {tab === 'overview' && <Overview d={d} />}
          {tab === 'explore3d' && <Explore3D d={d} />}
          {tab === 'dasha' && d.vedic && <Card><h2 className="font-display text-2xl">Vimshottari dasha</h2><p className="mt-1 mb-4 text-sm text-fg-2">Balance at birth: {PLANETS[d.vedic.dasha.balanceAtBirth.lord as PlanetId].vedic} {d.vedic.dasha.balanceAtBirth.years.toFixed(2)} years. Year length convention: {d.vedic.dasha.yearDays} days.</p><DashaTimeline mahadashas={d.vedic.dasha.mahadashas} /><p className="mt-4 text-xs text-fg-3">Dashas describe traditional chapters of life, not guaranteed events.</p></Card>}
          {tab === 'vargas' && d.vedic && <Vargas v={d.vedic} />}
          {tab === 'yogas' && d.vedic && <Yogas v={d.vedic} />}
          {tab === 'ashtakavarga' && d.vedic && <Ashtakavarga v={d.vedic} />}
          {tab === 'aspects' && d.western && <Aspects d={d} />}
          {tab === 'transits' && <Transits />}
          {tab === 'progressions' && <Progressions />}
          {tab === 'numerology' && <Numerology />}
          {tab === 'snapshots' && <Snapshots configKey={config} />}
          <details className="mt-6 text-xs text-fg-3"><summary className="cursor-pointer">Methodology</summary><ul className="mt-2 space-y-1">{d.chart.methodology.map((m) => <li key={m}>{m}</li>)}</ul></details>
        </>
      )}</QueryState>
    </div>
  );
}

function PlanetTable({ chart, onSelect, selected }: { chart: ChartResult; onSelect: (id: string) => void; selected: string | null }) {
  const vedic = chart.system === 'vedic';
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line scrollbar-thin">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Planetary placements</caption>
        <thead className="bg-surface-2 eyebrow"><tr><th className="px-3 py-2.5 text-left">Body</th><th className="px-3 py-2.5 text-left">Sign</th><th className="px-3 py-2.5 text-left">Degree</th>{vedic && <th className="px-3 py-2.5 text-left">Nakshatra</th>}<th className="px-3 py-2.5 text-left">House</th><th className="px-3 py-2.5 text-left">Notes</th></tr></thead>
        <tbody className="divide-y divide-[var(--line)]">
          {chart.ascendant && <tr><td className="px-3 py-2 text-fg">{vedic ? 'Lagna' : 'Ascendant'}</td><td className="px-3 py-2">{chart.ascendant.signName}</td><td className="px-3 py-2 numeric">{chart.ascendant.dms}</td>{vedic && <td className="px-3 py-2">{chart.ascendant.nakshatra?.name} {chart.ascendant.nakshatra?.pada}</td>}<td className="px-3 py-2">1</td><td /></tr>}
          {chart.placements.map((p: Placement) => (
            <tr key={p.id} className={cx('cursor-pointer hover:bg-surface-2/60', selected === p.id && 'bg-accent/10')} onClick={() => onSelect(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(p.id)}>
              <td className="px-3 py-2 text-fg"><span className="mr-2 text-accent">{PLANETS[p.id].glyph}</span>{p.name}</td>
              <td className="px-3 py-2">{vedic ? `${SIGNS[p.sign].vedic}` : SIGNS[p.sign].name}</td>
              <td className="px-3 py-2 numeric">{p.dms}</td>
              {vedic && <td className="px-3 py-2">{p.nakshatra?.name} {p.nakshatra?.pada}</td>}
              <td className="px-3 py-2">{p.house ?? '—'}</td>
              <td className="px-3 py-2 text-xs">{p.retrograde && p.id !== 'rahu' && p.id !== 'ketu' && <Badge tone="violet">Retrograde</Badge>} {p.dignity && <Badge tone={p.dignity === 'debilitated' ? 'neutral' : 'accent'}>{p.dignity}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InterpretationList({ items, configKey }: { items: Interp[]; configKey: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const save = useMutation({ mutationFn: (key: string) => post('insights', { ruleKey: key, configKey }), onSuccess: () => { toast('Saved to your insights', 'success'); qc.invalidateQueries({ queryKey: ['insights'] }); } });
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key} className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-display text-2xl">{i.title}</h3><p className="text-xs text-fg-3">{i.factor}</p></div>
            <Button size="sm" variant="ghost" icon="bookmark" onClick={() => save.mutate(i.key)} aria-label={`Save ${i.title}`}>Save</Button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">{i.body}</p>
          {i.caveat && <p className="mt-1 text-xs text-fg-3">{i.caveat}</p>}
        </li>
      ))}
    </ul>
  );
}

function Overview({ d }: { d: ChartResp }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [style, setStyle] = useState<'north' | 'south'>('north');
  const c = d.chart;
  const sel = c.placements.find((p) => p.id === selected);
  const interps = (d.vedic ?? d.western)!.interpretations;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        {c.system === 'vedic' ? (<>
          <div className="mb-3 flex justify-between"><h2 className="font-display text-2xl">Rashi chart (D1)</h2><Segmented label="Chart style" value={style} onChange={setStyle} options={[{ value: 'north', label: 'North' }, { value: 'south', label: 'South' }]} /></div>
          <div className="flex justify-center">{style === 'north' ? <NorthIndianChart ascSign={c.ascendant?.sign ?? null} placements={c.placements} onSelect={setSelected} selected={selected} /> : <SouthIndianChart ascSign={c.ascendant?.sign ?? null} placements={c.placements} onSelect={setSelected} selected={selected} />}</div>
        </>) : (<>
          <h2 className="mb-3 font-display text-2xl">Chart wheel</h2>
          <div className="flex justify-center"><WesternWheel chart={c} aspects={d.western?.aspects.filter((a) => !['quincunx', 'semisextile'].includes(a.type))} onSelect={setSelected} selected={selected} /></div>
        </>)}
        {sel && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-line p-4" aria-live="polite">
            <p className="font-display text-2xl">{sel.name} in {sel.signName}</p>
            <p className="text-sm text-fg-2 numeric">{sel.dms}{sel.house ? ` · house ${sel.house}` : ''}{sel.nakshatra ? ` · ${sel.nakshatra.name} pada ${sel.nakshatra.pada}` : ''}{sel.retrograde ? ' · retrograde' : ''}</p>
            <p className="mt-1 text-xs text-fg-3">Speed {sel.speed.toFixed(3)}°/day · tropical longitude {sel.tropicalLongitude.toFixed(4)}°</p>
          </div>
        )}
      </Card>
      <div className="flex flex-col gap-5">
        <PlanetTable chart={c} onSelect={(id) => { setSelected(id); void post('charts/explored', { factor: id }).catch(() => undefined); }} selected={selected} />
        <div><h2 className="mb-3 font-display text-2xl">Interpretations</h2><InterpretationList items={interps} configKey={d.configKey} /></div>
      </div>
    </div>
  );
}

function Explore3D({ d }: { d: ChartResp }) {
  const [selected, setSelected] = useState<string | null>(null);
  const markers = d.chart.placements.map((p) => ({ id: p.id, label: `${p.name} ${p.signName} ${p.dms}`, glyph: PLANETS[p.id].glyph, longitude: p.longitude, color: p.id === 'sun' ? '#d9b26f' : p.id === 'moon' ? '#f3eee2' : ['rahu', 'ketu'].includes(p.id) ? '#a9a6bd' : '#8d7bd8', emphasis: ['sun', 'moon'].includes(p.id) }));
  const sel = d.chart.placements.find((p) => p.id === selected);
  const interp = (d.vedic ?? d.western)!.interpretations.find((i) => i.key.includes(`.${selected}.`) || i.group === `house_${selected}`);
  const fallback = d.chart.system === 'vedic' ? <div className="flex h-full items-center justify-center p-6"><NorthIndianChart ascSign={d.chart.ascendant?.sign ?? null} placements={d.chart.placements} onSelect={setSelected} selected={selected} /></div> : <div className="flex h-full items-center justify-center p-6"><WesternWheel chart={d.chart} onSelect={setSelected} selected={selected} /></div>;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="relative h-[480px] overflow-hidden rounded-[var(--radius-xl)] border border-line bg-canvas-deep">
        <Suspense fallback={fallback}><ChartWheel3D markers={markers} ascendant={d.chart.ascendant?.longitude ?? null} selected={selected} onSelect={setSelected} fallback={fallback} /></Suspense>
        <p className="absolute bottom-3 left-4 right-4 text-[11px] text-fg-3">A diagram, not a sky view: each body sits at its calculated {d.chart.system === 'vedic' ? 'sidereal' : 'tropical'} longitude around the ring, with the Ascendant on the left. Distances from the centre are symbolic.</p>
      </div>
      <div>
        <h2 className="sr-only">Bodies</h2>
        <ul className="grid grid-cols-2 gap-2" aria-label="Select a body (keyboard alternative to the 3D view)">
          {d.chart.placements.map((p) => <li key={p.id}><button type="button" aria-pressed={selected === p.id} onClick={() => setSelected(p.id)} className={cx('w-full rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm', selected === p.id ? 'border-accent bg-accent/10' : 'border-line')}><span className="text-accent">{PLANETS[p.id].glyph}</span> {p.name}</button></li>)}
        </ul>
        {sel && (
          <Card className="mt-4 rise-in" aria-live="polite">
            <p className="font-display text-2xl">{sel.name} in {sel.signName}</p>
            <p className="text-sm text-fg-2 numeric">{sel.dms}{sel.house ? ` · house ${sel.house}` : ''}{sel.retrograde ? ' · retrograde' : ''}</p>
            {interp && <p className="mt-3 text-sm leading-relaxed text-fg-2">{interp.body}</p>}
            <Badge tone="celestial" className="mt-3">Calculated position</Badge>
          </Card>
        )}
      </div>
    </div>
  );
}

function Vargas({ v }: { v: VedicExtras }) {
  const [which, setWhich] = useState('D9');
  const vg = v.vargas.find((x) => x.varga === which)!;
  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-wrap gap-2 lg:w-48 lg:flex-col">
        {v.vargas.map((x) => <button key={x.varga} type="button" aria-pressed={which === x.varga} onClick={() => setWhich(x.varga)} className={cx('rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm', which === x.varga ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-2')}>{x.varga} · {x.name}</button>)}
      </div>
      <Card>
        <h2 className="font-display text-2xl">{vg.varga} {vg.name}</h2>
        <p className="text-sm text-fg-2">{vg.theme}</p>
        {vg.timeSensitive && <Notice tone="warning" className="mt-3">This varga changes with a few minutes of birth-time error. Treat it with caution unless your time is exact.</Notice>}
        <div className="mt-4 flex justify-center"><NorthIndianChart ascSign={vg.ascendantSign} placements={vg.placements} title={`${vg.varga} chart`} /></div>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{vg.placements.map((p) => <li key={p.id} className="text-fg-2"><span className="text-accent">{PLANETS[p.id as PlanetId].glyph}</span> {PLANETS[p.id as PlanetId].vedic}: {SIGNS[p.sign].vedic}</li>)}</ul>
        <p className="mt-4 text-xs text-fg-3">Varga rules per Brihat Parashara Hora Shastra.</p>
      </Card>
    </div>
  );
}

function Yogas({ v }: { v: VedicExtras }) {
  const present = v.yogas.filter((y) => y.present);
  const absent = v.yogas.filter((y) => !y.present);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 font-display text-2xl">Yogas present ({present.length})</h2>
        <ul className="space-y-3">{present.map((y) => <li key={y.key} className="card p-4"><p className="font-display text-2xl">{y.name}</p><p className="mt-1 text-sm text-fg-2">{y.rule}</p><p className="mt-1 text-xs text-fg-3">{y.factors.join(' · ')}</p><p className="mt-2 text-xs text-fg-3">{y.caveat}</p></li>)}</ul>
        <details className="mt-4"><summary className="cursor-pointer text-sm text-fg-2">Also evaluated, not present ({absent.length})</summary><ul className="mt-2 space-y-1 text-xs text-fg-3">{absent.map((y) => <li key={y.key}><strong className="text-fg-2">{y.name}:</strong> {y.rule}</li>)}</ul></details>
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-2xl">Doshas</h2>
        <Card>
          <div className="flex items-center justify-between"><p className="font-display text-2xl">Manglik (Kuja)</p><Badge tone={v.manglik.present ? 'warning' : 'success'}>{v.manglik.present ? 'Rule met' : 'Not met'}</Badge></div>
          <p className="mt-1 text-sm text-fg-2">{v.manglik.convention}</p>
          <p className="mt-2 text-sm text-fg-2 numeric">Mars is in house {v.manglik.fromLagna.house ?? '—'} from Lagna, {v.manglik.fromMoon.house} from the Moon, {v.manglik.fromVenus.house} from Venus.</p>
          {v.manglik.traditionalExceptions.length > 0 && <p className="mt-1 text-sm text-fg-2">Traditional exceptions present: {v.manglik.traditionalExceptions.join(' ')}</p>}
          <p className="mt-2 text-xs text-fg-3">{v.manglik.note} This never says anything about a person’s worth.</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between"><p className="font-display text-2xl">Kaal Sarp</p><Badge tone={v.kaalSarp.present ? 'warning' : 'success'}>{v.kaalSarp.present ? 'Pattern present' : 'Not present'}</Badge></div>
          <p className="mt-1 text-sm text-fg-2">{v.kaalSarp.rule}</p>
          <p className="mt-1 text-xs text-fg-3">{v.kaalSarp.factors.join(' ')}</p>
        </Card>
        {v.unsupported.map((u) => <Notice key={u.feature} tone="info" title={`${u.feature}: not available`}>{u.reason}</Notice>)}
      </section>
    </div>
  );
}

function Ashtakavarga({ v }: { v: VedicExtras }) {
  const av = v.ashtakavarga;
  if (!av.available) return <EmptyState icon="clock" title="Ashtakavarga needs a birth time" body={av.reason} />;
  const max = Math.max(...av.sarva);
  return (
    <Card>
      <h2 className="font-display text-2xl">Sarvashtakavarga · {av.totals.sarva} bindus</h2>
      <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-12">
        {av.sarva.map((n, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="flex h-32 w-full items-end rounded bg-surface-2"><div className="w-full rounded bg-accent" style={{ height: `${(n / max) * 100}%`, opacity: 0.4 + (n / max) * 0.6 }} aria-hidden="true" /></div>
            <span className="mt-1 text-xs text-fg-2 numeric">{n}</span>
            <span className="text-[10px] text-fg-3">{SIGNS[i].vedic.slice(0, 4)}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[640px] text-xs numeric">
          <thead><tr><th className="p-1.5 text-left text-fg-3">Bhinna</th>{SIGNS.map((s) => <th key={s.index} className="p-1.5 text-fg-3">{s.vedic.slice(0, 3)}</th>)}<th className="p-1.5 text-fg-3">Total</th></tr></thead>
          <tbody>{Object.entries(av.bhinna).map(([pl, row]) => <tr key={pl} className="border-t border-line"><td className="p-1.5 text-fg">{PLANETS[pl as PlanetId].vedic}</td>{row.map((n, i) => <td key={i} className="p-1.5 text-center text-fg-2">{n}</td>)}<td className="p-1.5 text-center text-fg">{av.totals[pl]}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fg-3">Parashara tables; totals are fixed by the tables (337 for the Sarvashtakavarga).</p>
    </Card>
  );
}

function Aspects({ d }: { d: ChartResp }) {
  const w = d.western!;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><h2 className="mb-4 font-display text-2xl">Aspect grid</h2><AspectGrid placements={d.chart.placements} aspects={w.aspects} /><p className="mt-3 text-xs text-fg-3">Orbs: conjunction/opposition 8°, trine/square 7°, sextile 5° (+2° with the Sun or Moon); minor aspects 2–3°.</p></Card>
      <div className="space-y-5">
        <Card>
          <h2 className="font-display text-2xl">Elements & modalities</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {[w.elements.elements, w.elements.modalities].map((g, gi) => (
              <ul key={gi} className="space-y-2">{Object.entries(g).map(([k, n]) => <li key={k}><div className="flex justify-between text-sm"><span className="capitalize text-fg-2">{k}</span><span className="text-fg numeric">{n}</span></div><div className="mt-1 h-1.5 rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, n * 8)}%` }} /></div></li>)}</ul>
            ))}
          </div>
          <p className="mt-3 text-xs text-fg-3">{w.elements.method}</p>
        </Card>
        <Card><h2 className="font-display text-2xl">Chart patterns</h2>{w.patterns.length ? <ul className="mt-2 space-y-2 text-sm">{w.patterns.map((p, i) => <li key={i}><strong className="capitalize text-fg">{p.type.replace('_', ' ')}</strong> <span className="text-fg-2">— {p.description}</span></li>)}</ul> : <p className="mt-2 text-sm text-fg-2">No grand trine, T-square, grand cross, yod or stellium detected.</p>}</Card>
        <Card><h2 className="font-display text-2xl">Tightest aspects</h2><ul className="mt-2 space-y-1.5 text-sm">{w.aspects.slice(0, 12).map((a, i) => <li key={i} className="flex justify-between gap-3"><span className="text-fg-2">{label(a.a)} {a.type} {label(a.b)}</span><span className="text-fg-3 numeric">{a.orb.toFixed(1)}°{a.applying === null ? '' : a.applying ? ' applying' : ' separating'}</span></li>)}</ul></Card>
      </div>
    </div>
  );
}

const label = (id: string) => (id === 'asc' ? 'Ascendant' : id === 'mc' ? 'Midheaven' : PLANETS[id as PlanetId]?.name ?? id);

function Transits() {
  const { dateLocale } = useI18n();
  const q = useQuery({ queryKey: ['transits'], queryFn: () => get<{ at: string; western: { aspects: { a: string; b: string; type: string; orb: number; applying: boolean | null }[] }; gochar: { entries: { id: string; name: string; signName: string; houseFromMoon: number; houseFromLagna: number | null; retrograde: boolean; traditionallyFavourable: boolean }[]; sadeSati: { description: string; rule: string }; note: string }; retrogrades: { id: string; stationRetrograde: string; stationDirect: string | null }[] }>('charts/me/transits') });
  return (
    <QueryState q={q}>{(t) => (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Gochar (from your Moon)</h2>
          <table className="mt-3 w-full text-sm"><thead className="eyebrow"><tr><th className="py-1 text-left">Graha</th><th className="text-left">Sign</th><th className="text-left">From Moon</th><th className="text-left">Tradition</th></tr></thead>
            <tbody className="divide-y divide-[var(--line)]">{t.gochar.entries.map((e) => <tr key={e.id}><td className="py-1.5 text-fg">{e.name}{e.retrograde ? ' ᴿ' : ''}</td><td className="text-fg-2">{e.signName}</td><td className="text-fg-2 numeric">{e.houseFromMoon}</td><td>{e.traditionallyFavourable ? <Badge tone="success">favourable</Badge> : <span className="text-xs text-fg-3">—</span>}</td></tr>)}</tbody></table>
          <Notice tone="info" className="mt-4">{t.gochar.sadeSati.description}</Notice>
          <p className="mt-2 text-xs text-fg-3">{t.gochar.note}</p>
        </Card>
        <div className="space-y-5">
          <Card><h2 className="font-display text-2xl">Transits to your natal chart</h2><p className="text-xs text-fg-3">Tropical, orb ≤ 25% of natal orbs, as of {dateShort(t.at, dateLocale)}.</p><ul className="mt-3 space-y-1.5 text-sm">{t.western.aspects.slice(0, 14).map((a, i) => <li key={i} className="flex justify-between gap-3"><span className="text-fg-2">Transiting {label(a.a)} {a.type} natal {label(a.b)}</span><span className="text-fg-3 numeric">{a.orb.toFixed(2)}°</span></li>)}{!t.western.aspects.length && <li className="text-fg-3">No exact transits right now.</li>}</ul></Card>
          <Card><h2 className="font-display text-2xl">Retrograde cycles</h2><ul className="mt-3 space-y-1.5 text-sm">{t.retrogrades.map((r, i) => <li key={i} className="flex justify-between gap-3"><span className="text-fg-2">{PLANETS[r.id as PlanetId].name}</span><span className="text-fg-3 numeric">{dateShort(r.stationRetrograde, dateLocale)} → {r.stationDirect ? dateShort(r.stationDirect, dateLocale) : '…'}</span></li>)}</ul></Card>
        </div>
      </div>
    )}</QueryState>
  );
}

function Progressions() {
  const [year, setYear] = useState(new Date().getFullYear());
  const p = useQuery({ queryKey: ['progressions'], queryFn: () => get<{ progressions: { method: string; ageYears: number; placements: { id: string; signName: string; dms: string }[]; ascendant: number | null; midheaven: number | null } }>('charts/me/progressions') });
  const sr = useQuery({ queryKey: ['solar-return', year], queryFn: () => get<{ solarReturn: ChartResult }>(`charts/me/solar-return?year=${year}`) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <QueryState q={p}>{({ progressions: pr }) => (
        <Card><h2 className="font-display text-2xl">Secondary progressions</h2><p className="text-xs text-fg-3">{pr.method} Age {pr.ageYears.toFixed(1)}.</p><ul className="mt-3 grid grid-cols-2 gap-2 text-sm">{pr.placements.map((x) => <li key={x.id} className="text-fg-2"><span className="text-accent">{PLANETS[x.id as PlanetId].glyph}</span> {x.signName} {x.dms}</li>)}</ul>{pr.ascendant !== null && <p className="mt-3 text-sm text-fg-2">Progressed Ascendant: {SIGNS[Math.floor(pr.ascendant / 30)].name}</p>}</Card>
      )}</QueryState>
      <Card>
        <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl">Solar return</h2><Input type="number" aria-label="Year" className="w-28" value={year} min={1900} max={2150} onChange={(e) => setYear(Number(e.target.value))} /></div>
        <QueryState q={sr}>{({ solarReturn: c }) => (
          <div className="mt-3">
            <p className="text-sm text-fg-2">The Sun returns to its natal position at {new Date(c.utc).toLocaleString()} (location: {c.input.placeName ?? 'your saved location'}).</p>
            <div className="mt-3 flex justify-center"><WesternWheel chart={c} /></div>
          </div>
        )}</QueryState>
      </Card>
    </div>
  );
}

function Numerology() {
  const q = useQuery({ queryKey: ['numerology'], queryFn: () => get<{ numerology: { lifePath: number; birthday: number; expression: number | null; soulUrge: number | null; personality: number | null; personalYear: number; notes: string[]; version: string }; note: string }>('numerology/me') });
  return (
    <QueryState q={q}>{({ numerology: n, note }) => (
      <Card>
        <Notice tone="info" className="mb-4">{note}</Notice>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[['Life path', n.lifePath], ['Birthday', n.birthday], ['Personal year', n.personalYear], ['Expression', n.expression], ['Soul urge', n.soulUrge], ['Personality', n.personality]].map(([k, v]) => (
            <div key={k as string} className="rounded-[var(--radius-md)] border border-line p-4"><dt className="eyebrow">{k}</dt><dd className="font-display text-4xl text-fg">{v ?? '—'}</dd></div>
          ))}
        </dl>
        <ul className="mt-4 space-y-1 text-xs text-fg-3">{n.notes.map((x) => <li key={x}>{x}</li>)}<li>Method: Pythagorean ({n.version}); master numbers 11, 22, 33 are kept.</li></ul>
      </Card>
    )}</QueryState>
  );
}

function Snapshots({ configKey }: { configKey: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [labelText, setLabelText] = useState('');
  const q = useQuery({ queryKey: ['snapshots'], queryFn: () => get<{ snapshots: { id: string; label: string; system: string; configKey: string; engineVersion: string; contentVersion: string; createdAt: string }[] }>('charts/snapshots') });
  const create = useMutation({ mutationFn: () => post('charts/snapshots', { configKey, label: labelText || `Snapshot ${new Date().toLocaleDateString()}` }), onSuccess: () => { setLabelText(''); qc.invalidateQueries({ queryKey: ['snapshots'] }); toast('Snapshot saved', 'success'); } });
  const remove = useMutation({ mutationFn: (id: string) => del(`charts/snapshots/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['snapshots'] }) });
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="font-display text-2xl">Save a snapshot</h2>
        <p className="mt-1 text-sm text-fg-2">A snapshot preserves this exact calculation — engine version, convention and results — even if you later edit your birth details.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Field label="Label" className="flex-1">{(id) => <Input id={id} value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="Before rectifying my birth time" />}</Field><Button className="sm:self-end" loading={create.isPending} onClick={() => create.mutate()}>Save snapshot</Button></div>
      </Card>
      <QueryState q={q} empty={(d) => (!d.snapshots.length ? <EmptyState icon="bookmark" title="No snapshots yet" /> : null)}>{(d) => (
        <ul className="space-y-2">{d.snapshots.map((s) => <li key={s.id} className="card flex items-center justify-between gap-3 p-4"><div><p className="text-fg">{s.label}</p><p className="text-xs text-fg-3">{CONFIG_LABELS[s.configKey] ?? s.configKey} · engine {s.engineVersion} · content {s.contentVersion} · {new Date(s.createdAt).toLocaleString()}</p></div><Button size="sm" variant="ghost" icon="trash" aria-label={`Delete ${s.label}`} onClick={() => remove.mutate(s.id)} /></li>)}</ul>
      )}</QueryState>
    </div>
  );
}
