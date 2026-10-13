-- =============================================================================
-- 00058 — Staff waybills: rate + bill-to checks at creation time
-- =============================================================================
-- Problem: assign_staff_trip ("Send to driver") created waybills for companies
-- with no trip rate (or orgs with no invoice bill-to company). The driver only
-- hit the error at "Complete trip" (sync_staff_trip_invoice_line).
--
-- Founder rule (unchanged): no rate = save blocked; the company decides the rate.
-- This migration moves the check to creation time using the SAME lookups the
-- completion path uses, and keeps the completion-time checks as a safety net:
--   * public.resolve_trip_line_rate(org, company, SAST trip date)
--   * public.resolve_invoice_bill_to_company_id(org)
--
-- Changes:
--   1. assert_staff_waybill_billing_ready(...)  internal helper (invoker; EXECUTE revoked from clients)
--   2. staff_waybill_billing_readiness(...)     client RPC returning two booleans
--                                               (no rate amounts exposed) for the UI pre-check
--   3. assign_staff_trip   — calls the helper before inserting the trip
--   4. backfill_staff_waybill — inline rate check replaced by the helper (same rate
--                               message) and now also checks bill-to up front
--
-- Function bodies for 3 and 4 are copied verbatim from 00049 (verified identical
-- to production on 2026-10-06) with only the marked 00058 lines changed.
-- NOT APPLIED. Apply manually after review (Supabase SQL editor / MCP apply_migration).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Internal helper — raises the admin-facing error
-- ---------------------------------------------------------------------------

create or replace function public.assert_staff_waybill_billing_ready(
  p_organisation_id uuid,
  p_company_id uuid,
  p_planned_start timestamptz
)
returns void
language plpgsql
stable
-- SECURITY INVOKER on purpose: only called from the SECURITY DEFINER waybill RPCs
-- below (so it runs as their owner). A direct client call also fails because
-- resolve_trip_line_rate is not executable by authenticated (00050).
set search_path = public
as $$
declare
  v_rate numeric;
begin
  select unit_amount into v_rate
  from public.resolve_trip_line_rate(
    p_organisation_id,
    p_company_id,
    (p_planned_start at time zone 'Africa/Johannesburg')::date
  )
  limit 1;

  if v_rate is null then
    raise exception 'No trip rate configured for this company. Add a rate before saving this waybill.';
  end if;

  if public.resolve_invoice_bill_to_company_id(p_organisation_id) is null then
    raise exception 'No invoice bill-to company is configured for this organisation, so this waybill could not be invoiced. Ask GoOps support to set the bill-to company before creating waybills.';
  end if;
end;
$$;

revoke all on function public.assert_staff_waybill_billing_ready(uuid, uuid, timestamptz) from public;
revoke all on function public.assert_staff_waybill_billing_ready(uuid, uuid, timestamptz) from anon;
revoke all on function public.assert_staff_waybill_billing_ready(uuid, uuid, timestamptz) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Client RPC for the Create waybill dialog (booleans only)
-- ---------------------------------------------------------------------------

create or replace function public.staff_waybill_billing_readiness(
  p_organisation_id uuid,
  p_company_id uuid,
  p_planned_start timestamptz
)
returns table (
  has_trip_rate boolean,
  has_bill_to boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Same roles that may create / backfill staff waybills.
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    exists (
      select 1
      from public.resolve_trip_line_rate(
        p_organisation_id,
        p_company_id,
        (p_planned_start at time zone 'Africa/Johannesburg')::date
      ) r
      where r.unit_amount is not null
    ),
    public.resolve_invoice_bill_to_company_id(p_organisation_id) is not null;
end;
$$;

revoke all on function public.staff_waybill_billing_readiness(uuid, uuid, timestamptz) from public;
revoke all on function public.staff_waybill_billing_readiness(uuid, uuid, timestamptz) from anon;
grant execute on function public.staff_waybill_billing_readiness(uuid, uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. assign_staff_trip ("Send to driver")
-- ---------------------------------------------------------------------------

create or replace function public.assign_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_area_text text,
  p_pax_count int default 1,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_company_id uuid;
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

  if p_area_text is null or trim(p_area_text) = '' then
    raise exception 'Area is required';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if p_company_id is null and p_staff_company is null then
    raise exception 'Company is required';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = p_organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  else
    v_company_id := public.resolve_staff_company_id(p_organisation_id, p_staff_company);
  end if;

  -- 00058: block at creation so drivers never receive an unratable / un-invoiceable trip.
  perform public.assert_staff_waybill_billing_ready(
    p_organisation_id,
    v_company_id,
    p_planned_start
  );

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
    trim(p_area_text),
    p_pax_count,
    auth.uid()
  )
  returning id into v_trip_id;

  perform public.assign_trip(v_trip_id, p_driver_id, null);

  perform public.enqueue_driver_notification(
    p_organisation_id,
    p_driver_id,
    'trip_assigned',
    'New waybill',
    format(
      'Waybill: %s at %s, %s',
      coalesce(
        (select c.name from public.companies c where c.id = v_company_id),
        public.staff_company_display_name(p_staff_company)
      ),
      to_char(p_planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
      trim(p_area_text)
    ),
    v_trip_id
  );

  return v_trip_id;
end;
$$;

revoke all on function public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company
) from public;
revoke all on function public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company
) from anon;
grant execute on function public.assign_staff_trip(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. backfill_staff_waybill ("Backfill completed")
-- ---------------------------------------------------------------------------

create or replace function public.backfill_staff_waybill(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_area_text text,
  p_pax_count int default 1,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null,
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

  if p_company_id is null and p_staff_company is null then
    raise exception 'Company is required';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = p_organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  else
    v_company_id := public.resolve_staff_company_id(p_organisation_id, p_staff_company);
  end if;

  -- 00058: same rate check as before (same message) plus the bill-to check, via the shared helper.
  perform public.assert_staff_waybill_billing_ready(
    p_organisation_id,
    v_company_id,
    p_planned_start
  );

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
    created_by
  )
  values (
    p_organisation_id,
    null,
    v_company_id,
    p_planned_start,
    'planned',
    true,
    p_staff_company,
    trim(p_area_text),
    p_pax_count,
    p_opening_km,
    p_closing_km,
    v_total,
    auth.uid()
  )
  returning id into v_trip_id;

  perform public.assign_trip(v_trip_id, p_driver_id, null);

  update public.trips
  set status = 'completed',
      staff_completed_at = timezone('utc', now())
  where id = v_trip_id;

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

revoke all on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric
) from public;
revoke all on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric
) from anon;
grant execute on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, text, int, uuid, public.staff_transport_company, numeric, numeric
) to authenticated;
