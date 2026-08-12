#!/usr/bin/env bash
#
# Cloud Agent start phase: per-boot reconciliation of runtime state.
# Idempotent, tolerates restarts, checks readiness, then returns.
# Long-running processes (proxy, dev server) live in `terminals`, not here.
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -f .env.local ] || cp scripts/cloud/dev.env.local .env.local
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

# Start the PostgreSQL cluster (no-op if already running).
sudo pg_ctlcluster 16 main start 2>/dev/null || true

# Wait for Postgres to accept connections.
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 || {
  echo "[start] Postgres did not become ready" >&2
  exit 1
}

# Ensure the dev role password and database exist.
sudo -u postgres psql -tAc "ALTER USER postgres PASSWORD 'postgres';" >/dev/null
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='timesheet'" \
  | grep -q 1 || sudo -u postgres createdb timesheet

# Apply schema and seed the admin user (both idempotent).
npm run db:push
npm run db:seed

echo "[start] ready: Postgres up, schema applied, admin seeded"
