-- =============================================================================
-- 00094: fuel fill-ups priced from the fuel price table, price locked
-- =============================================================================
-- Rules (Yaseen, 25 Nov 2026):
--   * Every fill-up (dispatcher, supervisor or driver) is priced from the
--     CONFIRMED org rate in force on the slip date (filled_at as an
--     Africa/Johannesburg date, rate effective_from <= slip date). The price
--     then locks and never changes.
--   * No confirmed rate => price_status 'needs_price', money stays NULL (never
--     0), and the fill is excluded from invoicing until priced (00095 backfill
--     is an opt-in admin action).
--   * Billing price is never visible to drivers. This TIGHTENS 00086: drivers
--     no longer get amounts back from log_fuel_fillup or
--     list_fuel_fillup_amounts. Dispatcher / supervisor stay at no money.
--
-- (a) New columns: fuel_type, region (default 'coastal'), price_status
--     ('priced' | 'needs_price'), priced_from_id -> fuel_prices, priced_at.
--     Existing rows that already carry money (manually entered before this
--     change) become 'priced' with priced_from_id null (legacy lock); rows with
--     a unit price but no total get total = round(litres * unit_price, 2), the
--     amount 00087 already invoiced them at. Rows without money become
--     'needs_price'. Nothing is invented.
-- (b) Grants: SELECT on fuel_type, region only (00086 pattern; money,
--     price_status, priced_from_id, priced_at stay hidden from authenticated).
--     INSERT / UPDATE for authenticated are limited to the ops columns, so a
--     client cannot write a price directly; prices are set only by the
--     SECURITY DEFINER RPCs.
-- (c) Guard trigger: once 'priced', money / currency / priced_from_id /
--     priced_at / price_status cannot change (any role, any path).
-- (d) log_fuel_fillup recreated (00086 body): new required p_fuel_type and
--     optional p_region; p_unit_price is kept for compatibility and IGNORED
--     for every caller. Money + status are masked on return unless platform
--     owner / organisation_admin / manager.
-- (e) list_fuel_fillup_amounts recreated: adds price_status, priced_from_id,
--     priced_at; finance only, 0 rows for drivers, dispatcher, supervisor and
--     everyone else.
-- (f) generate_weekly_fuel_invoice recreated from the 00087 body: auth (00085)
--     and v_period_end unchanged, existing-invoice short-circuit unchanged; no
--     coalesce(..., 0); if the company-week has any needs_price / null-money
--     fill it raises and creates no invoice. The week is matched on the
--     Africa/Johannesburg slip date.
-- (g) upsert_org_fuel_price recreated: a rate that has priced fill-ups is
--     immutable.
-- Not applied to any remote database from the PR.
-- Rollback: supabase/rollback-00094.sql
-- =============================================================================

begin;

-- (a) columns ------------------------------------------------------------------
alter table public.fuel_fillups
  add column if not exists fuel_type text,
  add column if not exists region text not null default 'coastal',
  add column if not exists price_status text not null default 'needs_price',
  add column if not exists priced_from_id uuid references public.fuel_prices (id) on delete restrict,
  add column if not exists priced_at timestamptz;

create index if not exists fuel_fillups_priced_from_id_idx on public.fuel_fillups (priced_from_id);
create index if not exists fuel_fillups_org_needs_price_idx
  on public.fuel_fillups (organisation_id, filled_at)
  where price_status = 'needs_price' and deleted_at is null;

-- Legacy rows (before the trigger exists).
update public.fuel_fillups
set total_amount = round(litres * unit_price, 2)
where total_amount is null
  and unit_price is not null;

update public.fuel_fillups
set price_status = case when total_amount is not null then 'priced' else 'needs_price' end
where price_status is distinct from case when total_amount is not null then 'priced' else 'needs_price' end;

alter table public.fuel_fillups drop constraint if exists fuel_fillups_price_status_check;
alter table public.fuel_fillups add constraint fuel_fillups_price_status_check
  check (
    (price_status = 'priced' and total_amount is not null)
    or (price_status = 'needs_price' and unit_price is null and total_amount is null and priced_from_id is null)
  );
