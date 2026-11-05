# 10 — Deployment Readiness

Nothing was deployed, and no infrastructure, DNS, environment or Supabase resource was changed.

## 1. What exists

| Item | State | Evidence |
|---|---|---|
| Dockerfile | Two-stage `node:22-bookworm-slim`; `npm ci` → `npm run build` → `npm prune --omit=dev`; runs as `node`; `HEALTHCHECK` on `/api/health`; ships `drizzle/` for boot-time migrations; installs `postgresql-client` (pg_dump) | `Dockerfile` |
| Render blueprint | Free Docker web service, Singapore, `autoDeploy: true` from `main`, health check `/api/health`; env: `NODE_ENV=production`, `TRUST_PROXY=1`, generated `APP_SECRET`, `DATABASE_SCHEMA=nakshatra`, `DATABASE_POOL_MAX=5`, `PAYMENT_PROVIDER=none`, `MAIL_TRANSPORT=smtp`, `STORAGE_DRIVER=database`; `DATABASE_URL`, `DATABASE_CA_CERT`, `SMTP_URL`, `MAIL_FROM` are `sync: false` (entered in the dashboard) | `render.yaml` |
| Production guards | Boot refuses: missing `APP_SECRET`, dev payment simulator, dev mailbox, Razorpay without all three secrets, SMTP transport without `SMTP_URL` | `config.ts:63-82`; `deploy-config.test.ts` passes |
| TLS to Supabase | With `DATABASE_CA_CERT`, `rejectUnauthorized: true` and `sslmode` stripped from the URL so it cannot downgrade | `db/client.ts:postgresPoolOptions`; test passes |
| Schema isolation | Dedicated `nakshatra` schema, search_path per connection, RLS, revoked API roles | `04` §2 |
| Health | `/api/health` pings the DB; returns `degraded` (HTTP 200) when the DB is down | `app.ts:105-108` |
| Logs | pino JSON to stdout with redaction | `app.ts:25-27` |
| Docs | `docs/DEPLOY_RENDER_SUPABASE.md` step-by-step incl. custom domain and free-tier limits | — |
| docker-compose | Local Postgres 16 + app, **defaults to `NODE_ENV=development`** | SEC-09 |

## 2. Could it be deployed safely today?

**Technically it would boot and run** with the four dashboard secrets set. **It should not be opened to the public yet**, because of P0 privacy defects (SEC-01..04) and because dating/matchmaking/weddings/experts would go live unmoderated (SEC-08).

## 3. Blockers and exact actions

| ID | Blocker | Type | Precise action |
|---|---|---|---|
| DEP-01 | P0 privacy defects SEC-01..04 | Code | Fix and add regression tests (see `13`) |
| DEP-02 | Legacy modules live by default; flags unenforced | Code/config | Seed `dating`, `matchmaking`, `weddings`, `experts`, `stories` flags as `enabled: false`; add `requireFeature` to every handler in those modules; hide nav items from `/api/v1/features` |
| DEP-03 | Paid offers visible while `PAYMENT_PROVIDER=none` | Product | Hide offers (or show "coming soon") when `integrations.payments.status === 'unavailable'` |
| DEP-04 | SMTP not verified | External | Create a transactional email account, set `SMTP_URL` and `MAIL_FROM`, verify the sending domain (SPF/DKIM), send a test verification email |
| DEP-05 | Supabase project was **hibernated** during this audit; free projects pause after 7 days without DB activity | External | Upgrade or schedule activity; confirm health after wake; re-run the read-only checks in §4 |
| DEP-06 | Render free instance sleeps; cold starts run all migrations + reference seed; scheduler stops while asleep | Platform | Accept for a closed beta; for public launch use a paid instance or move migrations to a release step |
| DEP-07 | No CI; `autoDeploy: true` on `main` | Process | Add a CI gate (typecheck, lint, vitest, build) and require it before merge to `main` |
| DEP-08 | No error monitoring / alerting | Ops | Add an error tracker and an uptime check on `/api/health` that treats `status: degraded` as down (it currently returns HTTP 200) |
| DEP-09 | No backups on Supabase free (per repo docs: "no downloadable backups") | Ops | Schedule `pg_dump` of the `nakshatra` schema to off-site storage; test a restore |
| DEP-10 | Uploads stored as Postgres `bytea` in a 500 MB free database | Capacity | Move uploads to object storage before meaningful usage |
| DEP-11 | Custom domain/DNS/APP_ORIGIN not configured | External | Follow `docs/DEPLOY_RENDER_SUPABASE.md` Part 5; set `APP_ORIGIN` so email links use the domain |
| DEP-12 | Legal pages (`misc.tsx:203-240`, updated 24 Oct 2026) still describe an astrology product ("Nakshatra computes astrological charts…"); they do not cover pen names, circles, games, rituals or referrals; Terms say 18+ applies to dating/matchmaking/consultations while signup requires 18+ for everyone; no grievance officer or contact address found (grep for grievance/DPDP/contact returned nothing) | Legal | Rewrite terms/privacy for the current product and have them reviewed for India's DPDP Act (birth data, pseudonymity, dating) |
| DEP-13 | `APP_SECRET` also derives the MFA seed encryption key | Ops | Document that rotating `APP_SECRET` invalidates enrolled authenticators |

## 4. Not verifiable in this audit
- Live Render service, its environment values and logs.
- Supabase: whether the `nakshatra` schema exists, its migration history, RLS/grants on the live tables, and whether the **22 legacy public tables** are untouched. Supabase MCP: project `Nakshatra` (`ap-southeast-1`) reported hibernated; `list_tables` timed out twice. The audit deliberately did not attempt to wake or restore it.
- HTTPS certificate issuance and DNS records.

## 5. Free-tier constraints that shape the product
| Constraint | Consequence |
|---|---|
| Render free: sleeps after inactivity, 512 MB RAM, shared CPU | First request after idle is slow; background email retries/reminders pause |
| Supabase free: 500 MB DB, pause after 7 days inactive, small session-pooler client limit | Uploads + analytics will exhaust storage; pool capped at 5 |
| No push provider | Retention loops depend on users remembering to open the app |
