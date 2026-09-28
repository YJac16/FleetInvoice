#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export WORKOPS_SKIP_MIGRATION_PREFIX=00055
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null

# Mirror hosted PostgREST: anon may SELECT public tables (RLS filters rows).
sudo -u postgres psql -d workops_audit -v ON_ERROR_STOP=1 -c \
  "GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;"

node "$ROOT/tests/db/00055-snapshot-rollback.test.mjs"
node "$ROOT/tests/db/migration-00055-advisor.test.mjs"
