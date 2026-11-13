import { Suspense, lazy, useMemo, useState } from 'react';
import { Button, Card, cx } from './ui/primitives';
import { avatarDataUrl, swatch, type AvatarConfig } from '../../shared/avatar';
import { OFFERING_LABEL, type OfferingKind } from '../../shared/creator';

/* three.js stays behind these imports: a page only pays for it when a scene is shown. */
const AvatarStage3D = lazy(() => import('../three/showcase').then((m) => ({ default: m.AvatarStage3D })));
const CreatorShowcase3D = lazy(() => import('../three/showcase').then((m) => ({ default: m.CreatorShowcase3D })));

/* ---------------- Avatar stage ---------------- */

/**
 * The avatar preview, flat or on a 3D stage. Flat is the default; the stage is opt-in and remembers nothing
 * beyond this visit. Both show exactly the same picture.
 */
export function AvatarPreview({ config }: { config: AvatarConfig }) {
  const [stage, setStage] = useState(false);
  const src = useMemo(() => avatarDataUrl(config), [config]);
  // The blink frame: same avatar, eyes closed. Sleepy eyes already look closed, so they never blink.
  const blinkSrc = useMemo(() => (config.eyes === 'sleepy' ? null : avatarDataUrl({ ...config, eyes: 'sleepy' })), [config]);
  const flat = <img src={src} alt="Your avatar preview" width={240} height={240} className="mx-auto aspect-square w-full max-w-[240px] rounded-full border border-line" />;
  return (
    <div className="space-y-2">
      {stage ? (
        <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-[var(--radius-xl)] bg-canvas-deep" data-theme="dark" data-testid="avatar-stage">
          <Suspense fallback={<div className="absolute inset-[12%]">{flat}</div>}>
            <AvatarStage3D src={src} blinkSrc={blinkSrc} rim={swatch('background', config.background) ?? '#d9b26f'} label="Your avatar as a medallion on a small stage. It flips when you change something and blinks now and then." fallback={<div className="absolute inset-[12%]">{flat}</div>} />
          </Suspense>
        </div>
      ) : flat}
      <div className="text-center">
        <Button size="sm" variant="ghost" aria-pressed={stage} onClick={() => setStage((s) => !s)}>{stage ? 'Flat view' : 'View on a 3D stage'}</Button>
      </div>
    </div>
  );
}

/* ---------------- Creator showcase ---------------- */

const KIND_SHAPE: Record<string, string> = { membership: 'ring', digital: 'tablet', session: 'sphere', workshop: 'cone', newsletter: 'crystal' };

function Showcase2D({ items, selected, accent }: { items: { id: string; kind: string; owned: boolean }[]; selected: string | null; accent: string }) {
  const n = items.length, R = n === 1 ? 0 : Math.min(2.6, 0.9 + n * 0.3);
  return (
    <svg viewBox="-3.6 -1.8 7.2 3.6" className="absolute inset-0 h-full w-full" aria-hidden="true">
      {items.map((it, i) => {
        const a = (i / n) * Math.PI * 2, x = Math.sin(a) * R, y = Math.cos(a) * R * 0.3, on = it.id === selected;
        return <circle key={it.id} cx={x} cy={y} r={on ? 0.42 : 0.3} fill={on ? '#ffffff' : it.owned ? accent : '#9a98b8'} fillOpacity={0.9} />;
      })}
    </svg>
  );
}

/**
 * A creator's offerings on a small carousel. Choosing one (here or in the list) scrolls to it in the page, where
 * its price and buttons are. The scene shows no prices and has no buy buttons of its own.
 */
export function CreatorShowcase({ name, offerings }: { name: string; offerings: { id: string; kind: OfferingKind; title: string; owned: boolean }[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const accent = '#d9b26f';
  const items = useMemo(() => offerings.map((o) => ({ id: o.id, kind: o.kind, title: o.title, owned: o.owned })), [offerings]);
  const cur = offerings.find((o) => o.id === selected);
  const pick = (id: string) => setSelected((s) => (s === id ? null : id));
  const still = <Showcase2D items={items} selected={selected} accent={accent} />;
  if (!offerings.length) return null;
  return (
    <Card className="space-y-3" aria-label="Creator showcase">
      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-[var(--radius-lg)] bg-canvas-deep" data-theme="dark">
        <div className="absolute inset-0">
          <Suspense fallback={still}>
            <CreatorShowcase3D items={items} selected={selected} onSelect={pick} accent={accent} label={`${name}’s ${offerings.length} offering${offerings.length === 1 ? '' : 's'} as shapes on a carousel. Use the list beside it to look through them.`} fallback={still} />
          </Suspense>
        </div>
      </div>
      <div role="group" aria-label="Offerings in the showcase" className="flex flex-wrap gap-1.5">
        {offerings.map((o) => (
          <button key={o.id} type="button" aria-pressed={selected === o.id} onClick={() => pick(o.id)}
            className={cx('rounded-full border px-2.5 py-1 text-xs', selected === o.id ? 'border-fg text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
            {o.title}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-fg" role="status">
          {cur ? `${cur.title} · ${OFFERING_LABEL[cur.kind]} (the ${KIND_SHAPE[cur.kind] ?? 'shape'})${cur.owned ? ' · unlocked' : ''}` : 'Each kind of offering has its own shape. Glowing ones are yours.'}
        </p>
        {cur && <Button size="sm" variant="ghost" onClick={() => document.getElementById(`offering-${cur.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>See details</Button>}
      </div>
    </Card>
  );
}
