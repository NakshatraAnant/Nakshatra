/**
 * Nakshatra personality model. Current scoring: personality-v2 (see scorePersonality).
 * personality-v1 (below, scorePersonalityV1) is kept so stored v1 results can be explained and audited.
 *
 * personality-v1:
 *
 * Five dimensions, each scored from -1 to +1 from four Likert questions
 * (1 = strongly disagree … 5 = strongly agree). Some items are reverse-keyed.
 *   score(d) = Σ key·(answer − 3) / (2 · answered)
 * A dimension needs at least 3 of its 4 answers; otherwise it is "unknown"
 * (scored 0) and confidence is capped at low.
 *
 * The archetype is the nearest prototype by Euclidean distance over the five
 * dimensions; the second nearest is the secondary archetype. Ties are broken by
 * catalogue order, so identical answers always give identical results.
 * Confidence compares the gap between the two nearest prototypes.
 *
 * This describes tendencies people recognise in themselves. It is not a
 * validated psychometric instrument, a diagnosis, or a prediction.
 */
export const PERSONALITY_VERSION = 'personality-v2';
export const PERSONALITY_VERSIONS = ['personality-v1', 'personality-v2'] as const;

export type Dimension = 'energy' | 'compass' | 'voice' | 'tempo' | 'horizon';
export const DIMENSIONS: Dimension[] = ['energy', 'compass', 'voice', 'tempo', 'horizon'];

export const DIMENSION_INFO: Record<Dimension, { name: string; low: string; high: string; lowText: string; highText: string }> = {
  energy: { name: 'Social energy', low: 'Recharger', high: 'Spark', lowText: 'You refill your battery in quieter, smaller settings.', highText: 'Being around people tends to give you energy rather than take it.' },
  compass: { name: 'Decision style', low: 'Logic-led', high: 'Feeling-led', lowText: 'You usually reason a decision through before you trust it.', highText: 'You usually check how a decision will feel — for you and others — first.' },
  voice: { name: 'Expression', low: 'Guarded', high: 'Open book', lowText: 'You share what you think once trust is there, and not before.', highText: 'You tend to say what you think and feel, out loud and early.' },
  tempo: { name: 'Pace', low: 'Planner', high: 'Improviser', lowText: 'A plan makes you feel free; surprises are better scheduled.', highText: 'You like leaving room for the plan to change on the way.' },
  horizon: { name: 'Novelty', low: 'Anchor', high: 'Explorer', lowText: 'You love your favourites and the comfort of the familiar.', highText: 'New places, ideas and people pull at you.' },
};

export interface Question { id: string; text: string; dimension: Dimension; key: 1 | -1 }

export const QUESTIONS: Question[] = [
  { id: 'q1', dimension: 'energy', key: 1, text: 'A last-minute plan with a big group sounds fun, not exhausting.' },
  { id: 'q2', dimension: 'compass', key: -1, text: 'When friends argue, I look for who is actually right before who is hurt.' },
  { id: 'q3', dimension: 'voice', key: 1, text: 'People usually know what I think without having to ask.' },
  { id: 'q4', dimension: 'tempo', key: 1, text: 'I would rather wander a new city than follow an itinerary.' },
  { id: 'q5', dimension: 'horizon', key: 1, text: 'I get restless if my weeks start to look the same.' },
  { id: 'q6', dimension: 'energy', key: -1, text: 'After a long social day I need real alone time to feel like myself.' },
  { id: 'q7', dimension: 'compass', key: 1, text: 'I often decide by imagining how each choice would feel.' },
  { id: 'q8', dimension: 'voice', key: -1, text: 'I rehearse important messages before I send them.' },
  { id: 'q9', dimension: 'tempo', key: -1, text: 'A shared calendar is a love language.' },
  { id: 'q10', dimension: 'horizon', key: -1, text: 'I reorder my usual at a restaurant more often than I try something new.' },
  { id: 'q11', dimension: 'energy', key: 1, text: 'I am usually the one who starts the group chat.' },
  { id: 'q12', dimension: 'compass', key: -1, text: 'A good argument can change my mind faster than a good story.' },
  { id: 'q13', dimension: 'voice', key: 1, text: 'I am comfortable being the first to say how I really feel.' },
  { id: 'q14', dimension: 'tempo', key: 1, text: 'Deadlines are when my best ideas finally show up.' },
  { id: 'q15', dimension: 'horizon', key: 1, text: 'I will try almost any hobby once.' },
  { id: 'q16', dimension: 'energy', key: -1, text: 'I prefer one deep conversation to ten quick ones.' },
  { id: 'q17', dimension: 'compass', key: 1, text: 'I notice the mood in a room before anything else.' },
  { id: 'q18', dimension: 'voice', key: -1, text: 'Most people meet a slightly edited version of me at first.' },
  { id: 'q19', dimension: 'tempo', key: -1, text: 'I pack the night before, at the latest.' },
  { id: 'q20', dimension: 'horizon', key: -1, text: 'Rewatching a favourite show beats starting a new one.' },
];

