-- =============================================================================
-- 00062 — Driver self-entry trips (submit → admin approve → invoice)
-- =============================================================================

alter table public.trips
  add column if not exists submitted_by_driver boolean not null default false,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text;

comment on column public.trips.submitted_by_driver is
  'Driver-logged trip awaiting admin approval when true and approved_at is null.';
comment on column public.trips.rejected_reason is
  'Set when an admin rejects a driver submission; cleared on resubmit.';

create index if not exists trips_driver_submission_pending_idx
  on public.trips (organisation_id, planned_start)
  where submitted_by_driver = true
    and approved_at is null
    and coalesce(trim(rejected_reason), '') = ''
    and deleted_at is null;

create or replace function public.driver_submission_pending(t public.trips)
returns boolean
language sql
stable
as $$
  select coalesce(t.submitted_by_driver, false)
    and t.approved_at is null
    and coalesce(trim(t.rejected_reason), '') = '';
$$;

create or replace function public.driver_trip_duplicate_warning(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_route_label text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.trips t
    inner join public.trip_assignments ta
      on ta.trip_id = t.id
      and ta.organisation_id = t.organisation_id
      and ta.deleted_at is null
      and ta.released_at is null
      and ta.driver_id = p_driver_id
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.submitted_by_driver = true
      and coalesce(trim(t.rejected_reason), '') = ''
      and t.planned_start = p_planned_start
      and lower(trim(coalesce(t.area_text, ''))) = lower(trim(p_route_label))
  );
$$;

revoke all on function public.driver_trip_duplicate_warning(uuid, uuid, timestamptz, text) from public;
grant execute on function public.driver_trip_duplicate_warning(uuid, uuid, timestamptz, text) to authenticated;

create or replace function public.submit_driver_trip(
  p_organisation_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_vehicle_id uuid,
  p_total_km numeric,
  p_notes text default null
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

  v_pickup := trim(coalesce(p_pickup, ''));
  v_dropoff := trim(coalesce(p_dropoff, ''));
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

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and v.status = 'active'
  ) then
    raise exception 'Vehicle not found or inactive';
  end if;

  v_area := v_pickup || ' → ' || v_dropoff;
  v_locations := v_pickup || ' / ' || v_dropoff;

  v_warn := public.driver_trip_duplicate_warning(
    p_organisation_id,
    v_driver_id,
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
    created_by
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    'planned',
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
    auth.uid()
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
    p_vehicle_id,
    auth.uid()
  );

  update public.trips
  set status = 'planned',
      updated_at = timezone('utc', now())
  where id = v_trip_id;

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, uuid, numeric, text
) from public;
grant execute on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, uuid, numeric, text
) to authenticated;

create or replace function public.approve_driver_trip(p_trip_id uuid)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager']
    )
  ) then
    raise exception 'Not authorised to approve driver trips';
  end if;

  if not t.submitted_by_driver or t.approved_at is not null then
    raise exception 'Trip is not a pending driver submission';
  end if;

  if coalesce(trim(t.rejected_reason), '') <> '' then
    raise exception 'Trip was rejected; driver must resubmit';
  end if;

  perform public.assert_staff_waybill_billing_ready(
    t.organisation_id,
    t.company_id,
    t.planned_start
  );

  update public.trips
  set
    approved_by = auth.uid(),
    approved_at = timezone('utc', now()),
    rejected_reason = null,
    status = 'completed',
    staff_completed_at = timezone('utc', now()),
    opening_km = 0,
    closing_km = coalesce(total_km, 0),
    total_km = coalesce(total_km, 0)
  where id = p_trip_id
  returning * into t;

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
    'completed'::public.trip_event_type,
    auth.uid(),
    'Driver submission approved',
    jsonb_build_object('driver_submission', true)
  );

  perform public.sync_staff_trip_invoice_line(p_trip_id, false);

  return t;
end;
$$;

revoke all on function public.approve_driver_trip(uuid) from public;
grant execute on function public.approve_driver_trip(uuid) to authenticated;

create or replace function public.reject_driver_trip(p_trip_id uuid, p_reason text)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'Rejection reason is required';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      t.organisation_id,
      array['organisation_admin', 'manager']
    )
  ) then
    raise exception 'Not authorised to reject driver trips';
  end if;

  if not t.submitted_by_driver or t.approved_at is not null then
    raise exception 'Trip is not a pending driver submission';
  end if;

  update public.trips
  set rejected_reason = v_reason,
      status = 'cancelled'
  where id = p_trip_id
  returning * into t;

  perform public.sync_staff_trip_invoice_line(p_trip_id, true);

  return t;
end;
$$;

revoke all on function public.reject_driver_trip(uuid, text) from public;
grant execute on function public.reject_driver_trip(uuid, text) to authenticated;

-- Defence in depth: never invoice unapproved driver submissions.
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
