# Local setup

## Quick start (Windows) — one command, http://localhost:3000
```bash
npm run local
```
This runs `scripts/start-local.ps1`, which checks Node, installs dependencies if missing, creates `.env` from `.env.example` if absent, refuses to touch any other program using the port, rebuilds only when sources changed, starts the server **detached** (it keeps running after the terminal closes), waits for `/api/health`, and prints the URL. API and website are served by one process; migrations run automatically at startup; data lives in the embedded PostgreSQL at `.data/pglite` and persists across restarts.

Stop it:
```bash
npm run local:stop
```
Other port (e.g. if 3000 is busy): `powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Port 3100`. Foreground mode with live logs: add `-Foreground`. Logs: `.data/logs/server.log`.

First time only, create sample data (labelled "Sample data") and staff/demo accounts, whose sign-in details are written to `.data/dev-credentials.json`. Run it while the server is stopped (the embedded database allows one process at a time):
```bash
npm run db:seed
```

> **Why http://localhost:3000 used to fail (2026-10-24):** nothing in the project listened on 3000. Development used Vite on 5173 plus the API on 4000/4400, and no server was running. `npm run local` now serves everything on 3000. The launcher probes `127.0.0.1` because Windows PowerShell resolves `localhost` to `::1` first without falling back to IPv4 (browsers do fall back).

## Requirements
- Node.js **22.12 or newer** (verified with Node 24.16 on Windows 11).
- npm (bundled with Node). No database server is required: an embedded PostgreSQL (PGlite) is used unless `DATABASE_URL` is set.
- Optional: Microsoft Edge or Chrome for the Playwright browser tests; Docker Desktop (with WSL 2 on Windows) for the container setup.

## First run (development)
```bash
npm ci
```
```bash
cp .env.example .env
```
Edit `.env` if you need to; every value has a working local default. Then seed sample data (clearly labelled "Sample data" in the app) and staff accounts:
```bash
npm run db:seed
```
The generated sign-in details for the admin, moderator, sample expert, sample vendor and demo members are written to `.data/dev-credentials.json` (gitignored). They are never printed.

Start the API and web dev servers together:
```bash
npm run dev
```
- Web app: http://localhost:5173 (Vite, hot reload)
- API: http://127.0.0.1:4000 (proxied by Vite under `/api`)
- Emails (verification, password reset, invitations) appear at http://localhost:5173/dev/mailbox instead of being sent.
- Payments use the **development payment simulator**: checkout opens a page clearly marked as a simulation with "Simulate successful/failed payment" buttons. No money moves.

### If port 4000 is taken
Run the API on another port and point the Vite proxy at it:
```bash
PORT=4400 npm run dev:api
```
```bash
NAKSHATRA_API=http://127.0.0.1:4400 npm run dev:web
```
(The repository's `.claude/launch.json` already does this because another local project uses port 4000 on the development machine.)

## Production-like local run
```bash
npm run build
```
```bash
npm start
```
Serves the built app and API from one process on http://127.0.0.1:4000. With `NODE_ENV=production` you must set `APP_SECRET` (≥ 32 chars), `PAYMENT_PROVIDER=none` or Razorpay credentials, and `MAIL_TRANSPORT=smtp` with `SMTP_URL` (or `ALLOW_DEV_MAILBOX_IN_PRODUCTION=true` for a local trial); the dev mailbox route, payment simulator and demo seeding are disabled.

## Database commands
| Command | Effect |
|---|---|
| `npm run db:migrate` | Apply migrations (also done automatically at startup) |
| `npm run db:seed` | Reference data + sample data (refused in production) |
| `npm run db:backup` | PGlite: tarball in `./backups/`. PostgreSQL: prints the `pg_dump` command |
| `npm run db:restore -- <file>` | Restore a PGlite backup (stop the app first) |
| `npm run db:reset -- --yes` | Deletes the local development PGlite database and dev credentials (refuses PostgreSQL and production; run `db:backup` first if you want a copy) |
| `npm run db:generate` | Create a new migration after schema edits |

To use PostgreSQL instead of PGlite, set `DATABASE_URL=postgres://<user>:<password>@<host>:5432/nakshatra` in `.env`.

## Quality checks
```bash
npm run typecheck
```
```bash
npm run lint
```
```bash
npm test
```
```bash
npm run audit:secrets
```
```bash
npm run test:e2e
```
`test:e2e` builds the web app, starts an isolated server with a throwaway database under `.data/e2e` on port 4410, and runs the Playwright journeys in installed Microsoft Edge (`E2E_CHANNEL=chrome` or `chromium` to change).

To run the integration suite against real PostgreSQL, set `TEST_DATABASE_URL` to a server URL whose user can create databases; each test file creates and drops its own database.

## Exploring the app
1. Open http://localhost:5173 and choose **Get started**, or sign in with an account from `.data/dev-credentials.json`.
2. Verify your email from http://localhost:5173/dev/mailbox.
3. Onboarding: enter a birth date, time and place → **Reveal my Cosmic ID** (3D identity; toggle 2D).
4. Explore Today, Chart, Calendar (Panchang, festivals, muhurat), Journey and Rewards.
5. Bonds: invite another account (open a private window and sign up a second user).
6. Dating, Matchmaking (with Family Bridge), Experts (book a sample expert, pay with the simulator), Learn (free sample course with quizzes), Shop (sample products; reports are real generated documents), Weddings (projects, vendors, quotations).
7. Sign in as the admin account and open `/admin` for moderation, refunds, content versions, analytics (WMCU) and the audit log.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `EADDRINUSE :4000` | Another process uses the port; see "If port 4000 is taken". |
| `Invalid configuration: APP_SECRET…` | Production mode needs `APP_SECRET`. |
| PGlite "database is locked" | Only one process can open `.data/pglite`; stop other dev servers. |
| 3D scenes show 2D cards | WebGL is disabled or unavailable in your browser; the 2D views are complete equivalents. |
