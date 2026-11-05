# 06 — Security and Privacy Audit

Audit date: 2026-11-05 · Branch `visual/ink-ember-integration` @ `f3d993a` · Auditor: Claude (code + runtime probe)

## Method and evidence levels

| Level | Meaning |
|---|---|
| **VERIFIED** | Reproduced by `evidence/audit-probe.ts` against the app's own test harness (in-memory PGlite, real HTTP routes via `app.inject`). Output in `evidence/audit-probe-output.json`. |
| **CODE** | Established by reading the implementation; not executed. |
| **UNVERIFIED** | Could not be inspected (e.g. production Supabase was hibernated). |

No production system was touched. No exploit was run against any hosted environment.

## Summary

The authentication core (scrypt hashing, hashed session tokens, double-submit CSRF, per-account login throttle, TOTP with encrypted seeds, magic-byte upload validation, signed + idempotent payment webhooks) is solid and above average for a product at this stage.

**The privacy promises that define the product are broken.** The landing page states "Pen names hide who you are from other members" and "Circles are invisible to anyone outside them". Both statements are false today, and both were reproduced:

| ID | Severity | Priority | Finding | Evidence |
|---|---|---|---|---|
| SEC-01 | HIGH | P0 | Muting a pen-name author reveals their real name, handle and user id | VERIFIED |
| SEC-02 | HIGH | P0 | A pen-name author who comments on their own Thought Drop is shown under their real identity | VERIFIED |
| SEC-03 | HIGH | P0 | Game API leaks the hidden author of every line in Who Said It?, Hot Take Arena and Memory Lane | VERIFIED |
| SEC-04 | HIGH | P0 | Private circle / private group events (title, description, location) are listed to every member; outsiders can RSVP | VERIFIED |
| SEC-05 | MEDIUM | P1 | Two-step verification can be switched off without the password via `/auth/mfa/setup` | VERIFIED |
| SEC-06 | MEDIUM | P1 | Pen-name posts are effectively only visible to the author's followers (default private profile), and the "following" feed mode shows them — the anonymity set is "people I follow" | CODE |
| SEC-07 | MEDIUM | P1 | Password-reset and email-verification links are stored in plaintext in `email_outbox.text_body` and never purged | CODE |
| SEC-08 | MEDIUM | P0 | Dating, matchmaking, weddings and experts are enabled by default in production and their feature flags are not enforced by the API | CODE |
| SEC-09 | MEDIUM | P1 | `docker-compose.yml` defaults to `NODE_ENV=development`, which registers the unauthenticated `/api/v1/dev/mailbox` (all users' reset links) and the payment simulator | CODE |
| SEC-10 | MEDIUM | P2 | Event "live URL only for attendees" protection is ineffective — anyone can RSVP to any event | CODE |
| SEC-11 | LOW | P2 | Account enumeration at signup (409 "An account with this email already exists") | VERIFIED |
| SEC-12 | LOW | P2 | Changing a pen name relabels all past pen-name posts; clearing it shows "Anonymous member" | CODE |
| SEC-13 | LOW | P2 | Account deletion leaves uploaded files (`uploads`, `stored_files`, disk), analytics `user_id`, audit `actor_id` and report documents | CODE |
| SEC-14 | LOW | P3 | `POST /posts/:id/feedback` has no visibility check | CODE |
| SEC-15 | LOW | P3 | Group moderators can ban other moderators | CODE |
| SEC-16 | LOW | P3 | `imageUrl` on posts accepts any `/uploads/public/...` path (can reference another user's upload) | CODE |
| SEC-17 | INFO | P3 | 3 moderate npm advisories in production deps (`glob`/`minimatch` via `@fastify/static`); 13 including dev deps; 0 high/critical | VERIFIED (`npm audit`) |
| SEC-18 | INFO | P3 | Rate limits are in-memory per process (fine for one instance; ineffective across several) | CODE |
| SEC-19 | INFO | — | Production Supabase RLS / grants / legacy-table state could not be inspected (project hibernated) | UNVERIFIED |

The full register with likelihood, impact and remediation is in `18_SECURITY_FINDINGS_REGISTER.csv`.

---

## Detailed findings

### SEC-01 — Mute list de-anonymises pen-name authors (VERIFIED, HIGH, P0)

- **Where:** `src/server/modules/social.ts:278-287` (`POST /api/v1/posts/:id/mute-author`) inserts `mutes(muter_id, muted_id = post.author_id)`. `src/server/modules/social.ts:166-172` (`GET /api/v1/blocks`) returns every muted user with `displayNames()` (user id, handle, display name). `src/web/pages/settings.tsx:128` renders that list under Settings → Privacy.
- **Reproduction (probe P1):** User A sets pen name "Night Kite", posts a confession in a circle. User B sees `{ pseudonym: "Night Kite" }`, clicks **Mute author**, then calls `GET /api/v1/blocks` → `muted: [{ userId: <A>, handle: "aaravrealname8507", displayName: "Aarav Realname" }]`.
- **Impact:** Any member can unmask any pen-name author in two clicks, through the normal UI. This is the product's headline privacy feature ("say it without the spotlight", confessions).
- **Why the tests missed it:** `tests/integration/social.test.ts:115-118` asserts the post disappears from the feed after muting but never inspects the mute list.
- **Remediation:** Store pen-name mutes against the post/pseudonym (e.g. `mutes.kind = 'pseudonym'` keyed by an opaque id), never against the user id in a list returned to the muter; exclude such rows from `GET /blocks` or show them as "Night Kite (pen name)".

### SEC-02 — Commenting on your own pen-name post reveals you (VERIFIED, HIGH, P0)

- **Where:** `GET /api/v1/posts/:id` (`social.ts:350-360`) serialises every comment with `author: { userId, handle, displayName }` regardless of whether the commenter is the pen-name author of the post. `POST /posts/:id/comments` has no pseudonymous path.
- **Reproduction (probe P2):** A replies under their own pen-name post; C fetches the post → comment author is A's real identity.
- **Impact:** The natural behaviour (author answers replies to their question/dilemma) unmasks them. The UI gives no warning.
- **Remediation:** When `comment.author_id === post.author_id && post.pseudonymous`, serialise as the pen name (and mark "author"); or block comments by the author under their real identity.

### SEC-03 — Game author secrets leak through `round.excludeId` and `waitingOn` (VERIFIED, HIGH, P0)

- **Where:** `src/shared/play/engine.ts:155` (Who Said It?), `:340` (Hot Take Arena), `:410` (Memory Lane) put the author's user id in `excludeId`. `publicRound()` (`engine.ts:457-460`) strips only `secret`. `GET /api/v1/play/sessions/:id` (`play.ts:323-345`) returns `round.excludeId` and `players[].waitingOn` — the author is the only player never "waiting".
- **Reproduction (probe P3):** In both Who Said It? and Hot Take Arena the `excludeId` of the active vote round equalled the author of the line shown (`LEAKS_AUTHOR: true`), and the author was the only player with `waitingOn: false`.
- **Impact:** Who Said It? and Memory Lane are trivially solvable by anyone reading the network tab or noticing who is not "thinking…" in the UI. Hot Take Arena explicitly promises "anonymous verdicts … Takes are judged, never people" — the author is exposed to every player.
- **Remediation:** Move `excludeId` for authored rounds into `secret`; compute `canAct`/pending server-side; render a generic "You sit this round out" flag (`me.canAct`) rather than the id; hide `waitingOn` for vote rounds whose exclusion is secret.

### SEC-04 — Private circle events are public (VERIFIED, HIGH, P0)

- **Where:** `GET /api/v1/events` (`social.ts:563-570`) selects all future events with no group-membership or group-visibility filter. `POST /api/v1/events/:id/rsvp` (`social.ts:589-605`) has no membership check. Circle owners can create events with `groupId = circle.id` (`social.ts:581-584`).
- **Reproduction (probe P4):** Circle owner creates "Secret circle dinner" at "12 Private Lane" in a private circle; an unrelated member sees the title, description, location and circle id in `/api/v1/events` and successfully RSVPs (HTTP 200).
- **Impact:** Physical-location disclosure for private gatherings; direct contradiction of "Circles are invisible to anyone outside them".
- **Remediation:** Filter events by `group_id is null OR (group public) OR viewer is active member`; enforce the same on RSVP, attendees and search (`account.ts:161` also searches all event titles).

### SEC-05 — MFA can be disabled without re-authentication (VERIFIED, MEDIUM, P1)

- **Where:** `POST /api/v1/auth/mfa/setup` (`auth.ts:245`) unconditionally writes a new secret and `mfaEnabled: false`. `/auth/mfa/disable` correctly requires the password; setup does not.
- **Reproduction (probe P5):** `mfaEnabled` true → call `/mfa/setup` with only the session → `mfaEnabled` false. No notification is sent (unlike `/disable`).
- **Impact:** A stolen session (shared device, XSS elsewhere) can silently remove the second factor, then persist.
- **Remediation:** Refuse `/mfa/setup` while MFA is enabled (or require password), and notify.

### SEC-06 — Pen-name visibility model narrows the anonymity set (CODE, MEDIUM, P1)

- `profiles.visibility` defaults to `'private'` (`schema/auth.ts:74`). The feed shows a `public` post to non-followers only if the author's profile is public (`social.ts:301`, `canViewPost` `social.ts:50-53`). This applies to pen-name posts too, so a default user's "public" pen-name post reaches **only their followers**.
- `mode=following` (`social.ts:297-298`) restricts to `author_id in (following)`, so any pen-name post seen there was written by someone you follow. Ranking correctly suppresses the "From someone you follow" reason (`ranking.ts:52-58`), but the feed mode itself leaks it.
- Inconsistency: global search (`account.ts:166-172`) does return pen-name posts from private profiles, but opening them via `/posts/:id` returns 404 for non-followers.
- **Remediation:** Treat pen-name posts as authored by an unlinked pseudonymous identity for visibility (do not use the real profile's visibility or follow graph); exclude them from `following` mode.

### SEC-07 — Auth tokens in plaintext outbox (CODE, MEDIUM, P1)

- `auth_tokens` stores only `sha256(token)` (good), but `sendEmail()` writes the full link into `email_outbox.text_body` (`notify.ts:76-85`; `auth.ts` signup/forgot/resend). Rows are never deleted. Anyone with read access to the database (backup, support tooling, a leaked connection string) can take over accounts within the 1-hour reset window, and verify emails indefinitely within 48 h.
- **Remediation:** Blank or hash the body after send, purge sent rows after N days, or render the link at send time from the token held only in memory.

### SEC-08 — Unfinished, high-risk modules are live by default (CODE, MEDIUM severity, P0 because of launch consequence)

- `seedReferenceData` (`db/seed.ts:44-53`) inserts `dating`, `matchmaking`, `weddings`, `experts` flags with `enabled: true` on every boot, including production.
- `requireFeature` is only called for `circles` and `play` (`circles.ts:46,167`, `play.ts:178`). Turning `dating` off in Admin hides nothing server-side; the AppShell nav does not consult `/api/v1/features` either (Labs group is static).
- Dating has an 18+ check based solely on the self-entered birth date (`dating.ts:57-58`) and a manual selfie verification queue. There is no evidence of staffed moderation.
- **Remediation:** Before launch, set these flags off and enforce `requireFeature` in every handler of those modules (or remove the modules from the build).

### SEC-09 — Docker Compose development default exposes dev mailbox (CODE, MEDIUM, P1)

- `docker-compose.yml` sets `NODE_ENV: ${COMPOSE_NODE_ENV:-development}` and `MAIL_TRANSPORT: dev_mailbox`. In non-production, `auth.ts` registers `GET /api/v1/dev/mailbox` **with no authentication**, returning the last 50 emails (verification/reset links for every user). If someone uses the compose file for a public host, any visitor can reset any password.
- The Render blueprint is not affected (`NODE_ENV=production`, `MAIL_TRANSPORT=smtp`; `config.ts` refuses dev mailbox/simulator in production).
- **Remediation:** Require staff auth on the dev mailbox even in development, bind compose to localhost, and document the risk.

### SEC-10 — Event live-link gating is cosmetic (CODE, MEDIUM, P2)
`GET /events` hides `liveUrl` unless the viewer RSVP'd, but RSVP is open to anyone (`social.ts:589`). Fix with SEC-04.

### SEC-11 — Signup enumeration (VERIFIED, LOW, P2)
`POST /auth/signup` returns 409 with "An account with this email already exists" (probe P6). Login and forgot-password do not enumerate. Rate-limited at 10/min/IP. Acceptable trade-off for many consumer apps; document the decision.

### SEC-12 — Pen-name history is mutable (CODE, LOW, P2)
`hydratePosts` (`social.ts:67-80`) reads the author's *current* `profiles.pseudonym`. Changing pen name renames all old posts (linking old and new names); clearing it shows "Anonymous member".

### SEC-13 — Deletion is incomplete for files and telemetry (CODE, LOW, P2)
`deleteAccount` (`account.ts:267-308`) is thorough for content rows but does not delete `uploads` / `stored_files` rows or files on disk (avatars, post images, verification selfies), and keeps `analytics_events.user_id`, `audit_logs.actor_id`, `xp_ledger`, `referrals`, `report_documents`. Orders/payments retention is documented; the others are not.

### SEC-14..18
See register. All low or informational.

---

## Controls verified as sound

| Control | Evidence |
|---|---|
| Password hashing: scrypt N=16384, r=8, p=1, 64-byte key, per-user salt, timing-safe compare, dummy hash for unknown accounts | `lib/crypto.ts:6-28`, `auth.ts` login |
| Session tokens: 32 random bytes, only SHA-256 stored, httpOnly, SameSite=Lax, Secure in prod, 30-day expiry, revocable, list/revoke in Settings | `lib/auth.ts`, `auth.ts:createSession` |
| CSRF: double-submit cookie checked on every unsafe `/api/` request except signed webhooks | `app.ts:79-93` |
| Login brute force: 10/min/IP + 8 failures/15 min/account | `auth.ts` login |
| Password reset: 1-hour single-use hashed token, revokes all sessions | `auth.ts` reset-password |
| TOTP: RFC 6238, ±1 step, seed AES-256-GCM encrypted with key derived from `APP_SECRET` | `lib/crypto.ts` |
| SQL injection: all queries via Drizzle parameterisation; the few raw `sql` fragments bind values; schema name validated by regex before interpolation | `db/client.ts:24`, grep of `sql\`` |
| XSS: React escaping; no `dangerouslySetInnerHTML`/`innerHTML` anywhere in `src/web` (grep); CSP `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` | `app.ts:46-63` |
| Uploads: magic-byte type detection, random names, size caps, private files not web-served | `lib/storage.ts` |
| IDOR on owned resources (orders, reports, sessions, posts, comments, circles): ownership in the WHERE clause, 404 for "not yours" | multiple modules; circle 404 tests in `social.test.ts` |
| Honest Vote individual votes not exposed | `social.test.ts` "Honest Vote never exposes individual votes" (passes) |
| Payment webhooks: HMAC verified, unique event id, row lock, state machine | `lib/payments.ts` |
| Production config guards: refuses dev simulator / dev mailbox / missing `APP_SECRET` when `NODE_ENV=production` | `config.ts:70-82`, `core.test.ts` |
| Schema isolation + RLS + revoked API-role grants applied at migrate time | `db/client.ts:29-60`, `schema-isolation.test.ts` (passes on PGlite) |
| Analytics props sanitised (no birth data, bodies, contacts) | `lib/context.ts:sanitizeProps` |

## Privacy architecture notes

- **Pseudonymous, not anonymous:** the UI correctly says the account link is kept server-side (`thoughts.tsx:95`). The landing page's "Pen names hide who you are from other members" is the claim currently broken by SEC-01/02/06.
- **Personal data held:** email, display name, optional birth date/time/place/coordinates (sensitive in an astrology context), personality answers, private reflections, messages, dating preferences, verification selfies, shipping addresses (commerce), IP and user-agent per session and audit row.
- **Export:** `POST /privacy/export` exists; content not audited line by line.
- **CORS:** no CORS plugin is registered, so cross-origin browser reads are blocked by default (same-origin SPA). Correct for this architecture.
- **SSRF:** no server-side fetch of user-supplied URLs was found (Razorpay calls go to fixed hosts).
- **Path traversal:** `LocalStorage.read` normalises and checks prefix; `DatabaseStorage.readPublic` validates the name with a regex. Note the regex `^[A-Za-z0-9_-]+.[a-z0-9]+$` has an unescaped `.` (matches any char) — harmless because lookup is an exact DB key, but should be `\.`.

## What was not audited

- Production Supabase grants/RLS/legacy tables (hibernated; see `10_DEPLOYMENT_READINESS.md`).
- Admin module authorisation was sampled (capability map, route counts in `16_API_ENDPOINT_INVENTORY.csv`), not traced handler-by-handler.
- Dating, matchmaking, weddings, experts and LMS modules were inventoried and sampled, not deeply audited.
- No dynamic scanning (ZAP/Burp), no fuzzing, no dependency licence review.
