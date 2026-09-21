-- =============================================================================
-- WorkOps — Staff waybill complete → draft weekly invoice line (Mon–Sun SAST)
-- =============================================================================
-- Requires 00023_invoice_per_trip_company_unique.sql

alter type public.trip_event_type add value if not exists 'updated';

create unique index if not exists invoice_lines_trip_id_uidx
  on public.invoice_lines (trip_id)
  where trip_id is not null;

-- ---------------------------------------------------------------------------
-- Service week [period_start, period_end) for planned_start in Africa/Johannesburg
-- ---------------------------------------------------------------------------

create or replace function public.service_week_bounds_sast(p_planned_start timestamptz)
returns table (period_start date, period_end date)
language sql
immutable
as $$
  select
    (
      (p_planned_start at time zone 'Africa/Johannesburg')::date
      - ((extract(isodow from (p_planned_start at time zone 'Africa/Johannesburg')::date)::int - 1) * interval '1 day')
    )::date as period_start,
    (
      (p_planned_start at time zone 'Africa/Johannesburg')::date
      - ((extract(isodow from (p_planned_start at time zone 'Africa/Johannesburg')::date)::int - 1) * interval '1 day')
      + interval '7 days'
    )::date as period_end;
$$;

-- ---------------------------------------------------------------------------
-- Trip rate (no silent default — block when missing)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_trip_line_rate(
  p_organisation_id uuid,
  p_company_id uuid,
  p_period_start date
)
returns table (unit_amount numeric, rate_card_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select rc.unit_amount, rc.id
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
end;
$$;

create or replace function public.recalculate_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_total numeric;
begin
  select coalesce(sum(il.amount), 0)
  into invoice_total
  from public.invoice_lines il
  where il.invoice_id = p_invoice_id;

  update public.invoices
  set subtotal = invoice_total,
      total = invoice_total,
      updated_at = timezone('utc', now())
  where id = p_invoice_id;
end;
$$;

create or replace function public.staff_trip_invoice_line_description(p_trip public.trips)
returns text
language plpgsql
stable
as $$
declare
  v_company_name text;
  v_pax int;
begin
  if p_trip.is_staff_transport then
    v_company_name := public.staff_company_display_name(p_trip.staff_company);
    v_pax := coalesce(p_trip.pax_count, 0);
    return format(
      '%s | %s | %s pax | %s',
      to_char(p_trip.planned_start at time zone 'Africa/Johannesburg', 'DD/MM/YYYY HH24:MI'),
      v_company_name,
      v_pax::text,
      trim(p_trip.area_text)
    );
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = p_trip.company_id
    and c.deleted_at is null;

  v_pax := coalesce(p_trip.pax_count, 0);

  return format(
    '%s | %s | %s pax | %s',
    to_char(p_trip.planned_start at time zone 'Africa/Johannesburg', 'DD/MM/YYYY HH24:MI'),
    coalesce(v_company_name, 'Unknown company'),
    v_pax::text,
    coalesce(trim(p_trip.area_text), trim(p_trip.service_locations), '—')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Upsert or remove invoice line for a completed staff / waybill trip
-- ---------------------------------------------------------------------------

create or replace function public.sync_staff_trip_invoice_line(
  p_trip_id uuid,
  p_remove boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
  v_bounds record;
  v_company_name text;
  v_trip_company_label text;
  v_bill_to uuid;
  inv public.invoices%rowtype;
  v_rate numeric;
  v_rate_card_id uuid;
  v_line_amount numeric;
  v_description text;
  v_line_id uuid;
  v_old_invoice_id uuid;
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
    return null;
  end if;

  if t.status <> 'completed' then
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

  select * into v_bounds from public.service_week_bounds_sast(t.planned_start);

  v_trip_company_label := public.staff_company_display_name(t.staff_company);

  select unit_amount, rate_card_id
  into v_rate, v_rate_card_id
  from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_bounds.period_start);

  if v_rate is null then
    select c.name into v_company_name
    from public.companies c
    where c.id = t.company_id;
    raise exception 'No trip rate card for % (add a trip rate on Rate cards)', coalesce(v_company_name, 'company');
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
    and i.period_end = v_bounds.period_end
    and coalesce(i.trip_company, '') = v_trip_company_label
    and i.deleted_at is null
    and i.status <> 'void'
  limit 1;

  if not found then
    insert into public.invoices (
      organisation_id,
      company_id,
      driver_id,
      trip_company,
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
      v_trip_company_label,
      v_bounds.period_start,
      v_bounds.period_end,
      'draft',
      auth.uid(),
      format(
        'Invoice date %s (Monday after Sunday %s)',
        to_char(v_bounds.period_end, 'DD/MM/YYYY'),
        to_char(v_bounds.period_end - 1, 'DD/MM/YYYY')
      )
    )
    returning * into inv;
  elsif inv.status <> 'draft' then
    raise exception 'Cannot add trip line: weekly invoice is % (must be draft)', inv.status;
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
      description,
      quantity,
      unit_price,
      amount
    )
    values (
      t.organisation_id,
      inv.id,
      'trip',
      v_rate_card_id,
      p_trip_id,
      v_description,
      1,
      v_rate,
      v_line_amount
    )
    returning id into v_line_id;
  else
    update public.invoice_lines
    set invoice_id = inv.id,
        rate_card_id = v_rate_card_id,
        description = v_description,
        quantity = 1,
        unit_price = v_rate,
        amount = v_line_amount
    where id = v_line_id;
  end if;

  perform public.recalculate_invoice_totals(inv.id);

  return v_line_id;
end;
$$;

grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- set_staff_trip_status — sync invoice on complete / cancel
-- ---------------------------------------------------------------------------

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

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_staff_trip — allow void of completed waybills
-- ---------------------------------------------------------------------------

create or replace function public.cancel_staff_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
  v_was_completed boolean;
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

  if t.status = 'cancelled' then
    raise exception 'Trip already cancelled';
  end if;

  v_was_completed := t.status = 'completed';

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.released_at is null
    and ta.deleted_at is null
  limit 1;

  t := public.set_staff_trip_status(
    p_trip_id,
    'cancelled'::public.trip_status,
    'cancelled'::public.trip_event_type,
    case when v_was_completed then 'Waybill voided by admin' else 'Trip cancelled by admin' end,
    jsonb_build_object('void_completed', v_was_completed)
  );

  if v_driver_id is not null and not v_was_completed then
    perform public.enqueue_driver_notification(
      t.organisation_id,
      v_driver_id,
      'trip_cancelled',
      'Trip cancelled',
      format(
        'Your %s trip at %s was cancelled',
        public.staff_company_display_name(t.staff_company),
        to_char(t.planned_start at time zone 'Africa/Johannesburg', 'HH24:MI')
      ),
      p_trip_id
    );
  end if;

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_staff_trip — allow admin edit of completed waybills + invoice resync
-- ---------------------------------------------------------------------------

create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_staff_company public.staff_transport_company default null,
  p_area_text text default null,
  p_pax_count int default null
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
  v_before jsonb;
  v_after jsonb;
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

  if t.status = 'cancelled' then
    raise exception 'Cannot update cancelled trip';
  end if;

  if t.status::text not in ('assigned', 'planned', 'completed') then
    raise exception 'Cannot update trip in status %', t.status;
  end if;

  v_before := jsonb_build_object(
    'planned_start', t.planned_start,
    'staff_company', t.staff_company,
    'area_text', t.area_text,
    'pax_count', t.pax_count
  );

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

  v_after := jsonb_build_object(
    'planned_start', t.planned_start,
    'staff_company', t.staff_company,
    'area_text', t.area_text,
    'pax_count', t.pax_count
  );

  if t.status = 'completed' then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);

    insert into public.trip_events (
      organisation_id,
      trip_id,
      event_type,
      actor_id,
      notes,
      metadata
    )
    values (
      t.organisation_id,
      p_trip_id,
      'updated'::public.trip_event_type,
      auth.uid(),
      'Waybill updated by admin',
      jsonb_build_object('before', v_before, 'after', v_after)
    );
  else
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
  end if;

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- backfill_staff_waybill — admin completed waybill without driver portal
-- ---------------------------------------------------------------------------

