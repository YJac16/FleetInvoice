-- =============================================================================
-- 00086: fuel cost is finance (hide unit_price / total_amount / currency)
-- =============================================================================
-- Product decision 2026-11-25: dispatchers and supervisors keep the fuel
-- fill-up report (date, vehicle, company, driver, odometer, litres) but get no
-- money columns. platform_owner, organisation_admin and manager keep amounts;
-- drivers keep amounts on their own rows only; company_manager and employee
-- still see no fuel_fillups rows (00079 policy, untouched).
--
-- (a) Column-level SELECT on unit_price, total_amount, currency is removed
--     for authenticated and anon (00079 pattern: a column REVOKE alone is a
--     no-op while the table-level grant exists, so drop the table grant and
--     re-grant every other column). Direct `select *` or selecting those
--     columns fails with 42501. Clients must list columns (see
--     FUEL_FILLUP_SAFE_COLUMNS in services/fuel-fillups.service.ts); a future
--     fuel_fillups column needs its own GRANT SELECT.
-- (b) list_fuel_fillup_amounts(p_organisation_id): SECURITY DEFINER, role
--     gated. admin/manager/platform owner: all rows; drivers (not
--     dispatcher/supervisor): own rows only; dispatcher/supervisor: none.
-- (c) log_fuel_fillup returns the row with money columns nulled unless the
--     caller is platform owner, admin, manager or the self driver (00080
--     pattern). generate_weekly_fuel_invoice is SECURITY DEFINER and
--     admin/manager only since 00085; untouched.
-- Not applied to any remote database from the PR; Engineering applies it.
-- Rollback: supabase/rollback-00086.sql
-- =============================================================================

begin;

revoke select on table public.fuel_fillups from authenticated, anon;
revoke select (unit_price, total_amount, currency)
  on table public.fuel_fillups from authenticated, anon;
grant select (
  id,
  organisation_id,
  vehicle_id,
  driver_id,
  company_id,
  filled_at,
  odometer_km,
  litres,
  station_name,
  notes,
  created_by,
  created_at,
  updated_at,
  deleted_at
) on table public.fuel_fillups to authenticated;

create or replace function public.list_fuel_fillup_amounts(
  p_organisation_id uuid
)
returns table (
  id uuid,
  unit_price numeric,
  total_amount numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_platform_owner()
     or public.has_org_role_names(
       p_organisation_id,
       array['organisation_admin', 'manager']
     ) then
    return query
    select f.id, f.unit_price, f.total_amount, f.currency
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.deleted_at is null;
  elsif not public.has_org_role_names(
    p_organisation_id,
    array['dispatcher', 'supervisor']
  ) then
    return query
    select f.id, f.unit_price, f.total_amount, f.currency
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.deleted_at is null
      and f.driver_id = public.current_driver_id(p_organisation_id);
  end if;
  -- dispatcher, supervisor and everyone else: no rows
end;
$$;

revoke all on function public.list_fuel_fillup_amounts(uuid) from public, anon;
grant execute on function public.list_fuel_fillup_amounts(uuid) to authenticated;

create or replace function public.log_fuel_fillup(
  p_organisation_id uuid,
  p_vehicle_id uuid,
  p_odometer_km numeric,
  p_litres numeric,
  p_company_id uuid default null,
  p_driver_id uuid default null,
  p_filled_at timestamptz default null,
  p_unit_price numeric default null,
  p_station_name text default null,
  p_notes text default null
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v public.vehicles%rowtype;
  last_km numeric;
  driver uuid;
  company uuid;
  is_ops boolean;
  is_self_driver boolean;
  total numeric;
  row public.fuel_fillups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v
  from public.vehicles
  where id = p_vehicle_id
    and organisation_id = p_organisation_id
    and deleted_at is null;
  if not found then
    raise exception 'Vehicle not found';
  end if;

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    );

  driver := coalesce(p_driver_id, public.current_driver_id(p_organisation_id));
  is_self_driver := driver is not null
    and driver = public.current_driver_id(p_organisation_id);

  if not (is_ops or is_self_driver) then
    raise exception 'Not authorised to log fuel';
  end if;

  if p_litres is null or p_litres <= 0 then
    raise exception 'Litres must be positive';
  end if;
  if p_odometer_km is null or p_odometer_km < 0 then
    raise exception 'Odometer must be non-negative';
  end if;

  select f.odometer_km into last_km
  from public.fuel_fillups f
  where f.vehicle_id = p_vehicle_id
    and f.deleted_at is null
  order by f.filled_at desc, f.created_at desc
  limit 1;

  if last_km is not null and p_odometer_km < last_km then
    raise exception 'Odometer % km is less than last fill-up % km', p_odometer_km, last_km;
  end if;

  company := coalesce(p_company_id, v.company_id);

  if company is not null and not exists (
    select 1 from public.companies c
    where c.id = company
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
  ) then
    raise exception 'Company not found';
  end if;

  total := case
    when p_unit_price is not null then round(p_litres * p_unit_price, 2)
    else null
  end;

  insert into public.fuel_fillups (
    organisation_id,
    vehicle_id,
    driver_id,
    company_id,
    filled_at,
    odometer_km,
    litres,
    unit_price,
    total_amount,
    station_name,
    notes,
    created_by
  )
  values (
    p_organisation_id,
    p_vehicle_id,
    driver,
    company,
    coalesce(p_filled_at, timezone('utc', now())),
    p_odometer_km,
    p_litres,
    p_unit_price,
    total,
    nullif(trim(p_station_name), ''),
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning * into row;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager']
    )
    or is_self_driver
  ) then
    row.unit_price := null;
    row.total_amount := null;
    row.currency := null;
  end if;

  return row;
end;
$$;

grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to authenticated;

commit;
