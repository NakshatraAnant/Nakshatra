import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post, put } from '../lib/api';
import { cap, dateTime, money, relative } from '../lib/format';
import { useMe } from '../lib/session';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Switch, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice } from '../components/ui/feedback';
import { ConfirmDialog, Dialog, useToast } from '../components/ui/overlays';
import { DataTable, StatTile } from '../components/ui/data';
import { AssessmentAdmin, FunnelAdmin } from './adminInsights';
import { CodAdmin } from './adminMerch';
import { CreatorsAdmin, LaunchReadiness, PerformanceAdmin, StudentRequests } from './adminOps';
import { AdsAdmin } from './adminAds';

const SECTIONS: [string, string][] = [
  ['overview', 'Overview'], ['launch', 'Launch readiness'], ['performance', 'Performance'], ['users', 'Users'], ['moderation', 'Moderation'], ['appeals', 'Appeals'], ['verification', 'Verification'], ['refunds', 'Refunds & disputes'],
  ['payouts', 'Payouts'], ['commerce', 'Products & orders'], ['cod', 'COD fulfilment'], ['students', 'Student requests'], ['creators', 'Creators'], ['ads', 'Sponsored cards'], ['courses', 'Courses'], ['vendors', 'Vendors & experts'], ['content', 'Interpretation content'],
  ['config', 'Calculation configs'], ['templates', 'Notification templates'], ['analytics', 'Analytics'], ['funnel', 'Funnel'], ['assessment', 'Assessment model'], ['audit', 'Audit log'], ['flags', 'Flags & settings'],
  ['support', 'Support'], ['privacy', 'Privacy requests'],
];

