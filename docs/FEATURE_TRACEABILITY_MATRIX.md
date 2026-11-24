# Feature traceability matrix

Statuses: `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED` (code exists), `TESTED` (automated test passes at API/unit level), `VERIFIED` (acceptance criteria demonstrated end-to-end in the real UI by a browser test or documented manual inspection), `BLOCKED` (external dependency).

Evidence keys — **U**: `src/astro/*.test.ts` · **IC**: `tests/integration/core.test.ts` · **IJ**: `tests/integration/journeys.test.ts` · **E-x**: `e2e/x-*.spec.ts` · **SM**: `e2e/smoke.spec.ts` · **MB**: `e2e/mobile.spec.ts` · **RS**: `e2e/resilience.spec.ts`.

_Last evidence update: 2026-10-24 (final runs: 117 unit/integration tests, 20/20 browser tests). See RELEASE_READINESS_REPORT.md for the run log._

## Accounts & onboarding
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Signup (18+, terms) | auth.ts | auth.tsx SignUp | IC, E-a | VERIFIED |
| Email verification | auth.ts + dev mailbox | VerifyEmail | IC, E-a | VERIFIED |
| Sign in / out, sessions | auth.ts | SignIn, AppShell | IC, E-a | VERIFIED |
| Password reset | auth.ts | ForgotPassword, ResetPassword | IC | TESTED |
| TOTP MFA | auth.ts | Settings → Security | IC | TESTED |
| Per-account login throttle | auth.ts | error message | IC | TESTED |
| Device sessions list/revoke | auth.ts | Settings → Security | SM (renders) | IMPLEMENTED |
| Onboarding (birth data, place search, consent, interests) | profile.ts | Onboarding, BirthForm, PlaceSearch | E-a, MB | VERIFIED |
| Unknown / uncertain birth time handling | astro time.ts | BirthForm notice, badges | U, IC | TESTED |
| DST gap/fold choice | time.ts | BirthForm | U | TESTED |

## Cosmic ID & profile
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Cosmic ID six layers from real chart | identity.ts, astro.ts | identity.tsx | E-a (page vs API), IC | VERIFIED |
| Interpretations with factor + version, save insight | astro.ts | LayerPanel | E-a | VERIFIED |
| Saved insights list, notes, remove | astro.ts | journey.tsx SavedInsights | E-a (list) | VERIFIED |
| 3D Cosmic ID + 2D card + toggle | — | three/scenes.tsx | E-a, RS | VERIFIED |
| Customise theme/emblem | profile.ts | CustomiseDialog | SM | IMPLEMENTED |
| Share card (PNG) | — | ShareDialog | — | IMPLEMENTED |
| Public profile + field visibility | profile.ts | PublicProfile, Settings → Privacy | IC, E-i | VERIFIED |

