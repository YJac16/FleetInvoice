#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export WORKOPS_SKIP_MIGRATION_PREFIX=00055
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null

node "$ROOT/tests/db/00055-snapshot-rollback.test.mjs"
node "$ROOT/tests/db/00055-index-rollback.test.mjs"
node "$ROOT/tests/db/migration-00055-advisor.test.mjs"
node "$ROOT/tests/db/migration-00060-rls-function-grants.test.mjs"
