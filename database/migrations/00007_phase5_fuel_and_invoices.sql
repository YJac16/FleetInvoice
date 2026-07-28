-- =============================================================================
-- WorkOps Phase 5 — Fuel monitoring, weekly company invoices
-- =============================================================================
-- Requires 00001–00006 (has_org_role_names, has_company_scope, current_driver_id).

-- ---------------------------------------------------------------------------
-- Optional company on vehicles (company fleet scope)
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists company_id uuid references public.companies (id) on delete set null;

create index if not exists vehicles_company_id_idx on public.vehicles (company_id);

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'invoice_status'
  ) then
    create type public.invoice_status as enum ('draft', 'issued', 'void');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'invoice_line_type'
  ) then
    create type public.invoice_line_type as enum ('fuel');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- fuel_fillups
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_fillups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  driver_id uuid references public.drivers (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  filled_at timestamptz not null default timezone('utc', now()),
  odometer_km numeric(12, 1) not null,
  litres numeric(12, 2) not null,
  unit_price numeric(12, 4),
  total_amount numeric(14, 2),
  currency text not null default 'ZAR',
  station_name text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint fuel_fillups_odometer_nonneg check (odometer_km >= 0),
  constraint fuel_fillups_litres_positive check (litres > 0)
);

create index if not exists fuel_fillups_org_filled_idx
  on public.fuel_fillups (organisation_id, filled_at desc);
create index if not exists fuel_fillups_vehicle_filled_idx
  on public.fuel_fillups (vehicle_id, filled_at desc);
create index if not exists fuel_fillups_company_filled_idx
  on public.fuel_fillups (company_id, filled_at desc);
create index if not exists fuel_fillups_driver_id_idx
  on public.fuel_fillups (driver_id);

drop trigger if exists fuel_fillups_set_updated_at on public.fuel_fillups;
create trigger fuel_fillups_set_updated_at
before update on public.fuel_fillups
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoices + invoice_lines
-- ---------------------------------------------------------------------------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  status public.invoice_status not null default 'draft',
  currency text not null default 'ZAR',
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  notes text,
  generated_by uuid references auth.users (id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint invoices_period_check check (period_end > period_start)
);

create index if not exists invoices_org_company_idx
  on public.invoices (organisation_id, company_id);
create index if not exists invoices_period_idx
  on public.invoices (period_start, period_end);

create unique index if not exists invoices_org_company_week_active_uidx
  on public.invoices (organisation_id, company_id, period_start, period_end)
  where deleted_at is null and status <> 'void';

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_type public.invoice_line_type not null default 'fuel',
  fuel_fillup_id uuid references public.fuel_fillups (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 4) not null default 0,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists invoice_lines_invoice_id_idx
  on public.invoice_lines (invoice_id);

-- ---------------------------------------------------------------------------
-- RPC: log_fuel_fillup (odometer monotonic)
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

  return row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: generate_weekly_fuel_invoice
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
    generated_by
  )
  values (
    p_organisation_id,
    p_company_id,
    p_week_start,
    period_end,
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

grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to authenticated;
grant execute on function public.generate_weekly_fuel_invoice(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: fuel_fillups
-- ---------------------------------------------------------------------------

alter table public.fuel_fillups enable row level security;

drop policy if exists fuel_fillups_select on public.fuel_fillups;
create policy fuel_fillups_select on public.fuel_fillups
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          public.has_org_role_names(
            organisation_id,
            array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
          )
          or driver_id = public.current_driver_id(organisation_id)
          or (
            company_id is not null
            and public.has_company_scope(organisation_id, company_id)
          )
        )
      )
    )
  );

drop policy if exists fuel_fillups_insert on public.fuel_fillups;
create policy fuel_fillups_insert on public.fuel_fillups
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists fuel_fillups_update on public.fuel_fillups;
create policy fuel_fillups_update on public.fuel_fillups
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

-- Tighten vehicles SELECT for company managers when company_id set
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array[
          'organisation_admin',
          'manager',
          'dispatcher',
          'supervisor',
          'driver'
        ]
      )
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: invoices / invoice_lines
-- ---------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          public.has_org_role_names(
            organisation_id,
            array['organisation_admin', 'manager', 'dispatcher']
          )
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select
  using (
    public.is_platform_owner()
    or organisation_id in (select public.user_organisation_ids())
  );

comment on table public.fuel_fillups is 'Driver/ops fuel fill-ups with odometer km.';
comment on table public.invoices is 'Weekly (or period) company invoices; MVP lines are fuel.';
comment on function public.log_fuel_fillup is
  'Insert fuel fill-up; rejects odometer lower than previous fill for vehicle.';
comment on function public.generate_weekly_fuel_invoice is
  'Idempotent weekly fuel invoice for a company [week_start, week_start+7).';
