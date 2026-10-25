import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, idempotencyKey, patch, post, put, upload } from '../lib/api';
import { cap, dateTime, money, time } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Avatar, Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState, IntegrationNotice, SampleBadge } from '../components/ui/feedback';
import { Dialog, Tabs, useToast } from '../components/ui/overlays';
import { DataTable, StatTile } from '../components/ui/data';
import { Icon } from '../components/ui/icons';

// Server profile rows are edited as loosely-typed form state; values are validated by the API schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormValues = Record<string, any>;

const SPECS = ['vedic', 'western', 'kp', 'tarot', 'numerology', 'vastu', 'pandit', 'palmistry'];
interface ExpertItem { userId: string; displayName: string; headline: string; specializations: string[]; languages: string[]; yearsExperience: number; verified: boolean; isSample: boolean; rating: { avg: number; count: number } | null; fromPricePaise: number | null; modes: string[]; nextAvailable: string | null; reasons: string[] }

export function ExpertsPage() {
  const [params, setParams] = useSearchParams();
  const spec = params.get('specialization') ?? '';
  const language = params.get('language') ?? '';
  const [q, setQ] = useState('');
  const query = useQuery({ queryKey: ['experts', spec, language, q], queryFn: () => get<{ experts: ExpertItem[]; rankingExplanation: string }>(`experts?${new URLSearchParams({ ...(spec && { specialization: spec }), ...(language && { language }), ...(q && { q }) })}`) });
  const set = (k: string, v: string) => setParams((p) => { if (v) p.set(k, v); else p.delete(k); return p; });
  return (
    <div>
      <PageHeader kicker="Experts" title="Talk to a verified practitioner" subtitle="Real people with reviewed credentials, published rates and real availability. Reviews come only from completed bookings."
        actions={<><ButtonLink to="/experts/bookings" variant="secondary" icon="calendar">My bookings</ButtonLink><ButtonLink to="/expert/dashboard" variant="ghost">I’m an expert</ButtonLink></>} />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Search">{(id) => <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or topic" className="w-56" />}</Field>
        <Field label="Specialisation">{(id) => <Select id={id} value={spec} onChange={(e) => set('specialization', e.target.value)}><option value="">Any</option>{SPECS.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</Select>}</Field>
        <Field label="Language">{(id) => <Select id={id} value={language} onChange={(e) => set('language', e.target.value)}><option value="">Any</option>{['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Kannada', 'Malayalam', 'Gujarati'].map((l) => <option key={l}>{l}</option>)}</Select>}</Field>
      </div>
      <QueryState q={query} empty={(d) => (!d.experts.length ? <EmptyState icon="expert" title="No experts match" body="Try another specialisation or language." /> : null)}>{(d) => (
        <>
          <p className="mb-3 text-xs text-fg-3">{d.rankingExplanation}</p>
          <ul className="grid gap-4 md:grid-cols-2">{d.experts.map((e) => (
            <li key={e.userId}><Link to={`/experts/${e.userId}`} className="card flex h-full gap-4 p-5 hover:border-line-strong">
              <Avatar name={e.displayName} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl">{e.displayName}</h2>{e.verified && <Badge tone="success">Verified</Badge>}{e.isSample && <SampleBadge />}</div>
                <p className="text-sm text-fg-2">{e.headline}</p>
                <p className="mt-1 text-xs text-fg-3">{e.specializations.map(cap).join(', ')} · {e.languages.join(', ')} · {e.yearsExperience} yrs</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">{e.rating ? <span className="text-accent">★ {e.rating.avg.toFixed(1)} <span className="text-fg-3">({e.rating.count})</span></span> : <span className="text-xs text-fg-3">No reviews yet</span>}{e.fromPricePaise !== null && <span className="text-fg">from {money(e.fromPricePaise)}</span>}{e.nextAvailable && <span className="text-xs text-fg-3">Next: {dateTime(e.nextAvailable)}</span>}</div>
                {e.reasons.length > 0 && <p className="mt-2 text-[11px] text-fg-3">{e.reasons.join(' · ')}</p>}
              </div>
            </Link></li>
          ))}</ul>
        </>
      )}</QueryState>
    </div>
  );
}

interface Service { id: string; mode: string; title: string; description: string; durationMinutes: number; pricePaise: number; capacity: number; available: boolean; unavailableReason: string | null }

