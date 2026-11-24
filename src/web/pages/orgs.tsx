import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, patch, post, put } from '../lib/api';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, Switch } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { ORG_KINDS } from '../../shared/orgs';

const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');

export function OrgsPage() {
  const q = useQuery({ queryKey: ['orgs'], queryFn: () => get<{ orgs: { id: string; name: string; kind: string; role: string }[] }>('orgs') });
  return (
    <div className="space-y-6">
      <PageHeader kicker="You" title="Organisations" subtitle="Workspaces for your team, college or community — with their own circles. Your personal results stay yours." />
      <QueryState q={q} empty={(d) => (!d.orgs.length ? <EmptyState icon="users" title="You’re not in an organisation" body="If your team or college uses Nakshatra, ask an admin for an invite link." /> : null)}>{(d) => (
        <ul className="grid gap-3 sm:grid-cols-2">{d.orgs.map((o) => (
          <li key={o.id}><Link to={`/orgs/${o.id}`} className="card block h-full p-4 hover:border-line-strong"><p className="font-semibold text-fg">{o.name}</p><p className="text-xs text-fg-3">{o.kind} · {o.role}</p></Link></li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}

interface OrgView {
  org: { id: string; name: string; kind: string; emailDomain: string | null; seatLimit: number; seatsUsed: number };
  me: { role: string; isAdmin: boolean; includeInAggregate: boolean };
  members: { userId: string; name: string; role: string; you: boolean }[];
  circles: { id: string; name: string; description: string; memberCount: number; joined: boolean }[];
}

export function OrgPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['org', id], queryFn: () => get<OrgView>(`orgs/${id}`) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['org', id] });
  const consent = useMutation({ mutationFn: (include: boolean) => put(`orgs/${id}/aggregate`, { include }), onSuccess: refresh, onError: fail(toast) });
  const join = useMutation({ mutationFn: (circleId: string) => post(`orgs/${id}/circles/${circleId}/join`), onSuccess: (_r, circleId) => nav(`/circles/${circleId}`), onError: fail(toast) });
  const member = useMutation({ mutationFn: ({ userId, action }: { userId: string; action: string }) => post(`orgs/${id}/members/${userId}`, { action }), onSuccess: () => { refresh(); toast('Updated', 'success'); }, onError: fail(toast) });
  const leave = useMutation({ mutationFn: () => post(`orgs/${id}/leave`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['orgs'] }); nav('/orgs'); }, onError: fail(toast) });
  return (
    <QueryState q={q}>{(d) => (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader kicker={`Organisation · ${d.org.kind}`} title={d.org.name} subtitle={`${d.org.seatsUsed} of ${d.org.seatLimit} seats · you’re ${d.me.role === 'owner' ? 'the owner' : d.me.role === 'admin' ? 'an admin' : 'a member'}`} />

        <Card className="space-y-2" aria-label="Your privacy here">
          <h2 className="font-display text-2xl">Your privacy here</h2>
          <p className="text-sm text-fg-2">Your organisation can see your name and role — never your archetype, answers, chart or activity.</p>
          <Switch label="Count me in the team picture" description="Adds your latest result, anonymously, to the team’s average. It only appears once 5 people opt in, and nobody can see your own result." checked={d.me.includeInAggregate} onChange={(v) => consent.mutate(v)} />
        </Card>

        <section aria-labelledby="oc-h" className="space-y-3">
          <h2 id="oc-h" className="font-display text-2xl">Circles</h2>
          {d.circles.length === 0 ? <p className="text-sm text-fg-3">No circles yet{d.me.isAdmin ? ' — create one below.' : '.'}</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">{d.circles.map((c) => (
              <li key={c.id} className="card flex flex-col p-4">
                <p className="font-semibold text-fg">{c.name}</p>
                {c.description && <p className="text-sm text-fg-2">{c.description}</p>}
                <p className="mt-1 text-xs text-fg-3">{c.memberCount} member{c.memberCount === 1 ? '' : 's'}</p>
                <div className="mt-3">{c.joined ? <ButtonLink to={`/circles/${c.id}`} size="sm" variant="secondary">Open</ButtonLink> : <Button size="sm" onClick={() => join.mutate(c.id)}>Join</Button>}</div>
              </li>
            ))}</ul>
          )}
          {d.me.isAdmin && <NewOrgCircle orgId={d.org.id} onDone={refresh} />}
        </section>

        {d.me.isAdmin && <OrgAdmin d={d} />}

        <Card aria-label="People">
          <h2 className="font-display text-2xl">People</h2>
          <ul className="mt-3 divide-y divide-line">{d.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 text-fg">{m.name}{m.you && <span className="text-fg-3"> (you)</span>}</span>
              <Badge tone="neutral">{m.role}</Badge>
              {d.me.isAdmin && !m.you && m.role !== 'owner' && (
                <span className="flex flex-wrap gap-1">
                  {d.me.role === 'owner' && (m.role === 'admin' ? <Button size="sm" variant="ghost" onClick={() => member.mutate({ userId: m.userId, action: 'remove_admin' })}>Remove admin</Button> : <Button size="sm" variant="ghost" onClick={() => member.mutate({ userId: m.userId, action: 'make_admin' })}>Make admin</Button>)}
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => member.mutate({ userId: m.userId, action: 'remove' })}>Remove</Button>
                </span>
              )}
            </li>
          ))}</ul>
        </Card>
        {d.me.role !== 'owner' && <Button variant="ghost" onClick={() => leave.mutate()}>Leave {d.org.name}</Button>}
      </div>
    )}</QueryState>
  );
}

