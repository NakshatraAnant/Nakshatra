import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, doublePrecision, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { compatibilityResults } from './social';

/* ---------------- Dating ---------------- */

export const datingProfiles = pgTable('dating_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  active: boolean('active').notNull().default(true),
  /** casual | dating | long_term | marriage | unsure */
  intent: text('intent').notNull(),
  gender: text('gender').notNull(),
  interestedIn: text('interested_in').array().notNull(),
  bio: text('bio').notNull().default(''),
  prompts: jsonb('prompts').notNull().default([]),
  photos: text('photos').array().notNull().default(sql`'{}'::text[]`),
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
  city: text('city').notNull(),
  /** Coordinates rounded to ~0.05° (≈5 km) before storage; precise location is never stored. */
  approxLat: doublePrecision('approx_lat').notNull(),
  approxLon: doublePrecision('approx_lon').notNull(),
  ageMin: integer('age_min').notNull().default(21),
  ageMax: integer('age_max').notNull().default(40),
  maxDistanceKm: integer('max_distance_km').notNull().default(50),
  preferredIntents: text('preferred_intents').array().notNull().default(sql`'{}'::text[]`),
  useAstrology: boolean('use_astrology').notNull().default(true),
  showSunSign: boolean('show_sun_sign').notNull().default(true),
  showMoonSign: boolean('show_moon_sign').notNull().default(false),
  /** Incognito: only shown to people this user has liked. */
  incognito: boolean('incognito').notNull().default(false),
  /** unverified | pending | verified | rejected */
  verification: text('verification').notNull().default('unverified'),
  safetyAcknowledgedAt: timestamp('safety_acknowledged_at', { withTimezone: true }).notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const datingActions = pgTable('dating_actions', {
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** like | pass */
  action: text('action').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.actorId, t.targetId] }), index('dating_actions_target_idx').on(t.targetId, t.action)]);

export const datingMatches = pgTable('dating_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Ordered pair: userA < userB (lexicographic) for uniqueness. */
  userA: uuid('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userB: uuid('user_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  unmatchedAt: timestamp('unmatched_at', { withTimezone: true }),
  unmatchedBy: uuid('unmatched_by'),
}, (t) => [uniqueIndex('dating_matches_pair_uq').on(t.userA, t.userB)]);

export const verificationRequests = pgTable('verification_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** dating | matchmaking | expert | vendor | seller */
  kind: text('kind').notNull(),
  /** Submitted evidence (uploaded file paths); reviewed manually by staff. */
  evidence: jsonb('evidence').notNull().default([]),
  note: text('note').notNull().default(''),
  /** pending | approved | rejected */
  status: text('status').notNull().default('pending'),
  reviewerId: uuid('reviewer_id'),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (t) => [index('verif_status_kind_idx').on(t.status, t.kind)]);

/* ---------------- Matchmaking ---------------- */

export const matchmakingProfiles = pgTable('matchmaking_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  active: boolean('active').notNull().default(true),
  gender: text('gender').notNull(),
  seeking: text('seeking').array().notNull(),
  about: text('about').notNull().default(''),
  education: text('education').notNull().default(''),
  profession: text('profession').notNull().default(''),
  city: text('city').notNull(),
  approxLat: doublePrecision('approx_lat').notNull(),
  approxLon: doublePrecision('approx_lon').notNull(),
  willingToRelocate: boolean('willing_to_relocate').notNull().default(false),
  values: text('values').array().notNull().default(sql`'{}'::text[]`),
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
  /** Optional, self-described cultural details (language, community, religion). */
  cultural: jsonb('cultural').notNull().default({}),
  /** Optional cultural preferences; used only as filters the user chooses. */
  culturalPreferences: jsonb('cultural_preferences').notNull().default({}),
  ageMin: integer('age_min').notNull().default(23),
  ageMax: integer('age_max').notNull().default(40),
  familyParticipation: boolean('family_participation').notNull().default(false),
  kundliMatchingImportant: boolean('kundli_matching_important').notNull().default(false),
  verification: text('verification').notNull().default('unverified'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mmShortlist = pgTable('mm_shortlist', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.targetId] })]);

export const mmConnections = pgTable('mm_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromId: uuid('from_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toId: uuid('to_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull().default(''),
  /** pending | accepted | declined | withdrawn */
  status: text('status').notNull().default('pending'),
  /** connected | talking | families_introduced | engaged | married | closed */
  stage: text('stage').notNull().default('connected'),
  conversationId: uuid('conversation_id'),
  compatibilityId: uuid('compatibility_id').references(() => compatibilityResults.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
}, (t) => [uniqueIndex('mm_conn_pair_uq').on(t.fromId, t.toId)]);

export const mmStageHistory = pgTable('mm_stage_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => mmConnections.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull(),
  changedBy: uuid('changed_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Family Bridge. A principal invites a family member; permissions are an explicit
 * allow-list: view_profile, view_shortlist, view_shared_reports, suggest_profiles.
 * Messages and dating activity are never included.
 */
export const familyMembers = pgTable('family_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  principalId: uuid('principal_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberUserId: uuid('member_user_id').references(() => users.id, { onDelete: 'cascade' }),
  inviteEmail: text('invite_email').notNull(),
  tokenHash: text('token_hash').notNull(),
  relation: text('relation').notNull(),
  permissions: text('permissions').array().notNull(),
  /** invited | active | revoked | declined */
  status: text('status').notNull().default('invited'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [uniqueIndex('family_token_uq').on(t.tokenHash), index('family_principal_idx').on(t.principalId), index('family_member_idx').on(t.memberUserId)]);

export const familySuggestions = pgTable('family_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  familyMemberId: uuid('family_member_id').notNull().references(() => familyMembers.id, { onDelete: 'cascade' }),
  principalId: uuid('principal_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
