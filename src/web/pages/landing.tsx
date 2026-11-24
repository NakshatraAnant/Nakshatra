import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { PublicShell } from '../components/layout/AppShell';
import { ButtonLink } from '../components/ui/primitives';
import { Icon } from '../components/ui/icons';
import { CosmicSigil } from '../components/CosmicSigil';
import { ArchetypeArt, Art, ResponsiveArt } from '../components/visual';
import { publicEvent, type CosmicIdentity } from '../lib/cosmic';
import { BRAND, archetypeArt, gameArt } from '../lib/visual';
import { PERSONA_ARCHETYPES, PERSONA_BY_KEY } from '../../shared/personality';
import { GAMES } from '../../shared/play/engine';
import { IdentityCard } from './studio';
import { CinematicIntro } from '../components/CinematicIntro';
import { introSeen, shouldPlayIntro } from '../lib/intro';
import { prefersReducedMotion, useMe } from '../lib/session';

/**
 * Landing (Ink & Ember): brand hero environment with the promise and one ember CTA,
 * a real sample identity card, the 24 archetype sigils, then the four pillars with
 * their package artwork. Astrology stays an optional path. All copy is live text.
 */
const SAMPLE = PERSONA_BY_KEY.midnight_philosopher;

function CosmicSample() {
  const q = useQuery({ queryKey: ['discover-sample'], queryFn: () => get<{ label: string; identity: CosmicIdentity }>('discover/sample'), staleTime: Infinity });
  const id = q.data?.identity;
  return (
    <div className="mx-auto w-full max-w-[260px]">
      <div className="aspect-square overflow-hidden rounded-full border border-line">{id ? <CosmicSigil identity={id} /> : <div className="h-full w-full skeleton" aria-hidden="true" />}</div>
      {id && <p className="mt-3 text-center text-xs text-fg-3">Sample Cosmic ID · {id.archetype.name} · {id.layers.nakshatra.value}</p>}
    </div>
  );
}

