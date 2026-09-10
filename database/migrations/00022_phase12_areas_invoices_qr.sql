-- =============================================================================
-- Phase 12 — Map-verified areas, linked geofences, staff invoice lines, QR pairing
-- =============================================================================

alter table public.areas
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists radius_m double precision,
  add column if not exists mapbox_place_id text,
  add column if not exists place_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'areas_lat_check') then
    alter table public.areas
      add constraint areas_lat_check
      check (lat is null or (lat >= -90 and lat <= 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'areas_lng_check') then
    alter table public.areas
      add constraint areas_lng_check
      check (lng is null or (lng >= -180 and lng <= 180));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'areas_radius_positive') then
    alter table public.areas
      add constraint areas_radius_positive
      check (radius_m is null or radius_m > 0);
  end if;
end $$;

alter table public.geofences
  add column if not exists area_id uuid references public.areas (id) on delete set null;

create unique index if not exists geofences_area_id_active_uidx
  on public.geofences (area_id)
  where area_id is not null and deleted_at is null;

alter table public.trips
  add column if not exists area_id uuid references public.areas (id) on delete set null;

create index if not exists trips_area_id_idx on public.trips (area_id)
  where area_id is not null and deleted_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_lines_trip_id_key'
  ) then
    alter table public.invoice_lines
      add constraint invoice_lines_trip_id_key unique (trip_id);
  end if;
end $$;

alter table public.qr_tokens
  alter column employee_id drop not null;

alter table public.qr_tokens
  add column if not exists driver_id uuid references public.drivers (id) on delete cascade,
  add column if not exists qr_kind text not null default 'employee';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'qr_tokens_kind_check') then
    alter table public.qr_tokens
      add constraint qr_tokens_kind_check
      check (qr_kind in ('employee', 'driver'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qr_tokens_subject_check') then
    alter table public.qr_tokens
      add constraint qr_tokens_subject_check
      check (
        (qr_kind = 'employee' and employee_id is not null)
        or (qr_kind = 'driver' and driver_id is not null)
      );
  end if;
end $$;

drop policy if exists qr_tokens_select on public.qr_tokens;
create policy qr_tokens_select on public.qr_tokens
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor',
        'company_manager',
        'driver',
        'employee'
      ]
    )
    or employee_id = public.current_employee_id(organisation_id)
    or driver_id = public.current_driver_id(organisation_id)
  );

create or replace function public.sync_area_geofence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fence_id uuid;
  v_radius double precision;
