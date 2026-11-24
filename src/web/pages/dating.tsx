import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeApiError, get, post, put, upload } from '../lib/api';
import { relative } from '../lib/format';
import { useMe } from '../lib/session';
import { Avatar, Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Switch, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState } from '../components/ui/feedback';
import { Dialog, Tabs, useToast } from '../components/ui/overlays';
import { Meter } from '../components/ui/data';
import { PlaceSearch, type Place } from '../components/PlaceSearch';
import { ReportDialog } from './identity';

// Server profile rows are edited as loosely-typed form state; values are validated by the API schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormValues = Record<string, any>;

const INTENTS = [['casual', 'Something casual'], ['dating', 'Dating'], ['long_term', 'A long-term relationship'], ['marriage', 'Marriage'], ['unsure', 'Not sure yet']] as const;
const GENDERS = [['woman', 'Woman'], ['man', 'Man'], ['non_binary', 'Non-binary'], ['other', 'Another identity']] as const;

interface Candidate { userId: string; displayName?: string; age: number; city: string; distanceLabel: string; intent: string; bio: string; prompts: { question: string; answer: string }[]; photos: string[]; interests: string[]; verified: boolean; signs: { sun: string | null; moon: string | null } | null; astroScore: number | null; reasons: string[] }

export function DatingHome() {
  const me = useMe().data?.user;
  const profile = useQuery({ queryKey: ['dating-profile'], queryFn: () => get<{ profile: { active: boolean; verification: string; suspendedAt: string | null } | null; safetyTips: string[] }>('dating/profile') });
  const [tab, setTab] = useState<'discover' | 'matches' | 'safety'>('discover');
  if (!me?.emailVerified) return <div className="mx-auto max-w-xl"><PageHeader kicker="Dating" title="Meet people, intentionally" /><Notice tone="info">Verify your email to use dating. <Link className="underline" to="/settings/security">Resend verification</Link></Notice></div>;
  return (
    <div>
      <PageHeader kicker="Dating · 18+" title="Meet people, intentionally" subtitle="Astrology is optional here — one lens among many, never a filter you didn’t choose." actions={<ButtonLink to="/dating/profile" variant="secondary" icon="edit">Dating profile</ButtonLink>} />
      <QueryState q={profile}>{(p) => !p.profile ? (
        <EmptyState icon="heart" title="Create your dating profile" body="Your dating profile is separate from your Cosmic ID. Only people who match your preferences — and whose preferences you match — will see it." action={<ButtonLink to="/dating/profile">Get started</ButtonLink>} />
      ) : (
        <>
          {p.profile.suspendedAt && <Notice tone="danger" className="mb-4">Your dating profile is under review and hidden from discovery. You can appeal from Settings.</Notice>}
          {!p.profile.active && <Notice tone="info" className="mb-4">Your profile is paused and hidden from discovery.</Notice>}
          <Tabs tabs={[{ value: 'discover', label: 'Discover' }, { value: 'matches', label: 'Matches' }, { value: 'safety', label: 'Safety' }]} value={tab} onChange={setTab} className="mb-6" />
          {tab === 'discover' && <Discover />}
          {tab === 'matches' && <Matches />}
          {tab === 'safety' && <Card><h2 className="font-display text-2xl">Dating safely</h2><ul className="mt-3 space-y-2 text-sm text-fg-2">{p.safetyTips.map((t) => <li key={t}>✦ {t}</li>)}</ul></Card>}
        </>
      )}</QueryState>
    </div>
  );
}

