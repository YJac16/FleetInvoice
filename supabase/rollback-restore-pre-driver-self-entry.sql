-- Rollback restore: pre-00062 billing + 00060 staff trip ops
create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_company_id uuid default null,
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
    'company_id', t.company_id,
    'staff_company', t.staff_company,
    'area_text', t.area_text,
    'pax_count', t.pax_count
  );

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = t.organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  elsif p_staff_company is not null then
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
    'company_id', t.company_id,
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
          coalesce(
            (select c.name from public.companies c where c.id = t.company_id),
            public.staff_company_display_name(t.staff_company)
          ),
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
  v_preserve_rate boolean := false;
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

  v_trip_date := (t.planned_start at time zone 'Africa/Johannesburg')::date;
  select * into v_bounds from public.service_week_bounds_sast(t.planned_start);

  if v_line_id is not null then
    select il.trip_company_id, il.rate_card_id, il.unit_price, il.rate_effective_on
    into v_existing_trip_company_id, v_existing_rate_card_id, v_existing_unit_price, v_existing_rate_effective_on
    from public.invoice_lines il
    where il.id = v_line_id;

    if v_existing_trip_company_id = t.company_id
       and v_existing_rate_card_id is not null
       and v_existing_unit_price is not null then
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
    end if;
  end if;

  if not v_preserve_rate then
    select unit_amount, rate_card_id, rate_effective_on
    into v_rate, v_rate_card_id, v_rate_effective_on
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date);

    if v_rate is null then
      raise exception 'No trip rate configured for this company. Add a rate before saving this waybill.';
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
    and i.status = 'draft'
  limit 1;

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
      trip_company_id,
      rate_effective_on,
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
      t.company_id,
      v_rate_effective_on,
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
        trip_company_id = t.company_id,
        rate_effective_on = v_rate_effective_on,
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
create or replace function public.start_staff_trip(
  p_trip_id uuid,
  p_opening_km numeric,
  p_waybill_confirmed boolean default true
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ctx record;
  t public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if not (
    public.is_platform_owner()
    or public.is_org_member(t.organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text not in ('assigned', 'planned') then
    raise exception 'Trip cannot be started from status %', t.status;
  end if;

  if p_opening_km is null or p_opening_km < 0 then
    raise exception 'Opening km is required';
  end if;

  perform public.ensure_trip_assignment_vehicle(p_trip_id, ctx.driver_id, null);

  update public.trips
  set
    opening_km = p_opening_km,
    waybill_confirmed_at = case when p_waybill_confirmed then timezone('utc', now()) else waybill_confirmed_at end,
    staff_started_at = timezone('utc', now())
  where id = p_trip_id;

  return public.set_staff_trip_status(
    p_trip_id,
    'en_route_pickup'::public.trip_status,
    'started'::public.trip_event_type,
    'En route to pickup',
    jsonb_build_object('opening_km', p_opening_km)
  );
end;
$$;
create or replace function public.advance_staff_trip_en_route(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ctx record;
  t public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if not (
    public.is_platform_owner()
    or public.is_org_member(t.organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text <> 'en_route_pickup' then
    raise exception 'Trip must be en route to pickup to advance';
  end if;

  return public.set_staff_trip_status(
    p_trip_id,
    'en_route_company'::public.trip_status,
    'arrived_stop'::public.trip_event_type,
    'En route to company',
    jsonb_build_object('from_status', 'en_route_pickup', 'to_status', 'en_route_company')
  );
end;
$$;
create or replace function public.end_staff_trip(
  p_trip_id uuid,
  p_closing_km numeric
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ctx record;
  t public.trips%rowtype;
  v_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if not (
    public.is_platform_owner()
    or public.is_org_member(t.organisation_id)
  ) then
    raise exception 'Not authorised';
  end if;

  if t.status::text <> 'en_route_company' then
    raise exception 'Trip must be en route to company before completing';
  end if;

  if p_closing_km is null or t.opening_km is null or p_closing_km < t.opening_km then
    raise exception 'Closing km must be >= opening km';
  end if;

  v_total := public.calc_total_km(t.opening_km, p_closing_km);

  update public.trips
  set
    closing_km = p_closing_km,
    total_km = v_total,
    staff_completed_at = timezone('utc', now())
  where id = p_trip_id;

  return public.set_staff_trip_status(
    p_trip_id,
    'completed'::public.trip_status,
    'completed'::public.trip_event_type,
    'Trip completed',
    jsonb_build_object('closing_km', p_closing_km, 'total_km', v_total)
  );
end;
$$;
