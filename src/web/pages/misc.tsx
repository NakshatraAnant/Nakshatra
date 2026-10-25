import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, post } from '../lib/api';
import { cap, dateLong, dateTime, relative } from '../lib/format';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState, SampleBadge } from '../components/ui/feedback';
import { Segmented, useToast } from '../components/ui/overlays';

/* ---------------- Notifications ---------------- */

interface Notification { id: string; category: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const q = useQuery({ queryKey: ['notifications', filter], queryFn: () => get<{ notifications: Notification[]; unreadCount: number }>(`notifications${filter === 'unread' ? '?unread=true' : ''}`) });
  const qc = useQueryClient();
  const nav = useNavigate();
  const mark = useMutation({ mutationFn: (body: { ids?: string[]; all?: boolean }) => post('notifications/read', body), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const open = (n: Notification) => {
    if (!n.readAt) mark.mutate({ ids: [n.id] });
    if (n.link) nav(n.link);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" subtitle="Preferences and quiet hours live in Settings → Notifications." actions={<Button variant="secondary" size="sm" disabled={!q.data?.unreadCount} onClick={() => mark.mutate({ all: true })}>Mark all read</Button>} />
      <Segmented label="Filter" value={filter} onChange={(v) => setFilter(v as 'all' | 'unread')} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: `Unread${q.data?.unreadCount ? ` (${q.data.unreadCount})` : ''}` }]} />
      <div className="mt-4">
        <QueryState q={q}>{(d) => d.notifications.length ? (
          <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line">
            {d.notifications.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2', !n.readAt && 'bg-accent/5')}>
                  <span aria-hidden className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-fg">{n.title}</span>
                    {n.body && <span className="block text-sm text-fg-2">{n.body}</span>}
                    <span className="block text-xs text-fg-3">{cap(n.category)} · {relative(n.createdAt)}{!n.readAt && <span className="sr-only"> · unread</span>}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon="bell" title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'} body="Bond invitations, replies, bookings and daily reminders will appear here." />}</QueryState>
      </div>
    </div>
  );
}

/* ---------------- Search ---------------- */

const SCOPES = ['all', 'people', 'experts', 'courses', 'products', 'events', 'vendors', 'groups'] as const;
type SearchResults = Partial<{
  people: { userId: string; handle: string; displayName: string }[];
  experts: { userId: string; displayName: string; headline: string; isSample: boolean }[];
  courses: { id: string; slug: string; title: string; level: string }[];
  products: { id: string; slug: string; title: string; category: string; isSample: boolean }[];
  events: { id: string; title: string; startsAt: string }[];
  vendors: { id: string; name: string; category: string; city: string; isSample: boolean }[];
  groups: { id: string; slug: string; name: string; visibility: string }[];
}>;

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const term = params.get('q') ?? '';
  const scope = (params.get('scope') ?? 'all') as (typeof SCOPES)[number];
  const [draft, setDraft] = useState(term);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['search', term, scope], queryFn: () => get<{ query: string; results: SearchResults }>(`search?${new URLSearchParams({ q: term, scope })}`), enabled: term.trim().length > 0 });
  const hist = useQuery({ queryKey: ['search-history'], queryFn: () => get<{ history: { id: string; query: string; scope: string }[]; saved: { id: string; name: string; scope: string; query: Record<string, string> }[] }>('search/history') });
  const clear = useMutation({ mutationFn: () => del('search/history'), onSuccess: () => qc.invalidateQueries({ queryKey: ['search-history'] }) });
  const save = useMutation({ mutationFn: () => post('search/saved', { name: term.slice(0, 60), scope, query: { q: term } }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['search-history'] }); toast('Search saved', 'success'); } });
  const unsave = useMutation({ mutationFn: (id: string) => del(`search/saved/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['search-history'] }) });
  const go = (q2: string, s2: string = scope) => { setParams(q2 ? { q: q2, scope: s2 } : {}); setDraft(q2); };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Search" subtitle="Text match across public profiles, verified experts, published courses, products, events, vendors and groups. Results are ordered by how closely the name matches." />
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(draft.trim()); }} className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="Search" placeholder="Search Nakshatra" value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1" />
        <Select aria-label="Scope" value={scope} onChange={(e) => go(term, e.target.value)} className="sm:w-40">{SCOPES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</Select>
        <Button type="submit" disabled={!draft.trim()}>Search</Button>
      </form>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_240px]">
        <div>
          {!term ? <EmptyState icon="search" title="Search for people, experts, courses and more" /> : (
            <QueryState q={q}>{(d) => {
              const r = d.results;
              const total = Object.values(r).reduce((a, x) => a + (x?.length ?? 0), 0);
              if (!total) return <EmptyState icon="search" title={`No results for “${d.query}”`} body="Try a shorter term or a different scope. Only public profiles appear in people results." />;
              return (
                <div className="space-y-6">
                  <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={() => save.mutate()}>Save this search</Button></div>
                  <ResultGroup title="People" items={r.people}>{(p) => <Link to={`/u/${p.handle}`} className="text-fg hover:underline">{p.displayName} <span className="text-fg-3">@{p.handle}</span></Link>}</ResultGroup>
                  <ResultGroup title="Experts" items={r.experts}>{(x) => <Link to={`/experts/${x.userId}`} className="text-fg hover:underline">{x.displayName} {x.isSample && <SampleBadge />}<span className="block text-xs text-fg-3">{x.headline}</span></Link>}</ResultGroup>
                  <ResultGroup title="Courses" items={r.courses}>{(c) => <Link to={`/learn/${c.slug}`} className="text-fg hover:underline">{c.title} <span className="text-xs text-fg-3">· {c.level}</span></Link>}</ResultGroup>
                  <ResultGroup title="Products" items={r.products}>{(p) => <Link to={`/shop/p/${p.slug}`} className="text-fg hover:underline">{p.title} {p.isSample && <SampleBadge />}<span className="block text-xs text-fg-3">{p.category.replace(/_/g, ' ')}</span></Link>}</ResultGroup>
                  <ResultGroup title="Events" items={r.events}>{(e) => <Link to="/social/events" className="text-fg hover:underline">{e.title} <span className="text-xs text-fg-3">· {dateTime(e.startsAt)}</span></Link>}</ResultGroup>
                  <ResultGroup title="Vendors" items={r.vendors}>{(v) => <Link to={`/vendors/${v.id}`} className="text-fg hover:underline">{v.name} {v.isSample && <SampleBadge />}<span className="block text-xs text-fg-3">{v.category} · {v.city}</span></Link>}</ResultGroup>
                  <ResultGroup title="Groups" items={r.groups}>{(g) => <Link to={`/social/groups/${g.slug}`} className="text-fg hover:underline">{g.name} <span className="text-xs text-fg-3">· {g.visibility}</span></Link>}</ResultGroup>
                </div>
              );
            }}</QueryState>
          )}
        </div>
        <aside className="space-y-4">
          <QueryState q={hist}>{(h) => (
            <>
              <Card className="p-4"><h2 className="text-sm font-semibold">Saved searches</h2><ul className="mt-2 space-y-1 text-sm">{h.saved.map((s) => <li key={s.id} className="flex items-center justify-between gap-2"><button type="button" className="truncate text-accent hover:underline" onClick={() => go(s.query.q ?? '', s.scope)}>{s.name}</button><button type="button" aria-label={`Remove saved search ${s.name}`} className="text-xs text-fg-3 hover:text-fg" onClick={() => unsave.mutate(s.id)}>Remove</button></li>)}{!h.saved.length && <li className="text-xs text-fg-3">None yet.</li>}</ul></Card>
              <Card className="p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recent</h2>{h.history.length > 0 && <button type="button" className="text-xs text-fg-3 hover:text-fg" onClick={() => clear.mutate()}>Clear</button>}</div><ul className="mt-2 space-y-1 text-sm">{h.history.map((x) => <li key={x.id}><button type="button" className="text-fg-2 hover:text-fg" onClick={() => go(x.query, x.scope)}>{x.query}</button></li>)}{!h.history.length && <li className="text-xs text-fg-3">History is empty. You can turn it off in Settings → Privacy.</li>}</ul></Card>
            </>
          )}</QueryState>
        </aside>
      </div>
    </div>
  );
}

function ResultGroup<T>({ title, items, children }: { title: string; items?: T[]; children: (x: T) => ReactNode }) {
  if (!items?.length) return null;
  return <section><h2 className="mb-2 text-xs uppercase tracking-wider text-fg-3">{title}</h2><ul className="space-y-2">{items.map((x, i) => <li key={i} className="card px-4 py-3 text-sm">{children(x)}</li>)}</ul></section>;
}

/* ---------------- Support ---------------- */

interface Ticket { id: string; subject: string; category: string; status: string; updatedAt: string; createdAt: string }
const CATEGORIES = ['account', 'billing', 'booking', 'order', 'safety', 'privacy', 'technical', 'other'];

export function SupportPage() {
  const q = useQuery({ queryKey: ['tickets'], queryFn: () => get<{ tickets: Ticket[] }>('support/tickets') });
  const [form, setForm] = useState({ subject: '', category: 'account', body: '' });
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const create = useMutation({ mutationFn: () => post<{ ticket: Ticket }>('support/tickets', form), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['tickets'] }); toast('Ticket opened', 'success'); nav(`/support/${r.ticket.id}`); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not open the ticket', 'error') });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Help & support" subtitle="Tickets are answered by the Nakshatra team. For safety emergencies contact local emergency services first." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="new-ticket">
          <h2 id="new-ticket" className="font-display text-2xl">Open a ticket</h2>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Subject" required>{(id) => <Input id={id} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} minLength={3} maxLength={140} required />}</Field>
            <Field label="Category">{(id) => <Select id={id} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select>}</Field>
            <Field label="What happened?" hint="At least 10 characters. Do not include passwords or card numbers." required>{(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} minLength={10} required />}</Field>
            <Button type="submit" loading={create.isPending} disabled={form.subject.trim().length < 3 || form.body.trim().length < 10}>Submit</Button>
          </form>
        </Card>
        <section aria-labelledby="my-tickets">
          <h2 id="my-tickets" className="mb-3 font-display text-2xl">Your tickets</h2>
          <QueryState q={q}>{(d) => d.tickets.length ? <ul className="space-y-2">{d.tickets.map((t) => <li key={t.id}><Link to={`/support/${t.id}`} className="card block px-4 py-3 hover:border-line-strong"><span className="flex items-center justify-between gap-2"><span className="text-fg">{t.subject}</span><TicketStatus status={t.status} /></span><span className="text-xs text-fg-3">{cap(t.category)} · updated {relative(t.updatedAt)}</span></Link></li>)}</ul> : <EmptyState icon="help" title="No tickets yet" />}</QueryState>
        </section>
      </div>
    </div>
  );
}

function TicketStatus({ status }: { status: string }) {
  const tone = status === 'open' ? 'warning' : status === 'pending_user' ? 'violet' : status === 'resolved' ? 'success' : 'neutral';
  return <Badge tone={tone}>{status === 'pending_user' ? 'Awaiting your reply' : cap(status)}</Badge>;
}

export function TicketPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => get<{ ticket: Ticket; messages: { id: string; body: string; isStaff: boolean; createdAt: string }[] }>(`support/tickets/${id}`) });
  const [body, setBody] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const send = useMutation({ mutationFn: () => post(`support/tickets/${id}/messages`, { body }), onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['ticket', id] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not send', 'error') });
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/support" className="text-sm text-fg-3 hover:text-fg">← All tickets</Link>
      <QueryState q={q}>{(d) => (
        <div className="mt-3">
          <PageHeader title={d.ticket.subject} subtitle={<>{cap(d.ticket.category)} · opened {dateTime(d.ticket.createdAt)} · <TicketStatus status={d.ticket.status} /></>} />
          <ol className="space-y-3">{d.messages.map((m) => <li key={m.id} className={cx('rounded-[var(--radius-md)] border p-4', m.isStaff ? 'border-celestial/30 bg-celestial/5' : 'border-line bg-surface')}><p className="whitespace-pre-wrap text-sm text-fg">{m.body}</p><p className="mt-2 text-xs text-fg-3">{m.isStaff ? 'Nakshatra support' : 'You'} · {relative(m.createdAt)}</p></li>)}</ol>
          {d.ticket.status === 'closed' ? <Notice tone="info" className="mt-4">This ticket is closed. <Link to="/support" className="underline">Open a new ticket</Link> if you need more help.</Notice> : (
            <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
              <Textarea aria-label="Reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
              <Button type="submit" disabled={!body.trim()} loading={send.isPending}>Send reply</Button>
            </form>
          )}
        </div>
      )}</QueryState>
    </div>
  );
}

/* ---------------- Legal & methodology ---------------- */

function Prose({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-fg">{title}</h1>
      <p className="mt-2 text-sm text-fg-3">Last updated {updated}</p>
      <Notice tone="warning" className="mt-6">This text describes how this build of Nakshatra actually behaves. It has not been reviewed by a lawyer and must be reviewed before any public launch.</Notice>
      <div className="prose-nk mt-8 space-y-5 text-fg-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-fg [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </article>
  );
}

export function Terms() {
  return (
    <Prose title="Terms of use" updated="24 October 2026">
      <h2>What Nakshatra is</h2>
      <p>Nakshatra computes astrological charts with documented astronomical methods and shows interpretations written by people. Astrology is a cultural and reflective practice; nothing here is medical, legal, financial or psychological advice, and nothing predicts events with certainty.</p>
      <h2>Your account</h2>
      <ul><li>You must be 18 or older to use dating, matchmaking and consultations.</li><li>Keep your sign-in details private. You can enable two-factor authentication in Settings.</li><li>You are responsible for content you post. Report anything that breaks the community guidelines.</li></ul>
      <h2>Community guidelines</h2>
      <ul><li>No harassment, hate, threats, sexual content involving minors, or non-consensual sharing of images.</li><li>No fear-based selling: experts may not claim that a remedy or purchase is required to avoid harm.</li><li>No impersonation, fake reviews or misleading verification claims.</li></ul>
      <p>Moderators may hide content, warn, remove you from dating, or suspend accounts. Every action states a reason, and you can appeal from Settings → Appeals; a different moderator reviews it.</p>
      <h2>Payments, refunds and cancellations</h2>
      <p>Prices are shown in Indian rupees before payment. Card details are handled only by the payment provider and are never stored by Nakshatra. Consultation cancellations follow the policy shown on each booking; physical goods can be returned under the policy shown on the product page; digital reports are refundable before they are generated.</p>
      <h2>Experts, creators and vendors</h2>
      <p>Independent experts, course creators and vendors set their own offerings. Verification badges mean the Nakshatra team reviewed submitted evidence; they are not an endorsement of outcomes. Listings marked “Sample” are demonstration data and cannot be booked or bought as real services.</p>
      <h2>Ending your account</h2>
      <p>You can export your data or delete your account at any time from Settings → Data. See the <Link to="/legal/privacy" className="text-accent underline">privacy policy</Link> for what is deleted and what must be retained.</p>
    </Prose>
  );
}

export function PrivacyPolicy() {
  return (
    <Prose title="Privacy policy" updated="24 October 2026">
      <h2>Birth data is sensitive</h2>
      <p>Your exact birth date, time and place are private by default. Other people only see what you choose to share, field by field, in Settings → Privacy. Bonds you create can see a level of detail you grant per bond, and you can revoke it.</p>
      <h2>What we store</h2>
      <ul><li>Account: email, a salted scrypt hash of your password, sessions (stored as hashes), optional two-factor secret (encrypted).</li><li>Profile and birth details you enter, and the charts calculated from them, including the calculation version used.</li><li>Content you create: posts, messages, journal entries, bookings, orders, course progress.</li><li>Payment records (amount, status, provider reference). Never card numbers.</li><li>Product analytics events that exclude birth data, message content and contact details. A server-side filter enforces this.</li></ul>
      <h2>No automated profiling with AI</h2>
      <p>Nakshatra does not use artificial intelligence or machine learning. Rankings of feed posts, experts, dating suggestions and search results use simple, documented rules shown on each page.</p>
      <h2>Your choices</h2>
      <ul><li>Export everything from Settings → Data (JSON).</li><li>Delete your account: profile, birth data, charts, journals, messages you sent, dating and matchmaking profiles are removed. Order and payment records are kept in anonymised form where tax and accounting law require it.</li><li>Turn off search history, hide from search, and control notifications and quiet hours.</li></ul>
      <h2>Sharing</h2>
      <p>We do not sell personal data. Data is shared with service providers only when you use a feature that needs them (for example a payment provider) and when they are configured.</p>
    </Prose>
  );
}

export function Methodology() {
  const rows: [string, string][] = [
    ['Planet positions', 'astronomy-engine (VSOP87/ELP-derived), apparent geocentric positions on the true ecliptic of date. Tested against Meeus worked examples.'],
    ['Lunar nodes', 'Mean and true node from Meeus, chapter 47. Default: mean node.'],
    ['Ayanamsa', 'Lahiri (Chitrapaksha), from the standard 1956 reference epoch plus IAU 2006 precession; nutation added for the true value.'],
    ['Houses', 'Whole sign (Vedic default), equal, Porphyry and Placidus. Placidus is undefined near the poles; Porphyry is used there and the chart says so.'],
    ['Time zones', 'Historical IANA database. Daylight-saving gaps and repeated hours are detected and you are asked to choose.'],
    ['Birth-time reliability', 'The chart is recomputed at both ends of your stated uncertainty. If the ascendant, Moon sign or nakshatra changes, the affected insights are flagged.'],
    ['Dashas', 'Vimshottari, 365.25-day years, from the Moon’s nakshatra fraction at birth.'],
    ['Panchang', 'Tithi, nakshatra, yoga and karana at local sunrise (udaya convention); amanta months; Rahu Kaal and related periods from local sunrise and sunset.'],
    ['Festivals', 'Computed each year from tithi and solar rules with the observance-time convention for each festival (sunrise, pradosh, nishita or madhyahna). Regional traditions can differ by a day.'],
    ['Compatibility', 'Ashtakoota Guna Milan (36 points) using the classical tables, and Western synastry aspects. Nakshatra shows separate dimensions rather than one “compatibility score”, and never says a relationship will fail.'],
    ['Interpretations', 'Written and versioned by people, with sources and caveats. Each insight shows which chart factors triggered it.'],
    ['Not implemented', 'Shadbala, KP and Raman ayanamsas, and Jaimini techniques are not available in this version.'],
  ];
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-fg">How Nakshatra calculates</h1>
      <p className="mt-3 text-fg-2">Every number in Nakshatra comes from a deterministic calculation you can reproduce. Nothing is generated by AI. This page lists the conventions used.</p>
      <dl className="mt-8 divide-y divide-line rounded-[var(--radius-lg)] border border-line">
        {rows.map(([k, v]) => <div key={k} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-semibold text-fg">{k}</dt><dd className="text-sm text-fg-2">{v}</dd></div>)}
      </dl>
      <p className="mt-6 text-sm text-fg-3">Last reviewed {dateLong('2026-10-24')}.</p>
    </article>
  );
}

/* ---------------- Development mailbox ---------------- */

export function DevMailbox() {
  const [to, setTo] = useState('');
  const q = useQuery({ queryKey: ['dev-mailbox', to], queryFn: () => get<{ notice: string; emails: { id: string; toEmail: string; subject: string; textBody: string; createdAt: string }[] }>(`dev/mailbox${to ? `?to=${encodeURIComponent(to)}` : ''}`), refetchInterval: 5000, retry: false });
  const linkify = (text: string) => text.split(/(https?:\/\/\S+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} className="break-all text-accent underline">{part}</a> : part);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader kicker="Development only" title="Local mailbox" subtitle="Emails the app would send. This page does not exist in production builds." />
      <Input aria-label="Filter by recipient" placeholder="Filter by recipient email" value={to} onChange={(e) => setTo(e.target.value.trim())} className="mb-4 max-w-sm" />
      <QueryState q={q}>{(d) => (
        <>
          <Notice tone="dev" className="mb-4">{d.notice}</Notice>
          {d.emails.length ? <ul className="space-y-3">{d.emails.map((m) => <li key={m.id} className="card p-4"><p className="text-sm text-fg">{m.subject}</p><p className="text-xs text-fg-3">To {m.toEmail} · {relative(m.createdAt)}</p><pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-fg-2">{linkify(m.textBody)}</pre></li>)}</ul> : <EmptyState icon="mail" title="Mailbox is empty" />}
        </>
      )}</QueryState>
    </div>
  );
}
