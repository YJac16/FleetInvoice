-- Ops helpers after applying 00001–00004
-- Run in Supabase SQL Editor as needed.

-- 1) Promote yourself to platform owner (edit email)
-- update public.profiles
-- set is_platform_owner = true
-- where lower(email) = lower('you@example.com');

-- 2) Quick presence check (same as database/diagnostics/migration_failure_check.sql plus Phase 3)
select 'app_role' as kind, e.enumlabel as name
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'app_role'
union all
select 'table', c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'member_scopes', 'audit_logs', 'notification_outbox', 'vehicle_documents',
    'routes', 'route_stops', 'schedules', 'trips'
  )
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('has_company_scope', 'has_org_role_names', 'generate_trips')
order by 1, 2;
