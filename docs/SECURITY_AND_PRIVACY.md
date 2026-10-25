# Security and privacy

Scope: the Nakshatra application as built in this repository. A passing scan or test suite is evidence for the specific checks listed, not proof of complete security. An independent penetration test is recommended before public launch.

## Data classification
| Class | Examples | Handling |
|---|---|---|
| Secret | Passwords, session tokens, MFA secrets, `APP_SECRET`, provider keys | Never logged (pino redaction of `cookie`, `authorization`, `set-cookie`, `*.password`, `*.token`); passwords scrypt-hashed; sessions stored as SHA-256; MFA secret AES-256-GCM encrypted; keys only in env |
| Sensitive personal | Birth date/time/place, private messages, journal entries, Bond notes, dating location, family relationships | Private by default; never in URLs, analytics or public APIs; excluded from admin user view; dating location coarsened to ~5 km |
| Personal | Email, display name, handle, posts | Visibility controls; email never shown to other users |
| Financial | Orders, payments, refunds, payouts | Card data never touches Nakshatra; amounts and provider references only; retained on account deletion in de-identified form |

## Authentication
- Passwords: min 10 chars, scrypt (N=16384, r=8, p=1) with per-user salt, NFKC normalisation; a dummy hash is checked for unknown emails to equalise timing; generic "Email or password is incorrect" message.
- Sessions: 256-bit random token in `nk_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production, 30 days); DB stores `sha256(token)`; revocable per device in Settings → Security; all sessions revoked on password reset and on suspension.
- MFA: TOTP (RFC 6238) enrolment with confirmation code; enforced at login; failures audited.
- Throttling: auth endpoints 10 requests/min per IP; **per-account limit of 8 failed password/TOTP attempts per 15 minutes** (HTTP 429); global 600/min per IP.
- Password reset and email verification: single-use, hashed, expiring tokens delivered by email; reset does not reveal whether an account exists.

## Authorisation
- `requireAuth` on every member route; ownership enforced inside queries (`where user_id = current`), so another user's id returns 404, not someone else's data.
- Staff capabilities (`users.view`, `users.manage`, `moderation`, `verification`, `refunds`, `commerce`, `content`, `flags`, `support`, `privacy`, `audit`, `analytics`) mapped from roles in `lib/auth.ts`; every `/api/v1/admin/*` route calls `requireCapability`. Hidden navigation is never the only protection (verified by `e2e/smoke.spec.ts`: members get 403 on admin APIs).
- Moderation safeguards: only admins can act on admins; moderators cannot decide appeals against their own actions; every action records a reason and is audited.
- Family/matchmaking: family members get access only after the principal sends an invitation and the invitee accepts; permissions are per-capability and revocable.

## Web protections
- CSRF: double-submit token (`nk_csrf` cookie + `x-csrf-token` header) on all unsafe `/api` methods; webhooks exempt and HMAC-verified.
- CSP (helmet): `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`; styles allow inline (Tailwind runtime variables) and Google Fonts.
- XSS: React escapes output; no `dangerouslySetInnerHTML` with user content; user text rendered as text (`whitespace-pre-line`).
- SQL injection: Drizzle parameterised queries; raw SQL uses tagged templates with bound parameters.
- Uploads: max `MAX_UPLOAD_MB` (default 5 MB), one file per request, type detected from magic bytes (PNG/JPEG/WebP/PDF), random file names, private evidence served only through authorised endpoints with `cache-control: no-store`.
- Open redirects: post-login `next` must start with `/`.
- CORS: not enabled; the API is same-origin only.

## Payments
- Prices, discounts and stock computed server-side at checkout; client-supplied amounts ignored.
- Payment state changes only through `processWebhook` with a valid HMAC signature; events are idempotent by `(provider, provider_event_id)`; a state machine rejects invalid transitions (e.g. refunding more than was paid).
- The development simulator is labelled on every screen and refused when `NODE_ENV=production`.
- Razorpay: the key secret and webhook secret stay server-side; Checkout receives only the public key id and order id. The checkout callback signature is verified but does **not** mark a payment paid — only a signed `payment.captured` webhook does. Refund completion likewise waits for a signed `refund.processed` webhook. Provider error bodies are never shown to users.
- Email: SMTP delivery happens after the database transaction commits (outbox pattern), so rolled-back actions never send mail; failures are retried up to 3 times and recorded for operators.

## Privacy controls (user-facing)
- Profile visibility (private/public) and per-field visibility (Sun, Moon, Rising, nakshatra, bio, interests, badges, level, birth date). Birth time, birthplace and coordinates can never be made public.
- Bonds share chart placements (or only Sun/Moon/Rising) — never raw birth data — and either person can revoke; revocation disables share links immediately.
- Search history on/off; hide from search via private profile; notification preferences, quiet hours, daily cap, unsubscribe-all.
- Consent records: birth-data processing (withdrawal deletes birth data and charts), dating terms, product email.
- **Export**: Settings → Data downloads JSON with account, profile, birth profiles, chart snapshots, insights, timeline, rituals, Bonds, notes, share grants, posts, comments, messages sent, dating and matchmaking profiles, enrollments, certificates, XP, achievements, orders, bookings, subscriptions, consents, notifications, wedding projects.
- **Deletion**: password + typed confirmation; immediate. Deletes birth data, charts, insights, journey, Bonds, dating/matchmaking profiles, family links, sessions; blanks the content of posts, comments and messages; anonymises the account; retains orders/payments/refunds/bookings de-identified for accounting; records a counts-only deletion record. Verified end-to-end in `e2e/i-privacy.spec.ts`.

## Analytics
Event names from a fixed taxonomy (`EVENT_TAXONOMY`); properties pass `sanitizeProps`, which drops keys matching birth/location/message/contact patterns and truncates strings to 80 chars. Verified by an integration test that searches stored events for birth dates and message bodies.

## Audit log
`audit_logs` records sign-ins, failed sign-ins and MFA failures, role changes, suspensions, moderation decisions, appeal decisions, verification decisions, evidence views, refunds, payouts, product/inventory changes, content and configuration changes, user deletions. Viewable at `/admin/audit` (capability `audit`).

## Verification evidence (this repository)
| Check | Where |
|---|---|
| CSRF rejection, IDOR, public-profile birth-data exposure, forged/duplicate webhooks, suspension, analytics sanitisation, TOTP, per-account throttle | `tests/integration/core.test.ts` |
| Admin API refusal for members, admin console access | `e2e/smoke.spec.ts` |
| Revoked share links, revoked Bond access | `e2e/b-relationship.spec.ts`, `e2e/i-privacy.spec.ts` |
| Export and deletion with retention | `e2e/i-privacy.spec.ts` |
| Concurrent double booking / duplicate XP | `tests/integration/journeys.test.ts` (concurrency safeguards) |
| Committed secrets | `npm run audit:secrets` |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities in runtime dependencies (2026-10-24). `npm audit` (all): 4 moderate in dev-only tooling (`drizzle-kit` → `@esbuild-kit` → old `esbuild` dev-server advisory GHSA-67mh-4wv8-2f99). Not shipped and not used to serve traffic; accepted until drizzle-kit updates. |

## Production configuration requirements
- `NODE_ENV=production` (enables `Secure` cookies, removes the dev mailbox route, refuses the payment simulator and demo seeding).
- `APP_SECRET` ≥ 32 random characters (refused otherwise). Rotating it invalidates MFA secrets and unsubscribe links.
- Serve over HTTPS behind a reverse proxy; set `APP_ORIGIN` to the public URL.
- Real `DATABASE_URL` (PostgreSQL) with TLS and backups.

## Known gaps / recommendations before launch
- No independent penetration test yet.
- Upload malware scanning is not integrated (type checks only).
- Email deliverability (SPF/DKIM) depends on the SMTP provider chosen.
- Legal copy (Terms, Privacy) is a draft describing actual behaviour and must be reviewed by counsel.
