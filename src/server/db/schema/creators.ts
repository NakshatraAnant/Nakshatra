import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { payments } from './commerce';

/** Opt-in creator profile (one per member). Suspension by moderators hides the page and turns tips off. */
export const creatorProfiles = pgTable('creator_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline').notNull().default(''),
  about: text('about').notNull().default(''),
  categories: text('categories').array().notNull().default(sql`'{}'::text[]`),
  /** [{ label, url }] — https only, validated server-side. */
  links: jsonb('links').notNull().default([]),
  featuredPostIds: uuid('featured_post_ids').array().notNull().default(sql`'{}'::uuid[]`),
  tipsEnabled: boolean('tips_enabled').notNull().default(false),
  /** active | paused (by the creator) | suspended (by moderation) */
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('creator_profiles_status_idx').on(t.status)]);

/** Storefront foundation: what a creator offers. Listed offerings collect interest until paid offerings exist. */
export const creatorOfferings = pgTable('creator_offerings', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** membership | digital | session | workshop | newsletter */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** Indicative price shown to members; nothing can be bought yet. */
  pricePaise: integer('price_paise'),
  /** draft | listed | archived */
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('creator_offerings_creator_idx').on(t.creatorId)]);

export const creatorOfferingInterests = pgTable('creator_offering_interests', {
  offeringId: uuid('offering_id').notNull().references(() => creatorOfferings.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.offeringId, t.userId] })]);

export const creatorTips = pgTable('creator_tips', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  amountPaise: integer('amount_paise').notNull(),
  message: text('message').notNull().default(''),
  /** Hide the tipper's name from the creator. */
  anonymous: boolean('anonymous').notNull().default(false),
  /** Show name + message on the creator's public supporters list. */
  showOnWall: boolean('show_on_wall').notNull().default(false),
  /** pending | paid | failed | refunded */
  status: text('status').notNull().default('pending'),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('creator_tips_creator_idx').on(t.creatorId, t.createdAt), index('creator_tips_from_idx').on(t.fromUserId, t.createdAt)]);

/**
 * Append-only creator earnings ledger. Each paid tip adds one "held" line; a refund adds a negative reversal.
 * There is no payout path: held lines stay held until payouts (KYC + payout provider) are built.
 */
export const creatorLedger = pgTable('creator_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** tip | tip_refund */
  kind: text('kind').notNull(),
  sourceId: uuid('source_id').notNull(),
  grossPaise: integer('gross_paise').notNull(),
  feePaise: integer('fee_paise').notNull(),
  netPaise: integer('net_paise').notNull(),
  /** held (no payouts exist) */
  status: text('status').notNull().default('held'),
  /** From the development payment simulator — not real money, never counted as earnings. */
  simulated: boolean('simulated').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('creator_ledger_source_uq').on(t.kind, t.sourceId), index('creator_ledger_creator_idx').on(t.creatorId)]);
