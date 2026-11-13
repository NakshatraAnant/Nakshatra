import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post, put } from '../lib/api';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { COLLAB_RULES as R } from '../../shared/collab';

interface Member { userId: string; name: string; handle: string | null; status: 'invited' | 'accepted' | 'declined' | 'removed'; line: string; you: boolean }
interface Collab {
  id: string; status: 'draft' | 'published' | 'cancelled'; opening: string; visibility: 'public' | 'followers'; postId: string | null; isOwner: boolean;
  owner: { userId: string; name: string }; myStatus: 'owner' | Member['status']; members: Member[]; preview: string; updatedAt: string;
}
const STATUS: Record<Collab['status'], { label: string; tone: 'warning' | 'success' | 'neutral' }> = { draft: { label: 'In progress', tone: 'warning' }, published: { label: 'Published', tone: 'success' }, cancelled: { label: 'Cancelled', tone: 'neutral' } };
const MEMBER: Record<Member['status'], string> = { invited: 'Invited — not answered yet', accepted: 'Writing', declined: 'Declined', removed: 'Removed' };

/** Collaborative Drops: start one, or pick up ones you started or were invited to. */
export function CollabsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['collabs'], queryFn: () => get<{ collabs: Collab[] }>('collabs') });
  const [opening, setOpening] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const start = useMutation({
    mutationFn: () => post<{ collab: Collab }>('collabs', { opening, visibility }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['collabs'] }); nav(`/create/together/${r.collab.id}`); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not start it', 'error'),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader kicker="Create" title="Write a drop together" subtitle={`You write the opening, up to ${R.maxCollaborators} people you’re connected with add a line each, and you publish it as one Thought Drop.`} />
      <Card className="space-y-3" aria-label="Start a Collaborative Drop">
        <Field label="Your opening">{(id) => <Textarea id={id} rows={2} maxLength={R.openingMax} value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Best small joy this week?" />}</Field>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field label="Who will see it once published">{(id) => <Select id={id} value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'followers')}><option value="public">Public</option><option value="followers">Your followers</option></Select>}</Field>
          <Button disabled={!opening.trim()} loading={start.isPending} onClick={() => start.mutate()}>Start and invite people</Button>
        </div>
      </Card>
      <section aria-labelledby="collabs-h" className="space-y-3">
        <h2 id="collabs-h" className="font-display text-2xl">Yours and invitations</h2>
        <QueryState q={q} empty={(d) => (d.collabs.length ? null : <EmptyState icon="social" title="Nothing in progress" body="Start one above, or wait for an invitation." />)}>{(d) => (
          <ul className="space-y-2">{d.collabs.map((c) => (
            <li key={c.id}><Link to={`/create/together/${c.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-line-strong">
              <span className="min-w-0"><span className="block truncate text-fg">{c.opening}</span><span className="text-xs text-fg-3">{c.isOwner ? 'Started by you' : `Started by ${c.owner.name}`} · {c.members.filter((m) => m.status === 'accepted').length} writing</span></span>
              <span className="flex gap-2">{c.myStatus === 'invited' && <Badge tone="accent">You’re invited</Badge>}<Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge></span>
            </Link></li>
          ))}</ul>
        )}</QueryState>
      </section>
    </div>
  );
}

/** One Collaborative Drop: who is in it, each person's line, a live preview, and the owner's controls. */
export function CollabPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['collab', id], queryFn: () => get<{ collab: Collab }>(`collabs/${id}`), retry: false, refetchInterval: (query) => (query.state.data?.collab.status === 'draft' ? 8000 : false) });
  const invitable = useQuery({ queryKey: ['collab-invitable'], queryFn: () => get<{ people: { userId: string; name: string; handle: string }[] }>('collabs/invitable'), enabled: !!q.data?.collab.isOwner && q.data.collab.status === 'draft' });
  const [pick, setPick] = useState('');
  const [line, setLine] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['collab', id] }); void qc.invalidateQueries({ queryKey: ['collabs'] }); };
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh, onError: fail });
  const publish = useMutation({
    mutationFn: () => post<{ postId: string }>(`collabs/${id}/publish`),
    onSuccess: (r) => { refresh(); void qc.invalidateQueries({ queryKey: ['thoughts'] }); toast('Published', 'success'); nav(`/thoughts/${r.postId}`); },
    onError: fail,
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <QueryState q={q}>{({ collab: c }) => {
        const draft = c.status === 'draft';
        const mine = c.members.find((m) => m.you);
        const active = c.members.filter((m) => m.status === 'invited' || m.status === 'accepted');
        const written = c.members.filter((m) => m.status === 'accepted' && m.line.trim()).length;
        const options = (invitable.data?.people ?? []).filter((p) => !active.some((m) => m.userId === p.userId));
        return (
          <>
            <PageHeader kicker={<span className="inline-flex items-center gap-2">Collaborative Drop <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge></span>} title={c.isOwner ? 'Your drop, written together' : `Writing with ${c.owner.name}`}
              subtitle={c.status === 'published' ? 'This drop is live.' : c.status === 'cancelled' ? 'This collaboration was cancelled. Nothing was posted.' : 'Nothing is posted until the person who started it publishes.'} />
            {c.myStatus === 'invited' && draft && (
              <Notice tone="info" title={`${c.owner.name} invited you to add a line`}>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" loading={act.isPending} onClick={() => act.mutate(() => post(`collabs/${c.id}/respond`, { accept: true }))}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => act.mutate(() => post(`collabs/${c.id}/respond`, { accept: false }).then(() => nav('/create/together')))}>Decline</Button>
                </div>
              </Notice>
            )}
            <Card className="space-y-3" aria-label="The drop so far">
              <p className="eyebrow">{c.status === 'published' ? 'Published as' : 'Preview — how it will be posted'}</p>
              <p className="whitespace-pre-wrap text-[17px] leading-[1.45] text-fg">{c.preview}</p>
              <p className="text-xs text-fg-3">Visible to: {c.visibility === 'public' ? 'any signed-in member' : `${c.isOwner ? 'your' : `${c.owner.name}’s`} followers`} · posted from {c.isOwner ? 'your' : `${c.owner.name}’s`} account</p>
              {c.postId && <ButtonLink to={`/thoughts/${c.postId}`} size="sm" variant="secondary">Open the published drop</ButtonLink>}
            </Card>

            {draft && c.isOwner && (
              <Card className="space-y-3" aria-label="Opening">
                <Field label="Your opening">{(fid) => <Textarea id={fid} rows={2} maxLength={R.openingMax} value={opening ?? c.opening} onChange={(e) => setOpening(e.target.value)} />}</Field>
                <Button size="sm" variant="secondary" disabled={opening === null || !opening.trim() || opening.trim() === c.opening} loading={act.isPending} onClick={() => act.mutate(() => patch(`collabs/${c.id}`, { opening }).then(() => setOpening(null)))}>Save opening</Button>
              </Card>
            )}
            {draft && mine?.status === 'accepted' && (
              <Card className="space-y-3" aria-label="Your line">
                <Field label={`Your line (up to ${R.lineMax} characters)`}>{(fid) => <Input id={fid} maxLength={R.lineMax} value={line ?? mine.line} onChange={(e) => setLine(e.target.value)} placeholder="Add your line" />}</Field>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={line === null || line.trim() === mine.line} loading={act.isPending} onClick={() => act.mutate(() => put(`collabs/${c.id}/line`, { line: line ?? '' }).then(() => setLine(null)))}>Save my line</Button>
                  <Button size="sm" variant="ghost" onClick={() => act.mutate(() => del(`collabs/${c.id}/members/${mine.userId}`).then(() => nav('/create/together')))}>Leave</Button>
                </div>
              </Card>
            )}

            <Card className="space-y-3" aria-label="Collaborators">
              <h2 className="font-display text-2xl">Collaborators</h2>
              <ul className="divide-y divide-line">
                <li className="flex items-center justify-between gap-3 py-2 text-sm"><span className="text-fg">{c.owner.name}{c.isOwner ? ' (you)' : ''}</span><span className="text-xs text-fg-3">Started it</span></li>
                {c.members.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0"><span className="text-fg">{m.name}{m.you ? ' (you)' : ''}</span>{m.status === 'accepted' && m.line && <span className="block truncate text-fg-2">“{m.line}”</span>}</span>
                    <span className="flex items-center gap-2"><span className="text-xs text-fg-3">{MEMBER[m.status]}</span>
                      {draft && c.isOwner && (m.status === 'invited' || m.status === 'accepted') && <Button size="sm" variant="ghost" className="text-danger" onClick={() => act.mutate(() => del(`collabs/${c.id}/members/${m.userId}`))}>Remove</Button>}
                    </span>
                  </li>
                ))}
              </ul>
              {draft && c.isOwner && (
                active.length >= R.maxCollaborators ? <p className="text-xs text-fg-3">That’s the most people a drop can have.</p>
                  : options.length ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Invite someone you’re connected with">{(fid) => <Select id={fid} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a person</option>{options.map((p) => <option key={p.userId} value={p.userId}>{p.name} (@{p.handle})</option>)}</Select>}</Field>
                      <Button size="sm" disabled={!pick} loading={act.isPending} onClick={() => act.mutate(() => post(`collabs/${c.id}/invite`, { userId: pick }).then(() => setPick('')))}>Invite</Button>
                    </div>
                  ) : <p className="text-sm text-fg-3">You can invite people you follow or who follow you. <Link to="/explore" className="text-accent underline underline-offset-2">Find people</Link></p>
              )}
            </Card>

            {draft && c.isOwner && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" className="text-danger" onClick={() => act.mutate(() => post(`collabs/${c.id}/cancel`).then(() => nav('/create/together')))}>Cancel this collaboration</Button>
                <span className="flex items-center gap-3"><span className="text-xs text-fg-3">{written ? `${written} line${written === 1 ? '' : 's'} written` : 'Waiting for the first line'}</span>
                  <Button disabled={!written} loading={publish.isPending} onClick={() => publish.mutate()}>Publish</Button></span>
              </div>
            )}
            <p className="text-sm"><Link to="/create/together" className="text-accent underline underline-offset-2">All collaborations</Link></p>
          </>
        );
      }}</QueryState>
    </div>
  );
}