alter table public.fuel_fillups drop constraint if exists fuel_fillups_fuel_type_format;
alter table public.fuel_fillups add constraint fuel_fillups_fuel_type_format
  check (fuel_type is null or fuel_type ~ '^[a-z0-9_]{2,40}$');
alter table public.fuel_fillups drop constraint if exists fuel_fillups_region_format;
alter table public.fuel_fillups add constraint fuel_fillups_region_format
  check (region ~ '^[a-z0-9_]{2,40}$');

comment on column public.fuel_fillups.price_status is
  'priced = locked billing price (from fuel_prices, or legacy manual); needs_price = no confirmed rate on the slip date, money null, not invoiceable.';

-- (b) grants -------------------------------------------------------------------
-- The table-level SELECT is already gone since 00086 (no-op on hosted);
-- revoking it again keeps 00094 self-contained. The 00086 column list is
-- re-asserted unchanged; the only new SELECT columns are fuel_type, region.
revoke select on table public.fuel_fillups from authenticated, anon;
revoke select (unit_price, total_amount, currency, price_status, priced_from_id, priced_at)
  on table public.fuel_fillups from authenticated, anon;
grant select (
  id, organisation_id, vehicle_id, driver_id, company_id, filled_at, odometer_km,
  litres, station_name, notes, created_by, created_at, updated_at, deleted_at
) on table public.fuel_fillups to authenticated;
grant select (fuel_type, region) on table public.fuel_fillups to authenticated;

revoke insert, update on table public.fuel_fillups from authenticated, anon;
revoke insert (unit_price, total_amount, currency, price_status, priced_from_id, priced_at)
  on table public.fuel_fillups from authenticated, anon;
revoke update (unit_price, total_amount, currency, price_status, priced_from_id, priced_at)
  on table public.fuel_fillups from authenticated, anon;
grant insert (
  id, organisation_id, vehicle_id, driver_id, company_id, filled_at, odometer_km,
  litres, station_name, notes, created_by, deleted_at, fuel_type, region
) on table public.fuel_fillups to authenticated;
grant update (
  vehicle_id, driver_id, company_id, filled_at, odometer_km, litres,
  station_name, notes, deleted_at, fuel_type, region
) on table public.fuel_fillups to authenticated;

-- (c) lock trigger -------------------------------------------------------------
create or replace function public.fuel_fillups_guard_price_lock()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.price_status = 'priced' and (
    new.price_status is distinct from old.price_status
    or new.unit_price is distinct from old.unit_price
    or new.total_amount is distinct from old.total_amount
    or new.currency is distinct from old.currency
    or new.priced_from_id is distinct from old.priced_from_id
    or new.priced_at is distinct from old.priced_at
  ) then
    raise exception 'Fuel fill-up price is locked'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.fuel_fillups_guard_price_lock() from public, anon, authenticated;

drop trigger if exists fuel_fillups_price_lock on public.fuel_fillups;
create trigger fuel_fillups_price_lock
before update on public.fuel_fillups
for each row execute function public.fuel_fillups_guard_price_lock();

-- (d) log_fuel_fillup ----------------------------------------------------------
drop function if exists public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
);

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
  p_notes text default null,
  p_fuel_type text default null,
  p_region text default null
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
  is_finance boolean;
  v_filled_at timestamptz;
  v_region text;
  v_slip date;
  v_price public.fuel_prices%rowtype;
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
  is_finance := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager']
    );

  driver := coalesce(p_driver_id, public.current_driver_id(p_organisation_id));
  is_self_driver := driver is not null
    and driver = public.current_driver_id(p_organisation_id);

  if not (is_ops or is_self_driver) then
    raise exception 'Not authorised to log fuel';
  end if;

  if p_fuel_type is null or trim(p_fuel_type) = '' then
    raise exception 'Fuel type is required';
  end if;
  if trim(p_fuel_type) !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Invalid fuel type';
  end if;
  v_region := coalesce(nullif(trim(p_region), ''), 'coastal');
  if v_region !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Invalid region';
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

  -- p_unit_price is ignored for every caller: the price comes from the table.
  v_filled_at := coalesce(p_filled_at, now());
  v_slip := (timezone('Africa/Johannesburg', v_filled_at))::date;

  select * into v_price
  from public.resolve_fuel_unit_price(p_organisation_id, trim(p_fuel_type), v_region, v_slip);

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
    created_by,
    fuel_type,
    region,
    price_status,
    priced_from_id,
    priced_at
  )
  values (
    p_organisation_id,
    p_vehicle_id,
    driver,
    company,
    v_filled_at,
    p_odometer_km,
    p_litres,
    v_price.price_per_litre,
    case when v_price.id is not null then round(p_litres * v_price.price_per_litre, 2) end,
    nullif(trim(p_station_name), ''),
    nullif(trim(p_notes), ''),
    auth.uid(),
    trim(p_fuel_type),
    v_region,
    case when v_price.id is not null then 'priced' else 'needs_price' end,
    v_price.id,
    case when v_price.id is not null then timezone('utc', now()) end
  )
  returning * into row;

  if not is_finance then
    row.unit_price := null;
    row.total_amount := null;
    row.currency := null;
    row.price_status := null;
    row.priced_from_id := null;
    row.priced_at := null;
  end if;

  return row;
