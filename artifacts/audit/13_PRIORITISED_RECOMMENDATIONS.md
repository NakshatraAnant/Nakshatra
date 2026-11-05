# 13 — Prioritised Recommendations

Priorities: **P0** release blocker · **P1** must fix before public launch · **P2** high-value improvement · **P3** later.
Complexity: XS (<½ day) · S (½–2 days) · M (3–5 days) · L (1–3 weeks).
Evidence: V = verified by probe/browser/test run · C = code trace.

Totals: **P0: 6 · P1: 13 · P2: 13 rows · P3: grouped list (~20 small items).** Only items that would expose users' identities, mislead them about privacy, or launch unmoderated high-risk features are P0.

## P0 — Release blockers

| ID | Description | Evidence | Area | User impact | Business impact | Technical impact | Sev. | Cx | Recommended action | Depends on |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-01 | Mute list reveals pen-name author's real identity | V probe P1; `social.ts:278-287,166-172` | Thought Drops | Confessions/dilemmas unmasked | Trust collapse; reputational harm | Mute model keyed by real user id | High | S | Key pen-name mutes to an opaque pseudonym id; never return the underlying user | — |
| SEC-02 | Author's comments on own pen-name post show real name | V probe P2; `social.ts:350-360` | Thought Drops | Unmasked by normal behaviour | Same | Comment serializer unaware of pen names | High | S | Serialise author replies under the pen name | Shared serializer (TD-05) helps |
| SEC-03 | Game secrets (author) sent via `excludeId`/`waitingOn` | V probe P3; `engine.ts:155,340,410,457` | Play | Hot takes and lines attributed to authors | 3 of 12 games broken; "anonymous verdicts" false | `publicRound` strips only `secret` | High | S | Move exclusion into `secret`; expose only `me.canAct`; hide waiting state on secret rounds | — |
| SEC-04 | Private circle/group events public; outsiders can RSVP | V probe P4; `social.ts:563-605` | Circles | Home addresses of private gatherings exposed | "Circles are invisible" false | Events lack membership filter | High | S | Filter list/RSVP/attendees/search by membership/visibility | — |
| SEC-08 | Dating, matchmaking, weddings, experts enabled by default; flags not enforced server-side | C `seed.ts:44-53`; `requireFeature` only in circles/play | Platform | Unmoderated dating/marriage features at launch | Safety/legal exposure; diluted product | Flag system half-enforced | Medium (High consequence) | M | Default off; `requireFeature` in every handler; nav driven by `/features` | — |
| QA-01 | Privacy regression tests are ineffective | V `social.test.ts:185,80-118` | QA | — | Defects above shipped with green CI | Assertions check key names, not ids | High | S | Add "no real id/handle/name in any non-author response" tests for pen-name content and game rounds | SEC-01..04 fixes |

## P1 — Must fix before public launch

| ID | Description | Evidence | Area | User impact | Business impact | Technical impact | Sev. | Cx | Recommended action | Depends on |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-05 | MFA can be disabled via `/mfa/setup` without password | V probe P5; `auth.ts:245` | Auth | Account takeover persistence | Security incident risk | Missing re-auth | Medium | XS | Refuse while enabled or require password; notify | — |
| SEC-06 | Pen-name posts tied to real profile visibility and follow graph; following-mode leak | C `social.ts:45-61,297-304` | Thought Drops | Anonymity set = your followers | Trust | Visibility model | Medium | M | Treat pen-name posts as unlinked; exclude from following mode | SEC-01 |
| SEC-07 | Reset/verify links stored plaintext in `email_outbox` forever | C `notify.ts:76-85` | Auth/Ops | Takeover if DB read access leaks | Breach blast radius | No retention | Medium | S | Blank/purge after send | TD-10 |
| SEC-09 | Compose defaults to development → unauthenticated dev mailbox | C `docker-compose.yml`, `auth.ts` | Ops | Takeover if compose is exposed | — | Unsafe default | Medium | XS | Auth-gate mailbox; localhost binding | — |
| PRD-01 | Signed-in experience presents astrology, shop, learning and Labs modules alongside the core | V browser; `AppShell.tsx:22-53` | Product/UX | Confusion about what Nakshatra is | Activation and positioning | TD-01 | High | S (hide) | Navigation = Home, Identity, Thoughts, Circles, Play (+ optional Cosmic ID); remove cart/"experts, courses, products" search copy | SEC-08 |
| PRD-02 | Paid offers visible while payments are disabled | C `render.yaml`, `payments.ts` | Premium | Dead-end checkout (503) | Lost trust | — | Medium | XS | Hide or mark "coming soon" when payments unavailable | — |
| DEF-01 | Gifted report generation fails inside payment webhook (500; payment stuck) | V probe P7a; `commerce.ts:74-79` | Premium | Money taken, nothing delivered (once payments live) | Refund/chargeback cost | Side effect in critical transaction | High (when live) | S | Generate reports after commit / lazily on first open; validate gift prerequisites at checkout | Before enabling payments |
| DEF-02 | Gift to non-member delivered to buyer | V probe P7b; `commerce.ts:74` | Premium | Recipient never receives gift | Support load | — | Medium | S | Hold gift entitlement by email; claim on signup | Before enabling payments |
| DEF-05 | Provider success after order auto-cancel is ignored, no refund | C `scheduler.ts:34-55`, `payments.ts:20-31` | Payments | Charged without delivery | Chargebacks | State machine gap | Medium | S | On late success: fulfil if possible or auto-refund; alert | Before enabling payments |
| DEF-04 | Straight-lined answers → "Clear match"; 24% of random answers → one archetype | V probe P9 | Identity Studio | Misleading reveal; less variety among friends | Weakens the core hook and Showdown games | Prototype calibration | Medium | S (detect) / M (calibrate with data) | Detect low-variance answers; adjust confidence; recalibrate once real data exists | Real responses |
| DEP-04 | Production SMTP not configured/verified | C `render.yaml` sync:false | Ops | Cannot verify email → cannot post | Activation blocked | — | High | XS–S | Provision provider, SPF/DKIM, send test | — |
| DEP-07 / TD-14 | No CI while `autoDeploy: true` | C | Ops | — | Broken deploys | — | High | XS–S | CI gate before merge | — |
| DEP-12 | Terms/Privacy describe the old astrology product; no grievance contact | C `misc.tsx:203-240` | Legal | Unclear rights | Compliance risk (DPDP) | — | Medium | S + legal review | Rewrite for current product; add contact/grievance officer | PRD-01 |