function Discover() {
  const [astroOnly, setAstroOnly] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [report, setReport] = useState<string | null>(null);
  const [match, setMatch] = useState<{ conversationId: string; name?: string } | null>(null);
  const q = useQuery({ queryKey: ['discover', astroOnly], queryFn: () => get<{ candidates: Candidate[]; explanation: string }>(`dating/discover${astroOnly ? '?astroOnly=true' : ''}`) });
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [q.data]);
  const act = useMutation({
    mutationFn: ({ c, action }: { c: Candidate; action: 'like' | 'pass' }) => post<{ matched: boolean; conversationId?: string }>('dating/actions', { targetId: c.userId, action }),
    onSuccess: (r, v) => { if (r.matched && r.conversationId) setMatch({ conversationId: r.conversationId, name: v.c.displayName }); setIdx((i) => i + 1); qc.invalidateQueries({ queryKey: ['matches'] }); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error'),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_1fr]">
      <QueryState q={q}>{(d) => {
        const c = d.candidates[idx];
        if (!c) return <EmptyState icon="heart" title="You’re all caught up" body="Check back later, or widen your distance and age preferences." action={<Button variant="secondary" onClick={() => q.refetch()}>Refresh</Button>} />;
        return (
          <article className="card overflow-hidden p-0" aria-label={`${c.displayName}, ${c.age}`}>
            {c.photos[0] ? <img src={c.photos[0]} alt={`Photo of ${c.displayName}`} className="aspect-[4/5] w-full object-cover" /> : <div className="flex aspect-[4/5] w-full items-center justify-center bg-surface-2"><Avatar name={c.displayName} size={120} /></div>}
            <div className="p-5">
              <div className="flex items-center gap-2"><h2 className="font-display text-3xl">{c.displayName}, {c.age}</h2>{c.verified && <Badge tone="success">Verified</Badge>}</div>
              <p className="text-sm text-fg-3">{c.city} · {c.distanceLabel} · {INTENTS.find((i) => i[0] === c.intent)?.[1]}</p>
              {c.signs && <p className="mt-2 text-sm text-fg-2">{c.signs.sun && `☉ ${c.signs.sun}`}{c.signs.moon && ` · ☽ ${c.signs.moon}`}</p>}
              {c.bio && <p className="mt-3 leading-relaxed text-fg">{c.bio}</p>}
              {c.prompts.map((p) => <div key={p.question} className="mt-3 rounded-[var(--radius-md)] bg-surface-2 p-3"><p className="text-xs text-fg-3">{p.question}</p><p className="text-fg">{p.answer}</p></div>)}
              {c.interests.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{c.interests.map((i) => <Badge key={i}>{i}</Badge>)}</div>}
              {c.astroScore !== null && <div className="mt-4"><p className="mb-1 text-xs text-fg-3">Chart harmony (traditional lens, not a prediction)</p><Meter value={c.astroScore} label="Chart harmony" tone="violet" /></div>}
              {c.reasons.length > 0 && <p className="mt-3 text-xs text-fg-3">Why you’re seeing {c.displayName}: {c.reasons.join(' · ')}</p>}
              <div className="mt-5 flex gap-3">
                <Button variant="secondary" size="lg" className="flex-1" icon="x" loading={act.isPending && act.variables?.action === 'pass'} onClick={() => act.mutate({ c, action: 'pass' })}>Pass</Button>
                <Button size="lg" className="flex-1" icon="heart" loading={act.isPending && act.variables?.action === 'like'} onClick={() => act.mutate({ c, action: 'like' })}>Like</Button>
              </div>
              <button type="button" className="mt-3 text-xs text-fg-3 hover:text-danger" onClick={() => setReport(c.userId)}>Report this profile</button>
            </div>
          </article>
        );
      }}</QueryState>
      <aside className="space-y-4">
        <Card><Switch label="Only show strong chart harmony" description="Uses your and their opt-in chart data only." checked={astroOnly} onChange={setAstroOnly} /></Card>
        {q.data && <Card><h3 className="font-display text-2xl">How discovery works</h3><p className="mt-2 text-sm text-fg-2">{q.data.explanation}</p><p className="mt-2 text-xs text-fg-3">Exact locations are never stored or shown — only a rounded distance.</p></Card>}
      </aside>
      <ReportDialog open={Boolean(report)} onClose={() => setReport(null)} targetType="dating_profile" targetId={report ?? ''} />
      <Dialog open={Boolean(match)} onClose={() => setMatch(null)} title="It’s a match ✦" description={`You and ${match?.name} liked each other.`} footer={<><Button variant="ghost" onClick={() => setMatch(null)}>Keep browsing</Button><Button onClick={() => nav(`/messages/${match!.conversationId}`)}>Say hello</Button></>}>
        <p className="text-sm text-fg-2">Start with something from their profile. Keep the conversation on Nakshatra until you feel comfortable.</p>
      </Dialog>
    </div>
  );
}

function Matches() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['matches'], queryFn: () => get<{ matches: { id: string; userId: string; displayName?: string; photo: string | null; conversationId: string | null; createdAt: string; active: boolean }[]; datePrompts: string[] }>('dating/matches') });
  const compat = useQuery({ queryKey: ['match-compat', open], queryFn: () => get<{ dimensions: { label: string; score: number; description: string; factorCount: number }[]; limitations: string[] }>(`dating/matches/${open}/compatibility`), enabled: Boolean(open), retry: false });
  const unmatch = useMutation({ mutationFn: (id: string) => post(`dating/matches/${id}/unmatch`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['matches'] }); setOpen(null); } });
  return (
    <QueryState q={q} empty={(d) => (!d.matches.length ? <EmptyState icon="heart" title="No matches yet" body="When you and someone else both like each other, you’ll find them here." /> : null)}>{(d) => (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ul className="grid gap-3 sm:grid-cols-2">{d.matches.map((m) => (
          <li key={m.id} className={cx('card flex items-center gap-3 p-3', !m.active && 'opacity-60')}>
            {m.photo ? <img src={m.photo} alt="" className="h-14 w-14 rounded-full object-cover" /> : <Avatar name={m.displayName} size={56} />}
            <div className="min-w-0 flex-1"><p className="text-fg">{m.displayName}</p><p className="text-xs text-fg-3">{m.active ? `Matched ${relative(m.createdAt)}` : 'Unmatched'}</p></div>
            {m.active && <div className="flex flex-col gap-1"><ButtonLink to={`/messages/${m.conversationId}`} size="sm">Chat</ButtonLink><Button size="sm" variant="ghost" onClick={() => setOpen(m.id)}>Insights</Button></div>}
          </li>
        ))}</ul>
        <aside><Card><h3 className="font-display text-2xl">Date ideas</h3><ul className="mt-2 space-y-2 text-sm text-fg-2">{d.datePrompts.map((p) => <li key={p}>✦ {p}</li>)}</ul></Card></aside>
        <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title="Your chart contacts" description="Shown only because you both opted in to astrology." footer={<Button variant="danger" onClick={() => unmatch.mutate(open!)}>Unmatch</Button>}>
          {compat.error ? <Notice tone="info">{(compat.error as Error).message}</Notice> : compat.data && <div className="space-y-4">{compat.data.dimensions.map((x) => <div key={x.label}><p className="text-sm text-fg">{x.label}</p><Meter value={x.score} label={x.label} /><p className="text-xs text-fg-3">{x.description}</p></div>)}<ul className="text-xs text-fg-3">{compat.data.limitations.map((l) => <li key={l}>{l}</li>)}</ul></div>}
        </Dialog>
      </div>
    )}</QueryState>
  );
}

