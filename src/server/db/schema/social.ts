import { pgTable, uuid, text, timestamp, jsonb, index, integer, boolean, uniqueIndex, primaryKey, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, birthProfiles } from './auth';

/* ---------------- Bonds (relationships) ---------------- */

export const bonds = pgTable('bonds', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Partner on the platform (mutual bond); null for a private bond with a self-entered birth profile. */
  partnerUserId: uuid('partner_user_id').references(() => users.id, { onDelete: 'set null' }),
  privateBirthProfileId: uuid('private_birth_profile_id').references(() => birthProfiles.id, { onDelete: 'set null' }),
  partnerLabel: text('partner_label').notNull(),
  /** friend | romantic | dating | partner | spouse | sibling | parent_child | family | colleague | business | custom */
  kind: text('kind').notNull(),
  customLabel: text('custom_label'),
  /** private | pending | active | revoked */
  status: text('status').notNull(),
  /** Guna Milan role orientation chosen by the pair: none | owner_groom | owner_bride */
  gunaRoles: text('guna_roles').notNull().default('none'),
  /** graph visibility: private | connections | public */
  visibility: text('visibility').notNull().default('private'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [index('bonds_owner_idx').on(t.ownerId), index('bonds_partner_idx').on(t.partnerUserId)]);

export const bondInvitations = pgTable('bond_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  bondId: uuid('bond_id').notNull().references(() => bonds.id, { onDelete: 'cascade' }),
  inviterId: uuid('inviter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inviteeUserId: uuid('invitee_user_id').references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  /** pending | accepted | declined | expired | cancelled */
  status: text('status').notNull().default('pending'),
  requestedScope: text('requested_scope').notNull(),
  message: text('message').notNull().default(''),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('bond_inv_token_uq').on(t.tokenHash), index('bond_inv_invitee_idx').on(t.inviteeUserId)]);

/**
 * Chart-sharing grants. Scope: big_three (Sun/Moon/Rising), chart (full placements without birth time/place),
 * birth_details (exact date, time, place). Grants are directional and revocable.
 */
export const chartShareGrants = pgTable('chart_share_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  grantorId: uuid('grantor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  granteeId: uuid('grantee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  context: text('context').notNull(),
  contextId: uuid('context_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('grants_pair_idx').on(t.grantorId, t.granteeId)]);

export const compatibilityResults = pgTable('compatibility_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  bondId: uuid('bond_id').references(() => bonds.id, { onDelete: 'cascade' }),
  userA: uuid('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userB: uuid('user_b').references(() => users.id, { onDelete: 'cascade' }),
  method: text('method').notNull(),
  engineVersion: text('engine_version').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('compat_bond_idx').on(t.bondId)]);

export const reportShares = pgTable('report_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  compatibilityId: uuid('compatibility_id').notNull().references(() => compatibilityResults.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** user | link */
  shareType: text('share_type').notNull(),
  granteeId: uuid('grantee_id').references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash'),
  /** summary | full */
  detail: text('detail').notNull().default('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('report_shares_comp_idx').on(t.compatibilityId)]);

export const bondNotes = pgTable('bond_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  bondId: uuid('bond_id').notNull().references(() => bonds.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('bond_notes_bond_author_idx').on(t.bondId, t.authorId)]);

export const bondMilestones = pgTable('bond_milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  bondId: uuid('bond_id').notNull().references(() => bonds.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  eventDate: date('event_date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('bond_milestones_bond_idx').on(t.bondId)]);

export const blocks = pgTable('blocks', {
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

export const mutes = pgTable('mutes', {
  muterId: uuid('muter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mutedId: uuid('muted_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.muterId, t.mutedId] })]);

/* ---------------- Social graph & content ---------------- */

export const follows = pgTable('follows', {
  followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followeeId: uuid('followee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** pending | accepted */
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index('follows_followee_idx').on(t.followeeId)]);

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** public | private */
  visibility: text('visibility').notNull().default('public'),
  /** community | creator_channel */
  kind: text('kind').notNull().default('community'),
  /** Circle visual theme key (circles only). */
  theme: text('theme').notNull().default('dusk'),
  /** Who may create invite links in a circle: admins | members */
  invitePolicy: text('invite_policy').notNull().default('members'),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (t) => [uniqueIndex('groups_slug_uq').on(t.slug)]);

export const groupMembers = pgTable('group_members', {
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** owner | moderator | member */
  role: text('role').notNull(),
  /** pending | active | banned */
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('group_members_user_idx').on(t.userId)]);

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  /** text | image | cosmic_card | poll | story | achievement */
  kind: text('kind').notNull(),
  body: text('body').notNull().default(''),
  imageUrl: text('image_url'),
  card: jsonb('card'),
  topics: text('topics').array().notNull().default(sql`'{}'::text[]`),
  /** public | followers | group */
  visibility: text('visibility').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  hiddenByModeration: boolean('hidden_by_moderation').notNull().default(false),
  /** Shown under the author's pseudonym; author id is never serialised to other members. */
  pseudonymous: boolean('pseudonymous').notNull().default(false),
  editedAt: timestamp('edited_at', { withTimezone: true }),
}, (t) => [index('posts_author_created_idx').on(t.authorId, t.createdAt), index('posts_created_idx').on(t.createdAt), index('posts_group_idx').on(t.groupId)]);

export const pollOptions = pgTable('poll_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  position: integer('position').notNull(),
}, (t) => [index('poll_options_post_idx').on(t.postId)]);

export const pollVotes = pgTable('poll_votes', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id').notNull().references(() => pollOptions.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const reactions = pgTable('reactions', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** star | moon | sun | heart */
  kind: text('kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  hiddenByModeration: boolean('hidden_by_moderation').notNull().default(false),
}, (t) => [index('comments_post_idx').on(t.postId, t.createdAt)]);

export const savedPosts = pgTable('saved_posts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const feedFeedback = pgTable('feed_feedback', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  /** more_like_this | less_like_this */
  signal: text('signal').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.postId] })]);

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  hostId: uuid('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  /** online | in_person */
  mode: text('mode').notNull(),
  location: text('location'),
  /** External live link; only shown to RSVP'd attendees. */
  liveUrl: text('live_url'),
  capacity: integer('capacity'),
  /** community | workshop | live_class | challenge */
  kind: text('kind').notNull().default('community'),
  pricePaise: integer('price_paise').notNull().default(0),
  status: text('status').notNull().default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('events_starts_idx').on(t.startsAt)]);

