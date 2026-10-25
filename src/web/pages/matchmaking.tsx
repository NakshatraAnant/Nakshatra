import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, patch, post, put } from '../lib/api';
import { cap } from '../lib/format';
import { useMe } from '../lib/session';
import { Avatar, Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Switch, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState, ErrorState } from '../components/ui/feedback';
import { Dialog, Tabs, useToast } from '../components/ui/overlays';
import { PlaceSearch, type Place } from '../components/PlaceSearch';
import { ReportDialog } from './identity';

// Server profile rows are edited as loosely-typed form state; values are validated by the API schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormValues = Record<string, any>;

interface MmCard { userId: string; displayName?: string; avatarUrl?: string | null; age: number | null; city: string; about: string; education: string; profession: string; values: string[]; interests: string[]; cultural: Record<string, unknown>; willingToRelocate: boolean; verified: boolean; rashi: string | null; nakshatra: string | null; connection: { id: string; status: string; stage: string; direction: string } | null }
const STAGES = ['connected', 'talking', 'families_introduced', 'engaged', 'married', 'closed'];
const PERMS: [string, string][] = [['view_profile', 'See my matchmaking profile'], ['view_shortlist', 'See my shortlist'], ['view_shared_reports', 'See compatibility summaries I share'], ['suggest_profiles', 'Suggest profiles to me']];

function ProfileCard({ c, onShortlist, onConnect, onReport }: { c: MmCard; onShortlist?: () => void; onConnect?: () => void; onReport?: () => void }) {
  return (
    <article className="card p-5">
      <div className="flex items-start gap-3">
        <Avatar name={c.displayName} src={c.avatarUrl} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-2xl">{c.displayName}{c.age ? `, ${c.age}` : ''}</h3>{c.verified && <Badge tone="success">Verified</Badge>}</div>
          <p className="text-sm text-fg-3">{c.profession}{c.education ? ` · ${c.education}` : ''} · {c.city}{c.willingToRelocate ? ' · open to relocating' : ''}</p>
        </div>
      </div>
      {c.about && <p className="mt-3 text-sm leading-relaxed text-fg-2">{c.about}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">{c.values.map((v) => <Badge key={v} tone="accent">{v}</Badge>)}{c.interests.map((v) => <Badge key={v}>{v}</Badge>)}</div>
      {(c.rashi || c.nakshatra) && <p className="mt-3 text-xs text-fg-3">{c.rashi} Rashi · {c.nakshatra} nakshatra</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {c.connection ? <Badge tone="violet">{c.connection.status === 'pending' ? (c.connection.direction === 'outgoing' ? 'Request sent' : 'Wants to connect') : cap(c.connection.stage)}</Badge> : onConnect && <Button size="sm" onClick={onConnect}>Request to connect</Button>}
        {onShortlist && <Button size="sm" variant="secondary" icon="bookmark" onClick={onShortlist}>Shortlist</Button>}
        {onReport && <Button size="sm" variant="ghost" onClick={onReport}>Report</Button>}
      </div>
    </article>
  );
}

export function MatchmakingHome() {
  const me = useMe().data?.user;
  const profile = useQuery({ queryKey: ['mm-profile'], queryFn: () => get<{ profile: Record<string, unknown> | null }>('matchmaking/profile') });
  const [tab, setTab] = useState<'discover' | 'shortlist' | 'connections' | 'suggestions'>('discover');
  if (!me?.emailVerified) return <div className="mx-auto max-w-xl"><PageHeader title="Marriage matchmaking" /><Notice tone="info">Verify your email to use matchmaking.</Notice></div>;
  return (
    <div>
      <PageHeader kicker="Matchmaking · 18+" title="For a serious relationship" subtitle="Values, life plans and — if you want it — Kundli matching. You decide when, and whether, to involve family."
        actions={<><ButtonLink to="/matchmaking/family" variant="secondary" icon="users">Family Bridge</ButtonLink><ButtonLink to="/matchmaking/profile" variant="secondary" icon="edit">Profile</ButtonLink></>} />
      <QueryState q={profile}>{(p) => !p.profile ? <EmptyState icon="rings" title="Create your matchmaking profile" body="It’s separate from dating and from your public Cosmic ID." action={<ButtonLink to="/matchmaking/profile">Get started</ButtonLink>} /> : (
        <>
          <Tabs tabs={[{ value: 'discover', label: 'Discover' }, { value: 'shortlist', label: 'Shortlist' }, { value: 'connections', label: 'Connections' }, { value: 'suggestions', label: 'Family suggestions' }]} value={tab} onChange={setTab} className="mb-6" />
          {tab === 'discover' && <Discover />}
          {tab === 'shortlist' && <Shortlist />}
          {tab === 'connections' && <Connections />}
          {tab === 'suggestions' && <Suggestions />}
        </>
      )}</QueryState>
    </div>
  );
}

function Discover() {
  const [kundli, setKundli] = useState(false);
  const [maxKm, setMaxKm] = useState(500);
  const [connectTo, setConnectTo] = useState<MmCard | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mm-discover', kundli, maxKm], queryFn: () => get<{ results: { card: MmCard; guna: number | null; sharedValues: number; distanceKm: number }[]; note: string }>(`matchmaking/discover?maxKm=${maxKm}${kundli ? '&kundli=true' : ''}`) });
  const shortlist = useMutation({ mutationFn: (id: string) => post('matchmaking/shortlist', { targetId: id }), onSuccess: () => { toast('Added to shortlist', 'success'); qc.invalidateQueries({ queryKey: ['mm-shortlist'] }); } });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Switch label="Show Guna Milan" checked={kundli} onChange={setKundli} />
        <Field label="Within (km)">{(id) => <Input id={id} type="number" className="w-28" value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} />}</Field>
      </div>
      <QueryState q={q} empty={(d) => (!d.results.length ? <EmptyState icon="rings" title="No profiles match yet" body="Try widening your distance or age range." /> : null)}>{(d) => (
        <>
          <p className="mb-3 text-xs text-fg-3">{d.note} Order: shared values{kundli ? ', then Guna Milan' : ''}, then distance.</p>
          <ul className="grid gap-4 lg:grid-cols-2">{d.results.map((r) => (
            <li key={r.card.userId}>
              <ProfileCard c={r.card} onShortlist={() => shortlist.mutate(r.card.userId)} onConnect={() => setConnectTo(r.card)} onReport={() => setReport(r.card.userId)} />
              {r.guna !== null && <p className="mt-1 px-2 text-xs text-fg-3">Guna Milan {r.guna}/36 (traditional framework; not a predictor).</p>}
            </li>
          ))}</ul>
        </>
      )}</QueryState>
      <ConnectDialog target={connectTo} onClose={() => setConnectTo(null)} />
      <ReportDialog open={Boolean(report)} onClose={() => setReport(null)} targetType="matchmaking_profile" targetId={report ?? ''} />
    </div>
  );
}

