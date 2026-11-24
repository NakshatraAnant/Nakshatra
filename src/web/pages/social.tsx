import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, post, upload } from '../lib/api';
import { relative, dateTime } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/session';
import { Avatar, Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState } from '../components/ui/feedback';
import { Dialog, Segmented, useToast } from '../components/ui/overlays';
import { Icon } from '../components/ui/icons';
import { ReportDialog } from './identity';

export const TOPICS = ['vedic', 'western', 'tarot', 'numerology', 'panchang', 'festivals', 'rituals', 'relationships', 'learning', 'meditation', 'mythology', 'nakshatras', 'transits', 'wellbeing'];
const REACTIONS: { kind: string; glyph: string; label: string }[] = [{ kind: 'star', glyph: '✦', label: 'Star' }, { kind: 'moon', glyph: '☽', label: 'Moon' }, { kind: 'sun', glyph: '☉', label: 'Sun' }, { kind: 'heart', glyph: '♡', label: 'Heart' }];

export interface PostView {
  id: string; kind: string; body: string; imageUrl: string | null; card: Record<string, string> | null; topics: string[]; visibility: string; createdAt: string; expiresAt: string | null;
  author: { userId: string; handle?: string; displayName?: string; avatarUrl?: string | null }; reactions: Record<string, number>; myReaction: string | null;
  commentCount: number; saved: boolean; poll: { id: string; label: string; votes: number }[] | null; myVote: string | null; isMine: boolean; reasons: string[];
}

