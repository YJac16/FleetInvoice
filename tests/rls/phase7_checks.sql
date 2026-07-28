-- Phase 7 RLS / presence stubs (run after 00009)
-- gps_points, gps_last_positions, geofences, geofence_events, ingest RPC

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'gps_points',
    'gps_last_positions',
    'geofences',
    'geofence_events'
  )
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ingest_gps_points', 'haversine_m', 'current_driver_id')
union all
select 'enum_label', e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'geofence_event_type'
order by 1, 2;

-- Manual scenarios:
-- 1) Linked driver ingest_gps_points with [{lat,lng}] → inserts gps_points + upserts last position
-- 2) Driver without profile_id → Not authorised
-- 3) Ops with driver_id on first point → succeeds
-- 4) Cross geofence boundary → geofence_events enter/exit row
-- 5) Direct insert into gps_points as authenticated → denied (RPC only)
-- 6) Dispatcher selects gps_last_positions for org → rows visible