function ConnectDialog({ target, onClose }: { target: MmCard | null; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [share, setShare] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({ mutationFn: () => post('matchmaking/connect', { targetId: target!.userId, message, shareChart: share }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['mm-discover'] }); qc.invalidateQueries({ queryKey: ['mm-connections'] }); toast('Request sent', 'success'); onClose(); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  return (
    <Dialog open={Boolean(target)} onClose={onClose} title={`Connect with ${target?.displayName}`} footer={<Button loading={m.isPending} onClick={() => m.mutate()}>Send request</Button>}>
      <Field label="A short note">{(id) => <Textarea id={id} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Namaste — I liked what you wrote about…" />}</Field>
      <div className="mt-4"><Checkbox checked={share} onChange={setShare} label="Share my chart placements with them" description="Lets you both view Kundli matching once they also choose to share. Never includes your birth date, time or place." /></div>
    </Dialog>
  );
}

function Shortlist() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mm-shortlist'], queryFn: () => get<{ shortlist: { note: string; card: MmCard }[] }>('matchmaking/shortlist') });
  const remove = useMutation({ mutationFn: (id: string) => post('matchmaking/shortlist', { targetId: id, remove: true }), onSuccess: () => qc.invalidateQueries({ queryKey: ['mm-shortlist'] }) });
  return <QueryState q={q} empty={(d) => (!d.shortlist.length ? <EmptyState icon="bookmark" title="Your shortlist is empty" /> : null)}>{(d) => <ul className="grid gap-4 lg:grid-cols-2">{d.shortlist.map((s) => <li key={s.card.userId}><ProfileCard c={s.card} /><Button size="sm" variant="ghost" className="mt-1" onClick={() => remove.mutate(s.card.userId)}>Remove</Button></li>)}</ul>}</QueryState>;
}

function Connections() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['mm-connections'], queryFn: () => get<{ connections: { id: string; status: string; stage: string; message: string; direction: string; conversationId: string | null; card: MmCard }[] }>('matchmaking/connections') });
  const respond = useMutation({ mutationFn: ({ id, accept, shareChart }: { id: string; accept: boolean; shareChart: boolean }) => post<{ conversationId?: string }>(`matchmaking/connections/${id}/respond`, { accept, shareChart }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['mm-connections'] }); if (r.conversationId) nav(`/messages/${r.conversationId}`); } });
  return (
    <QueryState q={q} empty={(d) => (!d.connections.length ? <EmptyState icon="users" title="No connections yet" /> : null)}>{(d) => (
      <ul className="space-y-3">{d.connections.map((c) => (
        <li key={c.id} className="card flex flex-wrap items-center gap-3 p-4">
          <Avatar name={c.card.displayName} src={c.card.avatarUrl} size={44} />
          <div className="min-w-0 flex-1"><p className="text-fg">{c.card.displayName}</p><p className="text-xs text-fg-3">{c.direction === 'incoming' ? 'Wants to connect' : 'You requested'} · {c.status === 'accepted' ? cap(c.stage) : c.status}</p>{c.message && <p className="mt-1 text-sm italic text-fg-2">“{c.message}”</p>}</div>
          {c.status === 'pending' && c.direction === 'incoming' && <><Button size="sm" onClick={() => respond.mutate({ id: c.id, accept: true, shareChart: false })}>Accept</Button><Button size="sm" variant="ghost" onClick={() => respond.mutate({ id: c.id, accept: false, shareChart: false })}>Decline</Button></>}
          {c.status === 'accepted' && <ButtonLink to={`/matchmaking/connections/${c.id}`} size="sm" variant="secondary">Open</ButtonLink>}
        </li>
      ))}</ul>
    )}</QueryState>
  );
}