export function PostCard({ p, compact }: { p: PostView; compact?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [report, setReport] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['feed'] }); qc.invalidateQueries({ queryKey: ['post', p.id] }); qc.invalidateQueries({ queryKey: ['group'] }); };
  const react = useMutation({ mutationFn: (kind: string | null) => post(`posts/${p.id}/react`, { kind }), onSuccess: refresh });
  const vote = useMutation({ mutationFn: (optionId: string) => post(`posts/${p.id}/vote`, { optionId }), onSuccess: refresh, onError: (e) => toast(e instanceof ApiError ? e.message : 'Vote failed', 'error') });
  const save = useMutation({ mutationFn: () => post(`posts/${p.id}/save`, { saved: !p.saved }), onSuccess: () => { refresh(); toast(p.saved ? 'Removed from saved' : 'Saved', 'success'); } });
  const feedback = useMutation({ mutationFn: (signal: string) => post(`posts/${p.id}/feedback`, { signal }), onSuccess: () => toast('Thanks — your feed will adjust.', 'success') });
  const remove = useMutation({ mutationFn: () => del(`posts/${p.id}`), onSuccess: refresh });
  const totalVotes = p.poll?.reduce((a, o) => a + o.votes, 0) ?? 0;
  return (
    <article className="card p-5" aria-labelledby={`post-${p.id}-author`}>
      <header className="flex items-start gap-3">
        <Link to={`/u/${p.author.handle}`}><Avatar name={p.author.displayName} src={p.author.avatarUrl} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <p id={`post-${p.id}-author`} className="text-sm"><Link to={`/u/${p.author.handle}`} className="font-semibold text-fg hover:underline">{p.author.displayName}</Link> <span className="text-fg-3">@{p.author.handle}</span></p>
          <p className="text-xs text-fg-3"><time dateTime={p.createdAt}>{relative(p.createdAt)}</time> · {p.visibility === 'public' ? 'Public' : p.visibility === 'group' ? 'Group' : 'Followers'}{p.expiresAt && ` · disappears ${relative(p.expiresAt)}`}</p>
        </div>
        <details className="relative">
          <summary className="list-none rounded-full p-1.5 text-fg-3 hover:bg-surface-2 cursor-pointer" aria-label="Post options"><Icon name="more" /></summary>
          <div className="absolute right-0 z-20 mt-1 w-52 card p-1 text-sm">
            {p.isMine ? <button type="button" className="w-full rounded px-3 py-2 text-left text-danger hover:bg-surface-2" onClick={() => remove.mutate()}>Delete post</button> : (<>
              <button type="button" className="w-full rounded px-3 py-2 text-left hover:bg-surface-2" onClick={() => feedback.mutate('more_like_this')}>More like this</button>
              <button type="button" className="w-full rounded px-3 py-2 text-left hover:bg-surface-2" onClick={() => feedback.mutate('less_like_this')}>Less like this</button>
              <button type="button" className="w-full rounded px-3 py-2 text-left hover:bg-surface-2" onClick={() => post(`mutes/${p.author.userId}`).then(() => { toast('Muted', 'success'); refresh(); })}>Mute @{p.author.handle}</button>
              <button type="button" className="w-full rounded px-3 py-2 text-left text-danger hover:bg-surface-2" onClick={() => setReport(true)}>Report</button>
            </>)}
          </div>
        </details>
      </header>
      {p.body && <p className={cx('mt-3 whitespace-pre-line leading-relaxed text-fg', compact && 'line-clamp-4')}>{p.body}</p>}
      {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="mt-3 max-h-[480px] w-full rounded-[var(--radius-md)] object-cover" />}
      {p.card && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-accent/30 bg-[linear-gradient(135deg,rgb(141_123_216/0.18),rgb(217_178_111/0.08))] p-4">
          <p className="eyebrow">Cosmic card</p>
          {p.card.type === 'nakshatra'
            ? <p className="mt-1 font-display text-2xl">{p.card.nakshatra} · pada {p.card.pada} <span className="text-fg-3">· {p.card.rashi} Rashi</span></p>
            : <p className="mt-1 font-display text-2xl">☉ {p.card.sun} · ☽ {p.card.moon}{p.card.rising ? ` · ↑ ${p.card.rising}` : ''}</p>}
          {p.card.type !== 'nakshatra' && <p className="text-sm text-fg-2">{p.card.rashi} Rashi · {p.card.nakshatra} nakshatra</p>}
        </div>
      )}
      {p.poll && (
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">Poll</legend>
          {p.poll.map((o) => {
            const pctV = totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0;
            return (
              <button key={o.id} type="button" disabled={Boolean(p.myVote)} onClick={() => vote.mutate(o.id)} className={cx('relative w-full overflow-hidden rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm', p.myVote === o.id ? 'border-accent' : 'border-line')}>
                {p.myVote && <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pctV}%` }} aria-hidden="true" />}
                <span className="relative flex justify-between"><span>{o.label}</span>{p.myVote && <span className="numeric text-fg-3">{pctV}%</span>}</span>
              </button>
            );
          })}
          <p className="text-xs text-fg-3">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</p>
        </fieldset>
      )}
      {p.topics.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{p.topics.map((t) => <Badge key={t}>#{t}</Badge>)}</div>}
      <footer className="mt-4 flex flex-wrap items-center gap-1">
        {REACTIONS.map((r) => (
          <button key={r.kind} type="button" aria-pressed={p.myReaction === r.kind} aria-label={`${r.label} reaction (${p.reactions[r.kind] ?? 0})`} onClick={() => react.mutate(p.myReaction === r.kind ? null : r.kind)}
            className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition-colors', p.myReaction === r.kind ? 'bg-accent/15 text-accent' : 'text-fg-3 hover:bg-surface-2')}>
            {r.glyph}{p.reactions[r.kind] ? <span className="text-xs numeric">{p.reactions[r.kind]}</span> : null}
          </button>
        ))}
        <Link to={`/social/post/${p.id}`} className="ml-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm text-fg-3 hover:bg-surface-2"><Icon name="messages" size={16} />{p.commentCount}</Link>
        <button type="button" onClick={() => save.mutate()} aria-pressed={p.saved} className={cx('ml-auto inline-flex rounded-full p-1.5', p.saved ? 'text-accent' : 'text-fg-3 hover:bg-surface-2')} aria-label={p.saved ? 'Unsave' : 'Save'}><Icon name="bookmark" size={18} /></button>
      </footer>
      {p.reasons.length > 0 && <p className="mt-2 text-[11px] text-fg-3">Why this post: {p.reasons.join(' · ')}</p>}
      <ReportDialog open={report} onClose={() => setReport(false)} targetType="post" targetId={p.id} />
    </article>
  );
}

function Composer({ groupId, onDone }: { groupId?: string; onDone?: () => void }) {
  const me = useMe().data?.user;
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'text' | 'image' | 'poll' | 'cosmic_card' | 'story'>('text');
  const [body, setBody] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [visibility, setVisibility] = useState(groupId ? 'group' : 'followers');
  const [options, setOptions] = useState(['', '']);
  const [image, setImage] = useState<string | null>(null);
  const [cardType, setCardType] = useState('big_three');
  const [hours, setHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  const up = useMutation({ mutationFn: (f: File) => upload<{ url: string }>('posts/image', f), onSuccess: (r) => setImage(r.url), onError: (e) => setError((e as Error).message) });
  const m = useMutation({
    mutationFn: () => post('posts', { kind, body, topics, visibility, groupId, imageUrl: image ?? undefined, pollOptions: kind === 'poll' ? options.filter(Boolean) : undefined, cardType: kind === 'cosmic_card' ? cardType : undefined, temporaryHours: hours ? Number(hours) : undefined }),
    onSuccess: () => { setBody(''); setTopics([]); setImage(null); setOptions(['', '']); setError(null); qc.invalidateQueries({ queryKey: ['feed'] }); qc.invalidateQueries({ queryKey: ['stories'] }); qc.invalidateQueries({ queryKey: ['group'] }); toast('Posted', 'success'); onDone?.(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not post'),
  });
  if (!me?.emailVerified) return <Notice tone="info">Verify your email to post. <Link to="/settings/security" className="underline">Resend verification</Link></Notice>;
  return (
    <Card>
      <div className="flex gap-3">
        <Avatar name={me.profile?.displayName} src={me.profile?.avatarUrl} size={40} />
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Post type">
            {(['text', 'image', 'poll', 'cosmic_card', 'story'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cx('rounded-full border px-3 py-1 text-xs capitalize', kind === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-3')}>{k === 'cosmic_card' ? 'Cosmic card' : k}</button>)}
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          <label className="sr-only" htmlFor="composer">Write a post</label>
          <Textarea id="composer" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === 'poll' ? 'Ask a question…' : kind === 'story' ? 'A thought for the next 24 hours…' : 'What’s in your sky today?'} />
          {kind === 'poll' && <div className="space-y-2">{options.map((o, i) => <Input key={i} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />)}{options.length < 4 && <Button size="sm" variant="ghost" icon="plus" onClick={() => setOptions([...options, ''])}>Add option</Button>}</div>}
          {kind === 'image' && <div>{image ? <img src={image} alt="Upload preview" className="max-h-48 rounded" /> : <Input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Image" onChange={(e) => e.target.files?.[0] && up.mutate(e.target.files[0])} />}</div>}
          {kind === 'cosmic_card' && <Select aria-label="Card type" value={cardType} onChange={(e) => setCardType(e.target.value)}><option value="big_three">Sun · Moon · Rising</option><option value="nakshatra">Janma Nakshatra</option></Select>}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topics">{TOPICS.map((t) => <button key={t} type="button" aria-pressed={topics.includes(t)} onClick={() => setTopics(topics.includes(t) ? topics.filter((x) => x !== t) : topics.length < 4 ? [...topics, t] : topics)} className={cx('rounded-full px-2.5 py-0.5 text-[11px]', topics.includes(t) ? 'bg-violet/20 text-violet' : 'bg-surface-2 text-fg-3')}>#{t}</button>)}</div>
          <div className="flex flex-wrap items-center gap-2">
            {!groupId && <Select aria-label="Audience" value={visibility} onChange={(e) => setVisibility(e.target.value)} className="h-9 w-auto text-sm"><option value="followers">Followers</option><option value="public">Public</option></Select>}
            {kind !== 'story' && <Select aria-label="Disappearing" value={hours} onChange={(e) => setHours(e.target.value)} className="h-9 w-auto text-sm"><option value="">Permanent</option><option value="24">Disappears in 24h</option><option value="72">Disappears in 3 days</option></Select>}
            <Button size="sm" className="ml-auto" loading={m.isPending} onClick={() => m.mutate()}>Post</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stories() {
  const q = useQuery({ queryKey: ['stories'], queryFn: () => get<{ stories: PostView[] }>('stories') });
  const [open, setOpen] = useState<PostView | null>(null);
  if (!q.data?.stories.length) return null;
  const byAuthor = new Map<string, PostView[]>();
  for (const s of q.data.stories) byAuthor.set(s.author.userId, [...(byAuthor.get(s.author.userId) ?? []), s]);
  return (
    <section aria-label="Stories" className="mb-5">
      <ul className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {[...byAuthor.values()].map((list) => (
          <li key={list[0].author.userId}><button type="button" onClick={() => setOpen(list[0])} className="flex w-16 flex-col items-center gap-1"><span className="rounded-full p-0.5" style={{ background: 'linear-gradient(135deg,var(--accent),var(--violet))' }}><Avatar name={list[0].author.displayName} src={list[0].author.avatarUrl} size={56} className="border-2 border-[var(--bg)]" /></span><span className="w-full truncate text-[11px] text-fg-2">{list[0].author.displayName}</span></button></li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title={open?.author.displayName ?? ''} description={open ? `Story · ${relative(open.createdAt)}` : ''}>
        {open && <p className="whitespace-pre-line text-lg leading-relaxed">{open.body}</p>}
      </Dialog>
    </section>
  );
}

export function FeedPage() {
  const [mode, setMode] = useState<'ranked' | 'chronological' | 'following'>('ranked');
  const [topic, setTopic] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['feed', mode, topic], initialPageParam: 0,
    queryFn: ({ pageParam }) => get<{ posts: PostView[]; nextOffset: number | null; rankingExplanation: string }>(`feed?mode=${mode}&offset=${pageParam}${topic ? `&topic=${topic}` : ''}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
  return (
    <div>
      <PageHeader kicker="Community" title="Feed" actions={<>
        <ButtonLink to="/social/groups" variant="secondary" size="sm" icon="users">Groups</ButtonLink>
        <ButtonLink to="/social/events" variant="secondary" size="sm" icon="calendar">Events</ButtonLink>
        <ButtonLink to="/social/requests" variant="ghost" size="sm">Requests</ButtonLink>
      </>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-4">
          <Stories />
          <Composer />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Feed order" value={mode} onChange={setMode} options={[{ value: 'ranked', label: 'For you' }, { value: 'chronological', label: 'Latest' }, { value: 'following', label: 'Following' }]} />
            <Select aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-10 w-auto text-sm"><option value="">All topics</option>{TOPICS.map((t) => <option key={t} value={t}>#{t}</option>)}</Select>
          </div>
          {q.data?.pages[0] && mode === 'ranked' && <p className="text-xs text-fg-3">{q.data.pages[0].rankingExplanation}</p>}
          <QueryState q={{ ...q, data: q.data }} empty={() => (!posts.length ? <EmptyState icon="social" title="Your feed is quiet" body="Follow people, join a group or share your first post." /> : null)}>{() => (
            <div className="space-y-4">
              {posts.map((p) => <PostCard key={p.id} p={p} compact />)}
              {q.hasNextPage && <Button variant="secondary" block loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>}
            </div>
          )}</QueryState>
        </div>
        <aside className="hidden space-y-4 lg:block">
          <Card><h2 className="font-display text-2xl">Community guidelines</h2><ul className="mt-2 space-y-1.5 text-sm text-fg-2"><li>Astrology starts conversations — it doesn’t judge people.</li><li>No harassment, scams or hate.</li><li>Never share someone else’s birth details.</li></ul></Card>
          <SavedPosts />
        </aside>
      </div>
    </div>
  );
}

function SavedPosts() {
  const q = useQuery({ queryKey: ['saved-posts'], queryFn: () => get<{ posts: PostView[] }>('saved-posts') });
  return <Card><h2 className="font-display text-2xl">Saved</h2><ul className="mt-2 space-y-2 text-sm">{q.data?.posts.slice(0, 5).map((p) => <li key={p.id}><Link to={`/social/post/${p.id}`} className="line-clamp-2 text-fg-2 hover:text-fg">{p.body || 'Post'}</Link></li>)}{!q.data?.posts.length && <li className="text-fg-3">Nothing saved yet.</li>}</ul></Card>;
}

export function PostPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['post', id], queryFn: () => get<{ post: PostView; comments: { id: string; parentId: string | null; body: string; createdAt: string; author: { userId: string; handle?: string; displayName?: string; avatarUrl?: string | null }; isMine: boolean }[] }>(`posts/${id}`) });
  const add = useMutation({ mutationFn: () => post(`posts/${id}/comments`, { body, parentId: replyTo ?? undefined }), onSuccess: () => { setBody(''); setReplyTo(null); qc.invalidateQueries({ queryKey: ['post', id] }); } });
  const remove = useMutation({ mutationFn: (cid: string) => del(`comments/${cid}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['post', id] }) });
  return (
    <QueryState q={q}>{(d) => {
      const top = d.comments.filter((c) => !c.parentId);
      const replies = (pid: string) => d.comments.filter((c) => c.parentId === pid);
      const C = ({ c, nested }: { c: (typeof d.comments)[number]; nested?: boolean }) => (
        <li className={cx('flex gap-3', nested && 'ml-10')}>
          <Avatar name={c.author.displayName} src={c.author.avatarUrl} size={32} />
          <div className="flex-1 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
            <p className="text-xs"><Link to={`/u/${c.author.handle}`} className="font-semibold text-fg">{c.author.displayName}</Link> <span className="text-fg-3">{relative(c.createdAt)}</span></p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-fg-2">{c.body}</p>
            <div className="mt-1 flex gap-3 text-xs text-fg-3">{!nested && <button type="button" onClick={() => setReplyTo(c.id)} className="hover:text-fg">Reply</button>}{c.isMine ? <button type="button" onClick={() => remove.mutate(c.id)} className="hover:text-danger">Delete</button> : <button type="button" onClick={() => setReport(c.id)} className="hover:text-danger">Report</button>}</div>
          </div>
        </li>
      );
      return (
        <div className="mx-auto max-w-2xl space-y-5">
          <PostCard p={d.post} />
          <Card>
            <h2 className="font-display text-2xl">Comments</h2>
            <ul className="mt-4 space-y-3">{top.map((c) => <div key={c.id} className="space-y-3"><C c={c} />{replies(c.id).map((r) => <C key={r.id} c={r} nested />)}</div>)}{!top.length && <li className="text-sm text-fg-3">Be the first to comment.</li>}</ul>
            <div className="mt-4">
              {replyTo && <p className="mb-1 text-xs text-fg-3">Replying · <button type="button" className="underline" onClick={() => setReplyTo(null)}>cancel</button></p>}
              <Textarea rows={2} aria-label="Write a comment" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="Add a kind, thoughtful comment…" />
              <Button size="sm" className="mt-2" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>Comment</Button>
            </div>
          </Card>
          <ReportDialog open={Boolean(report)} onClose={() => setReport(null)} targetType="comment" targetId={report ?? ''} />
        </div>
      );
    }}</QueryState>
  );
}

interface GroupItem { id: string; slug: string; name: string; description: string; visibility: string; kind: string; memberCount: number; membership: { role: string; status: string } | null; tags: string[] }

export function GroupsPage() {
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['groups', q], queryFn: () => get<{ groups: GroupItem[] }>(`groups${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <div>
      <PageHeader kicker="Community" title="Groups & creator channels" actions={<Button icon="plus" onClick={() => setCreating(true)}>New group</Button>} />
      <Input aria-label="Search groups" placeholder="Search groups…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-5 max-w-md" />
      <QueryState q={list} empty={(d) => (!d.groups.length ? <EmptyState icon="users" title="No groups found" /> : null)}>{(d) => (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{d.groups.map((g) => (
          <li key={g.id}><Link to={`/social/groups/${g.slug}`} className="card block h-full p-5 hover:border-line-strong">
            <div className="flex items-center justify-between gap-2"><h2 className="font-display text-2xl">{g.name}</h2>{g.kind === 'creator_channel' && <Badge tone="violet">Channel</Badge>}</div>
            <p className="mt-1 line-clamp-3 text-sm text-fg-2">{g.description}</p>
            <p className="mt-3 text-xs text-fg-3">{g.memberCount} members · {g.visibility}{g.membership ? ` · ${g.membership.status === 'pending' ? 'request pending' : g.membership.role}` : ''}</p>
          </Link></li>
        ))}</ul>
      )}</QueryState>
      <CreateGroupDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe().data?.user;
  const nav = useNavigate();
  const [v, setV] = useState({ name: '', description: '', visibility: 'public', kind: 'community' });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => post<{ group: { slug: string } }>('groups', v), onSuccess: (r) => nav(`/social/groups/${r.group.slug}`), onError: (e) => setErr((e as Error).message) });
  return (
    <Dialog open={open} onClose={onClose} title="Create a group" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Create</Button></>}>
      <div className="space-y-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Name">{(id) => <Input id={id} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="Description">{(id) => <Textarea id={id} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visibility">{(id) => <Select id={id} value={v.visibility} onChange={(e) => setV({ ...v, visibility: e.target.value })}><option value="public">Public — anyone can join</option><option value="private">Private — approval needed</option></Select>}</Field>
          <Field label="Type">{(id) => <Select id={id} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="community">Community</option>{me?.roles.some((r) => r === 'creator' || r === 'admin') && <option value="creator_channel">Creator channel</option>}</Select>}</Field>
        </div>
      </div>
    </Dialog>
  );
}

export function GroupPage() {
  const { slug } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['group', slug], queryFn: () => get<{ group: GroupItem & { ownerId: string }; membership: { role: string; status: string } | null; canSee: boolean; posts: PostView[]; members: { userId: string; role: string; displayName?: string; handle?: string; avatarUrl?: string | null }[]; pending: { userId: string; displayName?: string }[]; events: { id: string; title: string; startsAt: string }[] }>(`groups/${slug}`) });
  const join = useMutation({ mutationFn: () => post<{ status: string }>(`groups/${q.data!.group.id}/join`), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['group', slug] }); toast(r.status === 'active' ? 'Joined' : 'Request sent', 'success'); } });
  const leave = useMutation({ mutationFn: () => post(`groups/${q.data!.group.id}/leave`), onSuccess: () => qc.invalidateQueries({ queryKey: ['group', slug] }) });
  const moderate = useMutation({ mutationFn: ({ userId, action }: { userId: string; action: string }) => post(`groups/${q.data!.group.id}/members/${userId}`, { action }), onSuccess: () => qc.invalidateQueries({ queryKey: ['group', slug] }) });
  return (
    <QueryState q={q}>{(d) => {
      const active = d.membership?.status === 'active';
      const mod = active && ['owner', 'moderator'].includes(d.membership!.role);
      return (
        <div>
          <PageHeader kicker={d.group.kind === 'creator_channel' ? 'Creator channel' : 'Group'} title={d.group.name} subtitle={d.group.description}
            actions={!d.membership ? <Button onClick={() => join.mutate()} loading={join.isPending}>{d.group.visibility === 'public' ? 'Join' : 'Request to join'}</Button> : d.membership.status === 'pending' ? <Badge tone="warning">Request pending</Badge> : d.membership.role !== 'owner' ? <Button variant="ghost" onClick={() => leave.mutate()}>Leave</Button> : <Badge tone="accent">Owner</Badge>} />
          {!d.canSee ? <Notice tone="info">This group is private. Members’ posts are visible once your request is approved.</Notice> : (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="space-y-4">{active && <Composer groupId={d.group.id} />}{d.posts.map((p) => <PostCard key={p.id} p={p} compact />)}{!d.posts.length && <EmptyState icon="social" title="No posts yet" />}</div>
              <aside className="space-y-4">
                {mod && d.pending.length > 0 && <Card><h2 className="font-display text-2xl">Requests</h2><ul className="mt-2 space-y-2">{d.pending.map((p) => <li key={p.userId} className="flex items-center justify-between text-sm"><span>{p.displayName}</span><span className="flex gap-1"><Button size="sm" onClick={() => moderate.mutate({ userId: p.userId, action: 'approve' })}>Approve</Button><Button size="sm" variant="ghost" onClick={() => moderate.mutate({ userId: p.userId, action: 'remove' })}>Decline</Button></span></li>)}</ul></Card>}
                <Card><h2 className="font-display text-2xl">Members ({d.members.length})</h2><ul className="mt-2 space-y-2">{d.members.slice(0, 30).map((m) => <li key={m.userId} className="flex items-center gap-2 text-sm"><Avatar name={m.displayName} src={m.avatarUrl} size={26} /><Link to={`/u/${m.handle}`} className="flex-1 truncate text-fg-2 hover:text-fg">{m.displayName}</Link>{m.role !== 'member' && <Badge>{m.role}</Badge>}{mod && m.role === 'member' && <button type="button" className="text-xs text-fg-3 hover:text-danger" onClick={() => moderate.mutate({ userId: m.userId, action: 'ban' })}>Ban</button>}</li>)}</ul></Card>
                {d.events.length > 0 && <Card><h2 className="font-display text-2xl">Upcoming events</h2><ul className="mt-2 space-y-1 text-sm">{d.events.map((e) => <li key={e.id}><Link to="/social/events" className="text-fg-2 hover:text-fg">{e.title}</Link> <span className="text-fg-3">{dateTime(e.startsAt)}</span></li>)}</ul></Card>}
              </aside>
            </div>
          )}
        </div>
      );
    }}</QueryState>
  );
}

interface EventItem { id: string; title: string; description: string; startsAt: string; endsAt: string; mode: string; location: string | null; liveUrl: string | null; capacity: number | null; kind: string; host?: { displayName: string; handle: string }; myRsvp: string | null; going: number; hostId: string }

export function EventsPage() {
  const me = useMe().data?.user;
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState<EventItem | null>(null);
  const q = useQuery({ queryKey: ['events'], queryFn: () => get<{ events: EventItem[] }>('events') });
  const rsvp = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => post(`events/${id}/rsvp`, { status }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); toast('RSVP updated', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <div>
      <PageHeader kicker="Community" title="Events" subtitle="Workshops, live classes and gatherings. Live links are shown only to people who RSVP." actions={<Button icon="plus" onClick={() => setCreating(true)}>Host an event</Button>} />
      <QueryState q={q} empty={(d) => (!d.events.length ? <EmptyState icon="calendar" title="No upcoming events" body="Host the first one." /> : null)}>{(d) => (
        <ul className="grid gap-4 md:grid-cols-2">{d.events.map((e) => (
          <li key={e.id} className="card p-5">
            <div className="flex items-start justify-between gap-3"><h2 className="font-display text-2xl">{e.title}</h2><Badge tone="violet">{e.kind.replace('_', ' ')}</Badge></div>
            <p className="mt-1 text-sm text-accent">{dateTime(e.startsAt)} – {dateTime(e.endsAt)}</p>
            <p className="mt-2 text-sm text-fg-2">{e.description}</p>
            <p className="mt-2 text-xs text-fg-3">{e.mode === 'online' ? 'Online' : e.location} · hosted by {e.host?.displayName} · {e.going}{e.capacity ? `/${e.capacity}` : ''} going</p>
            {e.liveUrl && <p className="mt-2 text-sm"><a href={e.liveUrl} target="_blank" rel="noreferrer noopener" className="text-accent underline">Join link</a> <span className="text-xs text-fg-3">(external site)</span></p>}
            <div className="mt-3 flex gap-2">
              {e.hostId === me?.id ? <Button size="sm" variant="secondary" onClick={() => setManage(e)}>Manage attendance</Button> : (<>
                <Button size="sm" variant={e.myRsvp === 'going' ? 'secondary' : 'primary'} onClick={() => rsvp.mutate({ id: e.id, status: e.myRsvp === 'going' ? 'cancelled' : 'going' })}>{e.myRsvp === 'going' ? 'Cancel RSVP' : 'RSVP'}</Button>
                {e.myRsvp !== 'interested' && e.myRsvp !== 'going' && <Button size="sm" variant="ghost" onClick={() => rsvp.mutate({ id: e.id, status: 'interested' })}>Interested</Button>}
              </>)}
            </div>
          </li>
        ))}</ul>
      )}</QueryState>
      <CreateEventDialog open={creating} onClose={() => setCreating(false)} />
      {manage && <AttendanceDialog event={manage} onClose={() => setManage(null)} />}
    </div>
  );
}

function CreateEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ title: '', description: '', startsAt: '', endsAt: '', mode: 'online', location: '', liveUrl: '', capacity: '', kind: 'community' });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => post('events', { ...v, startsAt: new Date(v.startsAt).toISOString(), endsAt: new Date(v.endsAt).toISOString(), capacity: v.capacity ? Number(v.capacity) : undefined, liveUrl: v.liveUrl || undefined, location: v.location || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['events'] }); onClose(); }, onError: (e) => setErr((e as Error).message),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Host an event" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Create</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {err && <Notice tone="danger" className="sm:col-span-2">{err}</Notice>}
        <Field label="Title" className="sm:col-span-2">{(id) => <Input id={id} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Starts">{(id) => <Input id={id} type="datetime-local" value={v.startsAt} onChange={(e) => setV({ ...v, startsAt: e.target.value })} />}</Field>
        <Field label="Ends">{(id) => <Input id={id} type="datetime-local" value={v.endsAt} onChange={(e) => setV({ ...v, endsAt: e.target.value })} />}</Field>
        <Field label="Format">{(id) => <Select id={id} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}><option value="online">Online</option><option value="in_person">In person</option></Select>}</Field>
        <Field label="Type">{(id) => <Select id={id} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="community">Community</option><option value="workshop">Workshop</option><option value="live_class">Live class</option><option value="challenge">Challenge</option></Select>}</Field>
        {v.mode === 'online' ? <Field label="Live link (external)" className="sm:col-span-2" hint="Nakshatra doesn’t host video. Paste a link from your own provider.">{(id, d) => <Input id={id} aria-describedby={d} type="url" value={v.liveUrl} onChange={(e) => setV({ ...v, liveUrl: e.target.value })} />}</Field> : <Field label="Location" className="sm:col-span-2">{(id) => <Input id={id} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />}</Field>}
        <Field label="Capacity (optional)">{(id) => <Input id={id} type="number" min={1} value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />}</Field>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

