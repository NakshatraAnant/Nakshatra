# Release readiness report

_Date: 2026-10-24. Environment: Windows 11, Node 24.16, Microsoft Edge (Playwright channel `msedge`), embedded PostgreSQL (PGlite). Every result below was produced by a command actually run on this date; nothing is inferred._

## 1. Executive summary
Nakshatra is a feature-complete, locally runnable modular monolith (React 19 + Fastify 5 + PostgreSQL) covering the full product scope in PRODUCT_SPECIFICATION.md, with no AI functionality. All nine user journeys plus route smoke tests, accessibility (axe), 3D resilience and a mobile journey are automated against the real UI and an isolated database.

**Assessment: software release candidate, not yet production-launched.** The application can be explored end to end locally and is commercially configurable. It must not be called production-ready until the external items in §15 are done: a live Razorpay account, a real SMTP provider, verification on a PostgreSQL server/Docker (blocked on this machine), legal review, and a penetration test.

## 2. What was implemented this session
- Browser journeys D–I, route smoke (public, 50+ member routes, 18 admin sections, admin-API refusal, 404), accessibility scans (light + dark), 3D resilience (WebGL off, context loss, reduced motion, navigation leaks, keyboard), mobile journey.
- **Razorpay adapter** (orders, Checkout page, checkout-signature check, signed webhooks, refunds, conditional CSP).
- **SMTP transport** (nodemailer outbox, post-commit delivery, retries, stale-claim recovery).
- Creator/seller self-serve applications reviewed by staff; operational status on the admin overview; wedding budget linked to vendor payments; configurable trusted proxy hops; 65 s keep-alive.
- 22 real defects found by tests or inspection and fixed (list in IMPLEMENTATION_STATUS.md), including a **Vedic house-calculation bug** (whole-sign houses offset by the ayanamsa; engine 1.0.1) and two **festival-date rules** (Dussehra aparahna, Holi/Holika Dahan Bhadra), now checked against published 2026 calendars.

## 3. Important files and architectural changes
| Area | Files |
|---|---|
| Payments | `src/server/lib/razorpay.ts` (new), `src/server/lib/payments.ts`, `src/server/modules/index.ts`, `src/web/pages/shop.tsx` (RazorpayPayment) |
| Email | `src/server/lib/notify.ts`, `src/server/services/scheduler.ts`, migration `drizzle/0001_email_delivery.sql` |
| Engine | `src/astro/chart.ts` (whole-sign fix), `src/astro/vedic/festivals.ts` (aparahna, Bhadra), `src/astro/constants.ts` (ENGINE_VERSION 1.0.1) |
| Weddings | `src/server/modules/weddings.ts`, migration `drizzle/0002_budget_vendor_link.sql` |
| Security/ops | `src/server/modules/auth.ts` (per-account throttle), `src/server/modules/experts.ts` (advisory lock), `src/server/config.ts` (mail guard, TRUST_PROXY), `src/server/app.ts` |
| 3D / a11y | `src/web/three/core.tsx` (Label3D overlay portal, context loss, group role), `src/web/styles/app.css` (contrast tokens, grid min-width), `src/web/pages/calendar.tsx`, `src/web/charts/charts.tsx` |
| Tests | `e2e/*.spec.ts` (12 specs), `tests/integration/{razorpay,smtp}.test.ts`, concurrency + application tests in `journeys.test.ts`, engine regressions |

## 4. Feature status
See FEATURE_TRACEABILITY_MATRIX.md (every module, with evidence). Summary: all in-scope modules **IMPLEMENTED**; the nine journeys **VERIFIED** in the browser; payments/email providers **TESTED** against local fakes with live verification **BLOCKED** on credentials; Docker and PostgreSQL server **BLOCKED** on this machine; Shadbala **NOT_STARTED** by design; Hindi partial.

