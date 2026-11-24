import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post, put } from '../lib/api';
import { Avatar, Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Switch, cx } from '../components/ui/primitives';
import { EmptyState, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { ThoughtCard, type ThoughtPost } from './thoughts';

const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
interface Summary { id: string; name: string; description: string; visibility: 'private' | 'public'; items: number; isMine: boolean }

/* ---------------- Saved + collections ---------------- */

export function SavedPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'collections' | 'all'>('collections');
  const [name, setName] = useState('');
  const [isPublic, setPublic] = useState(false);
  const cols = useQuery({ queryKey: ['collections'], queryFn: () => get<{ collections: Summary[]; saved: number; max: number }>('collections') });
  const saved = useQuery({ queryKey: ['saved-posts'], queryFn: () => get<{ posts: ThoughtPost[] }>('saved-posts'), enabled: tab === 'all' });
  const create = useMutation({ mutationFn: () => post('collections', { name, visibility: isPublic ? 'public' : 'private' }), onSuccess: () => { setName(''); setPublic(false); void qc.invalidateQueries({ queryKey: ['collections'] }); toast('Collection made', 'success'); }, onError: fail(toast) });
  const pill = (on: boolean) => cx('min-h-9 rounded-full border px-3 text-sm', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2');
  return (
    <div className="space-y-6">
      <PageHeader kicker="You" title="Saved" subtitle="Posts you kept, sorted into collections. Collections are private unless you make one public." />
      <div className="flex gap-2" role="group" aria-label="View">
        <button type="button" aria-pressed={tab === 'collections'} className={pill(tab === 'collections')} onClick={() => setTab('collections')}>Collections</button>
        <button type="button" aria-pressed={tab === 'all'} className={pill(tab === 'all')} onClick={() => setTab('all')}>All saved{cols.data ? ` (${cols.data.saved})` : ''}</button>
      </div>
      {tab === 'collections' ? (
        <>
          <Card className="space-y-3" aria-label="New collection">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="New collection">{(id) => <Input id={id} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipes, poems, good advice…" />}</Field>
              <Button disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>Create</Button>
            </div>
            <Switch label="Show on my profile" description="Others see only the posts they’d be allowed to see anyway." checked={isPublic} onChange={setPublic} />
          </Card>
          <QueryState q={cols} empty={(d) => (!d.collections.length ? <EmptyState icon="bookmark" title="No collections yet" body="Make one above, then use “Save to…” on any post." /> : null)}>{(d) => (
            <ul className="grid gap-3 sm:grid-cols-2">{d.collections.map((c) => (
              <li key={c.id}><Link to={`/collections/${c.id}`} className="card block h-full p-4 hover:border-line-strong">
                <div className="flex items-center gap-2"><p className="font-semibold text-fg">{c.name}</p>{c.visibility === 'public' && <Badge tone="neutral">On profile</Badge>}</div>
                {c.description && <p className="mt-1 text-sm text-fg-2">{c.description}</p>}
                <p className="mt-2 text-xs text-fg-3">{c.items} post{c.items === 1 ? '' : 's'}</p>
              </Link></li>
            ))}</ul>
          )}</QueryState>
        </>
      ) : (
        <QueryState q={saved} empty={(d) => (!d.posts.length ? <EmptyState icon="bookmark" title="Nothing saved yet" body="Tap Save on a post to keep it here." /> : null)}>{(d) => (
          <div className="space-y-3">{d.posts.map((p) => <ThoughtCard key={p.id} p={p} />)}</div>
        )}</QueryState>
      )}
    </div>
  );
}

interface CollectionView { collection: { id: string; name: string; description: string; visibility: 'private' | 'public'; isMine: boolean; owner: { name: string; handle: string | null } }; posts: (ThoughtPost & { note: string })[]; hidden: number }

export function CollectionPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['collection', id], queryFn: () => get<CollectionView>(`collections/${id}`) });
  const [editing, setEditing] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['collection', id] }); void qc.invalidateQueries({ queryKey: ['collections'] }); };
  const remove = useMutation({ mutationFn: (postId: string) => del(`collections/${id}/items/${postId}`), onSuccess: refresh, onError: fail(toast) });
  const drop = useMutation({ mutationFn: () => del(`collections/${id}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['collections'] }); nav('/saved'); }, onError: fail(toast) });
  return (
    <QueryState q={q}>{(d) => (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader kicker={d.collection.isMine ? (d.collection.visibility === 'public' ? 'Collection · on your profile' : 'Collection · private') : `Collection by ${d.collection.owner.name}`} title={d.collection.name} subtitle={d.collection.description || undefined}
          actions={d.collection.isMine ? <Button size="sm" variant="secondary" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</Button> : d.collection.owner.handle ? <ButtonLink to={`/u/${d.collection.owner.handle}`} size="sm" variant="ghost">View profile</ButtonLink> : undefined} />
        {editing && <EditCollection c={d.collection} onSaved={() => { setEditing(false); refresh(); }} onDelete={() => drop.mutate()} />}
        {d.posts.length === 0 ? <EmptyState icon="bookmark" title="Empty for now" body={d.collection.isMine ? 'Use “Save to…” on any post to add it here.' : 'Nothing here you can see.'} /> : (
          <div className="space-y-3">{d.posts.map((p) => (
            <div key={p.id} className="space-y-1">
              {p.note && <p className="text-sm italic text-fg-2">“{p.note}”</p>}
              <ThoughtCard p={p} />
              {d.collection.isMine && <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>Remove from collection</Button>}
            </div>
          ))}</div>
        )}
        {d.hidden > 0 && <p className="text-xs text-fg-3">{d.hidden} post{d.hidden === 1 ? ' isn’t' : 's aren’t'} shown — {d.collection.isMine ? 'they were deleted or are no longer visible to you' : 'you don’t have access to them'}.</p>}
      </div>
    )}</QueryState>
  );
}

function EditCollection({ c, onSaved, onDelete }: { c: CollectionView['collection']; onSaved: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [vis, setVis] = useState(c.visibility);
  const save = useMutation({ mutationFn: () => patch(`collections/${c.id}`, { name, description, visibility: vis }), onSuccess: () => { toast('Saved', 'success'); onSaved(); }, onError: fail(toast) });
  return (
    <Card className="space-y-3" aria-label="Edit collection">
      <Field label="Name">{(id) => <Input id={id} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Description">{(id) => <Input id={id} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      <Field label="Who can see it">{(id) => <Select id={id} value={vis} onChange={(e) => setVis(e.target.value as 'private' | 'public')}><option value="private">Only me</option><option value="public">On my profile</option></Select>}</Field>
      <div className="flex flex-wrap gap-2"><Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>Save</Button><Button variant="ghost" className="text-danger" onClick={onDelete}>Delete collection</Button></div>
    </Card>
  );
}

/** Public collections on someone's profile. */
export function ProfileCollections({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ['user-collections', userId], queryFn: () => get<{ collections: Summary[] }>(`users/${userId}/collections`) });
  if (!q.data?.collections.length) return null;
  return (
    <section aria-labelledby="pc-h" className="space-y-3">
      <h2 id="pc-h" className="font-display text-2xl">Collections</h2>
      <ul className="grid gap-3 sm:grid-cols-2">{q.data.collections.map((c) => (
        <li key={c.id}><Link to={`/collections/${c.id}`} className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">{c.name}</p>{c.description && <p className="text-sm text-fg-2">{c.description}</p>}<p className="mt-1 text-xs text-fg-3">{c.items} post{c.items === 1 ? '' : 's'}</p></Link></li>
      ))}</ul>
    </section>
  );
}

/* ---------------- Close friends ---------------- */

export function CloseFriendsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['close-friends'], queryFn: () => get<{ people: { userId: string; name: string; handle: string | null; avatarUrl: string | null; onList: boolean }[]; count: number; max: number }>('close-friends') });
  const toggle = useMutation({ mutationFn: ({ userId, on }: { userId: string; on: boolean }) => put(`close-friends/${userId}`, { on }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['close-friends'] }), onError: fail(toast) });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader kicker="You" title="Close friends" subtitle="Post to just these people by choosing “Close friends” when you share. Nobody is told when you add or remove them." />
      <QueryState q={q} empty={(d) => (!d.people.length ? <EmptyState icon="users" title="No connections yet" body="Follow people (or have them follow you) and they’ll show up here." action={<ButtonLink to="/explore" size="sm">Find people</ButtonLink>} /> : null)}>{(d) => (
        <Card className="space-y-3">
          <p className="text-sm text-fg-2"><strong className="text-fg">{d.count}</strong> of up to {d.max} on your list</p>
          <Input aria-label="Search your connections" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="divide-y divide-line">{d.people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())).map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2">
              <Avatar name={p.name} src={p.avatarUrl} size={36} />
              <span className="min-w-0 flex-1 text-fg">{p.name}</span>
              <Button size="sm" variant={p.onList ? 'secondary' : 'ghost'} aria-pressed={p.onList} aria-label={`${p.onList ? 'Remove' : 'Add'} ${p.name} ${p.onList ? 'from' : 'to'} close friends`} onClick={() => toggle.mutate({ userId: p.userId, on: !p.onList })}>{p.onList ? '✓ Close friend' : 'Add'}</Button>
            </li>
          ))}</ul>
        </Card>
      )}</QueryState>
    </div>
  );
}
