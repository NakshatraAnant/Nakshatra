import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { civilDate, time, todayIso } from '../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Select, cx } from '../components/ui/primitives';
import { QueryState, Notice } from '../components/ui/feedback';
import { Tabs } from '../components/ui/overlays';
import { PlaceSearch, type Place } from '../components/PlaceSearch';
import { MoonGlyph } from './today';
import type { PanchangResult } from '../../astro/vedic/panchang';

interface Day { date: string; tithi: { name: string; paksha: string; number: number }; nakshatra: { name: string }; moon: { phaseAngle: number; phaseName: string }; vara: string }
interface Festival { key: string; name: string; date: string; kind: string; rule: string; description: string }

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: 'month' | 'festivals' | 'muhurat' = tabParam === 'festivals' || tabParam === 'muhurat' ? tabParam : 'month';
  const setTab = (t: string) => setParams(t === 'month' ? {} : { tab: t }, { replace: true });
  const [place, setPlace] = useState<Place | null>(null);
  const loc = place ? `&lat=${place.latitude}&lon=${place.longitude}&tz=${encodeURIComponent(place.timezone)}` : '';
  return (
    <div>
      <PageHeader kicker="Panchang" title="Calendar" subtitle="Tithi, nakshatra, festivals and muhurat for your location — each with the convention used."
        actions={<div className="w-72"><PlaceSearch value={place} onChange={setPlace} label="Location" placeholder="Your saved location" /></div>} />
      <Tabs tabs={[{ value: 'month', label: 'Month' }, { value: 'festivals', label: 'Festivals' }, { value: 'muhurat', label: 'Muhurat finder' }]} value={tab} onChange={setTab} className="mb-6" />
      {tab === 'month' && <MonthView loc={loc} />}
      {tab === 'festivals' && <FestivalsView loc={loc} />}
      {tab === 'muhurat' && <MuhuratView loc={loc} />}
    </div>
  );
}

