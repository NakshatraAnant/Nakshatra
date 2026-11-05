import type { CSSProperties } from 'react';
import { cx } from './ui/primitives';

/**
 * Single-colour icon drawn from an SVG mask, tinted with currentColor. Kept in its own module so the
 * app shell does not pull the archetype art system (and the personality model) into the first download.
 */
export function MaskIcon({ src, size = 20, label, className }: { src: string; size?: number; label?: string; className?: string }) {
  const style = { width: size, height: size, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` } as CSSProperties;
  return <span role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className={cx('mask-icon inline-block shrink-0 bg-current', className)} style={style} />;
}
