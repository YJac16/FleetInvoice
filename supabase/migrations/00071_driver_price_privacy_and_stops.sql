-- =============================================================================
-- 00071 — Driver price privacy, ordered stops, Cape Town place proposals
-- =============================================================================
-- Does not UPDATE or DELETE existing trips, locations, rate cards, route prices,
-- or invoices. New columns are nullable or a constant default (metadata-only in
-- PostgreSQL 11+). Existing rows stay as they are.
--
-- Drivers:
--   * cannot execute suggest_trip_unit_price
--   * cannot select rate cards
--   * cannot select trips.manual_unit_price / manual_price_area_key
--   * cannot select fuel_fillups.unit_price / total_amount
--   * receive null price columns from staff-trip status RPCs
-- Staff pricing, approval, print and invoices keep using the same functions.
-- A trip with 3 or more route_stops does not take a company or route price.
-- Staff must enter the amount. Two-stop trips are unchanged.

-- ---------------------------------------------------------------------------
-- Locations: optional map identity. Existing catalogue rows are not rewritten.
-- ---------------------------------------------------------------------------

alter table public.locations
  add column if not exists place_id text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists needs_review boolean not null default false,
  add column if not exists source text;

comment on column public.locations.place_id is
  'Google Places id when a driver confirmed the place on the map. Null for catalogue and typed names.';
comment on column public.locations.needs_review is
  'True when a driver typed a name that was not in the catalogue or on the map. Admin should confirm it.';
comment on column public.locations.source is
  'catalogue, google_places, or driver_typed. Null on rows that existed before this column.';

-- ---------------------------------------------------------------------------
-- Ordered stops. Null on every existing trip.
-- ---------------------------------------------------------------------------

alter table public.trips
  add column if not exists route_stops jsonb;

alter table public.trips drop constraint if exists trips_route_stops_array;
alter table public.trips
  add constraint trips_route_stops_array
  check (route_stops is null or jsonb_typeof(route_stops) = 'array');

comment on column public.trips.route_stops is
  'Ordered places for a driver submission: pickup first, final drop-off last. Null on older trips. Three or more means no automatic price.';

create or replace function public.trip_is_multi_stop(p_stops jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_stops) = 'array' and jsonb_array_length(p_stops) >= 3;
$$;

revoke all on function public.trip_is_multi_stop(jsonb) from public, anon;
grant execute on function public.trip_is_multi_stop(jsonb) to authenticated;

create or replace function public.format_route_stop_area(p_stops jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_len int;
  v_name text;
  v_label text;
  v_parts text[] := '{}';
  i int;
begin
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    return null;
  end if;
  v_len := jsonb_array_length(p_stops);
  if v_len < 2 then
    return null;
  end if;
  if v_len = 2 then
    return trim(coalesce(p_stops->0->>'name', ''))
      || ' → '
      || trim(coalesce(p_stops->1->>'name', ''));
  end if;
  for i in 0..(v_len - 1) loop
    v_name := trim(coalesce(p_stops->i->>'name', ''));
    if i = 0 then
      v_label := 'Pickup';
    elsif i = v_len - 1 then
      v_label := 'Final drop-off';
    else
      v_label := 'Stop ' || (i + 1)::text;
    end if;
    v_parts := array_append(v_parts, v_label || ': ' || v_name);
  end loop;
  return array_to_string(v_parts, ' → ');
end;
$$;

revoke all on function public.format_route_stop_area(jsonb) from public, anon;
grant execute on function public.format_route_stop_area(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Hide billed prices from driver sessions
-- ---------------------------------------------------------------------------


drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
      or (
        case
          when public.is_company_manager(organisation_id) then
            company_id is not null
            and public.company_user_can_see(organisation_id, company_id)
          else
            company_id is not null
            and public.has_company_scope(organisation_id, company_id)
            and not public.has_org_role_names(
              organisation_id,
              array['driver', 'employee']
            )
        end
      )
    )
  );

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
            case
              when public.is_company_manager(organisation_id) then
                false
              else
                company_id is not null
                and public.has_company_scope(organisation_id, company_id)
                and not public.has_org_role_names(
                  organisation_id,
                  array['driver', 'employee']
                )
            end
          )
        )
      )
    )
  );

revoke select (manual_unit_price, manual_price_area_key)
  on public.trips from public, anon, authenticated;

revoke select (unit_price, total_amount)
  on public.fuel_fillups from public, anon, authenticated;

