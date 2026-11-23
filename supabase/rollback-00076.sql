-- =============================================================================
-- ROLLBACK: 00076_goops_entitlements.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Run alongside an app commit
-- that predates the GoOps refocus if the code should match.
--
-- Caveat: removing maintenance from Growth/Scale makes maintenance_assert_writer
-- (00074) refuse writes for those orgs again. Existing workshop bills stay.
-- =============================================================================

begin;

-- (c) Plans back to pre-00076
delete from public.module_entitlements e
using public.plans p
where e.plan_id = p.id
  and (
    (p.code = 'starter' and e.module_key = 'billing')
    or (p.code in ('growth', 'scale') and e.module_key = 'maintenance')
  );

insert into public.module_entitlements (plan_id, module_key)
select p.id, 'portal'
from public.plans p
where p.code in ('starter', 'growth', 'scale')
on conflict (plan_id, module_key) do nothing;

-- (b) 00060 fallback
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
        array[
          'core',
          'gps',
          'attendance',
          'billing',
          'payroll',
          'reports',
          'portal'
        ]::text[]
      )
    else
      array[]::text[]
  end;
$$;

revoke all on function public.org_entitled_modules(uuid) from public, anon;
grant execute on function public.org_entitled_modules(uuid) to authenticated, service_role;

-- (a) 00073 key list. Remove passengers rows first or the constraint fails.
delete from public.module_entitlements where module_key = 'passengers';

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
      'maintenance'
    )
  );

commit;
