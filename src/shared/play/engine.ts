import {
  CHAOS_PAIRS, COMPATIBILITY_QUESTIONS, CONFESSION_PROMPTS, DECODER_QUESTIONS, HONEST_VOTE_PROMPTS, HOT_TAKE_TOPICS,
  PLOT_OPENERS, PREDICTION_QUESTIONS, STATEMENT_PROMPTS, THIS_OR_THAT, type OptionPrompt, type PairPrompt,
} from './content';
import { DIMENSIONS, DIMENSION_INFO, PERSONA_ARCHETYPES, PERSONA_BY_KEY, type Vector } from '../personality';

/**
 * Nakshatra Play engine: a database-backed, turn-based game framework.
 *
 * A game definition is pure: given the session context it plans rounds, validates
 * submissions, decides who must act, and computes reveals and scores. The server
 * stores rounds in the session state, collects one submission per player per
 * round, closes a round when every eligible player has acted (or the host moves on
 * with at least one submission), then stores the reveal and adds the scores.
 *
 * Secrets (who wrote a statement, a target's real answer) live in `round.secret`
 * and are stripped by the server before any round is sent to a client.
 */

export interface Participant { userId: string; name: string; shareIdentity: boolean; archetype: string | null; scores: Vector | null }
export interface Memory { id: string; text: string; authorId: string }
export interface PlayContext {
  sessionId: string;
  participants: Participant[];
  hostId: string;
  /** Prompt ids used recently in this circle (or by this player), avoided when possible. */
  recentPromptIds: string[];
  memories: Memory[];
}

export type RoundKind = 'submit' | 'vote' | 'choice' | 'turn' | 'stake' | 'resolve';
export interface Option { id: string; label: string }
export interface Round {
  kind: RoundKind;
  title: string;
  prompt: string;
  promptId?: string;
  options?: Option[];
  maxLength?: number;
  /** Only this user may act (turn-based rounds, host resolution). */
  actorId?: string;
  /** This user may not act (the person being guessed about). */
  excludeId?: string;
  /** Visible to clients: whose round it is about. */
  aboutId?: string;
  /** Submission id of the line this round shows, so players can report it without learning the author. */
  ref?: string;
  /** Never sent to clients. */
  secret?: Record<string, unknown>;
}

export interface Submission { userId: string; payload: Record<string, unknown>; id?: string }
export interface Reveal { headline: string; lines: { label: string; detail?: string; value?: number; ref?: string }[]; note?: string }
export interface Summary { headline: string; lines: { label: string; detail?: string; value?: number }[]; note?: string }

export class GameError extends Error {}

export interface GameDefinition {
  key: string;
  version: number;
  name: string;
  tagline: string;
  category: 'guessing' | 'opinions' | 'storytelling' | 'identity' | 'prediction';
  minPlayers: number;
  maxPlayers: number;
  howToPlay: string[];
  safety: string;
  /** Asked when joining; shown as checkboxes. */
  consents?: ('allowReuse' | 'shareIdentity')[];
  plan(ctx: PlayContext): Round[];
  /** Rounds that depend on earlier submissions; called after a round closes. */
  extend?(ctx: PlayContext, rounds: Round[], closedIndex: number, subs: Submission[]): Round[];
  validate(round: Round, payload: unknown, ctx: PlayContext, userId: string): Record<string, unknown>;
  reveal(round: Round, subs: Submission[], ctx: PlayContext): Reveal;
  score(round: Round, subs: Submission[], ctx: PlayContext): Record<string, number>;
  summary?(rounds: Round[], subsByRound: Submission[][], ctx: PlayContext): Summary;
}

