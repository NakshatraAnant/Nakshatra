import { hashSeed } from '../../shared/hash';

/**
 * A star map: one centre and up to MAX_STARS stars on three rings around it. Used for circle worlds (members
 * around their circle) and discovery (people around you). Layout is deterministic: the same people always sit
 * in the same places, so the picture is stable between visits and identical in the 3D and 2D drawings.
 */
export interface MapStar {
  id: string;
  /** 0 = innermost ring, 2 = outermost. */
  ring: 0 | 1 | 2;
  color: string;
  /** Relative size, 1 = ordinary. */
  size: number;
  bright: boolean;
  /** A coloured band around the star (for example a member's tier). */
  halo?: string | null;
  /** Draw a line from the centre to this star. */
  linked?: boolean;
}

export interface PlacedStar extends MapStar { angle: number; radius: number; lift: number }

export const MAX_STARS = 48;
export const RING_RADIUS = [2.3, 3.65, 5] as const;

export function layoutStars(stars: MapStar[]): PlacedStar[] {
  const shown = stars.slice(0, MAX_STARS);
  const perRing = [0, 1, 2].map((r) => shown.filter((s) => s.ring === r));
  return shown.map((s) => {
    const list = perRing[s.ring];
    const i = list.indexOf(s);
    // Each ring starts at its own offset so stars on neighbouring rings do not line up.
    const angle = (i / list.length) * Math.PI * 2 + s.ring * 0.7;
    const lift = ((hashSeed(s.id) % 1000) / 1000 - 0.5) * 0.7;
    return { ...s, angle, radius: RING_RADIUS[s.ring], lift };
  });
}

/** Flat projection used by the 2D drawing: x across, y down, in the same units as the 3D scene. */
export function project2d(p: PlacedStar): { x: number; y: number } {
  return { x: Math.cos(p.angle) * p.radius, y: Math.sin(p.angle) * p.radius * 0.5 - p.lift * 0.5 };
}
