import { useState, type CSSProperties } from 'react';
import { PersonaSigil } from './PersonaSigil';
import { archetypeArt, levelBadge, uiIcon, type ArchetypePart } from '../lib/visual';
import { PERSONA_BY_KEY } from '../../shared/personality';
import { cx } from './ui/primitives';

/**
 * Artwork image. Decorative by default (alt="" + aria-hidden); pass `alt` for
 * meaningful art. Lazy-loads unless `eager`. Width/height reserve space so
 * nothing shifts while the SVG loads. A failed load renders `fallback` (or nothing).
 */
export function Art({ src, alt = '', width, height, eager, className, style, position, fallback = null }: {
  src: string; alt?: string; width?: number; height?: number; eager?: boolean; className?: string; style?: CSSProperties; position?: string; fallback?: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img src={src} alt={alt} aria-hidden={alt ? undefined : true} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={className} style={{ ...style, ...(position ? { objectPosition: position } : {}) }} onError={() => setFailed(true)} />
  );
}

/** Landscape master at ≥768px, portrait below (responsive-guidelines.md). Decorative unless `alt`. */
export function ResponsiveArt({ landscape, portrait, alt = '', className, landscapePosition, portraitPosition, eager }: {
  landscape: string; portrait: string; alt?: string; className?: string; landscapePosition?: string; portraitPosition?: string; eager?: boolean;
}) {
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={landscape} />
      <img src={portrait} alt={alt} aria-hidden={alt ? undefined : true} loading={eager ? 'eager' : 'lazy'} decoding="async"
        className={cx('art-responsive', className)} style={{ ['--pos-l' as string]: landscapePosition ?? '50% 50%', ['--pos-p' as string]: portraitPosition ?? '50% 50%' }} />
    </picture>
  );
}

/**
 * Archetype artwork for the app's real archetype key. Uses `compact` automatically
 * below 96px (sigils need ≥96). Falls back to the procedural sigil if the mapping
 * or file is missing, so an archetype never renders as a broken image.
 */
export function ArchetypeArt({ archetypeKey, part = 'sigil', size, scores, decorative = false, className, eager }: {
  archetypeKey: string; part?: ArchetypePart; size?: number; scores?: Record<string, number>; decorative?: boolean; className?: string; eager?: boolean;
}) {
  const p: ArchetypePart = part === 'sigil' && size !== undefined && size < 96 ? 'compact' : part;
  const src = archetypeArt(archetypeKey, p);
  const name = PERSONA_BY_KEY[archetypeKey]?.name;
  const fallback = <PersonaSigil archetypeKey={archetypeKey} scores={scores} size={size ?? '100%'} className={className} />;
  if (!src) return fallback;
  return <Art src={src} alt={decorative || !name ? '' : `${name} sigil`} width={size} height={size} eager={eager} className={cx('block', size === undefined && 'h-auto w-full', className)} fallback={fallback} />;
}

/** One-colour UI icon from the package (currentColor masters), recoloured with CSS via mask so it follows text colour. */
export { MaskIcon } from './MaskIcon';
import { MaskIcon } from './MaskIcon';

/** Pseudonymous author avatar: dashed ring + eye-off. Never shows archetype art, accent or level. */
export function PseudonymAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-fg/30 text-fg-3" style={{ width: size, height: size }} aria-hidden="true">
      <MaskIcon src={uiIcon('eye-off')} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Inline points glyph (not a coin; points are fictional and non-redeemable). */
export function PointsGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return <MaskIcon src="/visual/rewards/points-glyph.svg" size={size} className={cx('text-accent', className)} />;
}

export function LevelBadge({ level, size = 64, rank }: { level: number; size?: number; rank?: string }) {
  return <Art src={levelBadge(level)} alt={`Level ${level}${rank ? `, ${rank}` : ''} badge`} width={size} height={size} />;
}