export function AdminPage() {
  const { section = 'overview' } = useParams();
  const nav = useNavigate();
  const me = useMe().data?.user;
  return (
    <div>
      <PageHeader kicker="Administration" title={SECTIONS.find((s) => s[0] === section)?.[1] ?? 'Admin'} subtitle={`Signed in with roles: ${me?.roles.join(', ')}. Sensitive actions are recorded in the audit log.`} />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Admin sections" className="flex flex-wrap gap-1 lg:flex-col">
          {SECTIONS.map(([k, l]) => <button key={k} type="button" onClick={() => nav(`/admin/${k}`)} aria-current={section === k ? 'page' : undefined} className={cx('rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm', section === k ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:text-fg')}>{l}</button>)}
        </nav>
        <div className="min-w-0">
          {section === 'overview' && <Overview />}
          {section === 'launch' && <LaunchReadiness />}
          {section === 'performance' && <PerformanceAdmin />}
          {section === 'users' && <Users />}
          {section === 'moderation' && <Moderation />}
          {section === 'appeals' && <AppealsAdmin />}
          {section === 'verification' && <Verification />}
          {section === 'refunds' && <Refunds />}
          {section === 'payouts' && <Payouts />}
          {section === 'commerce' && <Commerce />}
          {section === 'cod' && <CodAdmin />}
          {section === 'students' && <StudentRequests />}
          {section === 'creators' && <CreatorsAdmin />}
          {section === 'ads' && <AdsAdmin />}
          {section === 'courses' && <Courses />}
          {section === 'vendors' && <VendorsExperts />}
          {section === 'content' && <Content />}
          {section === 'config' && <Configs />}
          {section === 'templates' && <Templates />}
          {section === 'analytics' && <Analytics />}
          {section === 'funnel' && <FunnelAdmin />}
          {section === 'assessment' && <AssessmentAdmin />}
          {section === 'audit' && <Audit />}
          {section === 'flags' && <Flags />}
          {section === 'support' && <Support />}
          {section === 'privacy' && <PrivacyReqs />}
        </div>
      </div>
    </div>
  );
}

function useAct<T = unknown>(key: unknown[]) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => post<T>(path, body ?? {}), onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast('Done', 'success'); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
}

function Overview() {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => get<{ users: number; queues: Record<string, number> }>('admin/overview') });
  const health = useQuery({ queryKey: ['health'], queryFn: () => fetch('/api/health').then((r) => r.json() as Promise<{ status: string; database: string; dbOk: boolean; time: string }>), refetchInterval: 30000 });
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => get<{ integrations: Record<string, { status: string; label: string }>; aiFeatures: string }>('integrations') });
  const tone = (s: string) => (s === 'configured' || s === 'ok' ? 'success' : s === 'development' ? 'violet' : 'warning') as 'success' | 'violet' | 'warning';
  return (
    <div className="space-y-6">
      <QueryState q={q}>{(d) => <div className="grid gap-4 sm:grid-cols-3"><StatTile label="Users" value={d.users} />{Object.entries(d.queues).map(([k, v]) => <StatTile key={k} label={cap(k.replace(/([A-Z])/g, ' $1').toLowerCase())} value={v} />)}</div>}</QueryState>
      <Card>
        <h2 className="font-display text-2xl">Operational status</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {health.data && <li className="flex items-center justify-between gap-3 py-2"><span className="text-fg">API & database ({health.data.database})</span><Badge tone={tone(health.data.status)}>{health.data.status}</Badge></li>}
          {health.error && <li className="flex items-center justify-between gap-3 py-2"><span className="text-fg">API & database</span><Badge tone="danger">unreachable</Badge></li>}
          {integ.data && Object.entries(integ.data.integrations).map(([k, v]) => <li key={k} className="flex items-center justify-between gap-3 py-2"><span><span className="text-fg">{cap(k)}</span><span className="block text-xs text-fg-3">{v.label}</span></span><Badge tone={tone(v.status)}>{v.status}</Badge></li>)}
        </ul>
        {health.data && <p className="mt-2 text-xs text-fg-3">Checked {relative(health.data.time)}. AI features: {integ.data?.aiFeatures ?? 'none'}.</p>}
      </Card>
    </div>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['admin-users', q], queryFn: () => get<{ users: { id: string; email: string; status: string; handle: string | null; displayName: string | null; roles: string[]; createdAt: string; emailVerifiedAt: string | null }[] }>(`admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  return (
    <div>
      <Input aria-label="Search users" placeholder="Email, handle or name" className="mb-4 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      <QueryState q={list}>{(d) => <DataTable rows={d.users} keyOf={(u) => u.id} columns={[{ key: 'n', header: 'User', cell: (u) => <div><p className="text-fg">{u.displayName}</p><p className="text-xs text-fg-3">{u.email} · @{u.handle}</p></div> }, { key: 's', header: 'Status', cell: (u) => <Badge tone={u.status === 'active' ? 'success' : u.status === 'suspended' ? 'danger' : 'neutral'}>{u.status}</Badge> }, { key: 'r', header: 'Roles', cell: (u) => u.roles.join(', ') || '—' }, { key: 'c', header: 'Joined', cell: (u) => relative(u.createdAt) }, { key: 'a', header: '', cell: (u) => <Button size="sm" variant="secondary" onClick={() => setSel(u.id)}>Manage</Button> }]} />}</QueryState>
      {sel && <UserDialog id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function UserDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['admin-user', id], queryFn: () => get<{ user: { email: string; status: string; suspendedReason: string | null; mfaEnabled: boolean; emailVerifiedAt: string | null }; profile: { handle: string; displayName: string }; roles: string[]; reports: { id: string; reason: string; status: string; createdAt: string }[]; moderationActions: { action: string; reason: string; createdAt: string }[]; hasBirthProfile: boolean; note: string }>(`admin/users/${id}`) });
  const act = useAct(['admin-user', id]);
  const [reason, setReason] = useState('');
  const [del, setDel] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Manage user" size="lg">
      <QueryState q={q}>{(d) => (
        <div className="space-y-4">
          <p className="text-fg">{d.profile?.displayName} <span className="text-fg-3">@{d.profile?.handle} · {d.user.email}</span></p>
          <p className="text-sm text-fg-2">Status: <strong>{d.user.status}</strong>{d.user.suspendedReason ? ` (${d.user.suspendedReason})` : ''} · MFA {d.user.mfaEnabled ? 'on' : 'off'} · email {d.user.emailVerifiedAt ? 'verified' : 'unverified'} · birth profile {d.hasBirthProfile ? 'present' : 'none'}</p>
          <Notice tone="info">{d.note}</Notice>
          <Field label="Reason (required for status changes)">{(fid) => <Input id={fid} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex flex-wrap gap-2">
            {d.user.status === 'active' ? <Button variant="danger" size="sm" disabled={reason.length < 5} onClick={() => act.mutate({ path: `admin/users/${id}/status`, body: { status: 'suspended', reason, confirm: true } })}>Suspend</Button> : d.user.status === 'suspended' && <Button size="sm" disabled={reason.length < 5} onClick={() => act.mutate({ path: `admin/users/${id}/status`, body: { status: 'active', reason, confirm: true } })}>Restore</Button>}
            <Button variant="ghost" size="sm" onClick={() => setDel(true)}>Delete account…</Button>
          </div>
          <div><p className="text-sm font-semibold">Roles</p><div className="mt-2 flex flex-wrap gap-2">{['admin', 'moderator', 'support', 'expert', 'creator', 'vendor', 'seller'].map((r) => { const has = d.roles.includes(r); return <button key={r} type="button" aria-pressed={has} onClick={() => act.mutate({ path: `admin/users/${id}/roles`, body: { role: r, grant: !has } })} className={cx('rounded-full border px-3 py-1 text-xs', has ? 'border-accent bg-accent/10' : 'border-line text-fg-3')}>{r}</button>; })}</div></div>
          <div><p className="text-sm font-semibold">Reports against this user ({d.reports.length})</p><ul className="mt-1 text-xs text-fg-3">{d.reports.map((r) => <li key={r.id}>{r.reason} · {r.status} · {relative(r.createdAt)}</li>)}</ul></div>
          <div><p className="text-sm font-semibold">Moderation history</p><ul className="mt-1 text-xs text-fg-3">{d.moderationActions.map((m, i) => <li key={i}>{m.action}: {m.reason} · {relative(m.createdAt)}</li>)}</ul></div>
          <ConfirmDialog open={del} onClose={() => setDel(false)} danger requireText="DELETE" title="Delete this account?" confirmLabel="Delete" body="Applies the standard deletion and retention rules. This cannot be undone." onConfirm={() => { act.mutate({ path: `admin/users/${id}/delete`, body: { confirm: 'DELETE', reason: reason || 'Admin deletion' } }); setDel(false); onClose(); }} />
        </div>
      )}</QueryState>
    </Dialog>
  );
}

function Moderation() {
  const [queue, setQueue] = useState('');
  const [status, setStatus] = useState('open');
  const q = useQuery({ queryKey: ['admin-reports', queue, status], queryFn: () => get<{ reports: { id: string; targetType: string; targetId: string; reason: string; details: string; queue: string; priority: number; status: string; createdAt: string; reporter?: { displayName: string }; targetUser?: { displayName: string; handle: string } | null; preview: string | null; priorReports: number }[] }>(`admin/reports?${new URLSearchParams({ ...(queue && { queue }), status })}`) });
  const act = useAct(['admin-reports']);
  const [reason, setReason] = useState<Record<string, string>>({});
  return (
    <div>
      <div className="mb-4 flex gap-3"><Select aria-label="Queue" value={queue} onChange={(e) => setQueue(e.target.value)} className="w-48"><option value="">All queues</option><option value="general">General</option><option value="dating_safety">Dating safety</option><option value="marketplace">Marketplace</option></Select><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="open">Open</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option></Select></div>
      <QueryState q={q}>{(d) => (
        <ul className="space-y-3">{d.reports.map((r) => (
          <li key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={r.priority === 1 ? 'danger' : 'warning'}>P{r.priority}</Badge><Badge>{r.queue}</Badge><span className="text-sm text-fg">{cap(r.reason)} · {r.targetType}</span><span className="text-xs text-fg-3">{relative(r.createdAt)} · by {r.reporter?.displayName}</span></div>
            {r.targetUser && <p className="mt-1 text-sm text-fg-2">Target: {r.targetUser.displayName} (@{r.targetUser.handle}) · {r.priorReports} report(s) total</p>}
            {r.preview && <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-fg-2">{r.preview}</blockquote>}
            {r.details && <p className="mt-1 text-xs text-fg-3">Reporter note: {r.details}</p>}
            {r.status === 'open' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input aria-label="Decision reason" placeholder="Reason (shown to the user)" className="max-w-xs" value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
                {['hide_content', 'warn_user', 'remove_from_dating', 'suspend_user', 'dismiss'].map((a) => <Button key={a} size="sm" variant={a === 'dismiss' ? 'ghost' : a === 'suspend_user' ? 'danger' : 'secondary'} disabled={(reason[r.id] ?? '').length < 3} onClick={() => act.mutate({ path: `admin/reports/${r.id}/action`, body: { action: a, reason: reason[r.id] } })}>{cap(a)}</Button>)}
              </div>
            )}
          </li>
        ))}{!d.reports.length && <li className="text-sm text-fg-3">Queue is empty.</li>}</ul>
      )}</QueryState>
    </div>
  );
}

function AppealsAdmin() {
  const q = useQuery({ queryKey: ['admin-appeals'], queryFn: () => get<{ appeals: { id: string; body: string; createdAt: string; user?: { displayName: string } }[] }>('admin/appeals') });
  const act = useAct(['admin-appeals']);
  const [note, setNote] = useState<Record<string, string>>({});
  return <QueryState q={q}>{(d) => <ul className="space-y-3">{d.appeals.map((a) => <li key={a.id} className="card p-4"><p className="text-sm text-fg">{a.user?.displayName} · {relative(a.createdAt)}</p><p className="mt-1 text-sm text-fg-2">{a.body}</p><div className="mt-2 flex flex-wrap gap-2"><Input aria-label="Decision note" className="max-w-sm" value={note[a.id] ?? ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} /><Button size="sm" onClick={() => act.mutate({ path: `admin/appeals/${a.id}/decide`, body: { decision: 'overturned', note: note[a.id] } })} disabled={(note[a.id] ?? '').length < 3}>Overturn</Button><Button size="sm" variant="secondary" onClick={() => act.mutate({ path: `admin/appeals/${a.id}/decide`, body: { decision: 'upheld', note: note[a.id] } })} disabled={(note[a.id] ?? '').length < 3}>Uphold</Button></div></li>)}{!d.appeals.length && <li className="text-sm text-fg-3">No open appeals.</li>}</ul>}</QueryState>;
}

function Verification() {
  const [kind, setKind] = useState('');
  const q = useQuery({ queryKey: ['admin-verif', kind], queryFn: () => get<{ requests: { id: string; userId: string; kind: string; note: string; createdAt: string; evidenceCount: number; user?: { displayName: string }; expert?: { displayName: string; headline: string; specializations: string[] }; credentials?: { title: string; issuer: string; year: number | null }[]; vendors?: { name: string; category: string; city: string }[] }[] }>(`admin/verifications${kind ? `?kind=${kind}` : ''}`) });
  const act = useAct(['admin-verif']);
  const [note, setNote] = useState<Record<string, string>>({});
  return (
    <div>
      <Select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="mb-4 w-48"><option value="">All</option><option value="dating">Dating selfie</option><option value="expert">Expert credentials</option><option value="vendor">Vendor</option><option value="matchmaking">Matchmaking</option><option value="creator">Creator application</option><option value="seller">Seller application</option></Select>
      <QueryState q={q}>{(d) => <ul className="space-y-3">{d.requests.map((r) => (
        <li key={r.id} className="card p-4">
          <p className="text-fg">{r.user?.displayName} <Badge>{r.kind}</Badge> <span className="text-xs text-fg-3">{relative(r.createdAt)}</span></p>
          {r.expert && <p className="mt-1 text-sm text-fg-2">{r.expert.displayName} — {r.expert.headline} ({r.expert.specializations.join(', ')})</p>}
          {r.credentials?.map((c) => <p key={c.title} className="text-xs text-fg-3">Credential: {c.title} · {c.issuer} {c.year ?? ''}</p>)}
          {r.vendors?.map((v) => <p key={v.name} className="text-xs text-fg-3">Listing: {v.name} · {v.category} · {v.city}</p>)}
          <div className="mt-2 flex flex-wrap gap-2">{Array.from({ length: r.evidenceCount }).map((_, i) => <a key={i} href={`/api/v1/admin/verifications/${r.id}/evidence/${i}`} target="_blank" rel="noreferrer" className="text-sm text-accent underline">Evidence {i + 1}</a>)}</div>
          <div className="mt-3 flex flex-wrap gap-2"><Input aria-label="Review note" className="max-w-sm" placeholder="Review note" value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /><Button size="sm" disabled={(note[r.id] ?? '').length < 3} onClick={() => act.mutate({ path: `admin/verifications/${r.id}/decide`, body: { approve: true, note: note[r.id] } })}>Approve</Button><Button size="sm" variant="danger" disabled={(note[r.id] ?? '').length < 3} onClick={() => act.mutate({ path: `admin/verifications/${r.id}/decide`, body: { approve: false, note: note[r.id] } })}>Reject</Button></div>
        </li>
      ))}{!d.requests.length && <li className="text-sm text-fg-3">No pending requests.</li>}</ul>}</QueryState>
    </div>
  );
}

function Refunds() {
  const refunds = useQuery({ queryKey: ['admin-refunds'], queryFn: () => get<{ refunds: { id: string; amountPaise: number; reason: string; status: string; createdAt: string; payment: { purpose: string; amountPaise: number; refundedPaise: number; provider: string } }[] }>('admin/refunds') });
  const disputes = useQuery({ queryKey: ['admin-disputes'], queryFn: () => get<{ disputes: { id: string; subjectType: string; subjectId: string; reason: string; details: string; status: string; createdAt: string }[] }>('admin/disputes') });
  const act = useAct(['admin-refunds']);
  const actD = useAct(['admin-disputes']);
  const [note, setNote] = useState<Record<string, string>>({});
  return (
    <div className="space-y-6">
      <section><h2 className="mb-3 font-display text-2xl">Refund requests</h2><QueryState q={refunds}>{(d) => <DataTable rows={d.refunds} keyOf={(r) => r.id} columns={[{ key: 'p', header: 'Payment', cell: (r) => `${r.payment.purpose} · ${money(r.payment.amountPaise)} (${r.payment.provider})` }, { key: 'a', header: 'Refund', cell: (r) => money(r.amountPaise) }, { key: 'r', header: 'Reason', cell: (r) => r.reason }, { key: 's', header: 'Status', cell: (r) => <Badge>{r.status}</Badge> }, { key: 'x', header: '', cell: (r) => r.status === 'requested' && <div className="flex gap-1"><Input aria-label="Note" className="w-32" value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} /><Button size="sm" disabled={(note[r.id] ?? '').length < 3} onClick={() => act.mutate({ path: `admin/refunds/${r.id}/decide`, body: { approve: true, note: note[r.id] } })}>Approve</Button><Button size="sm" variant="ghost" disabled={(note[r.id] ?? '').length < 3} onClick={() => act.mutate({ path: `admin/refunds/${r.id}/decide`, body: { approve: false, note: note[r.id] } })}>Reject</Button></div> }]} />}</QueryState></section>
      <section><h2 className="mb-3 font-display text-2xl">Disputes</h2><QueryState q={disputes}>{(d) => <ul className="space-y-3">{d.disputes.map((x) => <li key={x.id} className="card p-4"><p className="text-fg">{x.subjectType} · {cap(x.reason)} <Badge>{x.status}</Badge></p><p className="text-sm text-fg-2">{x.details}</p>{['open', 'investigating'].includes(x.status) && <div className="mt-2 flex flex-wrap gap-2"><Input aria-label="Resolution" className="max-w-sm" placeholder="Resolution" value={note[x.id] ?? ''} onChange={(e) => setNote({ ...note, [x.id]: e.target.value })} /><Button size="sm" disabled={(note[x.id] ?? '').length < 5} onClick={() => actD.mutate({ path: `admin/disputes/${x.id}/resolve`, body: { outcome: 'resolved_refund', resolution: note[x.id] } })}>Resolve with refund</Button><Button size="sm" variant="secondary" disabled={(note[x.id] ?? '').length < 5} onClick={() => actD.mutate({ path: `admin/disputes/${x.id}/resolve`, body: { outcome: 'resolved_no_refund', resolution: note[x.id] } })}>Resolve without refund</Button></div>}</li>)}{!d.disputes.length && <li className="text-sm text-fg-3">No disputes.</li>}</ul>}</QueryState></section>
    </div>
  );
}

function Payouts() {
  const q = useQuery({ queryKey: ['admin-payouts'], queryFn: () => get<{ payouts: { id: string; payeeId: string; amountPaise: number; status: string; periodEnd: string; createdAt: string; providerRef: string | null }[] }>('admin/payouts') });
  const act = useAct(['admin-payouts']);
  const [ref, setRef] = useState<Record<string, string>>({});
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3"><Field label="Period end">{(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field><Button onClick={() => act.mutate({ path: 'admin/payouts/generate', body: { periodEnd: end } })}>Generate payout records</Button><p className="text-xs text-fg-3">Creates records for completed, unpaid bookings. Transfers are made outside Nakshatra and then marked paid with a reference.</p></Card>
      <QueryState q={q}>{(d) => <DataTable rows={d.payouts} keyOf={(p) => p.id} columns={[{ key: 'a', header: 'Amount', cell: (p) => money(p.amountPaise) }, { key: 'e', header: 'Period end', cell: (p) => String(p.periodEnd).slice(0, 10) }, { key: 's', header: 'Status', cell: (p) => <Badge>{p.status}</Badge> }, { key: 'r', header: 'Reference', cell: (p) => p.providerRef ?? (p.status === 'pending' && <div className="flex gap-1"><Input aria-label="Transfer reference" className="w-36" value={ref[p.id] ?? ''} onChange={(e) => setRef({ ...ref, [p.id]: e.target.value })} /><Button size="sm" disabled={(ref[p.id] ?? '').length < 3} onClick={() => act.mutate({ path: `admin/payouts/${p.id}/mark-paid`, body: { reference: ref[p.id] } })}>Mark paid</Button></div>) }]} />}</QueryState>
    </div>
  );
}

function Commerce() {
  const products = useQuery({ queryKey: ['admin-products'], queryFn: () => get<{ products: { id: string; slug: string; title: string; status: string; isSample: boolean; sellerId: string | null; category: string; variants: { id: string; name: string; stock: number | null; pricePaise: number }[] }[] }>('admin/products') });
  const orders = useQuery({ queryKey: ['admin-orders'], queryFn: () => get<{ orders: { id: string; number: string; status: string; totalPaise: number; createdAt: string }[] }>('admin/orders') });
  const discounts = useQuery({ queryKey: ['admin-discounts'], queryFn: () => get<{ discounts: { id: string; code: string; kind: string; value: number; usedCount: number; maxUses: number | null; active: boolean }[] }>('admin/discounts') });
  const subs = useQuery({ queryKey: ['admin-subs'], queryFn: () => get<{ subscriptions: { id: string; planKey: string; status: string; currentPeriodEnd: string | null }[] }>('admin/subscriptions') });
  const actP = useAct(['admin-products']);
  const actO = useAct(['admin-orders']);
  const actD = useAct(['admin-discounts']);
  const [disc, setDisc] = useState({ code: '', kind: 'percent', value: 10 });
  return (
    <div className="space-y-6">
      <section><h2 className="mb-3 font-display text-2xl">Products</h2><QueryState q={products}>{(d) => <DataTable rows={d.products} keyOf={(p) => p.id} columns={[{ key: 't', header: 'Product', cell: (p) => <div><Link to={`/shop/p/${p.slug}`} className="text-fg hover:underline">{p.title}</Link>{p.isSample && <Badge tone="violet" className="ml-2">sample</Badge>}<p className="text-xs text-fg-3">{p.category} · {p.sellerId ? 'seller listing' : 'platform'}</p></div> }, { key: 'v', header: 'Stock', cell: (p) => p.variants.map((v) => <div key={v.id} className="flex items-center gap-1 text-xs">{v.name}: {v.stock ?? '∞'}{v.stock !== null && <><button type="button" className="text-accent" onClick={() => actP.mutate({ path: `admin/variants/${v.id}/stock`, body: { delta: 10, reason: 'restock' } })}>+10</button></>}</div>) }, { key: 's', header: 'Status', cell: (p) => <Select aria-label="Status" value={p.status} onChange={(e) => actP.mutate({ path: `admin/products/${p.id}/status`, body: { status: e.target.value } })} className="h-9 w-32 text-sm"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></Select> }]} />}</QueryState></section>
      <section><h2 className="mb-3 font-display text-2xl">Orders</h2><QueryState q={orders}>{(d) => <DataTable rows={d.orders} keyOf={(o) => o.id} columns={[{ key: 'n', header: 'Order', cell: (o) => o.number }, { key: 't', header: 'Total', cell: (o) => money(o.totalPaise) }, { key: 's', header: 'Status', cell: (o) => <Badge>{o.status}</Badge> }, { key: 'd', header: 'Created', cell: (o) => dateTime(o.createdAt) }, { key: 'x', header: 'Shipment', cell: (o) => ['fulfilling', 'shipped'].includes(o.status) && <Select aria-label="Shipment status" defaultValue="" onChange={(e) => e.target.value && actO.mutate({ path: `admin/orders/${o.id}/shipment`, body: { status: e.target.value, carrier: 'Dev courier', trackingNumber: 'DEV' + o.number.slice(-4) } })} className="h-9 w-36 text-sm"><option value="">Update…</option><option value="shipped">Shipped</option><option value="in_transit">In transit</option><option value="delivered">Delivered</option></Select> }]} />}</QueryState></section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="font-display text-2xl">Discount codes</h2><QueryState q={discounts}>{(d) => <ul className="mt-2 space-y-1 text-sm">{d.discounts.map((x) => <li key={x.id}>{x.code} — {x.kind === 'percent' ? `${x.value}%` : money(x.value)} · used {x.usedCount}{x.maxUses ? `/${x.maxUses}` : ''}</li>)}</ul>}</QueryState><div className="mt-3 flex gap-2"><Input aria-label="Code" placeholder="CODE" value={disc.code} onChange={(e) => setDisc({ ...disc, code: e.target.value.toUpperCase() })} /><Select aria-label="Kind" value={disc.kind} onChange={(e) => setDisc({ ...disc, kind: e.target.value })} className="w-28"><option value="percent">%</option><option value="fixed">Paise</option></Select><Input aria-label="Value" type="number" className="w-24" value={disc.value} onChange={(e) => setDisc({ ...disc, value: Number(e.target.value) })} /><Button size="sm" disabled={disc.code.length < 3} onClick={() => actD.mutate({ path: 'admin/discounts', body: disc })}>Create</Button></div></Card>
        <Card><h2 className="font-display text-2xl">Subscriptions</h2><QueryState q={subs}>{(d) => <ul className="mt-2 space-y-1 text-sm">{d.subscriptions.map((s) => <li key={s.id}>{s.planKey} · {s.status}{s.currentPeriodEnd ? ` · until ${new Date(s.currentPeriodEnd).toLocaleDateString()}` : ''}</li>)}{!d.subscriptions.length && <li className="text-fg-3">None.</li>}</ul>}</QueryState></Card>
      </section>
    </div>
  );
}

function Courses() {
  const q = useQuery({ queryKey: ['admin-courses'], queryFn: () => get<{ courses: { id: string; slug: string; title: string; status: string; pricePaise: number; creatorId: string }[] }>('admin/courses') });
  const act = useAct(['admin-courses']);
  const [note, setNote] = useState<Record<string, string>>({});
  return <QueryState q={q}>{(d) => <DataTable rows={d.courses} keyOf={(c) => c.id} columns={[{ key: 't', header: 'Course', cell: (c) => <Link to={`/learn/${c.slug}`} className="text-fg hover:underline">{c.title}</Link> }, { key: 'p', header: 'Price', cell: (c) => (c.pricePaise ? money(c.pricePaise) : 'Free') }, { key: 's', header: 'Status', cell: (c) => <Badge>{c.status}</Badge> }, { key: 'a', header: '', cell: (c) => c.status === 'in_review' && <div className="flex gap-1"><Input aria-label="Note" className="w-36" value={note[c.id] ?? ''} onChange={(e) => setNote({ ...note, [c.id]: e.target.value })} /><Button size="sm" onClick={() => act.mutate({ path: `admin/courses/${c.id}/review`, body: { approve: true, note: note[c.id] ?? '' } })}>Publish</Button><Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/courses/${c.id}/review`, body: { approve: false, note: note[c.id] ?? '' } })}>Request changes</Button></div> }]} />}</QueryState>;
}

