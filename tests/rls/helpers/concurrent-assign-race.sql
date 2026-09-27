-- Used by compliance-pr36 T4c: session 1 holds an open transaction during assign + sleep.
\set admin_id 'a0000000-0000-4000-8000-000000000011'
\set driver_a 'a0000000-0000-4000-8000-000000000201'
\set v1 'a0000000-0000-4000-8000-000000000601'

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = :'admin_id';
SELECT public.assign_vehicle_to_driver(:'driver_a'::uuid, :'v1'::uuid);
SELECT pg_sleep(4);
COMMIT;