export function ExpertProfilePage() {
  const { id } = useParams();
  const [book, setBook] = useState<Service | null>(null);
  const q = useQuery({ queryKey: ['expert', id], queryFn: () => get<{ expert: { userId: string; displayName: string; headline: string; bio: string; specializations: string[]; languages: string[]; yearsExperience: number; verified: boolean; isSample: boolean; timezone: string }; services: Service[]; credentials: { title: string; issuer: string; year: number | null }[]; reviews: { id: string; rating: number; body: string; response: string | null; createdAt: string; author: string }[]; courses: { slug: string; title: string }[]; workshops: { id: string; title: string; startsAt: string }[] }>(`experts/${id}`) });
  return (
    <QueryState q={q}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card className="flex gap-5">
            <Avatar name={d.expert.displayName} size={88} />
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-4xl">{d.expert.displayName}</h1>{d.expert.verified && <Badge tone="success">Credentials verified</Badge>}{d.expert.isSample && <SampleBadge />}</div>
              <p className="text-fg-2">{d.expert.headline}</p>
              <p className="mt-1 text-sm text-fg-3">{d.expert.specializations.map(cap).join(', ')} · {d.expert.languages.join(', ')} · {d.expert.yearsExperience} years</p>
            </div>
          </Card>
          {d.expert.isSample && <Notice tone="dev">This is development sample data — not a real practitioner. Bookings use the development payment simulator.</Notice>}
          {d.expert.bio && <Card><h2 className="font-display text-2xl">About</h2><p className="mt-2 whitespace-pre-line leading-relaxed text-fg-2">{d.expert.bio}</p></Card>}
          <Card><h2 className="font-display text-2xl">Verified credentials</h2>{d.credentials.length ? <ul className="mt-2 space-y-1 text-sm text-fg-2">{d.credentials.map((c) => <li key={c.title}>✓ {c.title} — {c.issuer}{c.year ? ` (${c.year})` : ''}</li>)}</ul> : <p className="mt-2 text-sm text-fg-3">No credentials have been verified yet.</p>}</Card>
          <Card>
            <h2 className="font-display text-2xl">Reviews from completed sessions</h2>
            <ul className="mt-3 space-y-4">{d.reviews.map((r) => <li key={r.id}><p className="text-accent">{'★'.repeat(r.rating)}<span className="text-fg-3">{'★'.repeat(5 - r.rating)}</span> <span className="text-xs text-fg-3">{r.author} · {new Date(r.createdAt).toLocaleDateString()}</span></p>{r.body && <p className="mt-1 text-sm text-fg-2">{r.body}</p>}{r.response && <p className="mt-1 border-l-2 border-line pl-3 text-xs text-fg-3">Response: {r.response}</p>}</li>)}{!d.reviews.length && <li className="text-sm text-fg-3">No reviews yet.</li>}</ul>
          </Card>
        </div>
        <aside className="space-y-4">
          <h2 className="font-display text-2xl">Services</h2>
          {d.services.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3"><div><p className="text-fg">{s.title}</p><p className="text-xs text-fg-3">{cap(s.mode)} · {s.durationMinutes} min{s.capacity > 1 ? ` · ${s.capacity} seats` : ''}</p></div><p className="font-display text-2xl">{money(s.pricePaise)}</p></div>
              {s.description && <p className="mt-2 text-sm text-fg-2">{s.description}</p>}
              {s.available ? <Button size="sm" className="mt-3" onClick={() => setBook(s)}>Choose a time</Button> : <Notice tone="warning" className="mt-3">{s.unavailableReason}</Notice>}
            </Card>
          ))}
          {d.courses.length > 0 && <Card><h3 className="font-display text-2xl">Courses</h3><ul className="mt-2 space-y-1 text-sm">{d.courses.map((c) => <li key={c.slug}><Link to={`/learn/${c.slug}`} className="text-accent hover:underline">{c.title}</Link></li>)}</ul></Card>}
        </aside>
        {book && <BookingDialog expertId={d.expert.userId} service={book} onClose={() => setBook(null)} />}
      </div>
    )}</QueryState>
  );
}

