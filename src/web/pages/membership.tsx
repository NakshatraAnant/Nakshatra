import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, idempotencyKey, post } from '../lib/api';
import { cap, money } from '../lib/format';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader } from '../components/ui/primitives';
import { Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';

interface Plan { key: string; name: string; description: string; pricePaise: number; intervalMonths: number; benefits: string[]; seats: number; eligibility: 'anyone' | 'student'; founding: boolean; remaining: number | null }
interface Membership {
  plus: { active: boolean; planKey: string | null; via: 'own' | 'shared' | null; expiresAt: string | null; sharedBy: string | null };
  paymentsEnabled: boolean;
  plans: Plan[];
  subscription: { id: string; planKey: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; lockedPricePaise: number | null } | null;
  duo: { seats: number; members: { id: string; name: string | null; handle: string | null }[]; pendingInvite: boolean } | null;
  student: { status: 'pending' | 'approved' | 'rejected'; institution: string; note: string; expiresAt: string | null } | null;
  note: string;
}

function useAct() {
  const qc = useQueryClient();
  const toast = useToast();
  return (fn: () => Promise<unknown>, done = 'Updated') => fn().then(() => { void qc.invalidateQueries({ queryKey: ['membership'] }); toast(done, 'success'); }).catch((e) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error'));
}

export function MembershipPanel() {
  const nav = useNavigate();
  const act = useAct();
  const toast = useToast();
  const [key] = useState(idempotencyKey);
  const [institution, setInstitution] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['membership'], queryFn: () => get<Membership>('membership') });
  const start = useMutation({ mutationFn: (planKey: string) => post<{ checkout: { checkoutPath: string } }>('subscriptions', { planKey, idempotencyKey: `${key}:${planKey}` }), onSuccess: (r) => nav(r.checkout.checkoutPath) });
  return (
    <QueryState q={q}>{(d) => {
      const sub = d.subscription;
      const plan = sub ? d.plans.find((p) => p.key === sub.planKey) : null;
      const studentOk = d.student?.status === 'approved';
      return (
        <div className="space-y-5">
          {!d.paymentsEnabled && <Notice tone="info" title="Preview">Memberships open once payments are switched on. Nothing can be bought or charged right now.</Notice>}
          {start.error && <Notice tone="danger">{start.error instanceof ApiError ? start.error.message : 'Could not start checkout'}</Notice>}

          {d.plus.active && d.plus.via === 'shared' && (
            <Card>
              <h2 className="font-display text-2xl">Nakshatra+ via Duo</h2>
              <p className="mt-1 text-sm text-fg-2">Shared with you by {d.plus.sharedBy}. It continues while their membership is active.</p>
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => act(() => post('membership/duo/leave'), 'You left the Duo')}>Leave this Duo</Button>
            </Card>
          )}

          {sub && plan && (
            <Card className="space-y-3">
              <h2 className="font-display text-2xl">{plan.name}</h2>
              <p className="text-sm text-fg-2">Status: <strong>{cap(sub.status)}</strong>{sub.currentPeriodEnd && ` · ${sub.cancelAtPeriodEnd ? 'ends' : 'renews'} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}{sub.lockedPricePaise ? ` · founding price ${money(sub.lockedPricePaise)} locked` : ''}</p>
              <div className="flex flex-wrap gap-2">
                {sub.status === 'active' && !sub.cancelAtPeriodEnd && <Button size="sm" variant="ghost" onClick={() => act(() => post(`subscriptions/${sub.id}/cancel`), 'Benefits continue until the end of this period')}>Cancel at period end</Button>}
                {sub.status === 'active' && sub.cancelAtPeriodEnd && <Button size="sm" onClick={() => act(() => post(`subscriptions/${sub.id}/resume`))}>Keep my membership</Button>}
                {sub.status === 'past_due' && <Button size="sm" onClick={() => post<{ checkout: { checkoutPath: string } }>(`subscriptions/${sub.id}/renew`).then((r) => nav(r.checkout.checkoutPath))}>Confirm renewal payment</Button>}
              </div>
              {d.duo && (
                <div className="space-y-2 border-t border-line pt-3" aria-label="Duo seat">
                  <h3 className="font-semibold text-fg">Your Duo</h3>
                  {d.duo.members.length ? d.duo.members.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{m.name} <span className="text-fg-3">@{m.handle}</span></span>
                      <Button size="sm" variant="ghost" onClick={() => act(() => post(`membership/duo/members/${m.id}/end`), 'Removed')}>Remove</Button>
                    </div>
                  )) : <p className="text-sm text-fg-2">Your second seat is free.{d.duo.pendingInvite ? ' An invite link is waiting to be used.' : ''}</p>}
                  {!d.duo.members.length && sub.status === 'active' && <Button size="sm" variant="secondary" onClick={() => post<{ link: string }>('membership/duo/invite').then((r) => setLink(r.link)).catch((e) => toast(e instanceof ApiError ? e.message : 'Could not create a link', 'error'))}>{d.duo.pendingInvite ? 'Create a new link' : 'Create invite link'}</Button>}
                  {link && <label className="block text-sm text-fg-2">Send this link to one person (works once, for 7 days)<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 text-sm text-fg" /></label>}
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {d.plans.map((p) => {
              const soldOut = p.remaining === 0;
              const blocked = p.eligibility === 'student' && !studentOk;
              return (
                <Card key={p.key} className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-2xl">{p.name}</h3>{p.seats > 1 && <Badge tone="accent">{p.seats} people</Badge>}{p.founding && <Badge tone="violet">Founding</Badge>}{p.eligibility === 'student' && <Badge tone="neutral">Students</Badge>}</div>
                  <p className="mt-1 font-display text-3xl">{money(p.pricePaise)}<span className="text-base text-fg-3"> / {p.intervalMonths === 12 ? 'year' : 'month'}</span></p>
                  <p className="mt-2 text-sm text-fg-2">{p.description}</p>
                  <ul className="mt-3 space-y-1 text-sm text-fg-2">{p.benefits.map((b) => <li key={b}>✓ {b}</li>)}</ul>
                  {p.remaining !== null && <p className="mt-2 text-xs text-fg-3">{p.remaining} of these left.</p>}
                  {!sub && !d.plus.active && (
                    <Button className="mt-auto self-start pt-0" disabled={!d.paymentsEnabled || soldOut || blocked} loading={start.isPending && start.variables === p.key} onClick={() => start.mutate(p.key)}>
                      {soldOut ? 'All taken' : blocked ? 'Verify you’re a student first' : `Choose ${p.name.replace('Nakshatra+ ', '')}`}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>

          <Card className="space-y-3">
            <h2 className="font-display text-2xl">Student price</h2>
            {d.student?.status === 'approved' ? <p className="text-sm text-success">Verified at {d.student.institution}{d.student.expiresAt ? ` until ${new Date(d.student.expiresAt).toLocaleDateString()}` : ''}.</p>
              : d.student?.status === 'pending' ? <p className="text-sm text-fg-2">Your request for {d.student.institution} is being reviewed.</p>
              : <>
                {d.student?.status === 'rejected' && <p className="text-sm text-warning">Your last request wasn’t approved{d.student.note ? `: ${d.student.note}` : '.'}</p>}
                <p className="text-sm text-fg-2">Your account’s verified email must be from your institution (for example name@college.ac.in). A person then reviews the request.</p>
                <Field label="Institution">{(id) => <Input id={id} value={institution} maxLength={120} onChange={(e) => setInstitution(e.target.value)} />}</Field>
                <Button size="sm" variant="secondary" disabled={institution.trim().length < 3} onClick={() => act(() => post('membership/student', { institution }), 'Request sent')}>Request student price</Button>
              </>}
          </Card>
          <p className="text-xs text-fg-3">{d.note}</p>
        </div>
      );
    }}</QueryState>
  );
}

export function MembershipPage() {
  return (
    <div>
      <PageHeader kicker="Membership" title="Nakshatra+" subtitle="Optional extras. Everything social stays free." />
      <MembershipPanel />
    </div>
  );
}

export function MembershipJoin() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const join = useMutation({ mutationFn: () => post('membership/duo/join', { token }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['membership'] }); nav('/membership'); } });
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <h1 className="font-display text-4xl">Join a Duo membership</h1>
      <p className="text-fg-2">Someone invited you to share their Nakshatra+ membership. You get the same benefits while their membership is active; they can’t see anything new about you.</p>
      {join.error && <Notice tone="danger">{join.error instanceof ApiError ? join.error.message : 'Could not join'}</Notice>}
      <div className="flex gap-2"><Button loading={join.isPending} onClick={() => join.mutate()}>Join</Button><ButtonLink to="/home" variant="ghost">Not now</ButtonLink></div>
    </div>
  );
}