function Suggestions() {
  const q = useQuery({ queryKey: ['family-suggestions'], queryFn: () => get<{ suggestions: { id: string; note: string; card: MmCard }[] }>('family/suggestions') });
  return <QueryState q={q} empty={(d) => (!d.suggestions.length ? <EmptyState icon="users" title="No suggestions from family" body="Family members you invite with the “suggest profiles” permission can recommend people here." /> : null)}>{(d) => <ul className="grid gap-4 lg:grid-cols-2">{d.suggestions.map((s) => <li key={s.id}><ProfileCard c={s.card} />{s.note && <p className="mt-1 px-2 text-xs text-fg-3">Note: {s.note}</p>}</li>)}</ul>}</QueryState>;
}

export function ConnectionDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const conns = useQuery({ queryKey: ['mm-connections'], queryFn: () => get<{ connections: { id: string; status: string; stage: string; conversationId: string | null; card: MmCard }[] }>('matchmaking/connections') });
  const kundli = useQuery({ queryKey: ['kundli', id], queryFn: () => get<{ compatibilityId: string; result: { vedic: { gunaMilan?: { total: number; band: { label: string }; kootas: { name: string; score: number; max: number; detail: string }[]; caveats: string[] } } ; western: { label: string; score: number }[]; limitations: string[] }; manglik: { groom: { present: boolean }; bride: { present: boolean } }; roles: { groom?: string; bride?: string }; expertReferral: { path: string; note: string } }>(`matchmaking/connections/${id}/kundli`), retry: false });
  const share = useMutation({ mutationFn: (s: boolean) => post(`matchmaking/connections/${id}/share-chart`, { share: s }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['kundli', id] }); toast('Chart sharing updated', 'success'); } });
  const stage = useMutation({ mutationFn: (s: string) => post<{ next?: { path: string; label: string } }>(`matchmaking/connections/${id}/stage`, { stage: s }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['mm-connections'] }); if (r.next) toast(r.next.label, 'success'); }, onError: (e) => toast((e as Error).message, 'error') });
  const fam = useQuery({ queryKey: ['family'], queryFn: () => get<{ members: { id: string; relation: string; status: string; permissions: string[]; member: { displayName: string } | null }[] }>('family') });
  const shareFam = useMutation({ mutationFn: (fmId: string) => post('family/share-report', { compatibilityId: kundli.data!.compatibilityId, familyMemberId: fmId }), onSuccess: () => toast('Summary shared with family member', 'success'), onError: (e) => toast((e as Error).message, 'error') });
  const c = conns.data?.connections.find((x) => x.id === id);
  if (!c && conns.data) return <ErrorState error={new Error('Connection not found')} />;
  return (
    <div>
      {c && <PageHeader kicker={`Connection · ${cap(c.stage)}`} title={`You & ${c.card.displayName}`} actions={<>{c.conversationId && <ButtonLink to={`/messages/${c.conversationId}`} icon="messages">Messages</ButtonLink>}</>} />}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          {kundli.error ? (
            <Card><h2 className="font-display text-2xl">Kundli matching</h2><Notice tone="info" className="mt-3">{(kundli.error as Error).message}</Notice><Button className="mt-3" onClick={() => share.mutate(true)}>Share my chart for this connection</Button></Card>
          ) : kundli.data && (
            <Card>
              <h2 className="font-display text-2xl">Kundli matching</h2>
              {kundli.data.result.vedic.gunaMilan && <>
                <p className="mt-2 font-display text-5xl numeric">{kundli.data.result.vedic.gunaMilan.total}<span className="text-2xl text-fg-3">/36</span> <Badge tone="accent">{kundli.data.result.vedic.gunaMilan.band.label}</Badge></p>
                <p className="text-xs text-fg-3">Roles: {kundli.data.roles.groom} (groom role), {kundli.data.roles.bride} (bride role)</p>
                <table className="mt-3 w-full text-sm"><tbody className="divide-y divide-[var(--line)]">{kundli.data.result.vedic.gunaMilan.kootas.map((k) => <tr key={k.name}><td className="py-1.5 text-fg">{k.name}<p className="text-xs text-fg-3">{k.detail}</p></td><td className="text-right numeric">{k.score}/{k.max}</td></tr>)}</tbody></table>
              </>}
              <p className="mt-3 text-sm text-fg-2">Manglik: {kundli.data.manglik.groom.present ? 'met' : 'not met'} (groom role) · {kundli.data.manglik.bride.present ? 'met' : 'not met'} (bride role).</p>
              <ul className="mt-3 space-y-1 text-xs text-fg-3">{kundli.data.result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              <Notice tone="info" className="mt-4">{kundli.data.expertReferral.note} <Link to={kundli.data.expertReferral.path} className="underline">Find an expert</Link></Notice>
              {fam.data && fam.data.members.filter((m) => m.status === 'active' && m.permissions.includes('view_shared_reports')).length > 0 && (
                <div className="mt-4"><p className="text-sm text-fg">Share this summary with family</p><div className="mt-2 flex flex-wrap gap-2">{fam.data.members.filter((m) => m.status === 'active' && m.permissions.includes('view_shared_reports')).map((m) => <Button key={m.id} size="sm" variant="secondary" onClick={() => shareFam.mutate(m.id)}>{m.member?.displayName} ({m.relation})</Button>)}</div></div>
              )}
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => share.mutate(false)}>Stop sharing my chart</Button>
            </Card>
          )}
        </div>
        <Card>
          <h2 className="font-display text-2xl">Your path</h2>
          <ol className="mt-3 space-y-2">{STAGES.filter((s) => s !== 'closed').map((s) => {
            const reached = c && STAGES.indexOf(c.stage) >= STAGES.indexOf(s) && c.stage !== 'closed';
            return <li key={s} className="flex items-center justify-between gap-3"><span className={cx('text-sm', reached ? 'text-fg' : 'text-fg-3')}>{reached ? '✦' : '○'} {cap(s)}</span>{c && !reached && STAGES.indexOf(s) === STAGES.indexOf(c.stage) + 1 && <Button size="sm" variant="secondary" onClick={() => stage.mutate(s)}>Mark</Button>}</li>;
          })}</ol>
          {c?.stage === 'engaged' && <Button className="mt-4" icon="wedding" onClick={() => nav('/weddings/new')}>Start wedding planning</Button>}
          <Button size="sm" variant="ghost" className="mt-4" onClick={() => stage.mutate('closed')}>Close this connection</Button>
        </Card>
      </div>
    </div>
  );
}

