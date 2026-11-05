-- =============================================================================
-- ROLLBACK for 00069_trip_pickup_dropoff.sql  (NOT run automatically)
-- =============================================================================
-- Restores the pre-00069 function bodies (00049 description, 00066
-- submit_driver_trip, 00064 admin_create_staff_trip, 00063 update_staff_trip
-- with its original 10-argument signature), re-applies the anon revokes
-- (00067 style), then drops the new helpers and columns.
--
-- Data notes:
--   * trips.area_text always held "pickup → dropoff" for structured trips, so
--     dropping pickup_text / dropoff_text loses no invoice-visible text.
--     Existing invoice lines are untouched (they store their own description).
--   * The structured columns themselves (what the driver picked, separately)
--     are discarded. Take a backup first if you want to keep them:
--       create table trips_pickup_dropoff_backup as
--         select id, pickup_text, dropoff_text from public.trips
--         where pickup_text is not null;
--   * The previous app build keeps working against the rolled-back schema (it
--     never sends the new columns); the 00069 app build does not, so roll the
--     app back first (or turn the picker off and stop using the new fields).
-- =============================================================================

begin;

-- 1. Drop the 12-argument update_staff_trip and restore the 10-argument one
drop function if exists public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, text, text
);

create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null,
  p_area_text text default null,
  p_pax_count int default null,
  p_total_km numeric default null,
  p_notes text default null,
  p_vehicle_id uuid default null,
  p_edit_reason text default null
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_company_id uuid;
  v_driver_id uuid;
  v_reason text;
  v_old_vehicle uuid;
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

  if not public.staff_can_manage_trips(t.organisation_id) then
    raise exception 'Not authorised';
  end if;

  if t.status = 'cancelled' then
    raise exception 'Cannot update cancelled trip';
  end if;

  if t.status::text not in ('assigned', 'planned', 'completed') then
    raise exception 'Cannot update trip in status %', t.status;
  end if;

  v_reason := trim(coalesce(p_edit_reason, ''));
  if v_reason = '' then
    raise exception 'Edit reason is required';
  end if;

  if t.status = 'completed' or exists (
    select 1 from public.invoice_lines il where il.trip_id = p_trip_id
  ) then
    perform public.assert_staff_trip_invoice_editable(p_trip_id);
  end if;

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

  if p_vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id
        and v.organisation_id = t.organisation_id
        and v.deleted_at is null
        and v.status = 'active'
    ) then
      raise exception 'Vehicle not found or inactive';
    end if;
  end if;

  if p_planned_start is not null and p_planned_start is distinct from t.planned_start then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'planned_start',
      t.planned_start::text, p_planned_start::text, v_reason
    );
  end if;

  if v_company_id is distinct from t.company_id then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'company_id',
      t.company_id::text, v_company_id::text, v_reason
    );
  end if;

  if p_staff_company is not null and p_staff_company is distinct from t.staff_company then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'staff_company',
      t.staff_company::text, p_staff_company::text, v_reason
    );
  end if;

  if p_area_text is not null and nullif(trim(p_area_text), '') is distinct from t.area_text then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'area_text',
      t.area_text, nullif(trim(p_area_text), ''), v_reason
    );
  end if;

  if p_pax_count is not null and p_pax_count is distinct from t.pax_count then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'pax_count',
      t.pax_count::text, p_pax_count::text, v_reason
    );
  end if;

  if p_total_km is not null and p_total_km is distinct from t.total_km then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'total_km',
      t.total_km::text, p_total_km::text, v_reason
    );
  end if;

  if p_notes is not null and nullif(trim(p_notes), '') is distinct from coalesce(t.notes, '') then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'notes',
      t.notes, nullif(trim(p_notes), ''), v_reason
    );
  elsif p_notes is not null and trim(p_notes) = '' and coalesce(t.notes, '') <> '' then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'notes', t.notes, null, v_reason
    );
  end if;

  update public.trips
  set
    staff_company = coalesce(p_staff_company, staff_company),
    company_id = v_company_id,
    planned_start = coalesce(p_planned_start, planned_start),
    area_text = case
      when p_area_text is null then area_text
      else coalesce(nullif(trim(p_area_text), ''), area_text)
    end,
    pax_count = coalesce(p_pax_count, pax_count),
    total_km = coalesce(p_total_km, total_km),
    notes = case
      when p_notes is null then notes
      else nullif(trim(p_notes), '')
    end,
    closing_km = case
      when t.status = 'completed' and p_total_km is not null then p_total_km
      else closing_km
    end
  where id = p_trip_id
  returning * into t;

  if p_vehicle_id is not null then
    select ta.vehicle_id into v_old_vehicle
    from public.trip_assignments ta
    where ta.trip_id = p_trip_id
      and ta.deleted_at is null
      and ta.released_at is null
    limit 1;

    if v_old_vehicle is distinct from p_vehicle_id then
      perform public.log_trip_audit(
        t.organisation_id, p_trip_id, 'vehicle_id',
        v_old_vehicle::text, p_vehicle_id::text, v_reason
      );
      update public.trip_assignments
      set vehicle_id = p_vehicle_id
      where trip_id = p_trip_id
        and deleted_at is null
        and released_at is null;
    end if;
  end if;

  if t.status = 'completed' then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);
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

