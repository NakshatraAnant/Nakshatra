import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, patch } from '../lib/api';
import { useMe, type Me } from '../lib/session';
import { Badge, Button, Card, PageHeader, Switch, cx } from '../components/ui/primitives';
import { Segmented, useToast } from '../components/ui/overlays';
import { ACCENTS, CORNERS, DEFAULT_APPEARANCE, TEXT_SIZES, normaliseAppearance, type Appearance } from '../../shared/appearance';

type Prefs = { colorScheme?: 'system' | 'dark' | 'light'; appearance?: Appearance; reducedMotion?: boolean };

/** Theme studio: your own look for the whole app. Changes apply instantly and follow you to every device. */
export function ThemeStudioPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe().data?.user;
  const save = useMutation({
    mutationFn: (body: Prefs) => patch('profile', body),
    onMutate: (body) => {
      // Apply at once; the server copy follows.
      qc.setQueryData<{ user: Me | null }>(['me'], (old) => old?.user?.profile ? { ...old, user: { ...old.user, profile: { ...old.user.profile, ...body } } } : old);
    },
    onError: (e) => { void qc.invalidateQueries({ queryKey: ['me'] }); toast(e instanceof ApiError ? e.message : 'Could not save', 'error'); },
  });
  if (!me?.profile) return null;
  const a = normaliseAppearance(me.profile.appearance);
  const set = (p: Partial<Appearance>) => save.mutate({ appearance: { ...a, ...p } });
  const scheme = me.profile.colorScheme;
  const dark = scheme === 'dark' || (scheme === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader kicker="You" title="Theme studio" subtitle="Make Nakshatra feel like yours. Changes apply straight away, on every device you use." />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="space-y-5">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Mode</h2>
            <Segmented label="Mode" value={me.profile.colorScheme} onChange={(v) => save.mutate({ colorScheme: v })} options={[{ value: 'system', label: 'Device' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
          </section>
          <section className="space-y-2">
            <h2 id="accent-h" className="text-sm font-semibold text-fg">Accent colour</h2>
            <div role="radiogroup" aria-labelledby="accent-h" className="grid grid-cols-3 gap-2">
              {ACCENTS.map((c) => {
                const on = a.accent === c.key;
                return (
                  <button key={c.key} type="button" role="radio" aria-checked={on} onClick={() => set({ accent: c.key })}
                    className={cx('flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm', on ? 'border-fg text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
                    <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full" style={{ background: (dark ? c.dark : c.light).accent }} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Text size</h2>
            <Segmented label="Text size" value={a.textSize} onChange={(v) => set({ textSize: v })} options={TEXT_SIZES.map((t) => ({ value: t.key, label: t.label }))} />
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Corners</h2>
            <Segmented label="Corners" value={a.corners} onChange={(v) => set({ corners: v })} options={CORNERS.map((c) => ({ value: c.key, label: c.label }))} />
          </section>
          <Switch label="Reduce motion" description="Turns off 3D animation and transitions everywhere." checked={me.profile.reducedMotion} onChange={(v) => save.mutate({ reducedMotion: v })} />
          <Button variant="ghost" size="sm" disabled={JSON.stringify(a) === JSON.stringify(DEFAULT_APPEARANCE)} onClick={() => save.mutate({ appearance: DEFAULT_APPEARANCE })}>Reset to the default look</Button>
        </Card>

        <section aria-label="Preview" className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Preview</h2>
          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink">{me.profile.displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <p className="text-sm text-fg">{me.profile.displayName}</p>
                <p className="text-xs text-fg-3">in Book club · just now</p>
              </div>
              <Badge className="ml-auto">Preview</Badge>
            </div>
            <p className="text-fg">What’s one small thing that made today better?</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" tabIndex={-1}>Reply</Button>
              <Button size="sm" variant="secondary" tabIndex={-1}>Save</Button>
              <span className="text-sm text-accent">3 replies</span>
            </div>
          </Card>
          <p className="text-xs text-fg-3">Every colour here is checked to keep text readable in both light and dark. Your look is only on your screen — other people see theirs.</p>
        </section>
      </div>
    </div>
  );
}
