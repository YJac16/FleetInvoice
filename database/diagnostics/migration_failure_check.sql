-- WorkOps migration failure diagnostics
-- Run in Supabase SQL Editor AFTER a failed apply of 00002 / 00003.
-- Copy the results (and the original ERROR text) for debugging.

-- A) Enum values present on app_role?
select e.enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'app_role'
order by e.enumsortorder;

-- B) Notification / vehicle doc types exist?
select t.typname
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in (
    'notification_channel',
    'notification_status',
    'vehicle_doc_type'
  )
order by 1;

-- C) Phase 0/2 tables exist?
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'member_scopes',
    'audit_logs',
    'notification_outbox',
    'vehicle_documents'
  )
order by 1;

-- D) has_company_scope function exists?
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'has_company_scope';

-- E) drivers.profile_id column?
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'drivers'
  and column_name = 'profile_id';