function NewOrgCircle({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const m = useMutation({ mutationFn: () => post(`orgs/${orgId}/circles`, { name }), onSuccess: () => { setName(''); onDone(); toast('Circle created', 'success'); }, onError: fail(toast) });
  return (
    <div className="flex flex-wrap gap-2"><Input aria-label="New circle name" placeholder="New circle, e.g. Lunch club" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" /><Button variant="secondary" disabled={name.trim().length < 2} loading={m.isPending} onClick={() => m.mutate()}>Create circle</Button></div>
  );
}

interface Insights { members: number; activeThisWeek: number; circles: number; circlePostsThisWeek: number; gamesThisWeek: number; composition: { counted: number; needed: number; dimensions: { dimension: string; name: string; average: number; spread: string; lean: string }[] | null }; note: string }

function OrgAdmin({ d }: { d: OrgView }) {
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);
  const [domainOnly, setDomainOnly] = useState(false);
  const ins = useQuery({ queryKey: ['org-insights', d.org.id], queryFn: () => get<Insights>(`orgs/${d.org.id}/insights`) });
  const invite = useMutation({ mutationFn: () => post<{ url: string }>(`orgs/${d.org.id}/invites`, { requireDomain: domainOnly }), onSuccess: (r) => setLink(r.url), onError: fail(toast) });
  return (
    <>
      <Card className="space-y-3" aria-label="Invite people">
        <h2 className="font-display text-2xl">Invite people</h2>
        {d.org.emailDomain && <Switch label={`Only ${d.org.emailDomain} email addresses`} checked={domainOnly} onChange={setDomainOnly} />}
        <Button size="sm" loading={invite.isPending} onClick={() => invite.mutate()}>Create invite link</Button>
        {link && <Input aria-label="Invite link (valid 14 days)" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />}
      </Card>
      <Card className="space-y-3" aria-label="Team insights">
        <h2 className="font-display text-2xl">Team insights</h2>
        <QueryState q={ins}>{(i) => (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {([['Members', i.members], ['Active this week', i.activeThisWeek], ['Circle posts this week', i.circlePostsThisWeek], ['Games this week', i.gamesThisWeek]] as const).map(([k, v]) => <div key={k}><dt className="text-fg-3">{k}</dt><dd className="font-display text-2xl numeric">{v}</dd></div>)}
            </dl>
            {i.composition.dimensions ? (
              <ul className="space-y-1 text-sm">{i.composition.dimensions.map((x) => <li key={x.dimension}><span className="text-fg">{x.name}:</span> <span className="text-fg-2">{x.lean} · {x.spread}</span></li>)}</ul>
            ) : <p className="text-sm text-fg-2">Team picture appears once {i.composition.needed} people opt in ({i.composition.counted} so far).</p>}
            <p className="text-xs text-fg-3">{i.note}</p>
          </div>
        )}</QueryState>
      </Card>
    </>
  );
}

