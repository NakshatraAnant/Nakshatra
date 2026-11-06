import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { useMe } from '../lib/session';
import { useModules } from '../lib/modules';
import { Badge, Button, Card, Field, Input, Select, Textarea, cx } from '../components/ui/primitives';
import { Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { AD_RULES, AD_TOPICS, adPolicyIssues } from '../../shared/ads';

interface Advertiser { id: string; name: string; website: string; status: string }
interface CampaignRow { id: string; name: string; advertiser: string; headline: string; body: string; status: string; startsAt: string; endsAt: string; frequencyCapPerDay: number; targeting: { topics: string[] }; createdBy: string; submittedBy: string | null; reviewNote: string | null; impressions: number; clicks: number; reach: number; hides: number; policyIssues: string[] }
interface AdsResp { advertisers: Advertiser[]; campaigns: CampaignRow[]; billing: string }

const TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger' | 'accent'> = { approved: 'success', in_review: 'warning', draft: 'neutral', rejected: 'danger', paused: 'neutral', ended: 'neutral' };

export function AdsAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data?.user;
  const mods = useModules();
  const q = useQuery({ queryKey: ['admin-ads'], queryFn: () => get<AdsResp>('admin/ads') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin-ads'] });
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Failed', 'error');
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(path, body ?? {}), onSuccess: () => { refresh(); toast('Saved', 'success'); }, onError: fail });
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <QueryState q={q}>{(d) => (
      <div className="space-y-4">
        {!mods.enabled('ads') && <Notice tone="warning">Sponsored cards are switched off, so members see none. Turn on the “Sponsored cards” module in Flags & settings when you’re ready.</Notice>}
        <p className="text-sm text-fg-2">Contextual only: ads can target a browsing topic and language, never anything about a member. Every campaign needs a second staff member’s approval. {d.billing}</p>
        <NewAdvertiser onDone={refresh} />
        {d.advertisers.length > 0 && <NewCampaign advertisers={d.advertisers.filter((a) => a.status === 'active')} onDone={refresh} />}
        <ul className="space-y-3">{d.campaigns.map((c) => {
          const mine = c.createdBy === me?.id || c.submittedBy === me?.id;
          return (
            <li key={c.id} className="card space-y-2 p-4" aria-label={`Campaign ${c.name}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-fg">{c.name} <span className="text-sm font-normal text-fg-3">· {c.advertiser}</span></p>
                <Badge tone={TONE[c.status] ?? 'neutral'}>{c.status.replace('_', ' ')}</Badge>
              </div>
              <p className="text-sm text-fg">“{c.headline}” {c.body && <span className="text-fg-2">— {c.body}</span>}</p>
              <p className="text-xs text-fg-3">{new Date(c.startsAt).toLocaleDateString()} → {new Date(c.endsAt).toLocaleDateString()} · up to {c.frequencyCapPerDay}/day per person · {c.targeting.topics.length ? `topics: ${c.targeting.topics.join(', ')}` : 'everyone (no topic)'}</p>
              <p className="text-xs text-fg-3 numeric">{c.impressions} showings · {c.reach} people · {c.clicks} clicks · {c.hides} hid it</p>
              {c.policyIssues.length > 0 && <Notice tone="danger">{c.policyIssues.join(' ')}</Notice>}
              {c.reviewNote && <p className="text-xs text-fg-2">Review note: {c.reviewNote}</p>}
              <div className="flex flex-wrap gap-2">
                {['draft', 'rejected'].includes(c.status) && <Button size="sm" disabled={c.policyIssues.length > 0} onClick={() => act.mutate({ path: `admin/ads/campaigns/${c.id}/submit` })}>Submit for review</Button>}
                {c.status === 'in_review' && (mine
                  ? <p className="text-xs text-fg-3">Waiting for another staff member to review.</p>
                  : <>
                    <Input aria-label={`Review note for ${c.name}`} className="min-w-0 flex-1" placeholder="Note (required to reject)" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
                    <Button size="sm" onClick={() => act.mutate({ path: `admin/ads/campaigns/${c.id}/review`, body: { decision: 'approve', note: notes[c.id] ?? '' } })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/ads/campaigns/${c.id}/review`, body: { decision: 'reject', note: notes[c.id] ?? '' } })}>Reject</Button>
                  </>)}
                {c.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `admin/ads/campaigns/${c.id}/status`, body: { status: 'paused' } })}>Pause</Button>}
                {c.status === 'paused' && <Button size="sm" variant="secondary" onClick={() => act.mutate({ path: `admin/ads/campaigns/${c.id}/status`, body: { status: 'approved' } })}>Resume</Button>}
                {['approved', 'paused'].includes(c.status) && <Button size="sm" variant="ghost" className="text-danger" onClick={() => act.mutate({ path: `admin/ads/campaigns/${c.id}/status`, body: { status: 'ended' } })}>End</Button>}
              </div>
            </li>
          );
        })}</ul>
      </div>
    )}</QueryState>
  );
}

