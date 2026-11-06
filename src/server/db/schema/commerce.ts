import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, date, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** null = sold by the platform; otherwise a seller/creator/vendor storefront owner. */
  sellerId: uuid('seller_id').references(() => users.id, { onDelete: 'restrict' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** report | digital_course | book | resource | audio | ritual_supplies | lifestyle | gemstone | rudraksha | puja_service | consultation | class | event | wedding_service | creator_product | subscription */
  category: text('category').notNull(),
  /** physical | digital | service */
  fulfilment: text('fulfilment').notNull(),
  images: text('images').array().notNull().default(sql`'{}'::text[]`),
  /** Optional glTF model; only set when a real asset exists. */
  modelUrl: text('model_url'),
  /** Verifiable certification text for gemstones/Rudraksha; shown only when present. */
  certification: text('certification'),
  materials: text('materials'),
  dimensions: text('dimensions'),
  /** Disclosure shown when a listing is promoted or linked to a paid relationship. */
  commercialDisclosure: text('commercial_disclosure'),
  /** Digital deliverable: report template key, course id or file path. */
  digitalAsset: jsonb('digital_asset'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  /** draft | active | archived */
  status: text('status').notNull().default('draft'),
  isSample: boolean('is_sample').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('products_slug_uq').on(t.slug), index('products_category_idx').on(t.category, t.status)]);

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  pricePaise: integer('price_paise').notNull(),
  compareAtPaise: integer('compare_at_paise'),
  /** null = unlimited (digital). */
  stock: integer('stock'),
  attributes: jsonb('attributes').notNull().default({}),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('variants_sku_uq').on(t.sku), index('variants_product_idx').on(t.productId)]);

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  /** order | refund | restock | adjustment */
  reason: text('reason').notNull(),
  refId: uuid('ref_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.variantId] })]);

export const savedProducts = pgTable('saved_products', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.productId] })]);

export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  /** percent | fixed */
  kind: text('kind').notNull(),
  value: integer('value').notNull(),
  minOrderPaise: integer('min_order_paise').notNull().default(0),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('discounts_code_uq').on(sql`upper(${t.code})`)]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** pending_payment | paid | fulfilling | shipped | delivered | completed | cancelled | refunded | partially_refunded */
  status: text('status').notNull(),
  subtotalPaise: integer('subtotal_paise').notNull(),
  discountPaise: integer('discount_paise').notNull().default(0),
  shippingPaise: integer('shipping_paise').notNull().default(0),
  taxPaise: integer('tax_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull(),
  currency: text('currency').notNull().default('INR'),
  discountCode: text('discount_code'),
  shippingAddress: jsonb('shipping_address'),
  isGift: boolean('is_gift').notNull().default(false),
  giftMessage: text('gift_message'),
  giftRecipientEmail: text('gift_recipient_email'),
  paymentId: uuid('payment_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('orders_number_uq').on(t.number), uniqueIndex('orders_idem_uq').on(t.userId, t.idempotencyKey), index('orders_user_idx').on(t.userId, t.createdAt)]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'restrict' }),
  sellerId: uuid('seller_id'),
  title: text('title').notNull(),
  variantName: text('variant_name').notNull(),
  unitPricePaise: integer('unit_price_paise').notNull(),
  quantity: integer('quantity').notNull(),
  fulfilment: text('fulfilment').notNull(),
  refundedQuantity: integer('refunded_quantity').notNull().default(0),
}, (t) => [index('order_items_order_idx').on(t.orderId)]);

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  /** preparing | shipped | in_transit | delivered | returned */
  status: text('status').notNull().default('preparing'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const returnRequests = pgTable('return_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  orderItemId: uuid('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  reason: text('reason').notNull(),
  /** requested | approved | rejected | received | refunded */
  status: text('status').notNull().default('requested'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Payment ledger. Provider-agnostic; the provider adapter sets provider + providerRef. */
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** order | booking | subscription | event | vendor_milestone */
  purpose: text('purpose').notNull(),
  purposeId: uuid('purpose_id').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  currency: text('currency').notNull().default('INR'),
  /** dev_simulator | razorpay | stripe */
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  /** created | requires_action | succeeded | failed | cancelled | refunded | partially_refunded */
  status: text('status').notNull(),
  refundedPaise: integer('refunded_paise').notNull().default(0),
  idempotencyKey: text('idempotency_key').notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('payments_idem_uq').on(t.idempotencyKey), index('payments_purpose_idx').on(t.purpose, t.purposeId)]);

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  /** Provider event id — unique to make webhook processing idempotent. */
  providerEventId: text('provider_event_id').notNull(),
  type: text('type').notNull(),
  signatureValid: boolean('signature_valid').notNull(),
  payload: jsonb('payload').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('payment_events_provider_uq').on(t.provider, t.providerEventId)]);

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  amountPaise: integer('amount_paise').notNull(),
  reason: text('reason').notNull(),
  /** requested | approved | processing | succeeded | rejected | failed */
  status: text('status').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  decidedBy: uuid('decided_by'),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('refunds_idem_uq').on(t.idempotencyKey)]);

