import { pgTable, uuid, text, timestamp, boolean, jsonb, index, uniqueIndex, integer, date, doublePrecision, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  /** active | suspended | deleted */
  status: text('status').notNull().default('active'),
  suspendedReason: text('suspended_reason'),
  mfaSecret: text('mfa_secret'),
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }),
  referralCode: text('referral_code').notNull(),
  referredBy: uuid('referred_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
  uniqueIndex('users_referral_uq').on(t.referralCode),
]);

export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** admin | moderator | support | expert | creator | vendor | seller */
  role: text('role').notNull(),
  grantedBy: uuid('granted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.role] })]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ip: text('ip'),
  userAgent: text('user_agent'),
  mfaPassed: boolean('mfa_passed').notNull().default(false),
}, (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)]);

export const authTokens = pgTable('auth_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** verify_email | reset_password */
  purpose: text('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash)]);

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  handle: text('handle').notNull(),
  displayName: text('display_name').notNull(),
  fullName: text('full_name'),
  bio: text('bio').notNull().default(''),
  statusText: text('status_text').notNull().default(''),
  avatarUrl: text('avatar_url'),
  /** Cosmic ID theme key */
  theme: text('theme').notNull().default('midnight'),
  emblem: text('emblem').notNull().default('orbit'),
  background: text('background').notNull().default('nebula'),
  profileMusicUrl: text('profile_music_url'),
  interests: text('interests').array().notNull().default(sql`'{}'::text[]`),
  featuredBadges: text('featured_badges').array().notNull().default(sql`'{}'::text[]`),
  featuredInsights: text('featured_insights').array().notNull().default(sql`'{}'::text[]`),
  /** public | private */
  visibility: text('visibility').notNull().default('private'),
  /** Per-field visibility: { sunSign: 'public'|'connections'|'private', … } */
  fieldVisibility: jsonb('field_visibility').notNull().default({}),
  language: text('language').notNull().default('en'),
  colorScheme: text('color_scheme').notNull().default('system'),
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  preferredSystem: text('preferred_system').notNull().default('vedic'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  /** Optional public pen name used for pseudonymous Thought Drops (the account link stays server-side). */
  pseudonym: text('pseudonym'),
  /** Self-selected identity labels (shown separately from calculated results). */
  identityLabels: text('identity_labels').array().notNull().default(sql`'{}'::text[]`),
  /** Identity-card style key; premium styles require an entitlement (checked server-side). */
  cardStyle: text('card_style').notNull().default('classic'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('profiles_handle_uq').on(sql`lower(${t.handle})`), uniqueIndex('profiles_pseudonym_uq').on(sql`lower(${t.pseudonym})`)]);

export const profileHistory = pgTable('profile_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  changes: jsonb('changes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('profile_history_user_idx').on(t.userId)]);

export const birthProfiles = pgTable('birth_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('Me'),
  isPrimary: boolean('is_primary').notNull().default(false),
  /** Self-entered data about a person not on the platform (private bond); never shown to anyone else. */
  isThirdParty: boolean('is_third_party').notNull().default(false),
  birthDate: date('birth_date').notNull(),
  birthTime: text('birth_time'),
  /** exact | within_15m | within_1h | unknown */
  timePrecision: text('time_precision').notNull(),
  placeName: text('place_name').notNull(),
  countryCode: text('country_code'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  timezone: text('timezone').notNull(),
  utcOffsetMinutes: integer('utc_offset_minutes').notNull(),
  birthUtc: timestamp('birth_utc', { withTimezone: true }).notNull(),
  /** geonames | manual */
  locationSource: text('location_source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('birth_profiles_user_idx').on(t.userId)]);

export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** terms | privacy | birth_data_processing | marketing_email | analytics | dating_terms | matchmaking_terms */
  purpose: text('purpose').notNull(),
  granted: boolean('granted').notNull(),
  policyVersion: text('policy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('consent_user_purpose_idx').on(t.userId, t.purpose)]);

/** One-time MFA recovery codes. Only an HMAC of each code is stored; a used code is kept (used_at) for audit. */
export const mfaRecoveryCodes = pgTable('mfa_recovery_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('mfa_recovery_codes_hash_uq').on(t.codeHash), index('mfa_recovery_codes_user_idx').on(t.userId)]);
