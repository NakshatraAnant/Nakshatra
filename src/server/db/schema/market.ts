import { pgTable, uuid, text, timestamp, index, integer, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { groups } from './social';

/** A member's listing inside one circle. No payments: the price is what the seller asks. */
export const circleListings = pgTable('circle_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  circleId: uuid('circle_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  sellerId: uuid('seller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** sell | swap | free | wanted */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  pricePaise: integer('price_paise'),
  /** new | like_new | good | fair (not for "wanted") */
  condition: text('condition'),
  imageUrls: text('image_urls').array().notNull().default(sql`'{}'::text[]`),
  /** active | reserved | closed | removed */
  status: text('status').notNull().default('active'),
  removedBy: uuid('removed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('circle_listings_circle_idx').on(t.circleId, t.status, t.createdAt), index('circle_listings_seller_idx').on(t.sellerId)]);

export const listingInterests = pgTable('listing_interests', {
  listingId: uuid('listing_id').notNull().references(() => circleListings.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  /** pending | accepted | declined */
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.listingId, t.userId] })]);

/** Private thread between the seller and the one accepted member, per listing. */
export const listingMessages = pgTable('listing_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull().references(() => circleListings.id, { onDelete: 'cascade' }),
  buyerId: uuid('buyer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('listing_messages_thread_idx').on(t.listingId, t.buyerId, t.createdAt)]);
