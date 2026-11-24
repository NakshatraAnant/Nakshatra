# 11 — Local Launch Guide

## Verified local setup (2026-11-06)
| Item | Value |
|---|---|
| URL | **http://localhost:4500** (single process: API + built website) |
| Health | http://localhost:4500/api/health → `{"status":"ok","database":"pglite"}` |
| Port | 4500 (3000 and 4000 are used by an unrelated "Atlas" app on this machine — left untouched) |
| Database | Embedded PostgreSQL (PGlite) at `.data/pglite`; no `DATABASE_URL` set; no production connection |
| Backup taken before new migrations | `.data/pglite-backup-before-0005-0006` |
| Payments | `PAYMENT_PROVIDER=none`, `PAYMENTS_ENABLED=false` (in `.env`; previous `.env` copied to `.data/env.backup-before-product-evolution`) |
| Email | `MAIL_TRANSPORT=dev_mailbox` — nothing is sent; read mail at http://localhost:4500/dev/mailbox (only from this machine) |
| Files | Local disk `./uploads` |
| Background jobs | In-process scheduler (email retries, reminders, gift expiry, retention) starts with the server |
| Modules | Launch scope applied: identity, Thought Drops, circles, games, rituals, progress, referrals, premium preview, optional astrology ON; community groups, messages, dating, matchmaking, experts, courses, marketplace, weddings OFF |

## Start
Build once after code changes:
```bash
npm run build
```
Start (Git Bash):
```bash
NODE_ENV=development PORT=4500 HOST=127.0.0.1 APP_ORIGIN=http://localhost:4500 node --enable-source-maps dist/server/main.js
```
PowerShell alternative using the existing launcher (it never stops other apps and refuses busy ports; not executed in this session — the verified start used the `app` configuration below, which runs the same command as above):
```bash
npm run local -- -Port 4500
```
Stop the launcher-started server:
```bash
npm run local:stop
```
In the Claude desktop app the same server is defined as the `app` configuration in `.claude/launch.json`.

Developer mode with hot reload (two ports, API 4400 + Vite 5173) remains available via the `api` and `web` launch configurations.

## Test accounts
Local seeded demo accounts are listed in `.data/dev-credentials.json` (local-only test values; not reproduced here). Or create an account at /signup and verify it via http://localhost:4500/dev/mailbox.

## Journeys verified in the browser on this build
Landing → account-free assessment (straight-lined answers show "Inconclusive") → share link → public `/s/:slug` page (signed out, per-link title/OG) → sign in → Home (vibe check-in, streak, next quest) → Progress (claim quest → celebration, XP, streak 1 day) → disabled legacy page (/dating → "switched off") → Shop preview (identity offers only, buying disabled). No console errors other than two from a deliberate server restart.

## Requires external configuration (not available locally)
SMTP provider (real email), payment provider (and `PAYMENTS_ENABLED=true`), push notifications, production database. Tests and e2e use the clearly-labelled payment simulator only — no real money.

## Reverting the local data change
Stop the server, then replace `.data/pglite` with `.data/pglite-backup-before-0005-0006` (the old build cannot read the new tables but does not need them).
