-- Phase 5 RLS / presence stubs (run after 00007)
-- Fuel fill-ups, invoices, vehicles.company_id

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('fuel_fillups', 'invoices', 'invoice_lines', 'vehicles')
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('log_fuel_fillup', 'generate_weekly_fuel_invoice', 'current_driver_id')
union all
select 'column', 'vehicles.company_id'
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vehicles'
  and column_name = 'company_id'
union all
select 'enum_label', e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'invoice_status'
order by 1, 2;

-- Manual scenarios (document expected outcomes; run as specific roles in SQL editor):
-- 1) Linked driver log_fuel_fillup with odometer >= last → insert succeeds
-- 2) Same driver with odometer < last → exception
-- 3) Ops role lists all org fuel_fillups; company_manager only scoped company_id rows
-- 4) company_manager generate_weekly_fuel_invoice for scoped company → issued invoice + lines
-- 5) company_manager generate for unscoped company → Not authorised
-- 6) Second generate for same week → returns existing invoice (idempotent)
-- 7) Direct insert into invoice_lines as authenticated → denied (no insert policy; RPC only)
