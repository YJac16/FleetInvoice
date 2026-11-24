-- ROLLBACK: 00079_hide_trip_prices_from_drivers.sql
-- Restores the 00070 suggest_trip_unit_price body (driver branch included)
-- and column SELECT on the two price columns. Does not touch 00077.

begin;

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

  if not (
    public.staff_can_manage_trips(p_organisation_id)
    or public.has_org_role_names(p_organisation_id, array['driver'])
  ) then
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

grant select on table public.trips to authenticated;
grant select (manual_unit_price, manual_price_area_key)
  on table public.trips to authenticated;

-- rate_cards_select back to the 00077 definition (supervisor included)
drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards for select using (
  deleted_at is null and (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher','supervisor'])
    or (public.is_company_manager(organisation_id) and company_id is not null and public.company_user_can_see(organisation_id, company_id))
  ));

-- fuel_fillups_select back to the 00057 definition (company-scope branch)
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
          or (
            case
              when public.is_company_manager(organisation_id) then
                false
              else
                company_id is not null
                and public.has_company_scope(organisation_id, company_id)
            end
          )
        )
      )
    )
  );

commit;
