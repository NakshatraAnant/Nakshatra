import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, get, patch, post } from '../lib/api';
import { cap, civilDate, dateTime, money, todayIso } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Avatar, Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState, IntegrationNotice, SampleBadge } from '../components/ui/feedback';
import { Dialog, Tabs, useToast } from '../components/ui/overlays';
import { DataTable, StatTile } from '../components/ui/data';
import { PlaceSearch, type Place } from '../components/PlaceSearch';

const PERMS: [string, string][] = [['view_budget', 'View budget'], ['edit_budget', 'Edit budget'], ['manage_guests', 'Manage guests'], ['manage_tasks', 'Manage tasks & events'], ['manage_vendors', 'Manage vendors & payments']];
const VCATS = ['pandit', 'venue', 'photographer', 'caterer', 'decorator', 'planner', 'makeup', 'mehendi', 'music', 'invitations', 'other'];

export function WeddingsHome() {
  const q = useQuery({ queryKey: ['weddings'], queryFn: () => get<{ projects: { id: string; title: string; weddingDate: string | null; city: string; role: string; status: string }[] }>('weddings') });
  const { dateLocale } = useI18n();
  return (
    <div>
      <PageHeader kicker="Weddings" title="Plan it together" subtitle="Muhurat, guests, budget, vendors and family — with permissions you control." actions={<><ButtonLink to="/vendors" variant="secondary">Vendors</ButtonLink><ButtonLink to="/weddings/new" icon="plus">New wedding project</ButtonLink></>} />
      <QueryState q={q} empty={(d) => (!d.projects.length ? <EmptyState icon="wedding" title="No wedding projects yet" body="Start a project to find a muhurat, invite your partner and family, and coordinate vendors." action={<ButtonLink to="/weddings/new">Start planning</ButtonLink>} /> : null)}>{(d) => (
        <ul className="grid gap-4 md:grid-cols-2">{d.projects.map((p) => <li key={p.id}><Link to={`/weddings/${p.id}`} className="card block p-5 hover:border-line-strong"><h2 className="font-display text-3xl">{p.title}</h2><p className="mt-1 text-sm text-fg-2">{p.weddingDate ? civilDate(p.weddingDate, dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date to be decided'}{p.city ? ` · ${p.city}` : ''}</p><p className="mt-2 text-xs text-fg-3">You are the {p.role} · {p.status}</p></Link></li>)}</ul>
      )}</QueryState>
    </div>
  );
}

export function NewWedding() {
  const nav = useNavigate();
  const [v, setV] = useState({ title: 'Our wedding', weddingDate: '', budget: 0, bondId: '' });
  const [place, setPlace] = useState<Place | null>(null);
  const bonds = useQuery({ queryKey: ['bonds'], queryFn: () => get<{ bonds: { id: string; kind: string; status: string; partner: { displayName: string } }[] }>('bonds') });
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => post<{ project: { id: string } }>('weddings', { title: v.title, weddingDate: v.weddingDate || undefined, placeId: place?.id, budgetPaise: Math.round(v.budget * 100), coupleBondId: v.bondId || undefined }), onSuccess: (r) => nav(`/weddings/${r.project.id}`), onError: (e) => setErr((e as Error).message) });
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader kicker="Weddings" title="New wedding project" />
      <Card className="space-y-4">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Project name">{(id) => <Input id={id} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />}</Field>
        <Field label="Wedding date (optional)" hint={<>Not sure yet? Use the <Link to="/calendar" className="text-accent underline">muhurat finder</Link>.</>}>{(id, d) => <Input id={id} aria-describedby={d} type="date" min={todayIso()} value={v.weddingDate} onChange={(e) => setV({ ...v, weddingDate: e.target.value })} />}</Field>
        <Field label="City (optional)">{(id) => <PlaceSearch id={id} value={place} onChange={setPlace} />}</Field>
        <Field label="Total budget (₹, optional)">{(id) => <Input id={id} type="number" min={0} value={v.budget} onChange={(e) => setV({ ...v, budget: Number(e.target.value) })} />}</Field>
        <Field label="Link your Bond with your partner (optional)" hint="Shows your couple Cosmic Profile using what you both already share.">{(id, d) => <Select id={id} aria-describedby={d} value={v.bondId} onChange={(e) => setV({ ...v, bondId: e.target.value })}><option value="">None</option>{bonds.data?.bonds.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.partner.displayName} ({b.kind})</option>)}</Select>}</Field>
        <Button loading={m.isPending} onClick={() => m.mutate()}>Create project</Button>
      </Card>
    </div>
  );
}

export function JoinWedding() {
  const { token } = useParams();
  const nav = useNavigate();
  const m = useMutation({ mutationFn: () => post<{ projectId: string }>('weddings/join', { token }), onSuccess: (r) => nav(`/weddings/${r.projectId}`) });
  return <Card className="mx-auto max-w-lg"><h1 className="font-display text-3xl">Join a wedding project</h1><p className="mt-2 text-fg-2">You’ve been invited to help plan. You’ll see only the parts you have permission for.</p>{m.error && <Notice tone="danger" className="mt-3">{(m.error as Error).message}</Notice>}<Button className="mt-4" loading={m.isPending} onClick={() => m.mutate()}>Join</Button></Card>;
}

