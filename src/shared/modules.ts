/**
 * Product module registry (modules-v1) — the single source of truth for which product areas exist,
 * whether they are on by default for the current launch, and which API and page paths belong to them.
 *
 * Enforcement points (all read this registry):
 *  1. API: a global request hook returns 404 `module_disabled` for any path owned by a disabled module.
 *  2. Services/jobs: scheduler jobs that belong to a module skip when it is disabled.
 *  3. Navigation: the app shell shows only enabled modules.
 *  4. Page access: routes owned by a disabled module render an "unavailable" page.
 *  5. Admin: Admin → Flags toggles the same `feature_flags` rows (reversible; no data is deleted).
 *
 * Core modules (identity, thoughts, circles, play, rituals, gamification, referrals, account) cannot be
 * switched off here because shared authentication, account and safety features depend on them.
 */
export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  /** Default for new installations and for the one-time launch-scope switch. */
  defaultEnabled: boolean;
  /** Core modules are always on. */
  core?: boolean;
  /** API path prefixes owned by this module. */
  api: string[];
  /** Front-end path prefixes owned by this module. */
  pages: string[];
  dependsOn?: string[];
}

export const MODULES: ModuleDef[] = [
  { key: 'identity', label: 'Identity Studio', description: 'Assessment, archetypes, identity cards and sharing.', defaultEnabled: true, core: true, api: ['/api/v1/personality', '/api/v1/identity', '/api/v1/share'], pages: ['/identity', '/personality', '/i/', '/s/'] },
  { key: 'thoughts', label: 'Thought Drops', description: 'Posts, comments, reactions, polls, pen names and the feed.', defaultEnabled: true, core: true, api: ['/api/v1/posts', '/api/v1/feed', '/api/v1/comments', '/api/v1/saved-posts', '/api/v1/follows', '/api/v1/users', '/api/v1/blocks', '/api/v1/mutes', '/api/v1/pen-mutes'], pages: ['/thoughts'] },
  { key: 'circles', label: 'Circles', description: 'Private circles, invites, circle events and rituals.', defaultEnabled: true, api: ['/api/v1/circles', '/api/v1/circle-invites', '/api/v1/events'], pages: ['/circles', '/c/join/'] },
  { key: 'creators', label: 'Creator pages', description: 'Opt-in creator pages, storefront listings and tips (payouts not built).', defaultEnabled: true, api: ['/api/v1/creators', '/api/v1/admin/creators'], pages: ['/creators', '/creator-studio'] },
  { key: 'ads', label: 'Sponsored cards', description: 'Staff-reviewed, contextual-only sponsored cards in the feed (no ad billing).', defaultEnabled: false, api: ['/api/v1/ads', '/api/v1/admin/ads'], pages: [] },
  { key: 'partners', label: 'Partner perks', description: 'Disclosed partner offers on one Perks page, tracked links and signed conversion postbacks.', defaultEnabled: false, api: ['/api/v1/perks', '/api/v1/partners', '/api/v1/admin/partners'], pages: ['/perks'] },
  { key: 'people', label: 'People discovery', description: 'Opt-in Discover → People list with connection intents.', defaultEnabled: true, api: ['/api/v1/people'], pages: [] },
  { key: 'play', label: 'Games', description: 'Twelve turn-based social games.', defaultEnabled: true, api: ['/api/v1/play'], pages: ['/play'] },
  { key: 'rituals', label: 'Rituals', description: 'Daily and weekly prompts.', defaultEnabled: true, core: true, api: ['/api/v1/social-rituals'], pages: [] },
  { key: 'gamification', label: 'Progress & rewards', description: 'XP, levels, quests, streaks, seasons and achievements.', defaultEnabled: true, core: true, api: ['/api/v1/journey', '/api/v1/progress', '/api/v1/quests', '/api/v1/seasons', '/api/v1/vibe'], pages: ['/journey', '/progress'] },
  { key: 'referrals', label: 'Invites & referrals', description: 'Referral links and gift claims.', defaultEnabled: true, core: true, api: ['/api/v1/referrals', '/api/v1/gifts'], pages: ['/invite', '/gifts/'] },
  { key: 'premium', label: 'Premium identity catalogue', description: 'Card styles and the Expanded Identity Report. Shown as a preview while payments are disabled.', defaultEnabled: true, api: ['/api/v1/products', '/api/v1/cart', '/api/v1/checkout', '/api/v1/orders', '/api/v1/library', '/api/v1/saved-products'], pages: ['/shop', '/reports/', '/pay/'] },
  { key: 'astrology', label: 'Cosmic ID (optional astrology)', description: 'Birth chart, daily sky, calendar and bonds — optional alongside the archetype.', defaultEnabled: true, api: ['/api/v1/charts', '/api/v1/numerology', '/api/v1/panchang', '/api/v1/calendar', '/api/v1/muhurat', '/api/v1/moon-phases', '/api/v1/daily', '/api/v1/rituals', '/api/v1/insights', '/api/v1/timeline', '/api/v1/recap', '/api/v1/bonds', '/api/v1/report-shares', '/api/v1/shared-reports', '/api/v1/discover', '/api/v1/cosmic-id'], pages: ['/cosmic-id', '/today', '/chart', '/calendar', '/bonds', '/discover', '/shared-report'] },
  { key: 'merch', label: 'Merch (cash on delivery)', description: 'Nakshatra merch sold cash on delivery, with staff fulfilment. Off until stock and a courier are arranged.', defaultEnabled: false, api: ['/api/v1/merch'], pages: ['/merch'] },
  { key: 'community', label: 'Community groups & stories (legacy)', description: 'Public community groups, creator channels and 24-hour stories.', defaultEnabled: false, api: ['/api/v1/groups', '/api/v1/stories'], pages: ['/social'] },
  { key: 'messages', label: 'Direct messages (legacy)', description: 'One-to-one conversations.', defaultEnabled: false, api: ['/api/v1/conversations', '/api/v1/messages'], pages: ['/messages'] },
  { key: 'dating', label: 'Dating (legacy)', description: 'Dating profiles, likes and matches.', defaultEnabled: false, api: ['/api/v1/dating'], pages: ['/dating'], dependsOn: ['messages'] },
  { key: 'matchmaking', label: 'Matchmaking (legacy)', description: 'Marriage matchmaking and Family Bridge.', defaultEnabled: false, api: ['/api/v1/matchmaking', '/api/v1/family'], pages: ['/matchmaking', '/family/'], dependsOn: ['astrology', 'messages'] },
  { key: 'experts', label: 'Expert consultations (legacy)', description: 'Expert marketplace, bookings and payouts.', defaultEnabled: false, api: ['/api/v1/experts', '/api/v1/expert', '/api/v1/bookings'], pages: ['/experts', '/expert/'] },
  { key: 'learning', label: 'Courses (legacy)', description: 'Courses, lessons, quizzes, certificates and creator studio.', defaultEnabled: false, api: ['/api/v1/courses', '/api/v1/lessons', '/api/v1/quizzes', '/api/v1/learning', '/api/v1/certificates', '/api/v1/creator'], pages: ['/learn', '/creator'] },
  { key: 'marketplace', label: 'Marketplace & physical goods (legacy)', description: 'Seller studio, storefronts, physical products (incl. gemstones) and astrology reports.', defaultEnabled: false, api: ['/api/v1/seller', '/api/v1/storefronts'], pages: ['/seller', '/store/'] },
  { key: 'weddings', label: 'Weddings (legacy)', description: 'Wedding planning and vendor marketplace.', defaultEnabled: false, api: ['/api/v1/weddings', '/api/v1/rsvp', '/api/v1/vendors', '/api/v1/vendor'], pages: ['/weddings', '/vendors', '/vendor/', '/rsvp/'] },
];

export const MODULE_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/** Longest matching prefix wins (so `/api/v1/expert` never captures `/api/v1/experts…` wrongly). */
function owner(path: string, field: 'api' | 'pages'): ModuleDef | null {
  const clean = path.split('?')[0];
  let best: { m: ModuleDef; len: number } | null = null;
  for (const m of MODULES) for (const p of m[field]) {
    const hit = p.endsWith('/') ? clean.startsWith(p) : clean === p || clean.startsWith(`${p}/`) || clean.startsWith(`${p}?`);
    if (hit && (!best || p.length > best.len)) best = { m, len: p.length };
  }
  return best?.m ?? null;
}

export const moduleForApiPath = (path: string) => owner(path, 'api');
export const moduleForPage = (path: string) => owner(path, 'pages');

/** Products sold while the marketplace module is off: the identity catalogue only. */
export const IDENTITY_OFFER_SLUGS = ['cosmetic-card-styles', 'report-identity-expanded'];
