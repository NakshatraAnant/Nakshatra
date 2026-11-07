import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * A year-in-review card the member chose to share. It is a snapshot of only the facts they ticked (computed
 * by the server, never sent by the client), plus their display name only if they asked. Revocable.
 */
export const yearCards = pgTable('year_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Unguessable public slug used in /y/:slug. */
  slug: text('slug').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  /** [{ key, value }] — shareable facts only. */
  facts: jsonb('facts').notNull(),
  displayName: text('display_name'),
  views: integer('views').notNull().default(0),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('year_cards_slug_uq').on(t.slug), index('year_cards_user_idx').on(t.userId)]);