export function MatchmakingProfileEditor() {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['mm-profile'], queryFn: () => get<{ profile: FormValues | null }>('matchmaking/profile') });
  const [v, setV] = useState<FormValues>({ gender: 'woman', seeking: ['man'], about: '', education: '', profession: '', willingToRelocate: false, values: '', interests: '', cultural: { languages: [], community: '', religion: '', diet: '' }, culturalPreferences: { religion: '', diet: '' }, ageMin: 24, ageMax: 36, familyParticipation: false, kundliMatchingImportant: false });
  const [place, setPlace] = useState<Place | null>(null);
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (q.data?.profile) { const p = q.data.profile; setV({ ...p, values: p.values.join(', '), interests: p.interests.join(', '), cultural: { languages: [], ...p.cultural }, culturalPreferences: { ...p.culturalPreferences } }); } }, [q.data]);
  const split = (s: string) => String(s).split(',').map((x) => x.trim()).filter(Boolean);
  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => (Array.isArray(x) ? x.length : x)));
  const save = useMutation({
    mutationFn: () => put('matchmaking/profile', { ...v, values: split(v.values), interests: split(v.interests), cultural: clean({ ...v.cultural, languages: typeof v.cultural.languages === 'string' ? split(v.cultural.languages) : v.cultural.languages }), culturalPreferences: clean(v.culturalPreferences), placeId: place?.id, acceptTerms: terms }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mm-profile'] }); toast('Profile saved', 'success'); nav('/matchmaking'); },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed'),
  });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader kicker="Matchmaking" title="Your matchmaking profile" subtitle="Cultural details are optional and only used as filters you choose." />
      <QueryState q={q}>{() => (
        <div className="space-y-5">
          {err && <Notice tone="danger">{err}</Notice>}
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="I am">{(id) => <Select id={id} value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })}><option value="woman">Woman</option><option value="man">Man</option><option value="non_binary">Non-binary</option><option value="other">Another identity</option></Select>}</Field>
            <Field label="Seeking">{(id) => <Select id={id} value={v.seeking[0]} onChange={(e) => setV({ ...v, seeking: [e.target.value] })}><option value="man">Man</option><option value="woman">Woman</option><option value="non_binary">Non-binary</option><option value="other">Another identity</option></Select>}</Field>
            <Field label="City" className="sm:col-span-2" hint={q.data?.profile ? `Current: ${q.data.profile.city}` : undefined}>{(id, d) => <PlaceSearch id={id} describedBy={d} value={place} onChange={setPlace} />}</Field>
            <Field label="Profession">{(id) => <Input id={id} value={v.profession} onChange={(e) => setV({ ...v, profession: e.target.value })} />}</Field>
            <Field label="Education">{(id) => <Input id={id} value={v.education} onChange={(e) => setV({ ...v, education: e.target.value })} />}</Field>
            <Field label="About you" className="sm:col-span-2">{(id) => <Textarea id={id} rows={4} maxLength={1500} value={v.about} onChange={(e) => setV({ ...v, about: e.target.value })} />}</Field>
            <Field label="Values (comma separated)" className="sm:col-span-2">{(id) => <Input id={id} value={v.values} onChange={(e) => setV({ ...v, values: e.target.value })} placeholder="family, growth, faith, adventure" />}</Field>
            <Field label="Interests (comma separated)" className="sm:col-span-2">{(id) => <Input id={id} value={v.interests} onChange={(e) => setV({ ...v, interests: e.target.value })} />}</Field>
            <Field label="Min age">{(id) => <Input id={id} type="number" value={v.ageMin} onChange={(e) => setV({ ...v, ageMin: Number(e.target.value) })} />}</Field>
            <Field label="Max age">{(id) => <Input id={id} type="number" value={v.ageMax} onChange={(e) => setV({ ...v, ageMax: Number(e.target.value) })} />}</Field>
          </Card>
          <Card className="space-y-4">
            <h2 className="font-display text-2xl">Optional cultural details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Languages">{(id) => <Input id={id} value={Array.isArray(v.cultural.languages) ? v.cultural.languages.join(', ') : v.cultural.languages} onChange={(e) => setV({ ...v, cultural: { ...v.cultural, languages: e.target.value } })} />}</Field>
              <Field label="Community (optional)">{(id) => <Input id={id} value={v.cultural.community ?? ''} onChange={(e) => setV({ ...v, cultural: { ...v.cultural, community: e.target.value } })} />}</Field>
              <Field label="Religion (optional)">{(id) => <Input id={id} value={v.cultural.religion ?? ''} onChange={(e) => setV({ ...v, cultural: { ...v.cultural, religion: e.target.value } })} />}</Field>
              <Field label="Diet (optional)">{(id) => <Input id={id} value={v.cultural.diet ?? ''} onChange={(e) => setV({ ...v, cultural: { ...v.cultural, diet: e.target.value } })} />}</Field>
              <Field label="Prefer partner’s religion (optional filter)">{(id) => <Input id={id} value={v.culturalPreferences.religion ?? ''} onChange={(e) => setV({ ...v, culturalPreferences: { ...v.culturalPreferences, religion: e.target.value } })} />}</Field>
            </div>
            <Switch label="Open to relocating" checked={v.willingToRelocate} onChange={(x) => setV({ ...v, willingToRelocate: x })} />
            <Switch label="I’d like family to take part later" checked={v.familyParticipation} onChange={(x) => setV({ ...v, familyParticipation: x })} />
            <Switch label="Kundli matching matters to me" description="Shows Guna Milan in discovery. It never hides anyone." checked={v.kundliMatchingImportant} onChange={(x) => setV({ ...v, kundliMatchingImportant: x })} />
          </Card>
          <Checkbox checked={terms} onChange={setTerms} label="I’m seeking a serious relationship and agree to the matchmaking community rules." />
          <Button size="lg" disabled={!terms || (!place && !q.data?.profile)} loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button>
        </div>
      )}</QueryState>
    </div>
  );
}