function NewAdvertiser({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => post('admin/ads/advertisers', { name, website, contactEmail: email }), onSuccess: () => { setName(''); setWebsite(''); setEmail(''); onDone(); toast('Advertiser added', 'success'); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error') });
  return (
    <Card className="space-y-2" aria-label="New advertiser">
      <h3 className="font-display text-xl">Add an advertiser</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input aria-label="Advertiser name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Advertiser website" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <Input aria-label="Advertiser contact email" placeholder="Contact email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button size="sm" variant="secondary" disabled={!name || !website || !email} loading={m.isPending} onClick={() => m.mutate()}>Add advertiser</Button>
    </Card>
  );
}

function NewCampaign({ advertisers, onDone }: { advertisers: Advertiser[]; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ advertiserId: advertisers[0]?.id ?? '', name: '', headline: '', body: '', ctaLabel: 'Learn more', destinationUrl: 'https://', days: '14', cap: String(AD_RULES.defaultCapPerDay) });
  const [topics, setTopics] = useState<string[]>([]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const issues = adPolicyIssues({ headline: f.headline, body: f.body, ctaLabel: f.ctaLabel, destinationUrl: f.destinationUrl }, { topics: topics as never, languages: [] });
  const m = useMutation({
    mutationFn: () => post('admin/ads/campaigns', { advertiserId: f.advertiserId || advertisers[0]?.id, name: f.name, headline: f.headline, body: f.body, ctaLabel: f.ctaLabel, destinationUrl: f.destinationUrl, targeting: { topics, languages: [] }, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + Number(f.days) * 864e5).toISOString(), frequencyCapPerDay: Number(f.cap) }),
    onSuccess: () => { setF({ ...f, name: '', headline: '', body: '' }); setTopics([]); onDone(); toast('Draft saved', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Failed', 'error'),
  });
  return (
    <Card className="space-y-3" aria-label="New campaign">
      <h3 className="font-display text-xl">New campaign (draft)</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Advertiser">{(id) => <Select id={id} value={f.advertiserId} onChange={set('advertiserId')}>{advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>}</Field>
        <Field label="Campaign name (internal)">{(id) => <Input id={id} value={f.name} onChange={set('name')} />}</Field>
        <Field label="Headline">{(id) => <Input id={id} maxLength={AD_RULES.headline} value={f.headline} onChange={set('headline')} />}</Field>
        <Field label="Button label">{(id) => <Input id={id} maxLength={AD_RULES.cta} value={f.ctaLabel} onChange={set('ctaLabel')} />}</Field>
        <Field label="Link (https)">{(id) => <Input id={id} value={f.destinationUrl} onChange={set('destinationUrl')} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Runs for">{(id) => <Select id={id} value={f.days} onChange={set('days')}>{[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} days</option>)}</Select>}</Field>
          <Field label="Max per person per day">{(id) => <Select id={id} value={f.cap} onChange={set('cap')}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select>}</Field>
        </div>
      </div>
      <Field label="Ad text">{(id) => <Textarea id={id} rows={2} maxLength={AD_RULES.body} value={f.body} onChange={set('body')} />}</Field>
      <fieldset>
        <legend className="text-sm text-fg-2">Show only when browsing these topics (leave empty for everyone)</legend>
        <div className="mt-2 flex flex-wrap gap-2">{AD_TOPICS.map((t) => {
          const on = topics.includes(t);
          return <button key={t} type="button" aria-pressed={on} onClick={() => setTopics(on ? topics.filter((x) => x !== t) : [...topics, t])} className={cx('min-h-9 rounded-full border px-3 text-sm', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2')}>{t}</button>;
        })}</div>
      </fieldset>
      {f.headline && issues.length > 0 && <Notice tone="warning">{issues.join(' ')}</Notice>}
      <Button size="sm" disabled={!f.name || !f.headline} loading={m.isPending} onClick={() => m.mutate()}>Save draft</Button>
    </Card>
  );
}
