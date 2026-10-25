import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, describeApiError, get, idempotencyKey, post, put, upload } from '../lib/api';
import { cap, dateTime, money } from '../lib/format';
import { Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { RoleGate } from '../components/RoleApplication';
import { QueryState, Notice, EmptyState, IntegrationNotice, SampleBadge } from '../components/ui/feedback';
import { Art } from '../components/visual';
import { Dialog, useToast } from '../components/ui/overlays';
import { DataTable, Pagination } from '../components/ui/data';
import { Icon } from '../components/ui/icons';
import { ReportDialog } from './identity';

const ProductViewer3D = lazy(() => import('../three/scenes').then((m) => ({ default: m.ProductViewer3D })));

const CATEGORIES: [string, string][] = [['', 'All'], ['report', 'Astrology reports'], ['digital_course', 'Courses'], ['book', 'Books'], ['audio', 'Audio'], ['ritual_supplies', 'Ritual supplies'], ['rudraksha', 'Rudraksha'], ['gemstone', 'Gemstones'], ['lifestyle', 'Lifestyle'], ['creator_product', 'Creator products']];
interface ProductItem { id: string; slug: string; title: string; description: string; category: string; fulfilment: string; images: string[]; fromPricePaise: number; inStock: boolean; isSample: boolean; rating: { avg: number; n: number } | null; commercialDisclosure: string | null }

function ProductArt({ p, className }: { p: { title: string; category: string; images: string[] }; className?: string }) {
  if (p.images[0]) return <img src={p.images[0]} alt="" loading="lazy" className={cx('object-cover', className)} />;
  // No photo exists: a neutral generated pattern (never a fake product photo).
  const hue = [...p.category].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div className={cx('flex items-center justify-center', className)} style={{ background: `linear-gradient(135deg, hsl(${hue} 35% 22%), hsl(${(hue + 60) % 360} 30% 12%))` }} aria-hidden="true">
      <Icon name={p.category === 'report' ? 'chart' : p.category === 'digital_course' ? 'learn' : p.category === 'book' ? 'bookmark' : 'sparkle'} size={40} className="text-[var(--accent)] opacity-70" />
    </div>
  );
}

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState('relevance');
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ['products', category, q, sort, page], queryFn: () => get<{ products: ProductItem[]; total: number; page: number; pageSize: number; shipping: string }>(`products?${new URLSearchParams({ ...(category && { category }), ...(q && { q }), sort, page: String(page) })}`) });
  return (
    <div>
      <PageHeader kicker="Shop" title="Reports, learning & ritual goods" subtitle="Reports are generated from your calculated chart. Physical listings show exactly what the seller has documented — nothing more."
        actions={<><ButtonLink to="/seller" variant="ghost">Sell on Nakshatra</ButtonLink><ButtonLink to="/shop/library" variant="secondary" icon="bookmark">Library</ButtonLink><ButtonLink to="/shop/orders" variant="secondary">Orders</ButtonLink><ButtonLink to="/shop/cart" icon="cart">Cart</ButtonLink></>} />
      <div className="mb-4 flex flex-wrap gap-2">{CATEGORIES.map(([k, l]) => <button key={k} type="button" aria-pressed={category === k} onClick={() => { setPage(1); setParams((p) => { if (k) p.set('category', k); else p.delete('category'); return p; }); }} className={cx('rounded-full border px-3 py-1.5 text-sm', category === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-2')}>{l}</button>)}</div>
      <div className="mb-5 flex flex-wrap gap-3"><Input aria-label="Search products" placeholder="Search…" className="max-w-xs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className="w-48"><option value="relevance">Relevance</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></Select></div>
      <QueryState q={list} empty={(d) => (!d.products.length ? <EmptyState icon="shop" title="Nothing found" /> : null)}>{(d) => (
        <>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{d.products.map((p) => (
            <li key={p.id}><Link to={`/shop/p/${p.slug}`} className="card block overflow-hidden p-0 hover:border-line-strong">
              <ProductArt p={p} className="aspect-square w-full" />
              <div className="p-3">
                <div className="flex flex-wrap gap-1">{p.isSample && <SampleBadge />}{!p.inStock && <Badge>Sold out</Badge>}</div>
                <p className="mt-1 line-clamp-2 text-sm text-fg">{p.title}</p>
                <p className="mt-1 font-semibold text-fg">{money(p.fromPricePaise)}</p>
              </div>
            </Link></li>
          ))}</ul>
          <Pagination page={d.page} pageSize={d.pageSize} total={d.total} onChange={setPage} />
          <p className="mt-4 text-xs text-fg-3">{d.shipping}</p>
        </>
      )}</QueryState>
    </div>
  );
}

interface ProductDetail { product: ProductItem & { modelUrl: string | null; certification: string | null; materials: string | null; dimensions: string | null; seller: { displayName: string; handle?: string } | undefined; tags: string[] }; variants: { id: string; name: string; pricePaise: number; compareAtPaise: number | null; stock: number | null; available: boolean; lowStock: boolean }[]; reviews: { id: string; rating: number; body: string; author?: string; verifiedPurchase: boolean }[]; saved: boolean; owned: boolean; reportTemplate: { title: string; description: string; includedInPlus: boolean; alreadyFree: string; adds: string } | null; disclaimer: string | null }

/**
 * Premium presentation for the two real platform offers. Artwork only — the price,
 * title and what's included stay live text, and ownership comes from the server
 * (`owned`), never from an image being shown.
 */
const OFFER_ART: Record<string, { cover: string; gallery: { src: string; label: string }[]; note: string }> = {
  'cosmetic-card-styles': {
    cover: '/visual/offers/card-pack-cover.svg',
    gallery: [
      { src: '/visual/offers/card-styles/card-style-eclipse-preview.svg', label: 'Eclipse Ink' },
      { src: '/visual/offers/card-styles/card-style-ember-foil-preview.svg', label: 'Saffron Foil' },
      { src: '/visual/offers/card-styles/card-style-engraved-preview.svg', label: 'Classic (free, for comparison)' },
    ],
    note: 'Previews show a sample sigil; your card uses your own archetype.',
  },
  'report-identity-expanded': {
    cover: '/visual/offers/report/report-cover.svg',
    gallery: [
      { src: '/visual/offers/report/report-section-core-self.svg', label: 'Your archetype in depth' },
      { src: '/visual/offers/report/report-section-expression.svg', label: 'Five dimensions, four sections each' },
      { src: '/visual/offers/report/report-section-relationships.svg', label: 'Archetypes you sit closest to' },
    ],
    note: 'Section artwork is decorative; every word of the report is generated from your own answers.',
  },
};

function OfferArt({ slug }: { slug: string }) {
  const o = OFFER_ART[slug];
  if (!o) return null;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface-2"><Art src={o.cover} eager className="aspect-[5/7] w-full object-cover" /></div>
      <ul className="grid grid-cols-3 gap-2">
        {o.gallery.map((g) => <li key={g.src}><figure><Art src={g.src} className="aspect-[5/7] w-full rounded-[var(--radius-sm)] border border-line object-cover" /><figcaption className="mt-1 text-[11px] leading-tight text-fg-3">{g.label}</figcaption></figure></li>)}
      </ul>
      <p className="text-xs text-fg-3">{o.note}</p>
    </div>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [variant, setVariant] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [report, setReport] = useState(false);
  const [view3d, setView3d] = useState(false);
  const [review, setReview] = useState({ rating: 5, body: '' });
  const q = useQuery({ queryKey: ['product', slug], queryFn: () => get<ProductDetail>(`products/${slug}`) });
  const add = useMutation({ mutationFn: () => put('cart/items', { variantId: variant ?? q.data!.variants.find((v) => v.available)!.id, quantity: qty }), onSuccess: () => { toast('Added to cart', 'success'); qc.invalidateQueries({ queryKey: ['cart'] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  const save = useMutation({ mutationFn: () => post(`products/${q.data!.product.id}/save`, { saved: !q.data!.saved }), onSuccess: () => qc.invalidateQueries({ queryKey: ['product', slug] }) });
  const rev = useMutation({ mutationFn: () => post(`products/${q.data!.product.id}/review`, review), onSuccess: () => { qc.invalidateQueries({ queryKey: ['product', slug] }); toast('Review posted', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <QueryState q={q}>{(d) => {
      const p = d.product;
      const v = d.variants.find((x) => x.id === variant) ?? d.variants.find((x) => x.available) ?? d.variants[0];
      return (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            {OFFER_ART[p.slug] ? <OfferArt slug={p.slug} /> : <div className="overflow-hidden rounded-[var(--radius-xl)] border border-line">
              {view3d && p.modelUrl ? <div className="aspect-square"><Suspense fallback={<ProductArt p={p} className="aspect-square w-full" />}><ProductViewer3D modelUrl={p.modelUrl} title={p.title} fallback={<ProductArt p={p} className="aspect-square w-full" />} /></Suspense></div> : <ProductArt p={p} className="aspect-square w-full" />}
            </div>}
            {p.modelUrl && <Button size="sm" variant="secondary" icon="cube" className="mt-3" onClick={() => setView3d(!view3d)}>{view3d ? 'Show photo' : 'View in 3D'}</Button>}
            {p.images.length > 1 && <div className="mt-3 flex gap-2">{p.images.slice(1).map((img) => <img key={img} src={img} alt="" className="h-16 w-16 rounded object-cover" />)}</div>}
          </div>
          <div>
            <div className="flex flex-wrap gap-2"><Badge tone="violet">{CATEGORIES.find((c) => c[0] === p.category)?.[1] ?? cap(p.category)}</Badge>{p.isSample && <SampleBadge />}{d.owned && <Badge tone="success">In your library</Badge>}</div>
            <h1 className="mt-3 font-display text-4xl">{p.title}</h1>
            <p className="mt-1 text-sm text-fg-3">Sold by {p.seller?.displayName}</p>
            {p.isSample && <Notice tone="dev" className="mt-4">Development sample listing — not real merchandise. Purchases use the payment simulator.</Notice>}
            <p className="mt-4 whitespace-pre-line leading-relaxed text-fg-2">{p.description}</p>
            {d.reportTemplate && <Notice tone="info" className="mt-4" title={d.reportTemplate.title}>{d.reportTemplate.description} {p.slug === 'report-identity-expanded' ? 'Generated instantly from your latest assessment after payment.' : 'Generated instantly from your saved chart after payment.'}{d.reportTemplate.includedInPlus && ' Included with Nakshatra+.'}<span className="mt-2 block"><strong>Already free in the app:</strong> {d.reportTemplate.alreadyFree}</span><span className="mt-1 block"><strong>What this adds:</strong> {d.reportTemplate.adds}</span></Notice>}
            <dl className="mt-4 space-y-1 text-sm">
              {p.materials && <div><dt className="inline text-fg-3">Materials: </dt><dd className="inline text-fg-2">{p.materials}</dd></div>}
              {p.dimensions && <div><dt className="inline text-fg-3">Dimensions: </dt><dd className="inline text-fg-2">{p.dimensions}</dd></div>}
              {['gemstone', 'rudraksha'].includes(p.category) && <div><dt className="inline text-fg-3">Certification: </dt><dd className="inline text-fg-2">{p.certification ?? 'None provided by the seller'}</dd></div>}
            </dl>
            {d.disclaimer && <p className="mt-3 text-xs text-fg-3">{d.disclaimer}</p>}
            {p.commercialDisclosure && <p className="mt-2 text-xs text-fg-3">Disclosure: {p.commercialDisclosure}</p>}
            <div className="mt-6">
              {d.variants.length > 1 && <fieldset><legend className="text-sm text-fg-2">Option</legend><div className="mt-2 flex flex-wrap gap-2">{d.variants.map((x) => <button key={x.id} type="button" disabled={!x.available} aria-pressed={v.id === x.id} onClick={() => setVariant(x.id)} className={cx('rounded-[var(--radius-sm)] border px-3 py-2 text-sm disabled:opacity-40', v.id === x.id ? 'border-accent bg-accent/10' : 'border-line')}>{x.name} · {money(x.pricePaise)}</button>)}</div></fieldset>}
              <p className="mt-4 font-display text-4xl">{money(v.pricePaise)}{v.compareAtPaise && <span className="ml-2 text-lg text-fg-3 line-through">{money(v.compareAtPaise)}</span>}</p>
              {v.lowStock && <p className="text-sm text-accent">Only {v.stock} left</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {p.fulfilment === 'physical' && <Input aria-label="Quantity" type="number" min={1} max={20} className="w-20" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />}
                <Button size="lg" icon="cart" disabled={!v.available || (d.owned && p.fulfilment === 'digital')} loading={add.isPending} onClick={() => add.mutate()}>{v.available ? (d.owned && p.fulfilment === 'digital' ? 'Owned' : 'Add to cart') : 'Sold out'}</Button>
                <Button size="lg" variant="secondary" onClick={() => { add.mutateAsync().then(() => nav('/shop/cart')).catch(() => undefined); }} disabled={!v.available}>Buy now</Button>
                <Button variant="ghost" icon="bookmark" aria-pressed={d.saved} onClick={() => save.mutate()}>{d.saved ? 'Saved' : 'Save'}</Button>
              </div>
            </div>
            <section className="mt-8">
              <h2 className="font-display text-2xl">Reviews from verified purchases</h2>
              <ul className="mt-3 space-y-3">{d.reviews.map((r) => <li key={r.id}><span className="text-accent">{'★'.repeat(r.rating)}</span> <span className="text-xs text-fg-3">{r.author}</span><p className="text-sm text-fg-2">{r.body}</p></li>)}{!d.reviews.length && <li className="text-sm text-fg-3">No reviews yet.</li>}</ul>
              <details className="mt-3"><summary className="cursor-pointer text-sm text-fg-2">Write a review (purchasers only)</summary><div className="mt-2 space-y-2"><Select aria-label="Rating" value={review.rating} onChange={(e) => setReview({ ...review, rating: Number(e.target.value) })} className="w-32">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</Select><Textarea rows={2} aria-label="Review" value={review.body} onChange={(e) => setReview({ ...review, body: e.target.value })} /><Button size="sm" onClick={() => rev.mutate()}>Post review</Button></div></details>
              <button type="button" className="mt-4 text-xs text-fg-3 hover:text-danger" onClick={() => setReport(true)}>Report this listing</button>
            </section>
          </div>
          <ReportDialog open={report} onClose={() => setReport(false)} targetType="product" targetId={p.id} />
        </div>
      );
    }}</QueryState>
  );
}

interface CartResp { items: { variantId: string; slug: string; title: string; variantName: string; unitPricePaise: number; quantity: number; fulfilment: string; image: string | null; stock: number | null; isSample: boolean; available: boolean }[]; totals: { subtotalPaise: number; discountPaise: number; shippingPaise: number; taxPaise: number; totalPaise: number }; discount: { code?: string; invalid?: boolean } | null; shippingRule: string; taxNote: string }

export function CartPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState('');
  const [addr, setAddr] = useState({ name: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'IN', phone: '' });
  const [gift, setGift] = useState({ on: false, message: '', recipientEmail: '' });
  const [key] = useState(idempotencyKey);
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['cart', applied], queryFn: () => get<CartResp>(`cart${applied ? `?code=${encodeURIComponent(applied)}` : ''}`) });
  const setQty = useMutation({ mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) => put('cart/items', { variantId, quantity }), onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }), onError: (e) => setErr((e as Error).message) });
  const checkout = useMutation({
    mutationFn: () => post<{ order: { id: string }; checkout: { checkoutPath: string } }>('checkout', { shippingAddress: q.data!.items.some((i) => i.fulfilment === 'physical') ? { ...addr, line2: addr.line2 || undefined } : undefined, discountCode: applied || undefined, gift: gift.on ? { message: gift.message, recipientEmail: gift.recipientEmail } : undefined, idempotencyKey: key }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['cart'] }); nav(r.checkout.checkoutPath); },
    onError: (e) => setErr(describeApiError(e, 'Checkout failed')),
  });
  return (
    <div>
      <PageHeader kicker="Shop" title="Your cart" />
      <QueryState q={q} empty={(d) => (!d.items.length ? <EmptyState icon="cart" title="Your cart is empty" action={<ButtonLink to="/shop">Browse the shop</ButtonLink>} /> : null)}>{(d) => {
        const physical = d.items.some((i) => i.fulfilment === 'physical');
        return (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <ul className="space-y-3">{d.items.map((i) => (
                <li key={i.variantId} className="card flex items-center gap-4 p-4">
                  <ProductArt p={{ title: i.title, category: i.fulfilment, images: i.image ? [i.image] : [] }} className="h-16 w-16 rounded" />
                  <div className="min-w-0 flex-1"><Link to={`/shop/p/${i.slug}`} className="text-fg hover:underline">{i.title}</Link><p className="text-xs text-fg-3">{i.variantName} · {money(i.unitPricePaise)}{i.isSample && ' · sample listing'}</p>{!i.available && <p className="text-xs text-danger">No longer available in this quantity</p>}</div>
                  {i.fulfilment === 'physical' ? <Input aria-label={`Quantity for ${i.title}`} type="number" min={0} max={20} className="w-20" value={i.quantity} onChange={(e) => setQty.mutate({ variantId: i.variantId, quantity: Number(e.target.value) })} /> : <span className="text-xs text-fg-3">Digital</span>}
                  <button type="button" className="text-xs text-fg-3 hover:text-danger" onClick={() => setQty.mutate({ variantId: i.variantId, quantity: 0 })}>Remove</button>
                </li>
              ))}</ul>
              {physical && (
                <Card className="space-y-3">
                  <h2 className="font-display text-2xl">Shipping address</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(['name', 'phone', 'line1', 'line2', 'city', 'state', 'postalCode'] as const).map((k) => <Field key={k} label={{ name: 'Full name', phone: 'Phone', line1: 'Address line 1', line2: 'Address line 2 (optional)', city: 'City', state: 'State', postalCode: 'PIN code' }[k]} className={k === 'line1' || k === 'line2' ? 'sm:col-span-2' : ''}>{(id) => <Input id={id} value={addr[k]} onChange={(e) => setAddr({ ...addr, [k]: e.target.value })} autoComplete={{ name: 'name', phone: 'tel', line1: 'address-line1', line2: 'address-line2', city: 'address-level2', state: 'address-level1', postalCode: 'postal-code' }[k]} />}</Field>)}
                  </div>
                </Card>
              )}
              <Card className="space-y-3">
                <Checkbox checked={gift.on} onChange={(v) => setGift({ ...gift, on: v })} label="This is a gift" description="Digital items go to the recipient’s account (matched by email); they receive a note from you." />
                {gift.on && <div className="grid gap-3 sm:grid-cols-2"><Field label="Recipient email">{(id) => <Input id={id} type="email" value={gift.recipientEmail} onChange={(e) => setGift({ ...gift, recipientEmail: e.target.value })} />}</Field><Field label="Gift message">{(id) => <Input id={id} value={gift.message} onChange={(e) => setGift({ ...gift, message: e.target.value })} />}</Field></div>}
              </Card>
            </div>
            <aside className="space-y-4">
              <Card>
                <h2 className="font-display text-2xl">Summary</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-fg-3">Subtotal</dt><dd>{money(d.totals.subtotalPaise)}</dd></div>
                  {d.totals.discountPaise > 0 && <div className="flex justify-between text-success"><dt>Discount</dt><dd>−{money(d.totals.discountPaise)}</dd></div>}
                  <div className="flex justify-between"><dt className="text-fg-3">Shipping</dt><dd>{d.totals.shippingPaise ? money(d.totals.shippingPaise) : 'Free'}</dd></div>
                  <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="text-fg">Total</dt><dd className="font-semibold">{money(d.totals.totalPaise)}</dd></div>
                </dl>
                <div className="mt-4 flex gap-2"><Input aria-label="Discount code" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} /><Button variant="secondary" onClick={() => setApplied(code.trim())}>Apply</Button></div>
                {d.discount?.invalid && <p className="mt-1 text-xs text-danger">That code isn’t valid.</p>}
                {d.discount?.code && <p className="mt-1 text-xs text-success">Code {d.discount.code} applied.</p>}
                <p className="mt-3 text-xs text-fg-3">{d.shippingRule} {d.taxNote}</p>
                {err && <Notice tone="danger" className="mt-3">{err}</Notice>}
                <div className="mt-3"><IntegrationNotice kind="payments" /></div>
                <Button block size="lg" className="mt-4" loading={checkout.isPending} onClick={() => { setErr(null); checkout.mutate(); }}>Continue to payment</Button>
              </Card>
            </aside>
          </div>
        );
      }}</QueryState>
    </div>
  );
}

const ORDER_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'accent' | 'violet' | 'danger'> = { pending_payment: 'warning', paid: 'success', fulfilling: 'accent', shipped: 'accent', delivered: 'success', completed: 'success', cancelled: 'neutral', refunded: 'neutral', partially_refunded: 'violet' };

export function OrdersPage() {
  const q = useQuery({ queryKey: ['orders'], queryFn: () => get<{ orders: { id: string; number: string; status: string; totalPaise: number; createdAt: string; isGift: boolean }[] }>('orders') });
  return (
    <div>
      <PageHeader kicker="Shop" title="Orders" />
      <QueryState q={q} empty={(d) => (!d.orders.length ? <EmptyState icon="shop" title="No orders yet" /> : null)}>{(d) => (
        <ul className="space-y-3">{d.orders.map((o) => <li key={o.id}><Link to={`/shop/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-line-strong"><div><p className="font-mono text-sm text-fg">{o.number}</p><p className="text-xs text-fg-3">{dateTime(o.createdAt)}{o.isGift ? ' · gift' : ''}</p></div><div className="flex items-center gap-3"><span className="text-fg">{money(o.totalPaise)}</span><Badge tone={ORDER_TONE[o.status]}>{cap(o.status)}</Badge></div></Link></li>)}</ul>
      )}</QueryState>
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState('');
  const [ret, setRet] = useState<{ itemId: string; qty: number; reason: string } | null>(null);
  const q = useQuery({ queryKey: ['order', id], queryFn: () => get<{ order: { id: string; number: string; status: string; subtotalPaise: number; discountPaise: number; shippingPaise: number; totalPaise: number; shippingAddress: Record<string, string> | null; isGift: boolean; giftRecipientEmail: string | null; createdAt: string; paymentId: string | null }; items: { id: string; title: string; variantName: string; unitPricePaise: number; quantity: number; fulfilment: string; productId: string }[]; shipments: { status: string; carrier: string | null; trackingNumber: string | null }[]; refunds: { id: string; amountPaise: number; status: string; reason: string }[]; returns: { id: string; status: string; quantity: number }[]; reports: { id: string; templateKey: string }[]; payment: { status: string; isSimulated: boolean; amountPaise: number; refundedPaise: number; id: string } | null }>(`orders/${id}`) });
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => post<{ message?: string }>(`orders/${id}/${path}`, body), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['order', id] }); toast(r?.message ?? 'Done', 'success'); setRefund(false); setRet(null); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <PageHeader kicker="Order" title={d.order.number} subtitle={dateTime(d.order.createdAt)} actions={<Badge tone={ORDER_TONE[d.order.status]}>{cap(d.order.status)}</Badge>} />
          {d.order.status === 'pending_payment' && d.payment && <Notice tone="warning">Payment pending. <Link to={`/pay/dev/${d.payment.id}`} className="underline">Complete payment</Link> or <button type="button" className="underline" onClick={() => act.mutate({ path: 'cancel', body: {} })}>cancel the order</button>. Unpaid orders are cancelled automatically after an hour.</Notice>}
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-line">{d.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div><p className="text-fg">{i.title}</p><p className="text-xs text-fg-3">{i.variantName} × {i.quantity} · {i.fulfilment}</p></div>
              <div className="flex items-center gap-3"><span>{money(i.unitPricePaise * i.quantity)}</span>{i.fulfilment === 'physical' && ['shipped', 'delivered', 'completed'].includes(d.order.status) && <Button size="sm" variant="ghost" onClick={() => setRet({ itemId: i.id, qty: 1, reason: '' })}>Return</Button>}</div>
            </li>
          ))}</ul>
          {d.reports.length > 0 && <Card><h2 className="font-display text-2xl">Your reports</h2><ul className="mt-2 space-y-1">{d.reports.map((r) => <li key={r.id}><Link to={`/reports/${r.id}`} className="text-accent underline">{cap(r.templateKey)}</Link></li>)}</ul></Card>}
          {d.shipments.map((s, i) => <Card key={i}><h2 className="font-display text-2xl">Delivery</h2><p className="mt-1 text-sm text-fg-2">{cap(s.status)}{s.trackingNumber ? ` · ${s.carrier ?? ''} ${s.trackingNumber}` : ''}</p></Card>)}
          {d.order.shippingAddress && <Card><h2 className="font-display text-2xl">Ship to</h2><p className="mt-1 whitespace-pre-line text-sm text-fg-2">{[d.order.shippingAddress.name, d.order.shippingAddress.line1, d.order.shippingAddress.line2, `${d.order.shippingAddress.city}, ${d.order.shippingAddress.state} ${d.order.shippingAddress.postalCode}`].filter(Boolean).join('\n')}</p></Card>}
        </div>
        <aside className="space-y-4">
          <Card>
            <h2 className="font-display text-2xl">Receipt</h2>
            <dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between"><dt className="text-fg-3">Subtotal</dt><dd>{money(d.order.subtotalPaise)}</dd></div>{d.order.discountPaise > 0 && <div className="flex justify-between"><dt className="text-fg-3">Discount</dt><dd>−{money(d.order.discountPaise)}</dd></div>}<div className="flex justify-between"><dt className="text-fg-3">Shipping</dt><dd>{money(d.order.shippingPaise)}</dd></div><div className="flex justify-between font-semibold"><dt>Total</dt><dd>{money(d.order.totalPaise)}</dd></div>{d.payment && <div className="flex justify-between"><dt className="text-fg-3">Payment</dt><dd>{cap(d.payment.status)}</dd></div>}{d.payment?.refundedPaise ? <div className="flex justify-between"><dt className="text-fg-3">Refunded</dt><dd>{money(d.payment.refundedPaise)}</dd></div> : null}</dl>
            {d.payment?.isSimulated && <p className="mt-2 text-xs text-violet">Development payment simulator — no real money moved.</p>}
          </Card>
          {d.payment?.status === 'succeeded' && !d.refunds.some((r) => ['requested', 'processing'].includes(r.status)) && <Button variant="secondary" block onClick={() => setRefund(true)}>Request a refund</Button>}
          {d.refunds.map((r) => <Notice key={r.id} tone="info">Refund {money(r.amountPaise)}: {cap(r.status)}</Notice>)}
          {d.returns.map((r) => <Notice key={r.id} tone="info">Return ({r.quantity}): {cap(r.status)}</Notice>)}
          <Link to={`/support?related=order&id=${d.order.id}`} className="block text-sm text-accent">Contact support about this order</Link>
        </aside>
        <Dialog open={refund} onClose={() => setRefund(false)} title="Request a refund" description="Requests are reviewed by our team within the 14-day window." footer={<Button disabled={reason.length < 5} onClick={() => act.mutate({ path: 'refund-request', body: { reason } })}>Submit request</Button>}>
          <Field label="Reason">{(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        </Dialog>
        <Dialog open={Boolean(ret)} onClose={() => setRet(null)} title="Return an item" footer={<Button disabled={!ret || ret.reason.length < 5} onClick={() => act.mutate({ path: 'returns', body: { orderItemId: ret!.itemId, quantity: ret!.qty, reason: ret!.reason } })}>Request return</Button>}>
          {ret && <div className="space-y-3"><Field label="Quantity">{(fid) => <Input id={fid} type="number" min={1} value={ret.qty} onChange={(e) => setRet({ ...ret, qty: Number(e.target.value) })} />}</Field><Field label="Reason">{(fid) => <Textarea id={fid} value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} />}</Field></div>}
        </Dialog>
      </div>
    )}</QueryState>
  );
}

export function LibraryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['library'], queryFn: () => get<{ products: { id: string; slug: string; title: string; category: string }[]; reports: { id: string; title: string; templateKey: string; createdAt: string }[]; subscription: { refId: string; expiresAt: string | null } | null }>('library') });
  const gen = useMutation({ mutationFn: (templateKey: string) => post<{ report: { id: string } }>('reports/generate', { templateKey }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['library'] }); nav(`/reports/${r.report.id}`); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <div>
      <PageHeader kicker="Shop" title="Your library" subtitle="Digital purchases, generated reports and membership benefits." />
      <QueryState q={q}>{(d) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-display text-2xl">Reports</h2>
            <ul className="mt-3 space-y-2">{d.reports.map((r) => <li key={r.id}><Link to={`/reports/${r.id}`} className="flex justify-between text-sm hover:underline"><span className="text-fg">{r.title}</span><span className="text-fg-3">{new Date(r.createdAt).toLocaleDateString()}</span></Link></li>)}{!d.reports.length && <li className="text-sm text-fg-3">No reports yet.</li>}</ul>
            {d.subscription && <div className="mt-4 space-y-2"><p className="text-sm text-fg-2">Included with Nakshatra+:</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" loading={gen.isPending} onClick={() => gen.mutate('natal_vedic_full')}>Generate Vedic report</Button><Button size="sm" variant="secondary" loading={gen.isPending} onClick={() => gen.mutate('western_natal')}>Generate Western report</Button></div></div>}
          </Card>
          <Card>
            <h2 className="font-display text-2xl">Digital products</h2>
            <ul className="mt-3 space-y-2">{d.products.map((p) => <li key={p.id}><Link to={`/shop/p/${p.slug}`} className="text-sm text-fg hover:underline">{p.title}</Link></li>)}{!d.products.length && <li className="text-sm text-fg-3">None yet.</li>}</ul>
          </Card>
        </div>
      )}</QueryState>
    </div>
  );
}

export function ReportView() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['report', id], queryFn: () => get<{ report: { templateKey: string; engineVersion: string; createdAt: string; content: { title: string; generatedAt: string; contentVersion: string; sections: { heading: string; items: { title: string; body: string; factor?: string }[] }[]; methodology: string[]; disclaimer: string } } }>(`reports/${id}`) });
  return (
    <QueryState q={q}>{({ report: r }) => (
      <article className="mx-auto max-w-3xl">
        <PageHeader kicker="Report" title={r.content.title} subtitle={`Generated ${new Date(r.content.generatedAt).toLocaleString()} · engine ${r.engineVersion} · content ${r.content.contentVersion}`} actions={<Button variant="secondary" icon="download" onClick={() => window.print()}>Print / save PDF</Button>} />
        <Notice tone="info" className="mb-6">{r.content.disclaimer}</Notice>
        {r.content.sections.map((s) => (
          <section key={s.heading} className="mb-8">
            <h2 className="mb-3 font-display text-3xl">{s.heading}</h2>
            <ul className="space-y-3">{s.items.map((i, k) => <li key={k} className="card p-4"><p className="font-semibold text-fg">{i.title}</p><p className="mt-1 text-sm leading-relaxed text-fg-2">{i.body}</p>{i.factor && <p className="mt-1 text-xs text-fg-3">{i.factor}</p>}</li>)}</ul>
          </section>
        ))}
        <details className="text-xs text-fg-3"><summary className="cursor-pointer">Methodology</summary><ul className="mt-2 space-y-1">{r.content.methodology.map((m) => <li key={m}>{m}</li>)}</ul></details>
      </article>
    )}</QueryState>
  );
}

export function Storefront() {
  const { handle } = useParams();
  const q = useQuery({ queryKey: ['store', handle], queryFn: () => get<{ seller: { displayName: string; bio: string }; products: { id: string; slug: string; title: string; category: string; images: string[]; isSample: boolean }[] }>(`storefronts/${handle}`) });
  return (
    <QueryState q={q}>{(d) => (
      <div>
        <PageHeader kicker="Storefront" title={d.seller.displayName} subtitle={d.seller.bio} />
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">{d.products.map((p) => <li key={p.id}><Link to={`/shop/p/${p.slug}`} className="card block overflow-hidden p-0"><ProductArt p={p} className="aspect-square w-full" /><p className="p-3 text-sm text-fg">{p.title}</p></Link></li>)}</ul>
      </div>
    )}</QueryState>
  );
}

export function SellerStudio() {
  return <RoleGate role="seller"><SellerStudioInner /></RoleGate>;
}

function SellerStudioInner() {
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const products = useQuery({ queryKey: ['seller-products'], queryFn: () => get<{ products: { id: string; slug: string; title: string; status: string; category: string; variants: { name: string; pricePaise: number; stock: number | null }[] }[] }>('seller/products') });
  const orders = useQuery({ queryKey: ['seller-orders'], queryFn: () => get<{ items: { id: string; title: string; variantName: string; quantity: number; orderNumber: string; orderStatus: string; createdAt: string; shipTo: { city?: string } | null }[] }>('seller/orders') });
  const img = useMutation({ mutationFn: ({ id, f }: { id: string; f: File }) => upload(`seller/products/${id}/images`, f), onSuccess: () => { qc.invalidateQueries({ queryKey: ['seller-products'] }); toast('Image added', 'success'); } });
  return (
    <div>
      <PageHeader kicker="Seller studio" title="Your products" subtitle="New listings are reviewed before going live. Only describe what you can verify." actions={<Button icon="plus" onClick={() => setCreating(true)}>New product</Button>} />
      <QueryState q={products}>{(d) => <DataTable rows={d.products} keyOf={(p) => p.id} empty="No products yet" columns={[
        { key: 't', header: 'Product', cell: (p) => <Link to={`/shop/p/${p.slug}`} className="text-fg hover:underline">{p.title}</Link> },
        { key: 's', header: 'Status', cell: (p) => <Badge tone={p.status === 'active' ? 'success' : 'warning'}>{p.status === 'draft' ? 'Awaiting review' : cap(p.status)}</Badge> },
        { key: 'v', header: 'Variants', cell: (p) => p.variants.map((v) => `${v.name} ${money(v.pricePaise)}${v.stock !== null ? ` (${v.stock})` : ''}`).join(', ') },
        { key: 'i', header: '', cell: (p) => <label className="cursor-pointer text-sm text-accent">Add image<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && img.mutate({ id: p.id, f: e.target.files[0] })} /></label> },
      ]} />}</QueryState>
      <h2 className="mb-3 mt-8 font-display text-2xl">Orders containing your items</h2>
      <QueryState q={orders}>{(d) => <DataTable rows={d.items} keyOf={(i) => i.id} empty="No orders yet" columns={[{ key: 'o', header: 'Order', cell: (i) => i.orderNumber }, { key: 'it', header: 'Item', cell: (i) => `${i.title} · ${i.variantName} × ${i.quantity}` }, { key: 's', header: 'Status', cell: (i) => cap(i.orderStatus) }, { key: 'c', header: 'Ship to', cell: (i) => i.shipTo?.city ?? 'Digital' }]} />}</QueryState>
      <NewProductDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function NewProductDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ title: '', description: '', category: 'book', fulfilment: 'physical', certification: '', materials: '', dimensions: '', variants: [{ name: 'Standard', price: 499, stock: 10 as number | null }] });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => post('seller/products', { ...v, certification: v.certification || undefined, materials: v.materials || undefined, dimensions: v.dimensions || undefined, variants: v.variants.map((x) => ({ name: x.name, pricePaise: Math.round(x.price * 100), stock: v.fulfilment === 'digital' ? null : x.stock })) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['seller-products'] }); onClose(); }, onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed') });
  return (
    <Dialog open={open} onClose={onClose} title="New product" size="lg" footer={<Button loading={m.isPending} onClick={() => m.mutate()}>Submit for review</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {err && <Notice tone="danger" className="sm:col-span-2">{err}</Notice>}
        <Field label="Title" className="sm:col-span-2">{(id) => <Input id={id} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Category">{(id) => <Select id={id} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{CATEGORIES.filter(([k]) => k && k !== 'report').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
        <Field label="Fulfilment">{(id) => <Select id={id} value={v.fulfilment} onChange={(e) => setV({ ...v, fulfilment: e.target.value })}><option value="physical">Physical (shipped)</option><option value="digital">Digital</option></Select>}</Field>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <Field label="Materials">{(id) => <Input id={id} value={v.materials} onChange={(e) => setV({ ...v, materials: e.target.value })} />}</Field>
        <Field label="Dimensions">{(id) => <Input id={id} value={v.dimensions} onChange={(e) => setV({ ...v, dimensions: e.target.value })} />}</Field>
        {['gemstone', 'rudraksha'].includes(v.category) && <Field label="Certification (lab name and certificate number)" className="sm:col-span-2" hint="Leave blank if you don’t have one — the listing will say “none provided”.">{(id, d) => <Input id={id} aria-describedby={d} value={v.certification} onChange={(e) => setV({ ...v, certification: e.target.value })} />}</Field>}
        <div className="sm:col-span-2 space-y-2"><p className="text-sm font-medium text-fg-2">Variants</p>{v.variants.map((x, i) => <div key={i} className="flex gap-2"><Input aria-label="Variant name" value={x.name} onChange={(e) => setV({ ...v, variants: v.variants.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} /><Input aria-label="Price (₹)" type="number" className="w-28" value={x.price} onChange={(e) => setV({ ...v, variants: v.variants.map((y, j) => (j === i ? { ...y, price: Number(e.target.value) } : y)) })} />{v.fulfilment === 'physical' && <Input aria-label="Stock" type="number" className="w-24" value={x.stock ?? 0} onChange={(e) => setV({ ...v, variants: v.variants.map((y, j) => (j === i ? { ...y, stock: Number(e.target.value) } : y)) })} />}</div>)}<Button size="sm" variant="ghost" icon="plus" onClick={() => setV({ ...v, variants: [...v.variants, { name: '', price: 499, stock: 10 }] })}>Add variant</Button></div>
      </div>
    </Dialog>
  );
}

/** Clearly labelled development payment simulator. It never runs in production. */
export function DevPayment() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['payment', id], queryFn: () => get<{ payment: { id: string; purpose: string; purposeId: string; amountPaise: number; status: string; isSimulated: boolean; provider: string; returnPath: string }; events: { type: string; toStatus: string | null; createdAt: string; signatureValid: boolean }[] }>(`payments/${id}`) });
  const sim = useMutation({ mutationFn: (outcome: 'succeeded' | 'failed') => post(`payments/dev/${id}/simulate`, { outcome }), onSuccess: () => { qc.invalidateQueries(); q.refetch(); } });
  const target = (p: { returnPath: string }) => p.returnPath;
  return (
    <QueryState q={q}>{({ payment: p, events }) => (
      <div className="mx-auto max-w-lg">
        <Card className="border-violet/50">
          <Badge tone="violet">Development payment simulator</Badge>
          <h1 className="mt-3 font-display text-4xl">{money(p.amountPaise)}</h1>
          <p className="text-sm text-fg-2">For your {p.purpose.replace('_', ' ')} · status <strong>{cap(p.status)}</strong></p>
          <Notice tone="dev" className="mt-4">No real money moves. The simulator sends a signed provider event through the same verified webhook path a real payment provider would use, so order, booking and subscription states change exactly as they would in production.</Notice>
          {['created', 'failed'].includes(p.status) ? (
            <div className="mt-5 flex gap-3"><Button loading={sim.isPending && sim.variables === 'succeeded'} onClick={() => sim.mutate('succeeded')}>Simulate successful payment</Button><Button variant="secondary" loading={sim.isPending && sim.variables === 'failed'} onClick={() => sim.mutate('failed')}>Simulate failure</Button></div>
          ) : <Button className="mt-5" onClick={() => nav(target(p))}>Continue</Button>}
          {sim.error && <Notice tone="danger" className="mt-3">{(sim.error as Error).message}</Notice>}
          {events.length > 0 && <ol className="mt-5 space-y-1 text-xs text-fg-3">{events.map((e, i) => <li key={i}>{new Date(e.createdAt).toLocaleTimeString()} · {e.type} → {e.toStatus ?? 'ignored'} · signature {e.signatureValid ? 'verified' : 'invalid'}</li>)}</ol>}
        </Card>
      </div>
    )}</QueryState>
  );
}

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayInstance { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void }
declare global { interface Window { Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance } }

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.'));
    document.body.appendChild(s);
  });
}

/** Real payments via Razorpay Checkout. The order is created server-side; status changes only after Razorpay's signed webhook. */
export function RazorpayPayment() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [stage, setStage] = useState<'ready' | 'confirming' | 'error'>('ready');
  const [err, setErr] = useState<string | null>(null);
  const cfg = useQuery({ queryKey: ['rzp', id], queryFn: () => get<{ keyId: string; orderId: string; amountPaise: number; currency: string; status: string; purpose: string; prefill: { email: string } }>(`payments/${id}/razorpay`) });
  const pay = useQuery({
    queryKey: ['payment', id],
    queryFn: () => get<{ payment: { status: string; returnPath: string; amountPaise: number; failureReason: string | null } }>(`payments/${id}`),
    refetchInterval: stage === 'confirming' ? 2000 : false,
  });
  const status = pay.data?.payment.status;
  const open = async () => {
    setErr(null);
    try {
      await loadRazorpayScript();
      const c = cfg.data!;
      const rzp = new window.Razorpay!({
        key: c.keyId, order_id: c.orderId, amount: c.amountPaise, currency: c.currency, name: 'Nakshatra', description: `Payment for your ${c.purpose.replace('_', ' ')}`,
        prefill: { email: c.prefill.email }, theme: { color: '#c39a51' },
        handler: async (r: RazorpayResponse) => {
          setStage('confirming');
          try { await post(`payments/${id}/razorpay/verify`, r); } catch (e) { setErr((e as Error).message); setStage('error'); }
          qc.invalidateQueries({ queryKey: ['payment', id] });
        },
        modal: { ondismiss: () => setStage('ready') },
      });
      rzp.on('payment.failed', (r) => { setErr(r.error?.description ?? 'The payment did not go through.'); setStage('error'); });
      rzp.open();
    } catch (e) {
      setErr((e as Error).message);
      setStage('error');
    }
  };
  return (
    <QueryState q={cfg}>{(c) => (
      <div className="mx-auto max-w-lg">
        <Card>
          <Badge tone="accent">Secure payment · Razorpay</Badge>
          <h1 className="mt-3 font-display text-4xl">{money(c.amountPaise)}</h1>
          <p className="text-sm text-fg-2">For your {c.purpose.replace('_', ' ')}. Card and UPI details are entered on Razorpay’s secure form — Nakshatra never sees them.</p>
          {err && <Notice tone="danger" className="mt-4">{err}</Notice>}
          {status === 'succeeded' ? (
            <><Notice tone="success" className="mt-4">Payment confirmed by Razorpay.</Notice><Button className="mt-4" onClick={() => nav(pay.data!.payment.returnPath)}>Continue</Button></>
          ) : status === 'failed' && stage !== 'confirming' ? (
            <><Notice tone="warning" className="mt-4">{pay.data?.payment.failureReason ?? 'The payment failed.'} You can try again.</Notice><Button className="mt-4" onClick={open}>Try again</Button></>
          ) : stage === 'confirming' ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-fg-2" role="status"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden /> Waiting for Razorpay to confirm your payment…</p>
          ) : (
            <Button className="mt-5" size="lg" onClick={open}>Pay {money(c.amountPaise)}</Button>
          )}
        </Card>
      </div>
    )}</QueryState>
  );
}
