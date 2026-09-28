#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export WORKOPS_SKIP_MIGRATION_PREFIX=00052
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null
node "$ROOT/tests/db/migration-00052-security.test.mjs"
