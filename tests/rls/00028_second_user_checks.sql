-- Post-00028 checks (run in Supabase SQL editor after migration)
-- Expected: function exists; organisations_update policy mentions organisation_admin path via has_org_role

select p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_own_organisation';

-- Manual (authenticated JWT in SQL editor / client):
-- 1) User with zero memberships: select create_own_organisation('Demo Org', 'demo-org-unique', '{}'::jsonb);
--    → returns uuid; organisation_members row organisation_admin
-- 2) Same user again → exception (already belongs to org)
-- 3) Org admin: update organisations set settings = settings where id = <own org> → allowed
-- 4) Org admin: update organisations set settings = settings where id = <other org> → denied
