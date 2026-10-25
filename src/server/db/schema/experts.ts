import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, date, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';
import { conversations } from './social';

/* ---------------- Expert marketplace ---------------- */

export const expertProfiles = pgTable('expert_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  headline: text('headline').notNull(),
  bio: text('bio').notNull().default(''),
  /** vedic | western | tarot | numerology | vastu | pandit | kp | palmistry */
  specializations: text('specializations').array().notNull(),
  languages: text('languages').array().notNull(),
  yearsExperience: integer('years_experience').notNull(),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  /** draft | pending | verified | rejected | suspended */
  verificationStatus: text('verification_status').notNull().default('draft'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  /** Marked true only for development seed data; such profiles are labelled in the UI. */
  isSample: boolean('is_sample').notNull().default(false),
  acceptsBookings: boolean('accepts_bookings').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expertCredentials = pgTable('expert_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  issuer: text('issuer').notNull(),
  year: integer('year'),
  documentUrl: text('document_url'),
  /** pending | verified | rejected */
  status: text('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('expert_cred_expert_idx').on(t.expertId)]);

export const expertServices = pgTable('expert_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** chat | voice | video | report | workshop | group_session */
  mode: text('mode').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  durationMinutes: integer('duration_minutes').notNull(),
  pricePaise: integer('price_paise').notNull(),
  capacity: integer('capacity').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('expert_services_expert_idx').on(t.expertId)]);

/** Weekly availability rules in the expert's local time zone. */
export const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
}, (t) => [index('avail_rules_expert_idx').on(t.expertId)]);

export const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  /** Full day off when start/end null. */
  startTime: text('start_time'),
  endTime: text('end_time'),
  reason: text('reason').notNull().default(''),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  expertId: uuid('expert_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  serviceId: uuid('service_id').notNull().references(() => expertServices.id, { onDelete: 'restrict' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** pending_payment | confirmed | in_progress | completed | cancelled | refunded | disputed | expired */
  status: text('status').notNull(),
  pricePaise: integer('price_paise').notNull(),
  commissionPaise: integer('commission_paise').notNull(),
  expertEarningsPaise: integer('expert_earnings_paise').notNull(),
  paymentId: uuid('payment_id'),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  customerNote: text('customer_note').notNull().default(''),
  sharedChart: boolean('shared_chart').notNull().default(false),
  cancelledBy: uuid('cancelled_by'),
  cancelReason: text('cancel_reason'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  followUpOf: uuid('follow_up_of'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('bookings_expert_time_idx').on(t.expertId, t.startsAt), index('bookings_customer_idx').on(t.customerId)]);

export const bookingStatusHistory = pgTable('booking_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorId: uuid('actor_id'),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const consultationNotes = pgTable('consultation_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  expertId: uuid('expert_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  sharedWithCustomer: boolean('shared_with_customer').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** booking | product | course | vendor */
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  /** The verified transaction that permits the review (booking, order item, enrollment, vendor booking). */
  sourceId: uuid('source_id').notNull(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  body: text('body').notNull().default(''),
  /** published | hidden | pending */
  status: text('status').notNull().default('published'),
  response: text('response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('reviews_source_author_uq').on(t.sourceId, t.authorId), index('reviews_subject_idx').on(t.subjectType, t.subjectId)]);

export const disputes = pgTable('disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** booking | order | vendor_booking */
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  raisedBy: uuid('raised_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  /** open | investigating | resolved_refund | resolved_no_refund | withdrawn */
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  resolvedBy: uuid('resolved_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  payeeId: uuid('payee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  /** expert | creator | vendor | seller */
  payeeType: text('payee_type').notNull(),
  amountPaise: integer('amount_paise').notNull(),
  /** pending | processing | paid | failed */
  status: text('status').notNull().default('pending'),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  items: jsonb('items').notNull().default([]),
  providerRef: text('provider_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});

/* ---------------- Learning ---------------- */

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  description: text('description').notNull().default(''),
  level: text('level').notNull().default('beginner'),
  topics: text('topics').array().notNull().default(sql`'{}'::text[]`),
  pricePaise: integer('price_paise').notNull().default(0),
  /** draft | in_review | published | rejected | archived */
  status: text('status').notNull().default('draft'),
  reviewNote: text('review_note'),
  /** Minimum quiz score (percent) required for the certificate. */
  passPercent: integer('pass_percent').notNull().default(70),
  certificateEnabled: boolean('certificate_enabled').notNull().default(true),
  revenueSharePercent: integer('revenue_share_percent').notNull().default(70),
  isSample: boolean('is_sample').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (t) => [uniqueIndex('courses_slug_uq').on(t.slug)]);

export const courseChapters = pgTable('course_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  chapterId: uuid('chapter_id').notNull().references(() => courseChapters.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  /** text | video | audio */
  kind: text('kind').notNull(),
  body: text('body').notNull().default(''),
  mediaUrl: text('media_url'),
  durationMinutes: integer('duration_minutes').notNull().default(5),
  position: integer('position').notNull(),
  /** Free preview lessons are visible without enrollment. */
  isPreview: boolean('is_preview').notNull().default(false),
}, (t) => [index('lessons_course_idx').on(t.courseId)]);

export const quizzes = pgTable('quizzes', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  /** [{ question, options: string[], answer: number }] — answers never sent to clients. */
  questions: jsonb('questions').notNull(),
}, (t) => [uniqueIndex('quizzes_lesson_uq').on(t.lessonId)]);

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'restrict' }),
  /** free | purchase | subscription | admin */
  source: text('source').notNull(),
  orderId: uuid('order_id'),
  /** active | completed | revoked */
  status: text('status').notNull().default('active'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('enrollments_user_course_uq').on(t.userId, t.courseId)]);

export const lessonProgress = pgTable('lesson_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]);

export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  answers: jsonb('answers').notNull(),
  scorePercent: integer('score_percent').notNull(),
  passed: boolean('passed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('quiz_attempts_user_quiz_idx').on(t.userId, t.quizId)]);

export const lessonBookmarks = pgTable('lesson_bookmarks', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.lessonId] })]);

export const lessonNotes = pgTable('lesson_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => lessons.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  serial: text('serial').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'restrict' }),
  recipientName: text('recipient_name').notNull(),
  requirements: jsonb('requirements').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('certificates_serial_uq').on(t.serial), uniqueIndex('certificates_user_course_uq').on(t.userId, t.courseId)]);