create or replace function public.backfill_staff_waybill(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_staff_company public.staff_transport_company,
  p_area_text text,
  p_pax_count int default 1,
  p_opening_km numeric default null,
  p_closing_km numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_company_id uuid;
  v_total numeric;
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
    raise exception 'Not authorised to backfill waybills';
  end if;

  if p_area_text is null or trim(p_area_text) = '' then
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

  if p_opening_km is not null and p_closing_km is not null then
    if p_closing_km < p_opening_km then
      raise exception 'Closing km must be >= opening km';
    end if;
    v_total := public.calc_total_km(p_opening_km, p_closing_km);
  else
    v_total := null;
  end if;

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
    opening_km,
    closing_km,
    total_km,
    staff_completed_at,
    created_by
  )
  values (
    p_organisation_id,
    null,
    v_company_id,
    p_planned_start,
    'completed',
    true,
    p_staff_company,
    trim(p_area_text),
    p_pax_count,
    p_opening_km,
    p_closing_km,
    v_total,
    timezone('utc', now()),
    auth.uid()
  )
  returning id into v_trip_id;

  perform public.assign_trip(v_trip_id, p_driver_id, null);

  insert into public.trip_events (
    organisation_id,
    trip_id,
    event_type,
    actor_id,
    notes,
    metadata
  )
  values (
    p_organisation_id,
    v_trip_id,
    'completed'::public.trip_event_type,
    auth.uid(),
    'Waybill backfilled by admin',
    jsonb_build_object('admin_backfill', true)
  );

  perform public.sync_staff_trip_invoice_line(v_trip_id, false);

  return v_trip_id;
end;
$$;

grant execute on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, public.staff_transport_company, text, int, numeric, numeric
) to authenticated;

comment on function public.sync_staff_trip_invoice_line is
  'Upsert or remove draft weekly invoice line for a staff waybill trip (SAST Mon–Sun service week).';

comment on function public.backfill_staff_waybill is
  'Admin creates a completed staff waybill and appends the driver draft weekly invoice line (no driver notification).';
