/**
 * Ink & Ember visual system — typed access to the artwork in public/visual/.
 *
 * Paths follow the package's naming convention (docs/visual-system/CLAUDE_CODE_IMPLEMENTATION_BRIEF.md §2)
 * and every path built here is checked against the generated manifest registry in
 * src/web/lib/visual.test.ts. The registry itself (visual-registry.generated.ts) is not
 * imported at runtime, which keeps it out of the app bundles.
 *
 * Artwork never contains names, numbers or prices; all such text stays live in the UI.
 */

export type ArchetypeSlot = `archetype-${string}`;
export type Treatment = 'halo' | 'engraved' | 'duotone' | 'filled' | 'dotted' | 'eclipse';
export interface ArchetypeVisual { slot: ArchetypeSlot; accent: string; accentOnLight: string; treatment: Treatment; why: string }

/**
 * The app's real 24 archetypes (src/shared/personality.ts) mapped to the package's 24
 * provisional artwork slots by meaning. Slot concepts and moods are in
 * docs/visual-system/archetypes.json; the provisional names are never shown.
 */
export const ARCHETYPE_VISUALS: Record<string, ArchetypeVisual> = {
  midnight_philosopher: { slot: 'archetype-07', accent: '#afacff', accentOnLight: '#635bb0', treatment: 'eclipse', why: 'Oracle: sees what is unsaid; introspective, intuitive.' },
  chaos_diplomat: { slot: 'archetype-18', accent: '#ee97c9', accentOnLight: '#9b467a', treatment: 'filled', why: 'Jester: turns tension into laughter.' },
  unbothered_overthinker: { slot: 'archetype-24', accent: '#c3a5f9', accentOnLight: '#7555a8', treatment: 'dotted', why: 'Cipher: private, a lock not yet aligned.' },
  lore_keeper: { slot: 'archetype-05', accent: '#adc367', accentOnLight: '#607300', treatment: 'engraved', why: 'Keeper: holds what matters; loyal.' },
  soft_launch_romantic: { slot: 'archetype-23', accent: '#f696b4', accentOnLight: '#a24466', treatment: 'halo', why: 'Ember: burns low and long; passionate.' },
  human_plot_twist: { slot: 'archetype-04', accent: '#e4ac59', accentOnLight: '#935b00', treatment: 'filled', why: 'Spark: starts things; playful, impulsive.' },
  professional_disappearing_act: { slot: 'archetype-15', accent: '#99b3ff', accentOnLight: '#4c62b3', treatment: 'eclipse', why: 'Dreamer: lives half in another sky; quiet.' },
  emotional_archivist: { slot: 'archetype-17', accent: '#96c979', accentOnLight: '#467922', treatment: 'dotted', why: 'Sage: accumulates, like growth rings of memory.' },
  delulu_strategist: { slot: 'archetype-14', accent: '#82baff', accentOnLight: '#2e69b2', treatment: 'engraved', why: 'Strategist: thinks three moves ahead.' },
  accidental_therapist: { slot: 'archetype-13', accent: '#f79e75', accentOnLight: '#a44c1d', treatment: 'halo', why: 'Hearth: where people gather; nurturing.' },
  quiet_instigator: { slot: 'archetype-12', accent: '#c3bc5a', accentOnLight: '#756c00', treatment: 'engraved', why: 'Alchemist: turns one thing into another.' },
  social_battery_economist: { slot: 'archetype-08', accent: '#69c1fc', accentOnLight: '#0070ab', treatment: 'engraved', why: 'Architect: builds frameworks; precise.' },
  group_chat_mayor: { slot: 'archetype-20', accent: '#d4a0ec', accentOnLight: '#854f9c', treatment: 'dotted', why: 'Weaver: knows everyone; a complete web.' },
  spreadsheet_optimist: { slot: 'archetype-02', accent: '#3bcfcf', accentOnLight: '#007e80', treatment: 'engraved', why: 'Cartographer: charts the unknown into a grid.' },
  main_character_trainee: { slot: 'archetype-01', accent: '#efa464', accentOnLight: '#9d5300', treatment: 'halo', why: 'Lantern: a light other people orient by.' },
  calm_in_the_chaos: { slot: 'archetype-21', accent: '#d5b455', accentOnLight: '#866300', treatment: 'duotone', why: 'Pioneer: quietly builds the way forward.' },
  side_quest_collector: { slot: 'archetype-06', accent: '#7ccd8e', accentOnLight: '#1d7d3e', treatment: 'dotted', why: 'Wanderer: never on the same path twice.' },
  kind_truth_teller: { slot: 'archetype-22', accent: '#51c7f1', accentOnLight: '#0076a0', treatment: 'eclipse', why: 'Mirror: reflects people back to themselves.' },
  cosy_contrarian: { slot: 'archetype-10', accent: '#fa969f', accentOnLight: '#a64450', treatment: 'filled', why: 'Rebel: breaks the circle on purpose.' },
  loyal_night_owl: { slot: 'archetype-03', accent: '#3ecce2', accentOnLight: '#007b92', treatment: 'duotone', why: 'Tidecaller: feels in cycles, answering the moon.' },
  hype_engineer: { slot: 'archetype-16', accent: '#fb9989', accentOnLight: '#a74639', treatment: 'filled', why: 'Catalyst: makes reactions happen; energising.' },
  gentle_detective: { slot: 'archetype-19', accent: '#62d0a4', accentOnLight: '#007f56', treatment: 'engraved', why: 'Sentinel: keeps watch; notices.' },
  plan_b_poet: { slot: 'archetype-09', accent: '#e39bdc', accentOnLight: '#914a8c', treatment: 'duotone', why: 'Muse: makes feeling visible; creative.' },
  steady_signal: { slot: 'archetype-11', accent: '#4ad0ba', accentOnLight: '#00806c', treatment: 'halo', why: 'Anchor: the one who stays.' },
};

