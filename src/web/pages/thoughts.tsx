import { Fragment, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post } from '../lib/api';
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Select, Switch, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, LoadingBlock, Notice, QueryState } from '../components/ui/feedback';
import { Dialog, Segmented, useToast } from '../components/ui/overlays';
import { MaskIcon, PseudonymAvatar } from '../components/visual';
import { postTypeIcon } from '../lib/visual';
import { PhotoCarousel, PhotoPicker, VoiceRecorder } from '../components/MediaComposer';
import { SponsoredCard } from '../components/SponsoredCard';
import { AD_RULES } from '../../shared/ads';

export const THOUGHT_TYPES = [
  { value: 'thought', label: 'Thought', hint: 'Something on your mind.' },
  { value: 'question', label: 'Question', hint: 'Ask people for answers.' },
  { value: 'dilemma', label: 'Dilemma', hint: 'Help me decide…' },
  { value: 'poll', label: 'Poll', hint: '2–4 options to vote on.' },
  { value: 'image', label: 'Photo', hint: 'Say something about your photos (optional).' },
  { value: 'voice', label: 'Voice', hint: 'Add a caption (optional).' },
  { value: 'confession', label: 'Confession', hint: 'A light, harmless truth about you.' },
] as const;
type ThoughtType = (typeof THOUGHT_TYPES)[number]['value'];
const TYPE_LABEL: Record<string, string> = { thought: 'Thought', question: 'Question', dilemma: 'Dilemma', poll: 'Poll', confession: 'Confession', prompt: 'Prompt', text: 'Post', cosmic_card: 'Cosmic card', image: 'Photo', voice: 'Voice note' };
const REACTIONS = [{ k: 'star', label: 'Relate' }, { k: 'sun', label: 'Agree' }, { k: 'moon', label: 'Hmm' }, { k: 'heart', label: 'Love' }] as const;
/* Six sparks, evenly spread, for the reaction burst (styles/app.css .react-burst). */
const SPARKS = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + 0.3; return { '--dx': `${Math.round(Math.cos(a) * 22)}px`, '--dy': `${Math.round(Math.sin(a) * 18)}px` } as React.CSSProperties; });
const SOCIAL_TOPICS = ['life', 'friendship', 'work', 'study', 'music', 'film', 'food', 'travel', 'tech', 'sport', 'fun', 'relationships'];

