-- =============================================================================
-- WorkOps — Fleet identity clarity
-- Invoice numbers, vehicle compliance fields + km, vehicle updates,
-- driver licence / PDP / tour guide.
-- Requires 00011 (invoice generate RPCs) and 00007 (log_fuel_fillup).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drivers: licence, PDP, designations
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column if not exists license_code text,
  add column if not exists license_expiry date,
  add column if not exists pdp_number text,
  add column if not exists pdp_expiry date,
  add column if not exists tour_guide boolean not null default false,
  add column if not exists additional_qualifications text;

create unique index if not exists drivers_org_pdp_active_uidx
  on public.drivers (organisation_id, lower(pdp_number))
  where pdp_number is not null
    and btrim(pdp_number) <> ''
    and deleted_at is null;

comment on column public.drivers.license_number is
  'Driver''s licence number (not PDP).';
comment on column public.drivers.pdp_number is
  'Professional Driving Permit (PrDP) number.';
comment on column public.drivers.tour_guide is
  'True when the driver is designated as a tour guide.';

-- ---------------------------------------------------------------------------
-- Vehicles: spreadsheet-style details + current km
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists year integer,
  add column if not exists title_holder text,
  add column if not exists owner_name text,
  add column if not exists department text,
  add column if not exists assigned_driver_id uuid references public.drivers (id) on delete set null,
  add column if not exists permit_number text,
  add column if not exists permit_expiry date,
  add column if not exists licence_expiry date,
  add column if not exists licence_type text,
  add column if not exists comments text,
  add column if not exists original_natis_in_file boolean not null default false,
  add column if not exists authority text,
  add column if not exists current_odometer_km numeric;

create index if not exists vehicles_assigned_driver_id_idx
  on public.vehicles (assigned_driver_id);

comment on column public.vehicles.current_odometer_km is
  'Latest known odometer reading (km); updated from fuel fill-ups and vehicle updates.';
comment on column public.vehicles.original_natis_in_file is
  'Whether the original NaTIS document is physically on file.';

-- Backfill km from latest fuel fill-up
update public.vehicles v
set current_odometer_km = latest.odometer_km
from (
  select distinct on (f.vehicle_id) f.vehicle_id, f.odometer_km
  from public.fuel_fillups f
  where f.deleted_at is null
  order by f.vehicle_id, f.filled_at desc, f.created_at desc
) latest
where v.id = latest.vehicle_id
  and v.current_odometer_km is null;

-- ---------------------------------------------------------------------------
-- Vehicle updates (dated notes + optional km)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_updates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  note text not null,
  odometer_km numeric,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists vehicle_updates_org_id_idx
  on public.vehicle_updates (organisation_id);
create index if not exists vehicle_updates_vehicle_id_idx
  on public.vehicle_updates (vehicle_id);
create index if not exists vehicle_updates_recorded_at_idx
  on public.vehicle_updates (vehicle_id, recorded_at desc);

drop trigger if exists vehicle_updates_set_updated_at on public.vehicle_updates;
create trigger vehicle_updates_set_updated_at
before update on public.vehicle_updates
for each row execute function public.set_updated_at();

create or replace function public.sync_vehicle_odometer_from_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.odometer_km is not null and new.deleted_at is null then
    update public.vehicles
    set current_odometer_km = new.odometer_km
    where id = new.vehicle_id
      and (
        current_odometer_km is null
        or current_odometer_km < new.odometer_km
      );
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_updates_sync_odometer on public.vehicle_updates;
create trigger vehicle_updates_sync_odometer
after insert or update on public.vehicle_updates
for each row execute function public.sync_vehicle_odometer_from_update();

alter table public.vehicle_updates enable row level security;

drop policy if exists vehicle_updates_select on public.vehicle_updates;
create policy vehicle_updates_select on public.vehicle_updates
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
    )
  );

drop policy if exists vehicle_updates_insert on public.vehicle_updates;
create policy vehicle_updates_insert on public.vehicle_updates
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists vehicle_updates_update on public.vehicle_updates;
create policy vehicle_updates_update on public.vehicle_updates
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists vehicle_updates_delete on public.vehicle_updates;
create policy vehicle_updates_delete on public.vehicle_updates
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

comment on table public.vehicle_updates is
  'Dated operational notes and optional odometer readings for a vehicle.';

-- ---------------------------------------------------------------------------
-- Invoice numbers
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists invoice_number text;

