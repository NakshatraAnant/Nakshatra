/**
 * Theme studio — a member's own look for the app: accent colour, text size and corner style, layered on top of
 * the light/dark scheme. Only these safe presets exist (no free-form colours), and every accent is checked for
 * readable contrast against every surface in both schemes (see appearance.test.ts). Free for everyone.
 */

export type Scheme = 'dark' | 'light';
type Tone = { accent: string; strong: string; ink: string };

export const ACCENTS: { key: string; label: string; dark: Tone; light: Tone }[] = [
  { key: 'ember', label: 'Ember', dark: { accent: '#f38c48', strong: '#f6a26a', ink: '#0a0c12' }, light: { accent: '#9a4410', strong: '#7d360b', ink: '#fbf8f2' } },
  { key: 'violet', label: 'Violet', dark: { accent: '#afacff', strong: '#c9c7ff', ink: '#0a0c12' }, light: { accent: '#5d4bb0', strong: '#4a3a95', ink: '#fbf8f2' } },
  { key: 'sky', label: 'Sky', dark: { accent: '#69c1fc', strong: '#8fd1fd', ink: '#0a0c12' }, light: { accent: '#225585', strong: '#1a446b', ink: '#fbf8f2' } },
  { key: 'jade', label: 'Jade', dark: { accent: '#7ccd8e', strong: '#9bdaa9', ink: '#0a0c12' }, light: { accent: '#22603f', strong: '#1a4c31', ink: '#fbf8f2' } },
  { key: 'rose', label: 'Rose', dark: { accent: '#f696b4', strong: '#f9b3c9', ink: '#0a0c12' }, light: { accent: '#9b2f55', strong: '#7f2545', ink: '#fbf8f2' } },
  { key: 'gold', label: 'Gold', dark: { accent: '#e4ac59', strong: '#ecc07f', ink: '#0a0c12' }, light: { accent: '#6f4f19', strong: '#5a3f12', ink: '#fbf8f2' } },
];

export const TEXT_SIZES = [
  { key: 'standard', label: 'Standard', scale: '100%' },
  { key: 'large', label: 'Large', scale: '112.5%' },
  { key: 'larger', label: 'Larger', scale: '125%' },
] as const;

export const CORNERS = [
  { key: 'soft', label: 'Soft', radii: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28 } },
  { key: 'crisp', label: 'Crisp', radii: { xs: 2, sm: 4, md: 6, lg: 8, xl: 12 } },
] as const;

/** The surfaces accent text and accent fills sit on, per scheme (mirrors app.css). */
export const SURFACES: Record<Scheme, string[]> = {
  dark: ['#0a0c12', '#0f121a', '#161a25', '#212635'],
  light: ['#f6f1e8', '#fbf8f2', '#f0e9dc', '#e6ddcc'],
};

export type Appearance = { accent: string; textSize: string; corners: string };
export const DEFAULT_APPEARANCE: Appearance = { accent: 'ember', textSize: 'standard', corners: 'soft' };
export const ACCENT_KEYS = ACCENTS.map((a) => a.key) as [string, ...string[]];
export const TEXT_SIZE_KEYS = TEXT_SIZES.map((t) => t.key) as [string, ...string[]];
export const CORNER_KEYS = CORNERS.map((c) => c.key) as [string, ...string[]];

/** Anything unknown (old data, a removed preset) falls back to the default for that field. */
export function normaliseAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown, keys: string[], d: string) => (typeof v === 'string' && keys.includes(v) ? v : d);
  return {
    accent: pick(r.accent, ACCENT_KEYS, DEFAULT_APPEARANCE.accent),
    textSize: pick(r.textSize, TEXT_SIZE_KEYS, DEFAULT_APPEARANCE.textSize),
    corners: pick(r.corners, CORNER_KEYS, DEFAULT_APPEARANCE.corners),
  };
}

/** CSS custom properties (and root font size) for an appearance in a scheme. */
export function appearanceVars(a: Appearance, scheme: Scheme): Record<string, string> {
  const n = normaliseAppearance(a);
  const tone = ACCENTS.find((x) => x.key === n.accent)![scheme];
  const radii = CORNERS.find((c) => c.key === n.corners)!.radii;
  return {
    '--accent': tone.accent, '--accent-strong': tone.strong, '--accent-ink': tone.ink,
    ...Object.fromEntries(Object.entries(radii).map(([k, v]) => [`--radius-${k}`, `${v}px`])),
    'font-size': TEXT_SIZES.find((t) => t.key === n.textSize)!.scale,
  };
}

/* ---------- WCAG contrast ---------- */

function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
