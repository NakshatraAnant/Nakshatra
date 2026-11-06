import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, describeApiError, get, idempotencyKey, post } from '../lib/api';
import { money, dateTime } from '../lib/format';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { INDIAN_STATES, normalisePhone, PIN_RE } from '../../shared/merch';

interface Variant { id: string; name: string; pricePaise: number; available: number }
interface Product { id: string; slug: string; title: string; description: string; imageUrl: string | null; isSample: boolean; variants: Variant[] }
interface Catalogue { payment: string; rules: { maxQuantityPerItem: number; freeShippingFromPaise: number; shippingPaise: number; returnWindowDays: number; maxOrderPaise: number }; products: Product[] }
export interface CodOrder {
  id: string; number: string; status: string; statusLabel: string;
  payment: { method: string; status: 'not_due' | 'due_on_delivery' | 'collected' | 'refunded' | 'not_collected'; collectedAt: string | null };
  subtotalPaise: number; shippingPaise: number; totalPaise: number;
  address: { name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string } | { redacted: true };
  courierName: string | null; trackingRef: string | null; returnReason: string | null; cancelReason: string | null; placedAt: string | null; createdAt: string;
  items: { id: string; title: string; variantName: string; unitPricePaise: number; quantity: number }[];
  timeline?: { status: string; label: string; by: string; note: string; at: string }[];
  canCancel: boolean; canReturn: boolean;
}

export const PAYMENT_LABEL: Record<CodOrder['payment']['status'], string> = {
  not_due: 'Nothing to pay', due_on_delivery: 'Unpaid — pay cash on delivery', collected: 'Paid on delivery', refunded: 'Refunded', not_collected: 'Not paid (not delivered)',
};

const EMPTY_ADDRESS = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };

