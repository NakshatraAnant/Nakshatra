import { QuizError, validateQuiz, type QuizDefinition } from './quiz';

/**
 * Ads (ads-v1): staff-managed, contextual-only sponsored cards.
 *
 *  - Disclosure: every ad is labelled "Sponsored · <advertiser>" with a "Why am I seeing this?" line.
 *  - Targeting is contextual only: the topic a member is browsing and the app language. Nothing about the
 *    member — personality, archetype, astrology, religion, caste, health, sexuality, relationship status, age,
 *    location or behaviour — can be targeted. The allowed topics exclude religious, astrological and
 *    relationship/wellbeing topics, and the server rejects any other targeting key.
 *  - Review: a campaign is written by one staff member and approved by a different one (four-eyes).
 *  - Frequency: at most `frequencyCapPerDay` showings of one campaign per member per day, and at most
 *    one ad every AD_RULES.minPostsBetweenAds posts in a feed.
 *  - Nakshatra+ members see no ads. Members can hide any ad.
 *  - Nothing here bills anyone: there is no self-serve buying and no ad payments yet.
 *  - Sponsored quizzes (trivia only — never "which type are you" quizzes, which would profile people) and sponsored
 *    challenges go through the same review. Taking part earns no XP or rewards, so sponsors can't buy progress;
 *    sponsors only ever see totals.
 */
export const AD_TOPICS = ['friendship', 'work', 'study', 'music', 'film', 'food', 'travel', 'tech', 'sport', 'fun', 'learning', 'life'] as const;
export type AdTopic = (typeof AD_TOPICS)[number];
export const AD_LANGUAGES = ['en', 'hi'] as const;
export const AD_PLACEMENTS = ['feed', 'quiz', 'quest'] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];
export type AdStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'paused' | 'ended';

export const AD_RULES = { minPostsBetweenAds: 6, maxCapPerDay: 5, defaultCapPerDay: 2, headline: 60, body: 200, cta: 20, maxDays: 90 } as const;

export interface AdTargeting { topics: AdTopic[]; languages: (typeof AD_LANGUAGES)[number][] }

/**
 * Words that would make an ad speak to (or about) a sensitive trait, or lean on the identity features of the app.
 * Matching is case-insensitive on whole words; it is a review aid that blocks submission, not a substitute for review.
 */
const SENSITIVE = [
  // identity / personality features of Nakshatra itself
  'archetype', 'personality', 'introvert', 'extrovert', 'introverts', 'extroverts', 'cosmic id', 'nakshatra', 'zodiac', 'horoscope', 'kundli', 'rashi', 'sun sign', 'moon sign', 'rising sign',
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
  // protected or sensitive traits
  'caste', 'religion', 'religious', 'hindu', 'muslim', 'christian', 'sikh', 'jain', 'buddhist', 'gay', 'lesbian', 'bisexual', 'transgender', 'queer', 'lgbt', 'lgbtq',
  'pregnant', 'pregnancy', 'depression', 'depressed', 'anxiety', 'diabetes', 'cancer patient', 'disability', 'disabled', 'single', 'divorced', 'lonely',
  'debt', 'loan', 'bankrupt', 'people like you', 'your type',
];

export interface Creative { headline: string; body: string; ctaLabel: string; destinationUrl: string }

