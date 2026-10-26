#!/usr/bin/env bash
# Runs every database / RLS test suite against a native local Postgres 16.
# Each suite rebuilds the throwaway `workops_audit` database from supabase/migrations.
# Used by CI (.github/workflows/ci.yml) and by `npm run test:db`.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export WORKOPS_AUDIT_PG_PORT=5432

suites=(
  tests/db/run-invoice-service-week.sh
  tests/db/run-driver-weekly-invoice.sh
  tests/db/run-pr-a-waybill-rate.sh
  tests/db/run-staff-waybill-creation-billing.sh
  tests/db/run-migration-00052-security.sh
  tests/db/run-migration-00055-advisor.sh
  tests/db/run-rollback-00061-00067.sh
  tests/rls/run-compliance-pr36.sh
  tests/rls/run-compliance-phase2.sh
  tests/rls/run-compliance-auth-boundary.sh
  tests/rls/run-admin-capture-rls.sh
  tests/rls/run-company-portal-phase1.sh
  tests/rls/run-driver-trip-privacy.sh
)

# These expect an already-bootstrapped database.
node_suites=(
  tests/db/driver-self-entry-invoice.test.mjs
  tests/db/driver-trip-audit-override.test.mjs
  tests/db/driver-trip-admin-enforcement.test.mjs
  tests/db/invoice-vat-number.test.mjs
)

failed=()

for suite in "${suites[@]}"; do
  echo "::group::${suite}"
  if ! bash "$ROOT/$suite"; then
    failed+=("$suite")
  fi
  echo "::endgroup::"
done

echo "::group::bootstrap for node suites"
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null || failed+=("bootstrap-native")
echo "::endgroup::"

for suite in "${node_suites[@]}"; do
  echo "::group::${suite}"
  if ! node "$ROOT/$suite"; then
    failed+=("$suite")
  fi
  echo "::endgroup::"
done

if ((${#failed[@]})); then
  echo "Failed database suites:"
  printf ' - %s\n' "${failed[@]}"
  exit 1
fi

echo "All database suites passed."