/* ---------------- deterministic randomness ---------------- */

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = hashSeed(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], seed: string): T[] {
  const r = rng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** Picks n prompts, preferring ones not used recently; deterministic per session. */
export function pick<T extends { id: string }>(bank: T[], n: number, ctx: PlayContext, salt: string): T[] {
  const fresh = bank.filter((x) => !ctx.recentPromptIds.includes(x.id));
  const pool = fresh.length >= n ? fresh : [...fresh, ...bank.filter((x) => ctx.recentPromptIds.includes(x.id))];
  return shuffle(pool, `${ctx.sessionId}:${salt}`).slice(0, n);
}

/* ---------------- validation helpers ---------------- */

function text(payload: unknown, max: number): string {
  const t = typeof (payload as { text?: unknown })?.text === 'string' ? (payload as { text: string }).text.trim().replace(/\s+/g, ' ') : '';
  if (!t) throw new GameError('Write something first.');
  if (t.length > max) throw new GameError(`Keep it under ${max} characters.`);
  return t;
}
function option(round: Round, payload: unknown): string {
  const id = (payload as { optionId?: unknown })?.optionId;
  if (typeof id !== 'string' || !round.options?.some((o) => o.id === id)) throw new GameError('Choose one of the options.');
  return id;
}
const count = (subs: Submission[], key = 'optionId') => {
  const m = new Map<string, number>();
  for (const s of subs) { const k = String(s.payload[key]); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
};
const nameOf = (ctx: PlayContext, id: string) => ctx.participants.find((p) => p.userId === id)?.name ?? 'Someone';
const people = (ctx: PlayContext, except?: string): Option[] => ctx.participants.filter((p) => p.userId !== except).map((p) => ({ id: p.userId, label: p.name }));
const participation = (subs: Submission[], n = 1) => Object.fromEntries(subs.map((s) => [s.userId, n]));
const pairOptions = (pp: PairPrompt): Option[] => [{ id: 'a', label: pp.a }, { id: 'b', label: pp.b }];
const optionList = (op: OptionPrompt, ctx: PlayContext): Option[] => op.options[0] === '__participants__' ? people(ctx) : op.options.map((label, i) => ({ id: `o${i}`, label }));

function splitReveal(round: Round, subs: Submission[]): Reveal {
  const c = count(subs);
  const lines = (round.options ?? []).map((o) => ({ label: o.label, value: c.get(o.id) ?? 0 }));
  const top = [...lines].sort((a, b) => b.value - a.value);
  const tie = top.length > 1 && top[0].value === top[1].value;
  return { headline: subs.length ? (tie ? 'A perfect split.' : `${top[0].label} wins.`) : 'No answers this round.', lines };
}

/* ---------------- the twelve games ---------------- */

const whoSaidIt: GameDefinition = {
  key: 'who_said_it', version: 1, name: 'Who Said It?', tagline: 'Guess which friend wrote each line.', category: 'guessing',
  minPlayers: 3, maxPlayers: 12, consents: ['allowReuse'],
  howToPlay: ['Everyone writes one short answer to the prompt.', 'Lines appear one by one, without names.', 'Guess the author. +2 for a right guess, +1 to the author for each player fooled.'],
  safety: 'Only lines written for this game are used. You can withdraw your line until the guessing starts.',
  plan: (ctx) => {
    const [pr] = pick(STATEMENT_PROMPTS, 1, ctx, 'statement');
    return [{ kind: 'submit', title: 'Write your line', prompt: pr.text, promptId: pr.id, maxLength: 140 }];
  },
  extend: (ctx, rounds, closed, subs) => {
    if (closed !== 0) return rounds;
    const lines = shuffle(subs, `${ctx.sessionId}:wsi`).slice(0, 8);
    return [...rounds, ...lines.map((s, i): Round => ({
      kind: 'vote', title: `Line ${i + 1} of ${lines.length}`, prompt: String(s.payload.text), options: people(ctx), excludeId: s.userId, ref: s.id, secret: { authorId: s.userId },
    }))];
  },
  validate: (round, payload, ctx, userId) => {
    if (round.kind === 'submit') return { text: text(payload, 140) };
    const id = option(round, payload);
    if (id === userId) throw new GameError('Guess someone other than yourself.');
    return { optionId: id };
  },
  reveal: (round, subs, ctx) => {
    if (round.kind === 'submit') return { headline: `${subs.length} lines collected.`, lines: [] };
    const author = String(round.secret!.authorId);
    const right = subs.filter((s) => s.payload.optionId === author);
    return { headline: `${nameOf(ctx, author)} wrote it.`, lines: [{ label: 'Guessed right', detail: right.map((s) => nameOf(ctx, s.userId)).join(', ') || 'Nobody', value: right.length }] };
  },
  score: (round, subs) => {
    if (round.kind === 'submit') return {};
    const author = String(round.secret!.authorId);
    const out: Record<string, number> = {};
    for (const s of subs) if (s.payload.optionId === author) out[s.userId] = 2; else out[author] = (out[author] ?? 0) + 1;
    return out;
  },
};

const pickYourChaos: GameDefinition = {
  key: 'pick_your_chaos', version: 1, name: 'Pick Your Chaos', tagline: 'Two choices. No wrong answers. Lots of opinions.', category: 'opinions',
  minPlayers: 1, maxPlayers: 20,
  howToPlay: ['Five pairs of choices.', 'Everyone picks privately.', 'See how the group split — and argue about it.'],
  safety: 'Prompts are curated and light.',
  plan: (ctx) => pick(CHAOS_PAIRS, 5, ctx, 'chaos').map((pp, i) => ({ kind: 'choice', title: `Choice ${i + 1} of 5`, prompt: 'Would you rather…', promptId: pp.id, options: pairOptions(pp) })),
  validate: (round, payload) => ({ optionId: option(round, payload) }),
  reveal: splitReveal,
  score: (_r, subs) => participation(subs),
};

const honestVote: GameDefinition = {
  key: 'honest_vote', version: 1, name: 'The Honest Vote', tagline: 'Who in the circle is most likely to…?', category: 'opinions',
  minPlayers: 3, maxPlayers: 12,
  howToPlay: ['Four light-hearted “most likely to” questions.', 'Votes stay private.', 'Only the totals are revealed — never who voted for whom.'],
  safety: 'Individual votes are never shown to anyone. You cannot vote for yourself.',
  plan: (ctx) => pick(HONEST_VOTE_PROMPTS, 4, ctx, 'honest').map((pr, i) => ({ kind: 'vote', title: `Question ${i + 1} of 4`, prompt: pr.text, promptId: pr.id, options: people(ctx) })),
  validate: (round, payload, _ctx, userId) => {
    const id = option(round, payload);
    if (id === userId) throw new GameError('Vote for someone else.');
    return { optionId: id };
  },
  reveal: (round, subs) => {
    const c = count(subs);
    const lines = (round.options ?? []).map((o) => ({ label: o.label, value: c.get(o.id) ?? 0 })).filter((l) => l.value > 0).sort((a, b) => b.value - a.value);
    return { headline: lines[0] ? `${lines[0].label} takes it.` : 'No votes.', lines, note: 'Totals only — individual votes stay private.' };
  },
  score: (_r, subs) => participation(subs),
};

const confessions: GameDefinition = {
  key: 'one_line_confessions', version: 1, name: 'One-Line Confessions', tagline: 'Tiny, harmless truths — revealed without names.', category: 'opinions',
  minPlayers: 2, maxPlayers: 12,
  howToPlay: ['Three gentle prompts.', 'Write one line (or skip).', 'Lines are revealed shuffled, without names.'],
  safety: 'Keep it about yourself and keep it light — never someone else’s secret. Lines are filtered and can be reported.',
  plan: (ctx) => pick(CONFESSION_PROMPTS, 3, ctx, 'conf').map((pr, i) => ({ kind: 'submit', title: `Prompt ${i + 1} of 3`, prompt: pr.text, promptId: pr.id, maxLength: 120 })),
  validate: (_round, payload) => ({ text: text(payload, 120) }),
  reveal: (_round, subs, ctx) => ({ headline: `${subs.length} confession${subs.length === 1 ? '' : 's'}`, lines: shuffle(subs, `${ctx.sessionId}:${subs.length}`).map((s) => ({ label: String(s.payload.text), ref: s.id })), note: 'Shown without names.' }),
  score: (_r, subs) => participation(subs),
};

const archetypeShowdown: GameDefinition = {
  key: 'archetype_showdown', version: 1, name: 'Archetype Showdown', tagline: 'Can your friends guess your archetype?', category: 'identity',
  minPlayers: 3, maxPlayers: 10, consents: ['shareIdentity'],
  howToPlay: ['Players who opt in have their archetype guessed.', 'Pick from four archetypes.', '+2 for a correct guess.'],
  safety: 'Only players who tick “let others guess my archetype” are included, and only their archetype name is used.',
  plan: (ctx) => {
    const targets = shuffle(ctx.participants.filter((p) => p.shareIdentity && p.archetype), `${ctx.sessionId}:targets`).slice(0, 5);
    if (!targets.length) throw new GameError('At least one player needs to share their archetype for this game.');
    return targets.map((t, i): Round => {
      const distractors = shuffle(PERSONA_ARCHETYPES.filter((a) => a.key !== t.archetype), `${ctx.sessionId}:${t.userId}`).slice(0, 3);
      const options = shuffle([PERSONA_BY_KEY[t.archetype!], ...distractors], `${ctx.sessionId}:${t.userId}:o`).map((a) => ({ id: a.key, label: a.name }));
      return { kind: 'vote', title: `Round ${i + 1}: ${t.name}`, prompt: `Which archetype is ${t.name}?`, options, excludeId: t.userId, aboutId: t.userId, secret: { answer: t.archetype } };
    });
  },
  validate: (round, payload) => ({ optionId: option(round, payload) }),
  reveal: (round, subs, ctx) => {
    const ans = String(round.secret!.answer);
    const right = subs.filter((s) => s.payload.optionId === ans);
    return { headline: `${nameOf(ctx, round.aboutId!)} is ${PERSONA_BY_KEY[ans].name}.`, lines: [{ label: 'Guessed right', detail: right.map((s) => nameOf(ctx, s.userId)).join(', ') || 'Nobody', value: right.length }] };
  },
  score: (round, subs) => Object.fromEntries(subs.filter((s) => s.payload.optionId === round.secret!.answer).map((s) => [s.userId, 2])),
};

const friendDecoder: GameDefinition = {
  key: 'friend_decoder', version: 1, name: 'Friend Decoder', tagline: 'How well do you really know each other?', category: 'guessing',
  minPlayers: 2, maxPlayers: 8,
  howToPlay: ['Each round is about one player.', 'They answer honestly; everyone else predicts their answer.', '+2 for each correct prediction.'],
  safety: 'Questions are light preferences only.',
  plan: (ctx) => {
    const qs = pick(DECODER_QUESTIONS, Math.min(ctx.participants.length, 6), ctx, 'decoder');
    return shuffle(ctx.participants, `${ctx.sessionId}:order`).slice(0, qs.length).map((t, i): Round => ({
      kind: 'choice', title: `About ${t.name}`, prompt: `${qs[i].text} (${t.name} answers; everyone else predicts)`, promptId: qs[i].id, options: optionList(qs[i], ctx), aboutId: t.userId,
    }));
  },
  validate: (round, payload) => ({ optionId: option(round, payload) }),
  reveal: (round, subs, ctx) => {
    const truth = subs.find((s) => s.userId === round.aboutId);
    if (!truth) return { headline: `${nameOf(ctx, round.aboutId!)} did not answer.`, lines: [] };
    const label = round.options!.find((o) => o.id === truth.payload.optionId)!.label;
    const right = subs.filter((s) => s.userId !== round.aboutId && s.payload.optionId === truth.payload.optionId);
    return { headline: `${nameOf(ctx, round.aboutId!)} chose “${label}”.`, lines: [{ label: 'Decoded it', detail: right.map((s) => nameOf(ctx, s.userId)).join(', ') || 'Nobody', value: right.length }] };
  },
  score: (round, subs) => {
    const truth = subs.find((s) => s.userId === round.aboutId);
    if (!truth) return {};
    return Object.fromEntries(subs.filter((s) => s.userId !== round.aboutId && s.payload.optionId === truth.payload.optionId).map((s) => [s.userId, 2]));
  },
};

function agreementPairs(ctx: PlayContext, subsByRound: Submission[][]) {
  const ids = ctx.participants.map((p) => p.userId);
  const pairsOut: { a: string; b: string; same: number; both: number }[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    let same = 0; let both = 0;
    for (const subs of subsByRound) {
      const x = subs.find((s) => s.userId === ids[i]); const y = subs.find((s) => s.userId === ids[j]);
      if (x && y) { both++; if (x.payload.optionId === y.payload.optionId) same++; }
    }
    pairsOut.push({ a: ids[i], b: ids[j], same, both });
  }
  return pairsOut.filter((p) => p.both > 0);
}

const thisOrThat: GameDefinition = {
  key: 'this_or_that', version: 1, name: 'This or That — Circle Edition', tagline: 'Six quick picks, then find your circle twin.', category: 'opinions',
  minPlayers: 2, maxPlayers: 20,
  howToPlay: ['Six quick this-or-that picks across categories.', 'See each split.', 'At the end: your circle twins and the group’s wildcard.'],
  safety: 'Curated light prompts.',
  plan: (ctx) => {
    const cats = ['food', 'life', 'culture', 'style'];
    const chosen = cats.flatMap((c) => pick(THIS_OR_THAT.filter((x) => x.category === c), 2, ctx, `tt:${c}`)).slice(0, 6);
    return chosen.map((pp, i) => ({ kind: 'choice', title: `${i + 1} of 6 · ${pp.category}`, prompt: 'This or that?', promptId: pp.id, options: pairOptions(pp) }));
  },
  validate: (round, payload) => ({ optionId: option(round, payload) }),
  reveal: splitReveal,
  score: (_r, subs) => participation(subs),
  summary: (_rounds, subsByRound, ctx) => {
    const ps = agreementPairs(ctx, subsByRound).sort((x, y) => y.same / y.both - x.same / x.both);
    const minority = new Map<string, number>();
    for (const subs of subsByRound) {
      const c = count(subs);
      for (const s of subs) if ((c.get(String(s.payload.optionId)) ?? 0) * 2 < subs.length) minority.set(s.userId, (minority.get(s.userId) ?? 0) + 1);
    }
    const wild = [...minority.entries()].sort((a, b) => b[1] - a[1])[0];
    const lines = ps.slice(0, 3).map((p) => ({ label: `${nameOf(ctx, p.a)} & ${nameOf(ctx, p.b)}`, detail: `${p.same} of ${p.both} picks matched`, value: Math.round((100 * p.same) / p.both) }));
    if (wild) lines.push({ label: `Wildcard: ${nameOf(ctx, wild[0])}`, detail: `In the minority ${wild[1]} time${wild[1] === 1 ? '' : 's'}`, value: wild[1] });
    return { headline: ps[0] ? `Circle twins: ${nameOf(ctx, ps[0].a)} & ${nameOf(ctx, ps[0].b)}` : 'Play with more friends to find your twin.', lines };
  },
};

const plotTwist: GameDefinition = {
  key: 'plot_twist', version: 1, name: 'Plot Twist', tagline: 'Write a story together, one line at a time.', category: 'storytelling',
  minPlayers: 2, maxPlayers: 8, consents: ['allowReuse'],
  howToPlay: ['A strange opening line starts the story.', 'Players take turns adding one line (140 characters).', 'Two laps around the circle, then read the whole story.'],
  safety: 'Lines are filtered; keep it fun for everyone.',
  plan: (ctx) => {
    const [op] = pick(PLOT_OPENERS, 1, ctx, 'opener');
    const order = shuffle(ctx.participants, `${ctx.sessionId}:turns`);
    const turns = Math.min(order.length * 2, 10);
    return Array.from({ length: turns }, (_, i): Round => ({ kind: 'turn', title: `Turn ${i + 1} of ${turns} · ${order[i % order.length].name}`, prompt: op.text, promptId: op.id, maxLength: 140, actorId: order[i % order.length].userId }));
  },
  validate: (_round, payload) => ({ text: text(payload, 140) }),
  reveal: (_round, subs, ctx) => ({ headline: subs[0] ? `${nameOf(ctx, subs[0].userId)} added a line.` : 'Turn skipped.', lines: subs.map((s) => ({ label: String(s.payload.text), ref: s.id })) }),
  score: (_r, subs) => participation(subs),
  summary: (rounds, subsByRound) => ({
    headline: 'The finished story',
    lines: [{ label: rounds[0]?.prompt ?? '' }, ...subsByRound.flatMap((subs) => subs.map((s) => ({ label: String(s.payload.text) })))],
  }),
};

const hotTakeArena: GameDefinition = {
  key: 'hot_take_arena', version: 1, name: 'Hot Take Arena', tagline: 'Light topics, strong opinions, anonymous verdicts.', category: 'opinions',
  minPlayers: 3, maxPlayers: 12,
  howToPlay: ['Everyone writes a hot take on a light topic.', 'Each take is voted agree or disagree, without names.', 'The most divisive take wins the arena.'],
  safety: 'Topics are light. Takes are judged, never people. Takes are filtered and can be reported.',
  plan: (ctx) => {
    const [t] = pick(HOT_TAKE_TOPICS, 1, ctx, 'topic');
    return [{ kind: 'submit', title: 'Your hot take', prompt: `Topic: ${t.text}. Write your hot take.`, promptId: t.id, maxLength: 140 }];
  },
  extend: (ctx, rounds, closed, subs) => closed !== 0 ? rounds : [...rounds, ...shuffle(subs, `${ctx.sessionId}:takes`).slice(0, 8).map((s, i): Round => ({
    kind: 'vote', title: `Take ${i + 1}`, prompt: String(s.payload.text), options: [{ id: 'agree', label: 'Agree' }, { id: 'disagree', label: 'Disagree' }], excludeId: s.userId, ref: s.id, secret: { authorId: s.userId },
  }))],
  validate: (round, payload) => round.kind === 'submit' ? { text: text(payload, 140) } : { optionId: option(round, payload) },
  reveal: (round, subs) => round.kind === 'submit' ? { headline: `${subs.length} takes entered the arena.`, lines: [] } : splitReveal(round, subs),
  score: (_r, subs) => participation(subs),
  summary: (rounds, subsByRound) => {
    const votes = rounds.map((r, i) => ({ r, subs: subsByRound[i] })).filter((x) => x.r.kind === 'vote' && x.subs.length);
    const div = votes.map(({ r, subs }) => ({ take: r.prompt, agree: subs.filter((s) => s.payload.optionId === 'agree').length, n: subs.length }))
      .sort((a, b) => Math.abs(a.agree / a.n - 0.5) - Math.abs(b.agree / b.n - 0.5));
    return { headline: div[0] ? 'Most divisive take' : 'No votes were cast.', lines: div.slice(0, 3).map((d) => ({ label: d.take, detail: `${d.agree} agree · ${d.n - d.agree} disagree` })) };
  },
};

export const PLAY_POINTS_START = 10;
const predictionMarket: GameDefinition = {
  key: 'prediction_market', version: 1, name: 'Prediction Market (play points)', tagline: 'Stake pretend points on harmless group outcomes.', category: 'prediction',
  minPlayers: 2, maxPlayers: 12,
  howToPlay: ['Everyone gets 10 play points for this game.', 'Stake 1–10 on the outcome you predict.', 'When it happens, the host records the result; the pot is shared by the winners in proportion to their stakes.'],
  safety: 'Play points exist only inside this game. They are not money, cannot be bought, sold or redeemed, and do not count toward rewards.',
  plan: (ctx) => {
    const [q] = pick(PREDICTION_QUESTIONS, 1, ctx, 'predict');
    const options = optionList(q, ctx);
    return [
      { kind: 'stake', title: 'Place your prediction', prompt: q.text, promptId: q.id, options },
      { kind: 'resolve', title: 'Record what happened', prompt: `${q.text} — host records the real outcome once it happens.`, promptId: q.id, options, actorId: ctx.hostId },
    ];
  },
  validate: (round, payload) => {
    const optionId = option(round, payload);
    if (round.kind === 'resolve') return { optionId };
    const stake = Number((payload as { stake?: unknown })?.stake);
    if (!Number.isInteger(stake) || stake < 1 || stake > PLAY_POINTS_START) throw new GameError('Stake between 1 and 10 play points.');
    return { optionId, stake };
  },
  reveal: (round, subs) => {
    if (round.kind === 'resolve') {
      const label = round.options!.find((o) => o.id === subs[0]?.payload.optionId)?.label;
      return { headline: label ? `Outcome: ${label}` : 'No outcome recorded.', lines: [] };
    }
    const pot = new Map<string, number>();
    for (const s of subs) pot.set(String(s.payload.optionId), (pot.get(String(s.payload.optionId)) ?? 0) + Number(s.payload.stake));
    return { headline: 'Predictions locked.', lines: round.options!.map((o) => ({ label: o.label, value: pot.get(o.id) ?? 0, detail: 'play points staked' })) };
  },
  /** Play-point payouts are computed when the outcome is resolved (see settlePrediction). */
  score: () => ({}),
};

/** Parimutuel settlement in play points: winners split the whole pot by stake; others keep what they did not stake. */
export function settlePrediction(stakes: Submission[], outcomeId: string): Record<string, number> {
  const pot = stakes.reduce((s, x) => s + Number(x.payload.stake), 0);
  const winners = stakes.filter((s) => s.payload.optionId === outcomeId);
  const winStake = winners.reduce((s, x) => s + Number(x.payload.stake), 0);
  const out: Record<string, number> = {};
  for (const s of stakes) {
    const kept = PLAY_POINTS_START - Number(s.payload.stake);
    const share = winStake && s.payload.optionId === outcomeId ? Math.floor((pot * Number(s.payload.stake)) / winStake) : 0;
    out[s.userId] = kept + (winStake ? share : Number(s.payload.stake));
  }
  return out;
}

const memoryLane: GameDefinition = {
  key: 'memory_lane', version: 1, name: 'Memory Lane', tagline: 'Match old lines from your circle to their authors.', category: 'guessing',
  minPlayers: 3, maxPlayers: 12,
  howToPlay: ['Lines come from earlier circle games whose authors allowed reuse.', 'Guess who wrote each one.', '+2 per correct guess.'],
  safety: 'Only lines from players who ticked “allow reuse”, who are in this game, and who have not withdrawn or deleted them.',
  plan: (ctx) => {
    const ids = new Set(ctx.participants.map((p) => p.userId));
    const eligible = ctx.memories.filter((m) => ids.has(m.authorId));
    if (eligible.length < 3) throw new GameError('Memory Lane needs at least three reusable lines from players in this game. Play Who Said It? or Plot Twist with “allow reuse” first.');
    return shuffle(eligible, `${ctx.sessionId}:mem`).slice(0, 5).map((m, i): Round => ({ kind: 'vote', title: `Memory ${i + 1}`, prompt: m.text, options: people(ctx), excludeId: m.authorId, secret: { authorId: m.authorId, memoryId: m.id } }));
  },
  validate: (round, payload) => ({ optionId: option(round, payload) }),
  reveal: (round, subs, ctx) => {
    const author = String(round.secret!.authorId);
    const right = subs.filter((s) => s.payload.optionId === author);
    return { headline: `That was ${nameOf(ctx, author)}.`, lines: [{ label: 'Remembered', detail: right.map((s) => nameOf(ctx, s.userId)).join(', ') || 'Nobody', value: right.length }] };
  },
  score: (round, subs) => Object.fromEntries(subs.filter((s) => s.payload.optionId === round.secret!.authorId).map((s) => [s.userId, 2])),
};

const compatibilityLab: GameDefinition = {
  key: 'compatibility_lab', version: 1, name: 'The Compatibility Lab', tagline: 'Compare preferences — transparently, just for fun.', category: 'identity',
  minPlayers: 2, maxPlayers: 8, consents: ['shareIdentity'],
  howToPlay: ['Answer six everyday preference questions.', 'See how often each pair matched.', 'Players who opt in also compare their personality dimensions.'],
  safety: 'Matches count identical answers — nothing more. It does not predict friendship, romance or anything else.',
  plan: (ctx) => pick(COMPATIBILITY_QUESTIONS, 6, ctx, 'compat').map((q, i) => ({ kind: 'choice', title: `${i + 1} of 6`, prompt: q.text, promptId: q.id, options: optionList(q, ctx) })),
  validate: (round, payload) => ({ optionId: option(round, payload) }),
  reveal: splitReveal,
  score: (_r, subs) => participation(subs),
  summary: (_rounds, subsByRound, ctx) => {
    const ps = agreementPairs(ctx, subsByRound).sort((x, y) => y.same / y.both - x.same / x.both);
    const lines = ps.map((p) => ({ label: `${nameOf(ctx, p.a)} & ${nameOf(ctx, p.b)}`, detail: `${p.same} of ${p.both} answers matched`, value: Math.round((100 * p.same) / p.both) }));
    const sharers = ctx.participants.filter((p) => p.shareIdentity && p.scores);
    for (let i = 0; i < sharers.length; i++) for (let j = i + 1; j < sharers.length; j++) {
      const a = sharers[i]; const b = sharers[j];
      const close = DIMENSIONS.filter((d) => Math.abs(a.scores![d] - b.scores![d]) <= 0.35).map((d) => DIMENSION_INFO[d].name);
      lines.push({ label: `${a.name} & ${b.name}: dimensions`, detail: close.length ? `Similar on ${close.join(', ')}` : 'Different on every dimension — great for perspective', value: close.length });
    }
    return { headline: ps[0] ? `Most in sync: ${nameOf(ctx, ps[0].a)} & ${nameOf(ctx, ps[0].b)}` : 'Not enough answers to compare.', lines, note: 'Counts identical answers only. This is not a prediction of compatibility.' };
  },
};

export const GAMES: GameDefinition[] = [whoSaidIt, pickYourChaos, honestVote, confessions, archetypeShowdown, friendDecoder, thisOrThat, plotTwist, hotTakeArena, predictionMarket, memoryLane, compatibilityLab];
export const GAME_BY_KEY: Record<string, GameDefinition> = Object.fromEntries(GAMES.map((g) => [g.key, g]));

/** Who still has to act in a round. */
export function pendingActors(round: Round, participantIds: string[], subs: Submission[]): string[] {
  const done = new Set(subs.map((s) => s.userId));
  const eligible = round.actorId ? [round.actorId] : participantIds.filter((id) => id !== round.excludeId);
  return eligible.filter((id) => !done.has(id));
}
export function canAct(round: Round, userId: string): boolean {
  if (round.actorId) return round.actorId === userId;
  return round.excludeId !== userId;
}
/** Client-safe copy of a round. */
export function publicRound(round: Round): Omit<Round, 'secret'> {
  const { secret: _secret, ...rest } = round;
  return rest;
}