create or replace function public.list_fuel_amounts_for_staff(p_organisation_id uuid)
returns table (id uuid, unit_price numeric, total_amount numeric)
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
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    return;
  end if;

  return query
  select f.id, f.unit_price, f.total_amount
  from public.fuel_fillups f
  where f.organisation_id = p_organisation_id
    and f.deleted_at is null;
end;
$$;

revoke all on function public.list_fuel_amounts_for_staff(uuid) from public, anon;
grant execute on function public.list_fuel_amounts_for_staff(uuid) to authenticated;

comment on function public.list_fuel_amounts_for_staff(uuid) is
  'Staff-only fuel prices. Drivers cannot select unit_price or total_amount on fuel_fillups.';

create or replace function public.suggest_trip_unit_price(
  p_organisation_id uuid,
  p_company_id uuid,
  p_area_text text,
  p_trip_date date default null
)
returns table (
  unit_amount numeric,
  price_source text,
  route_price_id uuid,
  rate_card_id uuid,
  label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_trip_date date;
  v_route_id uuid;
  v_route_amount numeric;
  v_route_label text;
  v_card_amount numeric;
  v_card_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.staff_can_manage_trips(p_organisation_id) then
    raise exception 'Not authorised';
  end if;

  -- Multi-stop driver routes are labelled "Stop 2:". Do not suggest a rate.
  if coalesce(p_area_text, '') ~* 'stop[[:space:]]*2[[:space:]]*:' then
    unit_amount := null;
    price_source := 'none';
    route_price_id := null;
    rate_card_id := null;
    label := null;
    return next;
    return;
  end if;

  v_trip_date := coalesce(
    p_trip_date,
    (timezone('utc', now()) at time zone 'Africa/Johannesburg')::date
  );

  select rp.route_price_id, rp.unit_amount, rp.label
  into v_route_id, v_route_amount, v_route_label
  from public.resolve_route_price(p_organisation_id, p_company_id, p_area_text) rp;

  select x.unit_amount, x.rate_card_id
  into v_card_amount, v_card_id
  from public.resolve_trip_line_rate(p_organisation_id, p_company_id, v_trip_date) x;

  if v_route_id is not null
     and v_card_amount is not null
     and round(v_route_amount, 2) is distinct from round(v_card_amount, 2) then
    unit_amount := v_route_amount;
    price_source := 'route_price';
    route_price_id := v_route_id;
    rate_card_id := v_card_id;
    label := v_route_label;
  elsif v_card_amount is not null then
    unit_amount := v_card_amount;
    price_source := 'rate_card';
    route_price_id := null;
    rate_card_id := v_card_id;
    label := 'Company rate';
  elsif v_route_id is not null then
    unit_amount := v_route_amount;
    price_source := 'route_price';
    route_price_id := v_route_id;
    rate_card_id := null;
    label := v_route_label;
  else
    unit_amount := null;
    price_source := 'none';
    route_price_id := null;
    rate_card_id := null;
    label := null;
  end if;

  return next;
end;
$$;


revoke all on function public.suggest_trip_unit_price(uuid, uuid, text, date) from public, anon;
grant execute on function public.suggest_trip_unit_price(uuid, uuid, text, date) to authenticated;

comment on function public.suggest_trip_unit_price(uuid, uuid, text, date) is
  'Staff only. Drivers are not authorised. A labelled multi-stop area returns no price.';

create or replace function public.set_staff_trip_status(
  p_trip_id uuid,
  p_new_status public.trip_status,
  p_event public.trip_event_type,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  a public.trip_assignments%rowtype;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  select * into a
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.released_at is null
    and ta.deleted_at is null
  limit 1;

  update public.trips
  set status = p_new_status
  where id = p_trip_id
  returning * into t;

  insert into public.trip_events (
    organisation_id,
    trip_id,
    assignment_id,
    event_type,
    actor_id,
    notes,
    metadata
  )
  values (
    t.organisation_id,
    p_trip_id,
    a.id,
    p_event,
    auth.uid(),
    p_notes,
    coalesce(p_metadata, '{}'::jsonb)
  );

  if p_new_status = 'completed' then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);
  elsif p_new_status = 'cancelled' then
    perform public.sync_staff_trip_invoice_line(p_trip_id, true);
  end if;

  if not public.is_platform_owner()
     and not public.staff_can_manage_trips(t.organisation_id) then
    t.manual_unit_price := null;
    t.manual_price_area_key := null;
  end if;

  return t;
end;
$$;


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

  -- Drivers do not record or receive a pump price. Staff still can.
  if not is_ops then
    p_unit_price := null;
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


revoke all on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) from public, anon;
grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to authenticated;

