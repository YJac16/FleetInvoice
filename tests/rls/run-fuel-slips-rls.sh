#!/usr/bin/env bash
# Rebuilds the hosted-mimic local database (00001–00052 security + 00053 enums + 00054 fuel)
# and runs the fuel slip database tests (spec v2 §13). Set SKIP_BOOTSTRAP=1 to reuse
# an already-bootstrapped container.
#
# PR #45's 00052 is applied before 00053/00054 for grant ordering. If the security
# migration is not yet on main, it is fetched from origin/cursor/security-hardening-00052-7dfe
# for this test run only (never committed on the fuel PR branch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SEC_MIG="$ROOT/supabase/migrations/00052_security_hardening_anon_rpc_quota_rls.sql"
SEC_CLEANUP=0

if [[ ! -f "$SEC_MIG" ]]; then
  git show origin/cursor/security-hardening-00052-7dfe:supabase/migrations/00052_security_hardening_anon_rpc_quota_rls.sql \
    >"$SEC_MIG"
  SEC_CLEANUP=1
fi

cleanup() {
  if [[ "$SEC_CLEANUP" == "1" && -f "$SEC_MIG" ]]; then
    rm -f "$SEC_MIG"
  fi
}
trap cleanup EXIT

if [[ "${SKIP_BOOTSTRAP:-0}" != "1" ]]; then
  if docker info >/dev/null 2>&1; then
    bash "$ROOT/scripts/local-db/bootstrap.sh" >/tmp/fuel-slips-bootstrap.log 2>&1
  else
    sudo bash "$ROOT/scripts/local-db/bootstrap.sh" >/tmp/fuel-slips-bootstrap.log 2>&1
  fi || { tail -40 /tmp/fuel-slips-bootstrap.log; exit 1; }
fi

node "$ROOT/tests/rls/fuel-slips.test.mjs"
