#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export WORKOPS_SKIP_MIGRATION_PREFIX=00052
export WORKOPS_EXTRA_SKIP_MIGRATIONS="00060_supabase_audit_hardening_13_oct.sql"
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null

# Post-00051 baseline (00052 skipped above): snapshot → apply 00052 → rollback → diff
node "$ROOT/tests/db/00052-snapshot-rollback.test.mjs"
node "$ROOT/tests/db/migration-00052-security.test.mjs"
