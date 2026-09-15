-- Local-only helper for the Cloud Agent dev environment.
--
-- Hosted Supabase projects grant full table privileges to the anon,
-- authenticated and service_role roles automatically (row access is then
-- restricted by RLS). A local `supabase start` stack created only via these
-- SQL migrations does not always receive those role grants, which makes the
-- service-role seed script and the authenticated app fail with
-- "permission denied for table ...".
--
-- This script re-applies the standard Supabase grants so the local database
-- behaves like a hosted project. It is idempotent and safe to run on every boot.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
