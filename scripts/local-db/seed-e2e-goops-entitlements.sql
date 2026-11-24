-- =============================================================================
-- LOCAL ONLY — GoOps refocus step 7 e2e fixture (e2e/goops-entitlements.spec.ts)
-- =============================================================================
-- Run by scripts/local-db/provision-e2e-goops-entitlements.mjs against the local
-- audit Postgres (127.0.0.1). Never apply to a hosted project.
--
-- Creates:
--   - plan 'e2e_core_only' (inactive, never offered) entitled to core + gps
--     only: no billing, portal or passengers
--   - org "GoOps E2E Lite" with an active subscription on that plan
--   - one drivers row for the e2e driver user to link to
--
-- Idempotent.
-- =============================================================================

begin;

insert into public.plans (code, name, description, is_active, sort_order)
values (
  'e2e_core_only',
  'E2E Core Only',
  'Local e2e fixture: core + gps only (no billing, portal, passengers).',
  false,
  999
)
on conflict (code) do update set is_active = false;

delete from public.module_entitlements e
using public.plans p
where e.plan_id = p.id
  and p.code = 'e2e_core_only'
  and e.module_key not in ('core', 'gps');

insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
cross join (values ('core'), ('gps')) as m(module_key)
where p.code = 'e2e_core_only'
on conflict (plan_id, module_key) do nothing;

insert into public.organisations (id, name, slug)
values (
  'c0000000-0000-4000-8000-000000000001',
  'GoOps E2E Lite',
  'goops-e2e-lite'
)
on conflict (id) do nothing;

insert into public.subscriptions (organisation_id, plan_id, status)
select 'c0000000-0000-4000-8000-000000000001', p.id, 'active'
from public.plans p
where p.code = 'e2e_core_only'
on conflict (organisation_id) do update
  set plan_id = excluded.plan_id,
      status = 'active';

insert into public.drivers (id, organisation_id, full_name, email)
values (
  'c0000000-0000-4000-8000-000000000201',
  'c0000000-0000-4000-8000-000000000001',
  'E2E Lite Driver',
  'e2e.lite.driver@audit.test'
)
on conflict (id) do nothing;

commit;
