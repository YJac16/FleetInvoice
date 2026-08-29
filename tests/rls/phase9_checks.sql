-- Phase 9a presence checks (run in Supabase SQL editor)

select to_regclass('public.plans') is not null as plans_ok;
select to_regclass('public.module_entitlements') is not null as entitlements_ok;
select to_regclass('public.subscriptions') is not null as subscriptions_ok;
select exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'org_entitled_modules'
) as rpc_ok;
select count(*) >= 3 as plans_seeded from public.plans where code in ('starter', 'growth', 'scale');
select count(*) = 1 as scale_priced
  from public.plans
  where code = 'scale'
    and monthly_price_cents = 699000
    and included_vehicles = 60;