export type Vector = Record<Dimension, number>;

export interface PersonaArchetype {
  key: string;
  name: string;
  signature: string;
  traits: [string, string, string];
  inCircles: string;
  growth: string;
  prototype: Vector;
}

const v = (energy: number, compass: number, voice: number, tempo: number, horizon: number): Vector => ({ energy, compass, voice, tempo, horizon });

/**
 * Naming rules: a recognisable modern behaviour, affectionate rather than mocking,
 * never a diagnosis or a stereotype about a group, unique within the catalogue.
 */
export const PERSONA_ARCHETYPES: PersonaArchetype[] = [
  { key: 'midnight_philosopher', name: 'The Midnight Philosopher', signature: 'Your best thoughts arrive after 11 pm and refuse to leave.', traits: ['Deep diver', 'Quietly curious', 'Asks the second question'], inCircles: 'Turns a throwaway comment into the conversation everyone remembers.', growth: 'Share the half-formed thought — it is often the useful one.', prototype: v(-0.8, -0.4, 0.2, 0.2, 0.8) },
  { key: 'chaos_diplomat', name: 'The Chaos Diplomat', signature: 'You can calm a group chat and start a new one in the same minute.', traits: ['Reads the room', 'Says it kindly', 'Loves a plot change'], inCircles: 'The one who smooths things over and then suggests something wild.', growth: 'Peacekeeping is a gift; your own opinion counts too.', prototype: v(0.8, 0.6, 0.6, 0.6, 0.4) },
  { key: 'unbothered_overthinker', name: 'The Unbothered Overthinker', signature: 'Calm on the outside, seventeen tabs open on the inside.', traits: ['Composed', 'Analytical', 'Private processor'], inCircles: 'Gives the measured take after everyone else has panicked.', growth: 'Saying one tab out loud closes three.', prototype: v(-0.4, -0.6, -0.6, -0.4, 0) },
  { key: 'lore_keeper', name: 'The Lore Keeper', signature: 'You remember every inside joke and exactly when it started.', traits: ['Loyal', 'Detail memory', 'Tradition maker'], inCircles: 'Keeps the group’s history — and its rituals — alive.', growth: 'New chapters are lore too.', prototype: v(-0.4, 0, -0.2, -0.6, -0.8) },
  { key: 'soft_launch_romantic', name: 'The Soft-Launch Romantic', signature: 'Deeply feeling, carefully revealing — one hint at a time.', traits: ['Tender', 'Selective sharer', 'Notices small gestures'], inCircles: 'Shows love in details people find weeks later.', growth: 'Let the people who earned it see the full picture sooner.', prototype: v(-0.2, 0.8, -0.4, 0, 0.2) },
  { key: 'human_plot_twist', name: 'The Human Plot Twist', signature: 'Nobody, including you, knows what you will do next.', traits: ['Spontaneous', 'Fearless', 'Good story source'], inCircles: 'Every great “remember when…” starts with you.', growth: 'Surprise lands best when people can find you after.', prototype: v(0.6, 0, 0.4, 0.9, 0.9) },
  { key: 'professional_disappearing_act', name: 'The Professional Disappearing Act', signature: 'Here, magnificent, and then quietly gone to recharge.', traits: ['Independent', 'Energy budgeter', 'Comes back strong'], inCircles: 'Shows up for the moments that matter, fully.', growth: 'A two-word “need a break” saves a lot of guessing.', prototype: v(-0.9, 0, -0.7, 0.4, 0.2) },
  { key: 'emotional_archivist', name: 'The Emotional Archivist', signature: 'You keep the screenshots, the tickets, and the feelings.', traits: ['Sentimental', 'Warm', 'Remembers how it felt'], inCircles: 'Makes people feel remembered.', growth: 'Keep a little room for the moments not yet archived.', prototype: v(-0.4, 0.8, 0.4, -0.4, -0.6) },
  { key: 'delulu_strategist', name: 'The Delulu Strategist', signature: 'Big dreams, colour-coded plans to reach them.', traits: ['Visionary', 'Organised optimist', 'Hypes your goals'], inCircles: 'The friend who turns “what if” into a spreadsheet.', growth: 'Some dreams are allowed to stay unplanned.', prototype: v(0.2, 0.6, 0.2, -0.8, 0.6) },
  { key: 'accidental_therapist', name: 'The Accidental Therapist', signature: 'People tell you things they have never said out loud.', traits: ['Safe to talk to', 'Empathic', 'Honest when asked'], inCircles: 'The late-night call everyone saves for important things.', growth: 'You are allowed to be listened to as well.', prototype: v(0.2, 0.9, 0.8, 0, -0.2) },
  { key: 'quiet_instigator', name: 'The Quiet Instigator', signature: 'Says little, suggests one thing, and the night changes.', traits: ['Understated', 'Bold ideas', 'Mischief with purpose'], inCircles: 'Plants the idea and watches the group run with it.', growth: 'Take credit for the good chaos sometimes.', prototype: v(-0.6, -0.2, 0.6, 0.6, 0.6) },
  { key: 'social_battery_economist', name: 'The Social Battery Economist', signature: 'Every plan is evaluated for its return on energy.', traits: ['Intentional', 'Clear boundaries', 'Reliable when committed'], inCircles: 'When you say yes, everyone knows you mean it.', growth: 'An unplanned yes can be a good investment.', prototype: v(0, -0.4, -0.2, -0.8, 0) },
  { key: 'group_chat_mayor', name: 'The Group Chat Mayor', signature: 'You keep the chat alive and the plans actually happening.', traits: ['Connector', 'Expressive', 'Momentum maker'], inCircles: 'Without you, the group would still be “we should hang out”.', growth: 'Let someone else run the town for a week.', prototype: v(0.9, 0.2, 0.8, 0.2, 0) },
  { key: 'spreadsheet_optimist', name: 'The Spreadsheet Optimist', signature: 'Everything will work out — you have modelled three scenarios.', traits: ['Upbeat', 'Systematic', 'Says it straight'], inCircles: 'Makes the ambitious trip actually affordable.', growth: 'Not every good thing needs a column.', prototype: v(0.4, -0.6, 0.4, -0.8, 0.4) },
  { key: 'main_character_trainee', name: 'The Main Character in Training', signature: 'Living out loud, learning every scene as you go.', traits: ['Expressive', 'Adventurous', 'Warmly dramatic'], inCircles: 'Brings colour, playlists and a sense of occasion.', growth: 'Supporting roles make the best episodes too.', prototype: v(0.6, 0, 0.8, 0.2, 0.9) },
  { key: 'calm_in_the_chaos', name: 'The Calm in the Chaos', signature: 'When things go sideways, people look for you.', traits: ['Steady', 'Practical', 'Unflappable'], inCircles: 'The person who quietly fixes it while others are still reacting.', growth: 'Calm people are allowed bad days.', prototype: v(0, -0.2, -0.4, -0.2, -0.4) },
  { key: 'side_quest_collector', name: 'The Side Quest Collector', signature: 'You went out for milk and came back with a new hobby.', traits: ['Curious', 'Easy-going', 'Collector of experiences'], inCircles: 'Always has a new place, song or idea to try.', growth: 'Finishing one quest is its own adventure.', prototype: v(0.2, 0.4, 0, 0.7, 0.9) },
  { key: 'kind_truth_teller', name: 'The Brutally Kind Truth-Teller', signature: 'Honest enough to say it, kind enough to say it well.', traits: ['Direct', 'Clear thinker', 'Trustworthy feedback'], inCircles: 'The opinion people ask for when it really matters.', growth: 'Ask first whether they want advice or company.', prototype: v(0.2, -0.8, 0.9, 0, 0) },
  { key: 'cosy_contrarian', name: 'The Cosy Contrarian', signature: 'Blanket, tea, and a well-argued unpopular opinion.', traits: ['Independent thinker', 'Homebody', 'Debates for fun'], inCircles: 'Keeps the group from agreeing too fast.', growth: 'Agreeing sometimes is not losing.', prototype: v(-0.6, -0.6, 0.6, -0.2, -0.2) },
  { key: 'loyal_night_owl', name: 'The Loyal Night Owl', signature: 'Awake for every crisis, every celebration, every 2 am call.', traits: ['Devoted', 'Feeling-led', 'Familiar comforts'], inCircles: 'The friend who always picks up.', growth: 'Sleep is also loyalty — to yourself.', prototype: v(-0.2, 0.6, -0.2, 0.4, -0.6) },
  { key: 'hype_engineer', name: 'The Hype Engineer', signature: 'You build confidence in other people for a living (unpaid).', traits: ['Encouraging', 'High energy', 'Celebrates loudly'], inCircles: 'Every win in the group gets a proper celebration because of you.', growth: 'Save some of that hype for your own wins.', prototype: v(0.9, 0.6, 0.6, -0.2, 0.2) },
  { key: 'gentle_detective', name: 'The Gentle Detective', signature: 'You notice what changed before anyone mentions it.', traits: ['Observant', 'Thoughtful', 'Curious about people'], inCircles: 'Asks “are you okay?” at exactly the right moment.', growth: 'Your own clues deserve attention too.', prototype: v(-0.6, -0.4, -0.2, -0.2, 0.6) },
  { key: 'plan_b_poet', name: 'The Plan B Poet', signature: 'When plans fall apart, you find the beautiful version.', traits: ['Adaptable', 'Romantic about life', 'Creative'], inCircles: 'Turns a cancelled plan into the best night of the month.', growth: 'Plan A deserves a fair chance sometimes.', prototype: v(-0.2, 0.6, 0.2, 0.6, 0.4) },
  { key: 'steady_signal', name: 'The Steady Signal', signature: 'Consistent, dependable, and quietly there every week.', traits: ['Dependable', 'Grounded', 'Keeps promises'], inCircles: 'The constant the group is built around.', growth: 'Let people surprise you now and then.', prototype: v(0.2, -0.2, 0, -0.6, -0.8) },
];