export function FamilyBridge() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['family'], queryFn: () => get<{ members: { id: string; relation: string; permissions: string[]; status: string; inviteEmail: string; member: { displayName: string } | null }[]; supporting: { id: string; principalId: string; principal?: { displayName: string }; relation: string; permissions: string[] }[] }>('family') });
  const [inv, setInv] = useState({ email: '', relation: 'mother', permissions: ['view_profile'] as string[] });
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({ mutationFn: () => post<{ acceptUrl: string }>('family/invite', inv), onSuccess: (r) => { setLink(r.acceptUrl); qc.invalidateQueries({ queryKey: ['family'] }); }, onError: (e) => toast((e as Error).message, 'error') });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => patch(`family/${id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['family'] }); toast('Updated', 'success'); } });
  return (
    <div>
      <PageHeader kicker="Family Bridge" title="Involve family, on your terms" subtitle="Family members see only what you allow — never your messages, dating activity or birth details." />
      <QueryState q={q}>{(d) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="space-y-4">
              <h2 className="font-display text-2xl">Invite a family member</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Their email">{(id) => <Input id={id} type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />}</Field>
                <Field label="Relation">{(id) => <Input id={id} value={inv.relation} onChange={(e) => setInv({ ...inv, relation: e.target.value })} />}</Field>
              </div>
              <fieldset className="space-y-2"><legend className="text-sm font-medium text-fg-2">They can…</legend>{PERMS.map(([k, l]) => <Checkbox key={k} checked={inv.permissions.includes(k)} onChange={(on) => setInv({ ...inv, permissions: on ? [...inv.permissions, k] : inv.permissions.filter((x) => x !== k) })} label={l} />)}</fieldset>
              <Button loading={invite.isPending} disabled={!inv.email || !inv.permissions.length} onClick={() => invite.mutate()}>Send invitation</Button>
              {link && <Notice tone="success">Invitation emailed. In development you can also share this link directly: <span className="break-all">{link}</span></Notice>}
            </Card>
            <ul className="space-y-3">{d.members.map((m) => (
              <li key={m.id} className="card p-4">
                <div className="flex items-center justify-between gap-2"><p className="text-fg">{m.member?.displayName ?? m.inviteEmail} <span className="text-fg-3">· {m.relation}</span></p><Badge tone={m.status === 'active' ? 'success' : m.status === 'invited' ? 'warning' : 'neutral'}>{m.status}</Badge></div>
                {m.status !== 'revoked' && <div className="mt-2 space-y-1.5">{PERMS.map(([k, l]) => <Checkbox key={k} checked={m.permissions.includes(k)} onChange={(on) => update.mutate({ id: m.id, body: { permissions: on ? [...m.permissions, k] : m.permissions.filter((x) => x !== k) } })} label={l} />)}</div>}
                {m.status !== 'revoked' && <Button size="sm" variant="danger" className="mt-3" onClick={() => update.mutate({ id: m.id, body: { revoke: true } })}>Revoke access</Button>}
              </li>
            ))}</ul>
          </div>
          <Card>
            <h2 className="font-display text-2xl">People you support</h2>
            <p className="mt-1 text-sm text-fg-2">Family members who invited you.</p>
            <ul className="mt-3 space-y-2">{d.supporting.map((s) => <li key={s.id}><Link to={`/family/view/${s.principalId}`} className="card flex items-center justify-between p-3 hover:border-line-strong"><span>{s.principal?.displayName} <span className="text-fg-3">· you are their {s.relation}</span></span><span className="text-accent">Open →</span></Link></li>)}{!d.supporting.length && <li className="text-sm text-fg-3">None yet.</li>}</ul>
          </Card>
        </div>
      )}</QueryState>
    </div>
  );
}

export function FamilyAccept() {
  const { token } = useParams();
  const nav = useNavigate();
  const m = useMutation({ mutationFn: () => post<{ principalId: string }>('family/accept', { token }), onSuccess: (r) => nav(`/family/view/${r.principalId}`) });
  return (
    <Card className="mx-auto max-w-lg">
      <h1 className="font-display text-3xl">Join a Family Bridge</h1>
      <p className="mt-2 text-fg-2">You’ve been invited to support a family member’s search. You’ll see only what they allow.</p>
      {m.error && <Notice tone="danger" className="mt-3">{(m.error as Error).message}</Notice>}
      <Button className="mt-4" loading={m.isPending} onClick={() => m.mutate()}>Accept invitation</Button>
    </Card>
  );
}

export function FamilyView() {
  const { principalId } = useParams();
  const toast = useToast();
  const q = useQuery({ queryKey: ['family-view', principalId], queryFn: () => get<{ relation: string; permissions: string[]; profile?: Record<string, unknown> | null; shortlist?: { userId: string; displayName?: string; age: number | null; city: string; profession: string; education: string }[]; sharedReports?: { id: string; createdAt: string }[] }>(`family/view/${principalId}`) });
  const [suggest, setSuggest] = useState('');
  const m = useMutation({ mutationFn: (targetId: string) => post(`family/view/${principalId}/suggest`, { targetId, note: suggest }), onSuccess: () => toast('Suggestion sent', 'success'), onError: (e) => toast((e as Error).message, 'error') });
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-5">
        <PageHeader kicker="Family Bridge" title="Supporting your family member" subtitle={`You can: ${d.permissions.map((p) => PERMS.find((x) => x[0] === p)?.[1]).join('; ')}.`} />
        {d.profile && <Card><h2 className="font-display text-2xl">Their profile</h2><p className="mt-2 text-sm text-fg-2">{String(d.profile.about ?? '')}</p><p className="mt-1 text-xs text-fg-3">{String(d.profile.profession ?? '')} · {String(d.profile.city ?? '')}</p></Card>}
        {d.shortlist && <Card><h2 className="font-display text-2xl">Their shortlist</h2><ul className="mt-3 space-y-2">{d.shortlist.map((s) => <li key={s.userId} className="flex items-center justify-between gap-3 text-sm"><span>{s.displayName}{s.age ? `, ${s.age}` : ''} · {s.profession} · {s.city}</span>{d.permissions.includes('suggest_profiles') && <Button size="sm" variant="ghost" onClick={() => m.mutate(s.userId)}>Encourage</Button>}</li>)}{!d.shortlist.length && <li className="text-fg-3">Empty.</li>}</ul></Card>}
        {d.sharedReports && <Card><h2 className="font-display text-2xl">Shared compatibility summaries</h2><ul className="mt-2 space-y-1">{d.sharedReports.map((r) => <li key={r.id}><Link to={`/shared-report/${r.id}`} className="text-accent underline">Summary shared {new Date(r.createdAt).toLocaleDateString()}</Link></li>)}{!d.sharedReports.length && <li className="text-sm text-fg-3">Nothing shared yet.</li>}</ul></Card>}
        {d.permissions.includes('suggest_profiles') && <Field label="Note to include with suggestions">{(id) => <Input id={id} value={suggest} onChange={(e) => setSuggest(e.target.value)} />}</Field>}
      </div>
    )}</QueryState>
  );
}