export interface ThoughtPost {
  id: string; kind: string; body: string; topics: string[]; visibility: string; groupId: string | null; createdAt: string; editedAt: string | null; pseudonymous: boolean;
  author: { userId?: string; handle?: string; displayName?: string; pseudonym?: string };
  reactions: Record<string, number>; myReaction: string | null; commentCount: number; saved: boolean;
  poll: { id: string; label: string; votes: number }[] | null; myVote: string | null; isMine: boolean; reasons: string[];
  imageUrl?: string | null; imageUrls?: string[] | null; audioUrl?: string | null; audioSeconds?: number | null;
}

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`;
}

export function Composer({ circleId, circleName, channelId, onPosted, defaultType = 'thought', prefill = '' }: { circleId?: string; circleName?: string; channelId?: string | null; onPosted?: () => void; defaultType?: ThoughtType; prefill?: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<ThoughtType>(defaultType);
  const [body, setBody] = useState(prefill);
  const [options, setOptions] = useState(['', '']);
  const [topic, setTopic] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [voice, setVoice] = useState<{ url: string; seconds: number } | null>(null);
  const circles = useQuery({ queryKey: ['circles'], queryFn: () => get<{ circles: { id: string; name: string }[] }>('circles'), enabled: !circleId });
  const id = useQuery({ queryKey: ['identity-me'], queryFn: () => get<{ pseudonym: string | null }>('identity/me') });
  const [where, setWhere] = useState(circleId ? `circle:${circleId}` : 'public');
  const [pseudo, setPseudo] = useState(false);
  const limit = type === 'poll' ? 2000 : 500;
  const m = useMutation({
    mutationFn: () => {
      const [vis, gid] = where.startsWith('circle:') ? ['group', where.slice(7)] : [where, undefined];
      return post('posts', {
        kind: type, body, visibility: vis, groupId: gid, channelId: gid && channelId ? channelId : undefined, topics: topic ? [topic] : [], pseudonymous: pseudo,
        pollOptions: type === 'poll' ? options.filter(Boolean) : undefined,
        ...(type === 'image' ? (photos.length > 1 ? { imageUrls: photos } : { imageUrl: photos[0] }) : {}),
        ...(type === 'voice' && voice ? { audioUrl: voice.url, audioSeconds: voice.seconds } : {}),
      });
    },
    onSuccess: () => {
      setBody(''); setOptions(['', '']); setPseudo(false); setPhotos([]); setVoice(null);
      void qc.invalidateQueries({ queryKey: ['thoughts'] });
      void qc.invalidateQueries({ queryKey: ['circle-feed'] });
      toast('Posted', 'success');
      onPosted?.();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not post', 'error'),
  });
  const visText = where === 'public' ? 'Any signed-in Nakshatra member — even if your profile is private (that only hides your profile page)' : where === 'followers' ? 'Only people who follow you' : `Only members of ${circleName ?? circles.data?.circles.find((c) => `circle:${c.id}` === where)?.name ?? 'this circle'}`;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Post type">
        {THOUGHT_TYPES.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => setType(t.value)}
            className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors', type === t.value ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2 hover:border-line-strong')}><MaskIcon src={postTypeIcon(t.value)} size={14} />{t.label}</button>
        ))}
      </div>
      <label className="block">
        <span className="sr-only">Your {TYPE_LABEL[type]}</span>
        <Textarea rows={3} value={body} maxLength={limit} onChange={(e) => setBody(e.target.value)} placeholder={THOUGHT_TYPES.find((t) => t.value === type)!.hint} />
      </label>
      <div className="flex justify-end text-[11px] text-fg-3 numeric">{body.length}/{limit}</div>
      {type === 'image' && <PhotoPicker urls={photos} onChange={setPhotos} />}
      {type === 'voice' && <VoiceRecorder value={voice} onChange={setVoice} />}
      {type === 'poll' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o, i) => <Input key={i} aria-label={`Option ${i + 1}`} value={o} maxLength={80} placeholder={`Option ${i + 1}`} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />)}
          {options.length < 4 && <Button variant="ghost" size="sm" onClick={() => setOptions([...options, ''])}>Add option</Button>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {!circleId && (
          <Field label="Who can see this">{(fid) => (
            <Select id={fid} value={where} onChange={(e) => { setWhere(e.target.value); if (e.target.value === 'followers' || e.target.value === 'close_friends') setPseudo(false); }}>
              <option value="public">Public</option>
              <option value="followers">Followers</option>
              <option value="close_friends">Close friends</option>
              {circles.data?.circles.map((c) => <option key={c.id} value={`circle:${c.id}`}>Circle: {c.name}</option>)}
            </Select>
          )}</Field>
        )}
        <Field label="Topic (optional)">{(fid) => <Select id={fid} value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">None</option>{SOCIAL_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}</Select>}</Field>
      </div>
      {where === 'close_friends' && <p className="text-xs text-fg-3">Only people on your close-friends list will see this. <Link to="/close-friends" className="underline underline-offset-2">Edit the list</Link></p>}
      {where !== 'followers' && where !== 'close_friends' && (
        id.data?.pseudonym
          ? <Switch label={`Post as “${id.data.pseudonym}” (pen name)`} checked={pseudo} onChange={setPseudo} description="Other members see only your pen name. Nakshatra keeps the link to your account for safety, so this is pseudonymous, not anonymous." />
          : <p className="text-xs text-fg-3">Want to post under a pen name? <Link to="/identity" className="text-accent underline underline-offset-2">Set one in Identity Studio</Link>.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-fg-2"><span className="text-fg">Visible to:</span> {visText}{pseudo ? ' · shown under your pen name' : ''}</p>
        <Button loading={m.isPending} disabled={type === 'image' ? !photos.length : type === 'voice' ? !voice : !body.trim() || (type === 'poll' && options.filter(Boolean).length < 2)} onClick={() => m.mutate()}>Post</Button>
      </div>
    </Card>
  );
}

export function ReportDialog({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: string; targetId: string }) {
  const toast = useToast();
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const m = useMutation({ mutationFn: () => post('reports', { targetType, targetId, reason, details }), onSuccess: () => { toast('Reported. Thank you — a moderator will review it.', 'success'); onClose(); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not report', 'error') });
  return (
    <Dialog open={open} onClose={onClose} title="Report" description="The person you report is never told who reported them." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Send report</Button></>}>
      <Field label="Reason">{(id) => <Select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>{['harassment', 'hate', 'spam', 'self_harm', 'impersonation', 'inappropriate', 'other'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</Select>}</Field>
      <Field label="Details (optional)" className="mt-3">{(id) => <Textarea id={id} rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>
    </Dialog>
  );
}

export function ThoughtCard({ p, linkToDetail = true }: { p: ThoughtPost; linkToDetail?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.body);
  const [burst, setBurst] = useState<{ k: string; n: number } | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['thoughts'] }); void qc.invalidateQueries({ queryKey: ['circle-feed'] }); void qc.invalidateQueries({ queryKey: ['thought', p.id] }); void qc.invalidateQueries({ queryKey: ['saved-posts'] }); void qc.invalidateQueries({ queryKey: ['collection'] }); };
  const act = (fn: () => Promise<unknown>, ok?: string) => fn().then(() => { refresh(); if (ok) toast(ok, 'success'); }).catch((e) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error'));
  const name = p.author.pseudonym ?? p.author.displayName ?? 'Member';
  const canEdit = p.isMine && p.kind !== 'poll' && Date.now() - Date.parse(p.createdAt) < 15 * 60000;
  return (
    <article className="card p-5" aria-label={`${TYPE_LABEL[p.kind] ?? 'Post'} by ${name}`}>
      <header className="flex items-center gap-3 text-sm">
        {/* Pseudonymous posts never show archetype art, accent colour or level — only the dashed eye-off ring. */}
        {p.pseudonymous && !p.isMine ? <PseudonymAvatar size={36} /> : <Avatar name={name} size={36} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            {p.author.handle ? <Link to={`/i/${p.author.handle}`} className="font-semibold text-fg hover:underline">{name}</Link> : <span className="font-semibold text-fg">{name}</span>}
            {p.pseudonymous && <Badge tone="neutral">Pen name</Badge>}
            {p.groupId && <Badge tone="neutral">Circle</Badge>}
            {p.visibility === 'close_friends' && <Badge tone="success">Close friends</Badge>}
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">{TYPE_LABEL[p.kind] ?? p.kind} · {ago(p.createdAt)}{p.editedAt ? ' · edited' : ''}</p>
        </div>
        <MaskIcon src={postTypeIcon(p.kind)} size={16} label={TYPE_LABEL[p.kind] ?? 'Post'} className="text-fg-3" />
      </header>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={3} value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} aria-label="Edit post" />
          <div className="flex gap-2"><Button size="sm" onClick={() => act(() => patch(`posts/${p.id}`, { body: draft }), 'Edited').then(() => setEditing(false))}>Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </div>
      ) : p.kind === 'confession'
        ? <p className="mt-3 whitespace-pre-wrap font-display text-2xl italic leading-snug text-fg text-pretty">“{p.body}”</p>
        : p.body ? <p className="mt-3 whitespace-pre-wrap text-[17px] leading-[1.45] text-fg text-pretty">{p.body}</p> : null}
      {p.imageUrls && p.imageUrls.length > 1 ? <PhotoCarousel urls={p.imageUrls} label={`${TYPE_LABEL[p.kind] ?? 'Post'} photos`} />
        : p.imageUrl ? <img src={p.imageUrl} alt="Photo shared with this post" loading="lazy" className="mt-3 max-h-[480px] w-full rounded-[var(--radius)] object-cover" /> : null}
      {p.audioUrl && (
        <div className="mt-3 flex items-center gap-3">
          <audio controls preload="none" src={p.audioUrl} className="h-10 max-w-full" aria-label={`Voice note, ${p.audioSeconds ?? ''} seconds`} />
          {p.audioSeconds ? <span className="text-xs text-fg-3 numeric">{p.audioSeconds}s</span> : null}
        </div>
      )}
      {p.poll && (
        <ul className="mt-3 space-y-1.5">
          {p.poll.map((o) => {
            const total = p.poll!.reduce((t, x) => t + x.votes, 0) || 1;
            const voted = Boolean(p.myVote);
            return (
              <li key={o.id}>
                <button type="button" disabled={voted} onClick={() => act(() => post(`posts/${p.id}/vote`, { optionId: o.id }))} className={cx('relative w-full overflow-hidden rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm', p.myVote === o.id ? 'border-accent' : 'border-line hover:border-line-strong')}>
                  {voted && <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${(o.votes / total) * 100}%` }} />}
                  <span className="relative flex justify-between"><span>{o.label}</span>{voted && <span className="numeric text-fg-3">{Math.round((o.votes / total) * 100)}%</span>}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {p.reasons.length > 0 && <p className="mt-2 text-[11px] text-fg-3">Why you see this: {p.reasons.slice(0, 2).join(' · ')}</p>}
      <footer className="mt-4 flex flex-wrap items-center gap-1.5">
        {REACTIONS.map((r) => (
          <button key={r.k} type="button" aria-pressed={p.myReaction === r.k} onClick={() => { const adding = p.myReaction !== r.k; setBurst(adding ? { k: r.k, n: Date.now() } : null); act(() => post(`posts/${p.id}/react`, { kind: adding ? r.k : null })); }}
            className={cx('relative min-h-9 rounded-full border px-3 text-xs transition-colors', p.myReaction === r.k ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2 hover:border-line-strong', burst?.k === r.k && 'react-pop')}>
            {r.label}{p.reactions[r.k] ? <span className="ml-1 numeric text-fg-3">{p.reactions[r.k]}</span> : null}
            {burst?.k === r.k && <span key={burst.n} className="react-burst" data-kind={r.k} aria-hidden="true">{SPARKS.map((s, i) => <i key={i} style={s} />)}</span>}
          </button>
        ))}
        {linkToDetail && <Link to={`/thoughts/${p.id}`} className="ml-1 min-h-9 rounded-full px-3 py-2 text-xs text-fg-2 hover:text-fg">{p.commentCount ? `${p.commentCount} repl${p.commentCount === 1 ? 'y' : 'ies'}` : 'Reply'}</Link>}
        <span className="ml-auto flex flex-wrap gap-1">
          <button type="button" className="min-h-9 rounded-full px-2 text-xs text-fg-3 hover:text-fg" aria-pressed={p.saved} onClick={() => act(() => post(`posts/${p.id}/save`, { saved: !p.saved }), p.saved ? 'Removed from saved' : 'Saved')}>{p.saved ? 'Saved' : 'Save'}</button>
          <button type="button" className="min-h-9 rounded-full px-2 text-xs text-fg-3 hover:text-fg" onClick={() => setPicking(true)}>Save to…</button>
          {canEdit && <button type="button" className="min-h-9 rounded-full px-2 text-xs text-fg-3 hover:text-fg" onClick={() => setEditing(true)}>Edit</button>}
          {p.isMine
            ? <button type="button" className="min-h-9 rounded-full px-2 text-xs text-fg-3 hover:text-danger" onClick={() => act(() => del(`posts/${p.id}`), 'Deleted')}>Delete</button>
            : <>
              <button type="button" className="min-h-9 rounded-full px-2 text-xs text-fg-3 hover:text-fg" onClick={() => act(() => post(`posts/${p.id}/mute-author`, {}), 'Muted — you will not see their posts')}>Mute author</button>
              <button type="button" className="min-h-9 rounded-full px-2 text-xs text-fg-3 hover:text-danger" onClick={() => setReporting(true)}>Report</button>
            </>}
        </span>
      </footer>
      {picking && <SaveToDialog postId={p.id} onClose={() => { setPicking(false); refresh(); }} />}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="post" targetId={p.id} />
    </article>
  );
}

