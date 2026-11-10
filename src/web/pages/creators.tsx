import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, idempotencyKey, patch, post, put } from '../lib/api';
import { Avatar, Badge, Button, ButtonLink, Card, Checkbox, Field, Input, PageHeader, Select, Switch, Textarea, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { ReportDialog } from './thoughts';
import { CREATOR_CATEGORIES, CREATOR_RULES as R, OFFERING_KINDS, OFFERING_LABEL, rupees, tipSplit, type OfferingKind } from '../../shared/creator';

type Link = { label: string; url: string };
const fail = (toast: ReturnType<typeof useToast>) => (e: unknown) => toast(e instanceof ApiError ? e.message : 'Something went wrong', 'error');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/* ---------------- Directory ---------------- */

export function CreatorsDirectory() {
  const [category, setCategory] = useState('');
  const q = useQuery({ queryKey: ['creators', category], queryFn: () => get<{ creators: { handle: string; name: string; avatarUrl: string | null; headline: string; categories: string[]; isMe: boolean }[] }>(`creators${category ? `?category=${category}` : ''}`) });
  return (
    <div className="space-y-6">
      <PageHeader kicker="Discover" title="Creators" subtitle="Members who make things — zines, music, games, workshops. Follow along, say thanks with a tip." actions={<ButtonLink to="/creator-studio" size="sm" variant="secondary">Your creator page</ButtonLink>} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {['', ...CREATOR_CATEGORIES].map((c) => (
          <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cx('min-h-9 rounded-full border px-3 text-sm', category === c ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2')}>{c ? cap(c) : 'All'}</button>
        ))}
      </div>
      <QueryState q={q} empty={(d) => (!d.creators.length ? <EmptyState icon="sparkle" title="No creators here yet" body="Set up your own creator page — it takes a minute." action={<ButtonLink to="/creator-studio" size="sm">Set up my page</ButtonLink>} /> : null)}>{(d) => (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{d.creators.map((c) => (
          <li key={c.handle}><Link to={`/creators/${c.handle}`} className="card flex h-full gap-3 p-4 hover:border-line-strong">
            <Avatar name={c.name} src={c.avatarUrl} size={44} />
            <div className="min-w-0">
              <p className="font-semibold text-fg">{c.name}{c.isMe && <span className="ml-2 text-xs text-fg-3">(you)</span>}</p>
              {c.headline && <p className="text-sm text-fg-2">{c.headline}</p>}
              <p className="mt-1 text-xs text-fg-3">{c.categories.map(cap).join(' · ')}</p>
            </div>
          </Link></li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}

/* ---------------- Public page ---------------- */

interface CreatorView {
  creator: { id: string; handle: string; name: string; avatarUrl: string | null; headline: string; about: string; categories: string[]; links: Link[]; status: string; isMe: boolean };
  featured: { id: string; kind: string; body: string; imageUrl: string | null }[];
  offerings: { id: string; kind: OfferingKind; title: string; description: string; pricePaise: number | null; interested: boolean; buyable: boolean; paidUnlock: boolean; owned: boolean; unlock: { content: string | null; link: string | null } | null }[];
  tips: { enabled: boolean; available: boolean; presetsPaise: number[]; minPaise: number; maxPaise: number; testMode: boolean };
  supporters: { name: string; message: string; createdAt: string }[];
}

export function CreatorPage() {
  const { handle } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const q = useQuery({ queryKey: ['creator', handle], queryFn: () => get<CreatorView>(`creators/${handle}`) });
  const interest = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => post(`creators/${handle}/offerings/${id}/interest`, { on }),
    onSuccess: (_r, v) => { void qc.invalidateQueries({ queryKey: ['creator', handle] }); toast(v.on ? 'We’ll let you know when it’s available.' : 'Removed', 'success'); },
    onError: fail(toast),
  });
  const nav = useNavigate();
  const buy = useMutation({
    mutationFn: (id: string) => post<{ checkout: { checkoutPath: string | null } }>(`creators/${handle}/offerings/${id}/purchase`, { idempotencyKey: `unlock-${id}-${Date.now()}` }),
    onSuccess: (r) => { if (r.checkout.checkoutPath) nav(r.checkout.checkoutPath); else toast('Complete the payment to unlock it.', 'info'); },
    onError: fail(toast),
  });
  return (
    <QueryState q={q}>{(d) => (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center gap-4">
          <Avatar name={d.creator.name} src={d.creator.avatarUrl} size={72} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Creator</p>
            <h1 className="font-display text-4xl leading-tight">{d.creator.name}</h1>
            {d.creator.headline && <p className="text-fg-2">{d.creator.headline}</p>}
            <div className="mt-1 flex flex-wrap gap-1">{d.creator.categories.map((c) => <Badge key={c} tone="neutral">{cap(c)}</Badge>)}</div>
          </div>
          {d.creator.isMe && <ButtonLink to="/creator-studio" size="sm" variant="secondary">Edit page</ButtonLink>}
        </header>
        {d.creator.isMe && d.creator.status !== 'active' && <Notice tone="warning">Only you can see this page right now ({d.creator.status}).</Notice>}
        {d.creator.about && <Card><p className="whitespace-pre-wrap text-fg">{d.creator.about}</p></Card>}
        {d.creator.links.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Links">{d.creator.links.map((l) => (
            <li key={l.url}><a href={l.url} target="_blank" rel="nofollow noopener noreferrer ugc" className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm text-fg hover:border-line-strong">{l.label} ↗</a></li>
          ))}</ul>
        )}

        {d.featured.length > 0 && (
          <section aria-labelledby="featured-h" className="space-y-3">
            <h2 id="featured-h" className="font-display text-2xl">Featured</h2>
            <ul className="grid gap-3 sm:grid-cols-2">{d.featured.map((p) => (
              <li key={p.id}><Link to={`/thoughts/${p.id}`} className="card block h-full p-4 hover:border-line-strong">
                {p.imageUrl && <img src={p.imageUrl} alt="" loading="lazy" className="mb-2 max-h-48 w-full rounded-[var(--radius-sm)] object-cover" />}
                <p className="line-clamp-4 text-fg">{p.body || 'Photo'}</p>
              </Link></li>
            ))}</ul>
          </section>
        )}

        {d.offerings.length > 0 && (
          <section aria-labelledby="offers-h" className="space-y-3">
            <h2 id="offers-h" className="font-display text-2xl">Offerings</h2>
            <p className="text-sm text-fg-3">Digital unlocks can be bought when payments are on; for everything else, tap “Notify me” to hear when it opens.</p>
            <ul className="space-y-3">{d.offerings.map((o) => (
              <li key={o.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-fg-3">{OFFERING_LABEL[o.kind]}</p>
                  <p className="font-semibold text-fg">{o.title}</p>
                  {o.description && <p className="text-sm text-fg-2">{o.description}</p>}
                  {o.pricePaise != null && <p className="mt-1 text-sm text-fg-3">{o.paidUnlock ? 'Unlock for' : 'Planned price'} {rupees(o.pricePaise)}{o.kind === 'membership' ? ' / month' : ''}</p>}
                  {o.unlock && (
                    <div className="mt-2 space-y-1 rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3" aria-label={`Unlocked: ${o.title}`}>
                      {o.unlock.content && <p className="whitespace-pre-wrap text-sm text-fg">{o.unlock.content}</p>}
                      {o.unlock.link && <a href={o.unlock.link} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent hover:underline">Open the link ↗</a>}
                    </div>
                  )}
                </div>
                {!d.creator.isMe && o.paidUnlock && !o.owned && (o.buyable
                  ? <Button size="sm" loading={buy.isPending && buy.variables === o.id} onClick={() => buy.mutate(o.id)}>Unlock — {rupees(o.pricePaise!)}</Button>
                  : <span className="text-xs text-fg-3">Opens when payments are switched on</span>)}
                {!d.creator.isMe && o.owned && <span className="text-sm text-success">✓ Unlocked</span>}
                {!d.creator.isMe && !o.paidUnlock && <Button size="sm" variant={o.interested ? 'ghost' : 'secondary'} aria-pressed={o.interested} onClick={() => interest.mutate({ id: o.id, on: !o.interested })}>{o.interested ? '✓ You’ll be notified' : 'Notify me'}</Button>}
              </li>
            ))}</ul>
          </section>
        )}

        {!d.creator.isMe && d.tips.enabled && <TipBox handle={d.creator.handle} name={d.creator.name} tips={d.tips} />}

        {d.supporters.length > 0 && (
          <section aria-labelledby="supporters-h" className="space-y-2">
            <h2 id="supporters-h" className="font-display text-2xl">Supporters</h2>
            <ul className="space-y-2">{d.supporters.map((s, i) => <li key={i} className="text-sm"><span className="font-semibold text-fg">{s.name}</span>{s.message && <span className="text-fg-2"> — “{s.message}”</span>}</li>)}</ul>
          </section>
        )}

        {!d.creator.isMe && <button type="button" className="text-sm text-fg-3 underline underline-offset-2" onClick={() => setReporting(true)}>Report this page</button>}
        <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="creator" targetId={d.creator.id} />
      </div>
    )}</QueryState>
  );
}

function TipBox({ handle, name, tips }: { handle: string; name: string; tips: CreatorView['tips'] }) {
  const nav = useNavigate();
  const toast = useToast();
  const [key] = useState(idempotencyKey);
  const [amount, setAmount] = useState(tips.presetsPaise[1] ?? tips.minPaise);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [wall, setWall] = useState(false);
  const paise = custom ? Math.round(Number(custom) * 100) : amount;
  const valid = Number.isFinite(paise) && paise >= tips.minPaise && paise <= tips.maxPaise;
  const send = useMutation({
    mutationFn: () => post<{ checkout: { checkoutPath: string | null } }>(`creators/${handle}/tips`, { amountPaise: paise, message, anonymous, showOnWall: wall, idempotencyKey: `${key}:${paise}` }),
    onSuccess: (r) => { if (r.checkout.checkoutPath) nav(r.checkout.checkoutPath); else toast('Complete the payment to send your tip.', 'info'); },
    onError: fail(toast),
  });
  if (!tips.available) return <Card aria-label="Tip"><h2 className="font-display text-2xl">Say thanks</h2><p className="mt-1 text-sm text-fg-2">Tips open when payments are switched on for Nakshatra. Nothing is charged until then.</p></Card>;
  const split = valid ? tipSplit(paise) : null;
  return (
    <Card className="space-y-3" aria-label="Tip">
      <h2 className="font-display text-2xl">Say thanks to {name}</h2>
      {tips.testMode && <Notice tone="dev">Development payment simulator — no real money moves.</Notice>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Amount">
        {tips.presetsPaise.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={!custom && amount === p} onClick={() => { setAmount(p); setCustom(''); }} className={cx('min-h-10 rounded-full border px-4 text-sm', !custom && amount === p ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2')}>{rupees(p)}</button>
        ))}
        <Input aria-label="Other amount in rupees" inputMode="decimal" className="w-36" placeholder="Other ₹" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))} />
      </div>
      <Field label="Message (optional)">{(id) => <Input id={id} maxLength={R.messageMax} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
      <Checkbox label="Don’t show my name to the creator" checked={anonymous} onChange={(v) => { setAnonymous(v); if (v) setWall(false); }} />
      <Checkbox label="List me as a supporter on this page (name and message, never the amount)" checked={wall} disabled={anonymous} onChange={setWall} />
      {split && <p className="text-xs text-fg-3">{rupees(split.netPaise)} goes to {name}; Nakshatra keeps {rupees(split.feePaise)} (10%). Creator payouts aren’t live yet, so it’s held for them.</p>}
      {!valid && <p className="text-xs text-danger">Choose between {rupees(tips.minPaise)} and {rupees(tips.maxPaise)}.</p>}
      <Button disabled={!valid} loading={send.isPending} onClick={() => send.mutate()}>Send {valid ? rupees(paise) : 'tip'}</Button>
    </Card>
  );
}

/* ---------------- Studio ---------------- */

interface Offering { id: string; kind: OfferingKind; title: string; description: string; pricePaise: number | null; status: 'draft' | 'listed' | 'archived'; interested: number; buyable: boolean; unlocks: number }
interface Studio {
  profile: null | { headline: string; about: string; categories: string[]; links: Link[]; featuredPostIds: string[]; tipsEnabled: boolean; status: string };
  handle: string | null;
  tipsAvailable: boolean;
  offerings?: Offering[];
  earnings?: { heldNetPaise: number; grossPaise: number; feePaise: number; tips: number; simulatedNetPaise: number; simulatedTips: number; payoutsAvailable: boolean; payoutNote: string };
  tips?: { id: string; from: string; amountPaise: number; message: string; simulated: boolean; createdAt: string }[];
  myPublicPosts?: { id: string; kind: string; preview: string }[];
}

export function CreatorStudio() {
  const q = useQuery({ queryKey: ['creator-studio'], queryFn: () => get<Studio>('creators/me') });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader kicker="Create" title="Your creator page" subtitle="A page for what you make: links, featured drops, what you’re planning to offer, and tips." />
      <QueryState q={q}>{(d) => (
        <>
          {d.profile?.status === 'suspended' && <Notice tone="danger">Your creator page is suspended by moderators. You can appeal from Settings → Appeals.</Notice>}
          {d.profile && d.handle && d.profile.status !== 'suspended' && <p className="text-sm"><Link to={`/creators/${d.handle}`} className="text-accent underline underline-offset-2">View your public page</Link></p>}
          <ProfileForm d={d} />
          {d.profile && d.earnings && <Earnings e={d.earnings} tips={d.tips ?? []} />}
          {d.profile && d.profile.status !== 'suspended' && <Offerings offerings={d.offerings ?? []} />}
        </>
      )}</QueryState>
    </div>
  );
}

function ProfileForm({ d }: { d: Studio }) {
  const qc = useQueryClient();
  const toast = useToast();
  const p = d.profile;
  const [headline, setHeadline] = useState(p?.headline ?? '');
  const [about, setAbout] = useState(p?.about ?? '');
  const [categories, setCategories] = useState<string[]>(p?.categories ?? []);
  const [links, setLinks] = useState<Link[]>(p?.links.length ? p.links : [{ label: '', url: '' }]);
  const [featured, setFeatured] = useState<string[]>(p?.featuredPostIds ?? []);
  const [tipsEnabled, setTipsEnabled] = useState(p?.tipsEnabled ?? false);
  const [paused, setPaused] = useState(p?.status === 'paused');
  const save = useMutation({
    mutationFn: () => put('creators/me', { headline, about, categories, links: links.filter((l) => l.label.trim() || l.url.trim()), featuredPostIds: featured, tipsEnabled, paused }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['creator-studio'] }); toast(p ? 'Saved' : 'Your creator page is live', 'success'); },
    onError: fail(toast),
  });
  const disabled = p?.status === 'suspended';
  return (
    <Card className="space-y-4" aria-label="Creator profile">
      <Field label="Headline">{(id) => <Input id={id} maxLength={R.headlineMax} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Zines about small joys" />}</Field>
      <Field label="About">{(id) => <Textarea id={id} rows={4} maxLength={R.aboutMax} value={about} onChange={(e) => setAbout(e.target.value)} />}</Field>
      <fieldset>
        <legend className="text-sm text-fg-2">What you make (up to {R.maxCategories})</legend>
        <div className="mt-2 flex flex-wrap gap-2">{CREATOR_CATEGORIES.map((c) => {
          const on = categories.includes(c);
          return <button key={c} type="button" aria-pressed={on} onClick={() => setCategories(on ? categories.filter((x) => x !== c) : categories.length < R.maxCategories ? [...categories, c] : categories)} className={cx('min-h-9 rounded-full border px-3 text-sm', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2')}>{cap(c)}</button>;
        })}</div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm text-fg-2">Links (https only)</legend>
        {links.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <Input aria-label={`Link ${i + 1} label`} placeholder="Label" maxLength={40} value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <Input aria-label={`Link ${i + 1} URL`} placeholder="https://" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          </div>
        ))}
        {links.length < R.maxLinks && <Button size="sm" variant="ghost" onClick={() => setLinks([...links, { label: '', url: '' }])}>Add a link</Button>}
      </fieldset>
      {!!d.myPublicPosts?.length && (
        <fieldset className="space-y-1">
          <legend className="text-sm text-fg-2">Feature your public drops (up to {R.maxFeatured})</legend>
          {d.myPublicPosts.map((x) => <Checkbox key={x.id} label={x.preview || `(${x.kind})`} checked={featured.includes(x.id)} onChange={(v) => setFeatured(v ? [...featured, x.id].slice(0, R.maxFeatured) : featured.filter((f) => f !== x.id))} />)}
        </fieldset>
      )}
      <Switch label="Accept tips" description={d.tipsAvailable ? 'Members can send you a tip. Nakshatra keeps 10%. Payouts aren’t live yet — tips are held for you.' : 'Tips open when payments are switched on. You can turn this on now.'} checked={tipsEnabled} onChange={setTipsEnabled} />
      {p && <Switch label="Pause my page" description="Hides your page from everyone else until you turn this off." checked={paused} onChange={setPaused} />}
      <Button disabled={disabled} loading={save.isPending} onClick={() => save.mutate()}>{p ? 'Save' : 'Create my creator page'}</Button>
    </Card>
  );
}

function Earnings({ e, tips }: { e: NonNullable<Studio['earnings']>; tips: NonNullable<Studio['tips']> }) {
  return (
    <Card className="space-y-3" aria-label="Earnings">
      <h2 className="font-display text-2xl">Tips and earnings</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div><p className="text-xs text-fg-3">Held for you</p><p className="font-display text-3xl numeric">{rupees(e.heldNetPaise)}</p></div>
        <div><p className="text-xs text-fg-3">Tips received</p><p className="font-display text-3xl numeric">{e.tips}</p></div>
        <div><p className="text-xs text-fg-3">Platform fee</p><p className="font-display text-3xl numeric">{rupees(e.feePaise)}</p></div>
      </div>
      {e.simulatedTips > 0 && <p className="text-xs text-fg-3">Plus {e.simulatedTips} simulated tip{e.simulatedTips === 1 ? '' : 's'} ({rupees(e.simulatedNetPaise)}) from the development payment simulator — not real money.</p>}
      <Notice tone="info">{e.payoutNote}</Notice>
      {tips.length > 0 ? (
        <ul className="divide-y divide-line">{tips.map((t) => (
          <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
            <span><span className="font-semibold text-fg">{t.from}</span>{t.message && <span className="text-fg-2"> — “{t.message}”</span>}</span>
            <span className="numeric text-fg-2">{rupees(t.amountPaise)}{t.simulated && <Badge tone="neutral" className="ml-2">simulated</Badge>}</span>
          </li>
        ))}</ul>
      ) : <p className="text-sm text-fg-3">No tips yet.</p>}
    </Card>
  );
}

function Offerings({ offerings }: { offerings: Offering[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<OfferingKind>('digital');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [unlockContent, setUnlockContent] = useState('');
  const [unlockLink, setUnlockLink] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['creator-studio'] });
  const add = useMutation({
    mutationFn: () => post('creators/me/offerings', { kind, title, description, pricePaise: price ? Math.round(Number(price) * 100) : null, status: 'listed', ...(kind === 'digital' && (unlockContent.trim() || unlockLink.trim()) ? { unlockContent: unlockContent.trim() || null, unlockLink: unlockLink.trim() || null } : {}) }),
    onSuccess: () => { setTitle(''); setDescription(''); setPrice(''); setUnlockContent(''); setUnlockLink(''); refresh(); toast('Listed', 'success'); },
    onError: fail(toast),
  });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: Offering['status'] }) => patch(`creators/me/offerings/${id}`, { status }), onSuccess: refresh, onError: fail(toast) });
  return (
    <Card className="space-y-4" aria-label="Offerings">
      <div>
        <h2 className="font-display text-2xl">Offerings</h2>
        <p className="text-sm text-fg-2">Sell a digital unlock (text or a link shown only to buyers), or list what you’re planning — a membership, a workshop — so members can tap “Notify me”. Your share of sales (85%) is held; payouts aren’t built yet.</p>
      </div>
      {offerings.length > 0 && (
        <ul className="divide-y divide-line">{offerings.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0"><span className="text-fg">{o.title}</span> <span className="text-xs text-fg-3">· {OFFERING_LABEL[o.kind]} · {o.status} · {o.buyable ? `${o.unlocks} unlock${o.unlocks === 1 ? '' : 's'}` : `${o.interested} want${o.interested === 1 ? 's' : ''} it`}</span></span>
            <span className="flex gap-1">
              {o.status === 'listed' ? <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: o.id, status: 'draft' })}>Unlist</Button> : <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: o.id, status: 'listed' })}>List</Button>}
              <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: o.id, status: 'archived' })}>Remove</Button>
            </span>
          </li>
        ))}</ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind">{(id) => <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as OfferingKind)}>{OFFERING_KINDS.map((k) => <option key={k} value={k}>{OFFERING_LABEL[k]}</option>)}</Select>}</Field>
        <Field label={kind === 'digital' ? 'Price in ₹' : 'Planned price in ₹ (optional)'}>{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />}</Field>
      </div>
      <Field label="Offering title">{(id) => <Input id={id} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monsoon zine (PDF)" />}</Field>
      <Field label="Offering description">{(id) => <Textarea id={id} rows={2} maxLength={600} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      {kind === 'digital' && (
        <>
          <Field label="What buyers unlock (optional)" hint="Only you and people who pay can see this. Leave both empty to just collect interest.">{(id) => <Textarea id={id} rows={3} maxLength={3000} value={unlockContent} onChange={(e) => setUnlockContent(e.target.value)} />}</Field>
          <Field label="Unlock link (https, optional)">{(id) => <Input id={id} type="url" maxLength={500} value={unlockLink} onChange={(e) => setUnlockLink(e.target.value)} placeholder="https://…" />}</Field>
        </>
      )}
      <Button variant="secondary" disabled={title.trim().length < 3} loading={add.isPending} onClick={() => add.mutate()}>List offering</Button>
    </Card>
  );
}