revoke all on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
) from public, anon;
grant execute on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
) to authenticated;

-- 2. Restore submit_driver_trip (00066) and admin_create_staff_trip (00064)
create or replace function public.submit_driver_trip(
  p_organisation_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
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
  v_trip public.trips%rowtype;
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

  v_area := v_pickup || ' → ' || v_dropoff;
  v_locations := v_pickup || ' / ' || v_dropoff;

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
    created_by
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
    null,
    auth.uid()
  );

  select * into v_trip from public.trips where id = v_trip_id;

  insert into public.trip_driver_submission_snapshots (trip_id, organisation_id, payload)
  values (
    v_trip_id,
    p_organisation_id,
    jsonb_build_object(
      'trip', to_jsonb(v_trip),
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
  uuid, timestamptz, text, text, uuid, int, numeric, text
) from public, anon;
grant execute on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text
) to authenticated;

create or replace function public.admin_create_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_vehicle_id uuid,
  p_total_km numeric,
  p_notes text default null,
  p_mark_completed boolean default false
)
returns table (trip_id uuid, duplicate_warning boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
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

  if not public.staff_can_manage_trips(p_organisation_id) then
    raise exception 'Not authorised';
  end if;

  v_pickup := trim(coalesce(p_pickup, ''));
  v_dropoff := trim(coalesce(p_dropoff, ''));
  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
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
    p_driver_id,
    p_company_id,
    p_planned_start,
    v_area
  );

  if p_mark_completed then
    perform public.assert_staff_waybill_billing_ready(
      p_organisation_id,
      p_company_id,
      p_planned_start
    );
  end if;

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
    created_by
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    (case when p_mark_completed then 'completed' else 'planned' end)::public.trip_status,
    true,
    v_area,
    v_locations,
    p_pax_count,
    p_total_km,
    nullif(trim(coalesce(p_notes, '')), ''),
    false,
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
    p_driver_id,
    p_vehicle_id,
    auth.uid()
  );

  perform public.log_trip_audit(
    p_organisation_id,
    v_trip_id,
    'created',
    null,
    'admin_manual',
    'Admin manual trip'
  );

  if p_mark_completed then
    update public.trips
    set
      staff_completed_at = timezone('utc', now()),
      opening_km = 0,
      closing_km = coalesce(p_total_km, 0),
      total_km = coalesce(p_total_km, 0)
    where id = v_trip_id;

    perform public.sync_staff_trip_invoice_line(v_trip_id, false);
  end if;

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
) from public, anon;
grant execute on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
) to authenticated;

-- 3. Restore the 00049 line-description function (+ 00050 search_path pin)
create or replace function public.staff_trip_invoice_line_description(p_trip public.trips)
returns text
language plpgsql
stable
as $$
declare
  v_company_name text;
  v_pax int;
begin
  select c.name into v_company_name
  from public.companies c
  where c.id = p_trip.company_id
    and c.deleted_at is null;

  if v_company_name is null and p_trip.staff_company is not null then
    v_company_name := public.staff_company_display_name(p_trip.staff_company);
  end if;

  v_pax := coalesce(p_trip.pax_count, 0);

  return format(
    '%s | %s | %s pax | %s',
    to_char(p_trip.planned_start at time zone 'Africa/Johannesburg', 'DD/MM/YYYY HH24:MI'),
    coalesce(v_company_name, 'Unknown company'),
    v_pax::text,
    trim(coalesce(p_trip.area_text, ''))
  );
end;
$$;

alter function public.staff_trip_invoice_line_description(public.trips) set search_path = public;

-- 4. Drop the 00069 helpers and columns
drop function if exists public.validate_trip_places(text, text);
drop function if exists public.trip_route_text(text, text, text);

alter table public.trips
  drop constraint if exists trips_pickup_text_check,
  drop constraint if exists trips_dropoff_text_check,
  drop column if exists pickup_text,
  drop column if exists dropoff_text;

commit;
