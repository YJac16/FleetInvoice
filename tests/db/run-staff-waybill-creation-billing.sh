#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null
# Local harness only: invoker RPCs call auth.uid(); production Supabase already grants this.
sudo -u postgres psql -d "${WORKOPS_AUDIT_PG_DATABASE:-workops_audit}" -v ON_ERROR_STOP=1 \
  -c "grant usage on schema auth to authenticated;"
node "$ROOT/tests/db/staff-waybill-creation-billing.test.mjs"
