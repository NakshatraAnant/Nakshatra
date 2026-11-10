/**
 * Avatar creator — a drawn avatar built from fixed parts. Every value is a key from the lists below, so the SVG is
 * generated only from our own shapes and colours (no member text or uploads ever reach it). Free for everyone.
 */

const opts = <T extends string>(...o: [T, string][]) => o.map(([key, label]) => ({ key, label }));

export const AVATAR_PARTS = {
  skin: opts(['s1', 'Light'], ['s2', 'Light warm'], ['s3', 'Medium'], ['s4', 'Tan'], ['s5', 'Brown'], ['s6', 'Deep']),
  face: opts(['oval', 'Oval'], ['round', 'Round'], ['long', 'Long']),
  hair: opts(['none', 'None'], ['short', 'Short'], ['crop', 'Crop'], ['curly', 'Curly'], ['long', 'Long'], ['bun', 'Bun'], ['waves', 'Waves'], ['headwrap', 'Head wrap']),
  hairColor: opts(['black', 'Black'], ['darkBrown', 'Dark brown'], ['brown', 'Brown'], ['auburn', 'Auburn'], ['blonde', 'Blonde'], ['grey', 'Grey'], ['violet', 'Violet']),
  eyes: opts(['dot', 'Dot'], ['round', 'Round'], ['smile', 'Smiling'], ['sleepy', 'Sleepy']),
  brows: opts(['flat', 'Flat'], ['arched', 'Arched'], ['none', 'None']),
  mouth: opts(['smile', 'Smile'], ['grin', 'Grin'], ['neutral', 'Neutral'], ['open', 'Open']),
  accessory: opts(['none', 'None'], ['glasses', 'Glasses'], ['roundGlasses', 'Round glasses'], ['earrings', 'Earrings'], ['freckles', 'Freckles']),
  background: opts(['ember', 'Ember'], ['violet', 'Violet'], ['sky', 'Sky'], ['jade', 'Jade'], ['rose', 'Rose'], ['gold', 'Gold'], ['ink', 'Ink']),
} as const;

export type AvatarPart = keyof typeof AVATAR_PARTS;
export type AvatarConfig = { [K in AvatarPart]: string };
export const AVATAR_PART_KEYS = Object.keys(AVATAR_PARTS) as AvatarPart[];
export const partKeys = (p: AvatarPart) => AVATAR_PARTS[p].map((o) => o.key) as [string, ...string[]];

export const DEFAULT_AVATAR: AvatarConfig = { skin: 's3', face: 'oval', hair: 'short', hairColor: 'black', eyes: 'round', brows: 'flat', mouth: 'smile', accessory: 'none', background: 'violet' };

const SKIN: Record<string, string> = { s1: '#f6d7c3', s2: '#eebd9d', s3: '#d39a72', s4: '#b07650', s5: '#8a5534', s6: '#5e3a22' };
const HAIR: Record<string, string> = { black: '#1f1a17', darkBrown: '#3b2a20', brown: '#6b4a2e', auburn: '#8e3b22', blonde: '#d8b26a', grey: '#a7a3a0', violet: '#6b5fc7' };
const BG: Record<string, string> = { ember: '#f38c48', violet: '#afacff', sky: '#69c1fc', jade: '#7ccd8e', rose: '#f696b4', gold: '#e4ac59', ink: '#212635' };
const FACE: Record<string, [number, number]> = { oval: [26, 31], round: [29, 29], long: [24, 33] };

export function normaliseAvatar(raw: unknown): AvatarConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(AVATAR_PART_KEYS.map((p) => [p, typeof r[p] === 'string' && partKeys(p).includes(r[p] as string) ? r[p] : DEFAULT_AVATAR[p]])) as AvatarConfig;
}

/** A random avatar; pass your own random source for determinism. */
export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  return Object.fromEntries(AVATAR_PART_KEYS.map((p) => { const o = AVATAR_PARTS[p]; return [p, o[Math.floor(rand() * o.length) % o.length].key]; })) as AvatarConfig;
}

