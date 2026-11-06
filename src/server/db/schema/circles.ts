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