function PillarCard({ eyebrow, title, body, art, position }: { eyebrow: string; title: string; body: string; art: string; position: string }) {
  return (
    <article className="card overflow-hidden">
      <div className="relative aspect-[16/9] bg-surface-2">
        <Art src={art} className="absolute inset-0 h-full w-full object-cover" position={position} />
      </div>
      <div className="p-5">
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="mt-2 font-display text-[28px] leading-tight">{title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-2 text-pretty">{body}</p>
      </div>
    </article>
  );
}

export function Landing() {
  useEffect(() => { publicEvent('landing_viewed'); }, []);
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const replay = params.get('intro') === '1';
  const reduced = prefersReducedMotion() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Decided once the session is known, so a signed-in member never gets the first-visit film by accident.
  const [intro, setIntro] = useState<boolean | null>(null);
  useEffect(() => {
    if (intro !== null && !replay) return;
    if (replay) { setIntro(true); return; }
    if (me.isLoading) return;
    setIntro(shouldPlayIntro({ replay: false, signedIn: !!me.data?.user, seen: introSeen(), reducedMotion: reduced }));
  }, [me.isLoading, me.data, replay]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeIntro = () => { setIntro(false); if (replay) setParams({}, { replace: true }); };
  return (
    <PublicShell>
      {intro && <CinematicIntro still={reduced} onClose={closeIntro} />}
      <section className="relative -mx-4 overflow-hidden md:-mx-8" aria-labelledby="hero-title">
        <div className="absolute inset-0"><ResponsiveArt landscape={BRAND.heroLandscape} portrait={BRAND.heroPortrait} landscapePosition="70% 50%" portraitPosition="50% 30%" eager /></div>
        <div className="scrim-left absolute inset-0 hidden md:block" aria-hidden="true" />
        <div className="scrim-bottom absolute inset-0 md:hidden" aria-hidden="true" />
        <div className="relative mx-auto grid min-h-[min(88dvh,820px)] max-w-6xl items-end gap-10 px-6 pb-14 pt-[34vh] md:items-center md:px-8 md:pt-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow rise-in">A personality-led social network</p>
            <h1 id="hero-title" className="rise-in mt-4 font-display text-[48px] leading-[1] text-fg md:text-[88px] md:leading-[0.96]" style={{ animationDelay: '80ms' }}>
              Discover your kind of person.
            </h1>
            <p className="rise-in mt-5 max-w-xl text-[17px] leading-relaxed text-fg-2 text-pretty" style={{ animationDelay: '160ms' }}>
              Say what you really think. Find your people. Find your archetype in two minutes, share honest thoughts, and play with the friends you already have — in private circles only they can see.
            </p>
            <div className="rise-in mt-8 flex flex-wrap items-center gap-4" style={{ animationDelay: '240ms' }}>
              <ButtonLink to="/personality" size="lg">Find your archetype — no account</ButtonLink>
              <Link to="/discover" className="flex min-h-11 items-center text-sm text-fg-2 underline underline-offset-4 hover:text-fg">Or read your sky (Cosmic ID)</Link>
            </div>
            <p className="mt-5 text-xs text-fg-3">No birth details needed. Nothing is stored unless you save it.</p>
          </div>
          <figure className="hidden w-full max-w-[300px] justify-self-end lg:block">
            <IdentityCard persona={SAMPLE} />
            <figcaption className="eyebrow mt-3 text-center">Sample identity card</figcaption>
          </figure>
        </div>
      </section>

      <section className="py-16 md:py-24" aria-labelledby="archetypes-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">24 archetypes</p>
            <h2 id="archetypes-title" className="mt-2 font-display text-[40px] leading-none md:text-[64px]">Every kind of person, drawn.</h2>
          </div>
          <p className="max-w-sm text-sm text-fg-2">Each archetype has its own sigil and colour. Yours comes from five dimensions of how you think, talk and decide.</p>
        </div>
        <ul className="mt-10 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8" aria-label="The 24 archetypes">
          {PERSONA_ARCHETYPES.map((a) => (
            <li key={a.key} className="group flex flex-col items-center gap-2 text-center">
              <div className="aspect-square w-full max-w-[112px] rounded-full bg-surface p-2"><ArchetypeArt archetypeKey={a.key} part="compact" /></div>
              <span className="hidden text-[11px] leading-tight text-fg-3 sm:block">{a.name.replace(/^The /, '')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="py-8" aria-labelledby="pillars">
        <h2 id="pillars" className="font-display text-[40px] leading-none md:text-[64px]">One place for who you are and who you’re with.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PillarCard eyebrow="Identity" title="Know your archetype" body="Twenty quick statements, five dimensions, one of 24 archetypes — explained, shareable, yours to retake." art={archetypeArt('midnight_philosopher', 'hero-landscape')!} position="66% 50%" />
          <PillarCard eyebrow="Expression" title="Say it honestly" body="Thought Drops, questions, dilemmas and polls. Post under a pen name when you want to say it without the spotlight." art="/visual/social/social-confession-header.svg" position="70% 50%" />
          <PillarCard eyebrow="Belonging" title="Bring your people" body="Private circles for friends you already have: a daily question, a feed only members see, invites you control." art="/visual/circles/circle-cover-old-friends.svg" position="75% 50%" />
          <PillarCard eyebrow="Play" title="Play together" body="Twelve games with real rules — guess who wrote it, vote honestly, write a story together." art={gameArt('archetype_showdown', 'cover')!} position="70% 50%" />
        </div>
      </section>

      <section className="py-16" aria-labelledby="games">
        <p className="eyebrow">Play</p>
        <h2 id="games" className="mt-2 font-display text-[40px] leading-none md:text-[56px]">Games that start better conversations</h2>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {GAMES.map((g) => (
            <li key={g.key} className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
              <div className="aspect-[3/4]"><Art src={gameArt(g.key, 'card')!} className="h-full w-full object-cover" position="50% 30%" /></div>
              <div className="scrim-bottom absolute inset-0" aria-hidden="true" />
              <p className="absolute inset-x-3 bottom-3 text-[15px] font-semibold leading-tight text-[#f2ece1]">{g.name}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card my-12 grid items-center gap-8 p-8 md:grid-cols-[1.4fr_1fr] md:p-12" aria-labelledby="sky">
        <div>
          <p className="eyebrow">Optional · astrology</p>
          <h2 id="sky" className="mt-3 font-display text-[40px] leading-none">Want the sky in it too?</h2>
          <p className="mt-3 leading-relaxed text-fg-2 text-pretty">Add your birth details for a Cosmic ID calculated with real astronomy — Vedic and Western, with every method shown. It sits next to your archetype; it never replaces it.</p>
          <ButtonLink to="/discover" variant="secondary" className="mt-5">Read your sky</ButtonLink>
        </div>
        <CosmicSample />
      </section>

      <section className="grid gap-8 py-12 md:grid-cols-2">
        <div>
          <h2 className="font-display text-[40px] leading-none">Built on rules you can read.</h2>
          <p className="mt-3 leading-relaxed text-fg-2 text-pretty">Archetypes, feed ranking, games and rituals run on Nakshatra’s own documented rules and curated prompts. No AI in the product, no fake activity, and no streaks that punish you for living your life.</p>
        </div>
        <div>
          <h2 className="font-display text-[40px] leading-none">Private by default.</h2>
          <ul className="mt-4 space-y-2 text-sm text-fg-2">
            {['Circles are invisible to anyone outside them', 'Pen names hide who you are from other members (pseudonymous, not anonymous)', 'You choose who sees your archetype, labels and Cosmic ID', 'Share cards never include birth details or your handle', 'Export or delete everything at any time — no data sold'].map((x) => <li key={x} className="flex gap-2"><Icon name="check" size={18} className="shrink-0 text-success" />{x}</li>)}
          </ul>
        </div>
      </section>

      <section className="relative mb-16 overflow-hidden rounded-[var(--radius-xl)] border border-line px-6 py-16 text-center">
        <Art src={BRAND.motif} className="pointer-events-none absolute left-1/2 top-1/2 w-[520px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-25" />
        <div className="relative flex flex-col items-center gap-4">
          <h2 className="font-display text-[48px] leading-none md:text-[72px]">Which kind of person are you?</h2>
          <p className="max-w-lg text-fg-2">24 archetypes, five dimensions, about two minutes. Then bring your friends.</p>
          <ButtonLink to="/personality" size="lg">Find your archetype — no account</ButtonLink>
          <Link to="/signin" className="flex min-h-11 items-center text-sm text-fg-2 underline underline-offset-4 hover:text-fg">I already have an account</Link>
          <Link to="/?intro=1" className="flex min-h-11 items-center text-sm text-fg-3 underline underline-offset-4 hover:text-fg">Watch the introduction</Link>
        </div>
      </section>
    </PublicShell>
  );
}