export const PERSONA_BY_KEY: Record<string, PersonaArchetype> = Object.fromEntries(PERSONA_ARCHETYPES.map((a) => [a.key, a]));

export type Answers = Record<string, number>;

export type Confidence = 'high' | 'medium' | 'low' | 'inconclusive';

/**
 * Response quality (quality-v1). Detects answer sheets that carry too little information to place
 * someone confidently, without changing how scores or archetypes are computed:
 *  - straight_lined: 90%+ of answers are the same option (e.g. all "Agree"). Because every dimension has
 *    two reverse-keyed statements, this cancels to the neutral centre — it says nothing about the person.
 *  - near_centre: every dimension within ±0.2 of neutral (overall profile too flat to discriminate).
 *  - low_variance: answers barely vary (standard deviation under 0.6 on the 1–5 scale).
 *  - patterned: the sheet strictly alternates between two options in question order.
 *  - inconsistent: in 3+ dimensions, statements measuring the same tendency were answered in opposite directions.
 *  - incomplete: a dimension has fewer than three answers.
 * straight_lined or near_centre → "inconclusive"; any other flag caps confidence at "low".
 */
export interface ResponseQuality { level: 'good' | 'low' | 'insufficient'; flags: ('straight_lined' | 'near_centre' | 'low_variance' | 'patterned' | 'inconsistent' | 'incomplete')[]; message: string | null }

