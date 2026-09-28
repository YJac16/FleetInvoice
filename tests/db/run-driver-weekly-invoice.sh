#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null
sudo -u postgres psql -d "${WORKOPS_AUDIT_PG_DATABASE:-workops_audit}" -v ON_ERROR_STOP=1 \
  -c "grant usage on schema auth to authenticated;" >/dev/null
node "$ROOT/tests/db/driver-weekly-invoice.test.mjs"