end;
$$;

revoke all on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text, text, text
) from public, anon;
grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text, text, text
) to authenticated;

-- (e) list_fuel_fillup_amounts -------------------------------------------------
drop function if exists public.list_fuel_fillup_amounts(uuid);

create or replace function public.list_fuel_fillup_amounts(
  p_organisation_id uuid
)
returns table (
  id uuid,
  unit_price numeric,
  total_amount numeric,
  currency text,
  price_status text,
  priced_from_id uuid,
  priced_at timestamptz
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
    select f.id, f.unit_price, f.total_amount, f.currency,
           f.price_status, f.priced_from_id, f.priced_at
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.deleted_at is null;
  end if;
  -- drivers, dispatcher, supervisor and everyone else: no rows
end;
$$;

revoke all on function public.list_fuel_fillup_amounts(uuid) from public, anon;
grant execute on function public.list_fuel_fillup_amounts(uuid) to authenticated;

-- (f) generate_weekly_fuel_invoice ---------------------------------------------
create or replace function public.generate_weekly_fuel_invoice(
  p_organisation_id uuid,
  p_company_id uuid,
  p_week_start date
)
returns public.invoices
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period_end date;
  existing public.invoices%rowtype;
  inv public.invoices%rowtype;
  can_generate boolean;
  fill record;
  v_unpriced integer;
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

  select count(*)::integer into v_unpriced
  from public.fuel_fillups f
  where f.organisation_id = p_organisation_id
    and f.company_id = p_company_id
    and f.deleted_at is null
    and timezone('Africa/Johannesburg', f.filled_at) >= p_week_start::timestamp
    and timezone('Africa/Johannesburg', f.filled_at) < v_period_end::timestamp
    and (f.price_status <> 'priced' or f.total_amount is null);

  if v_unpriced > 0 then
    raise exception 'Cannot invoice this fuel week: % fill-up(s) need a price. Confirm or enter the fuel rate, then price them.', v_unpriced
      using errcode = 'check_violation';
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
    select f.id, f.litres, f.odometer_km, f.filled_at, f.unit_price, f.total_amount
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.company_id = p_company_id
      and f.deleted_at is null
      and timezone('Africa/Johannesburg', f.filled_at) >= p_week_start::timestamp
      and timezone('Africa/Johannesburg', f.filled_at) < v_period_end::timestamp
    order by f.filled_at
  loop
    if fill.total_amount is null then
      raise exception 'Cannot invoice this fuel week: a fill-up needs a price'
        using errcode = 'check_violation';
    end if;
    running_total := running_total + fill.total_amount;

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
        to_char(timezone('Africa/Johannesburg', fill.filled_at), 'YYYY-MM-DD')
      ),
      fill.litres,
      fill.unit_price,
      fill.total_amount
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

revoke all on function public.generate_weekly_fuel_invoice(uuid, uuid, date) from public, anon;
grant execute on function public.generate_weekly_fuel_invoice(uuid, uuid, date) to authenticated;

-- (g) upsert_org_fuel_price: a rate that has priced fill-ups is immutable -------
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
    if exists (
      select 1 from public.fuel_fillups f where f.priced_from_id = v_existing.id
    ) then
      raise exception 'This rate has already priced fill-ups and is locked; add a new effective date instead';
    end if;
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

commit;