create or replace function public.sync_staff_trip_invoice_line(
  p_trip_id uuid,
  p_remove boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
  v_bounds record;
  v_bill_to uuid;
  inv public.invoices%rowtype;
  v_rate numeric;
  v_rate_card_id uuid;
  v_rate_effective_on date;
  v_line_amount numeric;
  v_description text;
  v_line_id uuid;
  v_old_invoice_id uuid;
  v_trip_date date;
  v_existing_trip_company_id uuid;
  v_existing_rate_card_id uuid;
  v_existing_unit_price numeric;
  v_existing_rate_effective_on date;
  v_existing_price_overridden boolean;
  v_existing_override_reason text;
  v_existing_route_price_id uuid;
  v_existing_priced_area_key text;
  v_preserve_rate boolean := false;
  v_override numeric;
  v_override_reason text;
  v_price_overridden boolean := false;
  v_area_key text;
  v_route_price_id uuid := null;
  v_matched_route_id uuid;
  v_matched_route_amount numeric;
  v_card_amount numeric;
  v_card_id uuid;
  v_card_effective date;
  v_route_changed boolean := false;
  v_use_route boolean := false;
  v_can_preserve boolean := false;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    return null;
  end if;

  select il.id, il.invoice_id
  into v_line_id, v_old_invoice_id
  from public.invoice_lines il
  where il.trip_id = p_trip_id
  limit 1;

  if p_remove or t.status = 'cancelled' then
    if v_line_id is not null then
      select * into inv
      from public.invoices i
      where i.id = v_old_invoice_id
        and i.deleted_at is null;

      if found and inv.status <> 'draft' then
        raise exception 'Cannot remove line: invoice is % (only draft invoices can be synced)', inv.status;
      end if;

      delete from public.invoice_lines where id = v_line_id;
      if v_old_invoice_id is not null then
        perform public.recalculate_invoice_totals(v_old_invoice_id);
      end if;
    end if;
    update public.trips
    set reprice_on_next_sync = false
    where id = p_trip_id
      and reprice_on_next_sync;
    return null;
  end if;

  if t.status <> 'completed' then
    return null;
  end if;

  if public.driver_submission_pending(t) then
    return null;
  end if;

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.organisation_id = t.organisation_id
    and ta.deleted_at is null
    and ta.released_at is null
  limit 1;

  if v_driver_id is null then
    raise exception 'Trip has no active driver assignment';
  end if;

  if t.company_id is null then
    raise exception 'Trip company is not set';
  end if;

  v_trip_date := (t.planned_start at time zone 'Africa/Johannesburg')::date;
  select * into v_bounds from public.service_week_bounds_sast(t.planned_start);
  v_area_key := public.route_area_key(coalesce(t.area_text, ''));

  select bo.override_unit_price, bo.reason
  into v_override, v_override_reason
  from public.trip_billing_overrides bo
  where bo.trip_id = p_trip_id;

  -- A price typed for this route wins, with an empty invoice reason.
  -- A saved billing override still wins when nothing was typed for this route,
  -- so existing overrides keep their amount and reason.
  if t.manual_unit_price is not null
     and t.manual_price_area_key is not distinct from v_area_key then
    v_rate := t.manual_unit_price;
    v_price_overridden := true;
    v_override_reason := null;
    v_route_price_id := null;
    select x.rate_card_id, x.rate_effective_on
    into v_rate_card_id, v_rate_effective_on
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date) x;
    v_rate_effective_on := coalesce(v_rate_effective_on, v_trip_date);
  elsif v_override is not null then
    v_rate := v_override;
    v_rate_card_id := null;
    v_rate_effective_on := v_trip_date;
    v_price_overridden := true;
  else
    v_override_reason := null;
    v_price_overridden := false;

    if public.trip_is_multi_stop(t.route_stops) then
      raise exception 'Multi-stop trips need a price entered by staff. No company or route price is applied.';
    end if;

    if v_line_id is not null then
      select
        il.trip_company_id,
        il.rate_card_id,
        il.unit_price,
        il.rate_effective_on,
        il.price_overridden,
        il.override_reason,
        il.route_price_id,
        il.priced_area_key
      into
        v_existing_trip_company_id,
        v_existing_rate_card_id,
        v_existing_unit_price,
        v_existing_rate_effective_on,
        v_existing_price_overridden,
        v_existing_override_reason,
        v_existing_route_price_id,
        v_existing_priced_area_key
      from public.invoice_lines il
      where il.id = v_line_id;
    end if;

    select rp.route_price_id, rp.unit_amount
    into v_matched_route_id, v_matched_route_amount
    from public.resolve_route_price(t.organisation_id, t.company_id, t.area_text) rp;

    select x.unit_amount, x.rate_card_id, x.rate_effective_on
    into v_card_amount, v_card_id, v_card_effective
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date) x;

    v_route_changed := t.reprice_on_next_sync
      or (
        v_existing_priced_area_key is not null
        and v_existing_priced_area_key is distinct from v_area_key
      );

    v_use_route := v_matched_route_id is not null
      and v_card_amount is not null
      and round(v_matched_route_amount, 2) is distinct from round(v_card_amount, 2);

    v_can_preserve := v_line_id is not null
      and v_existing_trip_company_id = t.company_id
      and v_existing_rate_card_id is not null
      and v_existing_unit_price is not null;

    if v_can_preserve and not v_route_changed then
      -- Unchanged route: keep the snapshotted amount, including lines written
      -- before templates existed (priced_area_key is null).
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
      v_price_overridden := coalesce(v_existing_price_overridden, false);
      v_override_reason := v_existing_override_reason;
      v_route_price_id := v_existing_route_price_id;
    elsif v_can_preserve
      and v_route_changed
      and not v_use_route
      and v_existing_route_price_id is null
      and coalesce(v_existing_price_overridden, false) = false then
      -- Route changed but no template applies, and the line was a plain rate-card
      -- price. Leave that snapshot alone (same as before templates existed).
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
      v_price_overridden := false;
      v_override_reason := null;
      v_route_price_id := null;
    elsif v_use_route then
      v_rate := v_matched_route_amount;
      v_rate_card_id := v_card_id;
      v_rate_effective_on := coalesce(v_card_effective, v_trip_date);
      v_price_overridden := true;
      v_override_reason := null;
      v_route_price_id := v_matched_route_id;
    else
      if v_card_amount is null then
        raise exception 'No trip rate configured for this company. Add a rate before saving this waybill.';
      end if;
      v_rate := v_card_amount;
      v_rate_card_id := v_card_id;
      v_rate_effective_on := v_card_effective;
      v_price_overridden := false;
      v_override_reason := null;
      v_route_price_id := null;
    end if;
  end if;

  v_bill_to := public.resolve_invoice_bill_to_company_id(t.organisation_id);
  if v_bill_to is null then
    raise exception 'Bill-to company not configured (set organisations.settings.invoice_bill_to_company_id or add WCL Trading CC)';
  end if;

  select * into inv
  from public.invoices i
  where i.organisation_id = t.organisation_id
    and i.driver_id = v_driver_id
    and i.period_start = v_bounds.period_start
    and (
      i.period_end = v_bounds.period_end
      or i.period_end = v_bounds.period_end + 1
    )
    and coalesce(i.trip_company, '') = ''
    and i.deleted_at is null
  limit 1;

  if found and inv.status <> 'draft' then
    raise exception 'Cannot add trip line: weekly invoice is % (must be draft)', inv.status;
  end if;

  if not found then
    insert into public.invoices (
      organisation_id,
      company_id,
      driver_id,
      period_start,
      period_end,
      status,
      generated_by,
      notes
    )
    values (
      t.organisation_id,
      v_bill_to,
      v_driver_id,
      v_bounds.period_start,
      v_bounds.period_end,
      'draft',
      auth.uid(),
      format(
        'Invoice date %s (Monday after Sunday %s)',
        to_char(v_bounds.period_end + 1, 'DD/MM/YYYY'),
        to_char(v_bounds.period_end, 'DD/MM/YYYY')
      )
    )
    returning * into inv;
  end if;

  v_line_amount := round(v_rate, 2);
  v_description := public.staff_trip_invoice_line_description(t);

  if v_line_id is not null and v_old_invoice_id is distinct from inv.id then
    delete from public.invoice_lines where id = v_line_id;
    perform public.recalculate_invoice_totals(v_old_invoice_id);
    v_line_id := null;
  end if;

  if v_line_id is null then
    insert into public.invoice_lines (
      organisation_id,
      invoice_id,
      line_type,
      rate_card_id,
      trip_id,
      trip_company_id,
      rate_effective_on,
      description,
      quantity,
      unit_price,
      amount,
      price_overridden,
      override_reason,
      route_price_id,
      priced_area_key
    )
    values (
      t.organisation_id,
      inv.id,
      'trip',
      v_rate_card_id,
      p_trip_id,
      t.company_id,
      v_rate_effective_on,
      v_description,
      1,
      v_rate,
      v_line_amount,
      v_price_overridden,
      v_override_reason,
      v_route_price_id,
      v_area_key
    )
    returning id into v_line_id;
  else
    update public.invoice_lines
    set invoice_id = inv.id,
        rate_card_id = v_rate_card_id,
        trip_company_id = t.company_id,
        rate_effective_on = v_rate_effective_on,
        description = v_description,
        quantity = 1,
        unit_price = v_rate,
        amount = v_line_amount,
        price_overridden = v_price_overridden,
        override_reason = v_override_reason,
        route_price_id = v_route_price_id,
        priced_area_key = v_area_key
    where id = v_line_id;
  end if;

  perform public.recalculate_invoice_totals(inv.id);

  update public.trips
  set reprice_on_next_sync = false
  where id = p_trip_id
    and reprice_on_next_sync;

  return v_line_id;
