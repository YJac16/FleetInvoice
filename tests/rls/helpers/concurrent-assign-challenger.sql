-- Session 2: waits on row locks while session 1 holds transaction, then assigns conflicting driver.
\set admin_id 'a0000000-0000-4000-8000-000000000011'
\set driver_b 'a0000000-0000-4000-8000-000000000202'
\set v1 'a0000000-0000-4000-8000-000000000601'

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = :'admin_id';
SELECT pg_sleep(0.3);
SELECT public.assign_vehicle_to_driver(:'driver_b'::uuid, :'v1'::uuid);
COMMIT;
