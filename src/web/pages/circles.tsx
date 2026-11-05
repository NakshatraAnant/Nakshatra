import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post } from '../lib/api';
import { useMe } from '../lib/session';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, cx } from '../components/ui/primitives';
import { EmptyState, LoadingBlock, Notice, QueryState } from '../components/ui/feedback';
import { ConfirmDialog, Dialog, Tabs, useToast } from '../components/ui/overlays';
import { Composer, ThoughtCard, type ThoughtPost } from './thoughts';
import { GameLauncher, SessionList } from './play';
import { CircleQuestion } from './home';
import { Art } from '../components/visual';
import { circleCover, circleSymbol } from '../lib/visual';

export const CIRCLE_THEME_COLORS: Record<string, [string, string]> = {
  dusk: ['#2a1d4a', '#c98a96'], saffron: ['#3a1e05', '#e9a23b'], monsoon: ['#0b2230', '#6fa8dc'],
  aurora: ['#062019', '#5fd1b5'], ember: ['#2a0c08', '#e07a5f'], jade: ['#0b2016', '#7fb69a'],
};
const THEMES = Object.keys(CIRCLE_THEME_COLORS);

/** Small generative emblem for a circle from its theme and name. */
export function CircleEmblem({ theme, name, size = 48, id }: { theme: string; name: string; size?: number; id?: string }) {
  const [ink, glow] = CIRCLE_THEME_COLORS[theme] ?? CIRCLE_THEME_COLORS.dusk;
  // With a circle id, use the package circle symbol (deterministic per circle) on the theme ink.
  if (id) return <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ width: size, height: size, background: ink }} aria-hidden="true"><img src={circleSymbol(id)} alt="" width={size} height={size} loading="lazy" decoding="async" /></span>;
  const n = 3 + (name.length % 4);
  const dots = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * 14, Math.sin(a) * 14]; });
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} aria-hidden="true" className="shrink-0 rounded-full">
      <circle r="24" fill={ink} />
      <circle r="14" fill="none" stroke={glow} strokeOpacity=".5" />
      <polygon points={dots.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} fill={glow} fillOpacity=".18" stroke={glow} strokeWidth="1" />
      {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill={glow} />)}
      <text y="4" textAnchor="middle" fontSize="12" fontFamily="'Hanken Grotesk', sans-serif" fill="#f6f1e6">{name.slice(0, 1).toUpperCase()}</text>
    </svg>
  );
}

interface CircleSummary { id: string; name: string; description: string; theme: string; role: string; memberCount: number; liveGames: number; level: { name: string; points: number; next: { name: string; at: number } | null } }

export function CreateCircleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState('dusk');
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post<{ circle: { id: string } }>('circles', { name, theme }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['circles'] }); onClose(); nav(`/circles/${r.circle.id}?new=1`); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not create the circle', 'error'),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Start a circle" description="A private space for people you already know. Nobody can find it — they join only with your invite link."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={name.trim().length < 2} onClick={() => m.mutate()}>Create circle</Button></>}>
      <Field label="Circle name">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hostel 4B, Sunday Chai Club" />}</Field>
      <fieldset className="mt-4">
        <legend className="text-sm text-fg-2">Theme</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)} className={cx('flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm capitalize', theme === t ? 'border-accent' : 'border-line')}>
              <span className="h-4 w-4 rounded-full" style={{ background: `linear-gradient(135deg, ${CIRCLE_THEME_COLORS[t][0]}, ${CIRCLE_THEME_COLORS[t][1]})` }} />{t}
            </button>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}