function VendorsExperts() {
  const q = useQuery({ queryKey: ['admin-vendors'], queryFn: () => get<{ vendors: { id: string; name: string; category: string; city: string; verificationStatus: string; isSample: boolean }[] }>('admin/vendors') });
  const wb = useQuery({ queryKey: ['admin-wb'], queryFn: () => get<{ bookings: { id: string; status: string; totalPaise: number; createdAt: string }[] }>('admin/wedding-bookings') });
  const act = useAct(['admin-vendors']);
  return (
    <div className="space-y-6">
      <QueryState q={q}>{(d) => <DataTable rows={d.vendors} keyOf={(v) => v.id} columns={[{ key: 'n', header: 'Vendor', cell: (v) => `${v.name}${v.isSample ? ' (sample)' : ''}` }, { key: 'c', header: 'Category', cell: (v) => `${v.category} · ${v.city}` }, { key: 's', header: 'Status', cell: (v) => <Select aria-label="Status" value={v.verificationStatus} onChange={(e) => act.mutate({ path: `admin/vendors/${v.id}/status`, body: { status: e.target.value, reason: 'Admin review' } })} className="h-9 w-36 text-sm"><option value="draft" disabled>Draft</option><option value="pending" disabled>Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></Select> }]} />}</QueryState>
      <h2 className="font-display text-2xl">Wedding vendor bookings</h2>
      <QueryState q={wb}>{(d) => <DataTable rows={d.bookings} keyOf={(b) => b.id} columns={[{ key: 's', header: 'Status', cell: (b) => b.status }, { key: 't', header: 'Total', cell: (b) => money(b.totalPaise) }, { key: 'd', header: 'Created', cell: (b) => dateTime(b.createdAt) }]} />}</QueryState>
    </div>
  );
}