## P2 — High-value improvements

| ID | Description | Evidence | Area | User/business impact | Cx | Recommended action |
|---|---|---|---|---|---|---|
| PRD-03 | No share on the account-free result; share has no link/referral code; not tracked | C `studio.tsx`, `lib/cosmic.ts:149` | Growth | Viral loop broken at its first step | S | Add share on preview with a link carrying `?ref=`; emit `persona_shared` |
| PRD-04 | "Public" Thought Drops invisible to non-followers for default-private profiles | C `social.ts:50-53,301`; `thoughts.tsx:61` | Feed | New users' posts reach nobody | S | Either make public posts independent of profile visibility or explain and prompt |
| PRD-05 | Analytics gaps (acquisition, offer viewed, preview→signup, verify email, step drop-off) | C `09` §6 | Measurement | Cannot judge launch | S | Add events |
| PRD-06 | No re-engagement channel | C config `PUSH_PROVIDER=none` | Retention | Low return | M | Opt-in weekly circle digest email first |
| PRD-07 | Link previews: relative 1.3 MB `og:image`; no per-invite preview | C `index.html` | Growth | Poor WhatsApp previews | S | Absolute small OG image; server-render meta for `/c/join/*` and `/i/*` |
| SEC-10 | Event live URL protection ineffective | C | Social | — | S | With SEC-04 |
| SEC-11 | Signup enumeration | V | Auth | Minor | S | Generic response or accept |
| SEC-12 | Pen-name rename relabels history | C | Thought Drops | Linkability | S | Snapshot pen name per post |
| SEC-13 | Deletion leaves files/analytics ids | C | Privacy | Retention beyond policy | M | Delete blobs; null analytics ids |
| DEF-03 | Capped referrals rejected after 30 days despite "next month" promise | C `referrals.ts:60-77` | Referrals | Broken promise | XS | Check cap before window or extend window for capped referrals |
| DEF-10 | Assessment radios lack accessible names | V browser a11y tree | Accessibility | Screen-reader users | XS | Associate labels |
| TD-02/TD-03/TD-10/TD-11 | Session lookup on static files; boot-time migrations; retention; uploads in DB | C | Perf/Ops | Cold starts, quota | S–M | See `11` |
| QA-03/QA-04 | Untested games; no real-Postgres CI run | C | QA | Regressions | S | Add tests; CI job with `TEST_DATABASE_SCHEMA` |

## P3 — Later

SEC-14, SEC-15, SEC-16, SEC-17 (dependency update), SEC-18 (shared rate-limit store), TD-06/07/08/09/12/17/18/20, DEF-08, DEF-11, DEF-12, game rematch, i18n decision.

## Suggested sequencing (30 days)

| Week | Focus | Exit criterion |
|---|---|---|
| 1 | P0 privacy fixes (SEC-01..04) + regression tests (QA-01); MFA fix; flags off and enforced (SEC-08) | Probe re-run shows no leaks; non-core APIs return 404 when off |
| 2 | Narrow the signed-in product (PRD-01), hide paid offers (PRD-02), SMTP + CI + error monitoring, legal rewrite started | New user sees only the core; verification email arrives; CI gates `main` |
| 3 | Growth instrumentation and share loop (PRD-03/05/07), public-post visibility fix (PRD-04), scoring straight-lining guard (DEF-04) | Funnel events visible in admin; share from preview carries attribution |
| 4 | Closed beta with friend groups; retention digest experiment (PRD-06); backups and retention jobs | Measured: preview→signup, share rate, invite acceptance, circle activation, week-1 return |

Payments-related fixes (DEF-01/02/05) are required **before** enabling Razorpay, not before a free beta.