function BookingDialog({ expertId, service, onClose }: { expertId: string; service: Service; onClose: () => void }) {
  const { dateLocale } = useI18n();
  const nav = useNavigate();
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [share, setShare] = useState(false);
  const [key] = useState(idempotencyKey);
  const [err, setErr] = useState<string | null>(null);
  const slots = useQuery({ queryKey: ['slots', expertId, service.id], queryFn: () => get<{ slots: { start: string; end: string }[] }>(`experts/${expertId}/availability?serviceId=${service.id}&days=14`) });
  const byDay = useMemo(() => {
    const m = new Map<string, { start: string }[]>();
    for (const s of slots.data?.slots ?? []) { const k = new Date(s.start).toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' }); m.set(k, [...(m.get(k) ?? []), s]); }
    return [...m];
  }, [slots.data, dateLocale]);
  const m = useMutation({ mutationFn: () => post<{ checkout: { paymentId: string; checkoutPath: string } }>('bookings', { serviceId: service.id, start: slot, note, shareChart: share, idempotencyKey: key }), onSuccess: (r) => nav(r.checkout.checkoutPath), onError: (e) => setErr(e instanceof ApiError ? e.message : 'Booking failed') });
  return (
    <Dialog open onClose={onClose} title={service.title} description={`${service.durationMinutes} minutes · ${money(service.pricePaise)}. Times shown in your local time zone.`} size="lg"
      footer={<Button disabled={!slot} loading={m.isPending} onClick={() => m.mutate()}>Continue to payment</Button>}>
      <div className="space-y-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <IntegrationNotice kind="payments" />
        <QueryState q={slots} empty={(d) => (!d.slots.length ? <EmptyState icon="clock" title="No open times in the next two weeks" /> : null)}>{() => (
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1 scrollbar-thin">{byDay.map(([day, list]) => <div key={day}><p className="mb-1 text-xs uppercase tracking-[0.14em] text-fg-3">{day}</p><div className="flex flex-wrap gap-2">{list.map((s) => <button key={s.start} type="button" aria-pressed={slot === s.start} onClick={() => setSlot(s.start)} className={cx('rounded-full border px-3 py-1.5 text-sm numeric', slot === s.start ? 'border-accent bg-accent text-accent-ink' : 'border-line hover:border-line-strong')}>{time(s.start, dateLocale)}</button>)}</div></div>)}</div>
        )}</QueryState>
        <Field label="What would you like to explore? (optional)">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <Checkbox checked={share} onChange={setShare} label="Share my chart with this expert for this session" description="They see your calculated placements (not your birthplace coordinates) until the session is completed." />
        <p className="text-xs text-fg-3">Your slot is held for 15 minutes while you pay. Cancel 24+ hours before for a full refund.</p>
      </div>
    </Dialog>
  );
}

interface Booking { id: string; status: string; startsAt: string; endsAt: string; pricePaise: number; service?: { title: string; mode: string }; expert: { userId: string; displayName?: string }; customer?: { userId: string; displayName?: string }; conversationId: string | null }
const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger' | 'accent' | 'violet'> = { confirmed: 'success', in_progress: 'accent', pending_payment: 'warning', completed: 'violet', cancelled: 'neutral', refunded: 'neutral', expired: 'neutral', disputed: 'danger' };

export function MyBookings() {
  const q = useQuery({ queryKey: ['bookings', 'customer'], queryFn: () => get<{ bookings: Booking[] }>('bookings?as=customer') });
  return (
    <div>
      <PageHeader kicker="Experts" title="My bookings" />
      <QueryState q={q} empty={(d) => (!d.bookings.length ? <EmptyState icon="calendar" title="No bookings yet" action={<ButtonLink to="/experts">Find an expert</ButtonLink>} /> : null)}>{(d) => (
        <ul className="space-y-3">{d.bookings.map((b) => <li key={b.id}><Link to={`/experts/bookings/${b.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-line-strong"><div><p className="text-fg">{b.service?.title} with {b.expert.displayName}</p><p className="text-xs text-fg-3">{dateTime(b.startsAt)} · {money(b.pricePaise)}</p></div><Badge tone={STATUS_TONE[b.status]}>{cap(b.status)}</Badge></Link></li>)}</ul>
      )}</QueryState>
    </div>
  );
}

interface BookingDetailResp { booking: Booking & { customerNote: string; sharedChart: boolean; completedAt: string | null; expertId: string; serviceId: string }; service: { title: string; mode: string; durationMinutes: number }; expert: { userId: string; displayName: string }; history: { toStatus: string; note: string; createdAt: string }[]; notes: { id: string; body: string; sharedWithCustomer: boolean; createdAt: string }[]; review: { rating: number; body: string } | null; dispute: { status: string; reason: string } | null; refunds: { id: string; amountPaise: number; status: string; reason: string }[]; payment: { id: string; status: string; amountPaise: number; refundedPaise: number; provider: string; isSimulated: boolean; createdAt: string } | null; role: 'expert' | 'customer'; cancellationPolicy: string }

export function BookingDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => get<BookingDetailResp>(`bookings/${id}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['booking', id] });
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => post<{ note?: string; message?: string }>(`bookings/${id}/${path}`, body ?? {}), onSuccess: (r) => { refresh(); toast(r?.note ?? r?.message ?? 'Done', 'success'); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  const [review, setReview] = useState({ rating: 5, body: '' });
  const [dispute, setDispute] = useState({ open: false, reason: 'quality', details: '' });
  const [note, setNote] = useState({ body: '', shared: false });
  const [chartOpen, setChartOpen] = useState(false);
  const chart = useQuery({ queryKey: ['booking-chart', id], queryFn: () => get<{ vedic: { placements: { id: string; name: string; signName: string; dms: string }[] } | null; note: string }>(`bookings/${id}/customer-chart`), enabled: chartOpen, retry: false });
  return (
    <QueryState q={q}>{(d) => {
      const b = d.booking;
      const upcoming = ['confirmed', 'pending_payment'].includes(b.status);
      // Mirrors the server rules: start from 15 minutes before; complete only after the start time.
      const canStart = Date.now() >= Date.parse(b.startsAt) - 15 * 60000;
      const canComplete = Date.now() >= Date.parse(b.startsAt);
      return (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-5">
            <PageHeader kicker={d.role === 'expert' ? 'Booking (as expert)' : 'Booking'} title={d.service.title} subtitle={`${dateTime(b.startsAt)} · ${d.service.durationMinutes} min · with ${d.role === 'expert' ? b.customer?.displayName ?? 'customer' : d.expert.displayName}`} actions={<Badge tone={STATUS_TONE[b.status]}>{cap(b.status)}</Badge>} />
            {b.status === 'pending_payment' && d.payment && d.role === 'customer' && <Notice tone="warning" title="Payment pending">Complete payment within 15 minutes to confirm this slot. <Link className="underline" to={`/pay/dev/${d.payment.id}`}>Pay now</Link></Notice>}
            {b.conversationId && ['confirmed', 'in_progress', 'completed'].includes(b.status) && <ButtonLink to={`/messages/${b.conversationId}`} icon="messages">Open consultation chat</ButtonLink>}
            {b.customerNote && <Card><h2 className="font-display text-2xl">Customer’s note</h2><p className="mt-1 text-sm text-fg-2">{b.customerNote}</p></Card>}
            {d.role === 'expert' && (
              <Card className="space-y-3">
                <h2 className="font-display text-2xl">Session tools</h2>
                {['confirmed', 'in_progress'].includes(b.status) && !canComplete && <p id="session-timing" className="text-xs text-fg-3">{canStart ? 'You can mark the session completed once it has started.' : `You can start the session from ${dateTime(new Date(Date.parse(b.startsAt) - 15 * 60000).toISOString())} (15 minutes before it begins).`}</p>}
                <div className="flex flex-wrap gap-2">
                  {b.status === 'confirmed' && <Button size="sm" disabled={!canStart} aria-describedby="session-timing" onClick={() => act.mutate({ path: 'start' })}>Start session</Button>}
                  {['confirmed', 'in_progress'].includes(b.status) && <Button size="sm" variant="secondary" disabled={!canComplete} aria-describedby="session-timing" onClick={() => act.mutate({ path: 'complete' })}>Mark completed</Button>}
                  {b.sharedChart && <Button size="sm" variant="secondary" onClick={() => setChartOpen(true)}>View shared chart</Button>}
                </div>
                <Field label="Consultation note">{(fid) => <Textarea id={fid} rows={3} value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />}</Field>
                <Checkbox checked={note.shared} onChange={(v) => setNote({ ...note, shared: v })} label="Share this note with the customer" />
                <Button size="sm" disabled={!note.body.trim()} onClick={() => { act.mutate({ path: 'notes', body: { body: note.body, sharedWithCustomer: note.shared } }); setNote({ body: '', shared: false }); }}>Save note</Button>
              </Card>
            )}
            {d.notes.length > 0 && <Card><h2 className="font-display text-2xl">Notes</h2><ul className="mt-2 space-y-2 text-sm text-fg-2">{d.notes.map((n) => <li key={n.id} className="whitespace-pre-line">{n.body}</li>)}</ul></Card>}
            {d.role === 'customer' && b.status === 'completed' && !d.review && (
              <Card className="space-y-3">
                <h2 className="font-display text-2xl">Leave a review</h2>
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={review.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setReview({ ...review, rating: n })} className={cx('text-2xl', n <= review.rating ? 'text-accent' : 'text-fg-3')}>★</button>)}</div>
                <Textarea rows={3} aria-label="Review" value={review.body} onChange={(e) => setReview({ ...review, body: e.target.value })} />
                <Button size="sm" onClick={() => act.mutate({ path: 'review', body: review })}>Submit review</Button>
              </Card>
            )}
            {d.review && <Card><h2 className="font-display text-2xl">Your review</h2><p className="text-accent">{'★'.repeat(d.review.rating)}</p><p className="text-sm text-fg-2">{d.review.body}</p></Card>}
          </div>
          <aside className="space-y-4">
            {d.payment && (
              <Card>
                <h2 className="font-display text-2xl">Receipt</h2>
                <dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between"><dt className="text-fg-3">Amount</dt><dd>{money(d.payment.amountPaise)}</dd></div><div className="flex justify-between"><dt className="text-fg-3">Status</dt><dd>{cap(d.payment.status)}</dd></div>{d.payment.refundedPaise > 0 && <div className="flex justify-between"><dt className="text-fg-3">Refunded</dt><dd>{money(d.payment.refundedPaise)}</dd></div>}<div className="flex justify-between"><dt className="text-fg-3">Reference</dt><dd className="font-mono text-xs">{d.payment.id.slice(0, 8)}</dd></div></dl>
                {d.payment.isSimulated && <p className="mt-2 text-xs text-violet">Development payment simulator — no real money moved.</p>}
              </Card>
            )}
            {d.role === 'customer' && (
              <Card className="space-y-2">
                <h2 className="font-display text-2xl">Need to change something?</h2>
                <p className="text-xs text-fg-3">{d.cancellationPolicy}</p>
                {upcoming && <Button size="sm" variant="danger" onClick={() => act.mutate({ path: 'cancel', body: { reason: 'Cancelled by customer' } })}>Cancel booking</Button>}
                {['confirmed', 'in_progress', 'completed', 'cancelled'].includes(b.status) && !d.dispute && <Button size="sm" variant="secondary" onClick={() => setDispute({ ...dispute, open: true })}>Report a problem</Button>}
                {b.status === 'cancelled' && d.payment?.status === 'succeeded' && !d.refunds.length && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: 'refund-request', body: { reason: 'Late cancellation — requesting review' } })}>Request refund review</Button>}
                {b.status === 'completed' && <Button size="sm" variant="ghost" onClick={() => nav(`/experts/${d.expert.userId}`)}>Book a follow-up</Button>}
                {d.dispute && <Notice tone="info">Dispute: {cap(d.dispute.status)} ({d.dispute.reason})</Notice>}
                {d.refunds.map((r) => <Notice key={r.id} tone="info">Refund {money(r.amountPaise)}: {cap(r.status)}</Notice>)}
              </Card>
            )}
            {d.role === 'expert' && upcoming && <Button size="sm" variant="danger" onClick={() => act.mutate({ path: 'cancel', body: { reason: 'Cancelled by expert' } })}>Cancel (customer is refunded in full)</Button>}
            <Card><h2 className="font-display text-2xl">History</h2><ol className="mt-2 space-y-1 text-xs text-fg-3">{d.history.map((h, i) => <li key={i}>{new Date(h.createdAt).toLocaleString()} — {cap(h.toStatus)}{h.note ? ` (${h.note})` : ''}</li>)}</ol></Card>
          </aside>
          <Dialog open={dispute.open} onClose={() => setDispute({ ...dispute, open: false })} title="Report a problem" footer={<Button variant="danger" onClick={() => { act.mutate({ path: 'dispute', body: { reason: dispute.reason, details: dispute.details } }); setDispute({ ...dispute, open: false }); }}>Submit</Button>}>
            <Field label="What happened?">{(fid) => <Select id={fid} value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })}><option value="no_show">Expert didn’t attend</option><option value="quality">Quality concern</option><option value="technical">Technical problem</option><option value="billing">Billing issue</option><option value="conduct">Conduct concern</option><option value="other">Other</option></Select>}</Field>
            <Field label="Details" className="mt-3">{(fid) => <Textarea id={fid} value={dispute.details} onChange={(e) => setDispute({ ...dispute, details: e.target.value })} />}</Field>
          </Dialog>
          <Dialog open={chartOpen} onClose={() => setChartOpen(false)} title="Customer’s shared chart">
            {chart.error ? <Notice tone="info">{(chart.error as Error).message}</Notice> : chart.data?.vedic && <><ul className="grid grid-cols-2 gap-2 text-sm">{chart.data.vedic.placements.map((p) => <li key={p.id}>{p.name}: {p.signName} {p.dms}</li>)}</ul><p className="mt-3 text-xs text-fg-3">{chart.data.note}</p></>}
          </Dialog>
        </div>
      );
    }}</QueryState>
  );
}