export function ThoughtsPage() {
  const [mode, setMode] = useState<'ranked' | 'chronological'>('ranked');
  const [topic, setTopic] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['thoughts', mode, topic],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => get<{ posts: ThoughtPost[]; nextOffset: number | null; rankingExplanation: string }>(`feed?mode=${mode}&limit=15&offset=${pageParam}${topic ? `&topic=${topic}` : ''}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <img src="/visual/social/social-thought-header.svg" alt="" aria-hidden="true" width={1200} height={630} className="mb-2 aspect-[16/5] w-full rounded-[var(--radius-xl)] border border-line bg-surface-2 object-cover" />
      <PageHeader kicker="Thought Network" title="Say what you really think" subtitle="Short Thought Drops, questions, dilemmas and polls — from people you follow, your circles and the wider Nakshatra." />
      <Composer />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Feed order" value={mode} onChange={setMode} options={[{ value: 'ranked', label: 'For you' }, { value: 'chronological', label: 'Newest' }]} />
        <label className="flex items-center gap-2 text-sm text-fg-2"><span>Topic</span><Select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Filter by topic"><option value="">All</option>{SOCIAL_TOPICS.map((t) => <option key={t}>{t}</option>)}</Select></label>
      </div>
      {q.data?.pages[0] && mode === 'ranked' && <p className="mt-2 text-xs text-fg-3">{q.data.pages[0].rankingExplanation}</p>}
      <div className="mt-4 space-y-4">
        {q.isLoading ? <LoadingBlock lines={5} /> : q.error ? <Notice tone="danger">Could not load the feed.</Notice> : posts.length === 0
          ? <EmptyState icon="social" title="Nothing here yet" body="Drop the first thought, follow people whose takes you enjoy, or start a circle with friends." />
          : posts.map((p, i) => <Fragment key={p.id}><ThoughtCard p={p} />{i === AD_RULES.minPostsBetweenAds - 1 && <SponsoredCard topic={topic} />}</Fragment>)}
      </div>
      {q.hasNextPage && <div className="mt-6 text-center"><Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
    </div>
  );
}

interface Reply { id: string; parentId: string | null; body: string; createdAt: string; author: { displayName?: string; handle?: string }; isMine: boolean }

export function ThoughtDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['thought', id], queryFn: () => get<{ post: ThoughtPost; comments: Reply[] }>(`posts/${id}`) });
  const [text, setText] = useState('');
  const [parent, setParent] = useState<Reply | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => post(`posts/${id}/comments`, { body: text, parentId: parent?.id }),
    onSuccess: () => { setText(''); setParent(null); void qc.invalidateQueries({ queryKey: ['thought', id] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not reply', 'error'),
  });
  const depthOf = (r: Reply, all: Reply[]): number => (r.parentId ? 1 + depthOf(all.find((x) => x.id === r.parentId) ?? { ...r, parentId: null }, all) : 0);
  const ordered = (all: Reply[], parentId: string | null = null): Reply[] => all.filter((r) => r.parentId === parentId).flatMap((r) => [r, ...ordered(all, r.id)]);
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/thoughts" className="text-sm text-fg-2 hover:text-fg">← Thoughts</Link>
      <QueryState q={q}>{(d) => (
        <div className="mt-4 space-y-6">
          <ThoughtCard p={d.post} linkToDetail={false} />
          <section aria-labelledby="replies">
            <h2 id="replies" className="font-display text-2xl">Replies</h2>
            {d.comments.length === 0 && <p className="mt-2 text-sm text-fg-3">No replies yet. Be the first.</p>}
            <ul className="mt-3 space-y-2">
              {ordered(d.comments).map((r) => {
                const depth = depthOf(r, d.comments);
                return (
                  <li key={r.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-3" style={{ marginLeft: `${Math.min(depth, 2) * 20}px` }}>
                    <p className="text-xs text-fg-3">{r.author.displayName ?? 'Member'} · {ago(r.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{r.body}</p>
                    <div className="mt-1 flex gap-2">
                      {depth < 2 && <button type="button" className="text-xs text-accent hover:underline" onClick={() => setParent(r)}>Reply</button>}
                      {!r.isMine && <button type="button" className="text-xs text-fg-3 hover:text-danger" onClick={() => setReporting(r.id)}>Report</button>}
                      {r.isMine && <button type="button" className="text-xs text-fg-3 hover:text-danger" onClick={() => del(`comments/${r.id}`).then(() => qc.invalidateQueries({ queryKey: ['thought', id] }))}>Delete</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Card className="mt-4 space-y-2">
              {parent && <p className="text-xs text-fg-2">Replying to {parent.author.displayName ?? 'a member'} · <button type="button" className="text-accent underline underline-offset-2" onClick={() => setParent(null)}>cancel</button></p>}
              <label className="block"><span className="sr-only">Your reply</span><Textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a thoughtful reply" /></label>
              <div className="flex justify-end"><Button loading={m.isPending} disabled={!text.trim()} onClick={() => m.mutate()}>Reply</Button></div>
            </Card>
          </section>
          {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="comment" targetId={reporting} />}
        </div>
      )}</QueryState>
    </div>
  );
}

/** "Save to…": add or remove this post from your collections, or start a new one. */
function SaveToDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const q = useQuery({ queryKey: ['post-collections', postId], queryFn: () => get<{ collections: { id: string; name: string; contains: boolean }[] }>(`posts/${postId}/collections`) });
  const done = () => { void qc.invalidateQueries({ queryKey: ['post-collections', postId] }); void qc.invalidateQueries({ queryKey: ['collections'] }); };
  const err = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error');
  const toggle = useMutation({ mutationFn: ({ id, on }: { id: string; on: boolean }) => (on ? post(`collections/${id}/items`, { postId }) : del(`collections/${id}/items/${postId}`)), onSuccess: done, onError: err });
  const create = useMutation({
    mutationFn: async () => { const r = await post<{ collection: { id: string } }>('collections', { name }); await post(`collections/${r.collection.id}/items`, { postId }); },
    onSuccess: () => { setName(''); done(); toast('Saved to a new collection', 'success'); }, onError: err,
  });
  return (
    <Dialog open onClose={onClose} title="Save to a collection" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        {q.data?.collections.length ? (
          <ul className="space-y-1">{q.data.collections.map((c) => (
            <li key={c.id}><label className="flex min-h-10 items-center gap-2 text-sm text-fg"><input type="checkbox" checked={c.contains} onChange={(e) => toggle.mutate({ id: c.id, on: e.target.checked })} />{c.name}</label></li>
          ))}</ul>
        ) : q.data ? <p className="text-sm text-fg-2">No collections yet — name your first one below.</p> : null}
        <div className="flex gap-2"><Input aria-label="New collection name" placeholder="New collection" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /><Button variant="secondary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>Create</Button></div>
        <p className="text-xs text-fg-3">Collections are private unless you put one on your profile. <Link to="/saved" className="underline underline-offset-2" onClick={onClose}>Manage</Link></p>
      </div>
    </Dialog>
  );
}
