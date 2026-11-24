import { pgTable, uuid, text, timestamp, jsonb, index, integer, primaryKey, date } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Advertisers are added by Nakshatra staff (no self-serve accounts or ad billing yet). */
export const adAdvertisers = pgTable('ad_advertisers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  website: text('website').notNull(),
  contactEmail: text('contact_email').notNull(),
  /** active | suspended */
  status: text('status').notNull().default('active'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const adCampaigns = pgTable('ad_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  advertiserId: uuid('advertiser_id').notNull().references(() => adAdvertisers.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  headline: text('headline').notNull(),
  body: text('body').notNull().default(''),
  ctaLabel: text('cta_label').notNull().default('Learn more'),
  destinationUrl: text('destination_url').notNull(),
  /** feed | quiz | quest */
  placement: text('placement').notNull().default('feed'),
  /** Sponsored quiz (trivia QuizDefinition) or challenge ({ title, description, steps }); null for feed cards. */
  content: jsonb('content'),
  /** { topics: AdTopic[], languages: string[] } — contextual only */
  targeting: jsonb('targeting').notNull().default({ topics: [], languages: [] }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  frequencyCapPerDay: integer('frequency_cap_per_day').notNull().default(2),
  /** draft | in_review | approved | rejected | paused | ended */
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedBy: uuid('submitted_by'),
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ad_campaigns_status_idx').on(t.status, t.startsAt)]);

/**
 * Daily delivery counters per campaign and viewer. The viewer is an HMAC of the member id (never the id itself),
 * kept only to apply frequency caps and hides. Rows older than 30 days are deleted by the retention job.
 */
export const adDelivery = pgTable('ad_delivery', {
  campaignId: uuid('campaign_id').notNull().references(() => adCampaigns.id, { onDelete: 'cascade' }),
  viewerKey: text('viewer_key').notNull(),
  day: date('day').notNull(),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.campaignId, t.viewerKey, t.day] }), index('ad_delivery_day_idx').on(t.day)]);

/** "Hide this ad": the campaign is never shown to that viewer again. */
export const adHides = pgTable('ad_hides', {
  campaignId: uuid('campaign_id').notNull().references(() => adCampaigns.id, { onDelete: 'cascade' }),
  viewerKey: text('viewer_key').notNull(),
  reason: text('reason').notNull().default('not_relevant'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.campaignId, t.viewerKey] })]);

/**
 * Taking part in a sponsored quiz or challenge, keyed by the same pseudonymous viewer key as ads (never the member id).
 * kind: quiz (score set) | quest_accepted | quest_done. Sponsors see totals only. Deleted after 90 days.
 */
export const adParticipation = pgTable('ad_participation', {
  campaignId: uuid('campaign_id').notNull().references(() => adCampaigns.id, { onDelete: 'cascade' }),
  viewerKey: text('viewer_key').notNull(),
  kind: text('kind').notNull(),
  score: integer('score'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.campaignId, t.viewerKey, t.kind] })]);
