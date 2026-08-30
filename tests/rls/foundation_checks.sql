-- WorkOps RLS foundation checks (run in Supabase SQL editor after migrations)
-- These are assertion-style queries. Adapt user UUIDs before running.

-- 1) Expect RLS enabled on tenant tables
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'organisations',
    'organisation_members',
    'invitations',
    'companies',
    'areas',
    'sites',
    'pickup_points',
    'drivers',
    'employees',
    'vehicles',
    'member_scopes',
    'audit_logs',
    'notification_outbox'
  )
order by 1;

-- 2) Expect helper functions exist
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_platform_owner',
    'is_org_member',
    'has_org_role',
    'user_organisation_ids',
    'has_company_scope',
    'write_audit_log',
    'enqueue_notification',
    'create_invitation',
    'accept_invitation',
    'get_invitation_by_token'
  )
order by 1;

-- 3) Manual scenario checklist (document pass/fail):
-- [ ] User A in Org1 cannot select Org2 companies
-- [ ] company_manager without member_scopes sees zero companies
-- [ ] company_manager with scope sees only scoped company
-- [ ] organisation_admin can create invitations
-- [ ] driver cannot insert into drivers
-- [ ] write_audit_log inserts a row; direct insert into audit_logs fails for authenticated