export function DatingProfileEditor() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['dating-profile'], queryFn: () => get<{ profile: FormValues | null; safetyTips: string[] }>('dating/profile') });
  const [v, setV] = useState<FormValues>({ intent: 'long_term', gender: 'woman', interestedIn: ['man'], bio: '', prompts: [{ question: 'A perfect Sunday looks like…', answer: '' }], interests: '', ageMin: 24, ageMax: 38, maxDistanceKm: 40, preferredIntents: [], useAstrology: true, showSunSign: true, showMoonSign: false, incognito: false });
  const [place, setPlace] = useState<Place | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hydrate the form once when the saved profile arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (q.data?.profile) { const p = q.data.profile; setV({ ...p, interests: (p.interests ?? []).join(', '), prompts: p.prompts?.length ? p.prompts : v.prompts }); } }, [q.data]);
  const save = useMutation({
    mutationFn: () => put('dating/profile', { ...v, interests: String(v.interests).split(',').map((s) => s.trim()).filter(Boolean), prompts: v.prompts.filter((p: { answer: string }) => p.answer.trim()), placeId: place?.id ?? '', acknowledgeSafety: ack }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dating-profile'] }); toast('Dating profile saved', 'success'); nav('/dating'); },
    onError: (e) => setError(describeApiError(e, 'Save failed')),
  });
  const photo = useMutation({ mutationFn: (f: File) => upload('dating/photos', f), onSuccess: () => qc.invalidateQueries({ queryKey: ['dating-profile'] }), onError: (e) => toast((e as Error).message, 'error') });
  const removePhoto = useMutation({ mutationFn: (url: string) => api('dating/photos', { method: 'DELETE', body: { url } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['dating-profile'] }) });
  const verify = useMutation({ mutationFn: (f: File) => upload<{ message: string }>('dating/verification', f), onSuccess: (r) => { toast(r.message, 'success'); qc.invalidateQueries({ queryKey: ['dating-profile'] }); } });
  const pause = useMutation({ mutationFn: (active: boolean) => post('dating/profile/pause', { active }), onSuccess: () => qc.invalidateQueries({ queryKey: ['dating-profile'] }) });
  const toggleArr = (key: string, val: string) => setV({ ...v, [key]: v[key].includes(val) ? v[key].filter((x: string) => x !== val) : [...v[key], val] });
  const existing = q.data?.profile;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader kicker="Dating" title={existing ? 'Edit dating profile' : 'Create your dating profile'} subtitle="Separate from your Cosmic ID. You control exactly which astrological details appear." />
      <QueryState q={q}>{() => (
        <div className="space-y-6">
          {error && <Notice tone="danger">{error}</Notice>}
          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="I am">{(id) => <Select id={id} value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })}>{GENDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
              <Field label="Looking for">{(id) => <Select id={id} value={v.intent} onChange={(e) => setV({ ...v, intent: e.target.value })}>{INTENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
            </div>
            <fieldset><legend className="text-sm font-medium text-fg-2">Interested in</legend><div className="mt-2 flex flex-wrap gap-2">{GENDERS.map(([k, l]) => <button key={k} type="button" aria-pressed={v.interestedIn.includes(k)} onClick={() => toggleArr('interestedIn', k)} className={cx('rounded-full border px-3 py-1.5 text-sm', v.interestedIn.includes(k) ? 'border-accent bg-accent/10' : 'border-line text-fg-2')}>{l}</button>)}</div></fieldset>
            <Field label="City" hint={existing ? `Current: ${existing.city}. Your exact location is never stored — it’s rounded to about 5 km.` : 'Rounded to about 5 km before it’s stored.'}>{(id, d) => <PlaceSearch id={id} describedBy={d} value={place} onChange={setPlace} label="City" />}</Field>
            <Field label="Bio">{(id) => <Textarea id={id} rows={3} maxLength={600} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} />}</Field>
            {v.prompts.map((p: { question: string; answer: string }, i: number) => (
              <Field key={i} label={p.question}>{(id) => <Input id={id} maxLength={300} value={p.answer} onChange={(e) => setV({ ...v, prompts: v.prompts.map((x: { question: string; answer: string }, j: number) => (j === i ? { ...x, answer: e.target.value } : x)) })} />}</Field>
            ))}
            <Field label="Interests (comma separated)">{(id) => <Input id={id} value={v.interests} onChange={(e) => setV({ ...v, interests: e.target.value })} placeholder="music, trekking, classical dance" />}</Field>
          </Card>
          <Card className="space-y-4">
            <h2 className="font-display text-2xl">Preferences</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Min age">{(id) => <Input id={id} type="number" min={18} max={99} value={v.ageMin} onChange={(e) => setV({ ...v, ageMin: Number(e.target.value) })} />}</Field>
              <Field label="Max age">{(id) => <Input id={id} type="number" min={18} max={99} value={v.ageMax} onChange={(e) => setV({ ...v, ageMax: Number(e.target.value) })} />}</Field>
              <Field label="Max distance (km)">{(id) => <Input id={id} type="number" min={1} max={500} value={v.maxDistanceKm} onChange={(e) => setV({ ...v, maxDistanceKm: Number(e.target.value) })} />}</Field>
            </div>
            <Switch label="Use astrology in my matches" description="Adds optional chart-harmony insights for people who also opt in. Never overrides your preferences." checked={v.useAstrology} onChange={(x) => setV({ ...v, useAstrology: x })} />
            <Switch label="Show my Sun sign" checked={v.showSunSign} onChange={(x) => setV({ ...v, showSunSign: x })} />
            <Switch label="Show my Moon sign" checked={v.showMoonSign} onChange={(x) => setV({ ...v, showMoonSign: x })} />
            <Switch label="Incognito" description="Only people you’ve liked can see your profile." checked={v.incognito} onChange={(x) => setV({ ...v, incognito: x })} />
          </Card>
          {existing && (
            <Card className="space-y-4">
              <h2 className="font-display text-2xl">Photos</h2>
              <div className="flex flex-wrap gap-3">{(existing.photos as string[]).map((p) => <div key={p} className="relative"><img src={p} alt="Your dating photo" className="h-28 w-24 rounded object-cover" /><button type="button" className="absolute right-1 top-1 rounded-full bg-canvas/80 px-1.5 text-xs" onClick={() => removePhoto.mutate(p)} aria-label="Remove photo">✕</button></div>)}</div>
              <Input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Add photo" onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
              <div className="orbit-rule" />
              <h3 className="font-display text-2xl">Verification <Badge tone={existing.verification === 'verified' ? 'success' : existing.verification === 'pending' ? 'warning' : 'neutral'}>{existing.verification}</Badge></h3>
              <p className="text-sm text-fg-2">Upload a selfie holding a handwritten note with your Nakshatra handle. A person on our safety team reviews it; it’s never shown on your profile.</p>
              {existing.verification !== 'verified' && existing.verification !== 'pending' && <Input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Verification selfie" onChange={(e) => e.target.files?.[0] && verify.mutate(e.target.files[0])} />}
              <Button variant="secondary" onClick={() => pause.mutate(!existing.active)}>{existing.active ? 'Pause my profile' : 'Resume my profile'}</Button>
            </Card>
          )}
          <Card>
            <h2 className="font-display text-2xl">Safety guidelines</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-fg-2">{q.data?.safetyTips.map((t) => <li key={t}>✦ {t}</li>)}</ul>
            <div className="mt-4"><Checkbox checked={ack} onChange={setAck} label="I’ve read these guidelines and agree to the community rules." /></div>
          </Card>
          <Button size="lg" loading={save.isPending} disabled={!ack || (!place && !existing)} onClick={() => save.mutate()}>{existing ? 'Save changes' : 'Create profile'}</Button>
        </div>
      )}</QueryState>
    </div>
  );
}
