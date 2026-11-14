#!/usr/bin/env bash
# Starts a throwaway LOCAL Nakshatra for the shoot: its own embedded database, payments off, mail kept in the dev
# mailbox. Nothing here touches a hosted database. Usage: film/launch/scripts/local-app.sh [--fresh]
set -euo pipefail
cd "$(dirname "$0")/../../.."
export NODE_ENV=development PORT="${PORT:-4500}" HOST=127.0.0.1 APP_ORIGIN="http://localhost:${PORT:-4500}"
export PGLITE_DIR=.data/film-pglite UPLOAD_DIR=.data/film-uploads
export PAYMENT_PROVIDER=none PAYMENTS_ENABLED=false MAIL_TRANSPORT=dev_mailbox SEED_DEMO_DATA=false
unset DATABASE_URL
if [ "${1:-}" = "--fresh" ]; then rm -rf .data/film-pglite .data/film-uploads; fi
[ -f dist/server/main.js ] || npm run build
node dist/server/seed-cli.js
exec node --enable-source-maps dist/server/main.js
