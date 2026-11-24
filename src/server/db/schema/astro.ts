import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, doublePrecision, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, birthProfiles } from './auth';

export const calculationConfigs = pgTable('calculation_configs', {
  key: text('key').primaryKey(),
  system: text('system').notNull(),
  config: jsonb('config').notNull(),
  label: text('label').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const charts = pgTable('charts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  birthProfileId: uuid('birth_profile_id').notNull().references(() => birthProfiles.id, { onDelete: 'cascade' }),
  system: text('system').notNull(),
  configKey: text('config_key').notNull(),
  config: jsonb('config').notNull(),
  engineVersion: text('engine_version').notNull(),
  contentVersion: text('content_version').notNull(),
  /** Full calculated result snapshot (reproducible record of what was shown). */
  result: jsonb('result').notNull(),
  /** Snapshots are user-saved copies kept even if the birth profile changes. */
  isSnapshot: boolean('is_snapshot').notNull().default(false),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('charts_user_idx').on(t.userId), index('charts_profile_system_idx').on(t.birthProfileId, t.system)]);

export const chartPlacements = pgTable('chart_placements', {
  id: uuid('id').primaryKey().defaultRandom(),
  chartId: uuid('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  sign: integer('sign').notNull(),
  house: integer('house'),
  nakshatra: integer('nakshatra'),
  pada: integer('pada'),
  retrograde: boolean('retrograde').notNull(),
}, (t) => [index('chart_placements_chart_idx').on(t.chartId), index('chart_placements_body_sign_idx').on(t.body, t.sign)]);

export const interpretationContent = pgTable('interpretation_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleKey: text('rule_key').notNull(),
  version: integer('version').notNull(),
  system: text('system').notNull(),
  groupKey: text('group_key').notNull(),
  condition: jsonb('condition').notNull(),
  importance: integer('importance').notNull(),
  titleEn: text('title_en').notNull(),
  bodyEn: text('body_en').notNull(),
  titleHi: text('title_hi'),
  bodyHi: text('body_hi'),
  caveat: text('caveat'),
  source: text('source').notNull(),
  factorLabel: text('factor_label').notNull(),
  /** draft | published | retired */
  status: text('status').notNull(),
  editedBy: uuid('edited_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('interp_rule_version_uq').on(t.ruleKey, t.version), index('interp_status_idx').on(t.status)]);

export const savedInsights = pgTable('saved_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  chartId: uuid('chart_id').references(() => charts.id, { onDelete: 'set null' }),
  ruleKey: text('rule_key').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  factor: text('factor').notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('saved_insights_user_idx').on(t.userId), uniqueIndex('saved_insights_user_rule_uq').on(t.userId, t.ruleKey, t.chartId)]);

export const timelineEvents = pgTable('timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** milestone | reflection | intention | annotation */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  eventDate: date('event_date').notNull(),
  mood: text('mood'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('timeline_user_date_idx').on(t.userId, t.eventDate)]);

export const ritualCompletions = pgTable('ritual_completions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ritualKey: text('ritual_key').notNull(),
  localDate: date('local_date').notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('ritual_user_date_uq').on(t.userId, t.localDate)]);

export const userLocations = pgTable('user_locations', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  placeName: text('place_name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  timezone: text('timezone').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lessonProgressDaily = pgTable('daily_lesson_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonKey: text('lesson_key').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  quizCorrect: boolean('quiz_correct'),
}, (t) => [uniqueIndex('daily_lesson_user_key_uq').on(t.userId, t.lessonKey)]);