function Content() {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ ruleKey: string; titleEn: string; bodyEn: string; titleHi: string | null; bodyHi: string | null; caveat: string | null; source: string } | null>(null);
  const list = useQuery({ queryKey: ['admin-interp', q], queryFn: () => get<{ rules: { id: string; ruleKey: string; version: number; status: string; titleEn: string; bodyEn: string; titleHi: string | null; bodyHi: string | null; caveat: string | null; source: string; system: string; factorLabel: string }[] }>(`admin/interpretations${q ? `?q=${encodeURIComponent(q)}` : ''}`) });
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({ mutationFn: (status: 'draft' | 'published') => post(`admin/interpretations/${edit!.ruleKey}/versions`, { ...edit, titleHi: edit!.titleHi || undefined, bodyHi: edit!.bodyHi || undefined, caveat: edit!.caveat || undefined, status }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-interp'] }); setEdit(null); toast('New version saved', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <div>
      <Notice tone="info" className="mb-4">Editing creates a new version; publishing retires the previous published version. Existing saved insights keep the version the user saw.</Notice>
      <Input aria-label="Search rules" placeholder="Search rule key or title" className="mb-4 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      <QueryState q={list}>{(d) => <DataTable rows={d.rules} keyOf={(r) => r.id} columns={[{ key: 'k', header: 'Rule', cell: (r) => <div><p className="font-mono text-xs text-fg">{r.ruleKey}</p><p className="text-xs text-fg-3">{r.factorLabel}</p></div> }, { key: 'v', header: 'v', cell: (r) => r.version }, { key: 's', header: 'Status', cell: (r) => <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>{r.status}</Badge> }, { key: 't', header: 'Title', cell: (r) => r.titleEn }, { key: 'h', header: 'Hindi', cell: (r) => (r.bodyHi ? '✓' : '—') }, { key: 'e', header: '', cell: (r) => r.status === 'published' && <Button size="sm" variant="secondary" onClick={() => setEdit({ ruleKey: r.ruleKey, titleEn: r.titleEn, bodyEn: r.bodyEn, titleHi: r.titleHi, bodyHi: r.bodyHi, caveat: r.caveat, source: r.source })}>Edit</Button> }]} />}</QueryState>
      {edit && (
        <Dialog open onClose={() => setEdit(null)} title={`Edit ${edit.ruleKey}`} size="lg" footer={<><Button variant="secondary" onClick={() => save.mutate('draft')}>Save draft</Button><Button onClick={() => save.mutate('published')}>Publish new version</Button></>}>
          <div className="space-y-3">
            <Field label="Title (English)">{(id) => <Input id={id} value={edit.titleEn} onChange={(e) => setEdit({ ...edit, titleEn: e.target.value })} />}</Field>
            <Field label="Body (English)">{(id) => <Textarea id={id} rows={4} value={edit.bodyEn} onChange={(e) => setEdit({ ...edit, bodyEn: e.target.value })} />}</Field>
            <Field label="Title (Hindi)">{(id) => <Input id={id} lang="hi" value={edit.titleHi ?? ''} onChange={(e) => setEdit({ ...edit, titleHi: e.target.value })} />}</Field>
            <Field label="Body (Hindi)">{(id) => <Textarea id={id} lang="hi" rows={4} value={edit.bodyHi ?? ''} onChange={(e) => setEdit({ ...edit, bodyHi: e.target.value })} />}</Field>
            <Field label="Caveat">{(id) => <Input id={id} value={edit.caveat ?? ''} onChange={(e) => setEdit({ ...edit, caveat: e.target.value })} />}</Field>
            <Field label="Editorial source">{(id) => <Input id={id} value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} />}</Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Configs() {
  const q = useQuery({ queryKey: ['admin-configs'], queryFn: () => get<{ configs: { key: string; system: string; label: string; isDefault: boolean; active: boolean; config: Record<string, string> }[] }>('admin/calculation-configs') });
  const act = useAct(['admin-configs']);
  return <QueryState q={q}>{(d) => <DataTable rows={d.configs} keyOf={(c) => c.key} columns={[{ key: 'k', header: 'Key', cell: (c) => <span className="font-mono text-xs">{c.key}</span> }, { key: 'c', header: 'Convention', cell: (c) => Object.entries(c.config).map(([k, v]) => `${k}: ${v}`).join(' · ') }, { key: 'd', header: 'Default', cell: (c) => (c.isDefault ? '✓' : '') }, { key: 'a', header: 'Active', cell: (c) => <Switch label={c.key} checked={c.active} disabled={c.isDefault} onChange={(v) => act.mutate({ path: `admin/calculation-configs/${c.key}`, body: { active: v } })} /> }]} />}</QueryState>;
}

function Templates() {
  const q = useQuery({ queryKey: ['admin-templates'], queryFn: () => get<{ templates: { key: string; category: string; titleTemplate: string; bodyTemplate: string }[] }>('admin/notification-templates') });
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({ mutationFn: (t: { key: string; titleTemplate: string; bodyTemplate: string }) => put(`admin/notification-templates/${t.key}`, { titleTemplate: t.titleTemplate, bodyTemplate: t.bodyTemplate }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-templates'] }); toast('Template saved', 'success'); } });
  return <QueryState q={q}>{(d) => <ul className="space-y-3">{d.templates.map((t) => <li key={t.key} className="card space-y-2 p-4"><p className="font-mono text-xs text-fg-3">{t.key} · {t.category}</p><Input aria-label="Title" defaultValue={t.titleTemplate} onBlur={(e) => e.target.value !== t.titleTemplate && save.mutate({ ...t, titleTemplate: e.target.value })} /><Textarea aria-label="Body" rows={2} defaultValue={t.bodyTemplate} onBlur={(e) => e.target.value !== t.bodyTemplate && save.mutate({ ...t, bodyTemplate: e.target.value })} /></li>)}</ul>}</QueryState>;
}

interface AnalyticsResp { definition: string; wmcu: { week: string; users: number }[]; publicFunnel: { name: string; label: string; value: number; unit: string }[]; activationFunnel: { name: string; users: number }[]; retentionCohorts: { cohort: string; size: number; w1: number; w4: number }[]; featureAdoption: { name: string; users: number; events: number }[]; revenue: { purpose: string; gross: number; refunded: number; count: number }[]; consultationFunnel: { status: string; n: number }[]; commerceFunnel: { status: string; n: number }[]; learning: { enrolled: number; completed: number }; invitations: { sent: number; accepted: number }; subscriptions: { status: string; n: number }[]; clientErrors: { day: string; n: number }[]; privacyNote: string }

function Bars({ rows, label, value }: { rows: { label: string; value: number }[]; label: string; value?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure>
      <figcaption className="mb-2 text-sm text-fg">{label}</figcaption>
      <ul className="space-y-1.5" role="list">{rows.map((r) => <li key={r.label} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-xs"><span className="truncate text-fg-3">{r.label}</span><span className="h-2.5 rounded-full bg-surface-3"><span className="block h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} /></span><span className="text-right text-fg numeric">{value ? value(r.value) : r.value}</span></li>)}{!rows.length && <li className="text-xs text-fg-3">No data yet.</li>}</ul>
    </figure>
  );
}

function Analytics() {
  const q = useQuery({ queryKey: ['admin-analytics'], queryFn: () => get<AnalyticsResp>('admin/analytics') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-6">
        <Notice tone="info" title="North-star metric">{d.definition}</Notice>
        <div className="grid gap-4 sm:grid-cols-4"><StatTile label="WMCU (latest week)" value={d.wmcu.at(-1)?.users ?? 0} /><StatTile label="Invite acceptance" value={d.invitations.sent ? `${Math.round((d.invitations.accepted / d.invitations.sent) * 100)}%` : '—'} sub={`${d.invitations.accepted}/${d.invitations.sent}`} /><StatTile label="Course completion" value={d.learning.enrolled ? `${Math.round((d.learning.completed / d.learning.enrolled) * 100)}%` : '—'} /><StatTile label="Gross revenue" value={money(d.revenue.reduce((a, r) => a + r.gross - r.refunded, 0))} sub="net of refunds" /></div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><Bars label="Weekly Meaningful Cosmic Users" rows={d.wmcu.map((w) => ({ label: w.week, value: w.users }))} /></Card>
          <Card><Bars label="Discovery funnel (anonymous steps count events; account steps count users)" rows={d.publicFunnel.map((f) => ({ label: `${f.label} (${f.unit})`, value: f.value }))} /></Card>
          <Card><Bars label="Activation funnel (distinct users)" rows={d.activationFunnel.map((f) => ({ label: f.name.replace(/_/g, ' '), value: f.users }))} /></Card>
          <Card><h3 className="mb-2 text-sm text-fg">Retention cohorts (meaningful activity)</h3><table className="w-full text-xs numeric"><thead className="text-fg-3"><tr><th className="text-left">Cohort</th><th>Size</th><th>Week 1</th><th>Week 4</th></tr></thead><tbody>{d.retentionCohorts.map((c) => <tr key={c.cohort} className="border-t border-line"><td className="py-1">{c.cohort}</td><td className="text-center">{c.size}</td><td className="text-center">{c.size ? Math.round((c.w1 / c.size) * 100) : 0}%</td><td className="text-center">{c.size ? Math.round((c.w4 / c.size) * 100) : 0}%</td></tr>)}</tbody></table></Card>
          <Card><Bars label="Feature adoption (distinct users)" rows={d.featureAdoption.slice(0, 14).map((f) => ({ label: f.name.replace(/_/g, ' '), value: f.users }))} /></Card>
          <Card><Bars label="Revenue by purpose" rows={d.revenue.map((r) => ({ label: r.purpose, value: r.gross - r.refunded }))} value={money} /></Card>
          <Card><Bars label="Consultation funnel (bookings by status)" rows={d.consultationFunnel.map((r) => ({ label: r.status, value: r.n }))} /></Card>
          <Card><Bars label="Commerce funnel (orders by status)" rows={d.commerceFunnel.map((r) => ({ label: r.status, value: r.n }))} /></Card>
          <Card><Bars label="Client errors per day" rows={d.clientErrors.map((r) => ({ label: r.day, value: r.n }))} /></Card>
        </div>
        <p className="text-xs text-fg-3">{d.privacyNote}</p>
      </div>
    )}</QueryState>
  );
}

function Audit() {
  const [action, setAction] = useState('');
  const q = useQuery({ queryKey: ['admin-audit', action], queryFn: () => get<{ entries: { id: string; actorId: string | null; action: string; targetType: string | null; targetId: string | null; meta: Record<string, unknown>; ip: string | null; createdAt: string }[] }>(`admin/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`) });
  return (
    <div>
      <Input aria-label="Filter by action prefix" placeholder="Filter: auth., admin., moderation., refund…" className="mb-4 max-w-sm" value={action} onChange={(e) => setAction(e.target.value)} />
      <QueryState q={q}>{(d) => <DataTable rows={d.entries} keyOf={(e) => e.id} columns={[{ key: 't', header: 'When', cell: (e) => dateTime(e.createdAt) }, { key: 'a', header: 'Action', cell: (e) => <span className="font-mono text-xs">{e.action}</span> }, { key: 'x', header: 'Target', cell: (e) => e.targetType ? `${e.targetType} ${e.targetId?.slice(0, 8)}` : '—' }, { key: 'u', header: 'Actor', cell: (e) => e.actorId?.slice(0, 8) ?? 'system' }, { key: 'm', header: 'Details', cell: (e) => <span className="text-xs">{JSON.stringify(e.meta).slice(0, 80)}</span> }]} />}</QueryState>
    </div>
  );
}

function Flags() {
  const q = useQuery({ queryKey: ['admin-flags'], queryFn: () => get<{ flags: { key: string; description: string; enabled: boolean; rolloutPercent: number }[]; experiments: { key: string; description: string; variants: string[]; active: boolean }[] }>('admin/flags') });
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: () => get<{ settings: { key: string; value: number }[] }>('admin/settings') });
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({ mutationFn: (f: { key: string; enabled: boolean; rolloutPercent: number }) => put(`admin/flags/${f.key}`, { enabled: f.enabled, rolloutPercent: f.rolloutPercent }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-flags'] }); toast('Flag updated', 'success'); } });
  const setSetting = useMutation({ mutationFn: ({ key, value }: { key: string; value: number }) => put(`admin/settings/${key}`, { value }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-settings'] }); toast('Setting updated', 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><h2 className="font-display text-2xl">Feature flags</h2><QueryState q={q}>{(d) => <ul className="mt-3 space-y-3">{d.flags.map((f) => <li key={f.key} className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-fg">{f.key}</p><p className="text-xs text-fg-3">{f.description}</p></div><div className="flex items-center gap-2"><Input aria-label={`${f.key} rollout`} type="number" min={0} max={100} className="w-20" defaultValue={f.rolloutPercent} onBlur={(e) => save.mutate({ ...f, rolloutPercent: Number(e.target.value) })} /><Switch label="Enabled" checked={f.enabled} onChange={(v) => save.mutate({ ...f, enabled: v })} /></div></li>)}</ul>}</QueryState></Card>
      <Card><h2 className="font-display text-2xl">Platform settings</h2><QueryState q={settings}>{(d) => <ul className="mt-3 space-y-3">{d.settings.filter((s) => typeof s.value === 'number').map((s) => <li key={s.key} className="flex items-center justify-between gap-3"><label htmlFor={`set-${s.key}`} className="text-sm text-fg-2">{s.key.replace(/_/g, ' ')}</label><Input id={`set-${s.key}`} type="number" min={0} max={60} className="w-24" defaultValue={s.value} onBlur={(e) => Number(e.target.value) !== s.value && setSetting.mutate({ key: s.key, value: Number(e.target.value) })} /></li>)}</ul>}</QueryState></Card>
    </div>
  );
}

function Support() {
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['admin-tickets'], queryFn: () => get<{ tickets: { id: string; subject: string; category: string; status: string; updatedAt: string; user?: { displayName: string } }[] }>('admin/tickets') });
  const t = useQuery({ queryKey: ['admin-ticket', sel], queryFn: () => get<{ ticket: { subject: string; status: string }; messages: { id: string; body: string; isStaff: boolean; createdAt: string }[] }>(`admin/tickets/${sel}`), enabled: Boolean(sel) });
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('pending_user');
  const act = useAct(['admin-tickets']);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <QueryState q={q}>{(d) => <ul className="space-y-2">{d.tickets.map((x) => <li key={x.id}><button type="button" onClick={() => setSel(x.id)} className={cx('card w-full p-3 text-left', sel === x.id && 'border-accent')}><p className="text-fg">{x.subject}</p><p className="text-xs text-fg-3">{x.user?.displayName} · {x.category} · {x.status} · {relative(x.updatedAt)}</p></button></li>)}{!d.tickets.length && <li className="text-sm text-fg-3">No tickets.</li>}</ul>}</QueryState>
      {sel && <QueryState q={t}>{(d) => <Card className="space-y-3"><h2 className="font-display text-2xl">{d.ticket.subject}</h2><ul className="space-y-2">{d.messages.map((m) => <li key={m.id} className={cx('rounded p-2 text-sm', m.isStaff ? 'bg-accent/10' : 'bg-surface-2')}>{m.body}<p className="text-[10px] text-fg-3">{m.isStaff ? 'Staff' : 'User'} · {relative(m.createdAt)}</p></li>)}</ul><Textarea aria-label="Reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} /><div className="flex gap-2"><Select aria-label="Set status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44"><option value="pending_user">Awaiting user</option><option value="resolved">Resolved</option><option value="closed">Closed</option></Select><Button disabled={!reply.trim()} onClick={() => { act.mutate({ path: `admin/tickets/${sel}/reply`, body: { body: reply, status } }); setReply(''); }}>Send reply</Button></div></Card>}</QueryState>}
    </div>
  );
}

function PrivacyReqs() {
  const q = useQuery({ queryKey: ['admin-privacy'], queryFn: () => get<{ exports: { id: string; userId: string; status: string; createdAt: string }[]; deletions: { id: string; status: string; reason: string | null; summary: Record<string, unknown> | null; createdAt: string }[] }>('admin/privacy-requests') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><h2 className="font-display text-2xl">Data exports</h2><ul className="mt-2 space-y-1 text-sm">{d.exports.map((e) => <li key={e.id}>{e.userId.slice(0, 8)} · {e.status} · {relative(e.createdAt)}</li>)}{!d.exports.length && <li className="text-fg-3">None.</li>}</ul><p className="mt-2 text-xs text-fg-3">Exports are generated on demand and delivered to the user directly.</p></Card>
        <Card><h2 className="font-display text-2xl">Deletions</h2><ul className="mt-2 space-y-2 text-sm">{d.deletions.map((x) => <li key={x.id}>{x.status} · {relative(x.createdAt)}{x.reason ? ` · ${x.reason}` : ''}<p className="text-xs text-fg-3">{x.summary ? JSON.stringify(x.summary) : ''}</p></li>)}{!d.deletions.length && <li className="text-fg-3">None.</li>}</ul></Card>
      </div>
    )}</QueryState>
  );
}