export function ExpertDashboard() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery({ queryKey: ['expert-me'], queryFn: () => get<{ expert: FormValues | null; services?: (Service & { active: boolean })[]; rules?: { weekday: number; startTime: string; endTime: string }[]; exceptions?: { id: string; date: string; reason: string }[]; credentials?: { id: string; title: string; issuer: string; status: string }[] }>('expert/me') });
  const [tab, setTab] = useState<'profile' | 'services' | 'availability' | 'bookings' | 'earnings'>('profile');
  const refresh = () => qc.invalidateQueries({ queryKey: ['expert-me'] });
  return (
    <div>
      <PageHeader kicker="Expert studio" title="Your practice" subtitle="Profile, verification, services, availability, bookings and earnings." />
      <QueryState q={me}>{(d) => (
        <>
          {d.expert && <div className="mb-5 flex flex-wrap items-center gap-2"><Badge tone={d.expert.verificationStatus === 'verified' ? 'success' : d.expert.verificationStatus === 'pending' ? 'warning' : 'neutral'}>Verification: {d.expert.verificationStatus}</Badge>{d.expert.verificationStatus === 'verified' && <Link to={`/experts/${d.expert.userId}`} className="text-sm text-accent">View public profile →</Link>}</div>}
          <Tabs tabs={[{ value: 'profile', label: 'Profile & verification' }, { value: 'services', label: 'Services' }, { value: 'availability', label: 'Availability' }, { value: 'bookings', label: 'Bookings' }, { value: 'earnings', label: 'Earnings & analytics' }]} value={tab} onChange={setTab} className="mb-6" />
          {tab === 'profile' && <ExpertProfileForm expert={d.expert} credentials={d.credentials ?? []} onSaved={() => { refresh(); toast('Saved', 'success'); }} />}
          {tab === 'services' && (d.expert ? <ServicesEditor services={d.services ?? []} onChange={refresh} /> : <Notice tone="info">Create your profile first.</Notice>)}
          {tab === 'availability' && (d.expert ? <AvailabilityEditor rules={d.rules ?? []} exceptions={d.exceptions ?? []} onChange={refresh} /> : <Notice tone="info">Create your profile first.</Notice>)}
          {tab === 'bookings' && <ExpertBookings />}
          {tab === 'earnings' && <ExpertEarnings />}
        </>
      )}</QueryState>
    </div>
  );
}

