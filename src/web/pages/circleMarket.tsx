import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post } from '../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { PhotoPicker } from '../components/MediaComposer';
import { ReportDialog } from './thoughts';
import { CONDITIONS, LISTING_KINDS, LISTING_KIND_LABEL, MARKET_RULES as R, type ListingKind } from '../../shared/market';

const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
const inr = (p: number | null) => (p === null ? '' : `₹${(p / 100).toLocaleString('en-IN')}`);
const priceLabel = (kind: string, p: number | null) => (kind === 'sell' ? inr(p) : LISTING_KIND_LABEL[kind as ListingKind]);
const conditionLabel = (c: string | null) => (c ? c.replace('_', ' ') : '');

interface Row { id: string; kind: string; title: string; pricePaise: number | null; condition: string | null; image: string | null; status: string; seller: string; mine: boolean; myInterest: string | null }

/** The circle's Market tab. */
export function CircleMarket({ circleId }: { circleId: string }) {
  const [kind, setKind] = useState('');
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['circle-market', circleId, kind, mine], queryFn: () => get<{ listings: Row[]; safety: string[] }>(`circles/${circleId}/listings?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(mine ? { mine: 'true' } : {}) })}`) });
  const pill = (on: boolean) => cx('min-h-9 rounded-full border px-3 text-sm', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
        <button type="button" aria-pressed={!kind && !mine} className={pill(!kind && !mine)} onClick={() => { setKind(''); setMine(false); }}>All</button>
        {LISTING_KINDS.map((k) => <button key={k} type="button" aria-pressed={kind === k} className={pill(kind === k)} onClick={() => { setKind(k); setMine(false); }}>{LISTING_KIND_LABEL[k]}</button>)}
        <button type="button" aria-pressed={mine} className={pill(mine)} onClick={() => { setMine(true); setKind(''); }}>My listings</button>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'List something'}</Button>
      </div>
      {creating && <NewListing circleId={circleId} onDone={() => setCreating(false)} />}
      <Notice tone="info">Members only. Nakshatra doesn’t handle payments here — you arrange it yourselves, so meet somewhere public and check things before paying.</Notice>
      <QueryState q={q} empty={(d) => (!d.listings.length ? <EmptyState icon="shop" title="Nothing listed yet" body="Selling a cycle, giving away books, or looking for a lamp? List it for your circle." /> : null)}>{(d) => (
        <ul className="grid gap-3 sm:grid-cols-2">{d.listings.map((l) => (
          <li key={l.id}><Link to={`/circles/${circleId}/market/${l.id}`} className="card flex h-full gap-3 p-3 hover:border-line-strong" aria-label={`Listing: ${l.title}`}>
            {l.image ? <img src={l.image} alt="" loading="lazy" className="h-20 w-20 flex-none rounded-[var(--radius-sm)] object-cover" /> : <div className="h-20 w-20 flex-none rounded-[var(--radius-sm)] bg-surface-2" aria-hidden="true" />}
            <div className="min-w-0">
              <p className="font-semibold text-fg">{l.title}</p>
              <p className="text-sm text-fg-2">{priceLabel(l.kind, l.pricePaise)}{l.condition ? ` · ${conditionLabel(l.condition)}` : ''}</p>
              <p className="mt-1 text-xs text-fg-3">{l.mine ? 'Yours' : l.seller}{l.status !== 'active' ? ` · ${l.status}` : ''}{l.myInterest ? ` · you’re ${l.myInterest === 'pending' ? 'interested' : l.myInterest}` : ''}</p>
            </div>
          </Link></li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}

function NewListing({ circleId, onDone }: { circleId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<ListingKind>('sell');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('good');
  const [photos, setPhotos] = useState<string[]>([]);
  const m = useMutation({
    mutationFn: () => post(`circles/${circleId}/listings`, { kind, title, description, pricePaise: kind === 'sell' ? Math.round(Number(price) * 100) : null, condition: kind === 'wanted' ? null : condition, imageUrls: photos }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['circle-market', circleId] }); toast('Listed for your circle', 'success'); onDone(); },
    onError: fail(toast),
  });
  return (
    <Card className="space-y-3" aria-label="New listing">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as ListingKind)}>{LISTING_KINDS.map((k) => <option key={k} value={k}>{LISTING_KIND_LABEL[k]}</option>)}</Select>}</Field>
        <Field label="What is it?">{(id) => <Input id={id} maxLength={R.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Desk lamp" />}</Field>
        {kind === 'sell' && <Field label="Price in ₹">{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />}</Field>}
        {kind !== 'wanted' && <Field label="Condition">{(id) => <Select id={id} value={condition} onChange={(e) => setCondition(e.target.value)}>{CONDITIONS.map((c) => <option key={c} value={c}>{conditionLabel(c)}</option>)}</Select>}</Field>}
      </div>
      <Field label="Details (optional)">{(id) => <Textarea id={id} rows={2} maxLength={R.description} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      <PhotoPicker urls={photos} onChange={(u) => setPhotos(u.slice(0, R.maxPhotos))} />
      <Button disabled={title.trim().length < 3 || (kind === 'sell' && !price)} loading={m.isPending} onClick={() => m.mutate()}>Post listing</Button>
    </Card>
  );
}

interface Detail {
  listing: { id: string; kind: string; title: string; description: string; pricePaise: number | null; condition: string | null; imageUrls: string[]; status: string; seller: { userId: string; name: string; handle: string | null } };
  mine: boolean; canModerate: boolean;
  myInterest: { status: string; note: string } | null;
  interests: { userId: string; name: string; note: string; status: string }[] | null;
  thread: { with: string; messages: { id: string; mine: boolean; body: string; createdAt: string }[] } | null;
  safety: string[];
}

export function ListingPage() {
  const { id, listingId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const base = `circles/${id}/listings/${listingId}`;
  const q = useQuery({ queryKey: ['listing', listingId], queryFn: () => get<Detail>(base) });
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [reporting, setReporting] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['listing', listingId] }); void qc.invalidateQueries({ queryKey: ['circle-market', id] }); };
  const act = useMutation({ mutationFn: ({ path, body, method }: { path: string; body?: unknown; method?: 'post' | 'patch' | 'del' }) => (method === 'patch' ? patch(path, body) : method === 'del' ? del(path) : post(path, body ?? {})), onSuccess: refresh, onError: fail(toast) });
  const send = useMutation({ mutationFn: () => post(`${base}/messages`, { body: msg }), onSuccess: () => { setMsg(''); refresh(); }, onError: fail(toast) });
  return (
    <QueryState q={q}>{(d) => {
      const l = d.listing;
      return (
        <div className="mx-auto max-w-2xl space-y-5">
          <Link to={`/circles/${id}?tab=market`} className="text-sm text-accent underline underline-offset-2">← Circle market</Link>
          <PageHeader kicker={`${LISTING_KIND_LABEL[l.kind as ListingKind]}${l.status !== 'active' ? ` · ${l.status}` : ''}`} title={l.title} subtitle={`${priceLabel(l.kind, l.pricePaise)}${l.condition ? ` · ${conditionLabel(l.condition)}` : ''} · listed by ${d.mine ? 'you' : l.seller.name}`} />
          {l.imageUrls.length > 0 && <div className="grid grid-cols-2 gap-2">{l.imageUrls.map((u) => <img key={u} src={u} alt={`Photo of ${l.title}`} className="aspect-square w-full rounded-[var(--radius)] object-cover" />)}</div>}
          {l.description && <Card><p className="whitespace-pre-wrap text-fg">{l.description}</p></Card>}

          {d.mine ? (
            <Card className="space-y-3" aria-label="Interested members">
              <h2 className="font-display text-2xl">Who’s interested</h2>
              {!d.interests?.length ? <p className="text-sm text-fg-3">No one yet.</p> : (
                <ul className="divide-y divide-line">{d.interests.map((i) => (
                  <li key={i.userId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><span className="font-semibold text-fg">{i.name}</span>{i.note && <span className="text-fg-2"> — “{i.note}”</span>} <Badge tone={i.status === 'accepted' ? 'success' : 'neutral'}>{i.status}</Badge></span>
                    <span className="flex gap-1">
                      {i.status !== 'accepted' && <Button size="sm" onClick={() => act.mutate({ path: `${base}/interests/${i.userId}`, body: { decision: 'accept' } })}>Accept</Button>}
                      {i.status !== 'declined' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `${base}/interests/${i.userId}`, body: { decision: 'decline' } })}>Decline</Button>}
                    </span>
                  </li>
                ))}</ul>
              )}
              <div className="flex flex-wrap gap-2">
                {l.status !== 'closed' && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: base, body: { status: 'closed' }, method: 'patch' })}>Mark as done</Button>}
                {l.status === 'closed' && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: base, body: { status: 'active' }, method: 'patch' })}>Reopen</Button>}
              </div>
            </Card>
          ) : l.status === 'active' && !d.myInterest ? (
            <Card className="space-y-2" aria-label="Show interest">
              <Field label="Note to the seller (optional)">{(fid) => <Input id={fid} maxLength={R.note} value={note} onChange={(e) => setNote(e.target.value)} placeholder="When could I pick it up?" />}</Field>
              <Button onClick={() => act.mutate({ path: `${base}/interest`, body: { note } })}>I’m interested</Button>
            </Card>
          ) : d.myInterest ? (
            <Card className="space-y-2">
              <p className="text-fg">{d.myInterest.status === 'accepted' ? 'The seller accepted — use the messages below to arrange it.' : d.myInterest.status === 'declined' ? 'The seller went with someone else this time.' : 'You’re interested. The seller will see your note.'}</p>
              {d.myInterest.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `${base}/interest`, method: 'del' })}>Withdraw</Button>}
            </Card>
          ) : null}

          {d.thread && (
            <Card className="space-y-3" aria-label="Messages">
              <h2 className="font-display text-2xl">Messages with {d.thread.with}</h2>
              <ul className="space-y-2">{d.thread.messages.map((m) => (
                <li key={m.id} className={cx('max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm', m.mine ? 'ml-auto bg-fg text-canvas' : 'bg-surface-2 text-fg')}>{m.body}</li>
              ))}</ul>
              <div className="flex gap-2"><Input aria-label="Message" maxLength={R.message} value={msg} onChange={(e) => setMsg(e.target.value)} className="min-w-0 flex-1" /><Button disabled={!msg.trim()} loading={send.isPending} onClick={() => send.mutate()}>Send</Button></div>
            </Card>
          )}

          <Card aria-label="Safety"><h2 className="font-display text-xl">Stay safe</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-2">{d.safety.map((t) => <li key={t}>{t}</li>)}</ul></Card>
          <div className="flex flex-wrap gap-3 text-sm">
            {!d.mine && <button type="button" className="text-fg-3 underline underline-offset-2" onClick={() => setReporting(true)}>Report listing</button>}
            {d.canModerate && !d.mine && <button type="button" className="text-danger underline underline-offset-2" onClick={() => act.mutate({ path: `${base}/remove`, body: { reason: 'Removed by a circle moderator' } }, { onSuccess: () => nav(`/circles/${id}?tab=market`) })}>Remove listing (moderator)</button>}
          </div>
          <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="listing" targetId={l.id} />
        </div>
      );
    }}</QueryState>
  );
}