## 5–7. Commands executed and final results (two consecutive clean runs, 2026-10-24)
| Command | Result |
|---|---|
| `npm run typecheck` (web + server) | pass |
| `npm run lint` (src, tests, e2e, scripts) | pass, 0 findings |
| `npx vitest run` | **118 / 118 passed** (6 files: engine reference + rules 78, core security + configuration 13, journeys 23, Razorpay 3, SMTP 2) |
| `npm run audit:secrets` | pass, 178 files, no findings |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run build` | pass |
| `npx playwright test` (Edge) | **20 / 20 passed, 0 flaky** in the final run (9.4 min, after a clean `npm ci`). One earlier run that day failed Journey C+H on a test race (heading read before the lesson view rendered), which was fixed in the spec |

### Browser tests (all passed)
| Spec | Covers |
|---|---|
| a-new-user | Journey A: signup → onboarding → chart → Cosmic ID (page vs API chart) → save insight → sign out/in → persistence (full-motion 3D) |
| b-relationship | Journey B: invite link → accept → compatibility → shared summary → revoke → link and API blocked |
| c-learning-h-gamification | Journeys C + H: enrol → lesson → quiz 100% → achievement → XP once (repeat blocked) → persistence |
| d-dating | Journey D: profile → discover → mutual like → match → messages both ways → report → unmatch → conversation closed |
| e-expert-booking | Journey E: discover → real availability → book → dev payment → expert view (timing rules) → accounting → cancel → refund |
| f-commerce | Journey F: variant → cart (server totals) → checkout → dev payment → stock decrement → refund request → admin approval → refunded |
| g-wedding | Journey G: project → partner + family with permissions → task → vendor inquiry → quotation → accept → deposit → booked → budget updated; family cannot see budget/vendors |
| i-privacy | Journey I: private by default → public with field visibility → IDOR checks → revoke Bond → JSON export → delete → login refused, profile 404, de-identified retention record |
| smoke (4) | every public, member and admin route renders; members get 403 on admin APIs; 404 page |
| a11y (2) | axe WCAG 2.1 A/AA on 22 routes in light and dark themes: 0 serious/critical |
| resilience (5) | WebGL unavailable, context loss, reduced motion, 36 navigations without leaks, keyboard skip link + dialog focus |
| mobile | Pixel 7: touch onboarding, bottom nav + drawer, 0 px horizontal overflow on 14 routes |

## 8. Visual and 3D verification
Inspected in the in-app browser (hardware WebGL) at 1440×900 and 375×812: Cosmic ID 3D renders with six layers from the real chart and focuses the camera on selection; Today, Chart (North/South Indian, table), Calendar (Panchang, festivals) render with real data. The visual pass surfaced the whole-sign house bug (table vs chart disagreed) and the Dussehra date. Mobile overflow measured as 0 px on Chart, Calendar, Journey, Shop and Bonds after the grid fix.

## 9. Database and migrations
Three additive migrations (`0000_init`, `0001_email_delivery`, `0002_budget_vendor_link`). Fresh installs verified in every test run. Upgrade verified on the existing development database: backup → migrate → 8/8 users preserved; backup restore verified into a scratch directory. **Not verified on a PostgreSQL server** (none available); the integration suite supports `TEST_DATABASE_URL` for that.

## 10. Local startup
**Verified URL: http://localhost:3000**, started with `npm run local`. That Windows launcher builds if needed, starts one detached server, waits for health and prints the URL; a cold start takes about 24 s. Stop it with `npm run local:stop`.

The earlier localhost:3000 failure had a simple root cause: nothing in the project listened on port 3000, and no server was running. Hot-reload development remains `npm run dev` (http://localhost:5173). Data persistence across a server restart was verified, and a first run from the shipped `.env.example` now works (blank values used to crash startup). Fresh install from a clean copy measured: `npm ci` 6 min 13 s, `npm run build` exit 0.

## 11. Docker
`docker compose config` validates. Image build/run **not executed**: Docker Desktop is installed but its engine requires WSL 2, which is not installed (needs admin rights and a restart).

## 12. Environment variables
Documented in `.env.example` and DEPLOYMENT_AND_OPERATIONS.md (NODE_ENV, APP_SECRET, APP_ORIGIN, DATABASE_URL, TRUST_PROXY, PAYMENT_PROVIDER + RAZORPAY_*, MAIL_TRANSPORT + SMTP_URL + MAIL_FROM, UPLOAD_DIR, LOG_LEVEL, SEED_DEMO_DATA).

## 13. External integrations
| Integration | Status |
|---|---|
| Razorpay | Implemented; tested against a fake Razorpay API (signed webhooks, duplicates, forged signatures, refunds). Live: **blocked** on merchant account + keys |
| SMTP | Implemented; tested with real nodemailer against an in-process SMTP server (incl. 451 retry). Real provider: **blocked** on credentials |
| Dev payment simulator / dev mailbox | Verified; refused in production |
| Video, voice, push | Not integrated; UI states unavailable |

## 14. Known limitations
Shadbala and other advanced techniques not implemented; only Lahiri ayanamsa; Hindi covers navigation/actions/terms only; messaging uses polling; tax/GST invoicing out of scope; uploads stored on local disk (shared volume needed for multiple instances); no upload malware scanning; regional festival variants can differ by a day; frame-rate on real low-end devices not measured.

## 15. Remaining external launch dependencies (owner actions)
1. Install WSL 2 (or provide a PostgreSQL server) so Docker and PostgreSQL verification can run: `TEST_DATABASE_URL=… npm test` and `docker compose up --build`.
2. Razorpay merchant account; set keys + webhook secret; run one live ₹1 test payment and refund.
3. SMTP provider (with SPF/DKIM); send a verification email end to end.
4. Legal review of Terms/Privacy; company details and grievance officer (Indian IT Rules); confirm prices and commission.
5. Independent penetration test.

## 16. Security review findings
See SECURITY_AND_PRIVACY.md. Added this session: per-account login throttle, booking advisory lock, production mail guard, trusted-proxy configuration. `npm audit --omit=dev`: 0 vulnerabilities. Dev-only: 4 moderate (drizzle-kit → old esbuild dev server), not shipped. Secret scan: no findings.

## 17. Performance findings
API: `GET /api/v1/charts/me` 10–30 ms over HTTP; engine 3–5 ms per chart warm; e2e server cold start 21 s. Bundles (gzip): initial ≈ 63 kB JS + 10 kB CSS; 3D chunks 328 kB loaded only on 3D pages. Long e2e durations come from headless software-rendered WebGL, not the API.

## 18. Artefacts
Logs in `.data/` (gitignored): `final-*.log`, `rerun-e2e.log`. Playwright HTML report in `playwright-report/`; failure screenshots/traces in `test-results/`.

## 19. How to explore
1. `npm run dev`, open http://localhost:5173 and **Get started**.
2. Verify email at http://localhost:5173/dev/mailbox; complete onboarding; open Cosmic ID (3D/2D).
3. Try Chart, Calendar, Bonds (second browser profile as the other person), Dating, Matchmaking, Experts (book + simulated payment), Learn, Shop (checkout + refund request), Weddings, Settings → Data (export).
4. Sign in with the admin account from `.data/dev-credentials.json` and open `/admin`.

## 20. Overall assessment
Ready for internal review, demos and a closed beta on a properly configured server after items 1–3 of §15. Not yet production-ready because live payments, email delivery, PostgreSQL/Docker deployment and legal review are unverified.
