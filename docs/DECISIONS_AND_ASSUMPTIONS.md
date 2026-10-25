# Decisions and assumptions

Each entry: decision — reason — consequence. Dates are when the decision was recorded.

## Product
1. **No AI anywhere in the product** (owner requirement). Rankings, daily content, compatibility and search use documented deterministic rules; `GET /api/v1/integrations` reports `aiFeatures: "none"`. Consequence: interpretations are limited to authored rule content (~versioned in `interpretation_content`).
2. **Compatibility shows dimensions, not a single score.** A single percentage implies prediction. Guna Milan's 36-point total is shown because it is the traditional output, with caveats.
3. **Astrology framed as cultural/interpretive practice.** Disclaimers on methodology, reports, compatibility and dating pages; no health, finance or certainty claims.
4. **Sample data is always labelled.** Sample experts, vendors and products carry `is_sample` and a visible "Sample data" badge; they exist only via `npm run db:seed` and are refused in production.
5. **Development payment simulator instead of fake success.** It signs the same webhook payloads as a real provider so the full state machine is exercised; every screen says no money moves; refused in production.
6. **Video and voice consultations are shown as unavailable** until a provider is integrated, instead of simulated calls. Chat consultations use in-app messaging.
7. **Hindi is partial.** Navigation, core UI and some interpretation content have Hindi; untranslated strings fall back to English. Recorded as a known limitation.
8. **Messaging uses polling** (React Query refetch) rather than WebSockets — simpler and adequate at launch scale.
9. **Tax is not calculated.** Prices are shown inclusive and GST invoicing is out of scope until a registered entity and tax adviser define it.

## Engineering
10. **Modular monolith (Fastify + React in one package).** Smallest operational footprint with clear module boundaries; can be split later along module files.
11. **Embedded PGlite for zero-dependency local runs; PostgreSQL for production.** Same SQL dialect and migrations. Consequence: PGlite serialises queries, so concurrency safety must not rely on it — the booking path uses an advisory lock and uniqueness constraints that also hold on PostgreSQL.
12. **Only the Lahiri ayanamsa.** Raman and KP definitions could not be verified to the same standard and were removed rather than approximated.
13. **Shadbala not implemented.** Omitted rather than approximated; listed in the API's `unsupported` array.
14. **Sessions are server-side (hashed tokens), not JWTs.** Immediate revocation on logout, password reset and suspension.
15. **CSRF double-submit token** in addition to SameSite=Lax cookies.
16. **Per-account login throttle** (8 failures / 15 min) added 2026-10-24 on top of per-IP limits.
17. **Booking creation takes a per-expert advisory transaction lock** (2026-10-24) so concurrent requests cannot double-book on PostgreSQL.
18. **3D is progressive enhancement** with complete 2D equivalents; WebGL context loss falls back to 2D (added 2026-10-24).
19. **Playwright uses the installed Microsoft Edge** (`channel: msedge`) to avoid downloading browser binaries on the development machine.
20. **e2e timeout 240 s per test.** Measured API latency is 10–30 ms; the long runs come from multi-user journeys and software-rendered WebGL in headless Edge. The timeout does not mask server slowness (verified by direct HTTP timing, see IMPLEMENTATION_STATUS.md).
21. **Dev port 4400 locally.** Port 4000 is used by another project on the development machine; the default remains 4000 and the Vite proxy reads `NAKSHATRA_API`.
22. **drizzle-kit dev-dependency advisory accepted** (moderate, dev server of an old bundled esbuild; not shipped).

