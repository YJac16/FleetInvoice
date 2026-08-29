-- =============================================================================
-- WorkOps — Three vehicle-based membership tiers (ZAR)
-- Equivalent to live migration membership_three_tiers (20260829122937).
-- Idempotent: IF NOT EXISTS / ON CONFLICT / guarded updates.
-- =============================================================================

-- Commercial fields for vehicle-based membership
alter table public.plans
  add column if not exists currency text not null default 'ZAR',
  add column if not exists tagline text,
  add column if not exists monthly_price_cents integer,
  add column if not exists included_vehicles integer,
  add column if not exists extra_vehicle_cents integer,
  add column if not exists max_vehicles integer;

alter table public.plans
  drop constraint if exists plans_currency_check;
alter table public.plans
  add constraint plans_currency_check check (currency in ('ZAR'));

alter table public.plans
  drop constraint if exists plans_monthly_price_cents_check;
alter table public.plans
  add constraint plans_monthly_price_cents_check check (
    monthly_price_cents is null or monthly_price_cents >= 0
  );

alter table public.plans
  drop constraint if exists plans_vehicle_limits_check;
alter table public.plans
  add constraint plans_vehicle_limits_check check (
    (included_vehicles is null or included_vehicles >= 0)
    and (extra_vehicle_cents is null or extra_vehicle_cents >= 0)
    and (max_vehicles is null or max_vehicles >= 0)
    and (
      included_vehicles is null
      or max_vehicles is null
      or max_vehicles >= included_vehicles
    )
  );

-- Scale extras (forward-looking; app can ignore unknown keys)
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
      'ai'
    )
  );

insert into public.plans (
  code, name, tagline, description, sort_order,
  currency, monthly_price_cents, included_vehicles, extra_vehicle_cents, max_vehicles
)
values (
  'scale',
  'Scale',
  'Multi-depot',
  'Everything in Growth, plus white-label, SSO, accounting integrations, AI exceptions, and driver scorecards. For multi-depot fleets (60–200 vehicles). R6,990/month includes 60 vehicles, then R59 per extra vehicle.',
  30,
  'ZAR',
  699000,
  60,
  5900,
  200
)
on conflict (code) do update set
  name = excluded.name,
  tagline = excluded.tagline,
  description = excluded.description,
  sort_order = excluded.sort_order,
  currency = excluded.currency,
  monthly_price_cents = excluded.monthly_price_cents,
  included_vehicles = excluded.included_vehicles,
  extra_vehicle_cents = excluded.extra_vehicle_cents,
  max_vehicles = excluded.max_vehicles,
  is_active = true,
  updated_at = timezone('utc', now());

update public.plans set
  name = 'Starter',
  tagline = 'On the road',
  description = 'Live map, trips, driver app, fuel, and basic reports. For owner-operators and small shuttles (1–15 vehicles). R990/month includes 8 vehicles, then R99 per extra vehicle.',
  sort_order = 10,
  currency = 'ZAR',
  monthly_price_cents = 99000,
  included_vehicles = 8,
  extra_vehicle_cents = 9900,
  max_vehicles = 15,
  is_active = true,
  updated_at = timezone('utc', now())
where code = 'starter';

update public.plans set
  name = 'Growth',
  tagline = 'In control',
  description = 'Everything in Starter, plus QR boarding, invoices, geofences, payroll, company portals, and full reports. For growing fleets (15–60 vehicles). R2,490/month includes 25 vehicles, then R79 per extra vehicle.',
  sort_order = 20,
  currency = 'ZAR',
  monthly_price_cents = 249000,
  included_vehicles = 25,
  extra_vehicle_cents = 7900,
  max_vehicles = 60,
  is_active = true,
  updated_at = timezone('utc', now())
where code = 'growth';

-- Starter: slim driver-ops pack
delete from public.module_entitlements e
using public.plans p
where e.plan_id = p.id
  and p.code = 'starter'
  and e.module_key not in ('core', 'gps', 'portal', 'reports');

insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
cross join (values ('core'), ('gps'), ('portal'), ('reports')) as m(module_key)
where p.code = 'starter'
on conflict (plan_id, module_key) do nothing;

-- Growth: full current ops suite
insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
cross join (
  values ('core'), ('gps'), ('attendance'), ('billing'), ('payroll'), ('reports'), ('portal')
) as m(module_key)
where p.code = 'growth'
on conflict (plan_id, module_key) do nothing;

-- Scale: full ops + next-wave modules
insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
cross join (
  values
    ('core'), ('gps'), ('attendance'), ('billing'), ('payroll'), ('reports'), ('portal'),
    ('white_label'), ('sso'), ('integrations'), ('ai')
) as m(module_key)
where p.code = 'scale'
on conflict (plan_id, module_key) do nothing;

-- Demo tenant stays on Growth. Never downgrade it from Scale.
update public.subscriptions s
set
  plan_id = p.id,
  updated_at = timezone('utc', now())
from public.plans p
where p.code = 'growth'
  and s.organisation_id = (
    select o.id from public.organisations o where o.slug = 'cape-shuttle-ops'
  )
  and not exists (
    select 1
    from public.plans current
    where current.id = s.plan_id
      and current.code = 'scale'
  );