export const subscriptionPlans = pgTable('subscription_plans', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  pricePaise: integer('price_paise').notNull(),
  intervalMonths: integer('interval_months').notNull(),
  benefits: text('benefits').array().notNull(),
  active: boolean('active').notNull().default(true),
  /** People covered by one subscription (2 for Duo). */
  seats: integer('seats').notNull().default(1),
  /** anyone | student (needs an approved student verification) */
  eligibility: text('eligibility').notNull().default('anyone'),
  /** Founding plans: limited number of subscribers; the price paid is locked for renewals. */
  seatCap: integer('seat_cap'),
  founding: boolean('founding').notNull().default(false),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planKey: text('plan_key').notNull().references(() => subscriptionPlans.key),
  /** pending_payment | active | past_due | cancelled | expired */
  status: text('status').notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  provider: text('provider').notNull(),
  /** Founding members keep this price on renewal. */
  lockedPricePaise: integer('locked_price_paise'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('subscriptions_user_idx').on(t.userId)]);

/** Extra people on a multi-seat subscription (Duo). Benefits follow the owner's subscription status. */
export const subscriptionMembers = pgTable('subscription_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  /** null until someone accepts the invite */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  inviteTokenHash: text('invite_token_hash'),
  inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('subscription_members_sub_idx').on(t.subscriptionId), index('subscription_members_user_idx').on(t.userId), uniqueIndex('subscription_members_token_uq').on(t.inviteTokenHash)]);

