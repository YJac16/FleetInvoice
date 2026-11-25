-- =============================================================================
-- ROLLBACK: 00094_fuel_fillup_price_lock.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Run rollback-00095.sql first.
-- Restores:
--   log_fuel_fillup                   00086 definition (10 args, p_unit_price used)
--   list_fuel_fillup_amounts          00086 definition (drivers get own rows)
--   generate_weekly_fuel_invoice      00087 definition
--   upsert_org_fuel_price             00093 definition
--   fuel_fillups INSERT / UPDATE      table-level grant to authenticated again
-- Drops the price-lock trigger and the fuel_type, region, price_status,
-- priced_from_id, priced_at columns (money already written to unit_price /
-- total_amount stays).
-- =============================================================================

begin;

drop trigger if exists fuel_fillups_price_lock on public.fuel_fillups;
drop function if exists public.fuel_fillups_guard_price_lock();

drop function if exists public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text, text, text
);
drop function if exists public.list_fuel_fillup_amounts(uuid);

alter table public.fuel_fillups drop constraint if exists fuel_fillups_price_status_check;
alter table public.fuel_fillups drop constraint if exists fuel_fillups_fuel_type_format;
alter table public.fuel_fillups drop constraint if exists fuel_fillups_region_format;
drop index if exists public.fuel_fillups_priced_from_id_idx;
drop index if exists public.fuel_fillups_org_needs_price_idx;
alter table public.fuel_fillups
  drop column if exists priced_at,
  drop column if exists priced_from_id,
  drop column if exists price_status,
  drop column if exists region,
  drop column if exists fuel_type;

grant insert, update on table public.fuel_fillups to authenticated;

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

revoke all on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) from public, anon;
grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to authenticated;

create or replace function public.generate_weekly_fuel_invoice(
  p_organisation_id uuid,
  p_company_id uuid,
  p_week_start date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end date;
  existing public.invoices%rowtype;
  inv public.invoices%rowtype;
  can_generate boolean;
  fill record;
  line_amount numeric;
  running_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_period_end := p_week_start + 7;

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager']
    )
    or (
      public.has_org_role_names(p_organisation_id, array['company_manager'])
      and public.has_company_scope(p_organisation_id, p_company_id)
    );

  if not can_generate then
    raise exception 'Not authorised to generate invoices';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
  ) then
    raise exception 'Company not found';
  end if;

  select * into existing
  from public.invoices i
  where i.organisation_id = p_organisation_id
    and i.company_id = p_company_id
    and i.period_start = p_week_start
    and i.period_end = v_period_end
    and i.deleted_at is null
    and i.status <> 'void'
  limit 1;

  if found then
    return existing;
  end if;

  insert into public.invoices (
    organisation_id,
    company_id,
    period_start,
    period_end,
    status,
    generated_by
  )
  values (
    p_organisation_id,
    p_company_id,
    p_week_start,
    v_period_end,
    'draft',
    auth.uid()
  )
  returning * into inv;

  for fill in
    select f.*
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.company_id = p_company_id
      and f.deleted_at is null
      and f.filled_at >= p_week_start::timestamptz
      and f.filled_at < v_period_end::timestamptz
    order by f.filled_at
  loop
    line_amount := coalesce(
      fill.total_amount,
      case when fill.unit_price is not null then round(fill.litres * fill.unit_price, 2) else 0 end
    );
    running_total := running_total + line_amount;

    insert into public.invoice_lines (
      organisation_id,
      invoice_id,
      line_type,
      fuel_fillup_id,
      description,
      quantity,
      unit_price,
      amount
    )
    values (
      p_organisation_id,
      inv.id,
      'fuel',
      fill.id,
      format(
        'Fuel %s L @ %s km (%s)',
        fill.litres::text,
        fill.odometer_km::text,
        to_char(fill.filled_at at time zone 'UTC', 'YYYY-MM-DD')
      ),
      fill.litres,
      coalesce(fill.unit_price, 0),
      line_amount
    );
  end loop;

  update public.invoices
  set subtotal = running_total,
      total = running_total,
      status = 'issued',
      issued_at = timezone('utc', now())
  where id = inv.id
  returning * into inv;

  return inv;
end;
$$;

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

commit;