export function assessQuality(answers: Answers, scores: Vector, unknown: Dimension[] = []): ResponseQuality {
  const vals = QUESTIONS.map((q) => answers[q.id]).filter((v): v is number => typeof v === 'number');
  const flags: ResponseQuality['flags'] = [];
  if (vals.length) {
    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    if (Math.max(...counts.values()) / vals.length >= 0.9) flags.push('straight_lined');
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    if (sd < 0.6 && !flags.includes('straight_lined')) flags.push('low_variance');
    const alternating = vals.length >= 10 && counts.size === 2 && vals.every((v, i) => i < 2 || v === vals[i - 2]) && vals[0] !== vals[1];
    if (alternating) flags.push('patterned');
  }
  // Consistency: the four statements of a dimension measure the same tendency. A dimension is contradictory
  // when, after reverse-keying, at least one answer leans clearly one way and another clearly the other way.
  // Contradictions in three or more dimensions look like random or careless answering.
  const contradictory = DIMENSIONS.filter((d) => {
    const keyed = QUESTIONS.filter((q) => q.dimension === d && typeof answers[q.id] === 'number').map((q) => q.key * (answers[q.id] - 3));
    return keyed.some((x) => x >= 1) && keyed.some((x) => x <= -1);
  }).length;
  if (contradictory >= 3) flags.push('inconsistent');
  if (DIMENSIONS.every((d) => Math.abs(scores[d]) <= 0.2)) flags.push('near_centre');
  if (unknown.length) flags.push('incomplete');
  const insufficient = flags.includes('straight_lined') || flags.includes('near_centre');
  return {
    level: insufficient ? 'insufficient' : flags.length ? 'low' : 'good',
    flags,
    message: insufficient
      ? 'Your answers sit almost exactly in the middle on every dimension, so no archetype clearly fits yet. Try answering with your first instinct — strong agreement and disagreement both help.'
      : flags.length ? 'This match is tentative. A retake with more varied answers would make it clearer.' : null,
  };
}

