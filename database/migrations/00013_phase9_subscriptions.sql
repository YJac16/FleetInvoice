-- =============================================================================
-- WorkOps Phase 9a — Plans, subscriptions, module entitlements
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'subscription_status'
  ) then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'incomplete'
    );
  end if;
end $$;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  stripe_price_id text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.module_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  module_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint module_entitlements_plan_module_unique unique (plan_id, module_key),
  constraint module_entitlements_key_check check (
    module_key in (
      'core',
      'gps',
      'attendance',
      'billing',
      'payroll',
      'reports',
      'portal'
    )
  )
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscriptions_org_unique unique (organisation_id)
);

create index if not exists subscriptions_plan_id_idx on public.subscriptions (plan_id);
create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;
create index if not exists module_entitlements_plan_id_idx
  on public.module_entitlements (plan_id);

alter table public.plans enable row level security;
alter table public.module_entitlements enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select
  using (is_active or public.is_platform_owner());

drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans
  for all
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

drop policy if exists module_entitlements_select on public.module_entitlements;
create policy module_entitlements_select on public.module_entitlements
  for select
  using (
    public.is_platform_owner()
    or plan_id in (
      select s.plan_id
      from public.subscriptions s
      where s.organisation_id in (select public.user_organisation_ids())
    )
    or plan_id in (select id from public.plans where is_active)
  );

drop policy if exists module_entitlements_write on public.module_entitlements;
create policy module_entitlements_write on public.module_entitlements
  for all
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select
  using (
    public.is_platform_owner()
    or organisation_id in (select public.user_organisation_ids())
  );

drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions
  for all
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

-- Seed starter (all modules) + growth (ops without payroll)
insert into public.plans (code, name, description, sort_order)
values
  ('starter', 'Starter', 'Full ops suite for managed and early tenants', 10),
  ('growth', 'Growth', 'Core ops + GPS + billing + reports (no payroll)', 20)
on conflict (code) do nothing;

insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
cross join (
  values
    ('core'),
    ('gps'),
    ('attendance'),
    ('billing'),
    ('payroll'),
    ('reports'),
    ('portal')
) as m(module_key)
where p.code = 'starter'
on conflict (plan_id, module_key) do nothing;

insert into public.module_entitlements (plan_id, module_key)
select p.id, m.module_key
from public.plans p
cross join (
  values
    ('core'),
    ('gps'),
    ('attendance'),
    ('billing'),
    ('reports'),
    ('portal')
) as m(module_key)
where p.code = 'growth'
on conflict (plan_id, module_key) do nothing;

-- Grandfather existing organisations onto starter
insert into public.subscriptions (organisation_id, plan_id, status)
select o.id, p.id, 'active'::public.subscription_status
from public.organisations o
cross join public.plans p
where p.code = 'starter'
  and o.deleted_at is null
  and not exists (
    select 1 from public.subscriptions s where s.organisation_id = o.id
  );

create or replace function public.org_entitled_modules(p_organisation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(module_key order by module_key)
      from (
        select distinct e.module_key
        from public.subscriptions s
        join public.module_entitlements e on e.plan_id = s.plan_id
        where s.organisation_id = p_organisation_id
          and s.status in ('trialing', 'active')
      ) mods
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
  );
$$;

revoke all on function public.org_entitled_modules(uuid) from public;
grant execute on function public.org_entitled_modules(uuid) to authenticated, service_role;
