import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { post } from '../lib/api';
import { BirthForm, type BirthValues } from '../components/BirthForm';
import { CosmicSigil } from '../components/CosmicSigil';
import { Badge, Button, cx } from '../components/ui/primitives';
import { Notice } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { publicEvent, renderShareCard, savePendingBirth, shareOrDownload, type CardFormat, type CosmicIdentity, type LayerText } from '../lib/cosmic';
import { useMe } from '../lib/session';

/** True when the user (or the OS) asked for less motion. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Staged reveal: the sigil draws itself while three calculated facts appear in
 * order (Rashi → Nakshatra → archetype). About three seconds, skippable, and
 * skipped entirely under reduced motion.
 */
function Reveal({ identity, onDone }: { identity: CosmicIdentity; onDone: () => void }) {
  const [beat, setBeat] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (prefersReducedMotion()) { done.current(); return; }
    const timers = [700, 1500, 2300, 3300].map((ms, i) => setTimeout(() => (i < 3 ? setBeat(i + 1) : done.current()), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  const lines = [
    `Your Moon rests in ${identity.layers.rashi.value}`,
    `in the nakshatra ${identity.layers.nakshatra.value}`,
    `You are ${identity.archetype.name}`,
  ];
  return (
    <div className="relative mx-auto flex max-w-xl flex-col items-center py-10 text-center" aria-live="polite">
      <div className="w-[min(78vw,380px)] overflow-hidden rounded-full"><CosmicSigil identity={identity} animate precise /></div>
      <div className="mt-8 h-24">
        {lines.slice(0, beat).map((l, i) => (
          <p key={l} className={cx('rise-in', i === 2 ? 'mt-3 font-display text-4xl text-fg' : 'text-lg text-fg-2')}>{l}</p>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onDone} className="mt-2">Skip</Button>
    </div>
  );
}

function ScoreBars({ title, scores, top }: { title: string; scores: Record<string, number>; top: string }) {
  const max = Math.max(...Object.values(scores), 1);
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {Object.entries(scores).map(([k, v]) => (
          <li key={k} className="grid grid-cols-[72px_1fr_32px] items-center gap-2 text-xs">
            <span className={cx('capitalize', k === top ? 'text-fg' : 'text-fg-3')}>{k}</span>
            <span className="h-1.5 rounded-full bg-surface-3"><span className="block h-1.5 rounded-full bg-accent" style={{ width: `${(v / max) * 100}%`, opacity: k === top ? 1 : 0.45 }} /></span>
            <span className="numeric text-right text-fg-3">{v.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LayerCard({ kicker, value, sub, text, uncertain }: { kicker: string; value: string; sub?: string; text: LayerText | null; uncertain?: boolean }) {
  return (
    <article className="card flex flex-col p-5">
      <p className="eyebrow">{kicker}</p>
      <h3 className="mt-1 font-display text-3xl text-fg">{value}</h3>
      {sub && <p className="text-xs text-fg-3">{sub}</p>}
      {uncertain && <Badge tone="warning" className="mt-2 self-start">Could change with the exact birth time</Badge>}
      {text && <p className="mt-3 text-sm leading-relaxed text-fg-2">{text.body}</p>}
      {text?.caveat && <p className="mt-2 text-xs text-fg-3">{text.caveat}</p>}
    </article>
  );
}

/** Share card export. The hidden sigil is non-precise so the image never encodes planetary positions. */
export function ShareCardActions({ identity, onShared }: { identity: CosmicIdentity; onShared?: (format: CardFormat) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState<CardFormat | null>(null);
  const toast = useToast();
  const make = async (format: CardFormat) => {
    if (!svg.current) return;
    setBusy(format);
    try {
      const blob = await renderShareCard(svg.current, identity, format);
      const how = await shareOrDownload(blob, `cosmic-id-${identity.archetype.key}-${format}.png`, `I'm ${identity.archetype.name} — ${identity.archetype.essence}`);
      toast(how === 'shared' ? 'Shared' : 'Card downloaded', 'success');
      onShared?.(format);
    } catch (e) {
      toast((e as Error).message || 'Could not create the card.', 'error');
    }
    setBusy(null);
  };
  return (
    <div>
      <div aria-hidden="true" className="pointer-events-none fixed -left-[9999px] top-0 h-[600px] w-[600px]"><CosmicSigil ref={svg} identity={identity} precise={false} size={600} /></div>
      <div className="flex flex-wrap gap-2">
        <Button icon="share" loading={busy === 'story'} onClick={() => make('story')}>Story card (9:16)</Button>
        <Button variant="secondary" loading={busy === 'square'} onClick={() => make('square')}>Square card</Button>
      </div>
      <p className="mt-2 text-xs text-fg-3">Cards show your archetype and three Vedic layers — never your birth date, time, place or planetary positions.</p>
    </div>
  );
}

/** The full Cosmic ID result, shared by the account-free preview and the signed-in Cosmic ID page. */
export function IdentityResult({ identity, actions, sigilAnimate = false }: { identity: CosmicIdentity; actions?: React.ReactNode; sigilAnimate?: boolean }) {
  const a = identity.archetype;
  const L = identity.layers;
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-full border border-line shadow-[var(--shadow-lift)]">
          <CosmicSigil identity={identity} animate={sigilAnimate} />
        </div>
        <div>
          <p className="eyebrow">Your archetype · {a.element} × {a.modality}</p>
          <h1 className="mt-2 font-display text-5xl leading-[1.02] text-fg md:text-6xl">{a.name}</h1>
          <p className="mt-3 font-display text-2xl italic text-fg-2">{a.essence}</p>
          <p className="mt-5 max-w-2xl leading-relaxed text-fg-2">{a.portrait}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div><p className="eyebrow">Gifts</p><ul className="mt-1 space-y-1 text-sm text-fg">{a.gifts.map((g) => <li key={g}>{g}</li>)}</ul></div>
            <div><p className="eyebrow">Growth edge</p><p className="mt-1 text-sm text-fg">{a.growthEdge}</p></div>
            <div><p className="eyebrow">In bonds</p><p className="mt-1 text-sm text-fg">{a.inBonds}</p></div>
          </div>
          {actions && <div className="mt-7">{actions}</div>}
        </div>
      </section>

      <section aria-labelledby="vedic-layers">
        <h2 id="vedic-layers" className="font-display text-3xl">The three Vedic layers</h2>
        <p className="mt-1 text-sm text-fg-2">Calculated in the sidereal zodiac (Lahiri ayanamsa).</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <LayerCard kicker="Rashi · Moon sign" value={L.rashi.value} sub={`Moon in sidereal ${L.rashi.english}`} text={L.rashi.text} uncertain={L.rashi.reliability !== 'reliable'} />
          <LayerCard kicker="Janma Nakshatra" value={L.nakshatra.value} sub={`Pada ${L.nakshatra.pada} · lord ${L.nakshatra.lord} · ${L.nakshatra.symbol}`} text={L.nakshatra.text} uncertain={L.nakshatra.reliability !== 'reliable'} />
          {L.lagna
            ? <LayerCard kicker="Lagna · Ascendant" value={L.lagna.value} sub={`Rising in sidereal ${L.lagna.english}`} text={L.lagna.text} uncertain={L.lagna.reliability !== 'reliable'} />
            : <article className="card p-5"><p className="eyebrow">Lagna · Ascendant</p><h3 className="mt-1 font-display text-3xl text-fg-3">Needs a birth time</h3><p className="mt-3 text-sm text-fg-2">The Lagna changes roughly every two hours, so we don’t guess it. Add a birth time later to reveal it.</p></article>}
        </div>
      </section>

      <section aria-labelledby="western-view" className="grid gap-4 md:grid-cols-3">
        <h2 id="western-view" className="font-display text-2xl md:col-span-3">The Western view</h2>
        <LayerCard kicker="Sun · tropical" value={L.westernSun.value} text={L.westernSun.text} />
        <LayerCard kicker="Moon · tropical" value={L.westernMoon.value} text={L.westernMoon.text} uncertain={L.westernMoon.reliability !== 'reliable'} />
        {L.westernRising
          ? <LayerCard kicker="Rising · tropical" value={L.westernRising.value} text={L.westernRising.text} uncertain={L.westernRising.reliability !== 'reliable'} />
          : <article className="card p-5"><p className="eyebrow">Rising · tropical</p><h3 className="mt-1 font-display text-3xl text-fg-3">Needs a birth time</h3></article>}
      </section>

      <section className="card grid gap-6 p-6 md:grid-cols-[1fr_1fr_1.2fr]" aria-labelledby="how-derived">
        <ScoreBars title="Element emphasis" scores={a.elements} top={a.element} />
        <ScoreBars title="Modality emphasis" scores={a.modalities} top={a.modality} />
        <div>
          <h2 id="how-derived" className="font-display text-2xl">How this was derived</h2>
          <p className="mt-2 text-sm text-fg-2">{a.elementMeaning} {a.modalityMeaning}</p>
          <p className="mt-2 text-sm text-fg-2">Your strongest element and modality together give {a.name}.{a.blendName ? ` The scores are close, so ${a.blendName} is a strong secondary note.` : ''}{a.includesAscendant ? '' : ' Without a birth time, the Lagna could not be counted.'}</p>
          <p className="mt-2 text-xs text-fg-3">{a.method}</p>
          <p className="mt-2 text-xs text-fg-3">{a.disclaimer}</p>
        </div>
      </section>
      {identity.warnings.length > 0 && <Notice tone="warning" title="About this calculation">{identity.warnings.map((w) => <p key={w}>{w}</p>)}</Notice>}
    </div>
  );
}

export function Discover() {
  const me = useMe().data?.user;
  const nav = useNavigate();
  const [identity, setIdentity] = useState<CosmicIdentity | null>(null);
  const [stage, setStage] = useState<'form' | 'reveal' | 'result'>('form');
  const [last, setLast] = useState<BirthValues | null>(null);

  const submit = async (v: BirthValues) => {
    const { placeObject: _placeObject, fullName: _fullName, ...body } = v;
    const r = await post<CosmicIdentity>('discover/cosmic-id', body);
    setLast(v);
    setIdentity(r);
    setStage('reveal');
    window.scrollTo({ top: 0 });
  };

  const save = () => {
    if (!last) return;
    savePendingBirth({
      date: last.date, time: last.time, timePrecision: last.timePrecision,
      ...(last.place.kind === 'manual' ? { manual: { name: last.place.name, latitude: last.place.latitude, longitude: last.place.longitude } } : { place: last.placeObject }),
    });
    publicEvent('cosmic_id_preview_signup_clicked');
    nav(me ? '/onboarding' : '/signup?from=discover');
  };

  if (stage === 'reveal' && identity) return <Reveal identity={identity} onDone={() => setStage('result')} />;

  if (stage === 'result' && identity) {
    return (
      <div className="py-8">
        <Notice tone="info" className="mb-8" title="This preview is not saved">
          We calculated this in memory and stored nothing. Save it to keep your Cosmic ID, explore your full chart and compare with people you invite.
        </Notice>
        <IdentityResult identity={identity} actions={
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={save}>Save my Cosmic ID</Button>
              <Button size="lg" variant="secondary" onClick={() => { setStage('form'); setIdentity(null); }}>Change details</Button>
            </div>
            <ShareCardActions identity={identity} onShared={() => publicEvent('cosmic_id_card_downloaded')} />
          </div>
        } />
        <section className="card mt-10 grid gap-6 p-8 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-3xl">See how you fit with someone</h2>
            <p className="mt-2 text-fg-2">Bonds compare two charts — Vedic Guna Milan and Western dimensions, explained — only after the other person agrees. Each of you controls what is shared and can revoke it at any time.</p>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <Button onClick={save}>Save and invite someone</Button>
            <p className="text-xs text-fg-3">Comparing needs an account, so both of you can give and withdraw consent.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 py-10 lg:grid-cols-[1fr_1.1fr]">
      <section>
        <p className="eyebrow">Cosmic ID · no account needed</p>
        <h1 className="mt-3 font-display text-5xl leading-[1.04]">Find your archetype in under a minute.</h1>
        <p className="mt-4 leading-relaxed text-fg-2">Enter your birth details. We calculate your Vedic and Western charts with real astronomy and show you your archetype, your Rashi, Janma Nakshatra and Lagna — each with the method behind it.</p>
        <ul className="mt-6 space-y-2 text-sm text-fg-2">
          <li>✦ Nothing is stored unless you choose to save it.</li>
          <li>✦ Unknown birth time is fine — we mark what could change.</li>
          <li>✦ No AI. Every sentence was written by a person; every position is calculated.</li>
        </ul>
        <p className="mt-6 text-xs text-fg-3">Already have an account? <Link to="/signin" className="text-accent hover:underline">Sign in</Link></p>
      </section>
      <section className="card p-6 md:p-8">
        <BirthForm onSubmit={submit} showName={false} submitLabel="Reveal my Cosmic ID"
          consentLabel="I am 18 or older and agree to my birth details being processed to calculate this preview."
          consentDescription="The preview is calculated in memory and not stored. Nakshatra is for adults only." />
      </section>
    </div>
  );
}
