#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${WORKOPS_AUDIT_PG_PORT:-54322}"

if ! command -v psql >/dev/null; then
  echo "PostgreSQL client not found" >&2
  exit 1
fi

# Ensure cluster is running (Ubuntu package install).
if command -v pg_ctlcluster >/dev/null; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
fi

export PGHOST=127.0.0.1
export PGPORT="$PORT"

# Dedicated database for audit/compliance tests (does not touch system DBs).
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'workops_audit' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS workops_audit;
CREATE DATABASE workops_audit OWNER postgres;
SQL

# Listen on custom port via unix socket + port forwarding is awkward; use default 5432
# unless PGPORT is already configured. For cloud VM we use default 5432.
if [[ "$PORT" != "5432" ]]; then
  echo "Note: native bootstrap uses port 5432 (set WORKOPS_AUDIT_PG_PORT=5432)" >&2
  PORT=5432
  export PGPORT=5432
fi

echo "Applying auth stub..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/auth-stub.sql"

echo "Applying storage stub..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/storage-stub.sql"

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "Applying $(basename "$f")..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$f"
done

if [[ -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql" ]]; then
  echo "Applying 00028..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql"
fi

echo "Seeding audit fixtures..."
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/seed-audit-fixtures.sql"

if [[ -f "$ROOT/scripts/local-db/seed-compliance-test-fixtures.sql" ]]; then
  echo "Seeding compliance test fixtures..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/seed-compliance-test-fixtures.sql"
fi

sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_rls') THEN
    CREATE ROLE audit_rls LOGIN PASSWORD 'audit_rls_test' NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO audit_rls;
    GRANT authenticated TO audit_rls;
  END IF;
  ALTER ROLE audit_rls WITH PASSWORD 'audit_rls_test';
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
  -- Service-role-only crons (migrations revoke these; bootstrap broad grant must not reopen)
  REVOKE EXECUTE ON FUNCTION public.enqueue_compliance_expiry_alerts() FROM PUBLIC, authenticated;
  REVOKE EXECUTE ON FUNCTION public.enqueue_compliance_renewals_digests(integer) FROM PUBLIC, authenticated;
  GRANT EXECUTE ON FUNCTION public.enqueue_compliance_expiry_alerts() TO service_role;
  GRANT EXECUTE ON FUNCTION public.enqueue_compliance_renewals_digests(integer) TO service_role;
END $$;
SQL

echo "Native audit DB ready: db=workops_audit host=127.0.0.1 port=${PORT}"
