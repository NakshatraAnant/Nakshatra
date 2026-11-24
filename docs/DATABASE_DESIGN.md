# Database design

PostgreSQL 16-compatible schema, defined with Drizzle ORM in `src/server/db/schema/*.ts` and compiled to SQL migrations in `drizzle/`. **129 tables, 100 indexes** (counted from `drizzle/0000_init.sql`).

## Engines
| Mode | When | Driver |
|---|---|---|
| Embedded PostgreSQL (PGlite, WASM) | `DATABASE_URL` unset. Data in `PGLITE_DIR` (default `./.data/pglite`); tests use `:memory:` | `@electric-sql/pglite` |
| PostgreSQL server | `DATABASE_URL=postgres://…` | `pg` (node-postgres) |

Both run the same migrations and the same queries. PGlite is single-connection, so concurrent requests are serialised; production should use a PostgreSQL server.

## Migrations
- Generated: `npm run db:generate` (drizzle-kit) after editing schema files. Review the SQL before committing.
- Applied: automatically at app start (`dbHandle.migrate()` in `src/server/app.ts`), or explicitly with `npm run db:migrate` / `node dist/server/migrate-cli.js`.
- Policy: migrations are additive. A destructive change (drop/rename with data) needs a backup (`npm run db:backup`) and explicit owner approval first.
- Current state: one baseline migration (`0000_init.sql`). There are no deployed databases with an older schema yet, so no data migration has been needed.

## Modules and tables
| Module (`schema/*.ts`) | Tables |
|---|---|
| auth | users, user_roles, sessions, auth_tokens, profiles, profile_history, birth_profiles, consent_records |
| astro | calculation_configs, charts, chart_placements, interpretation_content, saved_insights, timeline_events, ritual_completions, user_locations, daily_lesson_progress |
| social | bonds, bond_invitations, chart_share_grants, compatibility_results, report_shares, bond_notes, bond_milestones, blocks, mutes, follows, groups, group_members, posts, poll_options, poll_votes, reactions, comments, saved_posts, feed_feedback, events, event_rsvps, conversations, conversation_members, messages, reports, moderation_actions, appeals |
| match | dating_profiles, dating_actions, dating_matches, verification_requests, matchmaking_profiles, mm_shortlist, mm_connections, mm_stage_history, family_members, family_suggestions |
| experts (+ learning) | expert_profiles, expert_credentials, expert_services, availability_rules, availability_exceptions, bookings, booking_status_history, consultation_notes, reviews, disputes, payouts, courses, course_chapters, lessons, quizzes, enrollments, lesson_progress, quiz_attempts, lesson_bookmarks, lesson_notes, certificates |
| commerce (+ weddings) | products, product_variants, inventory_movements, cart_items, saved_products, discounts, orders, order_items, shipments, return_requests, payments, payment_events, refunds, subscription_plans, subscriptions, entitlements, report_documents, wedding_projects, wedding_members, wedding_tasks, wedding_budget_items, wedding_events, wedding_guests, vendors, vendor_unavailability, vendor_inquiries, vendor_quotes, vendor_bookings, vendor_payment_milestones |
| platform | xp_ledger, user_achievements, challenge_progress, user_collectibles, daily_checkins, notifications, notification_preferences, notification_settings, notification_templates, scheduled_reminders, email_outbox, data_export_requests, deletion_requests, audit_logs, analytics_events, feature_flags, experiments, experiment_assignments, platform_settings, support_tickets, ticket_messages, search_history, saved_searches, uploads, referrals |

## Invariants enforced by the database
| Invariant | Mechanism |
|---|---|
| One account per email | unique `users.email` (lower-cased on write) |
| Sessions can't be replayed from a DB leak | only `sha256(token)` stored in `sessions` |
| XP awarded once per (user, rule, source) | unique index on `xp_ledger (user_id, rule, source_key)` |
| Achievement awarded once | unique `(user_id, achievement_key)` |
| Payment events processed once | unique `payment_events.provider_event_id` |
| Payment creation is idempotent | unique `payments.idempotency_key` |
| Expert slot can't be double-booked | booking creation runs in a transaction that re-checks overlapping active bookings for the expert |
| Insight saved once per chart | unique `saved_insights (user_id, rule_key, chart_id)` |
| Notification de-duplication | unique `notifications (user_id, dedupe_key)` |
| One dating profile per user | `dating_profiles.user_id` primary key |
| Cascades | user-owned rows `on delete cascade`; financial rows (`orders`, `payments`, `refunds`, `payouts`, `bookings`) `restrict` so they survive account deletion in de-identified form |

## Sensitive data
| Data | Storage |
|---|---|
| Passwords | scrypt hash (`users.password_hash`) |
| MFA secret | AES-256-GCM encrypted with a key derived from `APP_SECRET` |
| Birth date/time/place | `birth_profiles`; never returned by public endpoints; admin user view excludes it |
| Dating location | coarsened to ~5 km before storage (`approx_lat/lon`) |
| Payment cards | never stored; only provider references and amounts |
| Analytics | `analytics_events.props` passes through a server-side sanitiser that drops birth, message and contact fields |

## Account deletion and retention
`deleteAccount()` in `src/server/modules/account.ts` runs in one transaction: deletes birth profiles, charts, insights, journal, bonds, dating/matchmaking profiles, family links, sessions; blanks post/comment/message bodies; anonymises the user row; keeps orders, payments, refunds and bookings linked to the de-identified user; records a `deletion_requests` row with counts only (no personal content). Verified by Journey I.

## Backup and restore
- PGlite: `npm run db:backup` writes a data-directory tarball to `./backups/`; `npm run db:restore -- <file>` restores it (stop the app first).
- PostgreSQL: `pg_dump "$DATABASE_URL" -Fc -f backups/nakshatra.dump` and `pg_restore --clean -d "$DATABASE_URL" backups/nakshatra.dump`.

## Seed data
- `seedReferenceData` (always, idempotent): calculation configs, interpretation content, plans, feature flags, notification templates, platform settings.
- `seedDemoData` (`npm run db:seed`, refused when `NODE_ENV=production`): staff accounts, two sample experts, sample courses/products/vendors flagged `is_sample = true` and labelled "Sample data" in the UI. Generated credentials go to `.data/dev-credentials.json` (gitignored), never to the console.
