import { pgTable, uuid, text, timestamp, index, integer, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { groups, reports } from './social';

/** Topic channels inside a circle. Posts with no channel are in "General". Archived, never deleted. */
export const circleChannels = pgTable('circle_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** discussion (any member posts) | announcements (only owner/moderators post) */
  kind: text('kind').notNull().default('discussion'),
  position: integer('position').notNull().default(0),
  /** Members-only channel: open to this tier and higher tiers (plus owners/moderators). Null = everyone in the circle. */
  tierId: uuid('tier_id'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('circle_channels_circle_idx').on(t.circleId)]);

/** A recurring circle event. Occurrences are materialised into `events` (series_id) a few weeks ahead. */
export const eventSeries = pgTable('event_series', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  hostId: uuid('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  mode: text('mode').notNull(),
  location: text('location'),
  liveUrl: text('live_url'),
  capacity: integer('capacity'),
  /** weekly | fortnightly | monthly */
  frequency: text('frequency').notNull(),
  firstStartsAt: timestamp('first_starts_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  timezone: text('timezone').notNull(),
  until: timestamp('until', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('event_series_circle_idx').on(t.circleId)]);

/** A member paused from posting and commenting in one circle until a time. */
export const circleTimeouts = pgTable('circle_timeouts', {
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  until: timestamp('until', { withTimezone: true }).notNull(),
  reason: text('reason').notNull().default(''),
  byUserId: uuid('by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.circleId, t.userId] })]);

/** A circle moderator's decision on a report about content in their circle. Platform review is unaffected. */
export const circleReportReviews = pgTable('circle_report_reviews', {
  reportId: uuid('report_id').primaryKey().references(() => reports.id, { onDelete: 'cascade' }),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  /** removed | kept */
  decision: text('decision').notNull(),
  reviewerId: uuid('reviewer_id').notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('circle_report_reviews_circle_idx').on(t.circleId)]);

/** Membership tiers inside a circle (e.g. "Core crew"). Higher position = higher tier. A price makes it buyable as a pass. */
export const circleTiers = pgTable('circle_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** Badge colour token: saffron | jade | dusk | ember | monsoon */
  color: text('color').notNull().default('saffron'),
  position: integer('position').notNull(),
  /** Price of a pass in paise (set by the owner); null = assigned by admins only. */
  pricePaise: integer('price_paise'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('circle_tiers_circle_idx').on(t.circleId)]);

/** One tier per member per circle: assigned by owners/moderators, or bought as a pass (expiresAt set). */
export const circleMemberTiers = pgTable('circle_member_tiers', {
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').notNull().references(() => circleTiers.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by').notNull(),
  /** assigned | purchase */
  source: text('source').notNull().default('assigned'),
  /** Passes end here; null = assigned without an end. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.circleId, t.userId] })]);

/** A bought tier pass. Access is granted only when a verified payment succeeds. */
export const circleTierPurchases = pgTable('circle_tier_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id').notNull().references(() => circleTiers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amountPaise: integer('amount_paise').notNull(),
  /** pending | paid | failed | refunded */
  status: text('status').notNull().default('pending'),
  paymentId: uuid('payment_id'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('circle_tier_purchases_user_idx').on(t.userId), index('circle_tier_purchases_circle_idx').on(t.circleId)]);