export interface PersonalityResult {
  version: string;
  scores: Vector;
  unknown: Dimension[];
  archetype: string;
  secondary: string;
  confidence: Confidence;
  quality: ResponseQuality;
  /** Distances to every archetype, nearest first (for explanation). v2: 1 − match. */
  distances: { key: string; distance: number }[];
  /** v2: set when the top two archetypes are nearly tied. */
  blend: { primary: string; secondary: string; primaryWeight: number } | null;
  /** Length of the score vector (0 … √5): how strongly the answers lean overall. */
  strength: number;
  /** Gap between the best and second-best match. */
  margin: number;
}

export class AssessmentError extends Error {}

export function validateAnswers(answers: Answers): void {
  for (const [id, a] of Object.entries(answers)) {
    if (!QUESTIONS.some((q) => q.id === id)) throw new AssessmentError(`Unknown question ${id}`);
    if (!Number.isInteger(a) || a < 1 || a > 5) throw new AssessmentError(`Answer for ${id} must be a whole number from 1 to 5`);
  }
  if (Object.keys(answers).length < 15) throw new AssessmentError('Answer at least 15 of the 20 questions.');
}

/** personality-v1 (nearest prototype by Euclidean distance). Retained for audit of stored v1 results only. */
export function scorePersonalityV1(answers: Answers): PersonalityResult {
  validateAnswers(answers);
  const scores = {} as Vector;
  const unknown: Dimension[] = [];
  for (const d of DIMENSIONS) {
    const qs = QUESTIONS.filter((q) => q.dimension === d && answers[q.id] !== undefined);
    if (qs.length < 3) { scores[d] = 0; unknown.push(d); continue; }
    const raw = qs.reduce((sum, q) => sum + q.key * (answers[q.id] - 3), 0) / (2 * qs.length);
    scores[d] = Math.round(raw * 1000) / 1000;
  }
  const distances = PERSONA_ARCHETYPES.map((a, i) => ({
    key: a.key, i,
    distance: Math.round(Math.sqrt(DIMENSIONS.reduce((s, d) => s + (scores[d] - a.prototype[d]) ** 2, 0)) * 1000) / 1000,
  })).sort((x, y) => x.distance - y.distance || x.i - y.i);
  const gap = distances[1].distance - distances[0].distance;
  let confidence: Confidence = gap >= 0.25 ? 'high' : gap >= 0.1 ? 'medium' : 'low';
  if (unknown.length) confidence = 'low';
  const quality = assessQuality(answers, scores, unknown);
  if (quality.level === 'insufficient') confidence = 'inconclusive';
  else if (quality.level === 'low' && confidence !== 'low') confidence = 'low';
  return {
    version: 'personality-v1', scores, unknown, quality,
    archetype: distances[0].key, secondary: distances[1].key, confidence,
    distances: distances.map(({ key, distance }) => ({ key, distance })),
    blend: null, strength: Math.round(Math.sqrt(DIMENSIONS.reduce((s, d) => s + scores[d] ** 2, 0)) * 1000) / 1000, margin: Math.round(gap * 1000) / 1000,
  };
}

