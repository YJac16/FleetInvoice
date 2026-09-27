#!/usr/bin/env bash
set -euo pipefail
DB="${WORKOPS_AUDIT_PG_DATABASE:-workops_audit}"
ORG="a0000000-0000-4000-8000-000000000001"
ADMIN="a0000000-0000-4000-8000-000000000011"
DRIVER="a0000000-0000-4000-8000-000000000202"
PATH_A="${ORG}/drivers/${DRIVER}/race-a.jpg"
PATH_B="${ORG}/drivers/${DRIVER}/race-b.jpg"

run_one() {
  local path="$1"
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -q -tA -c "
    BEGIN;
    SET ROLE service_role;
    SELECT public.register_compliance_document(
      '${ADMIN}', '${ORG}', 'driver', '${DRIVER}', 'driver_licence', 'single',
      '${path}', 'race.jpg', 'image/jpeg', 200, 'race', 'admin', 'accepted'
    );
    COMMIT;
  " >/dev/null
}

run_one "$PATH_A" &
pid1=$!
run_one "$PATH_B" &
pid2=$!
wait "$pid1" || true
wait "$pid2" || true

count=$(sudo -u postgres psql -d "$DB" -tA -c "
  select count(*) from public.driver_documents
  where driver_id = '${DRIVER}' and doc_type = 'driver_licence' and is_current and deleted_at is null;
")

if [[ "$count" == "1" ]]; then
  echo "concurrent register: exactly one current row"
  exit 0
fi
echo "expected 1 current row, got ${count}"
exit 1