function AttendanceDialog({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const q = useQuery({ queryKey: ['attendees', event.id], queryFn: () => get<{ attendees: { userId: string; status: string; displayName?: string }[] }>(`events/${event.id}/attendees`) });
  const [sel, setSel] = useState<string[]>([]);
  const toast = useToast();
  const m = useMutation({ mutationFn: () => post(`events/${event.id}/attendance`, { userIds: sel }), onSuccess: () => { toast('Attendance recorded', 'success'); onClose(); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <Dialog open onClose={onClose} title="Record attendance" description="Attendance unlocks the events achievement for attendees." footer={<Button loading={m.isPending} disabled={!sel.length} onClick={() => m.mutate()}>Mark attended</Button>}>
      <QueryState q={q}>{(d) => <ul className="space-y-2">{d.attendees.map((a) => <li key={a.userId}><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={a.status !== 'going'} checked={sel.includes(a.userId)} onChange={(e) => setSel(e.target.checked ? [...sel, a.userId] : sel.filter((x) => x !== a.userId))} className="accent-[var(--accent)]" />{a.displayName} <span className="text-fg-3">({a.status})</span></label></li>)}</ul>}</QueryState>
    </Dialog>
  );
}

export function FollowRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['follow-requests'], queryFn: () => get<{ requests: { userId: string; displayName?: string; handle?: string; avatarUrl?: string | null }[] }>('follows/requests') });
  const m = useMutation({ mutationFn: ({ userId, accept }: { userId: string; accept: boolean }) => post(`follows/requests/${userId}`, { accept }), onSuccess: () => qc.invalidateQueries({ queryKey: ['follow-requests'] }) });
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Follow requests" />
      <QueryState q={q} empty={(d) => (!d.requests.length ? <EmptyState icon="users" title={t('state.empty')} /> : null)}>{(d) => (
        <ul className="space-y-2">{d.requests.map((r) => <li key={r.userId} className="card flex items-center gap-3 p-3"><Avatar name={r.displayName} src={r.avatarUrl} size={40} /><Link to={`/u/${r.handle}`} className="flex-1 text-fg">{r.displayName}</Link><Button size="sm" onClick={() => m.mutate({ userId: r.userId, accept: true })}>Accept</Button><Button size="sm" variant="ghost" onClick={() => m.mutate({ userId: r.userId, accept: false })}>Decline</Button></li>)}</ul>
      )}</QueryState>
    </div>
  );
}