/** Dimension scores: Σ key·(answer − 3) / (2 · answered); a dimension with < 3 answers is unknown (0). */
export function dimensionScores(answers: Answers): { scores: Vector; unknown: Dimension[] } {
  const scores = {} as Vector;
  const unknown: Dimension[] = [];
  for (const d of DIMENSIONS) {
    const qs = QUESTIONS.filter((q) => q.dimension === d && answers[q.id] !== undefined);
    if (qs.length < 3) { scores[d] = 0; unknown.push(d); continue; }
    const raw = qs.reduce((sum, q) => sum + q.key * (answers[q.id] - 3), 0) / (2 * qs.length);
    scores[d] = Math.round(raw * 1000) / 1000;
  }
  return { scores, unknown };
}

/**
 * personality-v2 — why v1 was replaced:
 * v1 picked the prototype nearest in Euclidean distance. Prototypes have very different lengths
 * (Calm in the Chaos ≈ 0.63 from the centre, most others ≈ 1.3–1.6), so any weak or mixed answer sheet —
 * which lands near the centre — was closest to the shortest prototype. About a quarter of random
 * sheets became Calm in the Chaos.
 *
 * v2 separates WHAT direction someone leans from HOW STRONGLY they lean:
 *  - match(a) = cos(scores, prototype_a) + offset_a. Direction only, so prototype length no longer matters.
 *  - offset_a is a small fixed per-archetype calibration (|offset| ≤ 0.12) that equalises how much of the
 *    answer space each archetype owns. Offsets were fitted once, offline, against a simulated reference
 *    population (scripts/assessment-distribution.ts) and are part of this version — they never change at
 *    runtime and never depend on real users' data.
 *  - strength = length of the score vector (0 … √5). Confidence uses strength AND the margin between the
 *    best two matches. Weak or near-tied results are labelled as such instead of being presented as clear.
 *  - When the top two matches are nearly tied, the result is a blend of both (primary keeps its name).
 * Deterministic: the same answers always give the same result; ties break by catalogue order.
 */
export const V2_OFFSETS: Record<string, number> = {
  midnight_philosopher: 0.0455,
  chaos_diplomat: 0.1177,
  unbothered_overthinker: -0.0064,
  lore_keeper: -0.0199,
  soft_launch_romantic: -0.0564,
  human_plot_twist: 0.07,
  professional_disappearing_act: -0.0644,
  emotional_archivist: -0.0294,
  delulu_strategist: -0.0352,
  accidental_therapist: 0.0699,
  quiet_instigator: 0.0373,
  social_battery_economist: 0.0289,
  group_chat_mayor: 0.0919,
  spreadsheet_optimist: -0.0028,
  main_character_trainee: 0.12,
  calm_in_the_chaos: -0.1097,
  side_quest_collector: 0.063,
  kind_truth_teller: -0.0023,
  cosy_contrarian: -0.0693,
  loyal_night_owl: -0.12,
  hype_engineer: 0.0834,
  gentle_detective: 0.0493,
  plan_b_poet: 0.073,
  steady_signal: -0.0453,
};

