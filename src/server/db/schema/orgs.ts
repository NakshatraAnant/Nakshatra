import { pgTable, uuid, text, timestamp, index, integer, boolean, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** A company, college or community workspace. Created by Nakshatra staff (sales-led; no self-serve billing). */
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** company | college | community */
  kind: text('kind').notNull(),
  /** Optional: invites can require a verified email on this domain. */
  emailDomain: text('email_domain'),
  seatLimit: integer('seat_limit').notNull().default(50),
  /** active | suspended */
  status: text('status').notNull().default('active'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orgMembers = pgTable('org_members', {
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** owner | admin | member */
  role: text('role').notNull(),
  /** Opt-in: counted (anonymously) in the team personality aggregate. Off by default. */
  includeInAggregate: boolean('include_in_aggregate').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('org_members_user_idx').on(t.userId)]);

export const orgInvites = pgTable('org_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organisations.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  requireDomain: boolean('require_domain').notNull().default(false),
  maxUses: integer('max_uses').notNull().default(50),
  uses: integer('uses').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('org_invites_token_uq').on(t.tokenHash)]);
