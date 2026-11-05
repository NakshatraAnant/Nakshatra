# 02 — Security Remediation Report

## Verified fixes (regression tests in `tests/integration/security-regressions.test.ts`)

| Finding | Before (audit probe) | After | Test |
|---|---|---|---|
| SEC-01 | `GET /blocks` returned author's `userId`, `handle`, `displayName` | `muted: []`, `mutedPenNames: [{ ref: <32-hex HMAC>, penName }]`; nothing identifying in payload | `muting a pen-name author lists only the pen name…` |
| SEC-02 | Author's own reply showed real identity | `{ pseudonym: 'Night Kite', isPostAuthor: true }` for every other viewer | `the author replying in their own pen-name thread…` |
| SEC-03 | `round.excludeId` = author; only author not "waiting" | No `excludeId`; all `waitingOn: false`; per-player view differs only in own `me.canAct` | `Who Said It? and Hot Take Arena never reveal the author…` |
| SEC-04 | Outsider saw title + location, RSVP 200 | Not listed, not searchable, RSVP 404 | `outsiders cannot list, search, RSVP to…` |
| SEC-05 | `/mfa/setup` switched MFA off | 409 while enabled; disable needs password + code; other sessions revoked; failures audited | `setup cannot overwrite an active factor…` |
| SEC-06 | Following feed exposed followee pen-name posts | Excluded | `following mode never shows…` |
| SEC-07 | Links kept forever | Retention job | `blanks delivered SMTP bodies…` |
| SEC-08 | Legacy APIs reachable | 404 `module_disabled` on every prefix (GET and POST, signed in and out) | `tests/integration/modules.test.ts` |

## Broader review (Part 3) — what was checked and the outcome

| Area | Outcome |
|---|---|
| Authentication / sessions / reset | Unchanged and sound (scrypt, hashed tokens, single-use reset, session revocation). MFA tightened (SEC-05). |
| Authorisation / IDOR | New endpoints all scope by `requireAuth` + ownership/membership: gifts (verified matching email), shares (owner-only revoke), common ground (both must be co-members), rematch (participant + member), quests/seasons (own user only), XP reversal (`users.manage` capability). |
| Mass assignment | All new bodies are Zod objects with explicit fields; unknown keys stripped (verified: anonymous share ignores a client-sent `archetypeKey`). |
| XSS | React escaping; the only new server-rendered HTML (`services/shell.ts`) escapes every value — tested with a display name containing `<img onerror>`. |
| CSRF | Unchanged double-submit; new unsafe routes are under `/api/` and covered. |
| SSRF / open redirect | No server-side fetches added. Gift claim links use only an internal `next` path; existing sign-in `next` handling already restricts to same-origin paths. |
| Rate limits | New routes have per-route limits (shares 20/h, claims 10–30/min, vibe 20/min, rematch 10/min). |
| Gift abuse | Claim requires verified email equal to recipient; token stored hashed; one claim per order item (unique); expiry; refunds revoke; self-gifting refused. |
| Referral abuse | Unchanged rules + cap fix. Quests count replies to *other people's* posts only (tested). |
| XP abuse | All awards via unique `(user, rule, source)`; quest claims PK per period; concurrent claims tested (two parallel → both 409 after first); reversals unique per entry. |
| Game state privacy | SEC-03. |
| Payments | `PAYMENTS_ENABLED=false` gate refuses Razorpay unless explicitly enabled; local `.env` set to `PAYMENT_PROVIDER=none`. Webhooks unchanged (signed, idempotent). |
| Logging | Mood words are never sent to analytics (tested). Pino redaction unchanged. |
| RLS / schema isolation | Untouched. New tables are created by migrations in the same schema and covered by the existing RLS/REVOKE step. Not re-verified against Supabase (out of scope; not contacted). |
| Secrets | No new secrets. HMAC for pen-mute refs uses `APP_SECRET`. |

## Remaining risks

| Risk | Severity | Reason not fixed |
|---|---|---|
| Blocking a user hides their pen-name posts too | Low (inference) | Safety takes precedence; documented in Terms. |
| Moderate npm advisories (`@fastify/static` chain) | Low | Dependency upgrades not performed in this batch. |
| Signup enumeration | Low | Product trade-off; documented. |
| Late-payment auto-refund covers orders only | Medium (when payments live) | Bookings/subscriptions belong to disabled legacy modules. |
| MFA lost-device recovery | Medium | Requires a support/recovery-code design. |
