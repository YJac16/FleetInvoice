-- =============================================================================
-- 00076 — GoOps refocus: module key, fail-open fallback, plan entitlements
-- =============================================================================
-- (a) Allow 'passengers' in module_entitlements_key_check. The list now equals
--     APP_MODULES in lib/entitlements.ts.
-- (b) org_entitled_modules fallback (org with no trialing/active plan rows) now
--     equals FAIL_OPEN_MODULES in lib/entitlements.ts: every module except the
--     NEVER_FAIL_OPEN ones (portal, passengers, maintenance).
-- (c) Plans: Starter gains billing and loses portal; Growth and Scale lose
--     portal. Growth and Scale are NOT granted maintenance here (maintenance
--     must not ship yet, RESTRUCTURE-PLAN v1.4); a later migration can grant it.
--
-- Does not touch the 00057 company-portal RLS helpers, RLS policies, or any
-- plan price / vehicle columns or rate data. No plan is given 'passengers'.
--
-- Numbered 00076 because 00069-00072 are used by open PRs and 00073-00075 are
-- reserved for the maintenance migrations (not on this branch).
--
-- Idempotent. Safe to apply on its own after 00075 (psql -f, not db push).
-- Rollback: supabase/rollback-00076.sql.

begin;

-- ---------------------------------------------------------------------------
-- (a) Module key
-- ---------------------------------------------------------------------------

alter table public.module_entitlements
  drop constraint if exists module_entitlements_key_check;
alter table public.module_entitlements
  add constraint module_entitlements_key_check check (
    module_key in (
      'core',
      'gps',
      'attendance',
      'billing',
      'payroll',
      'reports',
      'portal',
      'white_label',
      'sso',
      'integrations',
      'ai',
      'maintenance',
      'passengers'
    )
  );

-- ---------------------------------------------------------------------------
-- (b) Fail-open fallback
-- ---------------------------------------------------------------------------
-- Same body as 00060 except the fallback array. Keeps the member /
-- platform-owner gate and the pinned search_path.

create or replace function public.org_entitled_modules(p_organisation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when public.is_platform_owner() or public.is_org_member(p_organisation_id) then
      coalesce(
        (
          select array_agg(distinct e.module_key order by e.module_key)
          from public.subscriptions s
          join public.module_entitlements e on e.plan_id = s.plan_id
          where s.organisation_id = p_organisation_id
            and s.status in ('trialing', 'active')
        ),
        -- FAIL_OPEN_MODULES: every module except portal, passengers, maintenance.
        array[
          'ai',
          'attendance',
          'billing',
          'core',
          'gps',
          'integrations',
          'payroll',
          'reports',
          'sso',
          'white_label'
        ]::text[]
      )
    else
      array[]::text[]
  end;
$$;

revoke all on function public.org_entitled_modules(uuid) from public, anon;
grant execute on function public.org_entitled_modules(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (c) Plan entitlements
-- ---------------------------------------------------------------------------

delete from public.module_entitlements e
using public.plans p
where e.plan_id = p.id
  and p.code in ('starter', 'growth', 'scale')
  and e.module_key = 'portal';

insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
join (
  values
    ('starter', 'billing')
) as m(plan_code, module_key) on m.plan_code = p.code
on conflict (plan_id, module_key) do nothing;

commit;
