-- Compliance + assignment checks (run on local Supabase after 00032/00033)
-- Manual / CI: set JWT claims per test user before each block.

-- T10: authenticated cannot execute enqueue_compliance_expiry_alerts
-- (expect permission denied when run as authenticated)

-- T2a sketch: driver selects own drivers row only
-- select * from drivers; -- as driver: single row

-- T4a: assign_vehicle_to_driver closes prior open rows
-- select assign_vehicle_to_driver('driver-id', 'vehicle-id');

-- Verify list_compliance_renewals columns
select subject_kind, status
from public.list_compliance_renewals(
  '00000000-0000-0000-0000-000000000001'::uuid,
  90
)
limit 0;

comment on schema public is '00032_compliance_checks.sql — run with local JWT simulation per tests/rls/README.md';
