import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { useMe } from '../lib/session';
import { Badge, Button, ButtonLink, Card, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { ArchetypeArt, Art, LevelBadge, PointsGlyph } from '../components/visual';
import { CircleEmblem, CreateCircleDialog } from './circles';
import { SessionList } from './play';
import { Composer } from './thoughts';
import type { Persona } from '../lib/persona';
import { VibeCheckIn, type Progress } from './progress';
import { ProgressBar } from '../components/motion';
import { HomeWorld } from '../components/IdentityWorld';

interface Prompt { id: string; text: string; options: { id: string; label: string }[] | null }
interface PersonalRitual { key: string; title: string; description: string; response: 'choice' | 'text' | 'done'; maxLength?: number; visibility: string; prompt: Prompt; myResponse: Record<string, unknown> | null; results: { a: number; b: number; total: number } | null }
interface CircleRitual { key: string; title: string; circle: { id: string; name: string; theme: string }; prompt: Prompt; myResponse: Record<string, unknown> | null; answeredCount: number; answers: { name: string; text: string; mine: boolean }[] | null }
interface RitualsResp { personal: PersonalRitual[]; circle: CircleRitual[]; note: string }

function useRituals() {
  return useQuery({ queryKey: ['rituals'], queryFn: () => get<RitualsResp>('social-rituals') });
}

function useRespond() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: Record<string, unknown> }) => post<{ pointsAwarded: number }>(`social-rituals/${key}/respond`, body),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['rituals'] }); if (r.pointsAwarded) toast(`+${r.pointsAwarded} points`, 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });
}

const RITUAL_ART: Record<string, string> = { daily_choice: 'ritual-check-in', daily_thought: 'ritual-reflection', micro_challenge: 'ritual-morning', weekly_reflection: 'ritual-night', circle_question: 'ritual-check-in' };
function RitualArt({ k }: { k: string }) {
  return <Art src={`/visual/circles/${RITUAL_ART[k] ?? 'ritual-check-in'}.svg`} width={96} height={72} className="float-right mb-2 ml-3 h-[72px] w-24 rounded-[var(--radius-sm)] border border-line object-cover" />;
}

