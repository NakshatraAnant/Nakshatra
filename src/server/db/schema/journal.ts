import { pgTable, uuid, text, timestamp, index, date } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Private journal entry. The text is encrypted with the app secret; only its author can read it. */
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** The member's local date the entry belongs to. */
  localDate: date('local_date').notNull(),
  promptKey: text('prompt_key'),
  bodyEnc: text('body_enc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('journal_entries_user_date_idx').on(t.userId, t.localDate)]);
