import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, patch } from '../lib/api';
import { useMe } from '../lib/session';
import { Button, Card, cx } from './ui/primitives';
import { useToast } from './ui/overlays';
import { archetypeAccent } from '../lib/visual';
import type { Persona } from '../lib/persona';
import { normaliseAppearance } from '../../shared/appearance';
import { BACKDROP_COLORS, DEFAULT_UNIVERSE, UNIVERSE_LABEL, UNIVERSE_OPTIONS, UNIVERSE_PARTS, type Universe } from '../../shared/universe';
import { PERSONA_ARCHETYPES } from '../../shared/personality';

const IdentityScene3D = lazy(() => import('../three/identity').then((m) => ({ default: m.IdentityScene3D })));

/** The signed-in member's saved universe (defaults until they change it). */
export function useMyUniverse(): Universe {
  const a = useMe().data?.user?.profile?.appearance;
  return useMemo(() => normaliseAppearance(a).world, [a]);
}

/**
 * Universe Studio: choose the environment your identity world lives in. Choices preview live on your own world
 * and are only stored when you press Save; Reset returns the choices to the defaults (also saved only on Save).
 */
export function UniverseStudio() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data?.user;
  const saved = useMyUniverse();
  const [draft, setDraft] = useState<Universe>(saved);
  useEffect(() => setDraft(saved), [saved]);
  const identity = useQuery({ queryKey: ['identity-me'], queryFn: () => get<{ persona: Persona | null }>('identity/me') });
  const persona = identity.data?.persona ?? null;
  const save = useMutation({
    mutationFn: () => patch('profile', { appearance: { ...normaliseAppearance(me?.profile?.appearance), world: draft } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['me'] }); toast('Universe saved', 'success'); },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Could not save your universe', 'error'),
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(draft) === JSON.stringify(DEFAULT_UNIVERSE);
  // Your own world when you have a result; otherwise a clearly-labelled sample so the choices are still visible.
  const key = persona?.key ?? PERSONA_ARCHETYPES[0].key;
  const data = useMemo(() => ({
    archetypeKey: key, accent: archetypeAccent(key),
    dimensions: persona ? persona.dimensions.map((d) => ({ key: d.key, name: d.name, score: d.score })) : ['energy', 'compass', 'voice', 'tempo', 'horizon'].map((k) => ({ key: k, name: k, score: 0 })),
    blend: null, universe: draft,
  }), [key, persona, draft]);
  const [top, bottom] = BACKDROP_COLORS[draft.backdrop] ?? BACKDROP_COLORS.nebula;
  const still = <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 40%, ${bottom}, ${top} 70%)` }} aria-hidden="true" />;
  return (
    <Card className="space-y-4" aria-label="Universe Studio">
      <div>
        <h2 className="font-display text-2xl">Your universe</h2>
        <p className="text-sm text-fg-2">The environment around your identity world, on Home, your profile and your reveal. It changes how things look, never your result.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-2">
          <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep" data-theme="dark" data-testid="universe-preview" data-universe={JSON.stringify(draft)}>
            <div className="absolute inset-0">
              <Suspense fallback={still}>
                <IdentityScene3D data={data} label="A preview of your identity world with the choices beside it." fallback={still} />
              </Suspense>
            </div>
          </div>
          <p className="text-xs text-fg-3">{persona ? `Preview on your own world (${persona.name}).` : 'Preview on a sample world. Take the assessment to see it on yours.'}</p>
        </div>
        <div className="space-y-4">
          {UNIVERSE_PARTS.map((p) => (
            <section key={p} className="space-y-1.5">
              <h3 id={`uni-${p}`} className="text-sm font-semibold text-fg">{UNIVERSE_LABEL[p]}</h3>
              <div role="radiogroup" aria-labelledby={`uni-${p}`} className="flex flex-wrap gap-1.5">
                {UNIVERSE_OPTIONS[p].map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={draft[p] === o.key} title={o.hint} onClick={() => setDraft({ ...draft, [p]: o.key })}
                    className={cx('rounded-full border px-3 py-1.5 text-sm', draft[p] === o.key ? 'border-fg text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
                    {o.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Save universe</Button>
            <Button variant="ghost" size="sm" disabled={isDefault} onClick={() => setDraft(DEFAULT_UNIVERSE)}>Reset to defaults</Button>
            <span className="text-xs text-fg-3" role="status">{dirty ? 'Previewing — not saved yet.' : 'Saved.'}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
