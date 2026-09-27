#!/usr/bin/env bash
# Overlapping assign_vehicle_to_driver calls (T4c). Uses audit_rls + JWT, not superuser.
set -euo pipefail
DB="${WORKOPS_AUDIT_PG_DATABASE:-workops_audit}"
ADMIN="a0000000-0000-4000-8000-000000000011"
DA="a0000000-0000-4000-8000-000000000201"
DB2="a0000000-0000-4000-8000-000000000202"
V1="a0000000-0000-4000-8000-000000000601"
export PGPASSWORD="${WORKOPS_AUDIT_PG_PASSWORD:-audit_rls_test}"

psql_q() {
  psql -q -h 127.0.0.1 -U audit_rls -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

# RLS hides assignments from audit_rls; verify invariants as superuser (same as test harness psqlAdmin).
psql_super() {
  sudo -u postgres psql -q -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

psql_q -c "
  UPDATE public.driver_vehicle_assignments
  SET ends_on = current_date, ended_by = '${ADMIN}'::uuid
  WHERE vehicle_id = '${V1}'::uuid AND ends_on IS NULL;
"

SESSION1="
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${ADMIN}';
SELECT public.assign_vehicle_to_driver('${DA}'::uuid, '${V1}'::uuid);
SELECT pg_sleep(4);
COMMIT;
"

SESSION2="
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${ADMIN}';
SELECT pg_sleep(0.4);
SELECT public.assign_vehicle_to_driver('${DB2}'::uuid, '${V1}'::uuid);
COMMIT;
"

START=$(date +%s%3N)
psql_q -c "$SESSION1" &
PID1=$!
sleep 0.5
set +e
psql_q -c "$SESSION2" > /tmp/t4c-challenger.out 2> /tmp/t4c-challenger.err
CHAL_EXIT=$?
set -e
wait "$PID1" || true
END=$(date +%s%3N)
ELAPSED=$((END - START))

OPEN_V=$(psql_super -tA -c "
  SELECT count(*)::text FROM public.driver_vehicle_assignments
  WHERE vehicle_id = '${V1}'::uuid AND ends_on IS NULL AND deleted_at IS NULL;
")
OPEN_DRIVERS=$(psql_super -tA -c "
  SELECT count(*)::text FROM (
    SELECT driver_id FROM public.driver_vehicle_assignments
    WHERE vehicle_id = '${V1}'::uuid AND ends_on IS NULL AND deleted_at IS NULL
    UNION
    SELECT driver_id FROM public.driver_vehicle_assignments
    WHERE driver_id IN ('${DA}'::uuid, '${DB2}'::uuid) AND ends_on IS NULL AND deleted_at IS NULL
  ) s;
")
DUP_V=$(psql_super -tA -c "
  SELECT CASE WHEN count(*) <= 1 THEN '0' ELSE '1' END
  FROM public.driver_vehicle_assignments
  WHERE vehicle_id = '${V1}'::uuid AND ends_on IS NULL AND deleted_at IS NULL;
")
DUP_D=$(psql_super -tA -c "
  SELECT CASE WHEN count(*) <= 1 THEN '0' ELSE '1' END FROM (
    SELECT driver_id FROM public.driver_vehicle_assignments
    WHERE driver_id IN ('${DA}'::uuid, '${DB2}'::uuid) AND ends_on IS NULL AND deleted_at IS NULL
  ) s;
")

echo "CHAL_EXIT=${CHAL_EXIT}"
echo "ELAPSED_MS=${ELAPSED}"
echo "OPEN_V=${OPEN_V}"
echo "OPEN_DRIVERS=${OPEN_DRIVERS}"
echo "DUP_V=${DUP_V}"
echo "DUP_D=${DUP_D}"
echo "CHAL_ERR=$(tr '\n' ' ' < /tmp/t4c-challenger.err | head -c 200)"

if [[ "$OPEN_V" != "1" || "$DUP_V" != "0" || "$DUP_D" != "0" ]]; then
  exit 1
fi
if [[ "$CHAL_EXIT" -ne 0 ]]; then
  : # challenger failed (lock timeout / conflict) — valid race outcome
elif [[ "$ELAPSED" -lt 3500 ]]; then
  exit 1
fi
