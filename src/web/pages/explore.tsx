import { useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post, put } from '../lib/api';
import { Avatar, Badge, Button, ButtonLink, Card, PageHeader, Switch, cx } from '../components/ui/primitives';
import { EmptyState, QueryState } from '../components/ui/feedback';
import { Segmented, useToast } from '../components/ui/overlays';
import { useModules } from '../lib/modules';
import { useMe } from '../lib/session';
import { CONNECTION_INTENTS, MAX_INTENTS } from '../../shared/people';
import { Composer, ThoughtCard, type ThoughtPost } from './thoughts';
import { PeopleConstellation } from '../components/StarWorlds';

const INTENT_LABEL = Object.fromEntries(CONNECTION_INTENTS.map((i) => [i.key, i.label])) as Record<string, string>;

interface Person {
  userId: string; handle: string; displayName: string; avatarUrl: string | null;
  archetype: { key: string; name: string } | null; labels: string[]; sharedLabels: string[];
  intents: string[]; sharedIntents: string[]; follow: 'pending' | 'accepted' | null;
}

function DiscoverySettings({ initial, onSaved }: { initial: { discoverable: boolean; intents: string[] }; onSaved: () => void }) {
  const toast = useToast();
  const me = useMe().data?.user;
  const [on, setOn] = useState(initial.discoverable);
  const [intents, setIntents] = useState<string[]>(initial.intents);
  const save = useMutation({
    mutationFn: () => put('people/settings', { discoverable: on, intents }),
    onSuccess: () => { toast(on ? 'You are listed in Discover' : 'You are no longer listed', 'success'); onSaved(); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });
  const toggle = (k: string) => setIntents(intents.includes(k) ? intents.filter((x) => x !== k) : intents.length < MAX_INTENTS ? [...intents, k] : intents);
  return (
    <div className="space-y-4">
      <Switch label="List me in Discover → People" checked={on} onChange={setOn}
        description="Only members who list themselves can see this list. You can turn it off any time; it is off unless you turn it on." />
      <fieldset>
        <legend className="text-sm text-fg">I’m open to (pick up to {MAX_INTENTS})</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONNECTION_INTENTS.map((i) => (
            <button key={i.key} type="button" aria-pressed={intents.includes(i.key)} onClick={() => toggle(i.key)}
              className={cx('min-h-9 rounded-full border px-3 text-sm', intents.includes(i.key) ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>{i.label}</button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-fg-3">Others see your name, handle, photo, what you’re open to, and — only if those are public in Identity Studio — your archetype and labels. Never your email or birth details.</p>
      {!me?.emailVerified && on && <p className="text-sm text-warning">Verify your email first to be listed.</p>}
      <Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
    </div>
  );
}

function PersonCard({ p }: { p: Person }) {
  const qc = useQueryClient();
  const toast = useToast();
  const follow = useMutation({
    mutationFn: () => post(`follows/${p.userId}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['people'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not follow', 'error'),
  });
  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={p.displayName} src={p.avatarUrl} size={44} />
        <div className="min-w-0">
          <Link to={`/u/${p.handle}`} className="block truncate font-semibold text-fg hover:underline">{p.displayName}</Link>
          <p className="truncate text-xs text-fg-3">@{p.handle}{p.archetype ? ` · ${p.archetype.name}` : ''}</p>
        </div>
      </div>
      {p.intents.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Open to">
          {p.intents.map((i) => <li key={i}><Badge tone={p.sharedIntents.includes(i) ? 'accent' : 'neutral'}>{INTENT_LABEL[i] ?? i}</Badge></li>)}
        </ul>
      )}
      {p.sharedLabels.length > 0 && <p className="text-xs text-fg-2">You both said: {p.sharedLabels.join(', ')}</p>}
      <div className="mt-auto flex gap-2">
        {p.follow ? <Badge tone="success">{p.follow === 'pending' ? 'Requested' : 'Following'}</Badge>
          : <Button size="sm" loading={follow.isPending} onClick={() => follow.mutate()}>Follow</Button>}
        <ButtonLink to={`/u/${p.handle}`} size="sm" variant="ghost">View profile</ButtonLink>
      </div>
    </li>
  );
}

function People() {
  const qc = useQueryClient();
  const [intent, setIntent] = useState('');
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<'both' | 'constellation' | 'list'>(() => { try { const v = localStorage.getItem('nk_discover_view'); return v === 'constellation' || v === 'list' ? v : 'both'; } catch { return 'both'; } });
  const pickView = (v: 'both' | 'constellation' | 'list') => { setView(v); try { localStorage.setItem('nk_discover_view', v); } catch { /* storage unavailable */ } };
  const settings = useQuery({ queryKey: ['people-settings'], queryFn: () => get<{ discoverable: boolean; intents: string[] }>('people/settings') });
  const list = useInfiniteQuery({
    queryKey: ['people', intent],
    initialPageParam: 0,
    enabled: !!settings.data?.discoverable,
    queryFn: ({ pageParam }) => get<{ optedIn: boolean; people: Person[]; nextOffset: number | null }>(`people/discover?offset=${pageParam}${intent ? `&intent=${intent}` : ''}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const saved = () => { setEditing(false); void qc.invalidateQueries({ queryKey: ['people-settings'] }); void qc.invalidateQueries({ queryKey: ['people'] }); };
  return (
    <section aria-labelledby="people-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="people-h" className="font-display text-3xl">People</h2>
          <p className="text-sm text-fg-2">Members who chose to be found, and what they’re open to.</p>
        </div>
        {settings.data?.discoverable && <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'My listing'}</Button>}
      </div>
      <QueryState q={settings}>{(s) => (!s.discoverable || editing) ? (
        <Card>
          {!s.discoverable && <p className="mb-4 text-fg-2">Discover is opt-in both ways: list yourself to see who else is open to meeting people here.</p>}
          <DiscoverySettings initial={s} onSaved={saved} />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by what people are open to">
            <button type="button" aria-pressed={!intent} onClick={() => setIntent('')} className={cx('min-h-9 rounded-full border px-3 text-sm', !intent ? 'border-fg bg-fg text-canvas' : 'border-line text-fg-2')}>Everyone</button>
            {CONNECTION_INTENTS.map((i) => <button key={i.key} type="button" aria-pressed={intent === i.key} onClick={() => setIntent(i.key)} className={cx('min-h-9 rounded-full border px-3 text-sm', intent === i.key ? 'border-fg bg-fg text-canvas' : 'border-line text-fg-2')}>{i.label}</button>)}
          </div>
          <QueryState q={list} empty={(d) => (!d.pages[0]?.people.length ? <EmptyState icon="social" title="No one here yet" body={intent ? 'Nobody listed has picked this yet. Try another filter.' : 'You’re early. Invite friends — when they list themselves, they’ll show up here.'} action={<ButtonLink to="/invite" size="sm">Invite friends</ButtonLink>} /> : null)}>{(d) => (
            <>
              <Segmented label="View" value={view} onChange={pickView} options={[{ value: 'both', label: 'Both' }, { value: 'constellation', label: 'Constellation' }, { value: 'list', label: 'List' }]} />
              {view !== 'list' && <PeopleConstellation people={d.pages.flatMap((pg) => pg.people)} intentLabel={(k) => INTENT_LABEL[k] ?? k} />}
              {view !== 'constellation' && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{d.pages.flatMap((pg) => pg.people).map((p) => <PersonCard key={p.userId} p={p} />)}</ul>}
              {list.hasNextPage && <Button variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Show more</Button>}
            </>
          )}</QueryState>
        </>
      )}</QueryState>
    </section>
  );
}

function TrendingDrops() {
  const q = useQuery({ queryKey: ['thoughts', 'ranked', 'explore'], queryFn: () => get<{ posts: ThoughtPost[] }>('feed?mode=ranked&limit=5') });
  return (
    <section aria-labelledby="drops-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="drops-h" className="font-display text-3xl">Thought Drops</h2>
          <p className="text-sm text-fg-2">What people are saying right now.</p>
        </div>
        <ButtonLink to="/thoughts" size="sm" variant="ghost">See all</ButtonLink>
      </div>
      <QueryState q={q} empty={(d) => (!d.posts.length ? <EmptyState icon="social" title="Quiet so far" body="Be the first to drop a thought." action={<ButtonLink to="/create" size="sm">Create</ButtonLink>} /> : null)}>{(d) => (
        <div className="space-y-3">{d.posts.map((p) => <ThoughtCard key={p.id} p={p} />)}</div>
      )}</QueryState>
    </section>
  );
}

/** Discover: opt-in people and the live Thought Drop conversation. */
export function ExplorePage() {
  const mods = useModules();
  return (
    <div className="space-y-10">
      <PageHeader kicker="Discover" title="Find your people" subtitle="Opt-in, never inferred: you see people who chose to be found, and what they’re open to." />
      {mods.enabled('people') && <People />}
      {mods.enabled('creators') && (
        <Link to="/creators" className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-line-strong">
          <span><span className="block font-display text-2xl">Creators</span><span className="text-sm text-fg-2">Members who make zines, music, games and workshops.</span></span>
          <span className="text-sm text-accent">Browse creators →</span>
        </Link>
      )}
      <TrendingDrops />
    </div>
  );
}

/** Create: one place to start anything — a Thought Drop (text, poll, photo, voice), a circle or a game. */
export function CreatePage() {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-8">
      <PageHeader kicker="Create" title="Say it, ask it, show it" subtitle="Text, a poll, photos or a voice note — public, for followers, or just for a circle." />
      {done && <Card className="flex flex-wrap items-center justify-between gap-3" role="status"><p className="text-fg">Posted. People can now react and reply.</p><ButtonLink to="/thoughts" size="sm" variant="secondary">See it in Thought Drops</ButtonLink></Card>}
      <Composer onPosted={() => setDone(true)} />
      <section aria-labelledby="more-create" className="space-y-3">
        <h2 id="more-create" className="font-display text-2xl">More to start</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li><Link to="/circles" className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">Start a circle</p><p className="mt-1 text-sm text-fg-2">A private space for your friends, with its own drops, events and games.</p></Link></li>
          <li><Link to="/play" className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">Start a game</p><p className="mt-1 text-sm text-fg-2">Twelve quick social games to play with a circle.</p></Link></li>
          <li><Link to="/play/quizzes/new" className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">Make a quiz</p><p className="mt-1 text-sm text-fg-2">Trivia about you, or a “which one are you?” for friends.</p></Link></li>
          <li><Link to="/creator-studio" className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">Creator page</p><p className="mt-1 text-sm text-fg-2">Links, featured drops, planned offerings and tips.</p></Link></li>
          <li><Link to="/play/tournaments/new" className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">Host a tournament</p><p className="mt-1 text-sm text-fg-2">Timed trivia for a circle or friends, with standings.</p></Link></li>
          <li><Link to="/identity" className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">Share your card</p><p className="mt-1 text-sm text-fg-2">Your archetype card, as an image or a link.</p></Link></li>
        </ul>
      </section>
    </div>
  );
}