export type ArchetypePart = 'sigil' | 'sigil-mono' | 'compact' | 'hero-landscape' | 'hero-portrait' | 'card' | 'treatment-pattern';
export function archetypeArt(key: string, part: ArchetypePart): string | null {
  const v = ARCHETYPE_VISUALS[key];
  return v ? `/visual/archetypes/${v.slot}/${v.slot}-${part}.svg` : null;
}
export const archetypeAccent = (key: string) => ARCHETYPE_VISUALS[key]?.accent ?? '#f2ece1';

/** Engine game keys (src/shared/play/engine.ts) → package game keys. */
export const GAME_VISUALS: Record<string, { pkg: string; accent: string }> = {
  who_said_it: { pkg: 'who-said-it', accent: '#afacff' },
  pick_your_chaos: { pkg: 'pick-your-chaos', accent: '#fb9989' },
  honest_vote: { pkg: 'honest-vote', accent: '#3bcfcf' },
  one_line_confessions: { pkg: 'one-line-confessions', accent: '#e39bdc' },
  archetype_showdown: { pkg: 'archetype-showdown', accent: '#fa969f' },
  friend_decoder: { pkg: 'friend-decoder', accent: '#62d0a4' },
  this_or_that: { pkg: 'this-or-that', accent: '#efa464' },
  plot_twist: { pkg: 'plot-twist', accent: '#69c1fc' },
  hot_take_arena: { pkg: 'hot-take-arena', accent: '#f696b4' },
  prediction_market: { pkg: 'prediction-market', accent: '#96c979' },
  memory_lane: { pkg: 'memory-lane', accent: '#f79e75' },
  compatibility_lab: { pkg: 'compatibility-lab', accent: '#ee97c9' },
};
export type GamePart = 'symbol' | 'symbol-mono' | 'card' | 'cover' | 'active' | 'result' | 'celebration';
export function gameArt(key: string, part: GamePart): string | null {
  const g = GAME_VISUALS[key];
  return g ? `/visual/games/${g.pkg}/game-${g.pkg}-${part}.svg` : null;
}

export type Environment = 'deep-celestial' | 'fine-grain' | 'identity-reveal' | 'indigo-violet' | 'layered-geometry' | 'metallic-surfaces' | 'minimal-starfield' | 'orbital-architecture' | 'premium-report' | 'quiet-midnight' | 'sigil-field' | 'warm-paper-geometry';
export const envArt = (name: Environment, orient: 'landscape' | 'portrait') => `/visual/environments/env-${name}-${orient}.svg`;

export const BRAND = {
  symbol: '/visual/brand/nakshatra-symbol.svg',
  symbolMono: '/visual/brand/nakshatra-symbol-mono.svg',
  logoPrimary: '/visual/brand/nakshatra-logo-primary.svg',
  logoLight: '/visual/brand/nakshatra-logo-light-bg.svg',
  wordmark: '/visual/brand/nakshatra-wordmark.svg',
  loading: '/visual/brand/nakshatra-loading-emblem.svg',
  motif: '/visual/brand/nakshatra-motif-27.svg',
  heroLandscape: '/visual/brand/nakshatra-hero-background-landscape.svg',
  heroPortrait: '/visual/brand/nakshatra-hero-background-portrait.svg',
  celebration: '/visual/brand/nakshatra-celebration.svg',
} as const;

