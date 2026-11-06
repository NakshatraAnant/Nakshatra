import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { groups } from './social';

/* ---------------- Identity Studio ---------------- */

/** One row per completed personality assessment; the latest is the user's current result. */
export const assessmentResults = pgTable('assessment_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  /** { questionId: 1..5 } — the user's own answers, private. */
  answers: jsonb('answers').notNull(),
  /** { dimension: -1..1 } */
  scores: jsonb('scores').notNull(),
  archetypeKey: text('archetype_key').notNull(),
  secondaryKey: text('secondary_key'),
  /** high | medium | low */
  confidence: text('confidence').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('assessment_user_idx').on(t.userId, t.createdAt)]);

/* ---------------- Circles ---------------- */

/** Invite links for private circles. Only a hash of the token is stored. */
export const circleInvites = pgTable('circle_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  maxUses: integer('max_uses').notNull(),
  uses: integer('uses').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('circle_invites_token_uq').on(t.tokenHash), index('circle_invites_circle_idx').on(t.circleId)]);

/* ---------------- Play: turn-based game engine ---------------- */

export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameKey: text('game_key').notNull(),
  gameVersion: integer('game_version').notNull(),
  /** Null for solo sessions. */
  circleId: uuid('circle_id').references(() => groups.id, { onDelete: 'cascade' }),
  hostId: uuid('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** lobby | active | completed | abandoned */
  status: text('status').notNull().default('lobby'),
  /** Index into the generated round list; -1 while in the lobby. */
  roundIndex: integer('round_index').notNull().default(-1),
  /** Generated rounds and engine state (prompts chosen, turn order, targets). */
  state: jsonb('state').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [index('game_sessions_circle_idx').on(t.circleId, t.createdAt), index('game_sessions_host_idx').on(t.hostId)]);

export const gameParticipants = pgTable('game_participants', {
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: integer('score').notNull().default(0),
  /** Player agreed their submissions may be reused in later games in this circle (e.g. Memory Lane). */
  allowReuse: boolean('allow_reuse').notNull().default(false),
  /** Player allows others to guess their shareable archetype (Archetype Showdown). */
  shareIdentity: boolean('share_identity').notNull().default(false),
  leftAt: timestamp('left_at', { withTimezone: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.sessionId, t.userId] }), index('game_participants_user_idx').on(t.userId)]);

export const gameSubmissions = pgTable('game_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  roundIndex: integer('round_index').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('game_submissions_uq').on(t.sessionId, t.roundIndex, t.userId)]);

/* ---------------- Social rituals ---------------- */

/** One response per user, ritual and period (and circle for circle rituals). */
export const ritualResponses = pgTable('ritual_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ritualKey: text('ritual_key').notNull(),
  /** e.g. 2026-10-25 for daily, 2026-W43 for weekly */
  periodKey: text('period_key').notNull(),
  /** '' for personal rituals so the unique index applies. */
  circleKey: text('circle_key').notNull().default(''),
  promptId: text('prompt_id').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('ritual_responses_uq').on(t.userId, t.ritualKey, t.periodKey, t.circleKey), index('ritual_responses_prompt_idx').on(t.ritualKey, t.periodKey, t.circleKey)]);

/* ---------------- Identity card sharing ---------------- */

/**
 * Public share links for archetype cards. A share exposes only the archetype, its dimension scores and,
 * if the owner chose so, their display name — never handle, email, pen name, answers or birth details.
 * Anonymous previews can be shared too (userId null). Revocable; counts are aggregate only.
 */
export const identityShares = pgTable('identity_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Unguessable public slug used in /s/:slug. */
  slug: text('slug').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  archetypeKey: text('archetype_key').notNull(),
  secondaryKey: text('secondary_key'),
  scores: jsonb('scores').notNull(),
  cardStyle: text('card_style').notNull().default('classic'),
  /** Display name shown on the public page; null keeps the card anonymous. */
  displayName: text('display_name'),
  /** Referral code of the sharer (signed-in shares only) for attribution. */
  referralCode: text('referral_code'),
  views: integer('views').notNull().default(0),
  signups: integer('signups').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('identity_shares_slug_uq').on(t.slug), index('identity_shares_user_idx').on(t.userId)]);

/** Member-made quizzes (see src/shared/quiz.ts). Definition stored as JSON; answers never shown to takers. */
export const memberQuizzes = pgTable('member_quizzes', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** trivia | outcome */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  definition: jsonb('definition').notNull(),
  /** members (any signed-in member with the link or in Play) | circle */
  visibility: text('visibility').notNull().default('members'),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  /** published | removed (by author or moderation) */
  status: text('status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('member_quizzes_author_idx').on(t.authorId), index('member_quizzes_group_idx').on(t.groupId), index('member_quizzes_created_idx').on(t.createdAt)]);

export const memberQuizAttempts = pgTable('member_quiz_attempts', {
  quizId: uuid('quiz_id').notNull().references(() => memberQuizzes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').notNull(),
  score: integer('score').notNull(),
  outcome: integer('outcome'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.quizId, t.userId] })]);