interface WeddingResp {
  project: { id: string; title: string; weddingDate: string | null; city: string; budgetPaise: number; status: string; timezone: string; ownerId: string };
  role: string; permissions: string[];
  couple: { bondId: string; partners: { name?: string; identity: { western: { sun: string; moon: string }; vedic: { rashi: string; nakshatra: string } } | null }[] } | null;
  members: { id?: string; userId: string | null; role: string; permissions?: string[]; status: string; inviteEmail?: string | null; displayName?: string; avatarUrl?: string | null }[];
  tasks: { id: string; title: string; dueDate: string | null; status: string; assigneeId: string | null }[];
  events: { id: string; title: string; startsAt: string; location: string; muhuratNote: string | null }[];
  budget: { id: string; category: string; label: string; estimatedPaise: number; actualPaise: number; paidPaise: number }[] | null;
  budgetSummary: { total: number; spent: number; remaining: number } | null;
  guests: { id: string; name: string; email: string | null; side: string; partySize: number; rsvp: string; invitedAt: string | null; dietary: string | null }[] | null;
  guestSummary: { invited: number; attending: number; declined: number; pending: number } | null;
  vendors: { inquiry: { id: string; status: string; message: string; eventDate: string | null; conversationId: string | null }; vendor: { id: string; name: string; category: string; isSample: boolean }; quotes: { id: string; amountPaise: number; details: string; status: string; validUntil: string | null; milestones: { label: string; percent: number }[] }[]; booking: { id: string; status: string; totalPaise: number } | null }[] | null;
  milestones: { id: string; vendorBookingId: string; label: string; amountPaise: number; status: string }[];
  rituals: { key: string; title: string; description: string }[];
}

export function WeddingProject() {
  const { id } = useParams();
  const { dateLocale } = useI18n();
  const [tab, setTab] = useState('overview');
  const q = useQuery({ queryKey: ['wedding', id], queryFn: () => get<WeddingResp>(`weddings/${id}`) });
  return (
    <QueryState q={q}>{(d) => {
      const can = (p: string) => d.permissions.includes(p);
      const days = d.project.weddingDate ? Math.ceil((Date.parse(d.project.weddingDate) - Date.now()) / 86400000) : null;
      const tabs = [{ value: 'overview', label: 'Overview' }, { value: 'tasks', label: 'Tasks & timeline' }, ...(d.budget ? [{ value: 'budget', label: 'Budget' }] : []), ...(d.guests ? [{ value: 'guests', label: 'Guests & RSVP' }] : []), ...(d.vendors ? [{ value: 'vendors', label: 'Vendors' }] : []), { value: 'people', label: 'People' }, { value: 'rituals', label: 'Rituals' }];
      return (
        <div>
          <PageHeader kicker="Wedding project" title={d.project.title} subtitle={`${d.project.weddingDate ? civilDate(d.project.weddingDate, dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date to be decided'}${d.project.city ? ` · ${d.project.city}` : ''}`} actions={days !== null && days >= 0 && <Badge tone="accent">{days} days to go</Badge>} />
          <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />
          {tab === 'overview' && <Overview d={d} />}
          {tab === 'tasks' && <TasksTab d={d} canEdit={can('manage_tasks')} />}
          {tab === 'budget' && d.budget && <BudgetTab d={d} canEdit={can('edit_budget')} />}
          {tab === 'guests' && d.guests && <GuestsTab d={d} />}
          {tab === 'vendors' && d.vendors && <VendorsTab d={d} />}
          {tab === 'people' && <PeopleTab d={d} />}
          {tab === 'rituals' && <ul className="grid gap-3 md:grid-cols-2">{d.rituals.map((r) => <li key={r.key} className="card p-4"><h3 className="font-display text-2xl">{r.title}</h3><p className="mt-1 text-sm text-fg-2">{r.description}</p></li>)}<li className="text-xs text-fg-3 md:col-span-2">Ceremonies vary widely between families and communities; this library is a starting point, not a prescription.</li></ul>}
        </div>
      );
    }}</QueryState>
  );
}

