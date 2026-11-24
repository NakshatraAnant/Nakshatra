import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { PERK_CATEGORIES } from '../../shared/partners';

interface Perk { id: string; partner: string; title: string; description: string; category: string; endsAt: string; hasCode: boolean; code: string | null }

export function PerksPage() {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [opened, setOpened] = useState<Record<string, { url: string; code: string | null }>>({});
  const q = useQuery({ queryKey: ['perks', category], queryFn: () => get<{ disclosure: string; perks: Perk[] }>(`perks${category ? `?category=${category}` : ''}`) });
  const go = useMutation({ mutationFn: (id: string) => post<{ url: string; code: string | null }>(`perks/${id}/go`), onSuccess: (r, id) => setOpened({ ...opened, [id]: r }), onError: (e) => toast(e instanceof ApiError ? e.message : 'Offer unavailable', 'error') });
  const pill = (on: boolean) => cx('min-h-9 rounded-full border px-3 text-sm', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2');
  return (
    <div className="space-y-6">
      <PageHeader kicker="You" title="Perks" subtitle="Offers from brands we partner with. They live on this page only — never in your results or recommendations." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        <button type="button" aria-pressed={!category} className={pill(!category)} onClick={() => setCategory('')}>All</button>
        {PERK_CATEGORIES.map((c) => <button key={c} type="button" aria-pressed={category === c} className={pill(category === c)} onClick={() => setCategory(c)}>{c}</button>)}
      </div>
      <QueryState q={q}>{(d) => (
        <>
          <Notice tone="info">{d.disclosure}</Notice>
          {d.perks.length === 0 ? <EmptyState icon="star" title="No perks right now" body="New partner offers will show up here." /> : (
            <ul className="grid gap-3 sm:grid-cols-2">{d.perks.map((p) => {
              const o = opened[p.id];
              const code = o?.code ?? p.code;
              return (
                <li key={p.id} className="card flex h-full flex-col p-4" aria-label={`Perk: ${p.title}`}>
                  <p className="text-xs uppercase tracking-[0.14em] text-fg-3">Partner offer · {p.partner}</p>
                  <h2 className="mt-1 font-display text-xl text-fg">{p.title}</h2>
                  {p.description && <p className="mt-1 text-sm text-fg-2">{p.description}</p>}
                  <p className="mt-2 text-xs text-fg-3"><Badge tone="neutral">{p.category}</Badge> · until {new Date(p.endsAt).toLocaleDateString()}</p>
                  <div className="mt-auto space-y-2 pt-3">
                    {code && <p className="rounded-[var(--radius-sm)] border border-dashed border-line p-2 text-center font-mono text-fg" aria-label="Discount code">{code}</p>}
                    {o ? <a href={o.url} target="_blank" rel="sponsored noopener noreferrer" className="inline-flex min-h-10 items-center rounded-full bg-fg px-4 text-sm font-semibold text-canvas">Continue to {p.partner} ↗</a>
                      : <Button size="sm" loading={go.isPending && go.variables === p.id} onClick={() => go.mutate(p.id)}>{p.hasCode ? 'Get code' : 'Get offer'}</Button>}
                  </div>
                </li>
              );
            })}</ul>
          )}
        </>
      )}</QueryState>
    </div>
  );
}

/* ---------------- Admin ---------------- */

interface AdminPartners {
  partners: { id: string; name: string; website: string; status: string; terms: string; postbackUrl: string; conversions: { status: string; n: number; commissionPaise: number }[] }[];
  offers: { id: string; partner: string; title: string; category: string; status: string; clicks: number; people: number; endsAt: string }[];
  pending: { id: string; partner: string; externalId: string; orderPaise: number; commissionPaise: number; attributed: boolean }[];
}
const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`;

export function PartnersAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-partners'], queryFn: () => get<AdminPartners>('admin/partners') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin-partners'] });
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Failed', 'error');
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => post(path, body), onSuccess: refresh, onError: fail });
  const [secret, setSecret] = useState<string | null>(null);
  const [p, setP] = useState({ name: '', website: '', terms: '' });
  const [o, setO] = useState({ partnerId: '', title: '', description: '', category: 'food', url: 'https://', code: '', days: '30' });
  const addPartner = useMutation({ mutationFn: () => post<{ postbackSecret: string }>('admin/partners', p), onSuccess: (r) => { setSecret(r.postbackSecret); setP({ name: '', website: '', terms: '' }); refresh(); }, onError: fail });
  const addOffer = useMutation({
    mutationFn: (partnerId: string) => post('admin/partners/offers', { partnerId, title: o.title, description: o.description, category: o.category, url: o.url, code: o.code || undefined, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + Number(o.days) * 864e5).toISOString() }),
    onSuccess: () => { setO({ ...o, title: '', description: '', code: '' }); refresh(); toast('Offer saved as draft', 'success'); }, onError: fail,
  });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-4">
        <p className="text-sm text-fg-2">Partner offers appear only on the Perks page, with a commission disclosure. Partners report sales through signed postbacks; commission stays pending until you approve it.</p>
        <Card className="space-y-2" aria-label="New partner">
          <h3 className="font-display text-xl">Add a partner</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Partner name" placeholder="Name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
            <Input aria-label="Partner website" placeholder="https://" value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} />
            <Input aria-label="Commercial terms" placeholder="Terms, e.g. 8% of order value" value={p.terms} onChange={(e) => setP({ ...p, terms: e.target.value })} />
          </div>
          <Button size="sm" variant="secondary" disabled={!p.name || !p.website} loading={addPartner.isPending} onClick={() => addPartner.mutate()}>Add partner</Button>
          {secret && <Notice tone="warning" title="Postback secret — shown once">Give this to the partner for signing conversion postbacks: <code className="break-all font-mono">{secret}</code></Notice>}
        </Card>

        {d.partners.length > 0 && (
          <Card className="space-y-3" aria-label="New offer">
            <h3 className="font-display text-xl">New offer (draft)</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Partner">{(id) => <Select id={id} value={o.partnerId || d.partners[0].id} onChange={(e) => setO({ ...o, partnerId: e.target.value })}>{d.partners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
              <Field label="Offer title">{(id) => <Input id={id} maxLength={70} value={o.title} onChange={(e) => setO({ ...o, title: e.target.value })} />}</Field>
              <Field label="Category">{(id) => <Select id={id} value={o.category} onChange={(e) => setO({ ...o, category: e.target.value })}>{PERK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
              <Field label="Offer link (https)">{(id) => <Input id={id} value={o.url} onChange={(e) => setO({ ...o, url: e.target.value })} />}</Field>
              <Field label="Discount code (optional)">{(id) => <Input id={id} maxLength={30} value={o.code} onChange={(e) => setO({ ...o, code: e.target.value })} />}</Field>
              <Field label="Runs for">{(id) => <Select id={id} value={o.days} onChange={(e) => setO({ ...o, days: e.target.value })}>{[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</Select>}</Field>
            </div>
            <Field label="Offer description">{(id) => <Textarea id={id} rows={2} maxLength={280} value={o.description} onChange={(e) => setO({ ...o, description: e.target.value })} />}</Field>
            <Button size="sm" disabled={!o.title} loading={addOffer.isPending} onClick={() => addOffer.mutate(o.partnerId || d.partners[0].id)}>Save offer</Button>
          </Card>
        )}

        <Card aria-label="Offers">
          <h3 className="font-display text-xl">Offers</h3>
          {d.offers.length === 0 ? <p className="mt-2 text-sm text-fg-3">No offers yet.</p> : (
            <ul className="mt-2 divide-y divide-line">{d.offers.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" aria-label={`Offer ${x.title}`}>
                <span><span className="text-fg">{x.title}</span> <span className="text-fg-3">· {x.partner} · {x.status} · {x.clicks} follows by {x.people} people</span></span>
                <span className="flex gap-1">
                  {x.status === 'draft' && <Button size="sm" onClick={() => act.mutate({ path: `admin/partners/offers/${x.id}/status`, body: { status: 'live' } })}>Go live</Button>}
                  {x.status === 'live' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/partners/offers/${x.id}/status`, body: { status: 'draft' } })}>Unpublish</Button>}
                  {x.status !== 'ended' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/partners/offers/${x.id}/status`, body: { status: 'ended' } })}>End</Button>}
                </span>
              </li>
            ))}</ul>
          )}
        </Card>

        <Card aria-label="Pending conversions">
          <h3 className="font-display text-xl">Conversions waiting for approval</h3>
          {d.pending.length === 0 ? <p className="mt-2 text-sm text-fg-3">None.</p> : (
            <ul className="mt-2 divide-y divide-line">{d.pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{c.partner} · order {c.externalId} · {inr(c.orderPaise)} → commission {inr(c.commissionPaise)}{c.attributed ? '' : ' · not linked to a Nakshatra click'}</span>
                <span className="flex gap-1"><Button size="sm" onClick={() => act.mutate({ path: `admin/partners/conversions/${c.id}`, body: { decision: 'approved' } })}>Approve</Button><Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/partners/conversions/${c.id}`, body: { decision: 'reversed' } })}>Reverse</Button></span>
              </li>
            ))}</ul>
          )}
        </Card>

        {d.partners.map((x) => (
          <Card key={x.id} className="space-y-1" aria-label={`Partner ${x.name}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-fg">{x.name}</p><Badge tone={x.status === 'active' ? 'success' : 'neutral'}>{x.status}</Badge></div>
            <p className="text-xs text-fg-3">{x.terms || 'No terms noted'} · postback: <code className="font-mono">{x.postbackUrl}</code></p>
            <p className="text-xs text-fg-3">{x.conversions.length ? x.conversions.map((c) => `${c.n} ${c.status} (${inr(c.commissionPaise ?? 0)})`).join(' · ') : 'No conversions yet'}</p>
            <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/partners/${x.id}/status`, body: { status: x.status === 'active' ? 'paused' : 'active' } })}>{x.status === 'active' ? 'Pause partner' : 'Resume partner'}</Button>
          </Card>
        ))}
      </div>
    )}</QueryState>
  );
}
