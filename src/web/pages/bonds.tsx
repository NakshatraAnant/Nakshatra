import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, patch, post } from '../lib/api';
import { civilDate, todayIso, cap } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Avatar, Badge, Button, Card, Checkbox, Field, Input, PageHeader, Select, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState, ErrorState } from '../components/ui/feedback';
import { ConfirmDialog, Dialog, Segmented, Tabs, useToast } from '../components/ui/overlays';
import { Meter } from '../components/ui/data';
import { PlaceSearch, type Place } from '../components/PlaceSearch';
import { BondsGraph2D } from '../charts/charts';
import { BOND_COLORS, layoutGraph, type GraphEdge, type GraphNode } from '../lib/graph';

import { CompatibilityBridges } from '../components/Bridges';
const BondsConstellation = lazy(() => import('../three/scenes').then((m) => ({ default: m.BondsConstellation })));

const KINDS = ['friend', 'romantic', 'dating', 'partner', 'spouse', 'sibling', 'parent_child', 'family', 'colleague', 'business', 'custom'] as const;
const KIND_LABEL: Record<string, string> = { parent_child: 'Parent & child', romantic: 'Romantic interest', dating: 'Dating match' };
const kindLabel = (k: string) => KIND_LABEL[k] ?? cap(k);

interface BondListItem { id: string; kind: string; customLabel: string | null; status: string; role: string; partner: { userId?: string; handle?: string; displayName: string; avatarUrl?: string | null; external?: boolean }; createdAt: string }
interface Invitation { id: string; bondId: string; kind?: string; message: string; requestedScope: string; inviter?: { displayName: string; handle: string }; expiresAt: string }

