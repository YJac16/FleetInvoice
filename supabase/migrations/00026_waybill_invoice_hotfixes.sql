-- =============================================================================
-- WorkOps — 00026 hotfix: backfill assign order + rate unit match
-- =============================================================================
-- Applied live on WorkOps prod 2026-09-21 after 00025 smoke failures.
-- Idempotent create or replace. Safe on DBs that already have 00025.

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
    and rc.unit::text in ('trip', 'fixed')
    and (rc.company_id = p_company_id or rc.company_id is null)
    and rc.effective_from <= p_period_start
    and (rc.effective_to is null or rc.effective_to >= p_period_start)
  order by rc.company_id nulls last, rc.effective_from desc
  limit 1;
end;
$$;

-- backfill: insert planned → assign_trip → complete → sync (assign rejects completed)
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

grant execute on function public.backfill_staff_waybill(
  uuid, uuid, timestamptz, public.staff_transport_company, text, int, numeric, numeric
) to authenticated;

-- Ensure staff trip companies have trip rate cards (idempotent by company name).
-- Lewis / Head Office R300; Springbok Atlas R440 if missing.
insert into public.rate_cards (
  organisation_id, company_id, line_type, unit, unit_amount, currency, effective_from, name
)
select
  c.organisation_id,
  c.id,
  'trip',
  'fixed',
  case when c.name ilike 'springbok%' then 440 else 300 end,
  'ZAR',
  date '2026-08-01',
  c.name || ' trip rate'
from public.companies c
where c.deleted_at is null
  and c.name in ('Lewis Compliance', 'Lewis Head Office', 'Springbok Atlas')
  and not exists (
    select 1 from public.rate_cards rc
    where rc.organisation_id = c.organisation_id
      and rc.company_id = c.id
      and rc.line_type = 'trip'
      and rc.deleted_at is null
  );
