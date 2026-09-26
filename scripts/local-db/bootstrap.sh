#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="public.ecr.aws/supabase/postgres:17.6.1.143"
CONTAINER="${WORKOPS_AUDIT_PG_CONTAINER:-workops-audit-pg}"
PORT="${WORKOPS_AUDIT_PG_PORT:-54322}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not available" >&2
  exit 1
fi

docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -p "${PORT}:5432" \
  "$IMAGE" >/dev/null

echo "Waiting for Postgres..."
for _ in $(seq 1 60); do
  if PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -c \
  'ALTER SCHEMA storage OWNER TO postgres;' >/dev/null 2>&1 || true

PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres \
  -f "$ROOT/scripts/local-db/storage-stub.sql" >/dev/null

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "Applying $(basename "$f")..."
  PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

if [[ -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql" ]]; then
  echo "Applying 00028 (PR #34)..."
  PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/00028_second_user_org_bootstrap.sql" >/dev/null
fi

PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres \
  -f "$ROOT/scripts/local-db/seed-audit-fixtures.sql" >/dev/null

if [[ -f "$ROOT/scripts/local-db/seed-invoice-lifecycle.sql" ]]; then
  echo "Seeding invoice lifecycle fixtures..."
  PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -f "$ROOT/scripts/local-db/seed-invoice-lifecycle.sql" >/dev/null
fi

PGPASSWORD=postgres psql -h 127.0.0.1 -p "$PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_rls') THEN
    CREATE ROLE audit_rls LOGIN PASSWORD 'audit_rls_test' NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO audit_rls;
    GRANT authenticated TO audit_rls;
  END IF;
END $$;
SQL

echo "Local audit DB ready on 127.0.0.1:${PORT}"
