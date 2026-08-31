-- Fleet identity (run after 00017)
-- Invoice numbers, vehicle compliance fields, vehicle_updates, driver PDP

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('vehicle_updates', 'vehicles', 'drivers', 'invoices')
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('next_invoice_number', 'sync_vehicle_odometer_from_update', 'log_fuel_fillup')
union all
select 'column', table_name || '.' || column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'invoices' and column_name = 'invoice_number')
    or (table_name = 'vehicles' and column_name in (
      'make', 'current_odometer_km', 'assigned_driver_id', 'original_natis_in_file'
    ))
    or (table_name = 'drivers' and column_name in (
      'pdp_number', 'pdp_expiry', 'tour_guide', 'license_expiry'
    ))
  )
order by 1, 2;

-- Manual scenarios:
-- 1) generate_period_invoice → invoice_number INV-YYYY-NNNN
-- 2) Repeat generate same company/period → existing invoice, same number
-- 3) Ops insert vehicle_updates with odometer_km > current → vehicles.current_odometer_km updated
-- 4) log_fuel_fillup with higher km → vehicles.current_odometer_km updated
-- 5) Driver insert vehicle_updates → denied
-- 6) Duplicate active pdp_number in same org → unique violation
