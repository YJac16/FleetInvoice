-- =============================================================================
-- 00093: fuel price table (global reference + org-confirmed rates)
-- =============================================================================
-- Rules (Yaseen, 25 Nov 2026): every fuel fill-up is priced from this table at
-- the CONFIRMED org rate in force on the slip date (00094 locks it). This
-- migration only creates the table and its RPCs; it seeds NO prices. Real
-- rates arrive as global PENDING rows from the DMPR cron
-- (app/api/cron/fuel-prices) and an organisation_admin / manager / platform
-- owner confirms them into org rows, or enters a manual org rate.
--
--   organisation_id null  = global reference row (always 'pending')
--   organisation_id set   = org copy / override ('pending' or 'confirmed')
--
-- RLS: SELECT for finance only (platform owner; organisation_admin / manager
-- see global rows plus their own org rows). driver, employee, dispatcher,
-- supervisor and company_manager see nothing. No INSERT/UPDATE/DELETE grant:
-- writes go through the SECURITY DEFINER RPCs below.
--
--   list_fuel_prices(org)                 finance: global + org rows
--   confirm_fuel_prices(org, date?)       finance: copy current global pending
--                                         rows to confirmed rows for that org
--                                         only (idempotent)
--   upsert_org_fuel_price(...)            finance: manual confirmed org rate
--   resolve_fuel_unit_price(org,type,region,slip_date)
--                                         internal (no client EXECUTE): latest
--                                         confirmed ORG row with
--                                         effective_from <= slip_date, else none
--   ingest_global_fuel_prices(jsonb, src) service_role (cron): insert global
--                                         pending rows, idempotent
--   notify_fuel_price_ingest_failure(txt) service_role (cron): in-app notice to
--                                         finance + platform owners
--
-- Pending or global rows are never used to price a fill-up.
-- Not applied to any remote database from the PR.
-- Rollback: supabase/rollback-00093.sql
-- =============================================================================

begin;

create table if not exists public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  fuel_type text not null,
  region text not null default 'coastal',
  effective_from date not null,
  price_per_litre numeric(10, 4) not null,
  source text not null,
  status text not null default 'pending',
  created_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fuel_prices_status_check check (status in ('pending', 'confirmed')),
  constraint fuel_prices_fuel_type_format check (fuel_type ~ '^[a-z0-9_]{2,40}$'),
  constraint fuel_prices_region_format check (region ~ '^[a-z0-9_]{2,40}$'),
  constraint fuel_prices_price_positive check (price_per_litre > 0),
  constraint fuel_prices_source_not_blank check (length(trim(source)) > 0),
  constraint fuel_prices_global_pending check (organisation_id is not null or status = 'pending'),
  constraint fuel_prices_confirmed_stamp check (
    status <> 'confirmed' or (confirmed_at is not null)
  ),
  constraint fuel_prices_key unique nulls not distinct (organisation_id, fuel_type, region, effective_from)
);

create index if not exists fuel_prices_lookup_idx
  on public.fuel_prices (organisation_id, fuel_type, region, effective_from desc);
create index if not exists fuel_prices_created_by_fkey_idx on public.fuel_prices (created_by);
create index if not exists fuel_prices_confirmed_by_fkey_idx on public.fuel_prices (confirmed_by);

drop trigger if exists fuel_prices_set_updated_at on public.fuel_prices;
create trigger fuel_prices_set_updated_at
before update on public.fuel_prices
for each row execute function public.set_updated_at();

comment on table public.fuel_prices is
  'Fuel price per litre. organisation_id null = global reference (pending only); org rows are confirmed copies or manual rates. Finance-only.';

alter table public.fuel_prices enable row level security;

revoke all on table public.fuel_prices from public, anon, authenticated;
grant select on table public.fuel_prices to authenticated;
grant select, insert, update, delete on table public.fuel_prices to service_role;

drop policy if exists fuel_prices_select on public.fuel_prices;
create policy fuel_prices_select on public.fuel_prices
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id is not null
      and public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])
    )
    or (
      organisation_id is null
      and exists (
        select 1
        from public.user_organisation_ids() as o(id)
        where public.has_org_role_names(o.id, array['organisation_admin', 'manager'])
      )
    )
  );

