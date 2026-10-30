#!/bin/sh
set -eu
export PATH="$PWD/node_modules/.bin:$PATH"
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${APP_SECRET:?APP_SECRET is required}"
: "${AEO_PUBLIC_URL:?AEO_PUBLIC_URL must be the public HTTPS origin}"
case "$AEO_PUBLIC_URL" in https://*) ;; *) echo "Production requires an HTTPS public origin" >&2; exit 1;; esac
node scripts/liekan-schema-check.mjs --migrations-only --allow-pending
node scripts/check-db.js
node scripts/liekan-migrate.mjs
node scripts/aeo/migrate.mjs
node scripts/update-tracker.js
# Deliberately omit upstream automatic demo seeding for the AEO customer service.
exec node server.js
