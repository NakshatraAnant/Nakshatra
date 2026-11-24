/**
 * Graphics quality (per device, kept in this browser only). No three.js import here, so pages can read and set
 * it without loading any 3D code.
 *
 *  auto      device-based starting level, steps down if the frame rate drops
 *  eco       still image quality: drawn on demand only, fewest particles, 1× pixels
 *  balanced  continuous but light
 *  high      full scene
 *  ultra     full scene, densest particles, up to 2× pixels
 */
export const GRAPHICS_LEVELS = [
  { key: 'auto', label: 'Automatic' },
  { key: 'eco', label: 'Eco' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'high', label: 'High' },
  { key: 'ultra', label: 'Ultra' },
] as const;
export type GraphicsLevel = (typeof GRAPHICS_LEVELS)[number]['key'];
export type SceneTier = 'low' | 'medium' | 'high';

const KEY = 'nk_graphics';
const EVENT = 'nk:graphics';

export function getGraphicsLevel(): GraphicsLevel {
  try {
    const v = localStorage.getItem(KEY);
    if (GRAPHICS_LEVELS.some((l) => l.key === v)) return v as GraphicsLevel;
  } catch { /* storage unavailable */ }
  return 'auto';
}

export function setGraphicsLevel(level: GraphicsLevel) {
  try { localStorage.setItem(KEY, level); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

export function onGraphicsChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export interface GraphicsProfile {
  /** Starting tier for geometry and particle budgets; null = decide from the device. */
  tier: SceneTier | null;
  maxDpr: number;
  /** Draw only when something changes (no idle animation). */
  onDemand: boolean;
  /** Multiplier for optional particles (satellites, dust). */
  density: number;
  /** Whether the scene may step its tier down when frames drop. */
  adaptive: boolean;
}

export function profileFor(level: GraphicsLevel): GraphicsProfile {
  switch (level) {
    case 'eco': return { tier: 'low', maxDpr: 1, onDemand: true, density: 0.4, adaptive: false };
    case 'balanced': return { tier: 'medium', maxDpr: 1.5, onDemand: false, density: 0.7, adaptive: true };
    case 'high': return { tier: 'high', maxDpr: 1.75, onDemand: false, density: 1, adaptive: true };
    case 'ultra': return { tier: 'high', maxDpr: 2, onDemand: false, density: 1.4, adaptive: false };
    default: return { tier: null, maxDpr: 1.75, onDemand: false, density: 1, adaptive: true };
  }
}
