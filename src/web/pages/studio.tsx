import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, patch, post } from '../lib/api';
import { useMe } from '../lib/session';
import { Badge, Button, ButtonLink, Card, Field, Input, PageHeader, Select, cx } from '../components/ui/primitives';
import { Notice, QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { Art, ResponsiveArt } from '../components/visual';
import { clearPendingAnswers, renderPersonaCard, savePendingAnswers, type Persona } from '../lib/persona';
import { ARCHETYPE_VISUALS, archetypeAccent, archetypeArt, cardStyleFrame, envArt } from '../lib/visual';
import { publicEvent, shareOrDownload } from '../lib/cosmic';
import { ShareLinkPanel } from './share';
import { DimensionExplorer, RevealTheatre } from '../components/IdentityWorld';

interface QuestionsResp { version: string; questions: { id: string; text: string }[]; scale: string[]; note: string }

/** In-progress answers are kept on this device only, so a closed tab or a phone call doesn't lose them. */
const DRAFT_KEY = 'nk.assessment.draft';
interface Draft { answers: Record<string, number>; page: number; savedAt: number }
function readDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    // Drafts older than 30 days are dropped.
    return d && typeof d.page === 'number' && d.answers && Date.now() - d.savedAt < 30 * 864e5 ? d : null;
  } catch { return null; }
}
function writeDraft(d: Draft | null) {
  try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable: progress simply isn't kept */ }
}

/**
 * The 20-question assessment, five statements per step. Answers stay in component
 * state until submitted; nothing is sent until the person finishes.
 */