/** Student plan eligibility: verified institution email plus staff review. Nothing is inferred. */
export const studentVerifications = pgTable('student_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  institution: text('institution').notNull(),
  emailDomain: text('email_domain').notNull(),
  /** pending | approved | rejected */
  status: text('status').notNull().default('pending'),
  note: text('note').notNull().default(''),
  reviewerId: uuid('reviewer_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  /** Approvals last one academic year. */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('student_verifications_user_idx').on(t.userId), index('student_verifications_status_idx').on(t.status)]);

/** Paid access rights. Granted only by verified payment workflows or admin action (audited). */
export const entitlements = pgTable('entitlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** product | course | subscription | event */
  kind: text('kind').notNull(),
  refId: text('ref_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('entitlements_user_kind_idx').on(t.userId, t.kind, t.refId), uniqueIndex('entitlements_source_uq').on(t.sourceType, t.sourceId, t.refId)]);

/**
 * Gifted digital items. Created only after the purchase is confirmed (payment succeeded), one per gifted
 * order item. The entitlement is granted to the recipient when they claim it with a verified account whose
 * email matches; the purchaser never receives it. Only a hash of the claim token is stored.
 */
export const giftClaims = pgTable('gift_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderItemId: uuid('order_item_id').notNull().references(() => orderItems.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'restrict' }),
  purchaserId: uuid('purchaser_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Lower-cased intended recipient email. */
  recipientEmail: text('recipient_email').notNull(),
  recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'set null' }),
  message: text('message').notNull().default(''),
  tokenHash: text('token_hash').notNull(),
  /** pending | claimed | expired | refunded | cancelled */
  status: text('status').notNull().default('pending'),
  entitlementId: uuid('entitlement_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('gift_claims_item_uq').on(t.orderItemId),
  uniqueIndex('gift_claims_token_uq').on(t.tokenHash),
  index('gift_claims_recipient_idx').on(t.recipientEmail, t.status),
  index('gift_claims_purchaser_idx').on(t.purchaserId),
]);

export const reportDocuments = pgTable('report_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entitlementId: uuid('entitlement_id').notNull().references(() => entitlements.id, { onDelete: 'cascade' }),
  templateKey: text('template_key').notNull(),
  engineVersion: text('engine_version').notNull(),
  content: jsonb('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- Weddings ---------------- */

export const weddingProjects = pgTable('wedding_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  weddingDate: date('wedding_date'),
  city: text('city').notNull().default(''),
  latitude: integer('latitude_e4'),
  longitude: integer('longitude_e4'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  budgetPaise: integer('budget_paise').notNull().default(0),
  /** planning | booked | completed | archived */
  status: text('status').notNull().default('planning'),
  coupleBondId: uuid('couple_bond_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const weddingMembers = pgTable('wedding_members', {
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  inviteEmail: text('invite_email'),
  tokenHash: text('token_hash'),
  /** owner | partner | family | planner */
  role: text('role').notNull(),
  /** view_budget | edit_budget | manage_guests | manage_tasks | manage_vendors */
  permissions: text('permissions').array().notNull(),
  /** invited | active | revoked */
  status: text('status').notNull(),
  id: uuid('id').primaryKey().defaultRandom(),
}, (t) => [index('wedding_members_project_idx').on(t.projectId), index('wedding_members_user_idx').on(t.userId)]);

export const weddingTasks = pgTable('wedding_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  dueDate: date('due_date'),
  assigneeId: uuid('assignee_id'),
  /** todo | doing | done */
  status: text('status').notNull().default('todo'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const weddingBudgetItems = pgTable('wedding_budget_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  label: text('label').notNull(),
  estimatedPaise: integer('estimated_paise').notNull().default(0),
  actualPaise: integer('actual_paise').notNull().default(0),
  paidPaise: integer('paid_paise').notNull().default(0),
  /** Set when the line was created from a booked vendor; payments on that booking update it. */
  vendorBookingId: uuid('vendor_booking_id').references(() => vendorBookings.id, { onDelete: 'set null' }),
}, (t) => [uniqueIndex('wedding_budget_vendor_booking_uq').on(t.vendorBookingId)]);

export const weddingEvents = pgTable('wedding_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  location: text('location').notNull().default(''),
  muhuratNote: text('muhurat_note'),
});

export const weddingGuests = pgTable('wedding_guests', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  side: text('side').notNull().default('both'),
  partySize: integer('party_size').notNull().default(1),
  /** pending | attending | declined | maybe */
  rsvp: text('rsvp').notNull().default('pending'),
  rsvpTokenHash: text('rsvp_token_hash').notNull(),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  dietary: text('dietary'),
}, (t) => [uniqueIndex('wedding_guests_token_uq').on(t.rsvpTokenHash), index('wedding_guests_project_idx').on(t.projectId)]);

export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  /** pandit | venue | photographer | caterer | decorator | planner | makeup | mehendi | music | invitations | other */
  category: text('category').notNull(),
  city: text('city').notNull(),
  description: text('description').notNull().default(''),
  priceFromPaise: integer('price_from_paise'),
  priceToPaise: integer('price_to_paise'),
  languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
  images: text('images').array().notNull().default(sql`'{}'::text[]`),
  /** draft | pending | verified | rejected | suspended */
  verificationStatus: text('verification_status').notNull().default('draft'),
  isSample: boolean('is_sample').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('vendors_category_city_idx').on(t.category, t.city)]);

export const vendorUnavailability = pgTable('vendor_unavailability', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  reason: text('reason').notNull().default('booked'),
}, (t) => [uniqueIndex('vendor_unavail_uq').on(t.vendorId, t.date)]);

export const vendorInquiries = pgTable('vendor_inquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  eventDate: date('event_date'),
  guestCount: integer('guest_count'),
  message: text('message').notNull(),
  /** open | quoted | declined | booked | closed */
  status: text('status').notNull().default('open'),
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('vendor_inquiries_vendor_idx').on(t.vendorId), index('vendor_inquiries_project_idx').on(t.projectId)]);

export const vendorQuotes = pgTable('vendor_quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  inquiryId: uuid('inquiry_id').notNull().references(() => vendorInquiries.id, { onDelete: 'cascade' }),
  amountPaise: integer('amount_paise').notNull(),
  details: text('details').notNull(),
  validUntil: date('valid_until'),
  /** Milestones: [{ label, percent }] summing to 100. */
  milestones: jsonb('milestones').notNull(),
  /** sent | accepted | declined | expired | superseded */
  status: text('status').notNull().default('sent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vendorBookings = pgTable('vendor_bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  quoteId: uuid('quote_id').notNull().references(() => vendorQuotes.id, { onDelete: 'restrict' }),
  projectId: uuid('project_id').notNull().references(() => weddingProjects.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  /** pending_deposit | confirmed | completed | cancelled | disputed */
  status: text('status').notNull(),
  totalPaise: integer('total_paise').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const vendorPaymentMilestones = pgTable('vendor_payment_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorBookingId: uuid('vendor_booking_id').notNull().references(() => vendorBookings.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  position: integer('position').notNull(),
  /** due | paid | refunded */
  status: text('status').notNull().default('due'),
  paymentId: uuid('payment_id'),
});