end;
$$;


revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public, anon;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to authenticated;


create or replace function public.enforce_multi_stop_staff_price()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if public.trip_is_multi_stop(new.route_stops)
     and new.approved_at is not null
     and old.approved_at is null
     and new.manual_unit_price is null then
    raise exception 'Multi-stop trips need a price entered by staff. No company or route price is applied.';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_enforce_multi_stop_staff_price on public.trips;
create trigger trips_enforce_multi_stop_staff_price
before update on public.trips
for each row
execute function public.enforce_multi_stop_staff_price();


drop function if exists public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text
);

create or replace function public.submit_driver_trip(
  p_organisation_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_total_km numeric,
  p_notes text default null,
  p_stops jsonb default null
)
returns table (trip_id uuid, duplicate_warning boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_driver_id uuid;
  v_pickup text;
  v_dropoff text;
  v_area text;
  v_locations text;
  v_trip_id uuid;
  v_warn boolean;
  v_trip public.trips%rowtype;
  v_len int;
  v_name text;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'Driver profile not found for this organisation';
  end if;

  if not public.has_org_role_names(p_organisation_id, array['driver']) then
    raise exception 'Only drivers can submit trips';
  end if;

  if p_stops is not null then
    if jsonb_typeof(p_stops) <> 'array' then
      raise exception 'Stops must be a list';
    end if;
    v_len := jsonb_array_length(p_stops);
    if v_len < 2 or v_len > 12 then
      raise exception 'A trip needs a pickup, a drop-off, and at most 10 extra stops';
    end if;
    for i in 0..(v_len - 1) loop
      v_name := trim(coalesce(p_stops->i->>'name', ''));
      if v_name = '' then
        raise exception 'Each stop needs a place name';
      end if;
    end loop;
    v_pickup := trim(p_stops->0->>'name');
    v_dropoff := trim(p_stops->(v_len - 1)->>'name');
    v_area := public.format_route_stop_area(p_stops);
    select string_agg(trim(item.value->>'name'), ' / ' order by item.ord)
      into v_locations
    from jsonb_array_elements(p_stops) with ordinality as item(value, ord);
  else
    v_pickup := trim(coalesce(p_pickup, ''));
    v_dropoff := trim(coalesce(p_dropoff, ''));
    if v_pickup = '' or v_dropoff = '' then
      raise exception 'Pickup and drop-off are required';
    end if;
    v_area := v_pickup || ' → ' || v_dropoff;
    v_locations := v_pickup || ' / ' || v_dropoff;
  end if;

  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if p_total_km is null or p_total_km < 0 then
    raise exception 'Km must be non-negative';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
      and c.status = 'active'
  ) then
    raise exception 'Company not found or inactive';
  end if;

  v_warn := public.driver_trip_duplicate_warning(
    p_organisation_id,
    v_driver_id,
    p_company_id,
    p_planned_start,
    v_area
  );

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    area_text,
    service_locations,
    pax_count,
    total_km,
    notes,
    submitted_by_driver,
    approved_by,
    approved_at,
    rejected_reason,
    created_by,
    manual_unit_price,
    manual_price_area_key,
    route_stops
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    'planned'::public.trip_status,
    true,
    v_area,
    v_locations,
    p_pax_count,
    p_total_km,
    nullif(trim(coalesce(p_notes, '')), ''),
    true,
    null,
    null,
    null,
    auth.uid(),
    null,
    null,
    case when p_stops is null then null else p_stops end
  )
  returning id into v_trip_id;

  insert into public.trip_assignments (
    organisation_id,
    trip_id,
    driver_id,
    vehicle_id,
    assigned_by
  )
  values (
    p_organisation_id,
    v_trip_id,
    v_driver_id,
    null,
    auth.uid()
  );

  select * into v_trip from public.trips where id = v_trip_id;

  insert into public.trip_driver_submission_snapshots (trip_id, organisation_id, payload)
  values (
    v_trip_id,
    p_organisation_id,
    jsonb_build_object(
      'trip', to_jsonb(v_trip) - 'manual_unit_price' - 'manual_price_area_key',
      'assignment', jsonb_build_object(
        'driver_id', v_driver_id,
        'vehicle_id', null
      ),
      'submitted_at', timezone('utc', now())
    )
  );

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text, jsonb
) from public, anon;
grant execute on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text, jsonb
) to authenticated;