export const V2_THRESHOLDS = {
  /** Below this strength the direction is too unstable to name a single archetype confidently. */
  weakStrength: 0.45,
  mediumStrength: 0.7,
  highStrength: 1.0,
  mediumMargin: 0.03,
  highMargin: 0.06,
  /** Top-two margin under this → blended result. */
  blendMargin: 0.02,
} as const;

function norm(x: Vector): number { return Math.sqrt(DIMENSIONS.reduce((s, d) => s + x[d] ** 2, 0)); }

export function archetypeMatches(scores: Vector, offsets: Record<string, number> = V2_OFFSETS): { key: string; i: number; match: number }[] {
  const n = norm(scores);
  return PERSONA_ARCHETYPES.map((a, i) => {
    const cos = n === 0 ? 0 : DIMENSIONS.reduce((s, d) => s + scores[d] * a.prototype[d], 0) / (n * norm(a.prototype));
    return { key: a.key, i, match: cos + (offsets[a.key] ?? 0) };
  }).sort((x, y) => y.match - x.match || x.i - y.i);
}

export function scorePersonality(answers: Answers): PersonalityResult {
  validateAnswers(answers);
  const { scores, unknown } = dimensionScores(answers);
  const ranked = archetypeMatches(scores);
  const strength = norm(scores);
  const margin = ranked[0].match - ranked[1].match;
  const T = V2_THRESHOLDS;
  let confidence: Confidence = strength >= T.highStrength && margin >= T.highMargin ? 'high'
    : strength >= T.mediumStrength && margin >= T.mediumMargin ? 'medium' : 'low';
  if (strength < T.weakStrength || unknown.length) confidence = 'low';
  const quality = assessQuality(answers, scores, unknown);
  if (quality.level === 'insufficient') confidence = 'inconclusive';
  else if (quality.level === 'low' && confidence !== 'low') confidence = 'low';
  const blended = confidence !== 'inconclusive' && margin < T.blendMargin;
  const w0 = Math.exp(ranked[0].match * 8);
  const w1 = Math.exp(ranked[1].match * 8);
  return {
    version: PERSONALITY_VERSION, scores, unknown, quality,
    archetype: ranked[0].key, secondary: ranked[1].key, confidence,
    distances: ranked.map((r) => ({ key: r.key, distance: Math.round((1 - r.match) * 1000) / 1000 })),
    blend: blended ? { primary: ranked[0].key, secondary: ranked[1].key, primaryWeight: Math.round((w0 / (w0 + w1)) * 100) / 100 } : null,
    strength: Math.round(strength * 1000) / 1000,
    margin: Math.round(margin * 1000) / 1000,
  };
}

/** Plain-language explanation of the two strongest dimensions. */
export function explainScores(scores: Vector): { dimension: Dimension; text: string; strength: number }[] {
  return DIMENSIONS.map((d) => ({ dimension: d, strength: Math.abs(scores[d]), text: scores[d] >= 0 ? DIMENSION_INFO[d].highText : DIMENSION_INFO[d].lowText }))
    .sort((a, b) => b.strength - a.strength);
}

/** Self-selected labels a user can add to their identity (shown as "you said"). */
export const IDENTITY_LABELS = [
  'Night owl', 'Early riser', 'Playlist curator', 'Plant parent', 'Group trip planner', 'Bookworm', 'Gym regular',
  'Chai over coffee', 'Coffee over chai', 'Foodie', 'Movie marathoner', 'Gamer', 'Doodler', 'Voice-note person',
  'Text-back-instantly', 'Seen-zoned (sorry)', 'Introvert, mostly', 'Extrovert, mostly', 'Overthinker', 'Daydreamer',
  'Meme archivist', 'Cricket fan', 'Football fan', 'Music festival person', 'Solo traveller', 'Homebody', 'Hopeless romantic',
  'Always early', 'Fashionably late', 'Astrology curious', 'Astrology sceptic',
] as const;
