-- Phase 4 RLS / presence stubs (run after 00005 + 00006)
-- Extend foundation_checks with trip workflow objects.

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('trip_assignments', 'trip_events', 'trips')
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_driver_id', 'assign_trip', 'transition_trip')
union all
select 'enum_label', e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'trip_status'
order by 1, 2;

-- Manual scenarios (document expected outcomes; run as specific roles in SQL editor):
-- 1) Dispatcher assign_trip on planned trip → assignment row + status assigned
-- 2) Driver (profile linked) transition_trip started → in_progress + event
-- 3) Unrelated org member cannot select other org trip_assignments
-- 4) Driver cannot assign_trip (not ops role)
-- 5) Direct insert into trip_events as authenticated → denied (no insert policy)
