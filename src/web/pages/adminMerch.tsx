import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { dateTime, money } from '../lib/format';
import { Badge, Button, Card, Field, Input, Select, cx } from '../components/ui/primitives';
import { EmptyState, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { COD_LABEL, COD_STATUSES, COD_TRANSITIONS, type CodStatus } from '../../shared/merch';
import { PAYMENT_LABEL, type CodOrder } from './merch';

/** Next steps staff may take from each status (the server enforces the same rules). */
const staffNext = (s: CodStatus) => (Object.entries(COD_TRANSITIONS[s]) as [CodStatus, string[]][]).filter(([, who]) => who.includes('staff')).map(([to]) => to);

function OrderRow({ o }: { o: CodOrder }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<CodStatus | ''>('');
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const detail = useQuery({ queryKey: ['admin-cod', o.id], queryFn: () => get<{ order: CodOrder }>(`admin/merch/orders/${o.id}`), enabled: open });
  const m = useMutation({
    mutationFn: () => post(`admin/merch/orders/${o.id}/transition`, { to, note, courierName: courier || undefined, trackingRef: tracking || undefined }),
    onSuccess: () => { setTo(''); setNote(''); void qc.invalidateQueries({ queryKey: ['admin-cod'] }); toast('Order updated', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });
  const next = staffNext(o.status as CodStatus);
  const a = 'name' in o.address ? o.address : null;
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-fg">{o.number} <span className="font-normal text-fg-3">· {money(o.totalPaise)}</span></p>
          <p className="text-xs text-fg-3">{o.items.map((i) => `${i.title} (${i.variantName}) × ${i.quantity}`).join(', ')}</p>
          {a && <p className="text-xs text-fg-2">{a.name} · {a.phone} · {a.city}, {a.state} {a.pincode}</p>}
        </div>
        <div className="flex flex-wrap gap-2"><Badge tone="accent">{o.statusLabel}</Badge><Badge tone={o.payment.status === 'collected' ? 'success' : 'neutral'}>{PAYMENT_LABEL[o.payment.status]}</Badge></div>
      </div>
      {next.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <Field label="Move to">{(id) => <Select id={id} value={to} onChange={(e) => setTo(e.target.value as CodStatus)}><option value="">Choose…</option>{next.map((s) => <option key={s} value={s}>{COD_LABEL[s]}</option>)}</Select>}</Field>
          <Field label="Note (shown in history)">{(id) => <Input id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={to === 'confirmed' ? 'e.g. confirmed by phone' : ''} />}</Field>
          <Button size="sm" disabled={!to || (to === 'dispatched' && !courier.trim())} loading={m.isPending} onClick={() => m.mutate()}>Update</Button>
          {to === 'dispatched' && (<>
            <Field label="Courier (required)">{(id) => <Input id={id} value={courier} maxLength={60} onChange={(e) => setCourier(e.target.value)} />}</Field>
            <Field label="Courier’s tracking reference (if they gave one)" className="sm:col-span-2">{(id) => <Input id={id} value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value)} />}</Field>
          </>)}
        </div>
      )}
      <button type="button" className="mt-2 text-xs text-fg-2 underline underline-offset-2" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide history' : 'History'}</button>
      {open && detail.data && <ol className="mt-2 space-y-1 border-l border-line pl-3 text-xs">{detail.data.order.timeline?.map((e, i) => <li key={i}><span className="text-fg">{e.label}</span> · {e.by} · {dateTime(e.at)}{e.note ? ` · ${e.note}` : ''}</li>)}</ol>}
    </li>
  );
}

interface AdminVariant { id: string; sku: string; name: string; pricePaise: number; stockOnHand: number; reserved: number }

function Stock() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-merch-products'], queryFn: () => get<{ products: { id: string; title: string; isSample: boolean; variants: AdminVariant[] }[] }>('admin/merch/products') });
  const [adj, setAdj] = useState<Record<string, { delta: string; note: string }>>({});
  const m = useMutation({
    mutationFn: (id: string) => post(`admin/merch/variants/${id}/stock`, { delta: Number(adj[id]?.delta), note: adj[id]?.note }),
    onSuccess: () => { setAdj({}); void qc.invalidateQueries({ queryKey: ['admin-merch-products'] }); toast('Stock updated', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });
  return (
    <Card>
      <h3 className="font-display text-2xl">Stock</h3>
      <QueryState q={q}>{(d) => (
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-xs text-fg-3"><th className="py-1 font-normal">Item</th><th className="font-normal">On hand</th><th className="font-normal">Reserved</th><th className="font-normal">Adjust</th></tr></thead>
          <tbody>{d.products.flatMap((p) => p.variants.map((v) => (
            <tr key={v.id} className="border-t border-line align-top">
              <th scope="row" className="py-2 pr-2 text-left font-normal">{p.title} · {v.name} <span className="text-xs text-fg-3">{v.sku}</span></th>
              <td className="py-2 numeric">{v.stockOnHand}</td>
              <td className="py-2 numeric">{v.reserved}</td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  <Input aria-label={`Change for ${v.sku}`} className="w-20" type="number" value={adj[v.id]?.delta ?? ''} onChange={(e) => setAdj({ ...adj, [v.id]: { delta: e.target.value, note: adj[v.id]?.note ?? '' } })} />
                  <Input aria-label={`Reason for ${v.sku}`} className="w-40" placeholder="Reason" value={adj[v.id]?.note ?? ''} onChange={(e) => setAdj({ ...adj, [v.id]: { delta: adj[v.id]?.delta ?? '', note: e.target.value } })} />
                  <Button size="sm" variant="secondary" disabled={!Number(adj[v.id]?.delta) || (adj[v.id]?.note ?? '').trim().length < 3} onClick={() => m.mutate(v.id)}>Apply</Button>
                </div>
              </td>
            </tr>
          )))}</tbody>
        </table>
      )}</QueryState>
    </Card>
  );
}

export function CodAdmin() {
  const [status, setStatus] = useState<CodStatus | ''>('');
  const q = useQuery({ queryKey: ['admin-cod', status], queryFn: () => get<{ orders: CodOrder[]; counts: Record<string, number> }>(`admin/merch/orders${status ? `?status=${status}` : ''}`) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">Cash on delivery: orders stay unpaid until you record delivery. Enter only tracking references the courier actually gave you.</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        <button type="button" aria-pressed={!status} onClick={() => setStatus('')} className={cx('rounded-full border px-3 py-1 text-xs', !status ? 'border-fg bg-fg text-canvas' : 'border-line text-fg-2')}>All</button>
        {COD_STATUSES.filter((s) => s !== 'draft').map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={cx('rounded-full border px-3 py-1 text-xs', status === s ? 'border-fg bg-fg text-canvas' : 'border-line text-fg-2')}>{COD_LABEL[s]}{q.data?.counts[s] ? ` (${q.data.counts[s]})` : ''}</button>
        ))}
      </div>
      <QueryState q={q} empty={(d) => (!d.orders.length ? <EmptyState icon="shop" title="No orders here" /> : null)}>{(d) => <ul className="space-y-3">{d.orders.map((o) => <OrderRow key={o.id} o={o} />)}</ul>}</QueryState>
      <Stock />
    </div>
  );
}