create or replace function public.next_invoice_number(p_organisation_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  yr text := to_char((timezone('utc', now()))::date, 'YYYY');
  seq integer;
begin
  select coalesce(
    max(
      nullif(substring(invoice_number from 'INV-' || yr || '-([0-9]+)$'), '')::integer
    ),
    0
  ) + 1
  into seq
  from public.invoices
  where organisation_id = p_organisation_id
    and invoice_number ~ ('^INV-' || yr || '-[0-9]+$');

  return 'INV-' || yr || '-' || lpad(seq::text, 4, '0');
end;
$$;

with numbered as (
  select
    id,
    'INV-' || to_char(created_at at time zone 'UTC', 'YYYY') || '-' ||
      lpad(
        (
          row_number() over (
            partition by organisation_id, date_part('year', created_at at time zone 'UTC')
            order by created_at, id
          )
        )::text,
        4,
        '0'
      ) as num
  from public.invoices
  where invoice_number is null
)
update public.invoices i
set invoice_number = numbered.num
from numbered
where i.id = numbered.id;

create unique index if not exists invoices_org_number_uidx
  on public.invoices (organisation_id, invoice_number)
  where invoice_number is not null
    and deleted_at is null;

comment on column public.invoices.invoice_number is
  'Human-readable invoice id, unique per organisation among active invoices.';

-- ---------------------------------------------------------------------------
-- log_fuel_fillup: keep vehicles.current_odometer_km in sync
-- ---------------------------------------------------------------------------

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

  update public.vehicles
  set current_odometer_km = p_odometer_km
  where id = p_vehicle_id
    and (
      current_odometer_km is null
      or current_odometer_km < p_odometer_km
    );

  return row;
end;
$$;

-- ---------------------------------------------------------------------------
-- generate_weekly_fuel_invoice: assign invoice_number
-- ---------------------------------------------------------------------------

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
  period_end date;
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

  period_end := p_week_start + 7;

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
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
    and i.period_end = period_end
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
    invoice_number,
    generated_by
  )
  values (
    p_organisation_id,
    p_company_id,
    p_week_start,
    period_end,
    'draft',
    public.next_invoice_number(p_organisation_id),
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
      and f.filled_at < period_end::timestamptz
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

-- ---------------------------------------------------------------------------
-- generate_period_invoice: assign invoice_number
-- ---------------------------------------------------------------------------

create or replace function public.generate_period_invoice(
  p_organisation_id uuid,
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  can_generate boolean;
  existing public.invoices%rowtype;
  inv public.invoices%rowtype;
  fill public.fuel_fillups%rowtype;
  trip_row record;
  card public.rate_cards%rowtype;
  line_amount numeric;
  running_total numeric := 0;
  trip_rate numeric;
  trip_card_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
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
    and i.period_start = p_period_start
    and i.period_end = p_period_end
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
    invoice_number,
    generated_by
  )
  values (
    p_organisation_id,
    p_company_id,
    p_period_start,
    p_period_end,
    'draft',
    public.next_invoice_number(p_organisation_id),
    auth.uid()
  )
  returning * into inv;

  for fill in
    select f.*
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.company_id = p_company_id
      and f.deleted_at is null
      and f.filled_at >= p_period_start::timestamptz
      and f.filled_at < p_period_end::timestamptz
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

  select rc.unit_amount, rc.id into trip_rate, trip_card_id
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.deleted_at is null
    and rc.line_type = 'trip'
    and rc.unit = 'trip'
    and (rc.company_id = p_company_id or rc.company_id is null)
    and rc.effective_from <= p_period_start
    and (rc.effective_to is null or rc.effective_to >= p_period_start)
  order by rc.company_id nulls last, rc.effective_from desc
  limit 1;

  if trip_rate is not null then
    for trip_row in
      select t.id, t.planned_start
      from public.trips t
      join public.trip_assignments ta
        on ta.trip_id = t.id
       and ta.organisation_id = t.organisation_id
       and ta.deleted_at is null
       and ta.released_at is null
      join public.vehicles v
        on v.id = ta.vehicle_id
       and v.deleted_at is null
      where t.organisation_id = p_organisation_id
        and t.deleted_at is null
        and t.status = 'completed'
        and v.company_id = p_company_id
        and t.planned_start >= p_period_start::timestamptz
        and t.planned_start < p_period_end::timestamptz
      order by t.planned_start
    loop
      line_amount := round(trip_rate, 2);
      running_total := running_total + line_amount;

      insert into public.invoice_lines (
        organisation_id,
        invoice_id,
        line_type,
        rate_card_id,
        trip_id,
        description,
        quantity,
        unit_price,
        amount
      )
      values (
        p_organisation_id,
        inv.id,
        'trip',
        trip_card_id,
        trip_row.id,
        format(
          'Completed trip %s',
          to_char(trip_row.planned_start at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
        ),
        1,
        trip_rate,
        line_amount
      );
    end loop;
  end if;

  for card in
    select rc.*
    from public.rate_cards rc
    where rc.organisation_id = p_organisation_id
      and rc.deleted_at is null
      and rc.line_type = 'fixed'
      and rc.unit = 'fixed'
      and (rc.company_id = p_company_id or rc.company_id is null)
      and rc.effective_from < p_period_end
      and (rc.effective_to is null or rc.effective_to >= p_period_start)
    order by rc.name
  loop
    line_amount := round(card.unit_amount, 2);
    running_total := running_total + line_amount;

    insert into public.invoice_lines (
      organisation_id,
      invoice_id,
      line_type,
      rate_card_id,
      description,
      quantity,
      unit_price,
      amount
    )
    values (
      p_organisation_id,
      inv.id,
      'fixed',
      card.id,
      card.name,
      1,
      card.unit_amount,
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

grant execute on function public.next_invoice_number(uuid) to authenticated;