function MonthView({ loc }: { loc: string }) {
  const { dateLocale } = useI18n();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [selected, setSelected] = useState(todayIso());
  const q = useQuery({ queryKey: ['month', month, loc], queryFn: () => get<{ location: { placeName: string; timezone: string }; days: Day[]; festivals: Festival[] }>(`calendar/month?month=${month}${loc}`) });
  const day = useQuery({ queryKey: ['panchang', selected, loc], queryFn: () => get<{ location: { timezone: string }; panchang: PanchangResult }>(`panchang?date=${selected}${loc}`) });
  const shift = (n: number) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(dateLocale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + i)))), [dateLocale]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => shift(-1)} aria-label="Previous month" />
          <h2 className="font-display text-2xl">{civilDate(`${month}-01`, dateLocale, { month: 'long', year: 'numeric' })}</h2>
          <Button variant="ghost" size="sm" icon="chevronRight" onClick={() => shift(1)} aria-label="Next month" />
        </div>
        <QueryState q={q}>{(d) => {
          const first = new Date(`${month}-01T00:00:00Z`).getUTCDay();
          return (
            <div role="group" aria-label="Month calendar">
              <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center eyebrow">{weekdays.map((w) => <div key={w}>{w}</div>)}</div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {Array.from({ length: first }).map((_, i) => <div key={`pad${i}`} />)}
                {d.days.map((x) => {
                  const fest = d.festivals.filter((f) => f.date === x.date && f.kind !== 'recurring');
                  const special = x.tithi.name === 'Purnima' || x.tithi.name === 'Amavasya' || x.tithi.name === 'Ekadashi';
                  return (
                    <button key={x.date} type="button" aria-pressed={selected === x.date} onClick={() => setSelected(x.date)}
                      className={cx('flex min-h-[78px] flex-col items-start rounded-[var(--radius-sm)] border p-1.5 text-left transition-colors', selected === x.date ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong', x.date === todayIso() && 'ring-1 ring-accent/50')}
                    >
                      {/* Visible text stays part of the accessible name; screen readers also hear the full date, paksha and nakshatra. */}
                      <span className="sr-only">{civilDate(x.date, dateLocale)}, {x.tithi.paksha}, {x.nakshatra.name}{fest.length > 1 ? `, ${fest.slice(1).map((f) => f.name).join(', ')}` : ''}: </span>
                      <div className="flex w-full items-center justify-between"><span className="text-sm text-fg numeric">{Number(x.date.slice(8))}</span><MoonGlyph angle={x.moon.phaseAngle} size={16} /></div>
                      <span className={cx('mt-0.5 text-[10px] leading-tight', special ? 'text-accent' : 'text-fg-3')}>{x.tithi.name}</span>
                      {fest.slice(0, 1).map((f) => <span key={f.key} className="mt-auto line-clamp-2 text-[10px] leading-tight text-violet">{f.name}</span>)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-fg-3">Tithi shown is the one prevailing at local sunrise in {d.location.placeName}.</p>
            </div>
          );
        }}</QueryState>
      </Card>
      <QueryState q={day}>{({ panchang: p, location }) => <PanchangDetail p={p} tz={location.timezone} />}</QueryState>
    </div>
  );
}

export function PanchangDetail({ p, tz }: { p: PanchangResult; tz: string }) {
  const { dateLocale } = useI18n();
  const rows: [string, string][] = [
    ['Vara', p.vara.name], ['Tithi', `${p.tithi.paksha === 'shukla' ? 'Shukla' : 'Krishna'} ${p.tithi.name}${p.tithi.endsAt ? ` · until ${time(p.tithi.endsAt, dateLocale, tz)}` : ''}`],
    ['Nakshatra', `${p.nakshatra.name} pada ${p.nakshatra.pada}${p.nakshatra.endsAt ? ` · until ${time(p.nakshatra.endsAt, dateLocale, tz)}` : ''}`],
    ['Yoga', `${p.yoga.name}${p.yoga.endsAt ? ` · until ${time(p.yoga.endsAt, dateLocale, tz)}` : ''}`], ['Karana', p.karana.name],
    ['Lunar month', `${p.lunarMonth.amanta} (amanta) · ${p.lunarMonth.purnimanta} (purnimanta)${p.lunarMonth.adhika ? ' · Adhika' : ''}`],
    ['Samvat', `Vikram ${p.vikramSamvat} · Shaka ${p.shakaSamvat}`],
    ['Sunrise / sunset', `${p.sunrise ? time(p.sunrise, dateLocale, tz) : '—'} / ${p.sunset ? time(p.sunset, dateLocale, tz) : '—'}`],
    ['Moonrise / moonset', `${p.moonrise ? time(p.moonrise, dateLocale, tz) : '—'} / ${p.moonset ? time(p.moonset, dateLocale, tz) : '—'}`],
    ['Moon', `${p.moon.phaseName}, ${Math.round(p.moon.illumination * 100)}% lit`],
  ];
  return (
    <Card>
      <div className="flex items-start justify-between"><div><p className="eyebrow">Panchang</p><h2 className="font-display text-3xl">{civilDate(p.date, dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div><MoonGlyph angle={p.moon.phaseAngle} /></div>
      <dl className="mt-4 divide-y divide-[var(--line)] text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-fg-3">{k}</dt><dd className="text-right text-fg">{v}</dd></div>)}</dl>
      <h3 className="mt-5 font-display text-2xl">Time windows</h3>
      <ul className="mt-2 space-y-1.5 text-sm">{p.windows.map((w) => <li key={w.name}><div className="flex justify-between"><span className="text-fg-2">{w.name}</span><span className="text-fg numeric">{time(w.start, dateLocale, tz)}–{time(w.end, dateLocale, tz)}</span></div>{w.note && <p className="text-xs text-fg-3">{w.note}</p>}</li>)}</ul>
      {p.warnings.map((w) => <Notice key={w} tone="warning" className="mt-3">{w}</Notice>)}
      <p className="mt-4 text-xs text-fg-3">Convention {p.version}: elements at local sunrise (udaya), amanta months named by the Sun’s sidereal sign at the new moon, Lahiri ayanamsa.</p>
    </Card>
  );
}

function FestivalsView({ loc }: { loc: string }) {
  const { dateLocale } = useI18n();
  const [year, setYear] = useState(new Date().getFullYear());
  const [kind, setKind] = useState('lunar');
  const q = useQuery({ queryKey: ['festivals', year, loc], queryFn: () => get<{ location: { placeName: string }; festivals: Festival[]; disclaimer: string }>(`calendar/festivals?year=${year}${loc}`) });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Year">{(id) => <Input id={id} type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />}</Field>
        <Field label="Show">{(id) => <Select id={id} value={kind} onChange={(e) => setKind(e.target.value)}><option value="lunar">Festivals</option><option value="solar">Sankrantis</option><option value="recurring">Ekadashi, Purnima, Amavasya</option><option value="all">Everything</option></Select>}</Field>
        <a href={`/api/v1/calendar/export.ics?year=${year}${loc}`} className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 px-4 text-sm font-semibold text-fg hover:bg-surface-3" download>Export to calendar (.ics)</a>
      </div>
      <QueryState q={q}>{(d) => (
        <>
          <Notice tone="info" className="mb-4">{d.disclaimer} Location: {d.location.placeName}.</Notice>
          <ul className="grid gap-3 md:grid-cols-2">
            {d.festivals.filter((f) => kind === 'all' || f.kind === kind).map((f) => (
              <li key={f.key + f.date} className="card p-4">
                <div className="flex items-start justify-between gap-3"><h3 className="font-display text-2xl">{f.name}</h3><time className="whitespace-nowrap text-sm text-accent numeric">{civilDate(f.date, dateLocale, { day: 'numeric', month: 'short', weekday: 'short' })}</time></div>
                <p className="mt-1 text-sm text-fg-2">{f.description}</p>
                <p className="mt-1 text-xs text-fg-3">Rule: {f.rule}</p>
              </li>
            ))}
          </ul>
        </>
      )}</QueryState>
    </div>
  );
}

function MuhuratView({ loc }: { loc: string }) {
  const { dateLocale } = useI18n();
  const [purpose, setPurpose] = useState('marriage');
  const [from, setFrom] = useState(todayIso());
  const [days, setDays] = useState(30);
  const [run, setRun] = useState(0);
  const [onlyPassing, setOnlyPassing] = useState(true);
  const q = useQuery({ queryKey: ['muhurat', purpose, from, days, loc, run], queryFn: () => get<{ location: { timezone: string; placeName: string }; result: { label: string; candidates: { date: string; passed: boolean; checks: { rule: string; passed: boolean; detail: string }[]; goodWindows: { start: string; end: string; label: string }[] }[]; notEvaluated: string[]; disclaimer: string } }>(`muhurat?purpose=${purpose}&from=${from}&days=${days}${loc}`), enabled: run > 0 });
  return (
    <div>
      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Purpose">{(id) => <Select id={id} value={purpose} onChange={(e) => setPurpose(e.target.value)}><option value="marriage">Marriage (Vivaha)</option><option value="griha_pravesh">House warming</option><option value="new_venture">New venture</option><option value="general">General</option></Select>}</Field>
          <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Days to search">{(id) => <Input id={id} type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} />}</Field>
          <Button className="self-end" onClick={() => setRun((x) => x + 1)} loading={q.isFetching}>Find muhurats</Button>
        </div>
      </Card>
      {run === 0 ? <Notice tone="info">Muhurat discovery checks each day against a transparent rule set. Every rule and result is shown so you can review it with a practitioner.</Notice> : (
        <QueryState q={q}>{({ result: r, location }) => (
          <>
            <Notice tone="warning" className="mb-4">{r.disclaimer} Not evaluated: {r.notEvaluated.join('; ')}.</Notice>
            <label className="mb-3 flex items-center gap-2 text-sm text-fg-2"><input type="checkbox" checked={onlyPassing} onChange={(e) => setOnlyPassing(e.target.checked)} className="accent-[var(--accent)]" />Show only days that pass every rule</label>
            <ul className="space-y-3">
              {r.candidates.filter((c) => !onlyPassing || c.passed).map((c) => (
                <li key={c.date} className={cx('card p-4', c.passed && 'border-success/40')}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-2xl">{civilDate(c.date, dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><Badge tone={c.passed ? 'success' : 'neutral'}>{c.passed ? 'Passes all rules' : `${c.checks.filter((x) => !x.passed).length} rule(s) not met`}</Badge></div>
                  <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{c.checks.map((x) => <li key={x.rule} className={x.passed ? 'text-fg-2' : 'text-danger'}>{x.passed ? '✓' : '✗'} {x.rule} — {x.detail}</li>)}</ul>
                  {c.goodWindows.map((w) => <p key={w.label} className="mt-2 text-sm text-fg">{w.label}: {time(w.start, dateLocale, location.timezone)}–{time(w.end, dateLocale, location.timezone)}</p>)}
                </li>
              ))}
            </ul>
          </>
        )}</QueryState>
      )}
    </div>
  );
}