/** Everything you've unlocked from creators. */
export function UnlocksPage() {
  const q = useQuery({ queryKey: ['my-unlocks'], queryFn: () => get<{ unlocks: { id: string; title: string; description: string; creator: { handle: string; name: string }; amountPaise: number; simulated: boolean; content: string | null; link: string | null; unlockedAt: string }[] }>('creators/unlocks/mine') });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader kicker="You" title="Your unlocks" subtitle="Things you’ve bought from creators. They stay here even if the creator stops selling them." />
      <QueryState q={q}>{(d) => d.unlocks.length === 0 ? <EmptyState icon="star" title="Nothing unlocked yet" body="When you unlock something on a creator’s page, it appears here." /> : (
        <ul className="space-y-3">{d.unlocks.map((u) => (
          <li key={u.id} className="card space-y-2 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-fg-3"><Link to={`/creators/${u.creator.handle}`} className="hover:underline">{u.creator.name}</Link> · {rupees(u.amountPaise)}{u.simulated ? ' · test payment' : ''}</p>
            <p className="font-semibold text-fg">{u.title}</p>
            {u.content && <p className="whitespace-pre-wrap text-sm text-fg">{u.content}</p>}
            {u.link && <a href={u.link} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent hover:underline">Open the link ↗</a>}
          </li>
        ))}</ul>
      )}</QueryState>
    </div>
  );
}