/** Short stable fingerprint of a config, used to bust image caches when it changes. */
export function avatarVersion(c: AvatarConfig): string {
  let h = 2166136261;
  for (const ch of AVATAR_PART_KEYS.map((p) => c[p]).join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** Renders the avatar as a standalone 128×128 SVG. */
export function renderAvatarSvg(raw: AvatarConfig): string {
  const c = normaliseAvatar(raw);
  const skin = SKIN[c.skin], hair = HAIR[c.hairColor], bg = BG[c.background];
  const [rx, ry] = FACE[c.face];
  const ink = '#1f1a17';
  const shirt = c.background === 'ink' ? '#3c4078' : '#212635';
  const parts: string[] = [];
  parts.push(`<circle cx="64" cy="64" r="64" fill="${bg}"/>`);
  // Hair that falls behind the face and shoulders.
  if (c.hair === 'long') parts.push(`<path d="M${64 - rx - 6},60 C${64 - rx - 8},24 ${64 + rx + 8},24 ${64 + rx + 6},60 L${64 + rx + 8},104 L${64 - rx - 8},104 Z" fill="${hair}"/>`);
  if (c.hair === 'waves') parts.push(`<path d="M${64 - rx - 5},60 C${64 - rx - 7},26 ${64 + rx + 7},26 ${64 + rx + 5},60 Q${64 + rx + 10},78 ${64 + rx + 2},88 L${64 - rx - 2},88 Q${64 - rx - 10},78 ${64 - rx - 5},60 Z" fill="${hair}"/>`);
  parts.push(`<path d="M20,128 C22,100 42,92 64,92 C86,92 106,100 108,128 Z" fill="${shirt}"/>`);
  parts.push(`<rect x="56" y="80" width="16" height="16" rx="5" fill="${skin}"/><rect x="56" y="80" width="16" height="8" fill="#000" opacity="0.08"/>`);
  if (c.accessory === 'earrings') parts.push(`<circle cx="${64 - rx}" cy="72" r="3" fill="#e4ac59"/><circle cx="${64 + rx}" cy="72" r="3" fill="#e4ac59"/>`);
  parts.push(`<ellipse cx="64" cy="62" rx="${rx}" ry="${ry}" fill="${skin}"/>`);
  // Hair over the face.
  const top = 62 - ry;
  const cap = (depth: number) => `<path d="M${64 - rx - 2},${62 - depth} C${64 - rx - 2},${top - 10} ${64 + rx + 2},${top - 10} ${64 + rx + 2},${62 - depth} C${64 + rx - 6},${top + 6} ${64 - rx + 6},${top + 6} ${64 - rx - 2},${62 - depth} Z" fill="${hair}"/>`;
  if (c.hair === 'short' || c.hair === 'long' || c.hair === 'waves') parts.push(cap(4));
  if (c.hair === 'crop') parts.push(cap(14));
  if (c.hair === 'bun') parts.push(cap(8), `<circle cx="64" cy="${top - 6}" r="11" fill="${hair}"/>`);
  if (c.hair === 'curly') for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (0.9 * i) / 6);
    parts.push(`<circle cx="${(64 - Math.cos(a) * (rx + 1)).toFixed(1)}" cy="${(62 - Math.sin(a) * (ry - 2)).toFixed(1)}" r="9" fill="${hair}"/>`);
  }
  if (c.hair === 'headwrap') parts.push(`<path d="M${64 - rx - 4},60 C${64 - rx - 6},${top - 14} ${64 + rx + 6},${top - 14} ${64 + rx + 4},60 C${64 + rx - 4},${top + 10} ${64 - rx + 4},${top + 10} ${64 - rx - 4},60 Z" fill="${hair}"/><path d="M${64 - rx + 2},${top + 8} Q64,${top + 1} ${64 + rx - 2},${top + 8}" stroke="#000" stroke-opacity="0.18" stroke-width="2" fill="none"/>`);
  // Eyes.
  const eye = (x: number) => {
    if (c.eyes === 'dot') return `<circle cx="${x}" cy="62" r="2.6" fill="${ink}"/>`;
    if (c.eyes === 'round') return `<circle cx="${x}" cy="62" r="4.6" fill="#fff"/><circle cx="${x}" cy="62.5" r="2.3" fill="${ink}"/>`;
    if (c.eyes === 'smile') return `<path d="M${x - 4},63 Q${x},58.5 ${x + 4},63" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    return `<path d="M${x - 4},62 Q${x},65 ${x + 4},62" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  };
  parts.push(eye(54), eye(74));
  if (c.brows === 'flat') parts.push(`<path d="M49,53 L59,53 M69,53 L79,53" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/>`);
  if (c.brows === 'arched') parts.push(`<path d="M49,54 Q54,50 59,53 M69,53 Q74,50 79,54" stroke="${hair}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  if (c.accessory === 'glasses') parts.push(`<g stroke="${ink}" stroke-width="2" fill="none"><rect x="46" y="56" width="16" height="12" rx="3"/><rect x="66" y="56" width="16" height="12" rx="3"/><path d="M62,61 L66,61"/></g>`);
  if (c.accessory === 'roundGlasses') parts.push(`<g stroke="${ink}" stroke-width="2" fill="none"><circle cx="54" cy="62" r="7.5"/><circle cx="74" cy="62" r="7.5"/><path d="M61.5,61 L66.5,61"/></g>`);
  if (c.accessory === 'freckles') parts.push(`<g fill="#000" opacity="0.18">${[[48, 69], [52, 71], [56, 69], [72, 69], [76, 71], [80, 69]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2"/>`).join('')}</g>`);
  // Mouth.
  if (c.mouth === 'smile') parts.push(`<path d="M56,74 Q64,81 72,74" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
  if (c.mouth === 'grin') parts.push(`<path d="M55,73 Q64,84 73,73 Z" fill="${ink}"/><path d="M57.5,74 L70.5,74" stroke="#fff" stroke-width="2"/>`);
  if (c.mouth === 'neutral') parts.push(`<path d="M57,76 L71,76" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`);
  if (c.mouth === 'open') parts.push(`<ellipse cx="64" cy="76" rx="5" ry="4" fill="${ink}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><clipPath id="a"><circle cx="64" cy="64" r="64"/></clipPath><g clip-path="url(#a)">${parts.join('')}</g></svg>`;
}

export const avatarDataUrl = (c: AvatarConfig) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderAvatarSvg(c))}`;

/** The colour behind a colour option (skin, hair colour, background), for picker swatches. */
export function swatch(part: AvatarPart, key: string): string | null {
  const map = part === 'skin' ? SKIN : part === 'hairColor' ? HAIR : part === 'background' ? BG : null;
  return map?.[key] ?? null;
}
