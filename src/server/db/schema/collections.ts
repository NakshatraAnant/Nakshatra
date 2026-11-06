import { pgTable, uuid, text, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { posts } from './social';

/** Close friends: the owner's private list. Members on it see the owner's close-friends posts. Never notified. */
export const closeFriends = pgTable('close_friends', {
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  friendId: uuid('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.ownerId, t.friendId] }), index('close_friends_friend_idx').on(t.friendId)]);

/** Named collections of saved posts. Private by default; a public one appears on the owner's profile. */
export const postCollections = pgTable('post_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** private | public */
  visibility: text('visibility').notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('post_collections_owner_idx').on(t.ownerId)]);

export const collectionItems = pgTable('collection_items', {
  collectionId: uuid('collection_id').notNull().references(() => postCollections.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.collectionId, t.postId] }), index('collection_items_post_idx').on(t.postId)]);
