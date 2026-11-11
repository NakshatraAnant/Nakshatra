import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { get } from '../lib/api';
import { Card, cx } from './ui/primitives';
import { Constellation } from './ui/data';
import { ArchetypeArt, ResponsiveArt } from './visual';
import { achievementArt, archetypeAccent, envArt } from '../lib/visual';
import type { Persona } from '../lib/persona';
import { worldFor } from '../three/archetypeWorlds';
import { ACHIEVEMENTS, type AchievementFamily } from '../../shared/gamification';

/* three.js stays behind these imports: a page only pays for it when a scene is shown. */
const IdentityScene3D = lazy(() => import('../three/identity').then((m) => ({ default: m.IdentityScene3D })));
const AchievementGallery3D = lazy(() => import('../three/gallery').then((m) => ({ default: m.AchievementGallery3D })));

/* ---------------- Profile world ---------------- */

interface PublicIdentity { handle: string; displayName: string; persona: Pick<Persona, 'key' | 'name' | 'signature' | 'traits' | 'dimensions'> | null }

/**
 * A person's identity world on their profile. It is drawn only from what the server returns for this viewer
 * (identity/u/:handle applies profile visibility, blocks and the per-field "persona" setting), so a hidden
 * archetype simply shows nothing here.
 */
export function ProfileWorld({ handle, self }: { handle: string; self: boolean }) {
  const q = useQuery({ queryKey: ['public-identity', handle], queryFn: () => get<PublicIdentity>(`identity/u/${handle}`), retry: false });
  const persona = q.data?.persona ?? null;
  const data = useMemo(() => persona && ({
    archetypeKey: persona.key, accent: archetypeAccent(persona.key),
    dimensions: persona.dimensions.map((d) => ({ key: d.key, name: d.name, score: d.score })), blend: null,
  }), [persona]);
  if (!persona || !data) return null;
  const world = worldFor(persona.key);
  const scores = Object.fromEntries(persona.dimensions.map((d) => [d.key, d.score]));
  const still = <div className="absolute inset-0"><ResponsiveArt landscape={envArt('identity-reveal', 'landscape')} portrait={envArt('identity-reveal', 'portrait')} landscapePosition="50% 50%" portraitPosition="50% 40%" /></div>;
  const who = self ? 'Your' : `${q.data!.displayName}’s`;
  return (
    <Card className="mt-6 grid items-center gap-4 overflow-hidden p-0 sm:grid-cols-[minmax(0,240px)_1fr]" aria-label="Identity world" data-testid="profile-world">
      <div className="relative aspect-square w-full bg-canvas-deep sm:aspect-auto sm:h-full sm:min-h-[220px]" data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <IdentityScene3D data={data} label={`${world.caption} Five rings stand for five identity dimensions.`} fallback={still} />
          </Suspense>
        </div>
        <div className="pointer-events-none absolute inset-[30%]"><ArchetypeArt archetypeKey={persona.key} scores={scores} decorative /></div>
      </div>
      <div className="min-w-0 space-y-2 p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-fg-3">{who} identity world</p>
        <p className="font-display text-3xl leading-tight">{persona.name}</p>
        <p className="text-sm text-fg-2">{persona.signature}</p>
        {persona.traits.length > 0 && <p className="text-sm text-fg-3">{persona.traits.slice(0, 3).join(' · ')}</p>}
        <p className="text-xs text-fg-3">{world.caption}</p>
        {self
          ? <Link to="/identity" className="inline-block text-sm text-accent hover:underline">Explore your five dimensions →</Link>
          : <Link to="/personality" className="inline-block text-sm text-accent hover:underline">Find your own archetype →</Link>}
      </div>
    </Card>
  );
}

/* ---------------- Achievement gallery ---------------- */

interface AchievementRow { key: string; family?: string; title: string; description: string; earnedAt: string | null }

const FAMILY_LABEL: Record<AchievementFamily, string> = {
  identity: 'Identity', learning: 'Learning', reflection: 'Reflection', relationships: 'Relationships',
  community: 'Community', creativity: 'Creativity', events: 'Events', annual: 'Yearly',
};
const DEF = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

/**
 * Every achievement as a medallion on one carousel: gold once earned, dark until then. The list beside it holds
 * the same information and drives the scene, so the gallery is fully usable without 3D.
 */
export function AchievementGallery({ achievements }: { achievements: AchievementRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const items = useMemo(() => achievements.map((a) => ({ key: a.key, title: a.title, earned: Boolean(a.earnedAt), points: DEF.get(a.key)?.constellation ?? [[0, 0]] })), [achievements]);
  const pick = (k: string) => setSelected((s) => (s === k ? null : k));
  const earned = achievements.filter((a) => a.earnedAt).length;
  const current = achievements.find((a) => a.key === selected) ?? null;
  const families = (Object.keys(FAMILY_LABEL) as AchievementFamily[]).map((f) => [f, achievements.filter((a) => (a.family ?? DEF.get(a.key)?.family) === f)] as const).filter(([, list]) => list.length > 0);
  // Without 3D: the chosen medallion's own artwork (or the newest earned one).
  const shown = current ?? [...achievements].filter((a) => a.earnedAt).sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt)))[0] ?? null;
  const art = shown ? achievementArt(shown.key) : null;
  const still = (
    <div className="absolute inset-0 flex items-center justify-center">
      {shown && art ? <img src={art} alt="" className={cx('h-2/5 w-2/5', !shown.earnedAt && 'opacity-40 grayscale')} />
        : <Constellation points={(shown && DEF.get(shown.key)?.constellation) || [[0, 1], [1, 0], [2, 1]]} size={120} lit={Boolean(shown?.earnedAt)} />}
    </div>
  );
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Card className="space-y-4" aria-label="Achievement gallery">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Achievements</h2>
        <p className="text-sm text-fg-2 numeric">{earned} of {achievements.length} earned</p>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep" data-theme="dark">
            <div className="absolute inset-0">
              <Suspense fallback={still}>
                <AchievementGallery3D items={items} selected={selected} onSelect={pick} label={`A carousel of ${achievements.length} medallions, ${earned} earned. Use the list beside it to look through them.`} fallback={still} />
              </Suspense>
            </div>
          </div>
          <p className="min-h-10 text-sm text-fg" role="status">
            {current ? `${current.title} — ${current.description} ${current.earnedAt ? `Earned ${when(current.earnedAt)}.` : 'Not earned yet.'}`
              : earned ? 'Pick a medallion to see what it was for. Gold ones are yours.' : 'Your first achievement is one quest away. Pick a medallion to see how to earn it.'}
          </p>
        </div>
        <div className="space-y-3">
          {families.map(([f, list]) => (
            <section key={f} aria-label={FAMILY_LABEL[f]}>
              <h3 className="text-xs uppercase tracking-[0.12em] text-fg-3">{FAMILY_LABEL[f]}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {list.map((a) => {
                  const on = selected === a.key;
                  return (
                    <li key={a.key}>
                      <button type="button" aria-pressed={on} onClick={() => pick(a.key)}
                        className={cx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', on ? 'border-fg text-fg' : a.earnedAt ? 'border-accent/50 text-fg hover:border-accent' : 'border-line text-fg-3 hover:border-line-strong')}>
                        <span aria-hidden="true" className={cx('h-1.5 w-1.5 rounded-full', a.earnedAt ? 'bg-accent' : 'border border-line-strong')} />
                        {a.title}<span className="sr-only">{a.earnedAt ? ' (earned)' : ' (not earned yet)'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Card>
  );
}
