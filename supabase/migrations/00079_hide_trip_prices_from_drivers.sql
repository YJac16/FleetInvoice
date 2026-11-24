-- =============================================================================
-- 00079: hide billed prices from drivers and employees
-- =============================================================================
-- (a) suggest_trip_unit_price: drop the driver branch; only staff who can
--     manage trips may ask for a suggested price.
-- (b) Revoke column SELECT on trips.manual_unit_price / manual_price_area_key
--     from authenticated. SECURITY DEFINER RPCs (approve_driver_trip,
--     update_staff_trip, admin_create_staff_trip, sync_staff_trip_invoice_line)
--     run as owner and are unaffected. Clients must not `select *` on trips
--     (see lib/trip-columns.ts). reprice_on_next_sync is not a price: kept.
-- (c) rate_cards_select: drop 'supervisor' (they do not price or approve trips
--     in the app). Platform owner, organisation_admin, manager, dispatcher and
--     the scoped company_manager path stay. has_company_scope is unchanged.
-- (d) fuel_fillups_select: drivers see only their own fill-ups (driver_id =
--     current_driver_id); the has_company_scope branch (which exposed every
--     org fill-up, with unit_price and total_amount, to drivers and
--     employees) is removed. Staff roles and platform owner keep org-wide.
--     Employees have no ownership column on fuel_fillups, so they see none.
-- Not applied to any remote database from the PR; Engineering applies it.
-- =============================================================================

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

-- A column-level REVOKE is a no-op while authenticated holds table-level
-- SELECT (the Supabase default), so drop the table grant and re-grant every
-- column except the two price columns. Keep this list in sync with
-- lib/trip-columns.ts; a future trips column needs its own GRANT SELECT.
revoke select on table public.trips from authenticated;
revoke select (manual_unit_price, manual_price_area_key)
  on table public.trips from authenticated;
grant select (
  id,
  organisation_id,
  route_id,
  schedule_id,
  company_id,
  planned_start,
  planned_end,
  status,
  generation_key,
  notes,
  created_by,
  created_at,
  updated_at,
  deleted_at,
  service_locations,
  is_staff_transport,
  staff_company,
  area_text,
  pax_count,
  opening_km,
  closing_km,
  total_km,
  waybill_confirmed_at,
  staff_started_at,
  staff_completed_at,
  submitted_by_driver,
  approved_by,
  approved_at,
  rejected_reason,
  reprice_on_next_sync
) on table public.trips to authenticated;

drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards for select using (
  deleted_at is null and (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher'])
    or (public.is_company_manager(organisation_id) and company_id is not null and public.company_user_can_see(organisation_id, company_id))
  ));

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
        )
      )
    )
  );
