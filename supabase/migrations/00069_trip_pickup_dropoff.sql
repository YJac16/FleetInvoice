-- =============================================================================
-- 00069 — Structured trip pickup / drop-off (additive)
-- =============================================================================
-- * trips.pickup_text / trips.dropoff_text (nullable; NOT backfilled)
-- * trips.area_text stays NOT NULL for staff trips and always equals
--   "pickup → dropoff" for structured trips (00049 check constraint unchanged)
-- * trip_route_text(): one formatter — structured pickup → drop-off, else the
--   legacy area_text. Used by staff_trip_invoice_line_description, i.e. applied
--   at invoice line creation/sync ONLY. Issued (non-draft) invoice lines are
--   never re-synced (sync_staff_trip_invoice_line raises on non-draft), so
--   existing invoices are byte-identical.
-- * validate_trip_places(): server-side validation (empty, '|', line breaks,
--   > 120 chars, pickup = drop-off)
-- * submit_driver_trip / admin_create_staff_trip write the structured columns;
--   update_staff_trip gains p_pickup_text / p_dropoff_text (signature change:
--   old signature dropped, anon revoked again — 00067 style)
-- Rollback notes: supabase/rollback-00069-trip-pickup-dropoff.sql
-- =============================================================================

alter table public.trips
  add column if not exists pickup_text text,
  add column if not exists dropoff_text text;

alter table public.trips
  drop constraint if exists trips_pickup_text_check,
  drop constraint if exists trips_dropoff_text_check;

alter table public.trips
  add constraint trips_pickup_text_check check (
    pickup_text is null
    or (char_length(pickup_text) between 1 and 120 and pickup_text !~ '[|\r\n]')
  ),
  add constraint trips_dropoff_text_check check (
    dropoff_text is null
    or (char_length(dropoff_text) between 1 and 120 and dropoff_text !~ '[|\r\n]')
  );

comment on column public.trips.pickup_text is
  'Structured pickup place (user-typed/edited text only; no Mapbox ids or coordinates). Nullable for legacy trips.';
comment on column public.trips.dropoff_text is
  'Structured drop-off place (user-typed/edited text only). Nullable for legacy trips.';

-- ---------------------------------------------------------------------------
-- trip_route_text — single formatter for the route label on invoice lines
-- ---------------------------------------------------------------------------

create or replace function public.trip_route_text(
  p_pickup text,
  p_dropoff text,
  p_area text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when nullif(btrim(coalesce(p_pickup, '')), '') is not null
     and nullif(btrim(coalesce(p_dropoff, '')), '') is not null
      then btrim(p_pickup) || ' → ' || btrim(p_dropoff)
    else btrim(coalesce(p_area, ''))
  end;
$$;

revoke all on function public.trip_route_text(text, text, text) from public, anon;
grant execute on function public.trip_route_text(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- validate_trip_places — internal helper (not callable by clients)
-- ---------------------------------------------------------------------------

create or replace function public.validate_trip_places(
  p_pickup text,
  p_dropoff text
)
returns table (pickup text, dropoff text)
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_pickup text := btrim(coalesce(p_pickup, ''));
  v_dropoff text := btrim(coalesce(p_dropoff, ''));
begin
  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if char_length(v_pickup) > 120 or char_length(v_dropoff) > 120 then
    raise exception 'Pickup and drop-off must be 120 characters or fewer';
  end if;

  if v_pickup ~ '[|\r\n]' or v_dropoff ~ '[|\r\n]' then
    raise exception 'Pickup and drop-off cannot contain "|" or line breaks';
  end if;

  if lower(v_pickup) = lower(v_dropoff) then
    raise exception 'Pickup and drop-off must be different';
  end if;

  pickup := v_pickup;
  dropoff := v_dropoff;
  return next;
end;
$$;

revoke all on function public.validate_trip_places(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- staff_trip_invoice_line_description — use trip_route_text (00049 body + 00050 search_path)
-- ---------------------------------------------------------------------------

create or replace function public.staff_trip_invoice_line_description(p_trip public.trips)
returns text
language plpgsql
stable
set search_path = public
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
    public.trip_route_text(p_trip.pickup_text, p_trip.dropoff_text, p_trip.area_text)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_driver_trip (00066 body + structured columns)
-- ---------------------------------------------------------------------------

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

  select vp.pickup, vp.dropoff
    into v_pickup, v_dropoff
    from public.validate_trip_places(p_pickup, p_dropoff) vp;

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
    pickup_text,
    dropoff_text,
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
    v_pickup,
    v_dropoff,
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

-- ---------------------------------------------------------------------------
-- admin_create_staff_trip (00064 body + structured columns)
-- ---------------------------------------------------------------------------

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

  select vp.pickup, vp.dropoff
    into v_pickup, v_dropoff
    from public.validate_trip_places(p_pickup, p_dropoff) vp;

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
    pickup_text,
    dropoff_text,
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
    v_pickup,
    v_dropoff,
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

-- ---------------------------------------------------------------------------
-- update_staff_trip — new signature (adds p_pickup_text, p_dropoff_text)
-- Drop the old overload first so named-arg calls are never ambiguous, then
-- re-apply revokes/grants (00067 style).
-- ---------------------------------------------------------------------------

drop function if exists public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
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
  p_edit_reason text default null,
  p_pickup_text text default null,
  p_dropoff_text text default null
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
  v_structured boolean := false;
  v_pickup text;
  v_dropoff text;
  v_new_area text;
  v_clear_structured boolean := false;
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

  -- Structured pickup/drop-off: both or neither. Wins over p_area_text.
  if p_pickup_text is not null or p_dropoff_text is not null then
    select vp.pickup, vp.dropoff
      into v_pickup, v_dropoff
      from public.validate_trip_places(p_pickup_text, p_dropoff_text) vp;
    v_structured := true;
    v_new_area := v_pickup || ' → ' || v_dropoff;
  elsif p_area_text is not null and nullif(trim(p_area_text), '') is not null then
    v_new_area := nullif(trim(p_area_text), '');
    -- A legacy free-text area edit supersedes any structured values, otherwise
    -- the invoice formatter would keep printing the stale structured route.
    v_clear_structured := (v_new_area is distinct from t.area_text)
      and (t.pickup_text is not null or t.dropoff_text is not null);
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

  if v_new_area is not null and v_new_area is distinct from t.area_text then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'area_text',
      t.area_text, v_new_area, v_reason
    );
  end if;

  if v_structured then
    if v_pickup is distinct from t.pickup_text then
      perform public.log_trip_audit(
        t.organisation_id, p_trip_id, 'pickup_text',
        t.pickup_text, v_pickup, v_reason
      );
    end if;
    if v_dropoff is distinct from t.dropoff_text then
      perform public.log_trip_audit(
        t.organisation_id, p_trip_id, 'dropoff_text',
        t.dropoff_text, v_dropoff, v_reason
      );
    end if;
  elsif v_clear_structured then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'pickup_text',
      t.pickup_text, null, v_reason
    );
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'dropoff_text',
      t.dropoff_text, null, v_reason
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
    area_text = coalesce(v_new_area, area_text),
    pickup_text = case
      when v_structured then v_pickup
      when v_clear_structured then null
      else pickup_text
    end,
    dropoff_text = case
      when v_structured then v_dropoff
      when v_clear_structured then null
      else dropoff_text
    end,
    service_locations = case
      when v_structured then v_pickup || ' / ' || v_dropoff
      else service_locations
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
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, text, text
) from public, anon;
grant execute on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, text, text
) to authenticated;