/** Policy problems that block submission. Empty means it may go to review. */
export function adPolicyIssues(c: Creative, t: AdTargeting): string[] {
  const issues: string[] = [];
  const text = ` ${`${c.headline} ${c.body} ${c.ctaLabel}`.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;
  // Whole words, including simple plurals ("scorpios", "introverts").
  const hits = SENSITIVE.filter((w) => text.includes(` ${w} `) || text.includes(` ${w}s `) || text.includes(` ${w}es `));
  if (hits.length) issues.push(`Mentions a sensitive or identity topic (${hits.slice(0, 3).join(', ')}). Ads can’t speak to who someone is.`);
  if (!c.headline.trim()) issues.push('Add a headline.');
  if (c.headline.length > AD_RULES.headline) issues.push(`Headline is over ${AD_RULES.headline} characters.`);
  if (c.body.length > AD_RULES.body) issues.push(`Text is over ${AD_RULES.body} characters.`);
  try {
    const u = new URL(c.destinationUrl);
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) issues.push('The link must be a plain https:// address.');
  } catch { issues.push('The link must be a plain https:// address.'); }
  if (t.topics.some((x) => !(AD_TOPICS as readonly string[]).includes(x))) issues.push('Only the listed contextual topics can be targeted.');
  if (t.languages.some((x) => !(AD_LANGUAGES as readonly string[]).includes(x))) issues.push('Unknown language.');
  return issues;
}

/** Contextual match: untargeted campaigns run anywhere; topic campaigns only where that topic is being browsed. */
export function matchesContext(t: AdTargeting, ctx: { topic: string | null; language: string }): boolean {
  if (t.languages.length && !t.languages.includes(ctx.language as never)) return false;
  if (!t.topics.length) return true;
  return ctx.topic !== null && t.topics.includes(ctx.topic as AdTopic);
}

/** The "Why am I seeing this?" line. It never mentions anything about the member. */
export function whyThisAd(t: AdTargeting, ctx: { topic: string | null }): string {
  if (t.topics.length && ctx.topic) return `Shown because you’re browsing “${ctx.topic}”. Ads on Nakshatra are never based on your profile, personality or activity.`;
  return 'Shown to everyone in this feed. Ads on Nakshatra are never based on your profile, personality or activity.';
}

export function adDisclosure(advertiser: string): string { return `Sponsored · ${advertiser}`; }

/** Allowed status changes. Editing an approved or rejected ad sends it back to draft (and so to review again). */
export const AD_TRANSITIONS: Record<AdStatus, AdStatus[]> = {
  draft: ['in_review', 'ended'],
  in_review: ['approved', 'rejected', 'draft'],
  approved: ['paused', 'ended', 'draft'],
  paused: ['approved', 'ended', 'draft'],
  rejected: ['draft', 'ended'],
  ended: [],
};
export const canMoveAd = (from: AdStatus, to: AdStatus) => AD_TRANSITIONS[from].includes(to);

/* ---------------- Sponsored quizzes and challenges ---------------- */

export interface SponsoredQuest { title: string; description: string; steps: string[] }
export const SPONSORED_RULES = { questTitle: 60, questDescription: 300, minSteps: 1, maxSteps: 5, step: 100 } as const;

function sensitiveHits(text: string): string[] {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')} `;
  return SENSITIVE.filter((w) => t.includes(` ${w} `) || t.includes(` ${w}s `) || t.includes(` ${w}es `));
}

/** Problems with a sponsored quiz or challenge that block submission. Feed cards carry no content. */
export function sponsoredContentIssues(placement: string, content: unknown): string[] {
  if (placement === 'feed') return content == null ? [] : ['Feed cards don’t carry a quiz or challenge.'];
  if (!content || typeof content !== 'object') return [placement === 'quiz' ? 'Add the quiz questions.' : 'Add the challenge.'];
  if (placement === 'quiz') {
    const q = content as QuizDefinition;
    if (q.kind !== 'trivia') return ['Sponsored quizzes must be trivia. “Which type are you” quizzes would profile people.'];
    try { validateQuiz(q); } catch (e) { return [e instanceof QuizError ? e.message : 'The quiz isn’t valid.']; }
    const hits = sensitiveHits([q.title, q.description, ...q.questions.flatMap((x) => [x.text, ...x.options.map((o) => o.text)])].join(' '));
    return hits.length ? [`The quiz mentions a sensitive or identity topic (${hits.slice(0, 3).join(', ')}).`] : [];
  }
  if (placement === 'quest') {
    const q = content as SponsoredQuest;
    const issues: string[] = [];
    if (typeof q.title !== 'string' || q.title.trim().length < 3 || q.title.length > SPONSORED_RULES.questTitle) issues.push(`Give the challenge a title (up to ${SPONSORED_RULES.questTitle} characters).`);
    if (typeof q.description !== 'string' || q.description.length > SPONSORED_RULES.questDescription) issues.push(`The challenge description is over ${SPONSORED_RULES.questDescription} characters.`);
    if (!Array.isArray(q.steps) || q.steps.length < SPONSORED_RULES.minSteps || q.steps.length > SPONSORED_RULES.maxSteps || q.steps.some((x) => typeof x !== 'string' || !x.trim() || x.length > SPONSORED_RULES.step)) issues.push(`A challenge has ${SPONSORED_RULES.minSteps}–${SPONSORED_RULES.maxSteps} steps of up to ${SPONSORED_RULES.step} characters.`);
    if (!issues.length) {
      const hits = sensitiveHits([q.title, q.description, ...q.steps].join(' '));
      if (hits.length) issues.push(`The challenge mentions a sensitive or identity topic (${hits.slice(0, 3).join(', ')}).`);
    }
    return issues;
  }
  return ['Unknown placement.'];
}
