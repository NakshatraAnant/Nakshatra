import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Nakshatra merch (physical goods sold cash on delivery). Separate from the legacy marketplace. */
export const merchProducts = pgTable('merch_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  imageUrl: text('image_url'),
  active: boolean('active').notNull().default(true),
  /** Development sample; labelled as such in the UI. */
  isSample: boolean('is_sample').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('merch_products_slug_uq').on(t.slug)]);

export const merchVariants = pgTable('merch_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => merchProducts.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  pricePaise: integer('price_paise').notNull(),
  /** Physically in stock (decremented at dispatch). */
  stockOnHand: integer('stock_on_hand').notNull().default(0),
  /** Held for placed orders that have not been dispatched yet. Available = onHand − reserved. */
  reserved: integer('reserved').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('merch_variants_sku_uq').on(t.sku), index('merch_variants_product_idx').on(t.productId)]);

export const merchInventoryMovements = pgTable('merch_inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id').notNull().references(() => merchVariants.id, { onDelete: 'cascade' }),
  /** reserve | release | deduct | restock | adjust */
  kind: text('kind').notNull(),
  quantity: integer('quantity').notNull(),
  orderId: uuid('order_id'),
  actorId: uuid('actor_id'),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('merch_movements_variant_idx').on(t.variantId)]);

export const codOrders = pgTable('cod_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('draft'),
  subtotalPaise: integer('subtotal_paise').notNull(),
  shippingPaise: integer('shipping_paise').notNull(),
  totalPaise: integer('total_paise').notNull(),
  /** { name, phone, line1, line2, city, state, pincode } */
  address: jsonb('address').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  courierName: text('courier_name'),
  /** Entered by staff from the real courier; never generated. */
  trackingRef: text('tracking_ref'),
  cashCollectedAt: timestamp('cash_collected_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  refundNote: text('refund_note'),
  returnReason: text('return_reason'),
  cancelReason: text('cancel_reason'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  placedAt: timestamp('placed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('cod_orders_number_uq').on(t.number), uniqueIndex('cod_orders_idem_uq').on(t.userId, t.idempotencyKey), index('cod_orders_user_idx').on(t.userId, t.createdAt), index('cod_orders_status_idx').on(t.status)]);

export const codOrderItems = pgTable('cod_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => codOrders.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => merchVariants.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  variantName: text('variant_name').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  quantity: integer('quantity').notNull(),
}, (t) => [index('cod_order_items_order_idx').on(t.orderId)]);

export const codOrderEvents = pgTable('cod_order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => codOrders.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorId: uuid('actor_id'),
  /** customer | staff | system */
  actorKind: text('actor_kind').notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('cod_order_events_order_idx').on(t.orderId, t.createdAt)]);

