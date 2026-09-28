#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${WORKOPS_AUDIT_PG_PORT:-5432}"
export PGHOST=127.0.0.1
export PGPORT="$PORT"

if command -v pg_ctlcluster >/dev/null; then
  sudo pg_ctlcluster 16 main start 2>/dev/null || true
fi

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
  if [[ "$base" == 00052_* ]]; then
    echo "Skipping $base (applied in test)..."
    continue
  fi
  echo "Applying $base..."
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$f"
done

if [[ -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql" ]]; then
  sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql"
fi

sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -f "$ROOT/scripts/local-db/seed-audit-fixtures.sql"

sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_rls') THEN
    CREATE ROLE audit_rls LOGIN PASSWORD 'audit_rls_test' NOBYPASSRLS;
  END IF;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
END $$;
SQL

node "$ROOT/tests/db/migration-00052-security.test.mjs"
