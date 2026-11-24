import { pgTable, uuid, text, timestamp, jsonb, index, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  website: text('website').notNull(),
  /** Free-text commercial terms for staff, e.g. "8% of order value, 30-day window". */
  terms: text('terms').notNull().default(''),
  /** Query parameter the partner reads the click reference from. */
  subIdParam: text('sub_id_param').notNull().default('subid'),
  /** Postback signing secret, encrypted with the app secret. Shown once at creation. */
  postbackSecretEnc: text('postback_secret_enc').notNull(),
  /** active | paused */
  status: text('status').notNull().default('active'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partnerOffers = pgTable('partner_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull(),
  url: text('url').notNull(),
  /** Optional discount code, revealed after the member follows the link. */
  code: text('code'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** draft | live | ended */
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('partner_offers_status_idx').on(t.status, t.endsAt)]);

/** A followed perk. `ref` is what the partner sees; the viewer key is an HMAC, never the member id. */
export const affiliateClicks = pgTable('affiliate_clicks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ref: text('ref').notNull(),
  offerId: uuid('offer_id').notNull().references(() => partnerOffers.id, { onDelete: 'cascade' }),
  viewerKey: text('viewer_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('affiliate_clicks_ref_uq').on(t.ref), index('affiliate_clicks_offer_idx').on(t.offerId, t.createdAt)]);

export const affiliateConversions = pgTable('affiliate_conversions', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id').notNull().references(() => partners.id, { onDelete: 'restrict' }),
  externalId: text('external_id').notNull(),
  clickId: uuid('click_id'),
  offerId: uuid('offer_id'),
  orderPaise: integer('order_paise').notNull(),
  commissionPaise: integer('commission_paise').notNull(),
  /** pending | approved | reversed */
  status: text('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by'),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('affiliate_conversions_ext_uq').on(t.partnerId, t.externalId)]);
