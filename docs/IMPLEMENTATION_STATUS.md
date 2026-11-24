# Implementation status

_Living checkpoint. Update before every interruption. Last updated: 2026-10-24 (afternoon, local)._

## Current phase
Phase 9 — handover complete. Remaining blockers are external (see below).

## Local application
- **URL: http://localhost:3000**, verified by HTTP and in the browser on 2026-10-24. One detached Node process serves the API and the built website; the embedded PostgreSQL lives at `.data/pglite`.
- Start: `npm run local` · Stop: `npm run local:stop` · Logs: `.data/logs/server.log`. Hot-reload development is still `npm run dev` (http://localhost:5173).
- Root cause of the earlier localhost:3000 failure: nothing in the project listened on 3000 (development used Vite on 5173 and the API on 4000/4400), and no server was running.
- Persistence verified: an account and chart created in the browser survived a server restart (same chart id).
- Incident (2026-10-24, during a documentation edit): a shell command accidentally executed backtick-quoted text, which ran `npm ci` (clean reinstall from the lockfile), copied `.env.example` over `.env` (local random secrets regenerated afterwards; no account used MFA, so nothing stored depended on the old secret) and started two dev servers (stopped). Database integrity was checked afterwards (10 users, 3 migrations, 129 tables, full reads OK) and a backup taken.

## Completed (2026-10-24)
- Browser specs for all journeys plus smoke, accessibility (axe, light + dark), resilience (WebGL off, context loss, reduced motion, navigation leaks, keyboard) and mobile; each has passed in the latest runs (final consolidated run results: RELEASE_READINESS_REPORT.md).
- Razorpay adapter and SMTP transport implemented and tested against local fakes.
- Migrations 0001 (email delivery) and 0002 (budget ↔ vendor booking) — additive; upgrade of the existing dev database verified with backup + restore.
- Fresh install from a clean copy and production-mode smoke test verified.

## Defects found and fixed this session
1. Toggle switch knob overflowed its track.
2. Validation errors did not name the field.
3. Expert booking page showed "with customer" (customer name missing from API).
4. Booking double-booking race on PostgreSQL → per-expert advisory transaction lock (+ concurrent test).
5. No per-account login throttle → 8 failures / 15 min (+ test).
6. No WebGL context-loss handling → 2D fallback (+ test).
7. Saved insights had no UI → Journey page section.
8. Wedding milestone payment returned to /weddings instead of the project.
9. Production silently used the dev mailbox → refused in production.
10. Default calculation config could be deactivated before the guard ran.
11. **Vedic whole-sign houses offset by the ayanamsa** (planets before the Lagna degree in the Lagna sign got house 12) → fixed in `src/astro/chart.ts`, engine 1.0.1, regression test.
12. Dussehra 2026 computed as Oct 21 → aparahna rule (published: Oct 20).
13. Holi 2026 computed as Mar 3 → Bhadra rule for Holika Dahan/Holi (published: Mar 4; verified 2024–2026).
14. Seeded staff/expert/vendor accounts forced into onboarding → seeded with labelled sample birth data.
15. Session buttons enabled before allowed, errors only as transient toasts → disabled with explanation.
16. Unknown routes crashed → proper 404.
17. Mobile "More" drawer had no accessible name.
18. 3D labels threw `removeChild` errors on client navigation → portalled into an unmanaged overlay.
19. axe findings (contrast, nested interactive content, calendar ARIA, name mismatches, colour-only link) → fixed; South Indian chart keyboard access.
20. Creator/seller studios errored for members with no way to apply → self-serve applications reviewed in Admin → Verification.
21. Paid vendor deposits missing from the wedding budget → linked budget line.
22. Admin overview lacked operational status → health + integrations.
23. ECONNRESET from keep-alive socket reuse → keep-alive 65 s; `TRUST_PROXY` for correct client IPs behind proxies.
24. /chart overflowed 166 px on phones → grid children `min-width: 0`.
26. Local launcher hung its caller (Start-Process handle inheritance) and failed its readiness probe (PowerShell resolves localhost to ::1) → detached start via Win32_Process.Create; probes 127.0.0.1.
27. Database CLIs (seed, migrate, reset, restore, backup) could open the embedded database while the server had it open → they now refuse while the local server is running.
28. **First run crashed with the shipped `.env.example`**: blank `APP_SECRET=` was treated as a too-short secret → blank values now mean "unset" (+ test); production still refuses a missing secret.
25. Wedding e2e read a stale invitation link (test race) and suite-level slowness from always-on tracing → wait for updated notice; traces only on retry; G in its own Playwright project.

## External dependencies / blockers needing the owner
- **Docker / PostgreSQL server**: Docker Desktop is installed but needs WSL 2 (admin + restart). No native PostgreSQL. A portable PostgreSQL could be downloaded, but downloading binaries needs the owner's OK. Once available: `TEST_DATABASE_URL=postgres://… npm test` and `docker compose up --build`.
- Razorpay merchant account + keys (live payment + refund test).
- SMTP provider credentials.
- Video/voice/push providers (UI reports unavailable).
- Legal review; company details; grievance officer; confirm prices/commission.
- Independent penetration test.

## Database / migrations
`0000_init.sql`, `0001_email_delivery.sql`, `0002_budget_vendor_link.sql`; applied automatically at startup.

## Ports
4000 is used by another local project (Atlas); dev API on 4400 via `.claude/launch.json`; e2e on 4410.

## Exact next action
Software work is complete for this environment: 117/117 unit/integration and 20/20 browser tests pass (two consecutive runs). Next actions are the owner items above (WSL 2 or PostgreSQL for Docker/PostgreSQL verification, Razorpay and SMTP credentials, legal review, penetration test).