comment on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text, jsonb
) is
  'Driver submissions cannot set a price. Two stops keep pickup → drop-off. Three or more store the labelled route and are not auto-priced.';


create or replace function public.propose_service_location(
  p_organisation_id uuid,
  p_name text,
  p_place_id text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_verified boolean default false
)
returns table (id uuid, name text, needs_review boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
  v_existing public.locations%rowtype;
  v_inside boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['driver', 'organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Enter a place name';
  end if;

  -- Same rectangle as lib/maps/cape-town-bounds.ts
  v_inside := p_latitude is not null
    and p_longitude is not null
    and p_latitude between -34.50 and -32.90
    and p_longitude between 17.95 and 19.45;

  if coalesce(p_verified, false) and not v_inside then
    raise exception 'That place is outside the Cape Town service area';
  end if;

  select * into v_existing
  from public.locations l
  where l.deleted_at is null
    and lower(trim(l.name)) = lower(v_name)
    and (l.organisation_id is null or l.organisation_id = p_organisation_id)
  order by l.organisation_id nulls first
  limit 1;

  if found then
    if v_existing.organisation_id = p_organisation_id
       and coalesce(p_verified, false)
       and v_inside
       and v_existing.needs_review then
      update public.locations
      set place_id = nullif(trim(coalesce(p_place_id, '')), ''),
          latitude = p_latitude,
          longitude = p_longitude,
          needs_review = false,
          source = 'google_places'
      where public.locations.id = v_existing.id
      returning public.locations.id, public.locations.name, public.locations.needs_review
      into id, name, needs_review;
      return next;
      return;
    end if;

    id := v_existing.id;
    name := v_existing.name;
    needs_review := v_existing.needs_review;
    return next;
    return;
  end if;

  insert into public.locations (
    organisation_id,
    name,
    region,
    status,
    created_by,
    place_id,
    latitude,
    longitude,
    needs_review,
    source
  )
  values (
    p_organisation_id,
    v_name,
    'cape_town',
    'active',
    auth.uid(),
    case when coalesce(p_verified, false) then nullif(trim(coalesce(p_place_id, '')), '') else null end,
    case when coalesce(p_verified, false) then p_latitude else null end,
    case when coalesce(p_verified, false) then p_longitude else null end,
    not coalesce(p_verified, false),
    case when coalesce(p_verified, false) then 'google_places' else 'driver_typed' end
  )
  returning public.locations.id, public.locations.name, public.locations.needs_review
  into id, name, needs_review;

  return next;
end;
$$;

revoke all on function public.propose_service_location(
  uuid, text, text, double precision, double precision, boolean
) from public, anon;
grant execute on function public.propose_service_location(
  uuid, text, text, double precision, double precision, boolean
) to authenticated;

comment on function public.propose_service_location(
  uuid, text, text, double precision, double precision, boolean
) is
  'Reuse a catalogue name, store a map-verified Cape Town place, or flag a typed name for admin review. Does not change shared catalogue rows.';