export function Assessment({ onDone, submitLabel = 'See my archetype', initial }: { onDone: (answers: Record<string, number>) => Promise<unknown>; submitLabel?: string; initial?: Record<string, number> | null }) {
  const q = useQuery({ queryKey: ['personality-questions'], queryFn: () => get<QuestionsResp>('personality/questions'), staleTime: Infinity });
  const [draft] = useState(() => (initial ? null : readDraft()));
  const [answers, setAnswersRaw] = useState<Record<string, number>>(initial ?? draft?.answers ?? {});
  const [page, setPageRaw] = useState(draft?.page ?? 0);
  const [resumed, setResumed] = useState(!!draft && Object.keys(draft.answers).length > 0);
  const setAnswers = (a: Record<string, number>) => {
    if (!Object.keys(answers).length && Object.keys(a).length === 1) publicEvent('assessment_started');
    setAnswersRaw(a); writeDraft({ answers: a, page, savedAt: Date.now() });
  };
  const setPage = (p: number) => { setPageRaw(p); writeDraft({ answers, page: p, savedAt: Date.now() }); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  return (
    <QueryState q={q}>{(d) => {
      const pages = Math.ceil(d.questions.length / 5);
      const slice = d.questions.slice(page * 5, page * 5 + 5);
      const pageDone = slice.every((x) => answers[x.id]);
      const answered = Object.keys(answers).length;
      const finish = async () => {
        setBusy(true); setError(null);
        try { await onDone(answers); writeDraft(null); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
        setBusy(false);
      };
      return (
        <div ref={top}>
          {resumed && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-line px-3 py-2 text-sm text-fg-2" role="status">
              <span>Picked up where you left off.</span>
              <button type="button" className="underline underline-offset-2 hover:text-fg" onClick={() => { setAnswersRaw({}); setPageRaw(0); writeDraft(null); setResumed(false); }}>Start over</button>
            </div>
          )}
          <div className="mb-5 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={d.questions.length} aria-valuenow={answered} aria-label="Questions answered">
              <div className="h-1.5 rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(answered / d.questions.length) * 100}%` }} />
            </div>
            <span className="text-xs text-fg-3 numeric">{answered}/{d.questions.length}</span>
          </div>
          <ol className="space-y-5" start={page * 5 + 1}>
            {slice.map((item, i) => (
              <li key={item.id}>
                <fieldset>
                  <legend className="text-[15px] text-fg"><span className="mr-2 text-fg-3 numeric">{page * 5 + i + 1}.</span>{item.text}</legend>
                  <div className="mt-2 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={item.text}>
                    {d.scale.map((label, v) => {
                      const val = v + 1;
                      const on = answers[item.id] === val;
                      return (
                        <label key={label} className={cx('flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-sm)] border px-1 py-2 text-center text-[11px] leading-tight transition-colors', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-3 hover:border-line-strong')}>
                          <input type="radio" className="sr-only" name={item.id} value={val} aria-label={label} checked={on} onChange={() => setAnswers({ ...answers, [item.id]: val })} />
                          <span aria-hidden="true" className={cx('mb-1 h-2.5 w-2.5 rounded-full border', on ? 'border-accent bg-accent' : 'border-fg-3')} />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </li>
            ))}
          </ol>
          {error && <Notice tone="danger" className="mt-4">{error}</Notice>}
          <div className="mt-6 flex items-center gap-3">
            {page > 0 && <Button variant="ghost" onClick={() => { setPage(page - 1); top.current?.scrollIntoView({ block: 'start' }); }}>Back</Button>}
            {page < pages - 1
              ? <Button disabled={!pageDone} onClick={() => { setPage(page + 1); top.current?.scrollIntoView({ block: 'start' }); }}>Next</Button>
              : <Button loading={busy} disabled={answered < d.questions.length} onClick={finish}>{submitLabel}</Button>}
            <span className="text-xs text-fg-3">Step {page + 1} of {pages}</span>
          </div>
          <p className="mt-4 text-xs text-fg-3">{d.note}</p>
        </div>
      );
    }}</QueryState>
  );
}

export function DimensionBars({ dims }: { dims: Persona['dimensions'] }) {
  return (
    <ul className="space-y-3">
      {dims.map((d) => (
        <li key={d.key}>
          <div className="flex justify-between text-xs text-fg-3"><span>{d.low}</span><span className="text-fg-2">{d.name}</span><span>{d.high}</span></div>
          <div className="relative mt-1 h-2 rounded-full bg-surface-3" aria-label={`${d.name}: ${d.score >= 0 ? d.high : d.low} (${Math.round(Math.abs(d.score) * 100)}%)`} role="img">
            <span className="absolute left-1/2 top-0 h-2 w-px bg-line-strong" />
            <span className="absolute top-0 h-2 rounded-full bg-accent" style={d.score >= 0 ? { left: '50%', width: `${d.score * 50}%` } : { right: '50%', width: `${-d.score * 50}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const CONFIDENCE: Record<string, string> = { high: 'Clear match', medium: 'Good match', low: 'Close call — a few archetypes fit you', inconclusive: 'Inconclusive — no clear fit yet' };

/**
 * Archetype reveal: identity-reveal environment, the archetype's sigil drawn on, then
 * name, traits and actions (motion-guidelines.md, 1400ms; static under reduced motion).
 * The accent colours only this archetype's own surfaces (sigil plate, trait chips).
 */
export function PersonaResult({ persona, actions }: { persona: Persona; style?: string; actions?: React.ReactNode }) {
  const accent = archetypeAccent(persona.key);
  useEffect(() => { publicEvent('result_viewed'); }, [persona.key, persona.takenAt]);
  return (
    <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,420px)_1fr]" aria-labelledby="persona-name">
      <RevealTheatre persona={persona} />
      <div className="reveal-rest-wrap">
        <div className="reveal-rest flex flex-wrap items-center gap-2">
          <Badge tone="accent">Calculated from your answers</Badge>
          <Badge tone={persona.confidence === 'inconclusive' ? 'warning' : 'neutral'}>{persona.blend && persona.confidence !== 'inconclusive' ? 'A blend of two archetypes' : CONFIDENCE[persona.confidence]}</Badge>
          {persona.model && !persona.model.current && <Badge tone="neutral">Earlier model</Badge>}
        </div>
        {persona.model?.note && <p className="reveal-rest mt-3 text-sm text-fg-3">{persona.model.note}</p>}
        {persona.quality?.message && <p className="reveal-rest mt-3 rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-fg-2" role="note">{persona.quality.message}</p>}
        <h1 id="persona-name" className="reveal-name mt-3 font-display text-5xl leading-[1] md:text-7xl text-pretty">{persona.name}</h1>
        <p className="reveal-name mt-3 font-display text-2xl italic text-fg-2 text-pretty">{persona.signature}</p>
        <ul className="reveal-rest mt-4 flex flex-wrap gap-2">{persona.traits.map((t) => <li key={t} className="rounded-full border px-3 py-1 text-sm text-fg" style={{ borderColor: `${accent}66` }}>{t}</li>)}</ul>
        <p className="mt-4 text-fg-2"><span className="text-fg">In circles:</span> {persona.inCircles}</p>
        <p className="mt-1 text-fg-2"><span className="text-fg">Growth edge:</span> {persona.growth}</p>
        {persona.blend ? (
          <p className="mt-3 rounded-[var(--radius)] border border-line px-3 py-2 text-sm text-fg-2" data-testid="persona-blend">
            You sit almost exactly between <span className="text-fg">{persona.name}</span> and <span className="text-fg">{persona.blend.secondaryName}</span> ({Math.round(persona.blend.primaryWeight * 100)}% / {Math.round((1 - persona.blend.primaryWeight) * 100)}%). Both describe you; the first leads by a hair.
          </p>
        ) : persona.secondary && <p className="mt-1 text-sm text-fg-3">Secondary archetype: {persona.secondary.name}</p>}
        {actions && <div className="mt-6">{actions}</div>}
      </div>
    </section>
  );
}

export function WhyThisResult({ persona }: { persona: Persona }) {
  return (
    <Card className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
      <div>
        <h2 className="font-display text-2xl">Why this result</h2>
        <ul className="mt-2 space-y-1 text-sm text-fg-2">{persona.explanation.map((e) => <li key={e}>• {e}</li>)}</ul>
        <p className="mt-3 text-xs text-fg-3">Your answers place you on five dimensions from −1 to +1. Your archetype is the one whose profile points the same way as yours; how strongly you lean sets how confident the match is ({persona.version}). Retaking saves a new result and keeps your earlier ones in your timeline.</p>
      </div>
      <DimensionBars dims={persona.dimensions} />
    </Card>
  );
}

/** Card artwork for an archetype and style: classic uses the archetype's own card, other styles a frame + its sigil. */
function cardArt(key: string, style: string) {
  return { card: archetypeArt(key, 'card')!, frame: style === 'classic' ? null : cardStyleFrame(style), sigil: archetypeArt(key, 'sigil')!, accent: archetypeAccent(key) };
}

/**
 * The 5:7 identity card in HTML (750×1050 artboard): artwork from the package, every
 * word live. Used in Identity Studio; the same layout is rasterised for sharing.
 */
export function IdentityCard({ persona, style = 'classic', className }: { persona: Pick<Persona, 'key' | 'name' | 'signature' | 'traits'>; style?: string; className?: string }) {
  const art = cardArt(persona.key, style);
  const has = Boolean(ARCHETYPE_VISUALS[persona.key]);
  return (
    <figure className={`relative aspect-[5/7] w-full overflow-hidden rounded-[var(--radius-lg)] ${className ?? ''}`} aria-label={`Identity card: ${persona.name}`}>
      {has && <Art src={art.frame ?? art.card} className="absolute inset-0 h-full w-full object-cover" />}
      {has && art.frame && <Art src={art.sigil} className="absolute left-[26.7%] top-[21.4%] w-[46.6%]" />}
      <figcaption className="absolute inset-x-[8%] top-[58%] text-center">
        <p className="font-display text-[1.6rem] leading-[1.02] text-[#f2ece1] text-pretty sm:text-[1.9rem]">{persona.name}</p>
        <p className="mt-2 font-display text-2xl italic leading-snug text-[#e4dccc] text-pretty">{persona.signature}</p>
        <ul className="mt-3 space-y-1">{persona.traits.map((t) => <li key={t} className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: art.accent }}>{t}</li>)}</ul>
      </figcaption>
    </figure>
  );
}

function PersonaShare({ persona, style, labels }: { persona: Persona; style: string; labels: string[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const make = async (format: 'story' | 'square') => {
    setBusy(format);
    try {
      const blob = await renderPersonaCard(cardArt(persona.key, style), { ...persona, labels }, format);
      const how = await shareOrDownload(blob, `nakshatra-${persona.key}-${format}.png`, `I'm ${persona.name}. What are you?`);
      publicEvent('share_card_created');
      toast(how === 'shared' ? 'Shared' : 'Card downloaded', 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
    setBusy(null);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button icon="share" loading={busy === 'story'} onClick={() => make('story')}>Story card</Button>
        <Button variant="secondary" loading={busy === 'square'} onClick={() => make('square')}>Square card</Button>
      </div>
      <p className="mt-2 text-xs text-fg-3">Cards show your archetype, traits and up to three labels — never your handle, pen name or birth details.</p>
      <div className="mt-4"><ShareLinkPanel archetypeName={persona.name} signedIn /></div>
    </div>
  );
}

interface IdentityMe {
  persona: Persona | null; history: { id: string; name: string; createdAt: string }[];
  labels: string[]; labelCatalogue: string[]; pseudonym: string | null; handle: string; displayName: string;
  cardStyle: string; cardStyles: { key: string; title: string; unlocked: boolean; source: string | null; unlock: { type: string; level?: number; key?: string } }[];
  cosmic: { name: string; essence: string } | null; community: { name: string; guesses: number }[];
  visibility: Record<'persona' | 'labels' | 'cosmic', 'public' | 'connections' | 'private'>; profileVisibility: string;
}

export function IdentityStudio() {
  const q = useQuery({ queryKey: ['identity-me'], queryFn: () => get<IdentityMe>('identity/me') });
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [retake, setRetake] = useState(false);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch('identity/me', body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['identity-me'] }); toast('Saved', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error'),
  });
  return (
    <div>
      <PageHeader kicker={params.get('welcome') ? 'Welcome to Nakshatra' : 'Identity Studio'} title="Your kind of person" subtitle="What you calculated, what you chose, what friends guess — and what the sky says, if you want it. You control who sees each part." />
      <QueryState q={q}>{(d) => (!d.persona || retake) ? (
        <Card className="relative max-w-3xl overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-40"><ResponsiveArt landscape={envArt('sigil-field', 'landscape')} portrait={envArt('sigil-field', 'portrait')} landscapePosition="70% 50%" portraitPosition="50% 30%" /></div>
          <div className="relative">
          <h2 className="font-display text-3xl">{retake ? 'Retake the assessment' : 'Discover your archetype'}</h2>
          <p className="mb-6 mt-1 text-fg-2">Twenty quick statements, about two minutes. Go with your first instinct.</p>
          <Assessment submitLabel="Save my archetype" onDone={async (answers) => { await post('personality/assessment', { answers }); setRetake(false); await qc.invalidateQueries({ queryKey: ['identity-me'] }); await qc.invalidateQueries({ queryKey: ['me'] }); }} />
          {retake && <Button variant="ghost" className="mt-3" onClick={() => setRetake(false)}>Cancel</Button>}
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          <PersonaResult persona={d.persona} style={d.cardStyle} actions={<div className="space-y-4"><PersonaShare persona={d.persona} style={d.cardStyle} labels={d.labels} /><Button variant="ghost" size="sm" onClick={() => setRetake(true)}>Retake assessment</Button></div>} />
          <DimensionExplorer persona={d.persona} />
          {params.get('welcome') === '1' && (
            <Card className="flex flex-wrap items-center justify-between gap-4 border-accent/40" role="note" aria-labelledby="first-step">
              <div>
                <p className="eyebrow">Your next step</p>
                <h2 id="first-step" className="mt-1 font-display text-3xl">Say hello</h2>
                <p className="mt-1 text-sm text-fg-2">Drop one thought — a question, a poll, a photo or a voice note. It’s how people here find you.</p>
              </div>
              <ButtonLink to="/create">Drop your first thought</ButtonLink>
            </Card>
          )}
          <WhyThisResult persona={d.persona} />
          <IdentityTimeline />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="font-display text-2xl">Labels you chose</h2>
              <p className="text-sm text-fg-2">Self-selected — shown as “you said”, separate from your calculated archetype. Up to five.</p>
              <LabelPicker value={d.labels} options={d.labelCatalogue} onSave={(labels) => save.mutate({ labels })} saving={save.isPending} />
            </Card>
            <Card>
              <h2 className="font-display text-2xl">What friends guess</h2>
              <p className="text-sm text-fg-2">Community-derived — from Archetype Showdown games where you let others guess.</p>
              {d.community.length ? <ul className="mt-3 space-y-1 text-sm">{d.community.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-fg-3 numeric">{c.guesses} guess{c.guesses === 1 ? '' : 'es'}</span></li>)}</ul>
                : <p className="mt-3 text-sm text-fg-3">No guesses yet. Play Archetype Showdown with a circle and tick “let others guess my archetype”.</p>}
              <ButtonLink to="/play" variant="secondary" size="sm" className="mt-4">Go to Play</ButtonLink>
            </Card>
            <Card>
              <h2 className="font-display text-2xl">From the sky (optional)</h2>
              <p className="text-sm text-fg-2">Astrology-derived — only if you add birth details.</p>
              {d.cosmic ? <><p className="mt-3 font-display text-2xl">{d.cosmic.name}</p><p className="text-sm italic text-fg-2">{d.cosmic.essence}</p><ButtonLink to="/cosmic-id" variant="secondary" size="sm" className="mt-3">Open Cosmic ID</ButtonLink></>
                : <><p className="mt-3 text-sm text-fg-3">Not added. Nakshatra works fully without it.</p><ButtonLink to="/settings/birth" variant="secondary" size="sm" className="mt-3">Add birth details</ButtonLink></>}
            </Card>
            <Card className="lg:col-span-2">
              <h2 className="font-display text-2xl">Your identity card</h2>
              <p className="text-sm text-fg-2">The card your share images use. Earned styles unlock as you take part; paid styles carry the foil mark and appear only once a purchase is confirmed.</p>
              <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
                <IdentityCard persona={d.persona} style={d.cardStyle} className="mx-auto max-w-[260px]" />
                <ul className="grid grid-cols-3 gap-3 self-start" aria-label="Card styles">
                  {d.cardStyles.map((c) => (
                    <li key={c.key}>
                      <button type="button" disabled={!c.unlocked || save.isPending} aria-pressed={d.cardStyle === c.key} onClick={() => save.mutate({ cardStyle: c.key })}
                        className={cx('w-full rounded-[var(--radius-sm)] border p-2 text-left text-xs transition-colors disabled:cursor-not-allowed', d.cardStyle === c.key ? 'border-accent' : 'border-line hover:border-line-strong')}>
                        <span className={cx('relative mb-2 block aspect-[5/7] overflow-hidden rounded-md', !c.unlocked && 'locked-art')}>
                          <Art src={c.key === 'classic' ? archetypeArt(d.persona!.key, 'card')! : cardStyleFrame(c.key)} className="absolute inset-0 h-full w-full object-cover" />
                          {c.key !== 'classic' && <Art src={archetypeArt(d.persona!.key, 'compact')!} className="absolute left-1/4 top-[22%] w-1/2" />}
                        </span>
                        <span className="flex items-center gap-1 text-fg">{c.unlock.type === 'purchase' && <Art src="/visual/offers/premium-badge.svg" width={14} height={14} alt="Premium" />}{c.title}</span>
                        <span className="block text-fg-3">{c.unlocked ? (c.source === 'purchased' ? 'Purchased' : 'Earned') : c.unlock.type === 'purchase' ? 'Paid pack · locked' : c.unlock.type === 'level' ? `Level ${c.unlock.level}` : 'Achievement'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {d.cardStyles.some((c) => c.unlock.type === 'purchase' && !c.unlocked) && <Link to="/shop/p/cosmetic-card-styles" className="mt-3 inline-block text-xs text-accent underline underline-offset-2">See the paid style pack (₹29, cosmetic only)</Link>}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="font-display text-2xl">Pen name</h2>
              <p className="text-sm text-fg-2">Used when you post a Thought Drop pseudonymously. Other members see only the pen name. Nakshatra keeps the link to your account for safety and legal reasons, so this is pseudonymous — not anonymous.</p>
              <PenName value={d.pseudonym} onSave={(pseudonym) => save.mutate({ pseudonym })} saving={save.isPending} />
            </Card>
            <Card>
              <h2 className="font-display text-2xl">Who can see what</h2>
              <p className="text-sm text-fg-2">Your profile is {d.profileVisibility}. These apply on top of it.</p>
              <div className="mt-3 grid gap-3">
                {(['persona', 'labels', 'cosmic'] as const).map((k) => (
                  <Field key={k} label={{ persona: 'Archetype', labels: 'Labels', cosmic: 'Cosmic archetype' }[k]}>{(id) => (
                    <Select id={id} value={d.visibility[k]} onChange={(e) => save.mutate({ visibility: { [k]: e.target.value } })}>
                      <option value="public">Everyone who can see my profile</option><option value="connections">Connections only</option><option value="private">Only me</option>
                    </Select>
                  )}</Field>
                ))}
              </div>
              <ButtonLink to={`/i/${d.handle}`} variant="ghost" size="sm" className="mt-3">Preview my public identity</ButtonLink>
            </Card>
          </div>
        </div>
      )}</QueryState>
    </div>
  );
}

function LabelPicker({ value, options, onSave, saving }: { value: string[]; options: string[]; onSave: (v: string[]) => void; saving: boolean }) {
  const [sel, setSel] = useState(value);
  const changed = sel.join('|') !== value.join('|');
  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Identity labels">
        {options.map((o) => {
          const on = sel.includes(o);
          return <button key={o} type="button" aria-pressed={on} disabled={!on && sel.length >= 5} onClick={() => setSel(on ? sel.filter((x) => x !== o) : [...sel, o])} className={cx('min-h-9 rounded-full border px-3 text-sm transition-colors disabled:opacity-40', on ? 'border-fg bg-fg font-semibold text-canvas' : 'border-line text-fg-2 hover:border-line-strong')}>{o}</button>;
        })}
      </div>
      <Button size="sm" className="mt-3" disabled={!changed} loading={saving} onClick={() => onSave(sel)}>Save labels</Button>
    </div>
  );
}

function PenName({ value, onSave, saving }: { value: string | null; onSave: (v: string | null) => void; saving: boolean }) {
  const [v, setV] = useState(value ?? '');
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Pen name" className="min-w-[200px] flex-1">{(id) => <Input id={id} value={v} maxLength={24} onChange={(e) => setV(e.target.value)} placeholder="e.g. Quiet Comet" />}</Field>
      <Button size="md" loading={saving} disabled={v === (value ?? '')} onClick={() => onSave(v.trim() || null)}>{v.trim() ? 'Save' : 'Remove'}</Button>
    </div>
  );
}

/** Account-free assessment: scored in memory on the server, nothing stored until you save. */
export function PersonalityPreview() {
  const me = useMe().data?.user;
  const nav = useNavigate();
  const [result, setResult] = useState<{ persona: Persona; answers: Record<string, number> } | null>(null);
  if (result) {
    return (
      <div className="space-y-8 py-8">
        <Notice tone="info" title="This preview is not saved">We scored your answers and stored nothing. Save to keep your archetype, join circles and play with friends.</Notice>
        <PersonaResult persona={result.persona} actions={
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => { publicEvent('preview_signup_clicked'); savePendingAnswers(result.answers); nav(me ? '/onboarding' : '/signup?from=personality'); }}>Save my archetype</Button>
            <Button size="lg" variant="secondary" onClick={() => setResult(null)}>Start again</Button>
            <div className="basis-full pt-2"><ShareLinkPanel archetypeName={result.persona.name} answers={result.answers} signedIn={false} /></div>
          </div>
        } />
        <WhyThisResult persona={result.persona} />
      </div>
    );
  }
  return (
    <div className="mx-auto grid max-w-5xl gap-10 py-10 lg:grid-cols-[1fr_1.3fr]">
      <section>
        <p className="eyebrow">Archetype · no account needed</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.04]">What kind of person are you?</h1>
        <p className="mt-4 leading-relaxed text-fg-2">Twenty quick statements place you on five dimensions — social energy, decision style, expression, pace and novelty — and match you to one of 24 archetypes. No birth details, no sign-up.</p>
        <ul className="mt-6 space-y-2 text-sm text-fg-2">
          <li>✦ Nothing is stored unless you choose to save it.</li>
          <li>✦ Every result explains exactly why.</li>
          <li>✦ Tendencies, not labels for life. Retake whenever you like.</li>
        </ul>
        <p className="mt-6 text-xs text-fg-3">Prefer astrology? <Link to="/discover" className="text-accent underline underline-offset-2">Read your sky instead</Link>.</p>
      </section>
      <Card className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-40"><ResponsiveArt landscape={envArt('sigil-field', 'landscape')} portrait={envArt('sigil-field', 'portrait')} landscapePosition="70% 50%" portraitPosition="50% 30%" /></div>
        <div className="relative"><Assessment onDone={async (answers) => { const r = await post<{ result: Persona }>('personality/preview', { answers }); setResult({ persona: r.result, answers }); window.scrollTo({ top: 0 }); }} /></div>
      </Card>
    </div>
  );
}

interface PublicIdentityResp { handle: string; displayName: string; cardStyle: string; persona: (Pick<Persona, 'key' | 'name' | 'signature' | 'traits' | 'secondary' | 'dimensions'>) | null; labels: string[]; cosmic: { name: string; essence: string } | null }

/** Shareable identity page. Shows only what the person made visible to this viewer. */
export function PublicIdentity() {
  const { handle } = useParams();
  const q = useQuery({ queryKey: ['public-identity', handle], queryFn: () => get<PublicIdentityResp>(`identity/u/${handle}`), retry: false });
  return (
    <div className="py-10">
      <QueryState q={q}>{(d) => (
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">{d.displayName} on Nakshatra</p>
          {d.persona ? <>
            <div className="mx-auto mt-6 w-72"><IdentityCard persona={d.persona} style={d.cardStyle} /></div>
          </> : <h1 className="mt-4 font-display text-4xl">{d.displayName}</h1>}
          {d.labels.length > 0 && <p className="mt-4 text-sm text-fg-2">They say: {d.labels.join(' · ')}</p>}
          {d.cosmic && <p className="mt-2 text-sm text-fg-3">Cosmic archetype: {d.cosmic.name}</p>}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/personality">Find your archetype</ButtonLink>
          </div>
        </div>
      )}</QueryState>
    </div>
  );
}

export { clearPendingAnswers };

interface Timeline {
  results: { id: string; takenAt: string; name: string; confidence: string; changedArchetype: boolean; dimensions: { key: string; name: string; score: number; delta: number | null }[] }[];
  vibes: { date: string; mood: string }[];
  milestones: { at: string; kind: string; title: string }[];
  note: string;
}

/** Identity Evolution Timeline — private: how your results moved over time, your vibes and milestones. */
function IdentityTimeline() {
  const q = useQuery({ queryKey: ['identity-timeline'], queryFn: () => get<Timeline>('identity/timeline') });
  if (!q.data) return null;
  const t = q.data;
  return (
    <Card className="space-y-4">
      <div><h2 className="font-display text-2xl">Your timeline</h2><p className="text-sm text-fg-2">{t.note}</p></div>
      <ol className="space-y-3">
        {t.results.map((r) => (
          <li key={r.id} className="rounded-[var(--radius-sm)] border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{r.name}{r.changedArchetype && <span className="ml-2 text-xs text-accent">new archetype</span>}</p>
              <p className="text-xs text-fg-3">{new Date(r.takenAt).toLocaleDateString()} · {r.confidence}</p>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
              {r.dimensions.map((d) => <li key={d.key} className="flex justify-between gap-2"><span className="text-fg-3">{d.name}</span><span className="numeric">{d.score.toFixed(2)}{d.delta !== null && d.delta !== 0 && <span className={d.delta > 0 ? 'text-success' : 'text-accent'}> {d.delta > 0 ? '▲' : '▼'}{Math.abs(d.delta).toFixed(2)}</span>}</span></li>)}
            </ul>
          </li>
        ))}
      </ol>
      {t.vibes.length > 0 && (
        <div>
          <p className="text-sm text-fg-3">Recent vibes</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">{t.vibes.slice(0, 21).map((v) => <li key={v.date} title={v.date} className="rounded-full border border-line px-2 py-0.5 text-xs capitalize">{v.mood}</li>)}</ul>
        </div>
      )}
      {t.milestones.length > 0 && <ul className="space-y-1 text-sm">{t.milestones.slice(0, 8).map((m) => <li key={m.kind + m.at + m.title} className="flex justify-between gap-2"><span>✦ {m.title}</span><span className="text-xs text-fg-3">{new Date(m.at).toLocaleDateString()}</span></li>)}</ul>}
    </Card>
  );
}