## Astrology engine & chart explorer
| Planet positions, nodes, ayanamsa, houses | astro/* | — | U (Meeus references) | TESTED |
| Nakshatra/pada, dashas, vargas, yogas, doshas, ashtakavarga, guna milan, gochar | astro/vedic/* | chart.tsx | U | TESTED |
| Western aspects, patterns, transits, progressions, solar return, synastry, composite | astro/western/* | chart.tsx | U | TESTED |
| Chart explorer (N/S Indian, wheel, 3D wheel, tables, snapshots) | astro.ts | chart.tsx | SM, RS | VERIFIED (renders, 3D fallback) |
| Reliability analysis | chart.ts | badges | U | TESTED |
| Numerology | numerology.ts | chart.tsx | U | TESTED |
| Shadbala | — | — | — | NOT_STARTED (documented omission) |

## Daily, calendar, journey
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Daily briefing, ritual, reflection, lesson | journey.ts, content | today.tsx | IC, SM | TESTED |
| Panchang day detail | astro.ts | calendar.tsx | U, IC, SM | TESTED |
| Festivals by year/location | festivals.ts | calendar.tsx | U (11 dated references), SM | TESTED |
| Muhurat finder with rule checks | muhurat.ts | calendar.tsx | U, SM | TESTED |
| ICS export | astro.ts | calendar | IC | TESTED |
| Journey timeline + 3D path | astro.ts | journey.tsx | SM, RS | VERIFIED (renders, fallback) |
| Wrapped recap | journey.ts | WrappedPage | SM | IMPLEMENTED |

## Gamification
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| XP ledger idempotent; levels | rewards.ts | RewardsPage | IJ-H, concurrent XP test, E-c | VERIFIED |
| Achievements (3D medallions) | rewards.ts | RewardsPage | E-c ("First Lesson" earned once) | VERIFIED |
| Challenges incl. festival seasons | rewards.ts | RewardsPage | IJ-H | TESTED |
| Streaks / check-ins | journey.ts | Today | IJ-H | TESTED |
| Collectibles | rewards.ts | RewardsPage | SM | IMPLEMENTED |

## Bonds
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Invite (handle/link), accept, decline | bonds.ts | bonds.tsx | IJ-B, E-b | VERIFIED |
| Private Bond with permission | bonds.ts | NewBond dialog | IJ-B | TESTED |
| Compatibility dimensions + Guna Milan | compatibility.ts | BondDetail | U, E-b | VERIFIED |
| Share summary link; revoked on revoke | bonds.ts | ShareDialog | E-b | VERIFIED |
| Revoke access / delete | bonds.ts | BondDetail | E-b, E-i | VERIFIED |
| Notes & milestones | bonds.ts | Together tab | IJ-B | TESTED |
| 3D constellation + 2D | — | BondsConstellation | SM, RS | VERIFIED (renders, fallback) |

## Community & messaging
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Posts, polls, comments, reactions, saves | social.ts | social.tsx | IJ (social) | TESTED |
| Follows & requests, blocks, mutes | social.ts | social.tsx | IJ (social) | TESTED |
| Groups, events, RSVP | social.ts | GroupsPage, EventsPage | IJ, SM | TESTED |
| Feed ranking with explanations | ranking.ts | FeedPage | IJ | TESTED |
| Reporting + moderation queue | social.ts, admin.ts | ReportDialog, Admin | IJ, E-d (report) | VERIFIED |
| Messaging (requests, read, attachments, closed) | messaging.ts | messages.tsx | IJ-D, E-d | VERIFIED |

## Dating
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Profile (18+, verified email), preferences | dating.ts | DatingProfileEditor | IJ-D, E-d | VERIFIED |
| Discovery with mutual filters + explanation | dating.ts, ranking.ts | DatingHome | IJ-D, E-d | VERIFIED |
| Like/pass, match, chat | dating.ts | DatingHome, Conversation | IJ-D, E-d | VERIFIED |
| Chart insights only with mutual opt-in | dating.ts | Matches dialog | IJ-D | TESTED |
| Unmatch closes conversation | dating.ts | Matches | IJ-D, E-d | VERIFIED |
| Verification selfie (human review) | dating.ts, admin.ts | editor, Admin | IJ | TESTED |

## Matchmaking & Family Bridge
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Profile, suggestions, shortlist, connections, stages | matchmaking.ts | matchmaking.tsx | IJ (matchmaking) | TESTED |
| Kundli with mutual chart consent | matchmaking.ts | ConnectionDetail | IJ | TESTED |
| Family invitations, per-capability permissions, revoke | matchmaking.ts | FamilyBridge, FamilyAccept, FamilyView | IJ | TESTED |

## Experts
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Expert onboarding, credentials, verification | experts.ts, admin.ts | ExpertDashboard, Admin | IJ-E, SM | TESTED |
| Services; voice/video shown unavailable | experts.ts | ExpertProfilePage | IJ-E | TESTED |
| Availability (rules/exceptions, time zones) | experts.ts | BookingDialog | IJ-E, E-e | VERIFIED |
| Booking + payment hold + dev payment | experts.ts, payments.ts | BookingDialog, DevPayment | IJ-E, E-e | VERIFIED |
| No double booking under concurrency | experts.ts (advisory lock) | — | concurrent booking test | TESTED |
| Start/complete only at the scheduled time | experts.ts | BookingDetail | IJ-E (time-shifted), E-e (refusal shown) | TESTED |
| Cancellation + refund policy | experts.ts, payments.ts | BookingDetail | IJ-E, E-e | VERIFIED |
| Notes, reviews, disputes, payouts | experts.ts, admin.ts | BookingDetail, Admin | IJ-E | TESTED |

## Learning & creators
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Catalogue, enrol, lessons, progress | learning.ts | learn.tsx | IJ-C, E-c | VERIFIED |
| Quiz pass mark, answer key server-side | learning.ts | LessonPage | IJ-C, E-c | VERIFIED |
| Certificates + public verification | learning.ts | CertificateView | IJ-C | TESTED |
| Creator studio + editorial review | learning.ts, admin.ts | CreatorStudio, Admin | IJ, SM | TESTED |
| Paid course via commerce | commerce.ts | CoursePage | IJ-F | TESTED |

## Commerce & subscriptions
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Catalogue, search, sort, product detail, disclosures | commerce.ts | shop.tsx | IJ-F, E-f | VERIFIED |
| Variants, stock, server prices | commerce.ts | ProductPage, Cart | IJ-F, E-f | VERIFIED |
| Checkout, dev payment, order | commerce.ts, payments.ts | Cart, DevPayment, OrderDetail | IJ-F, E-f | VERIFIED |
| Refund request → admin approval → refunded | payments.ts, admin.ts | OrderDetail, Admin | IJ-F, E-f | VERIFIED |
| Webhook signature + idempotency | payments.ts | — | IC | TESTED |
| Discounts, gifts, returns, shipments | commerce.ts, admin.ts | Cart, Admin | IJ-F | TESTED |
| Generated reports (real documents) | reports.ts | ReportView, Library | IJ-F | TESTED |
| Nakshatra+ subscription, entitlements, cancel | commerce.ts | Settings → Subscription | IJ | TESTED |
| Seller studio + review | commerce.ts, admin.ts | SellerStudio | SM | IMPLEMENTED |
| 3D product viewer | — | ProductViewer3D | — | IMPLEMENTED (no product has a real model; not shown) |
| Razorpay adapter (orders, checkout, signed webhooks, refunds) | razorpay.ts, payments.ts | RazorpayPayment | `tests/integration/razorpay.test.ts` (fake Razorpay API) | TESTED; live verification BLOCKED (merchant account + keys) |

## Weddings
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Project, members with permissions, join links | weddings.ts | weddings.tsx | IJ-G, E-g | VERIFIED |
| Tasks, events, budget, guests, RSVP | weddings.ts | WeddingProject, Rsvp | IJ-G, E-g (tasks) | VERIFIED |
| Vendor discovery (verified only), inquiry, quotation, acceptance, milestone payment | weddings.ts | VendorPage, VendorDashboard | IJ-G, E-g | VERIFIED |
| Permission enforcement (budget/vendors hidden) | weddings.ts | tabs | IJ-G, E-g | VERIFIED |

## Notifications, search, support, legal
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| In-app notifications, read state | account.ts, notify.ts | NotificationsPage | IJ, SM | TESTED |
| Preferences, quiet hours, cap, unsubscribe | account.ts | Settings → Notifications | IJ, SM | TESTED |
| Email via dev mailbox / SMTP with retries | notify.ts | DevMailbox | E-a (dev mailbox), `tests/integration/smtp.test.ts` (real nodemailer → in-process SMTP server, 451 retry) | VERIFIED (dev mailbox); SMTP TESTED; real provider BLOCKED (credentials) |
| Global search, history, saved searches | account.ts | SearchPage | SM | IMPLEMENTED |
| Support tickets + staff replies | account.ts, admin.ts | SupportPage, TicketPage, Admin | SM | IMPLEMENTED |
| Appeals (independent moderator) | admin.ts | Settings → Appeals | IC | TESTED |
| Terms, Privacy (draft), Methodology | — | misc.tsx | SM | IMPLEMENTED (legal review pending) |
| Push notifications, video/voice | — | marked unavailable | — | BLOCKED (providers) |

## Privacy
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Visibility controls | profile.ts | Settings → Privacy | IC, E-i | VERIFIED |
| Consent records + birth-data withdrawal | account.ts | Settings → Privacy | IJ-I | TESTED |
| Data export JSON | account.ts | Settings → Data | IJ-I, E-i | VERIFIED |
| Account deletion with retention | account.ts | Settings → Data | IJ-I, E-i | VERIFIED |

## Administration
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| All 18 admin sections render for admins | admin.ts | admin.tsx | SM | VERIFIED |
| Admin APIs refuse members (403) | auth.ts | — | SM | VERIFIED |
| Users, roles, suspension, deletion | admin.ts | Users | IC, IJ | TESTED |
| Moderation, appeals, verification | admin.ts | Moderation, Appeals, Verification | IC, IJ | TESTED |
| Refunds via console | admin.ts | Refunds | E-f | VERIFIED |
| Interpretation versions, calc configs, templates, flags, settings | admin.ts | Content, Config, Templates, Flags | IJ | TESTED |
| Analytics (WMCU) | admin.ts | Analytics | IJ | TESTED |
| Audit log | admin.ts | Audit | IC | TESTED |
| Creator / seller applications → staff review → role | profile.ts, admin.ts | RoleGate, Admin → Verification | IJ (applications) | TESTED |
| Operational status (health + integrations) | app.ts | Admin overview | SM (admin sections) | VERIFIED |

## Platform / operations
| Feature | Backend | Frontend | Evidence | Status |
|---|---|---|---|---|
| Production build | Vite + esbuild | — | `npm run build` | VERIFIED |
| Fresh install from clean checkout | — | — | scratch copy `npm ci` (6 min 13 s) + build | VERIFIED |
| Production-mode smoke | config guards | — | clean copy, NODE_ENV=production: health, CSP/HSTS, Secure cookies, no mailbox/simulator, demo seed skipped | VERIFIED |
| PostgreSQL server | node-postgres | — | harness supports `TEST_DATABASE_URL` | BLOCKED (no PostgreSQL/Docker engine on this machine) |
| Docker image + compose | Dockerfile, compose | — | `docker compose config` | BLOCKED (Docker Desktop engine needs WSL 2, not installed) |
| Responsive / mobile | — | all pages | MB (Pixel 7: touch onboarding, nav, drawer, 0 px overflow on 14 routes) | VERIFIED |
| Reduced motion, WebGL off, context loss, nav leaks, keyboard | — | three/core.tsx | RS | VERIFIED |
| Accessibility (axe WCAG 2.1 A/AA, light + dark, 22 routes) | — | all pages | `e2e/a11y.spec.ts` | VERIFIED (0 serious/critical) |
| i18n Hindi | lib/i18n | partial | — | IMPLEMENTED (partial) |