export function CirclesPage() {
  const q = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: CircleSummary[] }>('circles') });
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <PageHeader kicker="Circles" title="Your people, privately" subtitle="Small private groups for friends you already have. Daily questions, games and conversations — only members can see inside."
        actions={<Button icon="plus" variant={q.data?.circles.length === 0 ? 'secondary' : undefined} onClick={() => setCreating(true)}>New circle</Button>} />
      <QueryState q={q} empty={(d) => d.circles.length ? null : (
        <EmptyState icon="bonds" title="No circles yet" body="Start one for your college gang, your siblings or your Sunday football group, then share the invite link where you already talk." action={<Button onClick={() => setCreating(true)}>Start a circle</Button>} />
      )}>{(d) => (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {d.circles.map((c) => (
            <li key={c.id}>
              <Link to={`/circles/${c.id}`} className="card flex h-full flex-col gap-3 overflow-hidden transition-colors hover:border-line-strong">
                <div className="relative aspect-[3/1] bg-surface-2"><Art src={circleCover(c.theme)} className="absolute inset-0 h-full w-full object-cover" position="75% 50%" /></div>
                <div className="flex items-center gap-3 px-5">
                  <CircleEmblem theme={c.theme} name={c.name} id={c.id} />
                  <div className="min-w-0"><h2 className="truncate font-display text-2xl">{c.name}</h2><p className="text-xs text-fg-3">{c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.role === 'owner' ? 'Owner' : c.role === 'moderator' ? 'Admin' : 'Member'}</p></div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 px-5 pb-5 text-xs">
                  <Badge tone="neutral">{c.level.name}</Badge>
                  {c.liveGames > 0 && <Badge tone="success">{c.liveGames} game{c.liveGames === 1 ? '' : 's'} on</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}</QueryState>
      <CreateCircleDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

interface CircleDetailResp {
  circle: { id: string; name: string; description: string; theme: string; invitePolicy: string; ownerId: string };
  me: { role: string; canInvite: boolean; isAdmin: boolean };
  members: { userId: string; role: string; displayName?: string; handle?: string; archetype: string | null; contributed: boolean }[];
  level: { name: string; points: number; next: { name: string; at: number } | null };
  activation: { contributors: number; needed: number };
}

function InvitePanel({ circleId, canInvite, isAdmin }: { circleId: string; canInvite: boolean; isAdmin: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const invites = useQuery({ queryKey: ['circle-invites', circleId], queryFn: () => get<{ invites: { id: string; createdBy: string; expiresAt: string; uses: number; maxUses: number }[] }>(`circles/${circleId}/invites`), enabled: canInvite });
  const create = useMutation({ mutationFn: () => post<{ url: string }>(`circles/${circleId}/invites`), onSuccess: (r) => { setLink(r.url); void qc.invalidateQueries({ queryKey: ['circle-invites', circleId] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not create a link', 'error') });
  const share = async () => {
    if (!link) return;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && window.matchMedia?.('(pointer: coarse)').matches) { try { await nav.share({ title: 'Join my circle on Nakshatra', url: link }); return; } catch { /* fall back to copy */ } }
    try { await navigator.clipboard.writeText(link); toast('Link copied', 'success'); } catch { toast('Copy the link from the box', 'info'); }
  };
  if (!canInvite) return <p className="text-sm text-fg-3">Only admins can invite people to this circle.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-2">Invite links work for {7} days or 20 joins, whichever comes first. Opening a link shows only the circle’s name and size — nothing inside — until someone joins.</p>
      <Button onClick={() => create.mutate()} loading={create.isPending}>Create invite link</Button>
      {link && (
        <div className="flex flex-wrap gap-2">
          <Input readOnly value={link} aria-label="Invite link" className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="secondary" onClick={() => void share()}>Copy / share</Button>
        </div>
      )}
      {(invites.data?.invites.length ?? 0) > 0 && (
        <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line text-sm">
          {invites.data!.invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-fg-2">{isAdmin ? `${i.createdBy} · ` : ''}{i.uses}/{i.maxUses} used · expires {new Date(i.expiresAt).toLocaleDateString()}</span>
              <button type="button" className="text-xs text-danger hover:underline" onClick={() => del(`circles/${circleId}/invites/${i.id}`).then(() => qc.invalidateQueries({ queryKey: ['circle-invites', circleId] }))}>Turn off</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CircleFeed({ circleId, circleName }: { circleId: string; circleName: string }) {
  const q = useInfiniteQuery({
    queryKey: ['circle-feed', circleId],
    initialPageParam: '',
    queryFn: ({ pageParam }) => get<{ posts: ThoughtPost[]; nextBefore: string | null }>(`circles/${circleId}/feed${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
  return (
    <div className="space-y-4">
      <Composer circleId={circleId} circleName={circleName} />
      {q.isLoading ? <LoadingBlock /> : posts.length === 0 ? <EmptyState icon="social" title="Quiet in here" body="Post the first thought, answer today’s question, or start a game." /> : posts.map((p) => <ThoughtCard key={p.id} p={p} />)}
      {q.hasNextPage && <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Older posts</Button>}
    </div>
  );
}

function Recap({ circleId }: { circleId: string }) {
  const q = useQuery({ queryKey: ['circle-recap', circleId], queryFn: () => get<{ posts: number; ritualAnswers: number; gamesCompleted: number; newMembers: number; quiet: boolean }>(`circles/${circleId}/recap`) });
  if (!q.data) return null;
  const d = q.data;
  return (
    <Card className="overflow-hidden p-0">
      <Art src="/visual/circles/weekly-recap-cover.svg" className="aspect-[2/1] w-full object-cover" />
      <div className="p-5">
      <h3 className="font-display text-2xl">This week</h3>
      {d.quiet ? <p className="mt-1 text-sm text-fg-3">A quiet week — no pressure. Today’s question is a gentle way back in.</p> : (
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-fg-3">Posts</dt><dd className="text-2xl font-semibold numeric">{d.posts}</dd></div>
          <div><dt className="text-fg-3">Answers</dt><dd className="text-2xl font-semibold numeric">{d.ritualAnswers}</dd></div>
          <div><dt className="text-fg-3">Games played</dt><dd className="text-2xl font-semibold numeric">{d.gamesCompleted}</dd></div>
          <div><dt className="text-fg-3">New members</dt><dd className="text-2xl font-semibold numeric">{d.newMembers}</dd></div>
        </dl>
      )}
      </div>
    </Card>
  );
}

export function CircleDetail() {
  const { id } = useParams();
  const me = useMe().data?.user;
  const q = useQuery({ queryKey: ['circle', id], queryFn: () => get<CircleDetailResp>(`circles/${id}`), retry: false });
  const [tab, setTab] = useState<'feed' | 'play' | 'members' | 'settings'>('feed');
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState<null | 'leave' | 'archive'>(null);
  const memberAction = (userId: string, action: string) => post(`circles/${id}/members/${userId}`, { action }).then(() => { void qc.invalidateQueries({ queryKey: ['circle', id] }); toast('Updated', 'success'); }).catch((e) => toast(e instanceof ApiError ? e.message : 'Could not update', 'error'));
  return (
    <QueryState q={q}>{(d) => (
      <div>
        <div className="relative mb-6 overflow-hidden rounded-[var(--radius-xl)] border border-line">
          <Art src={circleCover(d.circle.theme)} eager className="absolute inset-0 h-full w-full object-cover" position="75% 50%" />
          <div className="scrim-left absolute inset-0" aria-hidden="true" />
          <div className="relative flex min-h-[180px] flex-wrap items-center gap-4 p-5 md:min-h-[220px] md:p-8">
          <CircleEmblem theme={d.circle.theme} name={d.circle.name} size={64} id={d.circle.id} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Private circle · {d.level.name}</p>
            <h1 className="truncate font-display text-4xl">{d.circle.name}</h1>
            <p className="text-sm text-fg-2">{d.members.length} member{d.members.length === 1 ? '' : 's'}{d.level.next ? ` · ${d.level.next.at - d.level.points} contribution points to ${d.level.next.name}` : ''}</p>
          </div>
          {d.me.canInvite && <Button onClick={() => setTab('members')}>Invite friends</Button>}
          </div>
        </div>
        {d.activation.contributors < d.activation.needed && (
          <Notice tone="info" className="mb-6" title="Bring your circle to life">{d.activation.contributors} of {d.activation.needed} members have joined in. Answer today’s question or start a quick game together.</Notice>
        )}
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'feed', label: 'Feed' }, { value: 'play', label: 'Play' }, { value: 'members', label: 'Members', count: d.members.length }, { value: 'settings', label: 'Settings' }]} />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            {tab === 'feed' && <CircleFeed circleId={d.circle.id} circleName={d.circle.name} />}
            {tab === 'play' && <div className="space-y-6"><GameLauncher circleId={d.circle.id} /><SessionList circleId={d.circle.id} /></div>}
            {tab === 'members' && (
              <div className="space-y-6">
                <Card><h2 className="mb-3 font-display text-2xl">Invite</h2><InvitePanel circleId={d.circle.id} canInvite={d.me.canInvite} isAdmin={d.me.isAdmin} /></Card>
                <Card>
                  <h2 className="font-display text-2xl">Members</h2>
                  <ul className="mt-3 divide-y divide-line">
                    {d.members.map((m) => (
                      <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-fg">{m.displayName ?? 'Member'} {m.userId === me?.id && <span className="text-fg-3">(you)</span>}</p>
                          <p className="text-xs text-fg-3">{m.role === 'owner' ? 'Owner' : m.role === 'moderator' ? 'Admin' : 'Member'}{m.archetype ? ` · ${m.archetype}` : ''}{m.contributed ? ' · has joined in' : ''}</p>
                        </div>
                        {m.userId !== me?.id && <CommonGroundButton circleId={d.circle.id} userId={m.userId} name={m.displayName ?? 'Member'} />}
                        {d.me.isAdmin && m.userId !== me?.id && m.role !== 'owner' && (
                          <div className="flex flex-wrap gap-1">
                            {d.me.role === 'owner' && (m.role === 'moderator'
                              ? <Button size="sm" variant="ghost" onClick={() => memberAction(m.userId, 'remove_admin')}>Remove admin</Button>
                              : <Button size="sm" variant="ghost" onClick={() => memberAction(m.userId, 'make_admin')}>Make admin</Button>)}
                            {d.me.role === 'owner' && <Button size="sm" variant="ghost" onClick={() => memberAction(m.userId, 'transfer_ownership')}>Make owner</Button>}
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => memberAction(m.userId, 'remove')}>Remove</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}
            {tab === 'settings' && <CircleSettings d={d} onLeave={() => setConfirm('leave')} onArchive={() => setConfirm('archive')} />}
          </div>
          <aside className="space-y-4">
            <CircleQuestion circleId={d.circle.id} />
            <Recap circleId={d.circle.id} />
          </aside>
        </div>
        <ConfirmDialog open={confirm === 'leave'} onClose={() => setConfirm(null)} title="Leave this circle?" body="You will lose access to its feed, games and questions. You can rejoin only with a new invite." confirmLabel="Leave circle" danger
          onConfirm={() => post(`circles/${id}/leave`).then(() => { void qc.invalidateQueries({ queryKey: ['circles'] }); nav('/circles'); }).catch((e) => toast(e instanceof ApiError ? e.message : 'Could not leave', 'error'))} />
        <ConfirmDialog open={confirm === 'archive'} onClose={() => setConfirm(null)} title="Archive this circle?" body="Everyone loses access and all invite links stop working. This cannot be undone from the app." confirmLabel="Archive circle" danger requireText={d.circle.name}
          onConfirm={() => del(`circles/${id}`).then(() => { void qc.invalidateQueries({ queryKey: ['circles'] }); nav('/circles'); })} />
      </div>
    )}</QueryState>
  );
}

function CircleSettings({ d, onLeave, onArchive }: { d: CircleDetailResp; onLeave: () => void; onArchive: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(d.circle.name);
  const [theme, setTheme] = useState(d.circle.theme);
  const [policy, setPolicy] = useState(d.circle.invitePolicy);
  const save = useMutation({ mutationFn: () => patch(`circles/${d.circle.id}`, { name, theme, invitePolicy: policy }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['circle', d.circle.id] }); toast('Saved', 'success'); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error') });
  return (
    <div className="space-y-6">
      {d.me.isAdmin ? (
        <Card className="space-y-4">
          <h2 className="font-display text-2xl">Circle settings</h2>
          <Field label="Name">{(id) => <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Theme">{(id) => <Select id={id} value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>}</Field>
          <Field label="Who can create invite links">{(id) => <Select id={id} value={policy} onChange={(e) => setPolicy(e.target.value)}><option value="members">Any member</option><option value="admins">Admins only</option></Select>}</Field>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </Card>
      ) : <Notice tone="info">Only circle admins can change settings.</Notice>}
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Membership</h2>
        <Button variant="secondary" onClick={onLeave}>Leave circle</Button>
        {d.me.role === 'owner' && <><p className="text-sm text-fg-2">As owner, transfer ownership from the Members tab before leaving, or archive the circle for everyone.</p><Button variant="danger" onClick={onArchive}>Archive circle</Button></>}
      </Card>
    </div>
  );
}

/** Public invite landing: circle name, size and inviter only. Joining needs an account. */
export function JoinCircle() {
  const { token } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['invite', token], queryFn: () => get<{ circle: { name: string; theme: string; memberCount: number }; invitedBy: string; alreadyMember: boolean; circleId?: string }>(`circle-invites/${token}`), retry: false });
  const accept = useMutation({ mutationFn: () => post<{ circleId: string }>(`circle-invites/${token}/accept`), onSuccess: (r) => nav(`/circles/${r.circleId}`), onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not join', 'error') });
  const next = encodeURIComponent(`/c/join/${token}`);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <QueryState q={q}>{(d) => (
        <Card className="overflow-hidden p-0">
          <div className="relative aspect-[3/1] bg-surface-2"><Art src={circleCover(d.circle.theme)} eager className="absolute inset-0 h-full w-full object-cover" position="75% 50%" /></div>
          <div className="p-8 pt-0">
          <div className="-mt-10 flex justify-center"><span className="rounded-full ring-4 ring-surface"><CircleEmblem theme={d.circle.theme} name={d.circle.name} size={80} /></span></div>
          <p className="mt-4 text-sm text-fg-2">{d.invitedBy} invited you to join</p>
          <h1 className="mt-1 font-display text-4xl">{d.circle.name}</h1>
          <p className="mt-1 text-sm text-fg-3">Private circle · {d.circle.memberCount} member{d.circle.memberCount === 1 ? '' : 's'}</p>
          <p className="mt-4 text-sm text-fg-2">Circles are private spaces for friends: daily questions, games and conversations only members can see.</p>
          <div className="mt-6 flex flex-col gap-2">
            {d.alreadyMember ? <ButtonLink to={`/circles/${d.circleId}`}>Open circle</ButtonLink>
              : me.data?.user ? <Button loading={accept.isPending} onClick={() => accept.mutate()}>Join {d.circle.name}</Button>
                : <><ButtonLink to={`/signup?next=${next}`}>Create an account to join</ButtonLink><ButtonLink to={`/signin?next=${next}`} variant="secondary">I have an account</ButtonLink></>}
          </div>
          </div>
        </Card>
      )}</QueryState>
    </div>
  );
}

interface CommonGround { with: { name: string; archetype: string | null }; sameArchetype: boolean; sharedLabels: string[]; similarDimensions: string[]; differentDimensions: string[]; starters: string[]; note: string }

/** Common Ground card with conversation starters, built from what both of you chose to share. */
function CommonGroundButton({ circleId, userId, name }: { circleId: string; userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['common-ground', circleId, userId], queryFn: () => get<CommonGround>(`circles/${circleId}/common-ground/${userId}`), enabled: open });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Common ground</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`You and ${name}`}>
        <QueryState q={q}>{(c) => (
          <div className="space-y-4 text-sm">
            {c.sameArchetype && <Badge tone="accent">Same archetype{c.with.archetype ? `: ${c.with.archetype}` : ''}</Badge>}
            {c.sharedLabels.length > 0 && <p><span className="text-fg-3">You both said:</span> {c.sharedLabels.join(' · ')}</p>}
            {c.similarDimensions.length > 0 && <p><span className="text-fg-3">Alike on:</span> {c.similarDimensions.join(', ')}</p>}
            {c.differentDimensions.length > 0 && <p><span className="text-fg-3">Different on:</span> {c.differentDimensions.join(', ')}</p>}
            <div>
              <p className="font-semibold">Conversation starters</p>
              <ul className="mt-2 space-y-2">{c.starters.map((x) => <li key={x} className="rounded-[var(--radius-sm)] border border-line px-3 py-2">{x}</li>)}</ul>
            </div>
            <p className="text-xs text-fg-3">{c.note}</p>
          </div>
        )}</QueryState>
      </Dialog>
    </>
  );
}
