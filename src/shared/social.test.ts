import { describe, expect, it } from 'vitest';
import { DIMENSIONS, PERSONA_ARCHETYPES, QUESTIONS, scorePersonality, AssessmentError, type Answers } from './personality';
import { GAMES, GAME_BY_KEY, GameError, canAct, pendingActors, publicRound, settlePrediction, shuffle, type PlayContext, type Submission } from './play/engine';
import { RITUALS, periodFor, promptFor, coprimeStride, RITUAL_BY_KEY } from './rituals';
import { scorePost, rankFeed, type FeedCandidate, type FeedViewer } from '../server/services/ranking';
import { screenText, DEFAULT_BLOCKED_PHRASES } from '../server/services/moderation';
import { canonicalEmail } from '../server/services/referrals';
import { rankFor, levelForXp, XP_RULES } from './gamification';

const all = (v: number): Answers => Object.fromEntries(QUESTIONS.map((q) => [q.id, v]));
const lean = (sign: 1 | -1): Answers => Object.fromEntries(QUESTIONS.map((q) => [q.id, q.key === sign ? 5 : 1]));

describe('personality scoring', () => {
  it('is deterministic and versioned', () => {
    const a = scorePersonality(lean(1));
    expect(scorePersonality(lean(1))).toEqual(a);
    expect(a.version).toBe('personality-v1');
  });

  it('maps fully agreeing with high-keyed items to +1 on every dimension', () => {
    const r = scorePersonality(lean(1));
    for (const d of DIMENSIONS) expect(r.scores[d]).toBe(1);
    const low = scorePersonality(lean(-1));
    for (const d of DIMENSIONS) expect(low.scores[d]).toBe(-1);
  });

  it('neutral answers give zero scores and a deterministic tie-break by catalogue order', () => {
    const r = scorePersonality(all(3));
    for (const d of DIMENSIONS) expect(r.scores[d]).toBe(0);
    expect(r.archetype).toBe(scorePersonality(all(3)).archetype);
  });

  it('marks dimensions with too few answers unknown and lowers confidence', () => {
    const answers = lean(1);
    for (const q of QUESTIONS.filter((x) => x.dimension === 'energy').slice(0, 2)) delete answers[q.id];
    const r = scorePersonality(answers);
    expect(r.unknown).toEqual(['energy']);
    expect(r.confidence).toBe('low');
  });

  it('rejects incomplete or out-of-range answers', () => {
    expect(() => scorePersonality({ q1: 3 })).toThrow(AssessmentError);
    expect(() => scorePersonality({ ...all(3), q2: 7 })).toThrow(AssessmentError);
    expect(() => scorePersonality({ ...all(3), q99: 3 })).toThrow(AssessmentError);
  });

  it('every archetype is reachable: its own prototype answers map back to it', () => {
    for (const a of PERSONA_ARCHETYPES) {
      // Answer each question so the dimension score lands as close as possible to the prototype value.
      const answers: Answers = {};
      for (const q of QUESTIONS) answers[q.id] = Math.max(1, Math.min(5, Math.round(3 + 2 * q.key * a.prototype[q.dimension])));
      expect(scorePersonality(answers).archetype, a.key).toBe(a.key);
    }
  });

  it('keeps archetypes distinct and uniquely named', () => {
    expect(new Set(PERSONA_ARCHETYPES.map((a) => a.name)).size).toBe(PERSONA_ARCHETYPES.length);
    for (let i = 0; i < PERSONA_ARCHETYPES.length; i++) for (let j = i + 1; j < PERSONA_ARCHETYPES.length; j++) {
      const d = Math.sqrt(DIMENSIONS.reduce((s, k) => s + (PERSONA_ARCHETYPES[i].prototype[k] - PERSONA_ARCHETYPES[j].prototype[k]) ** 2, 0));
      expect(d, `${PERSONA_ARCHETYPES[i].key} vs ${PERSONA_ARCHETYPES[j].key}`).toBeGreaterThan(0.5);
    }
  });
});

const players = (n: number, opts: Partial<{ share: boolean }> = {}) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, name: `P${i}`, shareIdentity: Boolean(opts.share), archetype: opts.share ? PERSONA_ARCHETYPES[i].key : null, scores: opts.share ? PERSONA_ARCHETYPES[i].prototype : null }));
const ctxOf = (n: number, extra: Partial<PlayContext> = {}): PlayContext => ({ sessionId: 's1', participants: players(n), hostId: 'u0', recentPromptIds: [], memories: [], ...extra });

