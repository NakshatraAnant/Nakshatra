/**
 * Transparent, deterministic ranking functions. Weights live here (not in UI code)
 * and are covered by unit tests. Ranking never optimises for time spent; it uses
 * explicit follows, interests, recency, explicit engagement and user feedback,
 * with per-author frequency caps.
 */

export const FEED_WEIGHTS = {
  follow: 3,
  group: 2,
  interestPerTopic: 1.5,
  interestMax: 3,
  recency: 4,
  recencyHalfLifeHours: 36,
  engagement: 1,
  engagementMax: 3,
  typePreference: 1,
  feedbackMore: 2,
  feedbackLess: -3,
  reportedPenalty: -5,
  /** Questions and dilemmas with no replies yet, under 48 hours old. */
  needsAnswers: 1.5,
  perAuthorCap: 3,
} as const;

export interface FeedCandidate {
  id: string;
  authorId: string;
  kind: string;
  topics: string[];
  createdAt: Date;
  groupId: string | null;
  reactionCount: number;
  commentCount: number;
  openReports: number;
  /** Pseudonymous posts never use author-based signals, so ranking cannot hint at who wrote them. */
  pseudonymous?: boolean;
}

export interface FeedViewer {
  userId: string;
  following: Set<string>;
  interests: string[];
  preferredKinds: string[];
  moreLikeAuthors: Set<string>;
  lessLikeAuthors: Set<string>;
}

export interface RankedItem { id: string; score: number; reasons: string[] }

export function scorePost(c: FeedCandidate, v: FeedViewer, now: Date): RankedItem {
  const W = FEED_WEIGHTS;
  let score = 0;
  const reasons: string[] = [];
  const authorSignals = !c.pseudonymous;
  if (authorSignals && v.following.has(c.authorId)) { score += W.follow; reasons.push('From someone you follow'); }
  if (c.groupId) { score += W.group; reasons.push('From a group you belong to'); }
  const overlap = c.topics.filter((t) => v.interests.includes(t));
  if (overlap.length) {
    score += Math.min(W.interestMax, overlap.length * W.interestPerTopic);
    reasons.push(`Matches your interests: ${overlap.join(', ')}`);
  }
  const ageHours = Math.max(0, (now.getTime() - c.createdAt.getTime()) / 3600000);
  score += W.recency * Math.pow(0.5, ageHours / W.recencyHalfLifeHours);
  if (ageHours < 24) reasons.push('Recent');
  const eng = Math.min(W.engagementMax, Math.log1p(c.reactionCount + 2 * c.commentCount) * W.engagement);
  score += eng;
  if (eng >= 1) reasons.push('People are discussing this');
  if (v.preferredKinds.includes(c.kind)) { score += W.typePreference; reasons.push(`You prefer ${c.kind.replace('_', ' ')} posts`); }
  if (authorSignals && v.moreLikeAuthors.has(c.authorId)) { score += W.feedbackMore; reasons.push('You asked for more like this'); }
  if (authorSignals && v.lessLikeAuthors.has(c.authorId)) score += W.feedbackLess;
  if ((c.kind === 'question' || c.kind === 'dilemma') && c.commentCount === 0 && ageHours < 48 && c.authorId !== v.userId) { score += W.needsAnswers; reasons.push('Looking for answers'); }
  if (c.openReports >= 2) score += W.reportedPenalty;
  if (c.authorId === v.userId) reasons.push('Your post');
  // Note: engagement is log-scaled and capped, reports penalise, and the per-author cap below
  // keeps any single voice (including prolific posters) from dominating the feed.
  return { id: c.id, score: Number(score.toFixed(4)), reasons };
}

export function rankFeed(cands: FeedCandidate[], v: FeedViewer, now: Date, mode: 'ranked' | 'chronological' = 'ranked'): RankedItem[] {
  if (mode === 'chronological') {
    return [...cands].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id)).map((c) => ({ id: c.id, score: 0, reasons: ['Newest first'] }));
  }
  const scored = cands.map((c) => ({ c, r: scorePost(c, v, now) }))
    .sort((a, b) => b.r.score - a.r.score || b.c.createdAt.getTime() - a.c.createdAt.getTime() || a.c.id.localeCompare(b.c.id));
  // Frequency cap: at most N posts per author before others get a turn; excess is appended in order.
  const perAuthor = new Map<string, number>();
  const head: RankedItem[] = [];
  const tail: RankedItem[] = [];
  for (const { c, r } of scored) {
    const n = perAuthor.get(c.authorId) ?? 0;
    (n < FEED_WEIGHTS.perAuthorCap ? head : tail).push(r);
    perAuthor.set(c.authorId, n + 1);
  }
  return [...head, ...tail];
}

