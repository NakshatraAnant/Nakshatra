import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { Badge, Button, Card, PageHeader, cx } from '../components/ui/primitives';
import { QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { ProgressBar, useCelebrate } from '../components/motion';
import { levelBadge } from '../lib/visual';
import { AchievementGallery } from '../components/Worlds';
import { SeasonPath } from '../components/Arena';
import { SponsoredChallenges } from '../components/SponsoredExtras';
import { QuestConstellation } from '../components/IdentityWorld';

interface Step { metric: string; target: number; label: string; value: number }
interface Quest { key: string; period: 'daily' | 'weekly' | 'once' | 'season'; category: string; title: string; description: string; xp: number; steps: Step[]; complete: boolean; claimed: boolean; claimable: boolean; resetsAt: string | null }
interface Milestone { at: number; reward: { key: string; title: string }; reached: boolean; claimed: boolean; claimable: boolean }
interface Season { key: string; name: string; theme: string; startsOn: string; endsOn: string; status: string; points: number; milestones: Milestone[]; premiumTrack: { enabled: boolean; note: string } }
export interface Progress {
  xp: number; level: { level: number; current: number; next: number; rank: string };
  streak: { current: number; best: number; activeToday: boolean; graceUsed: number; graceDaysPerWeek: number; note: string };
  circleStreaks: { circleId: string; name: string; current: number; best: number; activeToday: boolean }[];
  vibe: { today: string | null; recent: { date: string; mood: string }[] };
  quests: Quest[]; current: string | null; seasons: Season[];
}

export const VIBE_WORDS = ['bright', 'calm', 'busy', 'tired', 'restless', 'tender', 'curious', 'low'] as const;

/** One-tap daily mood word. Private to you; only the fact you checked in reaches analytics. */
export function VibeCheckIn({ today, compact }: { today: string | null; compact?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (mood: string) => post('vibe', { mood }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['progress'] }); qc.invalidateQueries({ queryKey: ['identity-timeline'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });
  return (
    <div>
      {!compact && <p className="text-sm text-fg-2">{today ? <>Today: <span className="text-fg">{today}</span>. Change it any time today.</> : 'One word for how today feels. Only you see it.'}</p>}
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Pick today’s vibe">
        {VIBE_WORDS.map((v) => (
          <button key={v} type="button" aria-pressed={today === v} disabled={m.isPending} onClick={() => m.mutate(v)}
            className={cx('motion-press min-h-9 rounded-full border px-3 py-1.5 text-sm capitalize', today === v ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-2 hover:border-line-strong hover:text-fg')}>{v}</button>
        ))}
      </div>
    </div>
  );
}

function QuestCard({ q }: { q: Quest }) {
  const qc = useQueryClient();
  const toast = useToast();
  const celebrate = useCelebrate();
  const claim = useMutation({
    mutationFn: () => post<{ xp: number; total: number }>(`quests/${q.key}/claim`),
    onSuccess: (r) => { celebrate({ title: `Quest complete: ${q.title}`, detail: 'Added to your progress', xp: r.xp }); qc.invalidateQueries({ queryKey: ['progress'] }); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not claim', 'error'),
  });
  return (
    <li className={cx('rounded-[var(--radius-md)] border p-4', q.claimable ? 'border-accent/60 bg-accent/5' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-fg">{q.title}</p>
          <p className="text-sm text-fg-2">{q.description}</p>
        </div>
        <Badge tone={q.claimed ? 'success' : 'neutral'}>{q.claimed ? 'Claimed' : `+${q.xp} XP`}</Badge>
      </div>
      <ul className="mt-3 space-y-2">
        {q.steps.map((s) => (
          <li key={s.metric} className="space-y-1">
            <div className="flex justify-between text-xs text-fg-3"><span>{s.label}</span><span className="numeric">{s.value}/{s.target}</span></div>
            <ProgressBar value={s.value} max={s.target} label={`${q.title}: ${s.label}`} />
          </li>
        ))}
      </ul>
      {q.claimable && <Button size="sm" className="mt-3 motion-press" loading={claim.isPending} onClick={() => claim.mutate()}>Claim</Button>}
    </li>
  );
}

function SeasonTrack({ s }: { s: Season }) {
  const qc = useQueryClient();
  const celebrate = useCelebrate();
  const toast = useToast();
  const claim = useMutation({
    mutationFn: (at: number) => post<{ reward: { title: string } }>(`seasons/${s.key}/milestones/${at}/claim`),
    onSuccess: (r) => { celebrate({ title: `Unlocked: ${r.reward.title}`, detail: s.name }); qc.invalidateQueries({ queryKey: ['progress'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not claim', 'error'),
  });
  const top = s.milestones[s.milestones.length - 1]?.at ?? 1;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><p className="eyebrow">{s.status === 'current' ? 'Current season' : s.status === 'ended' ? 'Past season' : 'Coming up'}</p><h2 className="font-display text-3xl">{s.name}</h2><p className="text-sm text-fg-2">{s.theme} · {s.startsOn} – {s.endsOn}</p></div>
        <p className="font-display text-3xl numeric">{s.points}<span className="ml-1 text-sm text-fg-3">season points</span></p>
      </div>
      <SeasonPath seasonKey={s.key} name={s.name} points={s.points} milestones={s.milestones.map((m) => ({ at: m.at, title: m.reward.title, reached: m.reached, claimed: m.claimed, claimable: m.claimable }))} />
      <ProgressBar value={Math.min(s.points, top)} max={top} label={`${s.name} progress`} />
      <ol className="grid gap-2 sm:grid-cols-5">
        {s.milestones.map((m) => (
          <li key={m.at} className={cx('rounded-[var(--radius-sm)] border p-3 text-sm', m.claimed ? 'border-success/50' : m.reached ? 'border-accent/60' : 'border-line opacity-80')}>
            <p className="numeric text-xs text-fg-3">{m.at} pts</p>
            <p className="font-semibold">{m.reward.title}</p>
            {m.claimed ? <Badge tone="success">Yours</Badge> : m.claimable ? <Button size="sm" className="mt-1 motion-press" loading={claim.isPending} onClick={() => claim.mutate(m.at)}>Claim</Button> : <span className="text-xs text-fg-3">{m.reached ? 'Claim window closed' : 'Keep going'}</span>}
          </li>
        ))}
      </ol>
      <p className="text-xs text-fg-3">Season points are the XP you earn during the season. Rewards are cosmetic badges. {s.premiumTrack.note}</p>
    </Card>
  );
}

interface Inventory { items: { key: string; kind: string; title: string; unlocked: boolean; source: string | null }[]; achievements: { key: string; title: string; description: string; earnedAt: string | null }[] }

function InventoryPanel() {
  const q = useQuery({ queryKey: ['inventory'], queryFn: () => get<Inventory>('progress/inventory') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-6">
        <AchievementGallery achievements={d.achievements} />
        <Card>
          <h2 className="font-display text-2xl">Collection</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {d.items.filter((i) => i.kind === 'badge' || i.kind === 'card').map((i) => (
              <li key={i.key} className={cx('rounded-[var(--radius-sm)] border p-3 text-sm', i.unlocked ? 'border-accent/50' : 'border-line opacity-60')}>
                <p className="font-semibold">{i.title}</p>
                <p className="text-xs capitalize text-fg-3">{i.kind}{i.unlocked ? ` · ${i.source}` : ' · locked'}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    )}</QueryState>
  );
}

export function ProgressPage() {
  const q = useQuery({ queryKey: ['progress'], queryFn: () => get<Progress>('progress') });
  return (
    <div className="space-y-8">
      <PageHeader kicker="Progress" title="Quests & streaks" subtitle="Small rewards for showing up for yourself and your people. Nothing expires that you already earned." />
      <SponsoredChallenges />
      <QueryState q={q}>{(p) => {
        const season = p.seasons.find((s) => s.key === p.current) ?? p.seasons[0];
        const groups: [string, Quest[]][] = [['Today', p.quests.filter((x) => x.period === 'daily')], ['This week', p.quests.filter((x) => x.period === 'weekly')], ['Explore', p.quests.filter((x) => x.period === 'once')]];
        return (
          <>
            <QuestConstellation quests={p.quests} />
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="flex items-center gap-4">
                <img src={levelBadge(p.level.level)} alt="" className="h-14 w-14" />
                <div className="flex-1">
                  <p className="text-sm text-fg-3">{p.level.rank}</p>
                  <p className="font-display text-3xl">Level {p.level.level}</p>
                  <ProgressBar value={p.xp - p.level.current} max={p.level.next - p.level.current} label="Progress to next level" />
                  <p className="mt-1 text-xs text-fg-3 numeric">{p.xp} XP · {p.level.next - p.xp} to next level</p>
                </div>
              </Card>
              <Card>
                <p className="text-sm text-fg-3">Streak</p>
                <p className="font-display text-3xl numeric">{p.streak.current} {p.streak.current === 1 ? 'day' : 'days'}</p>
                <p className="text-xs text-fg-3">Best {p.streak.best}. {p.streak.activeToday ? 'Today counts already.' : 'Do anything meaningful today to keep it going.'}</p>
                <p className="mt-2 text-xs text-fg-3">{p.streak.note}</p>
              </Card>
              <Card>
                <p className="text-sm text-fg-3">Daily vibe</p>
                <VibeCheckIn today={p.vibe.today} />
              </Card>
            </div>
            {groups.map(([label, qs]) => qs.length > 0 && (
              <section key={label} aria-labelledby={`q-${label}`}>
                <h2 id={`q-${label}`} className="mb-3 font-display text-2xl">{label}</h2>
                <ul className="grid gap-3 md:grid-cols-2">{qs.map((x) => <QuestCard key={x.key} q={x} />)}</ul>
              </section>
            ))}
            {p.circleStreaks.length > 0 && (
              <Card>
                <h2 className="font-display text-2xl">Circle streaks</h2>
                <p className="text-sm text-fg-2">Days in a row someone in the circle showed up — a shared rhythm, not a test.</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">{p.circleStreaks.map((c) => <li key={c.circleId} className="flex justify-between rounded-[var(--radius-sm)] border border-line p-3 text-sm"><span>{c.name}</span><span className="numeric">{c.current} days · best {c.best}</span></li>)}</ul>
              </Card>
            )}
            {season && <SeasonTrack s={season} />}
          </>
        );
      }}</QueryState>
      <InventoryPanel />
    </div>
  );
}
