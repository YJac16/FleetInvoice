-- =============================================================================
-- ROLLBACK: 00098_maintenance_intervals.sql
-- Manual script, not part of the migration chain. Drops the table (all
-- intervals are lost) and its guard function.
-- =============================================================================

begin;

drop table if exists public.maintenance_intervals;
drop function if exists public.guard_maintenance_interval_same_org();

commit;
