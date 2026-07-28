-- Phase 8 payroll RLS / presence stubs (run after 00012)

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('pay_rates', 'payroll_runs', 'payroll_lines')
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'generate_payroll_run',
    'finalize_payroll_run',
    'void_payroll_run',
    'resolve_pay_rate'
  )
union all
select 'enum_label', e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in ('payroll_run_status', 'pay_subject_role', 'payroll_line_type')
order by 1, 2;

-- Manual scenarios:
-- 1) Ops create driver/trip pay_rate → insert ok
-- 2) company_manager create pay_rate → denied
-- 3) generate_payroll_run with completed trips + rates → draft run + lines
-- 4) Second generate same period → idempotent existing
-- 5) finalize_payroll_run draft → finalized
-- 6) void after finalize → ok; void again → exception
-- 7) Direct insert into payroll_lines → denied
