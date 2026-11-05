import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, primaryKey, date, customType } from 'drizzle-orm/pg-core';
import { users } from './auth';

/* ---------------- Gamification ---------------- */

export const xpLedger = pgTable('xp_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  /** The rule key that awarded XP, e.g. complete_cosmic_id, lesson_complete */
  rule: text('rule').notNull(),
  /** Idempotency: one award per (user, rule, sourceKey). */
  sourceKey: text('source_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Audit metadata (reason, actor for reversals). Never personal content. */
  meta: jsonb('meta').notNull().default({}),
  /** Set on a reversal entry (negative amount): the entry it cancels. Unique, so an entry is reversed at most once. */
  reversesId: uuid('reverses_id'),
}, (t) => [uniqueIndex('xp_idem_uq').on(t.userId, t.rule, t.sourceKey), index('xp_user_idx').on(t.userId, t.createdAt), uniqueIndex('xp_reverses_uq').on(t.reversesId)]);

/** Claimed quest rewards: one claim per (user, quest, period). The XP itself is in xp_ledger (rule quest_reward). */
export const questClaims = pgTable('quest_claims', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questKey: text('quest_key').notNull(),
  /** e.g. 2026-11-05 (daily), 2026-W45 (weekly), once, s1-first-light (season) */
  periodKey: text('period_key').notNull(),
  xp: integer('xp').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.questKey, t.periodKey] })]);

/** Daily vibe check-in: one mood word per member per local day. */
export const vibeCheckins = pgTable('vibe_checkins', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  localDate: date('local_date').notNull(),
  mood: text('mood').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.localDate] })]);

/** Claimed season milestones (free track). Rewards are granted into user_collectibles. */
export const seasonClaims = pgTable('season_claims', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  seasonKey: text('season_key').notNull(),
  milestone: integer('milestone').notNull(),
  /** free | premium (premium track stays disabled until payments are explicitly enabled) */
  track: text('track').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.seasonKey, t.track, t.milestone] })]);

export const userAchievements = pgTable('user_achievements', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementKey: text('achievement_key').notNull(),
  awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp('seen_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.userId, t.achievementKey] })]);

export const challengeProgress = pgTable('challenge_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  challengeKey: text('challenge_key').notNull(),
  /** Period identifier (e.g. 2025-W14, 2025-04, 2025-Q2-diwali) */
  period: text('period').notNull(),
  progress: integer('progress').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.userId, t.challengeKey, t.period] })]);

/** Unlocked collectible cosmetics (frames, themes). Earned and purchased are kept distinct. */
export const userCollectibles = pgTable('user_collectibles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  itemKey: text('item_key').notNull(),
  /** earned | purchased | subscription */
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.itemKey] })]);

export const meaningfulActions = pgTable('daily_checkins', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  localDate: date('local_date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.localDate] })]);

/* ---------------- Notifications ---------------- */

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** bonds | social | messages | bookings | orders | learning | weddings | security | daily | matchmaking | dating | system */
  category: text('category').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  link: text('link'),
  dedupeKey: text('dedupe_key'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.createdAt), uniqueIndex('notifications_dedupe_uq').on(t.userId, t.dedupeKey)]);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  inApp: boolean('in_app').notNull().default(true),
  email: boolean('email').notNull().default(false),
  push: boolean('push').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.category] })]);

export const notificationSettings = pgTable('notification_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  quietStart: text('quiet_start'),
  quietEnd: text('quiet_end'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  dailyCap: integer('daily_cap').notNull().default(10),
  unsubscribedAllEmailAt: timestamp('unsubscribed_all_email_at', { withTimezone: true }),
  unsubscribeTokenHash: text('unsubscribe_token_hash'),
});

export const notificationTemplates = pgTable('notification_templates', {
  key: text('key').primaryKey(),
  category: text('category').notNull(),
  titleTemplate: text('title_template').notNull(),
  bodyTemplate: text('body_template').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const scheduledReminders = pgTable('scheduled_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  link: text('link'),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  sourceKey: text('source_key').notNull(),
}, (t) => [index('reminders_due_idx').on(t.dueAt), uniqueIndex('reminders_source_uq').on(t.userId, t.sourceKey)]);

/** Development mail adapter outbox (also the audit log of sent mail in production). */
export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  textBody: text('text_body').notNull(),
  /** dev_mailbox | smtp */
  transport: text('transport').notNull(),
  /** queued | sending | sent | failed */
  status: text('status').notNull(),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('email_outbox_status_idx').on(t.status, t.createdAt)]);

/* ---------------- Privacy ---------------- */

export const dataExportRequests = pgTable('data_export_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** pending | ready | expired | failed */
  status: text('status').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/** Kept after deletion (no FK) so the deletion itself is auditable. */
export const deletionRequests = pgTable('deletion_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  /** requested | completed | cancelled */
  status: text('status').notNull(),
  reason: text('reason'),
  summary: jsonb('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/* ---------------- Operations ---------------- */

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  meta: jsonb('meta').notNull().default({}),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('audit_created_idx').on(t.createdAt), index('audit_actor_idx').on(t.actorId)]);

/** Analytics events — never contains birth data, message bodies or other sensitive fields. */
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  props: jsonb('props').notNull().default({}),
  meaningful: boolean('meaningful').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('analytics_name_created_idx').on(t.name, t.createdAt), index('analytics_user_created_idx').on(t.userId, t.createdAt)]);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPercent: integer('rollout_percent').notNull().default(100),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const experiments = pgTable('experiments', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
  variants: text('variants').array().notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const experimentAssignments = pgTable('experiment_assignments', {
  experimentKey: text('experiment_key').notNull().references(() => experiments.key, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  variant: text('variant').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.experimentKey, t.userId] })]);

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
});

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  /** account | billing | booking | order | safety | privacy | technical | other */
  category: text('category').notNull(),
  /** open | pending_user | resolved | closed */
  status: text('status').notNull().default('open'),
  assignedTo: uuid('assigned_to'),
  relatedType: text('related_type'),
  relatedId: uuid('related_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tickets_status_idx').on(t.status)]);

export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull(),
  isStaff: boolean('is_staff').notNull().default(false),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const searchHistory = pgTable('search_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  query: text('query').notNull(),
  scope: text('scope').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('search_history_user_idx').on(t.userId, t.createdAt)]);

export const savedSearches = pgTable('saved_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  scope: text('scope').notNull(),
  query: jsonb('query').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** avatar | post | dating_photo | verification | credential | lesson_media | product_image | vendor_image | message_attachment */
  purpose: text('purpose').notNull(),
  path: text('path').notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  /** Private uploads are only served to authorised viewers via the API. */
  isPrivate: boolean('is_private').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/**
 * File bytes for STORAGE_DRIVER=database: hosts without a persistent disk keep uploads in PostgreSQL.
 * `path` matches uploads.path ("public/<random>.<ext>" or "private/<random>.<ext>").
 */
export const storedFiles = pgTable('stored_files', {
  path: text('path').primaryKey(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  isPrivate: boolean('is_private').notNull(),
  data: bytea('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  referrerId: uuid('referrer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  referredId: uuid('referred_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** signup | deep_link_profile | bond_invite | group_invite */
  channel: text('channel').notNull(),
  /** pending → approved (activated) | rejected (abuse rule) | reversed (later invalidated) */
  status: text('status').notNull().default('pending'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
  rewardPoints: integer('reward_points').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('referrals_referred_uq').on(t.referredId), index('referrals_referrer_idx').on(t.referrerId, t.status)]);
