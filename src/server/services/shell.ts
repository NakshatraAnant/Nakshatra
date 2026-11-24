import { and, eq, isNull } from 'drizzle-orm';
import * as s from '../db/schema';
import type { Ctx } from '../lib/context';
import { PERSONA_BY_KEY } from '../../shared/personality';

/**
 * Renders the SPA's index.html with link-preview metadata (Open Graph / Twitter) for the requested URL.
 * Messaging apps read these tags without running JavaScript, so share and invite links need them in the
 * HTML itself. Every inserted value is HTML-escaped; share pages expose only what the share page shows.
 */
export function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const DEFAULT = {
  title: 'Nakshatra — Find your kind of person',
  description: 'Discover your archetype in two minutes, say what you really think, and play with the friends you already have — in private circles only they can see.',
  image: '/visual/brand/png/nakshatra-social-signature-1200x630.png',
};

async function metaFor(ctx: Ctx, path: string): Promise<{ title: string; description: string; image: string; noindex?: boolean }> {
  const share = /^\/s\/([A-Za-z0-9_-]{8,32})$/.exec(path);
  if (share) {
    const [sh] = await ctx.db.select({ key: s.identityShares.archetypeKey, name: s.identityShares.displayName }).from(s.identityShares).where(and(eq(s.identityShares.slug, share[1]), isNull(s.identityShares.revokedAt)));
    const p = sh ? PERSONA_BY_KEY[sh.key] : null;
    if (p) return { title: `${sh!.name ? `${sh!.name} is` : 'Meet'} ${p.name} — Nakshatra`, description: `${p.signature} Which kind of person are you? Find your archetype in two minutes.`, image: DEFAULT.image };
  }
  const year = /^\/y\/([A-Za-z0-9_-]{8,32})$/.exec(path);
  if (year) {
    const [c] = await ctx.db.select({ year: s.yearCards.year, name: s.yearCards.displayName }).from(s.yearCards).where(and(eq(s.yearCards.slug, year[1]), isNull(s.yearCards.revokedAt)));
    if (c) return { title: `${c.name ? `${c.name}’s` : 'A'} ${c.year} on Nakshatra`, description: 'A year of drops, circles and games with friends. Find your archetype in two minutes.', image: DEFAULT.image, noindex: true };
  }
  if (path.startsWith('/c/join/')) return { title: 'You’re invited to a private circle on Nakshatra', description: 'Join your friends’ circle: a daily question, games and a feed only members can see.', image: '/visual/brand/png/circle-invite-og-1200x630.png', noindex: true };
  if (path.startsWith('/gifts/claim/')) return { title: 'You received a gift on Nakshatra', description: 'Open the link to see your gift.', image: DEFAULT.image, noindex: true };
  return DEFAULT;
}

export async function renderShell(ctx: Ctx, shell: string, url: string): Promise<string> {
  const path = url.split('?')[0];
  let m = DEFAULT as Awaited<ReturnType<typeof metaFor>>;
  try { m = await metaFor(ctx, path); } catch { /* fall back to defaults */ }
  const origin = ctx.config.APP_ORIGIN.replace(/\/$/, '');
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Nakshatra" />`,
    `<meta property="og:title" content="${escapeHtml(m.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(m.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(origin + path)}" />`,
    `<meta property="og:image" content="${escapeHtml(origin + m.image)}" />`,
    `<meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    m.noindex ? `<meta name="robots" content="noindex" />` : '',
  ].join('\n    ');
  return shell
    .replace(/<meta property="og:image"[^>]*>/, '')
    // Function replacers: "$&" and similar in a member's name must stay plain text.
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(m.title)}</title>`)
    .replace('</head>', () => `    ${tags}\n  </head>`);
}
