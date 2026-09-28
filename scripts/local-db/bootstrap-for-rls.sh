#!/usr/bin/env bash
# RLS isolation tests: Docker Supabase Postgres when available; else native workops_audit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if docker info >/dev/null 2>&1; then
  bash "$ROOT/scripts/local-db/bootstrap.sh"
  export WORKOPS_AUDIT_PG_PORT="${WORKOPS_AUDIT_PG_PORT:-54322}"
  export WORKOPS_AUDIT_PG_DATABASE=postgres
  unset WORKOPS_AUDIT_PG_NATIVE
else
  echo "Docker unavailable — using native Postgres bootstrap (workops_audit on 5432)" >&2
  bash "$ROOT/scripts/local-db/bootstrap-native.sh"
  if [[ -f "$ROOT/scripts/local-db/seed-invoice-lifecycle.sql" ]]; then
    sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
      -f "$ROOT/scripts/local-db/seed-invoice-lifecycle.sql" >/dev/null
  fi
  export WORKOPS_AUDIT_PG_PORT=5432
  export WORKOPS_AUDIT_PG_DATABASE=workops_audit
  export WORKOPS_AUDIT_PG_NATIVE=1
fi

exec env \
  WORKOPS_AUDIT_PG_PORT="$WORKOPS_AUDIT_PG_PORT" \
  WORKOPS_AUDIT_PG_DATABASE="$WORKOPS_AUDIT_PG_DATABASE" \
  ${WORKOPS_AUDIT_PG_NATIVE:+WORKOPS_AUDIT_PG_NATIVE=$WORKOPS_AUDIT_PG_NATIVE} \
  node "$ROOT/scripts/local-db/rls-isolation.test.mjs"
