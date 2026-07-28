-- Phase 6 RLS / presence stubs (run after 00008)
-- employees.profile_id, qr_tokens, attendance_events, issue/scan RPCs

select 'table' as kind, c.relname as name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('qr_tokens', 'attendance_events', 'employees')
union all
select 'function', p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_employee_id',
    'hash_qr_token',
    'issue_qr_token',
    'scan_qr_token'
  )
union all
select 'column', 'employees.profile_id'
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employees'
  and column_name = 'profile_id'
union all
select 'enum_label', e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname = 'attendance_event_type'
order by 1, 2;

-- Manual scenarios (document expected outcomes; run as specific roles in SQL editor):
-- 1) Ops issue_qr_token for active trip + employee → returns raw token; attendance issued event
-- 2) Employee (linked profile) scan_qr_token with raw token → boarded event; token.used_at set
-- 3) Second scan of same token → Token already used
-- 4) Expired token → Token expired
-- 5) Unlinked employee role cannot list other employees' attendance_events
-- 6) Direct insert into qr_tokens / attendance_events as authenticated → denied (RPC only)
-- 7) Driver scan_qr_token succeeds when current_driver_id is set for org
