#!/usr/bin/env bash
#
# Cloud Agent install phase: refresh durable, source-derived state.
# Idempotent; must terminate and must NOT start long-running processes.
set -euo pipefail
cd "$(dirname "$0")/../.."

# System dependency: PostgreSQL. Stable, so it is baked into the build snapshot.
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib
fi

# Node dependencies (exact, from the lockfile).
npm ci

# Local, non-secret dev env file (in-VM Postgres via the local Neon proxy).
if [ ! -f .env.local ]; then
  cp scripts/cloud/dev.env.local .env.local
fi

echo "[install] done"