/* ---------------- Search & discovery ---------------- */

export const SEARCH_WEIGHTS = { exactTitle: 5, titlePrefix: 3, titleContains: 2, bodyContains: 1, verified: 1.5, recencyDays: 90, recency: 1 };

export function textRelevance(query: string, title: string, body = ''): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  let s = 0;
  if (t === q) s += SEARCH_WEIGHTS.exactTitle;
  else if (t.startsWith(q)) s += SEARCH_WEIGHTS.titlePrefix;
  else if (t.includes(q)) s += SEARCH_WEIGHTS.titleContains;
  const terms = q.split(/\s+/).filter((x) => x.length > 1);
  s += terms.filter((term) => t.includes(term)).length * 0.5;
  if (b.includes(q)) s += SEARCH_WEIGHTS.bodyContains;
  return s;
}

/* ---------------- Expert ranking ---------------- */

export interface ExpertCandidate {
  userId: string;
  verified: boolean;
  languages: string[];
  specializations: string[];
  ratingAvg: number | null;
  ratingCount: number;
  nextSlotHours: number | null;
}

/**
 * Explainable expert ordering: explicit filter match first, then verification, then
 * Bayesian-averaged rating (prior 4.0 with weight 5 — so few reviews do not dominate),
 * then availability soonness. No paid placement is applied.
 */
export function rankExperts(list: ExpertCandidate[], prefs: { language?: string; specialization?: string }): (ExpertCandidate & { score: number; reasons: string[] })[] {
  return list.map((e) => {
    const reasons: string[] = [];
    let score = 0;
    if (prefs.language && e.languages.includes(prefs.language)) { score += 2; reasons.push(`Speaks ${prefs.language}`); }
    if (prefs.specialization && e.specializations.includes(prefs.specialization)) { score += 2; reasons.push(`Specialises in ${prefs.specialization}`); }
    if (e.verified) { score += 1.5; reasons.push('Verified credentials'); }
    const bayes = (4 * 5 + (e.ratingAvg ?? 0) * e.ratingCount) / (5 + e.ratingCount);
    score += (bayes - 3) * 1.2;
    if (e.ratingCount) reasons.push(`${(e.ratingAvg ?? 0).toFixed(1)}★ from ${e.ratingCount} verified review${e.ratingCount > 1 ? 's' : ''}`);
    if (e.nextSlotHours !== null && e.nextSlotHours < 48) { score += 1; reasons.push('Available within 48 hours'); }
    return { ...e, score: Number(score.toFixed(3)), reasons };
  }).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
}

/* ---------------- Dating ranking ---------------- */

export interface DatingCandidate {
  userId: string;
  intent: string;
  interests: string[];
  distanceKm: number;
  completeness: number;
  likedViewer: boolean;
  astroScore: number | null;
  verified: boolean;
}

export const DATING_WEIGHTS = { intentMatch: 3, sharedInterest: 0.75, sharedInterestMax: 3, distance: 2, completeness: 1.5, likedYou: 1, astrology: 1.5, verified: 0.5 };

/** Ranks only already-eligible candidates (hard filters are applied before this). */
export function rankDating(list: DatingCandidate[], viewer: { intent: string; interests: string[]; maxDistanceKm: number; useAstrology: boolean }): (DatingCandidate & { score: number; reasons: string[] })[] {
  const W = DATING_WEIGHTS;
  return list.map((c) => {
    const reasons: string[] = [];
    let score = 0;
    if (c.intent === viewer.intent) { score += W.intentMatch; reasons.push('Looking for the same kind of relationship'); }
    const shared = c.interests.filter((i) => viewer.interests.includes(i));
    if (shared.length) { score += Math.min(W.sharedInterestMax, shared.length * W.sharedInterest); reasons.push(`Shared interests: ${shared.slice(0, 3).join(', ')}`); }
    score += W.distance * (1 - Math.min(1, c.distanceKm / Math.max(1, viewer.maxDistanceKm)));
    score += W.completeness * c.completeness;
    if (c.likedViewer) score += W.likedYou;
    if (viewer.useAstrology && c.astroScore !== null) {
      score += W.astrology * (c.astroScore / 100);
      if (c.astroScore >= 65) reasons.push('Harmonious chart contacts (one lens among many)');
    }
    if (c.verified) { score += W.verified; reasons.push('Verified profile'); }
    return { ...c, score: Number(score.toFixed(3)), reasons };
  }).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
}
