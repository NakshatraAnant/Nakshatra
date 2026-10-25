import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { civilDate, todayIso } from '../lib/format';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState } from '../components/ui/feedback';
import { Dialog, Segmented, Tabs, useToast } from '../components/ui/overlays';
import { Constellation, StatTile, TimelineItem } from '../components/ui/data';
import { Art, LevelBadge, PointsGlyph } from '../components/visual';
import { achievementArt, cardStyleFrame } from '../lib/visual';
import { ACHIEVEMENTS, type AchievementDef } from '../../shared/gamification';

const JourneyPath3D = lazy(() => import('../three/scenes').then((m) => ({ default: m.JourneyPath3D })));

interface TimelineResp {
  personal: { id: string; kind: string; title: string; body: string; eventDate: string; mood: string | null; tags: string[] }[];
  calculated: { date: string; kind: string; title: string; detail: string }[];
  note: string;
}

function rangeFor(span: 'year' | 'three' | 'decade'): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  if (span === 'year') return [`${y}-01-01`, `${y}-12-31`];
  if (span === 'three') return [`${y - 1}-01-01`, `${y + 1}-12-31`];
  return [`${y - 5}-01-01`, `${y + 5}-12-31`];
}

export function JourneyPage() {
  const { dateLocale } = useI18n();
  const [span, setSpan] = useState<'year' | 'three' | 'decade'>('year');
  const [from, to] = rangeFor(span);
  const [view, setView] = useState<'3d' | 'list'>('3d');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['timeline', from, to], queryFn: () => get<TimelineResp>(`timeline?from=${from}&to=${to}`) });
  const remove = useMutation({ mutationFn: (id: string) => del(`timeline/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['timeline'] }) });
  const markers = useMemo(() => q.data ? [
    ...q.data.personal.map((p) => ({ id: p.id, date: p.eventDate, title: p.title, calculated: false })),
    ...q.data.calculated.map((c, i) => ({ id: `calc-${i}`, date: c.date, title: c.title, calculated: true })),
  ] : [], [q.data]);
  const sel = markers.find((m) => m.id === selected);
  const selDetail = sel ? (sel.calculated ? q.data?.calculated[Number(sel.id.slice(5))] : q.data?.personal.find((p) => p.id === sel.id)) : null;
  return (
    <div>
      <PageHeader kicker="Cosmic Journey" title="Your path through time" subtitle="Your milestones and reflections alongside calculated calendar landmarks — kept clearly apart, never implying one caused the other."
        actions={<>
          <Segmented label="Range" value={span} onChange={setSpan} options={[{ value: 'year', label: 'This year' }, { value: 'three', label: '3 years' }, { value: 'decade', label: 'Decade' }]} />
          <Segmented label="View" value={view} onChange={setView} options={[{ value: '3d', label: '3D' }, { value: 'list', label: 'List' }]} />
          <Button icon="plus" onClick={() => setAdding(true)}>Add entry</Button>
        </>} />
      <div className="mb-6 flex flex-wrap gap-3">
        <ButtonLink to="/journey/rewards" variant="secondary" size="sm" icon="rewards">Rewards & challenges</ButtonLink>
        <ButtonLink to="/journey/wrapped" variant="secondary" size="sm" icon="sparkle">Recaps & Cosmic Wrapped</ButtonLink>
        <a href="/api/v1/timeline/export" download className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-fg-2 hover:bg-surface-2">Export summary (.md)</a>
      </div>
      <QueryState q={q}>{(d) => (
        <>
          {view === '3d' && (
            <div className="relative mb-6 h-[420px] overflow-hidden rounded-[var(--radius-xl)] border border-line bg-canvas-deep">
              <Suspense fallback={null}><JourneyPath3D markers={markers} from={from} to={to} selected={selected} onSelect={setSelected} fallback={<ListView d={d} onDelete={(id) => remove.mutate(id)} />} /></Suspense>
              {sel && selDetail && (
                <div className="absolute right-4 top-4 max-w-xs card p-4 rise-in" aria-live="polite">
                  <Badge tone={sel.calculated ? 'celestial' : 'accent'}>{sel.calculated ? 'Calculated' : 'Your entry'}</Badge>
                  <p className="mt-2 font-display text-2xl">{sel.title}</p>
                  <p className="text-xs text-fg-3 numeric">{civilDate(sel.date, dateLocale)}</p>
                  <p className="mt-2 text-sm text-fg-2">{'detail' in selDetail ? selDetail.detail : selDetail.body}</p>
                </div>
              )}
              <p className="absolute bottom-3 left-4 text-[11px] text-fg-3">Gold spheres: your entries · Blue octahedra: calculated events · Drag to orbit, scroll to zoom.</p>
            </div>
          )}
          <Notice tone="info" className="mb-4">{d.note}</Notice>
          <ListView d={d} onDelete={(id) => remove.mutate(id)} />
        </>
      )}</QueryState>
      <SavedInsights />
      <EntryDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ListView({ d, onDelete }: { d: TimelineResp; onDelete: (id: string) => void }) {
  const { dateLocale } = useI18n();
  const all = [
    ...d.personal.map((p) => ({ date: p.eventDate, node: <TimelineItem key={p.id} date={civilDate(p.eventDate, dateLocale)} kind={p.kind + (p.mood ? ` · ${p.mood}` : '')} title={p.title} body={p.body} actions={<Button size="sm" variant="ghost" icon="trash" onClick={() => onDelete(p.id)}>Delete</Button>} /> })),
    ...d.calculated.map((c, i) => ({ date: c.date, node: <TimelineItem key={`c${i}`} date={civilDate(c.date, dateLocale)} kind={c.kind} calculated title={c.title} body={c.detail} /> })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (!all.length) return <EmptyState icon="journey" title="Your journey starts here" body="Add a milestone or reflection — or complete today’s ritual — to begin." />;
  return <ol className="space-y-6 border-l border-line pl-2">{all.map((x) => x.node)}</ol>;
}

function EntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({ kind: 'milestone', title: '', body: '', eventDate: todayIso(), mood: '' });
  const m = useMutation({ mutationFn: () => post('timeline', { ...v, mood: v.mood || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['timeline'] }); toast('Added to your journey', 'success'); onClose(); setV({ ...v, title: '', body: '' }); } });
  return (
    <Dialog open={open} onClose={onClose} title="Add to your journey" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!v.title.trim()} loading={m.isPending} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="milestone">Milestone</option><option value="reflection">Reflection</option><option value="intention">Intention</option><option value="annotation">Chart annotation</option></Select>}</Field>
        <Field label="Date">{(id) => <Input id={id} type="date" value={v.eventDate} onChange={(e) => setV({ ...v, eventDate: e.target.value })} />}</Field>
        <Field label="Title" className="sm:col-span-2">{(id) => <Input id={id} value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Notes (private)" className="sm:col-span-2">{(id) => <Textarea id={id} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />}</Field>
        <Field label="Mood (optional)">{(id) => <Input id={id} value={v.mood} maxLength={20} onChange={(e) => setV({ ...v, mood: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

interface JourneyResp {
  xp: number; level: { level: number; current: number; next: number; rank: string };
  achievements: (AchievementDef & { awardedAt: string | null })[];
  history: { id: string; amount: number; label: string; createdAt: string }[];
  challenges: { key: string; title: string; description: string; target: number; progress: number; xp: number; active: boolean; upcoming: boolean; start: string; end: string; completedAt: string | null; period: string }[];
  collectibles: { key: string; kind: string; title: string; unlocked: boolean; source: string | null; unlock: { type: string } }[];
  principles: string[];
}

export function RewardsPage() {
  const { dateLocale } = useI18n();
  const q = useQuery({ queryKey: ['journey'], queryFn: () => get<JourneyResp>('journey') });
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'achievements' | 'challenges' | 'collection' | 'history'>('achievements');
  const qc = useQueryClient();
  const checkin = useMutation({ mutationFn: () => post<{ xpAwarded: number; totalDays: number }>('journey/checkin'), onSuccess: () => qc.invalidateQueries({ queryKey: ['journey'] }) });
  return (
    <div>
      <PageHeader kicker="Cosmic Journey" title="Rewards" subtitle="Progress earned from real actions — recorded on our servers, never lost on refresh, and never penalised for rest days." actions={<Button variant="secondary" loading={checkin.isPending} onClick={() => checkin.mutate()}>Optional daily check-in</Button>} />
      <QueryState q={q}>{(d) => {
        const sel = d.achievements.find((a) => a.key === selected) ?? d.achievements.find((a) => a.awardedAt) ?? d.achievements[0];
        const progress = (d.xp - d.level.current) / Math.max(1, d.level.next - d.level.current);
        return (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Card className="flex items-center gap-4">
                <LevelBadge level={d.level.level} rank={d.level.rank} size={72} />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">Level {d.level.level}</p>
                  <p className="font-display text-3xl">{d.level.rank}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-fg/10" role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-fg-3 numeric"><PointsGlyph size={12} />{d.xp} points · {d.level.next - d.xp} to next level</p>
                </div>
              </Card>
              <StatTile label="Achievements" value={`${d.achievements.filter((a) => a.awardedAt).length}/${d.achievements.length}`} icon="rewards" />
              <StatTile label="Challenges complete" value={d.challenges.filter((c) => c.completedAt).length} sub="this period" icon="star" />
            </div>
            {checkin.data && <Notice tone="success" className="mb-4">Checked in{checkin.data.xpAwarded ? ` (+${checkin.data.xpAwarded} XP)` : ' already today'} · {checkin.data.totalDays} days total — no streak to break.</Notice>}
            <Tabs tabs={[{ value: 'achievements', label: 'Achievements' }, { value: 'challenges', label: 'Challenges' }, { value: 'collection', label: 'Collection' }, { value: 'history', label: 'XP history' }]} value={tab} onChange={setTab} className="mb-6" />
            {tab === 'achievements' && (
              <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
                <Card className="flex flex-col items-center">
                  <div className="relative flex h-64 w-full items-center justify-center">
                    {/* Recently earned: the ring burst plays once behind the medallion (motion-guidelines.md). */}
                    {sel.awardedAt && Date.now() - Date.parse(sel.awardedAt) < 60000 && <Art key={`burst-${sel.key}`} src="/visual/rewards/celebration-ring-burst.svg" eager className="result-pop absolute h-60 w-60" />}
                    <Medallion achievementKey={sel.key} points={sel.constellation} earned={Boolean(sel.awardedAt)} size={160} />
                  </div>
                  <p className="font-display text-2xl">{sel.title}</p>
                  <p className="mt-1 text-center text-sm text-fg-2">{sel.description}</p>
                  <p className="mt-2 text-xs text-fg-3">{sel.awardedAt ? `Earned ${civilDate(sel.awardedAt.slice(0, 10), dateLocale)}` : 'Not yet earned'} · {sel.family}</p>
                </Card>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {d.achievements.map((a) => (
                    <li key={a.key}><button type="button" aria-pressed={sel.key === a.key} onClick={() => setSelected(a.key)} className={cx('card flex w-full flex-col items-center p-3 text-center transition-colors', sel.key === a.key && 'border-accent')}>
                      <Medallion achievementKey={a.key} points={a.constellation} earned={Boolean(a.awardedAt)} size={64} />
                      <span className="mt-1 text-sm text-fg">{a.title}</span>
                      <span className="eyebrow">{a.family}</span>
                      <span className="sr-only">{a.awardedAt ? 'Earned' : 'Locked'}</span>
                    </button></li>
                  ))}
                </ul>
              </div>
            )}
            {tab === 'challenges' && (
              <ul className="grid gap-4 md:grid-cols-2">
                {d.challenges.map((c) => (
                  <li key={c.key + c.period} className="card p-5">
                    <div className="flex items-start justify-between gap-3"><h3 className="font-display text-2xl">{c.title}</h3>{c.completedAt ? <Badge tone="success">Complete</Badge> : c.upcoming ? <Badge tone="violet">Starts {civilDate(c.start, dateLocale, { day: 'numeric', month: 'short' })}</Badge> : <Badge tone="accent">+{c.xp} XP</Badge>}</div>
                    <p className="mt-1 text-sm text-fg-2">{c.description}</p>
                    <div className="mt-3 h-2 rounded-full bg-surface-3" role="progressbar" aria-valuenow={c.progress} aria-valuemax={c.target} aria-label={c.title}><div className="h-full rounded-full bg-accent" style={{ width: `${(c.progress / c.target) * 100}%` }} /></div>
                    <p className="mt-1 text-xs text-fg-3 numeric">{c.progress}/{c.target} · {civilDate(c.start, dateLocale, { day: 'numeric', month: 'short' })} – {civilDate(c.end, dateLocale, { day: 'numeric', month: 'short' })}</p>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'collection' && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {d.collectibles.map((c) => (
                  <li key={c.key} className={cx('card p-4', !c.unlocked && 'opacity-55')}>
                    {c.kind === 'card' && <span className="relative mb-2 block aspect-[5/7] w-16 overflow-hidden rounded-md"><Art src={cardStyleFrame(c.key.replace(/^card_/, ''))} className="absolute inset-0 h-full w-full object-cover" /></span>}
                    <p className="eyebrow flex items-center gap-1">{(c.unlock.type === 'purchase' || c.unlock.type === 'subscription') && <Art src="/visual/offers/premium-badge.svg" width={14} height={14} alt="Premium" />}{c.kind}</p>
                    <p className="font-display text-2xl">{c.title}</p>
                    <p className="mt-1 text-xs text-fg-3">{c.unlocked ? (c.source === 'subscription' ? 'Included with Nakshatra+ (paid)' : c.source === 'purchased' ? 'Purchased (cosmetic)' : 'Earned') : c.unlock.type === 'subscription' ? 'Nakshatra+ benefit (paid)' : c.unlock.type === 'purchase' ? 'Paid cosmetic pack' : c.unlock.type === 'level' ? 'Unlocks with level' : 'Unlocks with an achievement'}</p>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'history' && (
              <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-line">
                {d.history.map((h) => <li key={h.id} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-fg-2">{h.label}</span><span className="text-fg numeric">+{h.amount} · {new Date(h.createdAt).toLocaleDateString()}</span></li>)}
                {!d.history.length && <li className="p-4 text-sm text-fg-3">No XP yet.</li>}
              </ul>
            )}
            <ul className="mt-8 space-y-1 text-xs text-fg-3">{d.principles.map((p) => <li key={p}>✦ {p}</li>)}</ul>
          </>
        );
      }}</QueryState>
    </div>
  );
}

function Medallion({ achievementKey, points, earned, size }: { achievementKey: string; points: number[][]; earned: boolean; size: number }) {
  const art = achievementArt(achievementKey);
  const fallback = <Constellation points={points} size={size} lit={earned} />;
  if (!art) return fallback;
  return <Art src={art} width={size} height={size} className={cx(!earned && 'locked-art')} fallback={fallback} />;
}

interface Recap { period: string; start: string; end: string; stats: { xp: number; rituals: number; reflections: number; insightsSaved: number; bondsCreated: number; lessons: number; achievements: string[]; topMoods: { mood: string; n: number }[]; festivalsInYear: number | null }; highlights: string[]; note: string }

export function WrappedPage() {
  const { dateLocale } = useI18n();
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('year');
  const q = useQuery({ queryKey: ['recap', period], queryFn: () => get<Recap>(`recap?period=${period}`) });
  return (
    <div>
      <PageHeader kicker={period === 'year' ? 'Cosmic Wrapped' : 'Recap'} title={period === 'year' ? `Your ${new Date().getFullYear()} in stars` : `Your ${period}`} actions={<Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />} />
      <QueryState q={q}>{(r) => (
        <div className="space-y-6">
          <Card className="overflow-hidden bg-[linear-gradient(135deg,rgb(141_123_216/0.25),rgb(217_178_111/0.12))] p-8">
            <p className="eyebrow">{civilDate(r.start, dateLocale)} – {civilDate(r.end, dateLocale)}</p>
            <p className="mt-3 font-display text-5xl">{r.stats.xp} XP of real moments</p>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[['Rituals', r.stats.rituals], ['Reflections', r.stats.reflections], ['Insights saved', r.stats.insightsSaved], ['Bonds created', r.stats.bondsCreated], ['Lessons', r.stats.lessons], ['Achievements', r.stats.achievements.length]].map(([k, v]) => <div key={k as string}><p className="font-display text-4xl numeric">{v}</p><p className="text-xs uppercase tracking-[0.14em] text-fg-3">{k}</p></div>)}
            </div>
            {r.stats.topMoods.length > 0 && <p className="mt-6 text-fg-2">Most recorded moods: {r.stats.topMoods.map((m) => `${m.mood} (${m.n})`).join(', ')}.</p>}
            {r.highlights.map((h) => <p key={h} className="mt-2 text-fg-2">✦ {h}</p>)}
            {r.stats.festivalsInYear !== null && <p className="mt-2 text-fg-2">✦ {r.stats.festivalsInYear} festivals were calculated for your location this year.</p>}
          </Card>
          {r.stats.achievements.length > 0 && (
            <div className="flex flex-wrap gap-3">{r.stats.achievements.map((k) => { const a = ACHIEVEMENTS.find((x) => x.key === k); return a ? <div key={k} className="card flex items-center gap-2 px-3 py-2"><Constellation points={a.constellation} size={32} /><span className="text-sm">{a.title}</span></div> : null; })}</div>
          )}
          <p className="text-xs text-fg-3">{r.note}</p>
          <Link to="/cosmic-id" className="text-sm text-accent hover:underline">Share your Cosmic ID card →</Link>
        </div>
      )}</QueryState>
    </div>
  );
}

interface SavedInsight { id: string; ruleKey: string; ruleVersion: number; title: string; body: string; factor: string; note: string; createdAt: string }

function SavedInsights() {
  const q = useQuery({ queryKey: ['insights'], queryFn: () => get<{ insights: SavedInsight[] }>('insights') });
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const stopEditing = (id: string) => setEditing((e) => { const n = { ...e }; delete n[id]; return n; });
  const saveNote = useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => patch(`insights/${id}`, { note }), onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: ['insights'] }); stopEditing(v.id); toast('Note saved', 'success'); } });
  const remove = useMutation({ mutationFn: (id: string) => del(`insights/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }) });
  return (
    <section aria-labelledby="saved-insights" className="mt-10">
      <h2 id="saved-insights" className="mb-3 font-display text-3xl">Saved insights</h2>
      <QueryState q={q}>{(d) => d.insights.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {d.insights.map((i) => (
            <li key={i.id} className="card p-5">
              <p className="eyebrow">{i.factor}</p>
              <h3 className="mt-1 font-display text-2xl">{i.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">{i.body}</p>
              <p className="mt-2 text-xs text-fg-3">Content v{i.ruleVersion} · saved {civilDate(i.createdAt.slice(0, 10))}</p>
              {editing[i.id] !== undefined ? (
                <div className="mt-3 space-y-2">
                  <Textarea aria-label={`Note for ${i.title}`} rows={2} value={editing[i.id]} onChange={(e) => setEditing({ ...editing, [i.id]: e.target.value })} />
                  <div className="flex gap-2"><Button size="sm" loading={saveNote.isPending} onClick={() => saveNote.mutate({ id: i.id, note: editing[i.id] })}>Save note</Button><Button size="sm" variant="ghost" onClick={() => stopEditing(i.id)}>Cancel</Button></div>
                </div>
              ) : (
                <>
                  {i.note && <p className="mt-3 border-l-2 border-accent/40 pl-3 text-sm text-fg-2">{i.note}</p>}
                  <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setEditing({ ...editing, [i.id]: i.note })}>{i.note ? 'Edit note' : 'Add note'}</Button><Button size="sm" variant="ghost" onClick={() => remove.mutate(i.id)} aria-label={`Remove ${i.title}`}>Remove</Button></div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="bookmark" title="No saved insights yet" body="Use “Save insight” on your Cosmic ID or in the chart explorer to keep interpretations here." action={<ButtonLink to="/cosmic-id" variant="secondary">Open Cosmic ID</ButtonLink>} />}</QueryState>
    </section>
  );
}