export const uiIcon = (name: string) => `/visual/icons/icon-${name}.svg`;

/** Thought Drop kinds → post-type icons (16px, currentColor masters). */
const POST_ICON: Record<string, string> = { thought: 'thought', question: 'question', dilemma: 'dilemma', poll: 'poll', confession: 'confession', prompt: 'prompt', text: 'thought' };
export const postTypeIcon = (kind: string) => `/visual/social/icon-post-${POST_ICON[kind] ?? 'thought'}.svg`;

/** Circle themes (src/server/services/circles.ts) → cover art; symbols are picked deterministically from the circle id. */
export const CIRCLE_COVERS: Record<string, string> = {
  dusk: 'night-owls', saffron: 'ember-hearth', monsoon: 'slow-mornings', aurora: 'open-orbit', ember: 'chaos-club', jade: 'old-friends',
};
export const circleCover = (theme: string) => `/visual/circles/circle-cover-${CIRCLE_COVERS[theme] ?? 'the-crew'}.svg`;
export function circleSymbol(circleId: string): string {
  let h = 0;
  for (let i = 0; i < circleId.length; i++) h = (h * 31 + circleId.charCodeAt(i)) >>> 0;
  return `/visual/circles/circle-symbol-${String((h % 12) + 1).padStart(2, '0')}.svg`;
}

/** Levels 1–10 have badges; higher levels reuse the top badge (sides = level + 2). */
export const levelBadge = (level: number) => `/visual/rewards/level-${String(Math.min(10, Math.max(1, level))).padStart(2, '0')}.svg`;

/** Achievement keys (src/shared/gamification.ts) → medallion art. Unmapped keys fall back to the constellation drawing. */
export const ACHIEVEMENT_ART: Record<string, string> = {
  first_light: 'identity-revealed', archetype_found: 'identity-revealed', self_portrait: 'self-explorer', shared_star: 'card-shared',
  first_post: 'first-thought', conversation_starter: 'conversation-starter', poll_creator: 'first-poll', card_maker: 'card-shared',
  first_game: 'first-game', game_regular: 'showdown-champion', circle_founder: 'circle-founder', group_joined: 'first-circle',
  first_bond: 'connector', mutual_bond: 'compatibility-match', constellation: 'full-circle',
  first_reflection: 'night-ritual', seven_reflections: 'full-week', ritual_seven: 'seven-day-streak', festival_observer: 'dawn-ritual',
  first_lesson: 'first-question', scholar: 'resonated', quiz_ace: 'clear-forecaster', course_complete: 'decoder-ace',
  first_event: 'connector', wrapped: 'full-week',
};
export const achievementArt = (key: string) => (ACHIEVEMENT_ART[key] ? `/visual/rewards/achievement-${ACHIEVEMENT_ART[key]}.svg` : null);

/** Card-style keys (identity card styles) → production frames. Purchased styles use the foil/premium frames. */
export const CARD_STYLE_FRAMES: Record<string, string> = {
  classic: 'engraved', dusk: 'obsidian', aurora: 'chromatic', table: 'blueprint', eclipse_ink: 'eclipse', saffron_foil: 'ember-foil',
};
export const cardStyleFrame = (style: string) => `/visual/offers/card-styles/card-style-${CARD_STYLE_FRAMES[style] ?? 'engraved'}-frame.svg`;
export const cardStylePreview = (style: string) => `/visual/offers/card-styles/card-style-${CARD_STYLE_FRAMES[style] ?? 'engraved'}-preview.svg`;

export type EmptyKind = 'circle' | 'feed' | 'no-results' | 'notifications' | 'offline' | 'unavailable';
export const emptyArt = (kind: EmptyKind) => `/visual/empty-states/empty-${kind}.svg`;
export const onboardingArt = (name: 'complete-assessment' | 'create-circle' | 'daily-ritual' | 'discover-identity' | 'earn-achievement' | 'first-game' | 'invite-friend' | 'join-circle' | 'share-archetype' | 'start-conversation') => `/visual/onboarding/onb-${name}.svg`;
