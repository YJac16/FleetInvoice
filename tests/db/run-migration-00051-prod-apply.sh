#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${WORKOPS_AUDIT_PG_PORT:-54322}"

if ! command -v psql >/dev/null; then
  echo "PostgreSQL client not found" >&2
  exit 1
fi

if command -v pg_ctlcluster >/dev/null; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
fi

export PGHOST=127.0.0.1
export PGPORT=5432

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'workops_audit' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS workops_audit;
CREATE DATABASE workops_audit OWNER postgres;
SQL

sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/auth-stub.sql"
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/storage-stub.sql"
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE workops_audit SET search_path TO public, extensions, storage, auth;"

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  base=$(basename "$f")
  if [[ "$base" == 00051_* ]]; then
    break
  fi
  echo "Applying $base..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$f"
done

echo "Installing production-shaped generate_driver_weekly_invoice (RETURNS invoices)..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
  -f "$ROOT/tests/db/fixtures/pre00051_generate_driver_weekly_prod_shape.sql"

echo "Applying 00051 (must not require DROP)..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/migrations/00051_invoice_period_inclusive_sunday_sast.sql"

node "$ROOT/tests/db/migration-00051-prod-apply.test.mjs"