function Overview({ d }: { d: WeddingResp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(d.project.weddingDate ?? '');
  const upd = useMutation({ mutationFn: (body: Record<string, unknown>) => patch(`weddings/${d.project.id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['wedding', d.project.id] }); toast('Saved — anniversary reminders scheduled', 'success'); } });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {d.couple ? (
          <Card><h2 className="font-display text-2xl">Couple Cosmic Profile</h2><div className="mt-3 grid grid-cols-2 gap-4">{d.couple.partners.map((p, i) => <div key={i}><p className="text-fg">{p.name}</p>{p.identity ? <p className="text-sm text-fg-2">☉ {p.identity.western.sun} · ☽ {p.identity.western.moon}<br />{p.identity.vedic.rashi} Rashi · {p.identity.vedic.nakshatra}</p> : <p className="text-xs text-fg-3">Not shared</p>}</div>)}</div><Link to={`/bonds/${d.couple.bondId}`} className="mt-3 inline-block text-sm text-accent">Compatibility in your Bond →</Link></Card>
        ) : <Notice tone="info">Link your partner Bond when creating a project to see a couple Cosmic Profile.</Notice>}
        <Card>
          <h2 className="font-display text-2xl">Muhurat</h2>
          <p className="mt-1 text-sm text-fg-2">Find dates that pass a transparent marriage rule set for your city, then confirm with your family’s pandit.</p>
          <ButtonLink to="/calendar?tab=muhurat" variant="secondary" size="sm" className="mt-3">Open muhurat finder</ButtonLink>
          {d.role === 'owner' && <div className="mt-4 flex gap-2"><Input aria-label="Wedding date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><Button size="sm" onClick={() => upd.mutate({ weddingDate: date || null })}>Set date</Button></div>}
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-4 self-start">
        {d.guestSummary && <StatTile label="Attending" value={d.guestSummary.attending} sub={`${d.guestSummary.pending} awaiting reply`} />}
        {d.budgetSummary && <StatTile label="Budget left" value={money(d.budgetSummary.remaining)} sub={`of ${money(d.budgetSummary.total)}`} />}
        <StatTile label="Tasks done" value={`${d.tasks.filter((t) => t.status === 'done').length}/${d.tasks.length}`} />
        {d.vendors && <StatTile label="Vendors booked" value={d.vendors.filter((v) => v.booking?.status === 'confirmed').length} />}
        {d.role === 'owner' && d.project.status !== 'completed' && d.project.weddingDate && Date.parse(d.project.weddingDate) < Date.now() && <Button className="col-span-2" onClick={() => upd.mutate({ status: 'completed' })}>Mark the wedding as complete</Button>}
      </div>
    </div>
  );
}

function TasksTab({ d, canEdit }: { d: WeddingResp; canEdit: boolean }) {
  const qc = useQueryClient();
  const { dateLocale } = useI18n();
  const refresh = () => qc.invalidateQueries({ queryKey: ['wedding', d.project.id] });
  const [t, setT] = useState({ title: '', dueDate: '', assigneeId: '' });
  const [ev, setEv] = useState({ title: '', startsAt: '', location: '', muhuratNote: '' });
  const add = useMutation({ mutationFn: () => post(`weddings/${d.project.id}/tasks`, { title: t.title, dueDate: t.dueDate || undefined, assigneeId: t.assigneeId || undefined }), onSuccess: () => { setT({ title: '', dueDate: '', assigneeId: '' }); refresh(); } });
  const upd = useMutation({ mutationFn: ({ tid, status }: { tid: string; status: string }) => patch(`weddings/${d.project.id}/tasks/${tid}`, { status }), onSuccess: refresh });
  const addEv = useMutation({ mutationFn: () => post(`weddings/${d.project.id}/events`, { ...ev, startsAt: new Date(ev.startsAt).toISOString(), muhuratNote: ev.muhuratNote || undefined }), onSuccess: () => { setEv({ title: '', startsAt: '', location: '', muhuratNote: '' }); refresh(); } });
  const members = d.members.filter((m) => m.userId && m.status === 'active');
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-display text-2xl">Tasks</h2>
        <ul className="mt-3 space-y-2">{d.tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={task.status === 'done'} onChange={(e) => upd.mutate({ tid: task.id, status: e.target.checked ? 'done' : 'todo' })} aria-label={`Mark ${task.title} done`} className="h-4 w-4 accent-[var(--accent)]" />
            <span className={cx('flex-1', task.status === 'done' ? 'text-fg-3 line-through' : 'text-fg')}>{task.title}</span>
            {task.dueDate && <span className="text-xs text-fg-3">{civilDate(task.dueDate, dateLocale, { day: 'numeric', month: 'short' })}</span>}
            {task.assigneeId && <span className="text-xs text-fg-3">{members.find((m) => m.userId === task.assigneeId)?.displayName}</span>}
          </li>
        ))}</ul>
        {canEdit && <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input aria-label="New task" placeholder="New task" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /><Input aria-label="Due" type="date" value={t.dueDate} onChange={(e) => setT({ ...t, dueDate: e.target.value })} /><Select aria-label="Assignee" value={t.assigneeId} onChange={(e) => setT({ ...t, assigneeId: e.target.value })}><option value="">Unassigned</option>{members.map((m) => <option key={m.userId!} value={m.userId!}>{m.displayName}</option>)}</Select><Button size="sm" disabled={!t.title} onClick={() => add.mutate()} className="sm:col-span-3">Add task</Button></div>}
      </Card>
      <Card>
        <h2 className="font-display text-2xl">Event timeline</h2>
        <ol className="mt-3 space-y-3">{d.events.map((e) => <li key={e.id} className="border-l-2 border-accent pl-3"><p className="text-fg">{e.title}</p><p className="text-xs text-fg-3">{dateTime(e.startsAt)}{e.location ? ` · ${e.location}` : ''}</p>{e.muhuratNote && <p className="text-xs text-accent">{e.muhuratNote}</p>}</li>)}{!d.events.length && <li className="text-sm text-fg-3">No events yet.</li>}</ol>
        {canEdit && <div className="mt-4 grid gap-2 sm:grid-cols-2"><Input aria-label="Event" placeholder="Mehendi" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} /><Input aria-label="When" type="datetime-local" value={ev.startsAt} onChange={(e) => setEv({ ...ev, startsAt: e.target.value })} /><Input aria-label="Location" placeholder="Location" value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} /><Input aria-label="Muhurat note" placeholder="Muhurat note (optional)" value={ev.muhuratNote} onChange={(e) => setEv({ ...ev, muhuratNote: e.target.value })} /><Button size="sm" disabled={!ev.title || !ev.startsAt} onClick={() => addEv.mutate()} className="sm:col-span-2">Add event</Button></div>}
      </Card>
    </div>
  );
}

function BudgetTab({ d, canEdit }: { d: WeddingResp; canEdit: boolean }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ category: 'venue', label: '', estimated: 0, actual: 0, paid: 0 });
  const add = useMutation({ mutationFn: () => post(`weddings/${d.project.id}/budget`, { category: v.category, label: v.label, estimatedPaise: Math.round(v.estimated * 100), actualPaise: Math.round(v.actual * 100), paidPaise: Math.round(v.paid * 100) }), onSuccess: () => { setV({ ...v, label: '', estimated: 0, actual: 0, paid: 0 }); qc.invalidateQueries({ queryKey: ['wedding', d.project.id] }); } });
  const remove = useMutation({ mutationFn: (itemId: string) => api(`weddings/${d.project.id}/budget/${itemId}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['wedding', d.project.id] }) });
  const est = d.budget!.reduce((a, b) => a + b.estimatedPaise, 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4"><StatTile label="Total budget" value={money(d.budgetSummary!.total)} /><StatTile label="Estimated" value={money(est)} /><StatTile label="Committed" value={money(d.budgetSummary!.spent)} /><StatTile label="Remaining" value={money(d.budgetSummary!.remaining)} /></div>
      <DataTable rows={d.budget!} keyOf={(b) => b.id} empty="No budget lines yet" columns={[{ key: 'c', header: 'Category', cell: (b) => cap(b.category) }, { key: 'l', header: 'Item', cell: (b) => b.label }, { key: 'e', header: 'Estimated', cell: (b) => money(b.estimatedPaise) }, { key: 'a', header: 'Actual', cell: (b) => money(b.actualPaise) }, { key: 'p', header: 'Paid', cell: (b) => money(b.paidPaise) }, ...(canEdit ? [{ key: 'x', header: '', cell: (b: { id: string }) => <button type="button" className="text-xs text-danger" onClick={() => remove.mutate(b.id)}>Remove</button> }] : [])]} />
      {canEdit && <Card className="grid gap-2 sm:grid-cols-6"><Select aria-label="Category" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{VCATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select><Input aria-label="Item" placeholder="Item" className="sm:col-span-2" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /><Input aria-label="Estimated (₹)" type="number" value={v.estimated} onChange={(e) => setV({ ...v, estimated: Number(e.target.value) })} /><Input aria-label="Actual (₹)" type="number" value={v.actual} onChange={(e) => setV({ ...v, actual: Number(e.target.value) })} /><Button disabled={!v.label} onClick={() => add.mutate()}>Add line</Button></Card>}
    </div>
  );
}

function GuestsTab({ d }: { d: WeddingResp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [g, setG] = useState({ name: '', email: '', side: 'both', partySize: 1 });
  const refresh = () => qc.invalidateQueries({ queryKey: ['wedding', d.project.id] });
  const add = useMutation({ mutationFn: () => post(`weddings/${d.project.id}/guests`, { ...g, email: g.email || undefined }), onSuccess: () => { setG({ name: '', email: '', side: 'both', partySize: 1 }); refresh(); } });
  const invite = useMutation({ mutationFn: (gid: string) => post<{ rsvpUrl: string; emailed: boolean }>(`weddings/${d.project.id}/guests/${gid}/invite`), onSuccess: async (r) => { refresh(); await navigator.clipboard?.writeText(r.rsvpUrl).catch(() => undefined); toast(r.emailed ? 'Invitation emailed (link also copied)' : 'RSVP link copied — share it with your guest', 'success'); } });
  const remove = useMutation({ mutationFn: (gid: string) => api(`weddings/${d.project.id}/guests/${gid}`, { method: 'DELETE' }), onSuccess: refresh });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4"><StatTile label="Invited (people)" value={d.guestSummary!.invited} /><StatTile label="Attending" value={d.guestSummary!.attending} /><StatTile label="Declined" value={d.guestSummary!.declined} /><StatTile label="Awaiting" value={d.guestSummary!.pending} /></div>
      <Card className="grid gap-2 sm:grid-cols-5"><Input aria-label="Guest name" placeholder="Name" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /><Input aria-label="Guest email" placeholder="Email (optional)" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /><Select aria-label="Side" value={g.side} onChange={(e) => setG({ ...g, side: e.target.value })}><option value="both">Both</option><option value="bride">Bride’s side</option><option value="groom">Groom’s side</option><option value="partner_a">Partner A</option><option value="partner_b">Partner B</option></Select><Input aria-label="Party size" type="number" min={1} value={g.partySize} onChange={(e) => setG({ ...g, partySize: Number(e.target.value) })} /><Button disabled={!g.name} onClick={() => add.mutate()}>Add guest</Button></Card>
      <DataTable rows={d.guests!} keyOf={(x) => x.id} empty="No guests yet" columns={[{ key: 'n', header: 'Guest', cell: (x) => <div><p className="text-fg">{x.name}</p><p className="text-xs text-fg-3">{x.email}</p></div> }, { key: 's', header: 'Side', cell: (x) => cap(x.side) }, { key: 'p', header: 'Party', cell: (x) => x.partySize }, { key: 'r', header: 'RSVP', cell: (x) => <Badge tone={x.rsvp === 'attending' ? 'success' : x.rsvp === 'declined' ? 'neutral' : 'warning'}>{cap(x.rsvp)}</Badge> }, { key: 'd', header: 'Dietary', cell: (x) => x.dietary ?? '—' }, { key: 'a', header: '', cell: (x) => <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => invite.mutate(x.id)}>{x.invitedAt ? 'Resend' : 'Invite'}</Button><button type="button" className="text-xs text-danger" onClick={() => remove.mutate(x.id)}>Remove</button></div> }]} />
    </div>
  );
}