describe('game engine', () => {
  it('defines twelve distinct games with valid metadata', () => {
    expect(GAMES).toHaveLength(12);
    expect(new Set(GAMES.map((g) => g.key)).size).toBe(12);
    for (const g of GAMES) { expect(g.minPlayers).toBeGreaterThanOrEqual(1); expect(g.howToPlay.length).toBeGreaterThan(1); expect(g.safety).toBeTruthy(); }
  });

  it('plans rounds deterministically per session and avoids recently used prompts', () => {
    const g = GAME_BY_KEY.pick_your_chaos;
    const a = g.plan(ctxOf(2));
    expect(g.plan(ctxOf(2))).toEqual(a);
    const recent = a.map((r) => r.promptId!);
    const b = g.plan(ctxOf(2, { recentPromptIds: recent }));
    expect(b.some((r) => recent.includes(r.promptId!))).toBe(false);
  });

  it('Who Said It: hides the author, excludes them from guessing and scores correctly', () => {
    const g = GAME_BY_KEY.who_said_it;
    const ctx = ctxOf(3);
    const rounds = g.plan(ctx);
    const subs: Submission[] = [{ userId: 'u0', payload: { text: 'I once ate soap' } }, { userId: 'u1', payload: { text: 'I sing to plants' } }];
    const extended = g.extend!(ctx, rounds, 0, subs);
    expect(extended).toHaveLength(3);
    const vote = extended[1];
    expect(publicRound(vote)).not.toHaveProperty('secret');
    const author = String(vote.secret!.authorId);
    expect(canAct(vote, author)).toBe(false);
    const others = ['u0', 'u1', 'u2'].filter((u) => u !== author);
    const votes: Submission[] = [{ userId: others[0], payload: { optionId: author } }, { userId: others[1], payload: { optionId: others[0] } }];
    expect(g.score(vote, votes, ctx)).toEqual({ [others[0]]: 2, [author]: 1 });
    expect(() => g.validate(vote, { optionId: others[0] }, ctx, others[0])).toThrow(GameError);
  });

  it('Honest Vote reveals totals only and blocks self-votes', () => {
    const g = GAME_BY_KEY.honest_vote;
    const ctx = ctxOf(3);
    const [r] = g.plan(ctx);
    expect(() => g.validate(r, { optionId: 'u1' }, ctx, 'u1')).toThrow(GameError);
    const rev = g.reveal(r, [{ userId: 'u0', payload: { optionId: 'u2' } }, { userId: 'u1', payload: { optionId: 'u2' } }], ctx);
    expect(JSON.stringify(rev)).not.toMatch(/u0|u1"/);
    expect(rev.lines[0]).toEqual({ label: 'P2', value: 2 });
  });

  it('Archetype Showdown needs a consenting player and only uses shared archetypes', () => {
    const g = GAME_BY_KEY.archetype_showdown;
    expect(() => g.plan(ctxOf(3))).toThrow(GameError);
    const ctx: PlayContext = { ...ctxOf(3), participants: players(3, { share: true }) };
    const rounds = g.plan(ctx);
    expect(rounds.length).toBe(3);
    for (const r of rounds) { expect(r.options).toHaveLength(4); expect(r.options!.map((o) => o.id)).toContain(r.secret!.answer); }
  });

  it('Plot Twist enforces turn order', () => {
    const g = GAME_BY_KEY.plot_twist;
    const rounds = g.plan(ctxOf(3));
    expect(rounds).toHaveLength(6);
    expect(new Set(rounds.slice(0, 3).map((r) => r.actorId)).size).toBe(3);
    expect(pendingActors(rounds[0], ['u0', 'u1', 'u2'], [])).toEqual([rounds[0].actorId]);
    expect(() => g.validate(rounds[0], { text: 'x'.repeat(141) }, ctxOf(3), rounds[0].actorId!)).toThrow(GameError);
  });

  it('Prediction Market settles play points parimutuel without creating value', () => {
    const stakes: Submission[] = [{ userId: 'a', payload: { optionId: 'o0', stake: 5 } }, { userId: 'b', payload: { optionId: 'o1', stake: 5 } }, { userId: 'c', payload: { optionId: 'o0', stake: 10 } }];
    const out = settlePrediction(stakes, 'o0');
    expect(out).toEqual({ a: 5 + 6, b: 5, c: 0 + 13 });
    expect(Object.values(out).reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(30);
    const g = GAME_BY_KEY.prediction_market;
    const [stake, resolve] = g.plan(ctxOf(2));
    expect(resolve.actorId).toBe('u0');
    expect(() => g.validate(stake, { optionId: stake.options![0].id, stake: 11 }, ctxOf(2), 'u1')).toThrow(GameError);
  });

  it('Memory Lane refuses to start without enough reusable lines', () => {
    const g = GAME_BY_KEY.memory_lane;
    expect(() => g.plan(ctxOf(3))).toThrow(GameError);
    const memories = [0, 1, 2].map((i) => ({ id: `m${i}`, text: `line ${i}`, authorId: `u${i}` }));
    expect(g.plan(ctxOf(3, { memories }))).toHaveLength(3);
    expect(g.plan(ctxOf(3, { memories: [...memories, { id: 'x', text: 'outsider', authorId: 'zz' }] })).every((r) => r.secret!.authorId !== 'zz')).toBe(true);
  });

  it('This or That and Compatibility Lab summaries count identical answers only', () => {
    const g = GAME_BY_KEY.compatibility_lab;
    const ctx = ctxOf(3);
    const rounds = g.plan(ctx);
    const subsByRound = rounds.map(() => [{ userId: 'u0', payload: { optionId: 'o0' } }, { userId: 'u1', payload: { optionId: 'o0' } }, { userId: 'u2', payload: { optionId: 'o1' } }]);
    const sum = g.summary!(rounds, subsByRound, ctx);
    expect(sum.headline).toContain('P0 & P1');
    expect(sum.note).toMatch(/not a prediction/);
  });

  it('every game can be planned and validated with a sample move', () => {
    const memories = [0, 1, 2].map((i) => ({ id: `m${i}`, text: `line ${i}`, authorId: `u${i}` }));
    for (const g of GAMES) {
      const ctx: PlayContext = { ...ctxOf(Math.max(3, g.minPlayers), { memories }), participants: players(Math.max(3, g.minPlayers), { share: true }) };
      const rounds = g.plan(ctx);
      expect(rounds.length, g.key).toBeGreaterThan(0);
      const r = rounds[0];
      const actor = r.actorId ?? ctx.participants.find((p) => p.userId !== r.excludeId)!.userId;
      const payload = r.options ? { optionId: r.options.find((o) => o.id !== actor)!.id, stake: 3 } : { text: 'A harmless line' };
      expect(() => g.validate(r, payload, ctx, actor), g.key).not.toThrow();
    }
  });

  it('shuffle is a deterministic permutation', () => {
    expect(shuffle([1, 2, 3, 4], 'x')).toEqual(shuffle([1, 2, 3, 4], 'x'));
    expect([...shuffle([1, 2, 3, 4], 'x')].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('content banks', () => {
  it('every prompt id is unique across all banks (usage history depends on it)', async () => {
    const banks = await import('./play/content');
    const ids = Object.values(banks).filter(Array.isArray).flatMap((b) => (b as { id: string }[]).map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ritual engine', () => {
  it('does not repeat a prompt until the bank is exhausted', () => {
    for (const def of RITUALS) {
      const seen = new Set<string>();
      for (let i = 0; i < 12; i++) seen.add(promptFor(def.key, 1000 + i, 'scope').id);
      expect(seen.size, def.key).toBe(12);
    }
  });

  it('gives everyone in a scope the same prompt and different scopes can differ', () => {
    expect(promptFor('circle_question', 50, 'c1').id).toBe(promptFor('circle_question', 50, 'c1').id);
    const differs = [...Array(10).keys()].some((i) => promptFor('circle_question', i, 'c1').id !== promptFor('circle_question', i, 'c2').id);
    expect(differs).toBe(true);
  });

  it('uses calendar days in the user’s time zone, across DST changes', () => {
    const daily = RITUAL_BY_KEY.daily_choice;
    // 23:30 UTC on 30 Mar 2025 is already 31 Mar in Kolkata, still 30 Mar in New York.
    const t = new Date('2025-03-30T23:30:00Z');
    expect(periodFor(daily, t, 'Asia/Kolkata').key).toBe('2025-03-31');
    expect(periodFor(daily, t, 'America/New_York').key).toBe('2025-03-30');
    // Consecutive local days across the US DST change (9 Mar 2025) have consecutive indices.
    const a = periodFor(daily, new Date('2025-03-08T17:00:00Z'), 'America/New_York');
    const b = periodFor(daily, new Date('2025-03-09T17:00:00Z'), 'America/New_York');
    expect(b.index - a.index).toBe(1);
    expect(periodFor(RITUAL_BY_KEY.weekly_reflection, t, 'Asia/Kolkata').key).toMatch(/^2025-W\d{2}$/);
  });

  it('chooses a stride coprime with the bank size', () => {
    for (const n of [12, 20, 30, 40, 60]) for (let seed = 0; seed < 50; seed++) {
      const s = coprimeStride(n, seed);
      const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
      expect(g(s, n)).toBe(1);
    }
  });
});

describe('feed ranking safety', () => {
  const viewer: FeedViewer = { userId: 'me', following: new Set(['f']), interests: [], preferredKinds: [], moreLikeAuthors: new Set(['f']), lessLikeAuthors: new Set() };
  const base: FeedCandidate = { id: 'p', authorId: 'f', kind: 'thought', topics: [], createdAt: new Date(), groupId: null, reactionCount: 0, commentCount: 0, openReports: 0 };

  it('never uses author signals for pseudonymous posts', () => {
    const named = scorePost(base, viewer, new Date());
    const pseudo = scorePost({ ...base, pseudonymous: true }, viewer, new Date());
    expect(named.reasons).toContain('From someone you follow');
    expect(pseudo.reasons.join(' ')).not.toMatch(/follow|asked for more/);
    expect(pseudo.score).toBeLessThan(named.score);
  });

  it('boosts unanswered questions and caps engagement so outrage cannot dominate', () => {
    const q = scorePost({ ...base, authorId: 'x', kind: 'question' }, viewer, new Date());
    expect(q.reasons).toContain('Looking for answers');
    const viral = scorePost({ ...base, authorId: 'x', reactionCount: 100000, commentCount: 100000 }, viewer, new Date());
    const modest = scorePost({ ...base, authorId: 'x', reactionCount: 20, commentCount: 20 }, viewer, new Date());
    expect(viral.score - modest.score).toBeLessThanOrEqual(0.0001);
  });

  it('limits any single author to three posts before others get a turn', () => {
    const posts = Array.from({ length: 6 }, (_, i) => ({ ...base, id: `a${i}`, authorId: 'spammer' })).concat([{ ...base, id: 'b', authorId: 'other', createdAt: new Date(Date.now() - 3600000) }]);
    const ranked = rankFeed(posts, viewer, new Date());
    expect(ranked.slice(0, 4).map((r) => r.id)).toContain('b');
  });
});

describe('moderation, referrals and levels', () => {
  it('blocks harassment phrases and contact details where identity is protected', () => {
    expect(screenText('just kys already', DEFAULT_BLOCKED_PHRASES).ok).toBe(false);
    expect(screenText('Skyscrapers are tall', DEFAULT_BLOCKED_PHRASES).ok).toBe(true);
    expect(screenText('call me on 98765 43210', DEFAULT_BLOCKED_PHRASES, { protectIdentity: true }).ok).toBe(false);
    expect(screenText('call me on 98765 43210', DEFAULT_BLOCKED_PHRASES).ok).toBe(true);
  });

  it('canonicalises email aliases for self-referral checks', () => {
    expect(canonicalEmail('A.Sha+test@Gmail.com')).toBe(canonicalEmail('asha@googlemail.com'));
    expect(canonicalEmail('a.sha@example.com')).not.toBe(canonicalEmail('asha@example.com'));
  });

  it('names levels and rewards meaningful actions only', () => {
    expect(rankFor(1)).toBe('New Signal');
    expect(rankFor(6)).toBe('Inner Circle');
    expect(rankFor(20)).toBe('Constellation Keeper');
    expect(levelForXp(0).level).toBe(1);
    expect(XP_RULES.daily_checkin.amount).toBeLessThan(XP_RULES.game_completed.amount);
    expect(XP_RULES.reply_received.repeat).toBe('per_source');
  });
});
