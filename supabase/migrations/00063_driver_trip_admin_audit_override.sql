-- =============================================================================
-- 00063 — Driver trip admin edit, billing override, immutable snapshot, audit
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables (staff-only via RLS; drivers use RPCs / trips row without these joins)
-- ---------------------------------------------------------------------------

create table if not exists public.trip_driver_submission_snapshots (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.trip_driver_submission_snapshots is
  'Immutable JSON snapshot of the driver''s original submission (insert-only).';

create table if not exists public.trip_billing_overrides (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  override_unit_price numeric not null check (override_unit_price >= 0),
  reason text not null check (char_length(trim(reason)) > 0),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.trip_billing_overrides is
  'Staff billing override per trip; beats rate card when invoicing.';

create table if not exists public.trip_audit (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  actor_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists trip_audit_trip_id_created_idx
  on public.trip_audit (trip_id, created_at desc);

alter table public.trip_driver_submission_snapshots enable row level security;
alter table public.trip_billing_overrides enable row level security;
alter table public.trip_audit enable row level security;

revoke all on table public.trip_driver_submission_snapshots from public, anon;
revoke all on table public.trip_billing_overrides from public, anon;
revoke all on table public.trip_audit from public, anon;

grant select on table public.trip_driver_submission_snapshots to authenticated;
grant select on table public.trip_billing_overrides to authenticated;
grant select on table public.trip_audit to authenticated;

drop policy if exists trip_driver_submission_snapshots_select on public.trip_driver_submission_snapshots;
create policy trip_driver_submission_snapshots_select on public.trip_driver_submission_snapshots
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists trip_billing_overrides_select on public.trip_billing_overrides;
create policy trip_billing_overrides_select on public.trip_billing_overrides
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists trip_audit_select on public.trip_audit;
create policy trip_audit_select on public.trip_audit
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.staff_can_manage_trips(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    );
$$;

revoke all on function public.staff_can_manage_trips(uuid) from public;
grant execute on function public.staff_can_manage_trips(uuid) to authenticated;

create or replace function public.assert_staff_trip_invoice_editable(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  select i.status::text
  into v_status
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id and i.deleted_at is null
  where il.trip_id = p_trip_id
  limit 1;

  if v_status is not null and v_status <> 'draft' then
    raise exception 'Cannot edit trip: linked invoice is % (only draft invoices can be changed)', v_status;
  end if;
end;
$$;

revoke all on function public.assert_staff_trip_invoice_editable(uuid) from public;
grant execute on function public.assert_staff_trip_invoice_editable(uuid) to authenticated;

create or replace function public.log_trip_audit(
  p_organisation_id uuid,
  p_trip_id uuid,
  p_field_name text,
  p_old_value text,
  p_new_value text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_old_value, '') = coalesce(p_new_value, '') then
    return;
  end if;

  insert into public.trip_audit (
    organisation_id,
    trip_id,
    field_name,
    old_value,
    new_value,
    actor_id,
    reason
  )
  values (
    p_organisation_id,
    p_trip_id,
    p_field_name,
    p_old_value,
    p_new_value,
    auth.uid(),
    nullif(trim(coalesce(p_reason, '')), '')
  );
end;
$$;

revoke all on function public.log_trip_audit(uuid, uuid, text, text, text, text) from public;

-- ---------------------------------------------------------------------------
-- submit_driver_trip — capture immutable snapshot on first submit
-- ---------------------------------------------------------------------------

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

  select * into v_trip from public.trips where id = v_trip_id;

  insert into public.trip_driver_submission_snapshots (trip_id, organisation_id, payload)
  values (
    v_trip_id,
    p_organisation_id,
    jsonb_build_object(
      'trip', to_jsonb(v_trip),
      'assignment', jsonb_build_object(
        'driver_id', v_driver_id,
        'vehicle_id', p_vehicle_id
      ),
      'submitted_at', timezone('utc', now())
    )
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

-- ---------------------------------------------------------------------------
-- set_trip_billing_override
-- ---------------------------------------------------------------------------

create or replace function public.set_trip_billing_override(
  p_trip_id uuid,
  p_override_unit_price numeric,
  p_reason text
)
returns public.trip_billing_overrides
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_reason text;
  v_old numeric;
  row public.trip_billing_overrides%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'Override reason is required';
  end if;

  if p_override_unit_price is null or p_override_unit_price < 0 then
    raise exception 'Override amount must be non-negative';
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

  perform public.assert_staff_trip_invoice_editable(p_trip_id);

  select override_unit_price into v_old
  from public.trip_billing_overrides
  where trip_id = p_trip_id;

  insert into public.trip_billing_overrides (
    trip_id,
    organisation_id,
    override_unit_price,
    reason,
    created_by,
    updated_by
  )
  values (
    p_trip_id,
    t.organisation_id,
    p_override_unit_price,
    v_reason,
    auth.uid(),
    auth.uid()
  )
  on conflict (trip_id) do update
  set
    override_unit_price = excluded.override_unit_price,
    reason = excluded.reason,
    updated_by = auth.uid(),
    updated_at = timezone('utc', now())
  returning * into row;

  perform public.log_trip_audit(
    t.organisation_id,
    p_trip_id,
    'billing_override_unit_price',
    v_old::text,
    p_override_unit_price::text,
    v_reason
  );

  if t.status = 'completed' and not public.driver_submission_pending(t) then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);
  end if;

  return row;
end;
$$;

revoke all on function public.set_trip_billing_override(uuid, numeric, text) from public;
grant execute on function public.set_trip_billing_override(uuid, numeric, text) to authenticated;

create or replace function public.clear_trip_billing_override(
  p_trip_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_reason text;
  v_old numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'Reason is required';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not public.staff_can_manage_trips(t.organisation_id) then
    raise exception 'Not authorised';
  end if;

  perform public.assert_staff_trip_invoice_editable(p_trip_id);

  select override_unit_price into v_old
  from public.trip_billing_overrides
  where trip_id = p_trip_id;

  if v_old is null then
    return;
  end if;

  delete from public.trip_billing_overrides where trip_id = p_trip_id;

  perform public.log_trip_audit(
    t.organisation_id,
    p_trip_id,
    'billing_override_unit_price',
    v_old::text,
    null,
    v_reason
  );

  if t.status = 'completed' and not public.driver_submission_pending(t) then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);
  end if;
end;
$$;

revoke all on function public.clear_trip_billing_override(uuid, text) from public;
grant execute on function public.clear_trip_billing_override(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_staff_trip — manual staff entry (same shape as driver log)
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
returns uuid
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
    case when p_mark_completed then 'completed' else 'planned' end,
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

  return v_trip_id;
end;
$$;

revoke all on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
) from public;
grant execute on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- update_staff_trip — extended fields, audit, invoice guard
-- ---------------------------------------------------------------------------

drop function if exists public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int
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
) from public;
grant execute on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- sync_staff_trip_invoice_line — billing override beats rate card
-- ---------------------------------------------------------------------------

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
  v_override numeric;
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

  select bo.override_unit_price
  into v_override
  from public.trip_billing_overrides bo
  where bo.trip_id = p_trip_id;

  if v_override is not null then
    v_rate := v_override;
    v_rate_card_id := null;
    v_rate_effective_on := v_trip_date;
  else
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