function VendorsTab({ d }: { d: WeddingResp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const refresh = () => qc.invalidateQueries({ queryKey: ['wedding', d.project.id] });
  const respond = useMutation({ mutationFn: ({ quoteId, accept }: { quoteId: string; accept: boolean }) => post(`weddings/${d.project.id}/quotes/${quoteId}/respond`, { accept }), onSuccess: refresh, onError: (e) => toast((e as Error).message, 'error') });
  const pay = useMutation({ mutationFn: (mid: string) => post<{ checkout: { checkoutPath: string } }>(`weddings/${d.project.id}/milestones/${mid}/pay`), onSuccess: (r) => nav(r.checkout.checkoutPath), onError: (e) => toast((e as Error).message, 'error') });
  const cancel = useMutation({ mutationFn: (bid: string) => post<{ note?: string }>(`weddings/${d.project.id}/vendor-bookings/${bid}/cancel`, { reason: 'Plans changed' }), onSuccess: (r) => { refresh(); toast(r.note ?? 'Cancelled', 'success'); } });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-fg-2">Vendors are booked only after a quotation is accepted and the first payment milestone is paid.</p><ButtonLink to="/vendors" size="sm">Find vendors</ButtonLink></div>
      <IntegrationNotice kind="payments" />
      {!d.vendors!.length && <EmptyState icon="wedding" title="No vendor inquiries yet" />}
      {d.vendors!.map((v) => (
        <Card key={v.inquiry.id}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-display text-2xl">{v.vendor.name}</h3><p className="text-xs text-fg-3">{cap(v.vendor.category)} · inquiry {v.inquiry.status}</p></div><div className="flex gap-2">{v.vendor.isSample && <SampleBadge />}{v.inquiry.conversationId && <ButtonLink to={`/messages/${v.inquiry.conversationId}`} size="sm" variant="secondary" icon="messages">Chat</ButtonLink>}</div></div>
          {v.quotes.filter((qq) => qq.status !== 'superseded').map((qq) => (
            <div key={qq.id} className="mt-3 rounded-[var(--radius-md)] border border-line p-3">
              <div className="flex justify-between"><p className="font-semibold">{money(qq.amountPaise)}</p><Badge>{qq.status}</Badge></div>
              <p className="mt-1 text-sm text-fg-2">{qq.details}</p>
              <p className="mt-1 text-xs text-fg-3">Payments: {qq.milestones.map((m) => `${m.label} ${m.percent}%`).join(' · ')}{qq.validUntil ? ` · valid until ${qq.validUntil}` : ''}</p>
              {qq.status === 'sent' && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => respond.mutate({ quoteId: qq.id, accept: true })}>Accept quotation</Button><Button size="sm" variant="ghost" onClick={() => respond.mutate({ quoteId: qq.id, accept: false })}>Decline</Button></div>}
            </div>
          ))}
          {v.booking && (
            <div className="mt-3">
              <p className="text-sm">Booking: <Badge tone={v.booking.status === 'confirmed' ? 'success' : v.booking.status === 'pending_deposit' ? 'warning' : 'neutral'}>{cap(v.booking.status)}</Badge></p>
              <ul className="mt-2 space-y-1">{d.milestones.filter((m) => m.vendorBookingId === v.booking!.id).map((m) => <li key={m.id} className="flex items-center justify-between text-sm"><span>{m.label} · {money(m.amountPaise)}</span>{m.status === 'due' && !['cancelled', 'disputed'].includes(v.booking!.status) ? <Button size="sm" onClick={() => pay.mutate(m.id)}>Pay</Button> : <Badge>{m.status}</Badge>}</li>)}</ul>
              {['pending_deposit', 'confirmed'].includes(v.booking.status) && <Button size="sm" variant="ghost" className="mt-2" onClick={() => cancel.mutate(v.booking!.id)}>Cancel booking</Button>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function PeopleTab({ d }: { d: WeddingResp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [inv, setInv] = useState({ email: '', role: 'partner', permissions: PERMS.map((p) => p[0]) });
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({ mutationFn: () => post<{ joinUrl: string }>(`weddings/${d.project.id}/members`, inv), onSuccess: (r) => { setLink(r.joinUrl); qc.invalidateQueries({ queryKey: ['wedding', d.project.id] }); }, onError: (e) => toast((e as Error).message, 'error') });
  const update = useMutation({ mutationFn: ({ mid, body }: { mid: string; body: Record<string, unknown> }) => patch(`weddings/${d.project.id}/members/${mid}`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['wedding', d.project.id] }) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ul className="space-y-3">{d.members.map((m, i) => (
        <li key={m.id ?? i} className="card p-4">
          <div className="flex items-center gap-3"><Avatar name={m.displayName ?? m.inviteEmail} src={m.avatarUrl} size={36} /><div className="flex-1"><p className="text-fg">{m.displayName ?? m.inviteEmail}</p><p className="text-xs text-fg-3">{cap(m.role)} · {m.status}</p></div></div>
          {d.role === 'owner' && m.id && m.status !== 'revoked' && (<>
            <div className="mt-2 grid grid-cols-2 gap-1">{PERMS.map(([k, l]) => <Checkbox key={k} checked={Boolean(m.permissions?.includes(k))} onChange={(on) => update.mutate({ mid: m.id!, body: { permissions: on ? [...(m.permissions ?? []), k] : (m.permissions ?? []).filter((x) => x !== k) } })} label={l} />)}</div>
            <Button size="sm" variant="danger" className="mt-2" onClick={() => update.mutate({ mid: m.id!, body: { revoke: true } })}>Remove access</Button>
          </>)}
        </li>
      ))}</ul>
      {d.role === 'owner' && (
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">Invite someone</h2>
          <Field label="Email">{(id) => <Input id={id} type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />}</Field>
          <Field label="Role">{(id) => <Select id={id} value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="partner">Partner</option><option value="family">Family</option><option value="planner">Planner</option></Select>}</Field>
          <fieldset className="grid grid-cols-2 gap-1">{PERMS.map(([k, l]) => <Checkbox key={k} checked={inv.permissions.includes(k)} onChange={(on) => setInv({ ...inv, permissions: on ? [...inv.permissions, k] : inv.permissions.filter((x) => x !== k) })} label={l} />)}</fieldset>
          <Button disabled={!inv.email} loading={invite.isPending} onClick={() => invite.mutate()}>Send invitation</Button>
          {link && <Notice tone="success">Invitation sent. Direct link: <span className="break-all">{link}</span></Notice>}
        </Card>
      )}
    </div>
  );
}

export function Rsvp() {
  const { token } = useParams();
  const { dateLocale } = useI18n();
  const q = useQuery({ queryKey: ['rsvp', token], queryFn: () => get<{ guest: { name: string; partySize: number; rsvp: string; dietary: string | null }; wedding: { title: string; date: string | null; city: string }; events: { title: string; startsAt: string; location: string }[] }>(`rsvp/${token}`), retry: false });
  const [v, setV] = useState<{ rsvp: string; partySize: number; dietary: string } | null>(null);
  const [done, setDone] = useState(false);
  const m = useMutation({ mutationFn: () => post(`rsvp/${token}`, { rsvp: v!.rsvp, partySize: v!.partySize, dietary: v!.dietary || undefined }), onSuccess: () => setDone(true) });
  return (
    <div className="py-10">
      <QueryState q={q}>{(d) => {
        const val = v ?? { rsvp: d.guest.rsvp === 'pending' ? 'attending' : d.guest.rsvp, partySize: d.guest.partySize, dietary: d.guest.dietary ?? '' };
        return (
          <Card className="mx-auto max-w-lg text-center">
            <p className="eyebrow">You’re invited</p>
            <h1 className="mt-2 font-display text-4xl">{d.wedding.title}</h1>
            <p className="mt-1 text-fg-2">{d.wedding.date ? civilDate(d.wedding.date, dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}{d.wedding.city ? ` · ${d.wedding.city}` : ''}</p>
            {d.events.length > 0 && <ul className="mt-4 space-y-1 text-sm text-fg-2">{d.events.map((e) => <li key={e.title}>{e.title} — {dateTime(e.startsAt)}{e.location ? `, ${e.location}` : ''}</li>)}</ul>}
            {done ? <Notice tone="success" className="mt-6">Thank you, {d.guest.name}. Your response has been recorded.</Notice> : (
              <div className="mt-6 space-y-3 text-left">
                <p className="text-fg">Dear {d.guest.name}, will you attend?</p>
                <div className="flex gap-2">{['attending', 'maybe', 'declined'].map((r) => <button key={r} type="button" aria-pressed={val.rsvp === r} onClick={() => setV({ ...val, rsvp: r })} className={cx('flex-1 rounded-[var(--radius-sm)] border px-3 py-2 text-sm capitalize', val.rsvp === r ? 'border-accent bg-accent/10' : 'border-line')}>{r === 'declined' ? 'Can’t make it' : r}</button>)}</div>
                {val.rsvp !== 'declined' && <Field label={`Number attending (up to ${d.guest.partySize})`}>{(id) => <Input id={id} type="number" min={1} max={d.guest.partySize} value={val.partySize} onChange={(e) => setV({ ...val, partySize: Number(e.target.value) })} />}</Field>}
                <Field label="Dietary needs (optional)">{(id) => <Input id={id} value={val.dietary} onChange={(e) => setV({ ...val, dietary: e.target.value })} />}</Field>
                <Button block loading={m.isPending} onClick={() => { setV(val); m.mutate(); }}>Send RSVP</Button>
              </div>
            )}
          </Card>
        );
      }}</QueryState>
    </div>
  );
}

interface VendorItem { id: string; name: string; category: string; city: string; description: string; priceFromPaise: number | null; priceToPaise: number | null; languages: string[]; images: string[]; isSample: boolean; availableOnDate: boolean | null; rating: { avg: number; n: number } | null }

export function VendorsPage() {
  const [cat, setCat] = useState('');
  const [city, setCity] = useState('');
  const [date, setDate] = useState('');
  const q = useQuery({ queryKey: ['vendors', cat, city, date], queryFn: () => get<{ vendors: VendorItem[] }>(`vendors?${new URLSearchParams({ ...(cat && { category: cat }), ...(city && { city }), ...(date && { date }) })}`) });
  return (
    <div>
      <PageHeader kicker="Weddings" title="Verified vendors" subtitle="Only businesses verified by our team are listed. Availability reflects bookings made on Nakshatra and dates vendors have blocked." actions={<ButtonLink to="/vendor/dashboard" variant="ghost">I’m a vendor</ButtonLink>} />
      <div className="mb-5 flex flex-wrap gap-3"><Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className="w-44"><option value="">All categories</option>{VCATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select><Input aria-label="City" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="w-44" /><Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
      <QueryState q={q} empty={(d) => (!d.vendors.length ? <EmptyState icon="wedding" title="No vendors found" /> : null)}>{(d) => (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{d.vendors.map((v) => <li key={v.id}><Link to={`/vendors/${v.id}`} className="card block h-full p-5 hover:border-line-strong"><div className="flex flex-wrap gap-2"><Badge tone="violet">{cap(v.category)}</Badge>{v.isSample && <SampleBadge />}{v.availableOnDate === false && <Badge>Unavailable on that date</Badge>}{v.availableOnDate && <Badge tone="success">Available</Badge>}</div><h2 className="mt-2 font-display text-2xl">{v.name}</h2><p className="text-sm text-fg-3">{v.city}</p><p className="mt-2 line-clamp-3 text-sm text-fg-2">{v.description}</p>{v.priceFromPaise !== null && <p className="mt-2 text-sm text-fg">From {money(v.priceFromPaise)}</p>}</Link></li>)}</ul>
      )}</QueryState>
    </div>
  );
}

export function VendorPage() {
  const { id } = useParams();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['vendor', id], queryFn: () => get<{ vendor: VendorItem & { verificationStatus: string }; reviews: { id: string; rating: number; body: string }[]; unavailableDates: string[] }>(`vendors/${id}`) });
  const projects = useQuery({ queryKey: ['weddings'], queryFn: () => get<{ projects: { id: string; title: string; weddingDate: string | null }[] }>('weddings') });
  const [inq, setInq] = useState({ projectId: '', message: '', eventDate: '', guestCount: '' });
  const m = useMutation({ mutationFn: () => post<{ inquiry: { conversationId: string } }>(`weddings/${inq.projectId}/inquiries`, { vendorId: id, message: inq.message, eventDate: inq.eventDate || undefined, guestCount: inq.guestCount ? Number(inq.guestCount) : undefined }), onSuccess: (r) => { toast('Inquiry sent', 'success'); nav(`/messages/${r.inquiry.conversationId}`); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <PageHeader kicker={cap(d.vendor.category)} title={d.vendor.name} subtitle={d.vendor.city} actions={d.vendor.isSample && <SampleBadge />} />
          {d.vendor.isSample && <Notice tone="dev" className="mb-4">Development sample vendor — not a real business.</Notice>}
          <p className="whitespace-pre-line leading-relaxed text-fg-2">{d.vendor.description}</p>
          {d.vendor.priceFromPaise !== null && <p className="mt-4 text-fg">Pricing from {money(d.vendor.priceFromPaise)}{d.vendor.priceToPaise ? ` to ${money(d.vendor.priceToPaise)}` : ''}</p>}
          {d.unavailableDates.length > 0 && <p className="mt-3 text-sm text-fg-3">Unavailable: {d.unavailableDates.slice(0, 10).join(', ')}</p>}
          <h2 className="mt-8 font-display text-2xl">Reviews from couples who booked</h2>
          <ul className="mt-2 space-y-2">{d.reviews.map((r) => <li key={r.id}><span className="text-accent">{'★'.repeat(r.rating)}</span><p className="text-sm text-fg-2">{r.body}</p></li>)}{!d.reviews.length && <li className="text-sm text-fg-3">No reviews yet.</li>}</ul>
        </div>
        <Card className="space-y-3 self-start">
          <h2 className="font-display text-2xl">Send an inquiry</h2>
          {projects.data && !projects.data.projects.length ? <Notice tone="info">Create a wedding project first. <Link to="/weddings/new" className="underline">Start one</Link></Notice> : (<>
            <Field label="Project">{(fid) => <Select id={fid} value={inq.projectId} onChange={(e) => setInq({ ...inq, projectId: e.target.value })}><option value="">Choose…</option>{projects.data?.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>}</Field>
            <Field label="Event date">{(fid) => <Input id={fid} type="date" value={inq.eventDate} onChange={(e) => setInq({ ...inq, eventDate: e.target.value })} />}</Field>
            <Field label="Guests (approx.)">{(fid) => <Input id={fid} type="number" value={inq.guestCount} onChange={(e) => setInq({ ...inq, guestCount: e.target.value })} />}</Field>
            <Field label="Message">{(fid) => <Textarea id={fid} rows={4} value={inq.message} onChange={(e) => setInq({ ...inq, message: e.target.value })} />}</Field>
            <Button disabled={!inq.projectId || inq.message.length < 10} loading={m.isPending} onClick={() => m.mutate()}>Send inquiry</Button>
          </>)}
        </Card>
      </div>
    )}</QueryState>
  );
}

export function VendorDashboard() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['vendor-me'], queryFn: () => get<{ vendors: (VendorItem & { verificationStatus: string })[]; inquiries: { id: string; vendorId: string; message: string; status: string; eventDate: string | null; guestCount: number | null; conversationId: string | null; project?: { title: string; city: string }; quotes: { id: string; amountPaise: number; status: string }[] }[]; bookings: { id: string; vendorId: string; status: string; totalPaise: number; milestones: { label: string; amountPaise: number; status: string }[] }[] }>('vendor/me') });
  const [creating, setCreating] = useState(false);
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [block, setBlock] = useState({ vendorId: '', date: '' });
  const refresh = () => qc.invalidateQueries({ queryKey: ['vendor-me'] });
  const blockDate = useMutation({ mutationFn: () => post(`vendor/listings/${block.vendorId}/unavailability`, { date: block.date }), onSuccess: () => { refresh(); toast('Date blocked', 'success'); } });
  const decline = useMutation({ mutationFn: (iid: string) => post(`vendor/inquiries/${iid}/decline`), onSuccess: refresh });
  const complete = useMutation({ mutationFn: (bid: string) => post(`vendor/bookings/${bid}/complete`), onSuccess: refresh });
  return (
    <div>
      <PageHeader kicker="Vendor studio" title="Your business" subtitle="Listings appear after verification. Bookings confirm only when the couple pays the first milestone." actions={<Button icon="plus" onClick={() => setCreating(true)}>New listing</Button>} />
      <QueryState q={q}>{(d) => (
        <div className="space-y-6">
          <ul className="grid gap-3 md:grid-cols-2">{d.vendors.map((v) => <li key={v.id} className="card p-4"><div className="flex justify-between"><p className="text-fg">{v.name}</p><Badge tone={v.verificationStatus === 'verified' ? 'success' : 'warning'}>{v.verificationStatus}</Badge></div><p className="text-xs text-fg-3">{cap(v.category)} · {v.city}</p></li>)}{!d.vendors.length && <li className="text-sm text-fg-3">No listings yet.</li>}</ul>
          {d.vendors.length > 0 && <Card className="flex flex-wrap items-end gap-2"><Field label="Block a date">{(fid) => <Select id={fid} value={block.vendorId} onChange={(e) => setBlock({ ...block, vendorId: e.target.value })}><option value="">Listing…</option>{d.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field><Input aria-label="Date" type="date" value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} className="w-44" /><Button size="sm" disabled={!block.vendorId || !block.date} onClick={() => blockDate.mutate()}>Block</Button></Card>}
          <section><h2 className="mb-3 font-display text-2xl">Inquiries</h2><ul className="space-y-3">{d.inquiries.map((i) => (
            <li key={i.id} className="card p-4">
              <div className="flex flex-wrap justify-between gap-2"><p className="text-fg">{i.project?.title} <span className="text-fg-3">· {i.project?.city}</span></p><Badge>{i.status}</Badge></div>
              <p className="mt-1 text-sm text-fg-2">{i.message}</p>
              <p className="text-xs text-fg-3">{i.eventDate ?? 'Date TBD'}{i.guestCount ? ` · ${i.guestCount} guests` : ''}{i.quotes.length ? ` · latest quote ${money(i.quotes[i.quotes.length - 1].amountPaise)} (${i.quotes[i.quotes.length - 1].status})` : ''}</p>
              <div className="mt-2 flex gap-2">{!['booked', 'declined', 'closed'].includes(i.status) && <><Button size="sm" onClick={() => setQuoteFor(i.id)}>Send quotation</Button><Button size="sm" variant="ghost" onClick={() => decline.mutate(i.id)}>Decline</Button></>}{i.conversationId && <ButtonLink to={`/messages/${i.conversationId}`} size="sm" variant="secondary">Chat</ButtonLink>}</div>
            </li>
          ))}{!d.inquiries.length && <li className="text-sm text-fg-3">No inquiries yet.</li>}</ul></section>
          <section><h2 className="mb-3 font-display text-2xl">Bookings</h2><DataTable rows={d.bookings} keyOf={(b) => b.id} empty="No bookings yet" columns={[{ key: 's', header: 'Status', cell: (b) => cap(b.status) }, { key: 't', header: 'Total', cell: (b) => money(b.totalPaise) }, { key: 'm', header: 'Milestones', cell: (b) => b.milestones.map((m) => `${m.label}: ${m.status}`).join(' · ') }, { key: 'a', header: '', cell: (b) => b.status === 'confirmed' && <Button size="sm" variant="secondary" onClick={() => complete.mutate(b.id)}>Mark completed</Button> }]} /></section>
        </div>
      )}</QueryState>
      <NewListingDialog open={creating} onClose={() => setCreating(false)} />
      {quoteFor && <QuoteDialog inquiryId={quoteFor} onClose={() => setQuoteFor(null)} />}
    </div>
  );
}

function NewListingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ name: '', category: 'pandit', description: '', from: 0, to: 0, languages: '' });
  const [place, setPlace] = useState<Place | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => post('vendor/listings', { name: v.name, category: v.category, placeId: place?.id, description: v.description, priceFromPaise: v.from ? Math.round(v.from * 100) : undefined, priceToPaise: v.to ? Math.round(v.to * 100) : undefined, languages: v.languages.split(',').map((s) => s.trim()).filter(Boolean) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor-me'] }); onClose(); }, onError: (e) => setErr((e as Error).message) });
  return (
    <Dialog open={open} onClose={onClose} title="New listing" footer={<Button loading={m.isPending} onClick={() => m.mutate()}>Submit for verification</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {err && <Notice tone="danger" className="sm:col-span-2">{err}</Notice>}
        <Field label="Business name" className="sm:col-span-2">{(id) => <Input id={id} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
        <Field label="Category">{(id) => <Select id={id} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{VCATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</Select>}</Field>
        <Field label="City">{(id) => <PlaceSearch id={id} value={place} onChange={setPlace} />}</Field>
        <Field label="Description" className="sm:col-span-2">{(id) => <Textarea id={id} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
        <Field label="Price from (₹)">{(id) => <Input id={id} type="number" value={v.from} onChange={(e) => setV({ ...v, from: Number(e.target.value) })} />}</Field>
        <Field label="Price to (₹)">{(id) => <Input id={id} type="number" value={v.to} onChange={(e) => setV({ ...v, to: Number(e.target.value) })} />}</Field>
        <Field label="Languages" className="sm:col-span-2">{(id) => <Input id={id} value={v.languages} onChange={(e) => setV({ ...v, languages: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}

function QuoteDialog({ inquiryId, onClose }: { inquiryId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ amount: 0, details: '', validUntil: '', milestones: [{ label: 'Deposit', percent: 30 }, { label: 'Balance', percent: 70 }] });
  const [err, setErr] = useState<string | null>(null);
  const total = v.milestones.reduce((a, m) => a + m.percent, 0);
  const m = useMutation({ mutationFn: () => post(`vendor/inquiries/${inquiryId}/quote`, { amountPaise: Math.round(v.amount * 100), details: v.details, validUntil: v.validUntil || undefined, milestones: v.milestones }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor-me'] }); onClose(); }, onError: (e) => setErr((e as Error).message) });
  return (
    <Dialog open onClose={onClose} title="Send a quotation" footer={<Button disabled={total !== 100 || !v.amount} loading={m.isPending} onClick={() => m.mutate()}>Send</Button>}>
      <div className="space-y-3">
        {err && <Notice tone="danger">{err}</Notice>}
        <Field label="Total amount (₹)">{(id) => <Input id={id} type="number" value={v.amount} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })} />}</Field>
        <Field label="What’s included">{(id) => <Textarea id={id} rows={3} value={v.details} onChange={(e) => setV({ ...v, details: e.target.value })} />}</Field>
        <Field label="Valid until">{(id) => <Input id={id} type="date" value={v.validUntil} onChange={(e) => setV({ ...v, validUntil: e.target.value })} />}</Field>
        <p className="text-sm text-fg-2">Payment milestones (must total 100%) — currently {total}%</p>
        {v.milestones.map((ms, i) => <div key={i} className="flex gap-2"><Input aria-label="Milestone label" value={ms.label} onChange={(e) => setV({ ...v, milestones: v.milestones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} /><Input aria-label="Percent" type="number" className="w-24" value={ms.percent} onChange={(e) => setV({ ...v, milestones: v.milestones.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)) })} /></div>)}
      </div>
    </Dialog>
  );
}