export const eventRsvps = pgTable('event_rsvps', {
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** going | interested | attended | cancelled */
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

/* ---------------- Messaging ---------------- */

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** direct | dating_match | matchmaking | consultation | vendor | wedding */
  kind: text('kind').notNull(),
  contextId: uuid('context_id'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export const conversationMembers = pgTable('conversation_members', {
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** requested | accepted | declined | left */
  state: text('state').notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  mutedNotifications: boolean('muted_notifications').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conv_members_user_idx').on(t.userId)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  /** user | system */
  kind: text('kind').notNull().default('user'),
  body: text('body').notNull(),
  attachmentUrl: text('attachment_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [index('messages_conv_created_idx').on(t.conversationId, t.createdAt)]);

/* ---------------- Safety ---------------- */

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** user | post | comment | message | dating_profile | expert | review | product | vendor | group */
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  targetUserId: uuid('target_user_id'),
  /** spam | harassment | scam | impersonation | underage | inappropriate | hate | self_harm | other */
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  /** general | dating_safety | marketplace */
  queue: text('queue').notNull().default('general'),
  /** open | in_review | actioned | dismissed */
  status: text('status').notNull().default('open'),
  priority: integer('priority').notNull().default(2),
  assignedTo: uuid('assigned_to'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [index('reports_status_queue_idx').on(t.status, t.queue), index('reports_target_user_idx').on(t.targetUserId)]);

export const moderationActions = pgTable('moderation_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
  moderatorId: uuid('moderator_id').notNull().references(() => users.id),
  /** hide_content | warn_user | suspend_user | unsuspend_user | dismiss | remove_from_dating | restore_content */
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const appeals = pgTable('appeals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moderationActionId: uuid('moderation_action_id').references(() => moderationActions.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  /** open | upheld | overturned */
  status: text('status').notNull().default('open'),
  decidedBy: uuid('decided_by'),
  decisionNote: text('decision_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
