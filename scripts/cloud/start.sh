#!/usr/bin/env bash
#
# Cloud Agent start phase: per-boot reconciliation of runtime state.
# Idempotent, tolerates restarts, checks readiness, then returns.
# The foreground dev server lives in `terminals`; this script only brings up
# the supporting services (Postgres + the local Neon HTTP proxy) and applies
# the schema/seed so the app is immediately usable.
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -f .env.local ] || cp scripts/cloud/dev.env.local .env.local
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

PROXY_PORT="${NEON_PROXY_PORT:-4444}"
PROXY_LOG="/tmp/neon-local-proxy.log"

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# 1. Start the PostgreSQL cluster (no-op if already running) and wait for it.
sudo pg_ctlcluster 16 main start 2>/dev/null || true
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 || {
  echo "[start] Postgres did not become ready" >&2
  exit 1
}

# 2. Ensure the dev role password and database exist.
sudo -u postgres psql -tAc "ALTER USER postgres PASSWORD 'postgres';" >/dev/null
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='timesheet'" \
  | grep -q 1 || sudo -u postgres createdb timesheet

# 3. Apply the schema. drizzle-kit connects to Postgres directly (no proxy).
npm run db:push

# 4. Start the local Neon HTTP proxy as a background service (idempotent).
#    The app and the seed step below reach Postgres through it.
if port_open "$PROXY_PORT"; then
  echo "[start] neon proxy already listening on 127.0.0.1:$PROXY_PORT"
else
  echo "[start] starting neon proxy on 127.0.0.1:$PROXY_PORT"
  setsid bash -c 'set -a; . ./.env.local; set +a; exec node scripts/neon-local-proxy.mjs' \
    >"$PROXY_LOG" 2>&1 </dev/null &
  for _ in $(seq 1 30); do
    port_open "$PROXY_PORT" && break
    sleep 1
  done
fi
port_open "$PROXY_PORT" || {
  echo "[start] neon proxy did not become ready (see $PROXY_LOG)" >&2
  exit 1
}

# 5. Seed the admin user through the Neon HTTP path (idempotent).
npm run db:seed

echo "[start] ready: Postgres + Neon proxy up, schema applied, admin seeded"