begin
  if tg_op = 'UPDATE' and new.deleted_at is not null then
    update public.geofences
    set is_active = false, deleted_at = timezone('utc', now())
    where area_id = new.id and deleted_at is null;
    return new;
  end if;

  if new.lat is null or new.lng is null then
    return new;
  end if;

  v_radius := coalesce(new.radius_m, 150);

  select id into v_fence_id
  from public.geofences
  where area_id = new.id and deleted_at is null
  limit 1;

  if v_fence_id is not null then
    update public.geofences
    set
      name = new.name,
      center_lat = new.lat,
      center_lng = new.lng,
      radius_m = v_radius,
      is_active = (new.status = 'active' and new.deleted_at is null),
      deleted_at = null
    where id = v_fence_id;
  else
    insert into public.geofences (
      organisation_id, name, center_lat, center_lng, radius_m, area_id, is_active, created_by
    ) values (
      new.organisation_id, new.name, new.lat, new.lng, v_radius, new.id,
      new.status = 'active' and new.deleted_at is null, new.created_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists areas_sync_geofence on public.areas;
create trigger areas_sync_geofence
after insert or update on public.areas
for each row execute function public.sync_area_geofence();

create or replace function public.staff_trip_invoice_description(t public.trips)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  return format(
    '%s | %s | %s pax | %s',
    to_char(t.planned_start at time zone 'Africa/Johannesburg', 'DD/MM/YYYY HH24:MI'),
    public.staff_company_display_name(t.staff_company),
    coalesce(t.pax_count, 0),
    coalesce(nullif(trim(t.area_text), ''), '—')
  );
end;
$$;

create or replace function public.append_staff_trip_invoice_line(p_trip_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_period_start date;
  v_period_end date;
  inv public.invoices%rowtype;
  v_amount numeric;
  v_card_id uuid;
  v_line_id uuid;
  v_dow int;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found or not t.is_staff_transport or t.status::text <> 'completed' then
    return null;
  end if;
  if t.company_id is null then
    return null;
  end if;

  v_dow := extract(isodow from (t.planned_start at time zone 'Africa/Johannesburg'))::int;
  v_period_start := ((t.planned_start at time zone 'Africa/Johannesburg')::date - (v_dow - 1));
  v_period_end := v_period_start + 7;

  select rc.unit_amount, rc.id into v_amount, v_card_id
  from public.rate_cards rc
  where rc.organisation_id = t.organisation_id
    and rc.deleted_at is null
    and rc.line_type = 'trip'
    and rc.unit = 'trip'
    and (rc.company_id = t.company_id or rc.company_id is null)
    and rc.effective_from <= v_period_start
    and (rc.effective_to is null or rc.effective_to >= v_period_start)
  order by rc.company_id nulls last, rc.effective_from desc
  limit 1;

  if v_amount is null or v_amount <= 0 then
    v_amount := 300;
    v_card_id := null;
  end if;
  v_amount := round(v_amount, 2);

  select * into inv
  from public.invoices i
  where i.organisation_id = t.organisation_id
    and i.company_id = t.company_id
    and i.period_start = v_period_start
    and i.period_end = v_period_end
    and i.deleted_at is null
    and i.status <> 'void'
  limit 1;

  if not found then
    insert into public.invoices (
      organisation_id, company_id, period_start, period_end, status, generated_by
    ) values (
      t.organisation_id, t.company_id, v_period_start, v_period_end, 'draft', auth.uid()
    )
    returning * into inv;
  elsif inv.status = 'paid' then
    return null;
  end if;

  insert into public.invoice_lines (
    organisation_id, invoice_id, line_type, rate_card_id, trip_id,
    description, quantity, unit_price, amount
  )
  values (
    t.organisation_id, inv.id, 'trip', v_card_id, t.id,
    public.staff_trip_invoice_description(t), 1, v_amount, v_amount
  )
  on conflict (trip_id)
  do update set
    description = excluded.description,
    unit_price = excluded.unit_price,
    amount = excluded.amount,
    rate_card_id = excluded.rate_card_id
  returning id into v_line_id;

  update public.invoices i
  set
    subtotal = coalesce((select sum(l.amount) from public.invoice_lines l where l.invoice_id = i.id), 0),
    total = coalesce((select sum(l.amount) from public.invoice_lines l where l.invoice_id = i.id), 0)
  where i.id = inv.id;

  return v_line_id;
end;
$$;

create or replace function public.apply_staff_trip_area(p_trip_id uuid, p_area_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.areas%rowtype;
begin
  if p_area_id is null then
    return;
  end if;
  select * into a from public.areas where id = p_area_id and deleted_at is null;
  if not found then
    raise exception 'Area not found';
  end if;
  update public.trips
  set
    area_id = a.id,
    area_text = a.name,
    service_locations = a.name
  where id = p_trip_id;
end;
$$;

drop function if exists public.assign_staff_trip(uuid, uuid, timestamptz, public.staff_transport_company, text, int);

create or replace function public.assign_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_staff_company public.staff_transport_company,
  p_area_text text,
  p_pax_count int default 1,
  p_area_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_company_id uuid;
  v_area_label text;
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
    raise exception 'Not authorised to assign staff trips';
  end if;

  if p_area_id is null and (p_area_text is null or trim(p_area_text) = '') then
    raise exception 'Area is required';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  v_company_id := public.resolve_staff_company_id(p_organisation_id, p_staff_company);
  v_area_label := coalesce(nullif(trim(p_area_text), ''), '—');

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    staff_company,
    area_text,
    pax_count,
    created_by
  )
  values (
    p_organisation_id,
    null,
    v_company_id,
    p_planned_start,
    'assigned',
    true,
    p_staff_company,
    v_area_label,
    p_pax_count,
    auth.uid()
  )
  returning id into v_trip_id;

  if p_area_id is not null then
    perform public.apply_staff_trip_area(v_trip_id, p_area_id);
    select area_text into v_area_label from public.trips where id = v_trip_id;
  end if;

  perform public.assign_trip(v_trip_id, p_driver_id, null);

  perform public.enqueue_driver_notification(
    p_organisation_id,
    p_driver_id,
    'trip_assigned',
    'Trip assigned',
    format(
      '%s trip at %s in %s (%s pax)',
      public.staff_company_display_name(p_staff_company),
      to_char(p_planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
      v_area_label,
      p_pax_count
    ),
    v_trip_id
  );

  return v_trip_id;
end;
$$;

drop function if exists public.update_staff_trip(uuid, timestamptz, public.staff_transport_company, text, int);

create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_staff_company public.staff_transport_company default null,
  p_area_text text default null,
  p_pax_count int default null,
  p_area_id uuid default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_company_id uuid;
  v_driver_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text not in ('assigned', 'planned') then
    raise exception 'Cannot update trip in status %', t.status;
  end if;

  if p_staff_company is not null then
    v_company_id := public.resolve_staff_company_id(t.organisation_id, p_staff_company);
  else
    v_company_id := t.company_id;
  end if;

  update public.trips
  set
    staff_company = coalesce(p_staff_company, staff_company),
    company_id = v_company_id,
    planned_start = coalesce(p_planned_start, planned_start),
    area_text = coalesce(nullif(trim(p_area_text), ''), area_text),
    pax_count = coalesce(p_pax_count, pax_count)
  where id = p_trip_id
  returning * into t;

  if p_area_id is not null then
    perform public.apply_staff_trip_area(p_trip_id, p_area_id);
    select * into t from public.trips where id = p_trip_id;
  end if;

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.released_at is null
    and ta.deleted_at is null
  limit 1;

  if v_driver_id is not null then
    perform public.enqueue_driver_notification(
      t.organisation_id,
      v_driver_id,
      'trip_updated',
      'Trip updated',
      format(
        'Waybill updated: %s at %s, %s',
        public.staff_company_display_name(t.staff_company),
        to_char(t.planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
        t.area_text
      ),
      p_trip_id
    );
  end if;

  return t;
end;
$$;

drop function if exists public.end_staff_trip(uuid, numeric);

create or replace function public.end_staff_trip(
  p_trip_id uuid,
  p_closing_km numeric,
  p_area_id uuid default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
  t public.trips%rowtype;
  v_total numeric;
  v_area uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if t.status::text <> 'en_route_company' then
    raise exception 'Trip must be en route to company before completing';
  end if;

  if p_closing_km is null or t.opening_km is null or p_closing_km < t.opening_km then
    raise exception 'Closing km must be >= opening km';
  end if;

  v_area := coalesce(p_area_id, t.area_id);
  if v_area is null then
    raise exception 'Area is required';
  end if;
  perform public.apply_staff_trip_area(p_trip_id, v_area);

  v_total := public.calc_total_km(t.opening_km, p_closing_km);

  update public.trips
  set
    closing_km = p_closing_km,
    total_km = v_total,
    staff_completed_at = timezone('utc', now())
  where id = p_trip_id;

  t := public.set_staff_trip_status(
    p_trip_id,
    'completed'::public.trip_status,
    'completed'::public.trip_event_type,
    'Trip completed',
    jsonb_build_object('closing_km', p_closing_km, 'total_km', v_total)
  );

  perform public.append_staff_trip_invoice_line(p_trip_id);
  return t;
end;
$$;

create or replace function public.override_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_area_id uuid default null,
  p_opening_km numeric default null,
  p_closing_km numeric default null,
  p_pax_count int default null
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_opening numeric;
  v_closing numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text = 'cancelled' then
    raise exception 'Cannot override a cancelled trip';
  end if;

  v_opening := coalesce(p_opening_km, t.opening_km);
  v_closing := coalesce(p_closing_km, t.closing_km);
  if v_opening is not null and v_closing is not null and v_closing < v_opening then
    raise exception 'Closing km must be >= opening km';
  end if;

  if p_area_id is not null then
    perform public.apply_staff_trip_area(p_trip_id, p_area_id);
  end if;

  update public.trips
  set
    planned_start = coalesce(p_planned_start, planned_start),
    pax_count = coalesce(p_pax_count, pax_count),
    opening_km = v_opening,
    closing_km = v_closing,
    total_km = case
      when v_opening is not null and v_closing is not null
        then public.calc_total_km(v_opening, v_closing)
      else total_km
    end
  where id = p_trip_id
  returning * into t;

  if t.status::text = 'completed' then
    perform public.append_staff_trip_invoice_line(p_trip_id);
  end if;

  return t;
end;
$$;

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
  trip_desc text;
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
    generated_by
  )
  values (
    p_organisation_id,
    p_company_id,
    p_period_start,
    p_period_end,
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

  for trip_row in
    select t.*
    from public.trips t
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.status = 'completed'
      and t.planned_start >= p_period_start::timestamptz
      and t.planned_start < p_period_end::timestamptz
      and not exists (
        select 1 from public.invoice_lines il
        where il.trip_id = t.id
      )
      and (
        t.company_id = p_company_id
        or exists (
          select 1
          from public.trip_assignments ta
          join public.vehicles v
            on v.id = ta.vehicle_id
           and v.deleted_at is null
          where ta.trip_id = t.id
            and ta.organisation_id = t.organisation_id
            and ta.deleted_at is null
            and ta.released_at is null
            and v.company_id = p_company_id
        )
      )
    order by t.planned_start
  loop
    if trip_row.is_staff_transport then
      line_amount := round(coalesce(nullif(trip_rate, 0), 300), 2);
      trip_desc := public.staff_trip_invoice_description(trip_row);
    else
      if trip_rate is null then
        continue;
      end if;
      line_amount := round(trip_rate, 2);
      trip_desc := format(
        'Completed trip %s',
        to_char(trip_row.planned_start at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
      );
    end if;
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
      trip_desc,
      1,
      line_amount,
      line_amount
    );
  end loop;

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

create or replace function public.scan_qr_token(
  p_token text,
  p_event_type public.attendance_event_type default 'boarded',
  p_notes text default null
)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.qr_tokens%rowtype;
  emp public.employees%rowtype;
  is_ops boolean;
  is_self boolean;
  is_assigned_driver boolean;
  evt public.attendance_events%rowtype;
  ev_type public.attendance_event_type;
  trimmed text;
  v_driver_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  trimmed := trim(coalesce(p_token, ''));
  if length(trimmed) = 0 then
    raise exception 'Token required';
  end if;

  ev_type := coalesce(p_event_type, 'boarded');
  if ev_type not in ('boarded', 'confirmed', 'rejected') then
    raise exception 'Invalid scan event type %', ev_type;
  end if;

  select * into tok
  from public.qr_tokens q
  where coalesce(q.qr_kind, 'employee') = 'employee'
    and (
      q.token_hash = public.hash_qr_token(trimmed)
      or (
        length(trimmed) = 8
        and q.backup_code_hash = public.hash_qr_token(upper(trimmed))
        and q.used_at is null
        and q.expires_at > timezone('utc', now())
      )
    )
  order by q.created_at desc
  limit 1;
  if not found then
    raise exception 'Invalid token';
  end if;

  if tok.used_at is not null then
    raise exception 'Token already used';
  end if;

  if tok.expires_at <= timezone('utc', now()) then
    raise exception 'Token expired';
  end if;

  select * into emp
  from public.employees e
  where e.id = tok.employee_id
    and e.deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  v_driver_id := public.current_driver_id(tok.organisation_id);
  is_assigned_driver := v_driver_id is not null
    and exists (
      select 1
      from public.trip_assignments ta
      where ta.trip_id = tok.trip_id
        and ta.driver_id = v_driver_id
        and ta.deleted_at is null
        and ta.released_at is null
    );

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      tok.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or (
      public.has_org_role_names(tok.organisation_id, array['company_manager'])
      and (
        emp.company_id is null
        or public.has_company_scope(tok.organisation_id, emp.company_id)
      )
    )
    or is_assigned_driver;

  is_self := tok.employee_id = public.current_employee_id(tok.organisation_id);

  if not (is_ops or is_self) then
    raise exception 'Not authorised to scan token';
  end if;

  if v_driver_id is not null
     and not is_assigned_driver
     and not (
       public.is_platform_owner()
       or public.has_org_role_names(
         tok.organisation_id,
         array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
       )
     ) then
    raise exception 'Only the assigned driver can scan this boarding QR';
  end if;

  update public.qr_tokens
  set used_at = timezone('utc', now())
  where id = tok.id;

  insert into public.attendance_events (
    organisation_id,
    trip_id,
    employee_id,
    qr_token_id,
    event_type,
    recorded_by,
    notes,
    metadata
  )
  values (
    tok.organisation_id,
    tok.trip_id,
    tok.employee_id,
    tok.id,
    ev_type,
    auth.uid(),
    nullif(trim(p_notes), ''),
    jsonb_build_object(
      'scanned_as_self', is_self,
      'via_backup_code', length(trimmed) = 8,
      'assigned_driver', is_assigned_driver
    )
  )
  returning * into evt;

  if ev_type = 'boarded' then
    update public.trip_passengers
    set
      status = 'boarded',
      boarded_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where trip_id = tok.trip_id
      and employee_id = tok.employee_id
      and status in ('confirmed', 'requested');
  end if;

  if emp.email is not null and length(trim(emp.email)) > 0 and ev_type = 'boarded' then
    insert into public.notification_outbox (
      organisation_id,
      channel,
      recipient,
      subject,
      body,
      template_key,
      payload,
      created_by
    )
    values (
      tok.organisation_id,
      'email',
      lower(trim(emp.email)),
      'You have been marked as boarded',
      'Your boarding was recorded for today''s trip.',
      'attendance.boarded',
      jsonb_build_object(
        'trip_id', tok.trip_id,
        'employee_id', tok.employee_id,
        'event_id', evt.id
      ),
      auth.uid()
    );
  end if;

  return evt;
end;
$$;

create or replace function public.issue_driver_qr_token(
  p_organisation_id uuid,
  p_trip_id uuid default null,
  p_ttl_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  trip_row public.trips%rowtype;
  raw_token text;
  token_id uuid;
  ttl integer;
  expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'Driver profile not linked';
  end if;

  ttl := greatest(coalesce(p_ttl_minutes, 15), 5);

  if p_trip_id is not null then
    select t.* into trip_row
    from public.trips t
    join public.trip_assignments ta
      on ta.trip_id = t.id
     and ta.driver_id = v_driver_id
     and ta.deleted_at is null
     and ta.released_at is null
    where t.id = p_trip_id
      and t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.is_staff_transport
      and t.status::text in ('assigned', 'en_route_pickup', 'en_route_company', 'in_progress', 'planned');
  else
    select t.* into trip_row
    from public.trips t
    join public.trip_assignments ta
      on ta.trip_id = t.id
     and ta.driver_id = v_driver_id
     and ta.deleted_at is null
     and ta.released_at is null
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.is_staff_transport
      and t.status::text in ('assigned', 'en_route_pickup', 'en_route_company', 'in_progress', 'planned')
    order by
      case t.status::text
        when 'en_route_pickup' then 0
        when 'en_route_company' then 0
        when 'in_progress' then 1
        else 2
      end,
      t.planned_start
    limit 1;
  end if;

  if not found then
    raise exception 'No assigned staff trip to pair';
  end if;

  raw_token := encode(gen_random_bytes(24), 'base64');
  raw_token := replace(replace(replace(raw_token, '+', '-'), '/', '_'), '=', '');
  expires := timezone('utc', now()) + make_interval(mins => ttl);

  insert into public.qr_tokens (
    organisation_id,
    trip_id,
    employee_id,
    driver_id,
    qr_kind,
    token_hash,
    expires_at,
    issued_by
  )
  values (
    p_organisation_id,
    trip_row.id,
    null,
    v_driver_id,
    'driver',
    public.hash_qr_token(raw_token),
    expires,
    auth.uid()
  )
  returning id into token_id;

  return jsonb_build_object(
    'token', raw_token,
    'backup_code', '',
    'expires_at', expires,
    'qr_token_id', token_id,
    'trip_id', trip_row.id
  );
end;
$$;

create or replace function public.scan_driver_qr_token(
  p_token text,
  p_notes text default null
)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.qr_tokens%rowtype;
  emp_id uuid;
  evt public.attendance_events%rowtype;
  trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  trimmed := trim(coalesce(p_token, ''));
  if length(trimmed) = 0 then
    raise exception 'Token required';
  end if;

  select * into tok
  from public.qr_tokens q
  where q.qr_kind = 'driver'
    and q.token_hash = public.hash_qr_token(trimmed)
  order by q.created_at desc
  limit 1;
  if not found then
    raise exception 'Invalid driver token';
  end if;

  if tok.used_at is not null then
    raise exception 'Token already used';
  end if;

  if tok.expires_at <= timezone('utc', now()) then
    raise exception 'Token expired';
  end if;

  emp_id := public.current_employee_id(tok.organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  if not exists (
    select 1
    from public.trip_assignments ta
    where ta.trip_id = tok.trip_id
      and ta.driver_id = tok.driver_id
      and ta.deleted_at is null
      and ta.released_at is null
  ) then
    raise exception 'Driver is not assigned to this trip';
  end if;

  if not exists (
    select 1
    from public.trip_passengers tp
    where tp.trip_id = tok.trip_id
      and tp.employee_id = emp_id
      and tp.status in ('confirmed', 'requested', 'boarded')
  ) then
    raise exception 'This driver is not assigned to your trip';
  end if;

  update public.qr_tokens
  set used_at = timezone('utc', now())
  where id = tok.id;

  insert into public.attendance_events (
    organisation_id,
    trip_id,
    employee_id,
    qr_token_id,
    event_type,
    recorded_by,
    notes,
    metadata
  )
  values (
    tok.organisation_id,
    tok.trip_id,
    emp_id,
    tok.id,
    'boarded',
    auth.uid(),
    nullif(trim(p_notes), ''),
    jsonb_build_object('via_driver_qr', true)
  )
  returning * into evt;

  update public.trip_passengers
  set
    status = 'boarded',
    boarded_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where trip_id = tok.trip_id
    and employee_id = emp_id
    and status in ('confirmed', 'requested');

  return evt;
end;
$$;

grant execute on function public.assign_staff_trip(uuid, uuid, timestamptz, public.staff_transport_company, text, int, uuid) to authenticated;
grant execute on function public.update_staff_trip(uuid, timestamptz, public.staff_transport_company, text, int, uuid) to authenticated;
grant execute on function public.end_staff_trip(uuid, numeric, uuid) to authenticated;
grant execute on function public.override_staff_trip(uuid, timestamptz, uuid, numeric, numeric, int) to authenticated;
grant execute on function public.generate_period_invoice(uuid, uuid, date, date) to authenticated;
grant execute on function public.scan_qr_token(text, public.attendance_event_type, text) to authenticated;
grant execute on function public.issue_driver_qr_token(uuid, uuid, integer) to authenticated;
grant execute on function public.scan_driver_qr_token(text, text) to authenticated;
