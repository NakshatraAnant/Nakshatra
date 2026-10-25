# Deployment and operations

## Topology (recommended for launch)
```
Internet ─ HTTPS reverse proxy (Caddy/Nginx/managed LB, TLS, gzip)
            └─ Nakshatra app (node dist/server/main.js, 1+ instances, port 4000)
                 ├─ PostgreSQL 16 (managed, daily backups + PITR)
                 └─ Persistent volume or object storage for ./uploads
```
Run the in-process scheduler on exactly one instance (jobs are idempotent, but duplicate runs waste work). Uploads are on local disk today; multiple instances need a shared volume (or an object-storage adapter, not yet implemented).

## Build artefacts
`npm run build` produces:
- `dist/web/` — static SPA (hashed assets; serve with long cache except `index.html`).
- `dist/server/main.js` — API + static server; `dist/server/migrate-cli.js`; `dist/server/seed-cli.js`.
- `drizzle/` — SQL migrations (must ship with the server; applied at startup).

## Environment variables
| Variable | Required in production | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Secure cookies, no dev mailbox, no demo seed, simulator refused |
| `APP_SECRET` | yes (≥ 32 chars) | HMAC + MFA-secret encryption key. Rotation invalidates MFA enrolments and signed links |
| `APP_ORIGIN` | yes | Public `https://` origin, used in emails and invitations |
| `DATABASE_URL` | yes | PostgreSQL connection string (use TLS) |
| `HOST` / `PORT` | `0.0.0.0` / `4000` | |
| `TRUST_PROXY` | `1` behind one reverse proxy | Needed so per-IP rate limits and audit IPs use the real client address. Server keep-alive timeout is 65 s, above typical proxy idle timeouts |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | persistent path / 5 | |
| `PAYMENT_PROVIDER` | `razorpay` (or `none` to disable payments) | `dev_simulator` is refused in production |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | when Razorpay is enabled | Key id is public (sent to Checkout); secret and webhook secret never leave the server. In the Razorpay dashboard add a webhook to `https://<APP_ORIGIN>/api/v1/payments/webhook/razorpay` for `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed` |
| `MAIL_TRANSPORT`, `SMTP_URL`, `MAIL_FROM` | `smtp` + URL | `dev_mailbox` is refused in production (override `ALLOW_DEV_MAILBOX_IN_PRODUCTION=true` only for a local production-mode trial) |
| `LOG_LEVEL` | `info` | JSON logs to stdout (pino) with secret redaction |
| `SEED_DEMO_DATA` | `false` | Demo data is refused in production regardless |

## Docker
`Dockerfile` (multi-stage, Node 22, runs as `node`, healthcheck on `/api/health`) and `docker-compose.yml` (app + `postgres:16-alpine` with a named volume, app bound to `127.0.0.1:4000`).
```bash
cp .env.example .env
```
Set `APP_SECRET` and `POSTGRES_PASSWORD` in `.env`, then:
```bash
docker compose up --build
```
Optional sample data (local mode only):
```bash
docker compose exec app node dist/server/seed-cli.js
```
Compose runs the app in local mode (`NODE_ENV=development`) so the labelled payment simulator and mailbox work; set `COMPOSE_NODE_ENV=production`, `PAYMENT_PROVIDER=razorpay` (with keys) or `none`, and `MAIL_TRANSPORT=smtp` with `SMTP_URL` for a production-mode container.

**Verification status:** `docker compose config` validates. The image build and container run could not be executed on the development machine because Docker Desktop's engine requires WSL 2, which is not installed there (Docker Desktop started but its Linux engine never became available). See RELEASE_READINESS_REPORT.md.

## Release procedure
1. `npm ci && npm run typecheck && npm run lint && npm test && npm run audit:secrets && npm run test:e2e`.
2. `npm run build`.
3. Back up the database (`pg_dump -Fc`).
4. Deploy the new `dist/` + `drizzle/` + `node_modules` (production deps) or the Docker image.
5. Start one instance; migrations run before the server listens. Watch logs for `Nakshatra API listening`.
6. Check `GET /api/health` → `{"status":"ok", "dbOk": true}` and `GET /api/v1/integrations` (shows payments/email/video status and `aiFeatures: "none"`).
7. Roll the remaining instances.

Rollback: redeploy the previous artefact. Migrations are additive, so the previous version keeps working against the newer schema; if a migration must be reverted, restore the pre-release backup.

## Health, logs and monitoring
- `GET /api/health` — liveness + DB ping (`status: ok | degraded`).
- Logs: pino JSON (request id, method, URL, status, response time). Cookies, authorization headers, passwords and tokens are redacted.
- Client errors: the SPA reports uncaught errors and WebGL failures as `client_error` events; visible per day in Admin → Analytics.
- Audit trail: Admin → Audit log.
- Suggested alerts: health not ok for 2 min; 5xx rate > 1%; payment webhook signature failures; refund failures; scheduler errors.

## Backups and restore
- PostgreSQL: daily `pg_dump -Fc` plus provider PITR; test a restore monthly into a scratch database (`pg_restore --clean -d …`).
- Uploads: snapshot the volume daily.
- Embedded PGlite (single-machine installs only): `npm run db:backup` / `npm run db:restore -- <file>`.

## Operational runbooks
| Situation | Action |
|---|---|
| User requests data export | They self-serve in Settings → Data; support can see requests in Admin → Privacy requests |
| User requests deletion | Self-serve (password + typed confirmation) or Admin → Users → Delete account (requires `users.manage`, reason recorded) |
| Payment captured but booking/order not updated | Check `payment_events` for the provider event; replay the webhook from the provider dashboard (idempotent) |
| Refund request | Admin → Refunds & disputes → Approve/Reject with note |
| Expert payout | Admin → Payouts → Generate records for a period → transfer outside Nakshatra → Mark paid with reference |
| Abuse report | Admin → Moderation (priority queues: dating safety first) |
| Interpretation text correction | Admin → Interpretation content → Edit → Publish new version |

## Development-only features and how they are disabled in production
| Feature | Guard |
|---|---|
| Payment simulator | `loadConfig` throws if `NODE_ENV=production` and `PAYMENT_PROVIDER=dev_simulator` |
| `/api/v1/dev/mailbox` | Route registered only when not production and `MAIL_TRANSPORT=dev_mailbox` |
| Demo seed | `seed-cli` skips demo data in production |
| Dev fallback `APP_SECRET` | Refused in production |
