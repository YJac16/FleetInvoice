-- =============================================================================
-- ROLLBACK: 00086_fuel_cost_finance_only.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores:
--   column SELECT on unit_price, total_amount, currency for authenticated
--   list_fuel_fillup_amounts          dropped
--   log_fuel_fillup                   (latest 00007_phase5_fuel_and_invoices.sql)
-- =============================================================================

begin;

grant select on table public.fuel_fillups to authenticated;
grant select (unit_price, total_amount, currency) on public.fuel_fillups to authenticated;

drop function if exists public.list_fuel_fillup_amounts(uuid);

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
set search_path = public
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

  return row;
end;
$$;

grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to authenticated;

commit;
