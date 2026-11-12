import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, post } from '../lib/api';
import { Badge, Button, ButtonLink, Card, Checkbox, PageHeader, cx } from '../components/ui/primitives';
import { EmptyState, Notice, QueryState } from '../components/ui/feedback';
import { Segmented, useToast } from '../components/ui/overlays';
import { shareLink } from './share';
import { YEAR_RULES } from '../../shared/yearReview';
import { YearFilm } from '../components/YearFilm';

interface Fact { key: string; label: string; shareable: boolean; value: number | string | null }
interface Review { year: number; years: number[]; soFar: boolean; months: number[]; highlights: string[]; factList: Fact[]; canShare: boolean; note: string }
interface CardFact { key: string; label: string; value: string }
interface MyCard { slug: string; url: string; year: number; facts: CardFact[]; named: boolean; views: number; createdAt: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const filled = (v: Fact['value']) => v !== null && v !== 0;

export function YearReviewPage() {
  const [year, setYear] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['year-review', year], queryFn: () => get<Review>(`year-review${year ? `?year=${year}` : ''}`) });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <QueryState q={q}>{(r) => (
        <>
          <PageHeader kicker="You" title={`Your ${r.year}${r.soFar ? ' so far' : ''}`} subtitle="Your year on Nakshatra, from your own activity."
            actions={r.years.length > 1 ? <Segmented label="Year" value={String(r.year)} onChange={(v) => setYear(Number(v))} options={r.years.map((y) => ({ value: String(y), label: String(y) }))} /> : undefined} />
          <YearFilm review={r} />
          <Overview r={r} />
          <SharePanel r={r} />
          <MyCards />
          <p className="text-xs text-fg-3">{r.note} <Link to="/journal" className="text-accent hover:underline">Your journal and calendar →</Link></p>
        </>
      )}</QueryState>
    </div>
  );
}