-- ---------------------------------------------------------------------------
-- list_fuel_prices
-- ---------------------------------------------------------------------------
create or replace function public.list_fuel_prices(p_organisation_id uuid)
returns setof public.fuel_prices
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(p_organisation_id, array['organisation_admin', 'manager'])
  ) then
    raise exception 'Not authorised to view fuel prices';
  end if;

  return query
  select p.*
  from public.fuel_prices p
  where p.organisation_id is null
     or p.organisation_id = p_organisation_id
  order by p.effective_from desc, p.fuel_type, p.region, p.organisation_id nulls first;
end;
$$;

revoke all on function public.list_fuel_prices(uuid) from public, anon;
grant execute on function public.list_fuel_prices(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- confirm_fuel_prices: one-click copy of current global pending rows into
-- confirmed rows for p_organisation_id only. "Current" = per fuel type and
-- region, the latest global row in force today (Africa/Johannesburg) plus any
-- already-published future-dated rows. p_effective_from confirms one specific
-- published date instead (a missed month). Never touches another org, never
-- overwrites an existing org row (on conflict do nothing => idempotent).
-- ---------------------------------------------------------------------------
create or replace function public.confirm_fuel_prices(
  p_organisation_id uuid,
  p_effective_from date default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_today date := (timezone('Africa/Johannesburg', now()))::date;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(p_organisation_id, array['organisation_admin', 'manager'])
  ) then
    raise exception 'Not authorised to confirm fuel prices';
  end if;
  if not exists (
    select 1 from public.organisations o
    where o.id = p_organisation_id and o.deleted_at is null
  ) then
    raise exception 'Organisation not found';
  end if;

  with candidates as (
    select g.*
    from public.fuel_prices g
    where g.organisation_id is null
      and g.status = 'pending'
      and (
        (p_effective_from is not null and g.effective_from = p_effective_from)
        or (
          p_effective_from is null
          and (
            g.effective_from > v_today
            or g.effective_from = (
              select max(g2.effective_from)
              from public.fuel_prices g2
              where g2.organisation_id is null
                and g2.status = 'pending'
                and g2.fuel_type = g.fuel_type
                and g2.region = g.region
                and g2.effective_from <= v_today
            )
          )
        )
      )
  ),
  ins as (
    insert into public.fuel_prices (
      organisation_id, fuel_type, region, effective_from, price_per_litre,
      source, status, created_by, confirmed_by, confirmed_at
    )
    select
      p_organisation_id, c.fuel_type, c.region, c.effective_from, c.price_per_litre,
      c.source, 'confirmed', auth.uid(), auth.uid(), timezone('utc', now())
    from candidates c
    on conflict on constraint fuel_prices_key do nothing
    returning 1
  )
  select count(*)::integer into v_count from ins;

  return v_count;
end;
$$;

revoke all on function public.confirm_fuel_prices(uuid, date) from public, anon;
grant execute on function public.confirm_fuel_prices(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_org_fuel_price: manual fallback. Inserts a confirmed org row, or
-- re-prices an existing org row for the same key. 00094 recreates it so that a
-- rate which has already priced (locked) fill-ups cannot change.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_org_fuel_price(
  p_organisation_id uuid,
  p_fuel_type text,
  p_effective_from date,
  p_price_per_litre numeric,
  p_region text default 'coastal'
)
returns public.fuel_prices
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_region text := coalesce(nullif(trim(p_region), ''), 'coastal');
  v_existing public.fuel_prices%rowtype;
  v_row public.fuel_prices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(p_organisation_id, array['organisation_admin', 'manager'])
  ) then
    raise exception 'Not authorised to set fuel prices';
  end if;
  if p_fuel_type is null or p_fuel_type !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Invalid fuel type';
  end if;
  if p_effective_from is null then
    raise exception 'Effective date is required';
  end if;
  if p_price_per_litre is null or p_price_per_litre <= 0 then
    raise exception 'Price per litre must be positive';
  end if;

  select * into v_existing
  from public.fuel_prices p
  where p.organisation_id = p_organisation_id
    and p.fuel_type = p_fuel_type
    and p.region = v_region
    and p.effective_from = p_effective_from
  for update;

  if found then
    update public.fuel_prices
    set price_per_litre = p_price_per_litre,
        source = 'manual',
        status = 'confirmed',
        confirmed_by = auth.uid(),
        confirmed_at = timezone('utc', now())
    where id = v_existing.id
    returning * into v_row;
  else
    insert into public.fuel_prices (
      organisation_id, fuel_type, region, effective_from, price_per_litre,
      source, status, created_by, confirmed_by, confirmed_at
    )
    values (
      p_organisation_id, p_fuel_type, v_region, p_effective_from, p_price_per_litre,
      'manual', 'confirmed', auth.uid(), auth.uid(), timezone('utc', now())
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_org_fuel_price(uuid, text, date, numeric, text) from public, anon;
grant execute on function public.upsert_org_fuel_price(uuid, text, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_fuel_unit_price: internal helper for log_fuel_fillup / backfill
-- (both SECURITY DEFINER). Confirmed ORG rows only; global and pending rows
-- are never returned. No client EXECUTE: a driver must not be able to probe
-- the billing price.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_fuel_unit_price(
  p_organisation_id uuid,
  p_fuel_type text,
  p_region text,
  p_slip_date date
)
returns setof public.fuel_prices
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select p.*
  from public.fuel_prices p
  where p.organisation_id = p_organisation_id
    and p.organisation_id is not null
    and p.status = 'confirmed'
    and p.fuel_type = p_fuel_type
    and p.region = coalesce(p_region, 'coastal')
    and p.effective_from <= p_slip_date
  order by p.effective_from desc
  limit 1;
$$;

revoke all on function public.resolve_fuel_unit_price(uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.resolve_fuel_unit_price(uuid, text, text, date) to service_role;

-- ---------------------------------------------------------------------------
-- ingest_global_fuel_prices (service_role / cron only). p_rows is a JSON array
-- of {fuel_type, region, effective_from, price_per_litre}. Inserts global
-- PENDING rows; an existing (type, region, effective_from) is left alone.
-- Returns the number of rows inserted.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_global_fuel_prices(
  p_rows jsonb,
  p_source text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_source is null or length(trim(p_source)) = 0 or p_source ~* 'demo' then
    raise exception 'Invalid source for global fuel prices';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No fuel price rows';
  end if;

  with src as (
    select
      r ->> 'fuel_type' as fuel_type,
      coalesce(nullif(r ->> 'region', ''), 'coastal') as region,
      (r ->> 'effective_from')::date as effective_from,
      (r ->> 'price_per_litre')::numeric(10, 4) as price_per_litre
    from jsonb_array_elements(p_rows) as r
  ),
  ins as (
    insert into public.fuel_prices (
      organisation_id, fuel_type, region, effective_from, price_per_litre, source, status
    )
    select null, s.fuel_type, s.region, s.effective_from, s.price_per_litre, trim(p_source), 'pending'
    from src s
    on conflict on constraint fuel_prices_key do nothing
    returning 1
  )
  select count(*)::integer into v_count from ins;

  return v_count;
end;
$$;

revoke all on function public.ingest_global_fuel_prices(jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_global_fuel_prices(jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- notify_fuel_price_ingest_failure (service_role / cron only): one in-app
-- admin inbox notice per active organisation_admin / manager membership and
-- per platform owner membership. Changes no price.
-- ---------------------------------------------------------------------------
create or replace function public.notify_fuel_price_ingest_failure(p_message text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  with recipients as (
    select distinct m.organisation_id, m.user_id
    from public.organisation_members m
    left join public.profiles p on p.id = m.user_id
    where m.status = 'active'
      and m.deleted_at is null
      and (
        m.role::text in ('organisation_admin', 'manager')
        or coalesce(p.is_platform_owner, false)
      )
  ),
  ins as (
    insert into public.admin_inbox_notifications (
      organisation_id, recipient_user_id, notification_type, title, body, link_path, subject_kind
    )
    select
      r.organisation_id,
      r.user_id,
      'fuel_price_ingest_failed',
      'Fuel price update failed',
      left(coalesce(nullif(trim(p_message), ''), 'The official fuel price release could not be read.'), 500)
        || ' No prices were changed. Enter or confirm rates manually on the Fuel page.',
      '/fuel',
      'fuel_prices'
    from recipients r
    returning 1
  )
  select count(*)::integer into v_count from ins;
  return v_count;
end;
$$;

revoke all on function public.notify_fuel_price_ingest_failure(text) from public, anon, authenticated;
grant execute on function public.notify_fuel_price_ingest_failure(text) to service_role;

commit;