function ExpertProfileForm({ expert, credentials, onSaved }: { expert: FormValues | null; credentials: { id: string; title: string; issuer: string; status: string }[]; onSaved: () => void }) {
  const [v, setV] = useState({ displayName: expert?.displayName ?? '', headline: expert?.headline ?? '', bio: expert?.bio ?? '', specializations: (expert?.specializations ?? []) as string[], languages: (expert?.languages ?? []).join(', '), yearsExperience: expert?.yearsExperience ?? 1, acceptsBookings: expert?.acceptsBookings ?? true });
  const [cred, setCred] = useState({ title: '', issuer: '', year: '' });
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => put('expert/me', { ...v, languages: v.languages.split(',').map((s: string) => s.trim()).filter(Boolean) }), onSuccess: onSaved, onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed') });
  const addCred = useMutation({ mutationFn: () => upload('expert/credentials', file!, cred), onSuccess: () => { setFile(null); setCred({ title: '', issuer: '', year: '' }); onSaved(); }, onError: (e) => setErr((e as Error).message) });
  const submit = useMutation({ mutationFn: () => post('expert/submit-verification'), onSuccess: onSaved, onError: (e) => setErr((e as Error).message) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Public name">{(id) => <Input id={id} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />}</Field>
        <Field label="Headline">{(id) => <Input id={id} value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} />}</Field>
        <Field label="Bio">{(id) => <Textarea id={id} rows={5} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} />}</Field>
        <fieldset><legend className="text-sm font-medium text-fg-2">Specialisations</legend><div className="mt-2 flex flex-wrap gap-2">{SPECS.map((s) => <button key={s} type="button" aria-pressed={v.specializations.includes(s)} onClick={() => setV({ ...v, specializations: v.specializations.includes(s) ? v.specializations.filter((x) => x !== s) : [...v.specializations, s] })} className={cx('rounded-full border px-3 py-1 text-sm', v.specializations.includes(s) ? 'border-accent bg-accent/10' : 'border-line text-fg-2')}>{cap(s)}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-3"><Field label="Languages">{(id) => <Input id={id} value={v.languages} onChange={(e) => setV({ ...v, languages: e.target.value })} />}</Field><Field label="Years of experience">{(id) => <Input id={id} type="number" value={v.yearsExperience} onChange={(e) => setV({ ...v, yearsExperience: Number(e.target.value) })} />}</Field></div>
        <Checkbox checked={v.acceptsBookings} onChange={(x) => setV({ ...v, acceptsBookings: x })} label="Accepting new bookings" />
        <Button loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-display text-2xl">Credentials</h2>
        <p className="text-sm text-fg-2">Upload certificates or letters (PDF or image). A Nakshatra reviewer checks them manually before your profile is listed. Documents are stored privately.</p>
        <ul className="space-y-1 text-sm">{credentials.map((c) => <li key={c.id} className="flex justify-between"><span>{c.title} — {c.issuer}</span><Badge tone={c.status === 'verified' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'}>{c.status}</Badge></li>)}</ul>
        <div className="grid gap-3 sm:grid-cols-3"><Input aria-label="Credential title" placeholder="Title" value={cred.title} onChange={(e) => setCred({ ...cred, title: e.target.value })} /><Input aria-label="Issuer" placeholder="Issuer" value={cred.issuer} onChange={(e) => setCred({ ...cred, issuer: e.target.value })} /><Input aria-label="Year" placeholder="Year" value={cred.year} onChange={(e) => setCred({ ...cred, year: e.target.value })} /></div>
        <Input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Credential document" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button variant="secondary" disabled={!file || !cred.title || !cred.issuer} loading={addCred.isPending} onClick={() => addCred.mutate()}>Add credential</Button>
        {expert && ['draft', 'rejected'].includes(expert.verificationStatus) && <Button loading={submit.isPending} onClick={() => submit.mutate()}>Submit for verification</Button>}
      </Card>
    </div>
  );
}

function ServicesEditor({ services, onChange }: { services: (Service & { active: boolean })[]; onChange: () => void }) {
  const [v, setV] = useState({ mode: 'chat', title: '', description: '', durationMinutes: 30, price: 500, capacity: 1 });
  const [err, setErr] = useState<string | null>(null);
  const add = useMutation({ mutationFn: () => post('expert/services', { mode: v.mode, title: v.title, description: v.description, durationMinutes: v.durationMinutes, pricePaise: Math.round(v.price * 100), capacity: v.capacity }), onSuccess: () => { setV({ ...v, title: '', description: '' }); onChange(); }, onError: (e) => setErr((e as Error).message) });
  const toggle = useMutation({ mutationFn: (s: Service & { active: boolean }) => patch(`expert/services/${s.id}`, { active: !s.active }), onSuccess: onChange });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ul className="space-y-3">{services.map((s) => <li key={s.id} className={cx('card flex items-center justify-between gap-3 p-4', !s.active && 'opacity-60')}><div><p className="text-fg">{s.title}</p><p className="text-xs text-fg-3">{cap(s.mode)} · {s.durationMinutes} min · {money(s.pricePaise)}</p></div><Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>{s.active ? 'Pause' : 'Activate'}</Button></li>)}{!services.length && <li className="text-sm text-fg-3">No services yet.</li>}</ul>
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Add a service</h2>
        {err && <Notice tone="danger">{err}</Notice>}
        <IntegrationNotice kind="video" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mode">{(id) => <Select id={id} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}><option value="chat">Chat</option><option value="voice">Voice (provider required)</option><option value="video">Video (provider required)</option><option value="report">Written report</option><option value="workshop">Workshop</option><option value="group_session">Group session</option></Select>}</Field>
          <Field label="Duration (min)">{(id) => <Input id={id} type="number" min={15} max={240} value={v.durationMinutes} onChange={(e) => setV({ ...v, durationMinutes: Number(e.target.value) })} />}</Field>
          <Field label="Price (₹)">{(id) => <Input id={id} type="number" min={0} value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} />}</Field>
          {['workshop', 'group_session'].includes(v.mode) && <Field label="Seats">{(id) => <Input id={id} type="number" min={1} value={v.capacity} onChange={(e) => setV({ ...v, capacity: Number(e.target.value) })} />}</Field>}
        </div>
        <Field label="Title">{(id) => <Input id={id} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Description">{(id) => <Textarea id={id} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <Button loading={add.isPending} disabled={!v.title} onClick={() => add.mutate()}>Add service</Button>
      </Card>
    </div>
  );
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function AvailabilityEditor({ rules, exceptions, onChange }: { rules: { weekday: number; startTime: string; endTime: string }[]; exceptions: { id: string; date: string; reason: string }[]; onChange: () => void }) {
  const [list, setList] = useState(rules);
  const [ex, setEx] = useState({ date: '', reason: '' });
  const toast = useToast();
  const save = useMutation({ mutationFn: () => put('expert/availability', { rules: list }), onSuccess: () => { onChange(); toast('Availability saved', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const addEx = useMutation({ mutationFn: () => post('expert/exceptions', ex), onSuccess: () => { setEx({ date: '', reason: '' }); onChange(); } });
  const delEx = useMutation({ mutationFn: (id: string) => del(`expert/exceptions/${id}`), onSuccess: onChange });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Weekly hours</h2>
        {list.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select aria-label="Day" value={r.weekday} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))} className="w-36">{DAYS.map((dname, k) => <option key={k} value={k}>{dname}</option>)}</Select>
            <Input aria-label="Start" type="time" className="w-28" value={r.startTime} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} />
            <span className="text-fg-3">to</span>
            <Input aria-label="End" type="time" className="w-28" value={r.endTime} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} />
            <Button size="sm" variant="ghost" icon="trash" aria-label="Remove" onClick={() => setList(list.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="flex gap-2"><Button size="sm" variant="secondary" icon="plus" onClick={() => setList([...list, { weekday: 1, startTime: '10:00', endTime: '17:00' }])}>Add hours</Button><Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-2xl">Days off</h2>
        <div className="flex flex-wrap gap-2"><Input aria-label="Date" type="date" className="w-44" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} /><Input aria-label="Reason" placeholder="Reason (optional)" className="flex-1" value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} /><Button size="sm" disabled={!ex.date} onClick={() => addEx.mutate()}>Add</Button></div>
        <ul className="space-y-1 text-sm">{exceptions.map((x) => <li key={x.id} className="flex justify-between"><span>{x.date} {x.reason && `— ${x.reason}`}</span><button type="button" className="text-xs text-danger" onClick={() => delEx.mutate(x.id)}>Remove</button></li>)}</ul>
      </Card>
    </div>
  );
}

function ExpertBookings() {
  const q = useQuery({ queryKey: ['bookings', 'expert'], queryFn: () => get<{ bookings: Booking[] }>('bookings?as=expert') });
  return <QueryState q={q}>{(d) => <DataTable rows={d.bookings} keyOf={(b) => b.id} empty="No bookings yet" columns={[
    { key: 'when', header: 'When', cell: (b) => dateTime(b.startsAt) },
    { key: 'service', header: 'Service', cell: (b) => b.service?.title },
    { key: 'customer', header: 'Customer', cell: (b) => b.customer?.displayName },
    { key: 'status', header: 'Status', cell: (b) => <Badge tone={STATUS_TONE[b.status]}>{cap(b.status)}</Badge> },
    { key: 'open', header: '', cell: (b) => <Link to={`/experts/bookings/${b.id}`} className="text-accent">Open <Icon name="chevronRight" size={14} className="inline" /></Link> },
  ]} />}</QueryState>;
}

function ExpertEarnings() {
  const q = useQuery({ queryKey: ['expert-analytics'], queryFn: () => get<{ bookingsByStatus: { status: string; n: number }[]; completionRate: number | null; cancellations: number; rating: { avg: number; count: number } | null; earnings: { completedPaise: number; paidOutPaise: number; pendingPaise: number }; payouts: { id: string; amountPaise: number; status: string; createdAt: string; providerRef: string | null }[]; commissionPercent: number; payoutNote?: string }>('expert/analytics') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <StatTile label="Earned (completed)" value={money(d.earnings.completedPaise)} sub={`after ${d.commissionPercent}% platform commission`} />
          <StatTile label="Paid out" value={money(d.earnings.paidOutPaise)} />
          <StatTile label="Pending payout" value={money(d.earnings.pendingPaise)} />
          <StatTile label="Rating" value={d.rating ? d.rating.avg.toFixed(2) : '—'} sub={d.rating ? `${d.rating.count} reviews` : 'No reviews'} />
        </div>
        {d.payoutNote && <Notice tone="dev">{d.payoutNote}</Notice>}
        <Card><h2 className="font-display text-2xl">Bookings by status</h2><ul className="mt-2 flex flex-wrap gap-3 text-sm">{d.bookingsByStatus.map((b) => <li key={b.status}><Badge tone={STATUS_TONE[b.status]}>{cap(b.status)} · {b.n}</Badge></li>)}</ul>{d.completionRate !== null && <p className="mt-3 text-sm text-fg-2">Completion rate: {Math.round(d.completionRate * 100)}% · cancellations: {d.cancellations}</p>}</Card>
        <Card><h2 className="font-display text-2xl">Payouts</h2><DataTable rows={d.payouts} keyOf={(p) => p.id} empty="No payouts yet" columns={[{ key: 'd', header: 'Created', cell: (p) => new Date(p.createdAt).toLocaleDateString() }, { key: 'a', header: 'Amount', cell: (p) => money(p.amountPaise) }, { key: 's', header: 'Status', cell: (p) => cap(p.status) }, { key: 'r', header: 'Reference', cell: (p) => p.providerRef ?? '—' }]} /></Card>
      </div>
    )}</QueryState>
  );
}