## Assumptions (to confirm with the owner)
- Launch market is India first (INR pricing, Indian festivals and Panchang conventions, Razorpay as the intended provider).
- Original research report and MVP HTML were provided at build start (`Nakshatra_Master_Strategic_Market_Research_Report.docx`, `nakshatra_mvp.html` in the owner's Downloads folder) and informed the module list; they are not stored in the repository.
- Subscription prices (Nakshatra+ ₹199/month, ₹1,999/year) and expert commission (20%) are placeholders editable by admins.
- Legal entity details, support email and grievance officer (required under Indian IT Rules) are not yet known; legal pages are drafts.

## Added 2026-10-24 (later)
23. **Every account completes onboarding with a birth profile**, including staff, experts and vendors (unknown birth time is allowed). Personal pages are built around a calculated chart; sample staff/expert/vendor accounts are seeded with labelled sample birth data so they can sign in directly.
24. **Razorpay is the payment provider adapter** (India-first). Checkout signature is checked but only signed webhooks change payment state.
25. **SMTP via nodemailer with an outbox**; the dev mailbox is refused in production unless explicitly overridden for a local trial.
26. **Browser journeys run with reduced motion** (3D renders on demand) to keep headless software-WebGL from starving the test server; the full-motion 3D path has its own tests.
27. **Multi-user e2e specs close their extra contexts sequentially.** With always-on tracing, closing contexts holding software-WebGL pages took minutes (trace serialisation); leaving them open instead starved later tests of CPU. With traces recorded only on retry (#30) closes take seconds. Measured: Journey I runs in 19 s untraced vs ~90 s traced.
28. **Server keep-alive timeout 65 s and configurable `TRUST_PROXY`** so pooled clients/proxies never reuse a closing socket (observed as ECONNRESET in e2e) and per-IP limits use real client IPs behind a proxy.
29. **Grid children get `min-width: 0` globally** so wide tables scroll inside their wrappers instead of widening pages on phones (found by the mobile spec on /chart).
31. **Local launch is one process on http://localhost:3000** (`npm run local`). It serves the built SPA and API from `dist/`, runs detached so it survives the terminal, and starts up health-checked. Hot-reload development (`npm run dev`, Vite on 5173) remains for code changes.
32. **Blank environment values are treated as unset**, so a freshly copied `.env.example` works without editing.
30. **Playwright records traces only on the (single) retry of a failed test.** Retries are reported as "flaky", never silently absorbed. Always-on tracing made multi-user journeys 4–5× slower under software WebGL and pushed them past the per-test timeout during full runs.

## Added 2026-10-25 (product transformation)
33. **Cosmic ID archetype = dominant element × dominant modality of the sidereal chart** (12 archetypes, `src/astro/archetype.ts`). Uses the existing documented `elementSummary` weights; ties broken by Moon, then Lagna, then Sun sign. Ten historical names kept, "Moon Static" assigned to fixed air, "Silver Thread" added for earth × mutable. Presented as symbolic, never as psychology.
34. **Vedic layers have their own content pack (v2, `src/content/vedic.ts`)**; no Vedic body may equal a Western body (tested).
35. **Content upgrades are version-aware**: a code rule is installed when its version exceeds every stored version; older published rows are retired, never deleted; admin edits (higher versions) win.
36. **Account-free Cosmic ID** (`POST /api/v1/discover/cosmic-id`): same validation and 18+ rule as saved profiles, calculated in memory, nothing about the birth moment stored or logged; rate-limited.
37. **Anonymous page events** (`landing_viewed`, `cosmic_id_previewed`, `cosmic_id_card_downloaded`, `cosmic_id_preview_signup_clicked`) carry no identifiers or birth data; accepted only from a whitelist.
38. **Share cards never include birth date, time, place or planetary positions**; the sigil is rendered non-precise for export.
39. **Navigation puts identity and Bonds first; social, messages, dating, matchmaking, experts and weddings move to a collapsed "Nakshatra Labs" group.** All routes and data unchanged.
40. **The decorative 3D landing scene was replaced by a data-driven sigil** for a labelled fictional sample; other 3D scenes unchanged pending their own audit.
41. **Web build ignores the root .env** (`envDir: 'src/web'`) because the server's `NODE_ENV=development` produced a development React bundle; `manualChunks` is a function so no page preloads three.js.
42. **Report pages state what is already free and what the paid document adds.**
43. **Native share sheet only on touch devices**; desktop downloads the card.
