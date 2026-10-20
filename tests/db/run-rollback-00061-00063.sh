#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

SKIP_POST_00060=(
  00061_driver_trip_rls_privacy.sql
  00062_driver_self_entry_trips.sql
  00063_driver_trip_admin_audit_override.sql
  00064_driver_trip_admin_hardening.sql
  00065_driver_submit_assigned_vehicle.sql
  00066_admin_assign_vehicle_on_approve.sql
  00067_revoke_anon_driver_admin_rpcs.sql
)
export WORKOPS_EXTRA_SKIP_MIGRATIONS="${SKIP_POST_00060[*]}"

dump_function_grants() {
  local db="$1"
  local out="$2"
  sudo -u postgres psql -q -d "$db" -v ON_ERROR_STOP=1 -tA -c "
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' ||
      coalesce(
        (
          SELECT string_agg(grant_line, ',' ORDER BY grant_line)
          FROM (
            SELECT
              CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END
              || '=' || acl.privilege_type AS grant_line
            FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          ) grants
        ),
        ''
      )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
    ORDER BY 1;
  " >"$out"
}

GRANTS_REF="$(mktemp)"
GRANTS_TEST="$(mktemp)"
trap 'rm -f "$GRANTS_REF" "$GRANTS_TEST"' EXIT

relock_00055_internal_rpcs() {
  local db="$1"
  sudo -u postgres psql -q -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r record;
  v_internal text[] := array[
    'assert_staff_trip_driver',
    'enqueue_driver_notification',
    'recalculate_invoice_totals',
    'resolve_invoice_bill_to_company_id',
    'resolve_pay_rate',
    'resolve_staff_company_id',
    'set_staff_trip_status',
    'sync_staff_trip_invoice_line'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (v_internal)
  LOOP
    EXECUTE format(
      'revoke all on function public.%I(%s) from public, anon, authenticated',
      r.proname,
      r.args
    );
    EXECUTE format(
      'grant execute on function public.%I(%s) to service_role',
      r.proname,
      r.args
    );
  END LOOP;
END;
$$;
SQL
}

echo "Building main-at-00060 grant reference (skip 00061+)..."
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null
relock_00055_internal_rpcs workops_audit
dump_function_grants workops_audit "$GRANTS_REF"

echo "Bootstrap full stack, rollback 00061–00063, smoke checks..."
unset WORKOPS_EXTRA_SKIP_MIGRATIONS
bash "$ROOT/scripts/local-db/bootstrap-native.sh" >/dev/null

DB="${WORKOPS_AUDIT_PG_DATABASE:-workops_audit}"
export PGPASSWORD="${WORKOPS_AUDIT_PG_PASSWORD:-audit_rls_test}"
PGUSER="${WORKOPS_AUDIT_PG_USER:-audit_rls}"

ORG="a0000000-0000-4000-8000-000000000001"
ADMIN="a0000000-0000-4000-8000-000000000011"
DRIVER_USER="a0000000-0000-4000-8000-000000000012"
DRIVER_ROW="a0000000-0000-4000-8000-000000000201"
COMP="e5000000-0000-4000-8000-000000000002"
VEH="f5000000-0000-4000-8000-000000000001"

sudo -u postgres psql -q -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/rollback-restore-pre-driver-self-entry.sql"
sudo -u postgres psql -q -d "$DB" -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/rollback-00061-00063.sql"
relock_00055_internal_rpcs "$DB"

dump_function_grants "$DB" "$GRANTS_TEST"

PARITY_FAIL=0
while IFS= read -r ref_line; do
  [[ -z "$ref_line" ]] && continue
  sig="${ref_line%%|*}"
  ref_grants="${ref_line#*|}"
  test_line=$(grep -F "${sig}|" "$GRANTS_TEST" || true)
  if [[ -z "$test_line" ]]; then
    echo "FAIL grant-parity missing function after rollback: $sig"
    PARITY_FAIL=1
    continue
  fi
  test_grants="${test_line#*|}"
  if [[ "$ref_grants" != "$test_grants" ]]; then
    echo "FAIL grant-parity $sig main=[$ref_grants] rollback=[$test_grants]"
    PARITY_FAIL=1
  fi
done <"$GRANTS_REF"

if [[ "$PARITY_FAIL" -eq 0 ]]; then
  echo "PASS grant-parity function grants match main (00060)"
else
  exit 1
fi

WCL="e5000000-0000-4000-8000-000000000001"
sudo -u postgres psql -q -d "$DB" -v ON_ERROR_STOP=1 <<SQL
insert into public.companies (id, organisation_id, name, status)
values
  ('${WCL}', '${ORG}', 'WCL Trading CC', 'active'),
  ('${COMP}', '${ORG}', 'Springbok Atlas', 'active')
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
select '${ORG}', '${COMP}', 'Rollback smoke rate', 'trip', 'fixed', 440, date '2026-08-01'
where not exists (
  select 1 from public.rate_cards rc
  where rc.organisation_id = '${ORG}' and rc.company_id = '${COMP}' and rc.deleted_at is null
);

insert into public.vehicles (id, organisation_id, company_id, name, registration_number, vehicle_type, status)
values ('${VEH}', '${ORG}', '${COMP}', 'Rollback Van', 'RBK-001', 'van', 'active')
on conflict (id) do update set organisation_id = excluded.organisation_id, company_id = excluded.company_id;

update public.organisations
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('invoice_bill_to_company_id', '${WCL}')
where id = '${ORG}';
SQL

psql_auth() {
  local user_id="$1"
  local sql="$2"
  psql -q -h 127.0.0.1 -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 -tA <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '$user_id';
$sql
COMMIT;
SQL
}

TRIP=$(psql_auth "$ADMIN" "select public.backfill_staff_waybill(
  '$ORG'::uuid, '$DRIVER_ROW'::uuid, timestamptz '2026-09-24 10:00:00+02',
  'Rollback smoke route', 1, '$COMP'::uuid, null, null, null, '$VEH'::uuid
);")

AMOUNT=$(sudo -u postgres psql -q -d "$DB" -tA -c \
  "select unit_price::text from public.invoice_lines where trip_id = '$TRIP'::uuid;")

if awk -v a="$AMOUNT" 'BEGIN { exit (a+0 == 440 ? 0 : 1) }'; then
  echo "PASS rollback-invoice-sync-smoke unit_price=$AMOUNT"
else
  echo "FAIL rollback-invoice-sync-smoke unit_price=$AMOUNT"
  exit 1
fi

TRIP_LIVE=$(psql_auth "$ADMIN" "select public.assign_staff_trip(
  '$ORG'::uuid, '$DRIVER_ROW'::uuid, timestamptz '2026-09-25 10:00:00+02',
  'Rollback live route', 1, '$COMP'::uuid, null, '$VEH'::uuid
);")

psql_auth "$DRIVER_USER" "select public.start_staff_trip('$TRIP_LIVE'::uuid, 100::numeric, true);"
psql_auth "$DRIVER_USER" "select public.advance_staff_trip_en_route('$TRIP_LIVE'::uuid);"
psql_auth "$DRIVER_USER" "select public.end_staff_trip('$TRIP_LIVE'::uuid, 150::numeric);"

STATUS=$(sudo -u postgres psql -q -d "$DB" -tA -c \
  "select status::text from public.trips where id = '$TRIP_LIVE'::uuid;")

if [[ "$STATUS" == "completed" ]]; then
  echo "PASS rollback-start-end-trip status=$STATUS"
else
  echo "FAIL rollback-start-end-trip status=$STATUS"
  exit 1
fi

SYNC_AMOUNT=$(sudo -u postgres psql -q -d "$DB" -tA -c \
  "select unit_price::text from public.invoice_lines where trip_id = '$TRIP_LIVE'::uuid;")

if [[ -n "$SYNC_AMOUNT" && "$SYNC_AMOUNT" != "0" ]]; then
  echo "PASS rollback-invoice-line-after-complete unit_price=$SYNC_AMOUNT"
else
  echo "FAIL rollback-invoice-line-after-complete unit_price=$SYNC_AMOUNT"
  exit 1
fi