/** Merch catalogue and two-step cash-on-delivery checkout: review a server-priced draft, then place it. */
export function MerchPage() {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['merch'], queryFn: () => get<Catalogue>('merch/products') });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [key, setKey] = useState(idempotencyKey);
  const [draft, setDraft] = useState<CodOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = Object.entries(qty).filter(([, n]) => n > 0).map(([variantId, quantity]) => ({ variantId, quantity }));
  const phoneOk = !address.phone || !!normalisePhone(address.phone);
  const pinOk = !address.pincode || PIN_RE.test(address.pincode);
  const ready = items.length && address.name.trim() && normalisePhone(address.phone) && address.line1.trim() && address.city.trim() && address.state && PIN_RE.test(address.pincode);
  const review = useMutation({
    mutationFn: () => post<{ order: CodOrder }>('merch/orders', { items, address, idempotencyKey: key }),
    onSuccess: (r) => { setDraft(r.order); setError(null); },
    onError: (e) => setError(describeApiError(e, 'Could not prepare your order')),
  });
  const place = useMutation({
    mutationFn: (id: string) => post<{ order: CodOrder }>(`merch/orders/${id}/place`),
    onSuccess: (r) => nav(`/merch/orders/${r.order.id}`),
    onError: (e) => setError(describeApiError(e, 'Could not place your order')),
  });
  const edit = () => { setDraft(null); setKey(idempotencyKey()); };
  const set = (k: keyof typeof address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddress({ ...address, [k]: e.target.value });
  return (
    <div className="space-y-8">
      <PageHeader kicker="Merch" title="Wear your archetype" subtitle="Cash on delivery only — you pay the courier when it arrives. Nothing is charged online." actions={<ButtonLink to="/merch/orders" variant="ghost" size="sm">My orders</ButtonLink>} />
      <QueryState q={q} empty={(d) => (!d.products.length ? <EmptyState icon="shop" title="Nothing in stock right now" body="Check back soon." /> : null)}>{(d) => (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {d.products.map((p) => (
              <li key={p.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl">{p.title}</h2>{p.isSample && <Badge tone="warning">Development sample</Badge>}</div>
                {p.description && <p className="text-sm text-fg-2">{p.description}</p>}
                <ul className="space-y-2">
                  {p.variants.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm text-fg">{v.name} · <span className="numeric">{money(v.pricePaise)}</span> <span className="text-xs text-fg-3">{v.available ? `${v.available} left` : 'Sold out'}</span></span>
                      <label className="flex items-center gap-2 text-sm text-fg-2">Qty
                        <Select aria-label={`Quantity of ${p.title} ${v.name}`} className="w-20" disabled={!v.available || !!draft} value={qty[v.id] ?? 0} onChange={(e) => setQty({ ...qty, [v.id]: Number(e.target.value) })}>
                          {Array.from({ length: Math.min(d.rules.maxQuantityPerItem, v.available) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                        </Select>
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          <Card className="space-y-4">
            <h2 className="font-display text-2xl">Delivery address</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name">{(id) => <Input id={id} autoComplete="name" value={address.name} onChange={set('name')} disabled={!!draft} />}</Field>
              <Field label="Mobile number" hint="The courier calls this number." error={phoneOk ? undefined : 'Enter a 10-digit Indian mobile number.'}>{(id, desc) => <Input id={id} aria-describedby={desc} type="tel" inputMode="tel" autoComplete="tel" value={address.phone} onChange={set('phone')} disabled={!!draft} />}</Field>
              <Field label="House / street" className="sm:col-span-2">{(id) => <Input id={id} autoComplete="address-line1" value={address.line1} onChange={set('line1')} disabled={!!draft} />}</Field>
              <Field label="Area / landmark (optional)" className="sm:col-span-2">{(id) => <Input id={id} autoComplete="address-line2" value={address.line2} onChange={set('line2')} disabled={!!draft} />}</Field>
              <Field label="City">{(id) => <Input id={id} autoComplete="address-level2" value={address.city} onChange={set('city')} disabled={!!draft} />}</Field>
              <Field label="State / UT">{(id) => <Select id={id} value={address.state} onChange={set('state')} disabled={!!draft}><option value="">Choose…</option>{INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>}</Field>
              <Field label="PIN code" error={pinOk ? undefined : 'Enter a valid 6-digit PIN code.'}>{(id, desc) => <Input id={id} aria-describedby={desc} inputMode="numeric" maxLength={6} autoComplete="postal-code" value={address.pincode} onChange={set('pincode')} disabled={!!draft} />}</Field>
            </div>
            <p className="text-xs text-fg-3">Shipping {money(d.rules.shippingPaise)}, free from {money(d.rules.freeShippingFromPaise)}. Returns within {d.rules.returnWindowDays} days of delivery. Your address is used only to deliver this order.</p>
            {error && <Notice tone="danger">{error}</Notice>}
            {!draft ? (
              <Button disabled={!ready} loading={review.isPending} onClick={() => review.mutate()}>Review order</Button>
            ) : (
              <div className="space-y-3 rounded-[var(--radius)] border border-line p-4" aria-label="Order review">
                <ul className="space-y-1 text-sm">{draft.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span>{i.title} · {i.variantName} × {i.quantity}</span><span className="numeric">{money(i.unitPricePaise * i.quantity)}</span></li>)}</ul>
                <div className="space-y-1 border-t border-line pt-2 text-sm">
                  <p className="flex justify-between"><span>Shipping</span><span className="numeric">{draft.shippingPaise ? money(draft.shippingPaise) : 'Free'}</span></p>
                  <p className="flex justify-between font-semibold text-fg"><span>Pay the courier in cash</span><span className="numeric">{money(draft.totalPaise)}</span></p>
                </div>
                <p className="text-xs text-fg-3">We confirm every cash-on-delivery order before packing it. You can cancel until it is packed.</p>
                <div className="flex flex-wrap gap-2">
                  <Button loading={place.isPending} onClick={() => place.mutate(draft.id)}>Place order — pay on delivery</Button>
                  <Button variant="ghost" onClick={edit}>Change</Button>
                </div>
              </div>
            )}
          </Card>
          <p className="text-xs text-fg-3">{d.payment}</p>
        </>
      )}</QueryState>
    </div>
  );
}

export function MerchOrders() {
  const q = useQuery({ queryKey: ['merch-orders'], queryFn: () => get<{ orders: CodOrder[] }>('merch/orders') });
  return (
    <div>
      <PageHeader kicker="Merch" title="My orders" actions={<ButtonLink to="/merch" variant="ghost" size="sm">Merch</ButtonLink>} />
      <QueryState q={q} empty={(d) => (!d.orders.filter((o) => o.status !== 'draft').length ? <EmptyState icon="shop" title="No orders yet" action={<ButtonLink to="/merch">See merch</ButtonLink>} /> : null)}>{(d) => (
        <ul className="space-y-3">{d.orders.filter((o) => o.status !== 'draft').map((o) => (
          <li key={o.id}><Link to={`/merch/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-line-strong">
            <div><p className="text-fg">{o.number}</p><p className="text-xs text-fg-3">{o.items.map((i) => `${i.title} × ${i.quantity}`).join(', ')} · {money(o.totalPaise)}</p></div>
            <div className="flex flex-wrap gap-2"><Badge tone="neutral">{o.statusLabel}</Badge><Badge tone={o.payment.status === 'collected' ? 'success' : 'warning'}>{PAYMENT_LABEL[o.payment.status]}</Badge></div>
          </Link></li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}

export function MerchOrder() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['merch-order', id], queryFn: () => get<{ order: CodOrder }>(`merch/orders/${id}`) });
  const [reason, setReason] = useState('');
  const act = useMutation({
    mutationFn: (a: 'cancel' | 'return') => post(`merch/orders/${id}/${a}`, { reason }),
    onSuccess: () => { setReason(''); void qc.invalidateQueries({ queryKey: ['merch-order', id] }); toast('Updated', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not update', 'error'),
  });
  return (
    <QueryState q={q}>{({ order: o }) => (
      <div className="space-y-6">
        <PageHeader kicker="Merch order" title={o.number} subtitle={`Placed ${o.placedAt ? dateTime(o.placedAt) : '—'}`} actions={<ButtonLink to="/merch/orders" variant="ghost" size="sm">All orders</ButtonLink>} />
        <div className="flex flex-wrap gap-2"><Badge tone="accent">{o.statusLabel}</Badge><Badge tone={o.payment.status === 'collected' ? 'success' : 'warning'}>{PAYMENT_LABEL[o.payment.status]}</Badge></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2">
            <h2 className="font-display text-2xl">Items</h2>
            <ul className="space-y-1 text-sm">{o.items.map((i) => <li key={i.id} className="flex justify-between gap-3"><span>{i.title} · {i.variantName} × {i.quantity}</span><span className="numeric">{money(i.unitPricePaise * i.quantity)}</span></li>)}</ul>
            <p className="flex justify-between border-t border-line pt-2 text-sm"><span>Shipping</span><span className="numeric">{o.shippingPaise ? money(o.shippingPaise) : 'Free'}</span></p>
            <p className="flex justify-between font-semibold text-fg"><span>{o.payment.status === 'collected' ? 'Paid in cash' : 'Total (cash on delivery)'}</span><span className="numeric">{money(o.totalPaise)}</span></p>
            {'name' in o.address && <p className="pt-2 text-sm text-fg-2">Deliver to {o.address.name}, {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}, {o.address.city}, {o.address.state} {o.address.pincode} · {o.address.phone}</p>}
            {o.courierName && <p className="text-sm text-fg-2">Courier: {o.courierName}{o.trackingRef ? ` · reference ${o.trackingRef}` : ' (no tracking reference shared yet)'}</p>}
          </Card>
          <Card>
            <h2 className="font-display text-2xl">Progress</h2>
            <ol className="mt-3 space-y-2 border-l border-line pl-4 text-sm" aria-label="Order history">
              {o.timeline?.map((e, i) => <li key={i}><p className="text-fg">{e.label}</p><p className="text-xs text-fg-3">{dateTime(e.at)}{e.note ? ` · ${e.note}` : ''}</p></li>)}
            </ol>
          </Card>
        </div>
        {(o.canCancel || o.canReturn) && (
          <Card className="space-y-3">
            <h2 className="font-display text-2xl">{o.canCancel ? 'Cancel this order' : 'Return this order'}</h2>
            <Field label={o.canCancel ? 'Reason (optional)' : 'Why are you returning it?'}>{(fid) => <Textarea id={fid} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            <Button variant={o.canCancel ? 'danger' : 'secondary'} disabled={o.canReturn && reason.trim().length < 3} loading={act.isPending} onClick={() => act.mutate(o.canCancel ? 'cancel' : 'return')}>{o.canCancel ? 'Cancel order' : 'Request a return'}</Button>
          </Card>
        )}
      </div>
    )}</QueryState>
  );
}