export function JoinOrg() {
  const { token } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const q = useQuery({ queryKey: ['org-invite', token], queryFn: () => get<{ org: { name: string; kind: string }; requiresDomain: string | null }>(`org-invites/${token}`), retry: false });
  const accept = useMutation({ mutationFn: () => post<{ orgId: string }>(`org-invites/${token}/accept`), onSuccess: (r) => nav(`/orgs/${r.orgId}`), onError: fail(toast) });
  return (
    <QueryState q={q}>{(d) => (
      <Card className="mx-auto max-w-md space-y-3 text-center">
        <p className="eyebrow">You’re invited</p>
        <h1 className="font-display text-3xl">{d.org.name}</h1>
        <p className="text-sm text-fg-2">Join this {d.org.kind} workspace on Nakshatra. It sees your name and role only — never your personal results.</p>
        {d.requiresDomain && <Notice tone="info">For {d.requiresDomain} email addresses.</Notice>}
        <Button loading={accept.isPending} onClick={() => accept.mutate()}>Join</Button>
      </Card>
    )}</QueryState>
  );
}

/* ---------------- Staff ---------------- */

export function OrgsAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-orgs'], queryFn: () => get<{ orgs: { id: string; name: string; kind: string; emailDomain: string | null; seatLimit: number; status: string; members: number }[] }>('admin/orgs') });
  const [f, setF] = useState({ name: '', kind: 'company', emailDomain: '', seatLimit: '50', ownerEmail: '' });
  const create = useMutation({ mutationFn: () => post('admin/orgs', { name: f.name, kind: f.kind, emailDomain: f.emailDomain || undefined, seatLimit: Number(f.seatLimit), ownerEmail: f.ownerEmail }), onSuccess: () => { setF({ ...f, name: '', emailDomain: '', ownerEmail: '' }); void qc.invalidateQueries({ queryKey: ['admin-orgs'] }); toast('Organisation created', 'success'); }, onError: fail(toast) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => patch(`admin/orgs/${id}`, body), onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-orgs'] }), onError: fail(toast) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">Organisations are set up by staff after an agreement; there is no in-app billing. Org admins never see individual personality results.</p>
      <Card className="space-y-3" aria-label="New organisation">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Organisation name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Kind">{(id) => <Select id={id} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{ORG_KINDS.map((k) => <option key={k}>{k}</option>)}</Select>}</Field>
          <Field label="Owner’s Nakshatra email">{(id) => <Input id={id} type="email" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} />}</Field>
          <Field label="Seats">{(id) => <Input id={id} inputMode="numeric" value={f.seatLimit} onChange={(e) => setF({ ...f, seatLimit: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Email domain (optional)">{(id) => <Input id={id} placeholder="acme.com" value={f.emailDomain} onChange={(e) => setF({ ...f, emailDomain: e.target.value })} />}</Field>
        </div>
        <Button size="sm" disabled={!f.name || !f.ownerEmail} loading={create.isPending} onClick={() => create.mutate()}>Create organisation</Button>
      </Card>
      <QueryState q={q}>{(d) => (
        <ul className="space-y-2">{d.orgs.map((o) => (
          <li key={o.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm" aria-label={`Organisation ${o.name}`}>
            <span><span className="font-semibold text-fg">{o.name}</span> <span className="text-fg-3">· {o.kind} · {o.members}/{o.seatLimit} seats{o.emailDomain ? ` · ${o.emailDomain}` : ''}</span></span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: o.id, body: { seatLimit: o.seatLimit + 10 } })}>+10 seats</Button>
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: o.id, body: { status: o.status === 'active' ? 'suspended' : 'active' } })}>{o.status === 'active' ? 'Suspend' : 'Restore'}</Button>
            </span>
          </li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}
