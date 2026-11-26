-- =============================================================================
-- 00098: maintenance service intervals (demo)
--
-- One row per organisation + category: how often that category is due, by
-- distance and/or time. Both are nullable; a row with neither is ignored by
-- the Due tab. No defaults are seeded, so nothing is due until an admin sets
-- an interval.
--
-- Access: platform owner, organisation_admin and manager can read;
-- only platform owner and organisation_admin can write (RLS, no RPC).
-- No money columns. Rollback: supabase/rollback-00098.sql
-- =============================================================================

create table if not exists public.maintenance_intervals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  category_id uuid not null references public.maintenance_categories (id) on delete cascade,
  interval_km integer,
  interval_months integer,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint maintenance_intervals_km_pos check (interval_km is null or interval_km > 0),
  constraint maintenance_intervals_months_pos check (interval_months is null or interval_months > 0),
  constraint maintenance_intervals_org_category_key unique (organisation_id, category_id)
);

comment on table public.maintenance_intervals is
  'Service interval per organisation + category (km and/or months, both optional). Drives the Due tab estimates.';

drop trigger if exists maintenance_intervals_set_updated_at on public.maintenance_intervals;
create trigger maintenance_intervals_set_updated_at
before update on public.maintenance_intervals
for each row execute function public.set_updated_at();

-- Category must belong to the same organisation.
create or replace function public.guard_maintenance_interval_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.maintenance_categories c
    where c.id = new.category_id
      and c.organisation_id = new.organisation_id
  ) then
    raise exception 'category_org_mismatch';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_maintenance_interval_same_org() from public, anon, authenticated;

drop trigger if exists maintenance_intervals_same_org on public.maintenance_intervals;
create trigger maintenance_intervals_same_org
before insert or update of organisation_id, category_id on public.maintenance_intervals
for each row execute function public.guard_maintenance_interval_same_org();

alter table public.maintenance_intervals enable row level security;

revoke all on table public.maintenance_intervals from public, anon, authenticated;
grant select, insert, update, delete on table public.maintenance_intervals to authenticated;
grant all on table public.maintenance_intervals to service_role;

drop policy if exists maintenance_intervals_select on public.maintenance_intervals;
create policy maintenance_intervals_select on public.maintenance_intervals
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])
  );

drop policy if exists maintenance_intervals_insert on public.maintenance_intervals;
create policy maintenance_intervals_insert on public.maintenance_intervals
  for insert
  to authenticated
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin'])
  );

drop policy if exists maintenance_intervals_update on public.maintenance_intervals;
create policy maintenance_intervals_update on public.maintenance_intervals
  for update
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin'])
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin'])
  );

drop policy if exists maintenance_intervals_delete on public.maintenance_intervals;
create policy maintenance_intervals_delete on public.maintenance_intervals
  for delete
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin'])
  );