function ChoiceRitual({ r }: { r: PersonalRitual }) {
  const respond = useRespond();
  const opts = r.prompt.options!;
  return (
    <Card>
      <RitualArt k={r.key} />
      <p className="eyebrow">{r.title}</p>
      <h3 className="mt-1 font-display text-2xl">{r.prompt.text}</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {opts.map((o) => {
          const picked = r.myResponse?.optionId === o.id;
          const pct = r.results && r.results.total ? Math.round(((o.id === 'a' ? r.results.a : r.results.b) / r.results.total) * 100) : null;
          return (
            <button key={o.id} type="button" disabled={Boolean(r.myResponse) || respond.isPending} onClick={() => respond.mutate({ key: r.key, body: { optionId: o.id } })}
              className={cx('relative min-h-12 overflow-hidden rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm', picked ? 'border-accent' : 'border-line hover:border-line-strong', r.myResponse && 'cursor-default')}>
              {pct !== null && <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pct}%` }} />}
              <span className="relative flex justify-between gap-2"><span>{o.label}</span>{pct !== null && <span className="numeric text-fg-3">{pct}%</span>}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-fg-3">{r.myResponse ? `${r.results?.total ?? 0} people answered today. ${r.visibility}` : r.visibility}</p>
    </Card>
  );
}

function TextRitual({ r }: { r: PersonalRitual }) {
  const respond = useRespond();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const done = r.myResponse;
  return (
    <Card>
      <RitualArt k={r.key} />
      <p className="eyebrow">{r.title}</p>
      <h3 className="mt-1 font-display text-2xl">{r.prompt.text}</h3>
      {done ? (
        <div className="mt-2 space-y-2">
          {r.response === 'done' ? <p className="text-sm text-fg-2">Done today{done.note ? ` — “${String(done.note)}”` : ''}. Nice.</p> : <p className="text-sm italic text-fg-2">“{String(done.text)}”</p>}
          {r.key === 'daily_thought' && !posting && <Button size="sm" variant="secondary" onClick={() => setPosting(true)}>Post it as a Thought Drop</Button>}
          {posting && <Composer prefill={String(done.text)} onPosted={() => setPosting(false)} />}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block"><span className="sr-only">{r.prompt.text}</span><Textarea rows={2} maxLength={r.maxLength} value={text} onChange={(e) => setText(e.target.value)} placeholder={r.response === 'done' ? 'Optional note' : 'A sentence is plenty'} /></label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-3">{r.visibility}</span>
            <Button size="sm" loading={respond.isPending} disabled={r.response !== 'done' && !text.trim()} onClick={() => respond.mutate({ key: r.key, body: r.response === 'done' ? { done: true, text } : { text } })}>{r.response === 'done' ? 'Mark done' : 'Save'}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Today's circle question. Answers unlock only after you answer. */
export function CircleQuestion({ circleId }: { circleId: string }) {
  const q = useRituals();
  const respond = useRespond();
  const [text, setText] = useState('');
  const r = q.data?.circle.find((c) => c.circle.id === circleId);
  if (!r) return null;
  return (
    <Card>
      <p className="eyebrow">Today’s circle question</p>
      <h3 className="mt-1 font-display text-2xl">{r.prompt.text}</h3>
      {r.answers ? (
        <ul className="mt-3 space-y-2">
          {r.answers.map((a, i) => <li key={i} className="text-sm"><span className="text-fg-3">{a.mine ? 'You' : a.name}:</span> <span className="text-fg">{a.text}</span></li>)}
        </ul>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-fg-3">{r.answeredCount} answered · answers unlock after you reply</p>
          <label className="block"><span className="sr-only">Your answer</span><Textarea rows={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <Button size="sm" loading={respond.isPending} disabled={!text.trim()} onClick={() => respond.mutate({ key: 'circle_question', body: { circleId, text } })}>Answer</Button>
        </div>
      )}
    </Card>
  );
}

export function TodayRituals() {
  const q = useRituals();
  return (
    <section aria-labelledby="rituals-title">
      <div className="flex items-baseline justify-between"><h2 id="rituals-title" className="font-display text-3xl">Today</h2><span className="text-xs text-fg-3">Skip any day — nothing resets.</span></div>
      <QueryState q={q}>{(d) => (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {d.personal.map((r) => (r.response === 'choice' ? <ChoiceRitual key={r.key} r={r} /> : <TextRitual key={r.key} r={r} />))}
        </div>
      )}</QueryState>
    </section>
  );
}

interface IdentityLite { persona: Persona | null; cardStyle: string }
interface Journey { xp: number; level: { level: number; current: number; next: number; rank: string } }

export function HomePage() {
  const me = useMe().data?.user;
  const id = useQuery({ queryKey: ['identity-me'], queryFn: () => get<IdentityLite>('identity/me') });
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: { id: string; name: string; theme: string; memberCount: number; liveGames: number }[] }>('circles') });
  const journey = useQuery({ queryKey: ['journey'], queryFn: () => get<Journey>('journey') });
  const rituals = useRituals();
  const [creating, setCreating] = useState(false);
  const p = id.data?.persona;
  const lv = journey.data?.level;
  const hour = new Date().getHours();
  return (
    <div className="space-y-10">
      <header className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="eyebrow">{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</p>
          <h1 className="mt-1 font-display text-5xl">{me?.profile?.displayName ?? 'Welcome'}</h1>
          {lv && journey.data!.xp > 0 && (
            <Link to="/journey/rewards" className="mt-3 inline-flex items-center gap-3 rounded-full border border-line py-1 pl-1 pr-4 text-sm text-fg-2 hover:border-line-strong">
              <LevelBadge level={lv.level} rank={lv.rank} size={36} />
              <span><span className="text-fg">{lv.rank}</span> · level {lv.level}</span>
              <span className="inline-flex items-center gap-1 font-semibold text-fg numeric"><PointsGlyph size={14} />{journey.data!.xp}</span>
            </Link>
          )}
        </div>
        {p ? (
          <Link to="/identity" className="card flex items-center gap-4 p-4 hover:border-line-strong">
            <div className="w-20"><ArchetypeArt archetypeKey={p.key} part="compact" size={80} scores={Object.fromEntries(p.dimensions.map((d) => [d.key, d.score]))} /></div>
            <div><p className="text-xs text-fg-3">Your archetype</p><p className="font-display text-2xl leading-tight">{p.name}</p></div>
          </Link>
        ) : id.data && (
          <Card className="max-w-sm"><p className="font-display text-2xl">Find your archetype</p><p className="mt-1 text-sm text-fg-2">Two minutes, no birth details.</p><ButtonLink to="/identity" size="sm" className="mt-3">Start</ButtonLink></Card>
        )}
      </header>

      <NextStep hasPersona={!!p} loaded={!!id.data && !!circles.data} circleCount={circles.data?.circles.length ?? 0} onStartCircle={() => setCreating(true)} />

      {p && <HomeWorld persona={p} />}

      <TodayRituals />
      {p && <HomeProgress />}

      <section aria-labelledby="home-circles">
        <div className="flex items-baseline justify-between"><h2 id="home-circles" className="font-display text-3xl">Your circles</h2><Link to="/circles" className="text-sm text-fg-2 hover:text-fg">All circles</Link></div>
        <QueryState q={circles} empty={(d) => d.circles.length ? null : (
          <div className="mt-4"><EmptyState icon="bonds" title="Bring your people" body="Circles are private spaces for friends you already have — a daily question, games and a feed only members can see." action={<Button onClick={() => setCreating(true)}>Start a circle</Button>} /></div>
        )}>{(d) => (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.circles.map((c) => {
              const cq = rituals.data?.circle.find((x) => x.circle.id === c.id);
              return (
                <li key={c.id}>
                  <Link to={`/circles/${c.id}`} className="card flex items-center gap-3 p-4 hover:border-line-strong">
                    <CircleEmblem theme={c.theme} name={c.name} id={c.id} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-display text-2xl">{c.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">{cq && !cq.myResponse && <Badge tone="accent">Question waiting</Badge>}{c.liveGames > 0 && <Badge tone="success">Game on</Badge>}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}</QueryState>
      </section>

      <SessionList />

      <CreateCircleDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/**
 * One clear next step, chosen from what the member has (and hasn't) done yet: archetype → reward waiting →
 * a circle → say something. Only one is shown so Home never becomes a to-do list.
 */
function NextStep({ hasPersona, loaded, circleCount, onStartCircle }: { hasPersona: boolean; loaded: boolean; circleCount: number; onStartCircle: () => void }) {
  const progress = useQuery({ queryKey: ['progress'], queryFn: () => get<Progress>('progress'), enabled: hasPersona });
  if (!loaded) return null;
  const ready = progress.data?.quests.filter((q) => q.claimable).length ?? 0;
  const step = !hasPersona
    ? { title: 'Find your archetype', body: 'Twenty quick statements, about two minutes. No birth details needed.', cta: <ButtonLink to="/identity">Start</ButtonLink> }
    : ready
      ? { title: `${ready} reward${ready === 1 ? '' : 's'} waiting`, body: 'You finished a quest. Claim it to add the XP.', cta: <ButtonLink to="/progress">Claim</ButtonLink> }
      : circleCount === 0
        ? { title: 'Bring your people', body: 'Start a private circle for friends you already have — a daily question, games and drops only members see.', cta: <Button onClick={onStartCircle}>Start a circle</Button> }
        : { title: 'Say something', body: 'Drop a thought, ask a question, post a poll, a photo or a voice note.', cta: <ButtonLink to="/create">Create</ButtonLink> };
  return (
    <section aria-labelledby="next-step" className="card flex flex-wrap items-center justify-between gap-4 border-accent/40 p-5">
      <div className="min-w-0">
        <p className="eyebrow">Next step</p>
        <h2 id="next-step" className="mt-1 font-display text-3xl">{step.title}</h2>
        <p className="mt-1 max-w-xl text-sm text-fg-2">{step.body}</p>
      </div>
      {step.cta}
    </section>
  );
}

interface ReferralResp { code: string; link: string; rules: string[]; history: { name: string; status: string; reason: string | null; points: number; joinedAt: string }[]; totals: { approved: number; pending: number; points: number } }

export function InvitePage() {
  const q = useQuery({ queryKey: ['referrals'], queryFn: () => get<ReferralResp>('referrals') });
  const toast = useToast();
  const share = async (link: string) => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && window.matchMedia?.('(pointer: coarse)').matches) { try { await nav.share({ title: 'Join me on Nakshatra', url: link }); return; } catch { /* fall back */ } }
    try { await navigator.clipboard.writeText(link); toast('Link copied', 'success'); } catch { toast('Copy the link from the box', 'info'); }
  };
  const label: Record<string, string> = { pending: 'Waiting for them to join in', approved: 'Approved', rejected: 'Not eligible', reversed: 'Reversed' };
  return (
    <div className="mx-auto max-w-2xl">
      <img src="/visual/onboarding/onb-invite-friend.svg" alt="" aria-hidden="true" width={640} height={480} className="mb-6 aspect-[16/7] w-full rounded-[var(--radius-xl)] border border-line bg-surface-2 object-cover" />
      <h1 className="font-display text-5xl">Invite friends</h1>
      <p className="mt-2 text-fg-2">Share your link wherever you already talk. We never read your contacts or message anyone for you.</p>
      <QueryState q={q}>{(d) => (
        <div className="mt-6 space-y-6">
          <Card className="space-y-3">
            <label className="block text-sm text-fg-2">Your link<input readOnly value={d.link} onFocus={(e) => e.currentTarget.select()} className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 text-sm text-fg" /></label>
            <Button onClick={() => void share(d.link)}>Copy / share link</Button>
            <ul className="space-y-1 text-xs text-fg-3">{d.rules.map((r) => <li key={r}>• {r}</li>)}</ul>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              {d.totals.approved > 0 && <img src="/visual/rewards/referral-success.svg" alt="" aria-hidden="true" width={64} height={64} loading="lazy" className="h-16 w-16 shrink-0" />}
              <h2 className="font-display text-2xl">History</h2>
            </div>
            <p className="text-sm text-fg-2">{d.totals.approved} approved · {d.totals.pending} pending · {d.totals.points} points earned</p>
            {d.history.length === 0 ? <p className="mt-3 text-sm text-fg-3">Nobody yet.</p> : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {d.history.map((h, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{h.name}</span><span className="text-fg-3">{label[h.status] ?? h.status}{h.points ? ` · +${h.points}` : ''}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
      )}</QueryState>
    </div>
  );
}

/** Vibe check-in, streak and the next claimable quest — one glance, no pressure. */
function HomeProgress() {
  const q = useQuery({ queryKey: ['progress'], queryFn: () => get<Progress>('progress') });
  if (!q.data) return null;
  const p = q.data;
  const ready = p.quests.filter((x) => x.claimable).length;
  const nextQuest = p.quests.find((x) => !x.complete && x.period === 'daily') ?? p.quests.find((x) => !x.complete);
  return (
    <section aria-labelledby="home-progress" className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <Card>
        <h2 id="home-progress" className="font-display text-2xl">How’s today?</h2>
        <VibeCheckIn today={p.vibe.today} />
      </Card>
      <Card className="space-y-2">
        <div className="flex items-baseline justify-between"><p className="text-sm text-fg-3">Streak</p><p className="font-display text-2xl numeric">{p.streak.current} {p.streak.current === 1 ? 'day' : 'days'}</p></div>
        {nextQuest && (<><p className="text-sm text-fg-2">Next: <span className="text-fg">{nextQuest.title}</span> · +{nextQuest.xp} XP</p><ProgressBar value={nextQuest.steps.reduce((t, st) => t + st.value, 0)} max={nextQuest.steps.reduce((t, st) => t + st.target, 0)} label={nextQuest.title} /></>)}
        <Link to="/progress" className="inline-flex text-sm text-accent underline underline-offset-2">{ready ? `${ready} reward${ready === 1 ? '' : 's'} ready to claim` : 'Quests, streaks and season'}</Link>
      </Card>
    </section>
  );
}