function Overview({ r }: { r: Review }) {
  const max = Math.max(1, ...r.months);
  const facts = r.factList.filter((f) => f.key !== 'busiestMonth' && f.key !== 'longestRun');
  return (
    <>
      <Card className="space-y-4 bg-[linear-gradient(135deg,rgb(141_123_216/0.18),rgb(217_178_111/0.10))]">
        {r.highlights.length ? <ul className="space-y-1">{r.highlights.map((h) => <li key={h} className="font-display text-2xl leading-snug text-fg">{h}</li>)}</ul>
          : <p className="font-display text-2xl text-fg">A quiet year so far — that’s fine. Drops, circles and games you join will show up here.</p>}
        <figure aria-label="Activity by month">
          <ol className="flex h-24 items-end gap-1">
            {r.months.map((n, i) => (
              <li key={MONTHS[i]} className="flex flex-1 flex-col items-center justify-end gap-1" aria-label={`${MONTHS[i]}: ${n}`}>
                <span className={cx('w-full rounded-t-[3px]', n ? 'bg-accent' : 'bg-line')} style={{ height: `${Math.max(4, (n / max) * 72)}px` }} />
                <span className="text-[10px] text-fg-3" aria-hidden="true">{MONTHS[i][0]}</span>
              </li>
            ))}
          </ol>
          <figcaption className="mt-1 text-xs text-fg-3">Things you did each month: drops, games, quizzes, tournaments, events, check-ins and journal entries.</figcaption>
        </figure>
      </Card>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Your year in numbers">
        {facts.map((f) => (
          <li key={f.key} className="card p-4">
            <p className="font-display text-3xl numeric text-fg">{f.value ?? '—'}</p>
            <p className="text-xs uppercase tracking-[0.12em] text-fg-3">{f.label}</p>
            {!f.shareable && <p className="mt-1 text-[11px] text-fg-3">Private — only you</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function SharePanel({ r }: { r: Review }) {
  const qc = useQueryClient();
  const toast = useToast();
  const options = r.factList.filter((f) => f.shareable && filled(f.value));
  const [picked, setPicked] = useState<string[]>([]);
  const [showName, setShowName] = useState(false);
  useEffect(() => { setPicked(options.slice(0, 4).map((f) => f.key)); }, [r.year]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = useMutation({
    mutationFn: () => post<{ card: MyCard }>('year-review/cards', { year: r.year, facts: picked, showName }),
    onSuccess: async ({ card }) => {
      void qc.invalidateQueries({ queryKey: ['year-cards'] });
      try { toast((await shareLink(card.url, `My ${card.year} on Nakshatra`)) === 'shared' ? 'Shared' : 'Link copied', 'success'); }
      catch { toast('Card created — copy the link below', 'success'); }
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not create the card', 'error'),
  });
  if (!r.canShare || !options.length) return <Notice tone="info">After a few more days of activity you’ll be able to share a card of your year.</Notice>;
  const toggle = (k: string) => setPicked((p) => p.includes(k) ? p.filter((x) => x !== k) : p.length >= YEAR_RULES.maxCardFacts ? p : [...p, k]);
  const preview = options.filter((f) => picked.includes(f.key));
  return (
    <Card className="space-y-4" aria-label="Share a card">
      <div>
        <h2 className="font-display text-2xl">Share a card</h2>
        <p className="text-sm text-fg-2">Pick up to {YEAR_RULES.maxCardFacts} facts. The card shows only what you tick, frozen as it is today. Moods and your journal can never be shared.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((f) => <Checkbox key={f.key} label={f.label} description={String(f.value)} checked={picked.includes(f.key)} onChange={() => toggle(f.key)} disabled={!picked.includes(f.key) && picked.length >= YEAR_RULES.maxCardFacts} />)}
      </div>
      <Checkbox label="Show my display name on the card" checked={showName} onChange={setShowName} />
      {preview.length > 0 && <YearCardView year={r.year} displayName={showName ? 'Your name' : null} facts={preview.map((f) => ({ key: f.key, label: f.label, value: String(f.value) }))} compact />}
      <Button icon="share" disabled={!picked.length} loading={create.isPending} onClick={() => create.mutate()}>Create share link</Button>
    </Card>
  );
}

function MyCards() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['year-cards'], queryFn: () => get<{ cards: MyCard[] }>('year-review/cards') });
  const off = useMutation({ mutationFn: (slug: string) => del(`year-review/cards/${slug}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['year-cards'] }); toast('Link switched off', 'success'); } });
  return (
    <section aria-labelledby="cards-h" className="space-y-3">
      <h2 id="cards-h" className="font-display text-2xl">Your shared cards</h2>
      <QueryState q={q}>{(d) => d.cards.length === 0 ? <EmptyState icon="share" title="No cards shared" body="Cards you share appear here. You can switch any of them off." /> : (
        <ul className="space-y-2">
          {d.cards.map((c) => (
            <li key={c.slug} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-fg">{c.year} · {c.facts.map((f) => f.label).join(', ')}</p>
                <p className="break-all text-xs text-fg-3" data-testid="year-card-url">{c.url}</p>
                <p className="text-xs text-fg-3">{c.views} view{c.views === 1 ? '' : 's'}{c.named ? ' · shows your name' : ' · no name'}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => off.mutate(c.slug)} aria-label={`Switch off the ${c.year} card link`}>Switch off</Button>
            </li>
          ))}
        </ul>
      )}</QueryState>
    </section>
  );
}

function YearCardView({ year, displayName, facts, compact }: { year: number; displayName: string | null; facts: CardFact[]; compact?: boolean }) {
  return (
    <div className={cx('overflow-hidden rounded-[var(--radius-xl)] border border-line bg-[linear-gradient(160deg,rgb(141_123_216/0.28),rgb(217_178_111/0.14))]', compact ? 'p-5' : 'p-8')} aria-label={`${year} card`}>
      <p className="eyebrow">{displayName ? `${displayName}’s year` : 'A year on Nakshatra'}</p>
      <p className={cx('font-display leading-none text-fg', compact ? 'mt-2 text-5xl' : 'mt-3 text-7xl')}>{year}</p>
      <dl className={cx('grid grid-cols-2 gap-4', compact ? 'mt-4' : 'mt-8')}>
        {facts.map((f) => (
          <div key={f.key}>
            <dt className="text-xs uppercase tracking-[0.12em] text-fg-3">{f.label}</dt>
            <dd className={cx('font-display numeric text-fg', compact ? 'text-2xl' : 'text-4xl')}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Public year card at /y/:slug — no sign-in needed. */
export function SharedYearCard() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['year-card', slug], queryFn: () => get<{ card: { year: number; displayName: string | null; facts: CardFact[] } }>(`year-cards/${slug}`), retry: false, staleTime: 60_000 });
  return (
    <div className="mx-auto max-w-xl space-y-6 py-10">
      <QueryState q={q}>{({ card }) => (
        <>
          <YearCardView year={card.year} displayName={card.displayName} facts={card.facts} />
          <Card className="space-y-3">
            {card.displayName ? <Badge>Shared by {card.displayName}</Badge> : null}
            <p className="font-display text-2xl">Which kind of person are you?</p>
            <p className="text-sm text-fg-2">Find your archetype in about two minutes, then share drops, circles and games with the friends you already have.</p>
            <ButtonLink to="/personality">Find my archetype</ButtonLink>
          </Card>
          <p className="text-xs text-fg-3">The person who shared this chose what it shows and can switch the link off at any time.</p>
        </>
      )}</QueryState>
    </div>
  );
}