export function BondsPage() {
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const nav = useNavigate();
  const list = useQuery({ queryKey: ['bonds'], queryFn: () => get<{ bonds: BondListItem[]; invitations: Invitation[] }>('bonds') });
  const graph = useQuery({ queryKey: ['bonds-graph'], queryFn: () => get<{ nodes: GraphNode[]; edges: GraphEdge[] }>('bonds/graph') });
  const edges = useMemo(() => (graph.data?.edges ?? []).filter((e) => filter === 'all' || e.kind === filter), [graph.data, filter]);
  const positions = useMemo(() => (graph.data ? layoutGraph(graph.data.nodes, graph.data.edges, 2) : new Map()), [graph.data]);
  const selBond = list.data?.bonds.find((b) => b.id === selected);
  return (
    <div>
      <PageHeader kicker="Cosmic Bonds" title="Your constellation" subtitle="Relationships you choose to explore. Charts are compared only with consent, and either person can revoke access at any time."
        actions={<><Segmented label="View" value={view} onChange={setView} options={[{ value: '3d', label: '3D' }, { value: '2d', label: '2D' }]} /><Button icon="plus" onClick={() => setCreating(true)}>New Bond</Button></>} />
      <QueryState q={list}>{(d) => (
        <>
          {d.invitations.length > 0 && (
            <section className="mb-6" aria-label="Invitations">
              <h2 className="mb-3 font-display text-2xl">Invitations</h2>
              <ul className="grid gap-3 md:grid-cols-2">{d.invitations.map((i) => <InvitationCard key={i.id} inv={i} />)}</ul>
            </section>
          )}
          {!d.bonds.length ? <EmptyState icon="bonds" title="No Bonds yet" body="Invite a friend, partner or family member to compare charts — or create a private Bond with details they’ve shared with you." action={<Button onClick={() => setCreating(true)}>Create your first Bond</Button>} /> : (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by relationship type">
                  {['all', ...new Set(d.bonds.map((b) => b.kind))].map((k) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cx('rounded-full border px-3 py-1 text-xs', filter === k ? 'border-accent bg-accent/10 text-fg' : 'border-line text-fg-3')}><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: BOND_COLORS[k] ?? 'var(--accent)' }} />{k === 'all' ? 'All' : kindLabel(k)}</button>)}
                </div>
                <div className="relative h-[440px] overflow-hidden rounded-[var(--radius-xl)] border border-line bg-canvas-deep">
                  {graph.data && (view === '3d'
                    ? <Suspense fallback={null}><BondsConstellation nodes={graph.data.nodes} edges={edges} selected={selected} onSelect={setSelected} fallback={<BondsGraph2D nodes={graph.data.nodes} edges={edges} positions={positions} selected={selected} onSelect={setSelected} colors={BOND_COLORS} />} /></Suspense>
                    : <BondsGraph2D nodes={graph.data.nodes} edges={edges} positions={positions} selected={selected} onSelect={setSelected} colors={BOND_COLORS} />)}
                  {selBond && (
                    <div className="absolute bottom-4 left-4 right-4 card flex items-center justify-between gap-3 p-3 rise-in">
                      <div className="flex items-center gap-3"><Avatar name={selBond.partner.displayName} src={selBond.partner.avatarUrl} size={36} /><div><p className="text-fg">{selBond.partner.displayName}</p><p className="text-xs text-fg-3">{selBond.customLabel ?? kindLabel(selBond.kind)} · {selBond.status}</p></div></div>
                      <Button size="sm" onClick={() => nav(`/bonds/${selBond.id}`)}>Open</Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-fg-3">Only Bonds you are part of are shown, plus links between your partners when both chose to make that Bond visible to connections.</p>
              </div>
              <ul className="space-y-2" aria-label="Your Bonds">
                {d.bonds.map((b) => (
                  <li key={b.id}>
                    <Link to={`/bonds/${b.id}`} onMouseEnter={() => setSelected(b.id)} onFocus={() => setSelected(b.id)} className={cx('card flex items-center gap-3 p-3 transition-colors hover:border-line-strong', selected === b.id && 'border-accent')}>
                      <Avatar name={b.partner.displayName} src={b.partner.avatarUrl} size={40} />
                      <div className="min-w-0 flex-1"><p className="truncate text-fg">{b.partner.displayName}</p><p className="text-xs text-fg-3">{b.customLabel ?? kindLabel(b.kind)}</p></div>
                      <Badge tone={b.status === 'active' ? 'success' : b.status === 'pending' ? 'warning' : b.status === 'private' ? 'violet' : 'neutral'}>{b.status === 'private' ? 'Private' : cap(b.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}</QueryState>
      <CreateBondDialog open={creating} onClose={() => setCreating(false)} initialHandle={params.get('handle') ?? ''} />
    </div>
  );
}

function InvitationCard({ inv }: { inv: Invitation }) {
  const [scope, setScope] = useState<'chart' | 'big_three'>('chart');
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const m = useMutation({ mutationFn: (accept: boolean) => post<{ bondId?: string }>(`bonds/invitations/${inv.id}/respond`, { accept, shareScope: scope }), onSuccess: (r, accept) => { qc.invalidateQueries({ queryKey: ['bonds'] }); qc.invalidateQueries({ queryKey: ['bonds-graph'] }); toast(accept ? 'Bond accepted' : 'Invitation declined', 'success'); if (accept && r.bondId) nav(`/bonds/${r.bondId}`); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  return (
    <li className="card p-4">
      <p className="text-fg"><strong>{inv.inviter?.displayName}</strong> invited you to a {kindLabel(inv.kind ?? 'friend').toLowerCase()} Bond.</p>
      {inv.message && <p className="mt-1 text-sm italic text-fg-2">“{inv.message}”</p>}
      <p className="mt-2 text-xs text-fg-3">They asked to see your {inv.requestedScope === 'chart' ? 'chart placements (never your birth date, time or place)' : 'Sun, Moon and Rising'}.</p>
      <Field label="What will you share?" className="mt-3">{(id) => <Select id={id} value={scope} onChange={(e) => setScope(e.target.value as 'chart' | 'big_three')}><option value="chart">Chart placements (enables compatibility)</option><option value="big_three">Only Sun, Moon and Rising</option></Select>}</Field>
      <div className="mt-3 flex gap-2"><Button size="sm" loading={m.isPending} onClick={() => m.mutate(true)}>Accept</Button><Button size="sm" variant="ghost" onClick={() => m.mutate(false)}>Decline</Button></div>
    </li>
  );
}

function CreateBondDialog({ open, onClose, initialHandle }: { open: boolean; onClose: () => void; initialHandle: string }) {
  const [mode, setMode] = useState<'invite' | 'link' | 'private'>('invite');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('friend');
  const [customLabel, setCustomLabel] = useState('');
  const [handle, setHandle] = useState(initialHandle);
  const [message, setMessage] = useState('');
  const [shareScope, setShareScope] = useState<'chart' | 'big_three'>('chart');
  const [priv, setPriv] = useState({ label: '', date: '', time: '', unknown: false });
  const [place, setPlace] = useState<Place | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post<{ bond: { id: string }; inviteUrl?: string }>('bonds', mode === 'private'
      ? { kind, customLabel: customLabel || undefined, private: { label: priv.label, date: priv.date, time: priv.unknown ? null : priv.time, timePrecision: priv.unknown ? 'unknown' : 'exact', placeId: place?.id, consentConfirmed: consent } }
      : { kind, customLabel: customLabel || undefined, invite: mode === 'invite' ? { handle, message, shareScope, requestScope: shareScope } : { createLink: true, message, shareScope, requestScope: shareScope } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['bonds'] });
      qc.invalidateQueries({ queryKey: ['bonds-graph'] });
      if (mode === 'link' && r.inviteUrl) setLink(r.inviteUrl);
      else { toast(mode === 'private' ? 'Private Bond created' : 'Invitation sent', 'success'); onClose(); nav(`/bonds/${r.bond.id}`); }
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not create the Bond.'),
  });
  return (
    <Dialog open={open} onClose={onClose} title="New Bond" size="lg" footer={link ? <Button onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => { setError(null); m.mutate(); }}>{mode === 'private' ? 'Create private Bond' : mode === 'link' ? 'Create invite link' : 'Send invitation'}</Button></>}>
      {link ? (
        <div className="space-y-3"><Notice tone="success">Share this link with the person you want to Bond with. It works once and expires in 14 days.</Notice><Input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" /><Button variant="secondary" icon="copy" onClick={async () => { await navigator.clipboard.writeText(link); toast('Copied', 'success'); }}>Copy link</Button></div>
      ) : (
        <div className="space-y-5">
          {error && <Notice tone="danger">{error}</Notice>}
          <Segmented label="How" value={mode} onChange={setMode} options={[{ value: 'invite', label: 'Invite by handle' }, { value: 'link', label: 'Invite link' }, { value: 'private', label: 'Private Bond' }]} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Relationship">{(id) => <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>{KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</Select>}</Field>
            <Field label="Custom label (optional)">{(id) => <Input id={id} maxLength={40} value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. College roommate" />}</Field>
          </div>
          {mode !== 'private' ? (<>
            {mode === 'invite' && <Field label="Their Nakshatra handle">{(id) => <Input id={id} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" />}</Field>}
            <Field label="Message (optional)">{(id) => <Textarea id={id} rows={2} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
            <Field label="What you’ll share once they accept">{(id) => <Select id={id} value={shareScope} onChange={(e) => setShareScope(e.target.value as 'chart' | 'big_three')}><option value="chart">Chart placements (no birth date, time or place)</option><option value="big_three">Only Sun, Moon and Rising</option></Select>}</Field>
          </>) : (<>
            <Notice tone="info">A private Bond uses details the other person shared with you. It is visible only to you and never linked to their account.</Notice>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Their name">{(id) => <Input id={id} value={priv.label} onChange={(e) => setPriv({ ...priv, label: e.target.value })} />}</Field>
              <Field label="Birth date">{(id) => <Input id={id} type="date" value={priv.date} onChange={(e) => setPriv({ ...priv, date: e.target.value })} />}</Field>
              <Field label="Birth time">{(id) => <Input id={id} type="time" disabled={priv.unknown} value={priv.time} onChange={(e) => setPriv({ ...priv, time: e.target.value })} />}</Field>
              <div className="self-end pb-2"><Checkbox checked={priv.unknown} onChange={(v) => setPriv({ ...priv, unknown: v })} label="Time unknown" /></div>
              <Field label="Birthplace" className="sm:col-span-2">{(id) => <PlaceSearch id={id} value={place} onChange={setPlace} />}</Field>
            </div>
            <Checkbox checked={consent} onChange={setConsent} label="They have given me permission to use their birth details here." />
          </>)}
        </div>
      )}
    </Dialog>
  );
}

interface Dim { key: string; label: string; description: string; score: number; factors: { text: string; weight: number }[]; missingData: string[] }
interface Guna { total: number; max: number; band: { label: string; range: string }; kootas: { key: string; name: string; max: number; score: number; detail: string; meaning: string }[]; doshas: { key: string; present: boolean; detail: string }[]; caveats: string[] }
interface CompatResp { compatibilityId: string; result: { relationship: string; western: Dim[]; elementNote: string; vedic: { available: boolean; reason?: string; gunaMilan?: Guna; gunaMilanReverse?: Guna; rolesAssigned: boolean; manglik?: { a: boolean; b: boolean; summary: string } }; methodology: string[]; limitations: string[] }; conversationPrompts: string[]; composite: { placements: { id: string; name: string; signName: string; dms: string }[] } }
interface BondResp {
  bond: { id: string; kind: string; customLabel: string | null; status: string; role: string; visibility: string; gunaRoles: string; partnerLabel: string; isPrivate: boolean; createdAt: string };
  access: { partnerSharedScope: string; youShareScope: string };
  comparison: { me: Big | null; partner: Big | null };
  notes: { id: string; body: string; createdAt: string }[];
  milestones: { id: string; title: string; eventDate: string }[];
  conversationPrompts: string[];
}
interface Big { western: { sun: string; moon: string; rising: string | null }; vedic: { rashi: string; lagna: string | null; nakshatra: string; pada: number } }

export function BondDetail() {
  const { id } = useParams();
  const { dateLocale } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'compatibility' | 'together' | 'access'>('compatibility');
  const q = useQuery({ queryKey: ['bond', id], queryFn: () => get<BondResp>(`bonds/${id}`) });
  const canCompat = q.data && (q.data.access.partnerSharedScope === 'chart' || q.data.access.partnerSharedScope === 'birth_details');
  const compat = useQuery({ queryKey: ['bond-compat', id], queryFn: () => get<CompatResp>(`bonds/${id}/compatibility`), enabled: Boolean(canCompat) });
  const [confirm, setConfirm] = useState<'revoke' | 'delete' | null>(null);
  const action = useMutation({
    mutationFn: (a: 'revoke' | 'delete') => (a === 'revoke' ? post(`bonds/${id}/revoke`) : del(`bonds/${id}`)),
    onSuccess: (_r, a) => { qc.invalidateQueries({ queryKey: ['bonds'] }); qc.invalidateQueries({ queryKey: ['bonds-graph'] }); toast(a === 'revoke' ? 'Access revoked' : 'Bond deleted', 'success'); nav('/bonds'); },
  });
  return (
    <QueryState q={q}>{(d) => (
      <div>
        <PageHeader kicker={`${d.bond.customLabel ?? kindLabel(d.bond.kind)} Bond`} title={<>You & <em className="text-accent">{d.bond.partnerLabel}</em></>}
          subtitle={d.bond.isPrivate ? 'Private Bond — visible only to you.' : d.bond.status === 'pending' ? 'Waiting for them to accept your invitation.' : 'A mutual Bond. Either of you can change what you share or revoke access at any time.'}
          actions={<><Button variant="ghost" onClick={() => setConfirm('revoke')}>Revoke access</Button>{d.bond.role === 'owner' && <Button variant="danger" icon="trash" onClick={() => setConfirm('delete')}>Delete</Button>}</>} />
        {d.comparison.me && d.comparison.partner && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {[['You', d.comparison.me], [d.bond.partnerLabel, d.comparison.partner]].map(([n, b]) => (
              <Card key={n as string}><p className="eyebrow">{n as string}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-fg-3">Sun</dt><dd className="text-fg">{(b as Big).western.sun}</dd></div><div><dt className="text-fg-3">Moon</dt><dd className="text-fg">{(b as Big).western.moon}</dd></div><div><dt className="text-fg-3">Rising</dt><dd className="text-fg">{(b as Big).western.rising ?? '—'}</dd></div><div><dt className="text-fg-3">Rashi</dt><dd className="text-fg">{(b as Big).vedic.rashi}</dd></div><div><dt className="text-fg-3">Lagna</dt><dd className="text-fg">{(b as Big).vedic.lagna ?? '—'}</dd></div><div><dt className="text-fg-3">Nakshatra</dt><dd className="text-fg">{(b as Big).vedic.nakshatra}</dd></div></dl>
              </Card>
            ))}
          </div>
        )}
        <Tabs tabs={[{ value: 'compatibility', label: 'Compatibility' }, { value: 'together', label: 'Notes & milestones' }, { value: 'access', label: 'Sharing & privacy' }]} value={tab} onChange={setTab} className="mb-6" />
        {tab === 'compatibility' && (!canCompat
          ? <Notice tone="info">{d.bond.status === 'pending' ? 'Compatibility appears once they accept and share their chart.' : d.access.partnerSharedScope === 'big_three' ? 'They have shared only their Sun, Moon and Rising. Full compatibility needs chart sharing.' : 'Compatibility needs both people to share their charts.'}</Notice>
          : <QueryState q={compat}>{(c) => <Compatibility c={c} bond={d} />}</QueryState>)}
        {tab === 'together' && <Together d={d} />}
        {tab === 'access' && <Access d={d} />}
        <ConfirmDialog open={confirm !== null} onClose={() => setConfirm(null)} danger loading={action.isPending} onConfirm={() => action.mutate(confirm!)}
          title={confirm === 'delete' ? 'Delete this Bond?' : 'Revoke access?'} confirmLabel={confirm === 'delete' ? 'Delete Bond' : 'Revoke'}
          body={confirm === 'delete' ? 'This removes the Bond, its compatibility results and any private birth details you entered. Shared report links stop working.' : 'Chart sharing in both directions ends immediately, and any shared report links stop working. Your private notes remain until you delete the Bond.'} />
        <p className="mt-6 text-xs text-fg-3">Created {civilDate(d.bond.createdAt.slice(0, 10), dateLocale)}</p>
      </div>
    )}</QueryState>
  );
}

function GunaCard({ g, title }: { g: Guna; title: string }) {
  return (
    <Card>
      <div className="flex items-end justify-between"><div><p className="eyebrow">{title}</p><p className="font-display text-5xl numeric">{g.total}<span className="text-2xl text-fg-3">/36</span></p></div><Badge tone="accent">{g.band.label}</Badge></div>
      <table className="mt-4 w-full text-sm"><tbody className="divide-y divide-[var(--line)]">{g.kootas.map((k) => <tr key={k.key}><td className="py-2"><p className="text-fg">{k.name}</p><p className="text-xs text-fg-3">{k.detail}</p></td><td className="py-2 text-right text-fg numeric">{k.score}/{k.max}</td></tr>)}</tbody></table>
      {g.doshas.filter((x) => x.present).map((x) => <Notice key={x.key} tone="warning" className="mt-3">{x.detail} Traditions list exceptions; this is not a verdict.</Notice>)}
      <ul className="mt-3 space-y-1 text-xs text-fg-3">{g.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
    </Card>
  );
}

function Compatibility({ c, bond }: { c: CompatResp; bond: BondResp }) {
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const r = c.result;
  return (
    <div className="space-y-6">
      <Notice tone="info">{r.limitations[0]} {r.limitations[2]}</Notice>
      <CompatibilityBridges partner={bond.bond.partnerLabel} dims={r.western.map((d) => ({ key: d.key, label: d.label, score: d.score, factors: d.factors }))} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <h2 className="font-display text-2xl">Dimensions</h2>
          <p className="text-sm text-fg-2">Shown separately on purpose — no single score could honestly summarise a relationship.</p>
          {r.western.map((dim) => (
            <details key={dim.key} className="card p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-3"><h3 className="text-[15px] font-semibold text-fg">{dim.label}</h3><span className="text-xs text-fg-3">details ▾</span></div>
                <div className="mt-2"><Meter value={dim.score} label={dim.label} /></div>
              </summary>
              <p className="mt-3 text-sm text-fg-2">{dim.description}</p>
              <ul className="mt-2 space-y-1 text-xs">{dim.factors.map((f) => <li key={f.text} className={f.weight > 0 ? 'text-success' : f.weight < 0 ? 'text-danger' : 'text-fg-3'}>{f.weight > 0 ? '+' : f.weight < 0 ? '−' : '·'} {f.text}</li>)}</ul>
              {dim.missingData.length > 0 && <p className="mt-2 text-xs text-fg-3">Missing: {dim.missingData.join('; ')}</p>}
            </details>
          ))}
          <p className="text-sm text-fg-2">{r.elementNote}</p>
        </div>
        <div className="space-y-4">
          {r.vedic.available && r.vedic.gunaMilan ? (<>
            <GunaCard g={r.vedic.gunaMilan} title={r.vedic.rolesAssigned ? 'Guna Milan (traditional roles)' : 'Guna Milan (you in the groom role)'} />
            {r.vedic.gunaMilanReverse && <details className="text-sm text-fg-2"><summary className="cursor-pointer">Reverse orientation: {r.vedic.gunaMilanReverse.total}/36</summary><p className="mt-1 text-xs text-fg-3">Ashtakoota is traditionally asymmetric. Set roles in Sharing & privacy if they apply to you.</p></details>}
            {r.vedic.manglik && <Notice tone="info" title="Manglik">{r.vedic.manglik.summary}</Notice>}
          </>) : <Notice tone="info">{r.vedic.reason}</Notice>}
          <Card><h3 className="font-display text-2xl">Conversation starters</h3><ul className="mt-2 space-y-2 text-sm text-fg-2">{c.conversationPrompts.concat(bond.conversationPrompts).slice(0, 5).map((p) => <li key={p}>“{p}”</li>)}</ul></Card>
          <Card><h3 className="font-display text-2xl">Composite chart</h3><p className="text-xs text-fg-3">Midpoints of your placements.</p><ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-fg-2">{c.composite.placements.slice(0, 10).map((p) => <li key={p.id}>{p.name}: {p.signName}</li>)}</ul></Card>
          <Button variant="secondary" icon="share" onClick={() => setShareOpen(true)}>Share a summary</Button>
        </div>
      </div>
      <details className="text-xs text-fg-3"><summary className="cursor-pointer">Methodology</summary><ul className="mt-2 space-y-1">{r.methodology.map((m) => <li key={m}>{m}</li>)}{r.limitations.map((m) => <li key={m}>{m}</li>)}</ul></details>
      <ShareReportDialog open={shareOpen} onClose={() => setShareOpen(false)} bondId={bond.bond.id} compatibilityId={c.compatibilityId} onShared={() => toast('Shared', 'success')} />
    </div>
  );
}

function ShareReportDialog({ open, onClose, bondId, compatibilityId, onShared }: { open: boolean; onClose: () => void; bondId: string; compatibilityId: string; onShared: () => void }) {
  const [mode, setMode] = useState<'link' | 'user'>('link');
  const [handle, setHandle] = useState('');
  const [detail, setDetail] = useState<'summary' | 'full'>('summary');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => post<{ url?: string }>(`bonds/${bondId}/share-report`, { compatibilityId, to: mode === 'link' ? { link: true } : { handle }, detail }), onSuccess: (r) => { if (r.url) setUrl(r.url); else { onShared(); onClose(); } }, onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed') });
  return (
    <Dialog open={open} onClose={onClose} title="Share a compatibility summary" size="sm" footer={!url && <Button loading={m.isPending} onClick={() => m.mutate()}>Share</Button>}>
      {url ? <div className="space-y-3"><Notice tone="success">Anyone with this link can see dimension scores and the Guna Milan total — no placements or birth details. Revoking the Bond disables it.</Notice><Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Share link" /></div> : (
        <div className="space-y-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Segmented label="Share with" value={mode} onChange={setMode} options={[{ value: 'link', label: 'Link' }, { value: 'user', label: 'A connection' }]} />
          {mode === 'user' && (<><Field label="Their handle">{(id) => <Input id={id} value={handle} onChange={(e) => setHandle(e.target.value)} />}</Field><Field label="Detail">{(id) => <Select id={id} value={detail} onChange={(e) => setDetail(e.target.value as 'summary' | 'full')}><option value="summary">Summary (scores only)</option><option value="full">Full (scores and contributing factors)</option></Select>}</Field></>)}
        </div>
      )}
    </Dialog>
  );
}

function Together({ d }: { d: BondResp }) {
  const { dateLocale } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [ms, setMs] = useState({ title: '', eventDate: todayIso() });
  const addNote = useMutation({ mutationFn: () => post(`bonds/${d.bond.id}/notes`, { body: note }), onSuccess: () => { setNote(''); qc.invalidateQueries({ queryKey: ['bond', d.bond.id] }); } });
  const delNote = useMutation({ mutationFn: (nid: string) => del(`bonds/${d.bond.id}/notes/${nid}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['bond', d.bond.id] }) });
  const addMs = useMutation({ mutationFn: () => post(`bonds/${d.bond.id}/milestones`, ms), onSuccess: () => { setMs({ ...ms, title: '' }); qc.invalidateQueries({ queryKey: ['bond', d.bond.id] }); } });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-display text-2xl">Private notes</h2>
        <p className="text-xs text-fg-3">Only you can see these.</p>
        <Textarea className="mt-3" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-label="New note" />
        <Button size="sm" className="mt-2" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Add note</Button>
        <ul className="mt-4 space-y-2">{d.notes.map((n) => <li key={n.id} className="flex justify-between gap-3 rounded-[var(--radius-sm)] border border-line p-3 text-sm"><span className="whitespace-pre-line text-fg-2">{n.body}</span><Button size="sm" variant="ghost" icon="trash" aria-label="Delete note" onClick={() => delNote.mutate(n.id)} /></li>)}</ul>
      </Card>
      <Card>
        <h2 className="font-display text-2xl">Shared milestones</h2>
        <p className="text-xs text-fg-3">{d.bond.isPrivate ? 'Visible only to you.' : 'Visible to both of you.'}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><Input aria-label="Milestone" placeholder="First trip together" value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} /><Input aria-label="Date" type="date" value={ms.eventDate} onChange={(e) => setMs({ ...ms, eventDate: e.target.value })} /></div>
        <Button size="sm" className="mt-2" disabled={!ms.title.trim()} loading={addMs.isPending} onClick={() => addMs.mutate()}>Add milestone</Button>
        <ul className="mt-4 space-y-2">{d.milestones.map((m) => <li key={m.id} className="flex justify-between text-sm"><span className="text-fg">{m.title}</span><span className="text-fg-3 numeric">{civilDate(m.eventDate, dateLocale)}</span></li>)}</ul>
      </Card>
    </div>
  );
}

function Access({ d }: { d: BondResp }) {
  const qc = useQueryClient();
  const toast = useToast();
  const share = useMutation({ mutationFn: (scope: string) => post(`bonds/${d.bond.id}/sharing`, { scope }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bond', d.bond.id] }); qc.invalidateQueries({ queryKey: ['bond-compat', d.bond.id] }); toast('Sharing updated', 'success'); } });
  const upd = useMutation({ mutationFn: (body: Record<string, string>) => patch(`bonds/${d.bond.id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bond', d.bond.id] }); qc.invalidateQueries({ queryKey: ['bond-compat', d.bond.id] }); toast('Saved', 'success'); } });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {!d.bond.isPrivate && (
        <Card>
          <h2 className="font-display text-2xl">What you share</h2>
          <p className="mt-1 text-sm text-fg-2">They currently see: <strong className="text-fg">{d.access.youShareScope === 'none' ? 'nothing' : d.access.youShareScope === 'chart' ? 'your chart placements' : 'your Sun, Moon and Rising'}</strong>. Your birth date, time and place are never shared.</p>
          <Field label="Change" className="mt-3">{(id) => <Select id={id} value={d.access.youShareScope} onChange={(e) => share.mutate(e.target.value)}><option value="chart">Chart placements</option><option value="big_three">Only Sun, Moon and Rising</option><option value="none">Nothing</option></Select>}</Field>
          <p className="mt-4 text-sm text-fg-2">They share with you: <strong className="text-fg">{d.access.partnerSharedScope === 'none' ? 'nothing' : d.access.partnerSharedScope === 'chart' ? 'chart placements' : 'Sun, Moon and Rising'}</strong>.</p>
        </Card>
      )}
      <Card>
        <h2 className="font-display text-2xl">Guna Milan roles</h2>
        <p className="mt-1 text-sm text-fg-2">Ashtakoota assigns groom and bride roles. Set them only if they apply to you; otherwise both orientations are shown.</p>
        <Field label="Roles" className="mt-3">{(id) => <Select id={id} value={d.bond.gunaRoles} onChange={(e) => upd.mutate({ gunaRoles: e.target.value })}><option value="none">Not applicable — show both</option><option value="owner_groom">{d.bond.role === 'owner' ? 'I am' : 'They are'} in the groom role</option><option value="owner_bride">{d.bond.role === 'owner' ? 'I am' : 'They are'} in the bride role</option></Select>}</Field>
        {!d.bond.isPrivate && <Field label="Show this Bond on your connections’ constellations" className="mt-4">{(id) => <Select id={id} value={d.bond.visibility} onChange={(e) => upd.mutate({ visibility: e.target.value })}><option value="private">No — keep it private</option><option value="connections">Yes — connections who know us both</option></Select>}</Field>}
      </Card>
    </div>
  );
}

export function AcceptInvite() {
  const { token } = useParams();
  const [scope, setScope] = useState<'chart' | 'big_three'>('chart');
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invite', token], queryFn: () => get<{ invitation: Invitation }>(`bonds/invitations/by-token/${token}`), retry: false });
  const m = useMutation({ mutationFn: (accept: boolean) => post<{ bondId?: string }>(`bonds/invitations/${q.data!.invitation.id}/respond`, { accept, shareScope: scope, token }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['bonds'] }); nav(r.bondId ? `/bonds/${r.bondId}` : '/bonds'); } });
  if (q.error) return <ErrorState error={q.error} title="This invitation can’t be used" />;
  return (
    <QueryState q={q}>{({ invitation: i }) => (
      <Card className="mx-auto max-w-lg">
        <h1 className="font-display text-3xl">{i.inviter?.displayName} invited you to a Bond</h1>
        {i.message && <p className="mt-2 italic text-fg-2">“{i.message}”</p>}
        <Field label="What will you share?" className="mt-4">{(id) => <Select id={id} value={scope} onChange={(e) => setScope(e.target.value as 'chart' | 'big_three')}><option value="chart">Chart placements (no birth date, time or place)</option><option value="big_three">Only Sun, Moon and Rising</option></Select>}</Field>
        {m.error && <Notice tone="danger" className="mt-3">{(m.error as Error).message}</Notice>}
        <div className="mt-5 flex gap-2"><Button loading={m.isPending} onClick={() => m.mutate(true)}>Accept</Button><Button variant="ghost" onClick={() => m.mutate(false)}>Decline</Button></div>
      </Card>
    )}</QueryState>
  );
}

interface SharedReportData { relationship: string; dimensions: { label: string; score: number; factors?: { text: string; weight: number }[] }[]; gunaMilan: { total: number; band: { label: string } } | null; limitations: string[] }

function ReportBody({ r }: { r: SharedReportData }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <p className="eyebrow">Shared compatibility summary · {kindLabel(r.relationship)}</p>
      <div className="mt-4 space-y-4">{r.dimensions.map((d) => <div key={d.label}><p className="mb-1 text-sm text-fg">{d.label}</p><Meter value={d.score} label={d.label} />{d.factors && <ul className="mt-1 text-xs text-fg-3">{d.factors.map((f) => <li key={f.text}>{f.text}</li>)}</ul>}</div>)}</div>
      {r.gunaMilan && <p className="mt-5 text-fg">Guna Milan: <strong className="numeric">{r.gunaMilan.total}/36</strong> — {r.gunaMilan.band.label}</p>}
      <ul className="mt-5 space-y-1 text-xs text-fg-3">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
    </Card>
  );
}

export function SharedReport() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['shared-report', id], queryFn: () => get<{ report: SharedReportData }>(`shared-reports/${id}`) });
  return <QueryState q={q}>{(d) => <ReportBody r={d.report} />}</QueryState>;
}

export function SharedReportLink() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ['shared-report-link', token], queryFn: () => get<{ report: SharedReportData }>(`shared-reports/link/${token}`), retry: false });
  return <div className="py-10"><QueryState q={q}>{(d) => <><ReportBody r={d.report} /><p className="mt-6 text-center text-sm"><Link to="/signup" className="text-accent hover:underline">Create your own Cosmic ID →</Link></p></>}</QueryState></div>;
}

