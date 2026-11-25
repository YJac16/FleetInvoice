-- =============================================================================
-- 00088: owner dimension + user audit columns (additive)
--
--   1. owner_tag ('yaseen' | 'fadia' | null) on drivers, vehicles, invoices.
--      Driver-week invoices take their owner from drivers.owner_tag; the
--      invoices column is for invoices without a driver (company period
--      invoices) or an explicit override.
--      save_driver_capture / save_vehicle_capture persist and validate it.
--   2. updated_by on trips, drivers, vehicles, invoices, rate_cards,
--      route_prices, workshop_bills, stamped by set_audit_user():
--        INSERT: created_by (generated_by on invoices) := coalesce(given, auth.uid())
--                updated_by := coalesce(auth.uid(), given, created_by)
--        UPDATE: updated_by := coalesce(auth.uid(), given)
--      With app.preserve_audit_actor = 'true' (set LOCAL only by the
--      org-copy function) the trigger leaves every actor column as given.
--   3. list_org_actor_names(org): display names of the org's members for
--      "Entered by" / "Last edited by". profiles_select only lets a caller
--      read their own profile, so this definer RPC is the read path for
--      admin / manager / dispatcher / supervisor (never driver, employee
--      or company_manager).
--
-- No price columns are touched; trips.updated_by gets its own column GRANT
-- (00079 dropped the table-level trips SELECT grant).
-- Rollback: supabase/rollback-00088.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. owner_tag
-- ---------------------------------------------------------------------------
alter table public.drivers
  add column if not exists owner_tag text;
alter table public.vehicles
  add column if not exists owner_tag text;
alter table public.invoices
  add column if not exists owner_tag text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_owner_tag_check') then
    alter table public.drivers add constraint drivers_owner_tag_check
      check (owner_tag is null or owner_tag in ('yaseen', 'fadia'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_owner_tag_check') then
    alter table public.vehicles add constraint vehicles_owner_tag_check
      check (owner_tag is null or owner_tag in ('yaseen', 'fadia'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_owner_tag_check') then
    alter table public.invoices add constraint invoices_owner_tag_check
      check (owner_tag is null or owner_tag in ('yaseen', 'fadia'));
  end if;
end $$;

create index if not exists drivers_org_owner_tag_idx
  on public.drivers (organisation_id, owner_tag) where deleted_at is null;
create index if not exists vehicles_org_owner_tag_idx
  on public.vehicles (organisation_id, owner_tag) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. updated_by + set_audit_user()
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.drivers
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.vehicles
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.invoices
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.rate_cards
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.route_prices
  add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.workshop_bills
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

create index if not exists trips_updated_by_idx on public.trips (updated_by);
create index if not exists drivers_updated_by_idx on public.drivers (updated_by);
create index if not exists vehicles_updated_by_idx on public.vehicles (updated_by);
create index if not exists invoices_updated_by_idx on public.invoices (updated_by);
create index if not exists rate_cards_updated_by_idx on public.rate_cards (updated_by);
create index if not exists route_prices_updated_by_idx on public.route_prices (updated_by);
create index if not exists workshop_bills_updated_by_idx on public.workshop_bills (updated_by);

-- 00079 dropped table-level SELECT on trips; new columns need their own grant.
grant select (updated_by) on table public.trips to authenticated;

create or replace function public.set_audit_user()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if coalesce(current_setting('app.preserve_audit_actor', true), '') = 'true' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if tg_table_name = 'invoices' then
      new.generated_by := coalesce(new.generated_by, v_uid);
      new.updated_by := coalesce(v_uid, new.updated_by, new.generated_by);
    else
      new.created_by := coalesce(new.created_by, v_uid);
      new.updated_by := coalesce(v_uid, new.updated_by, new.created_by);
    end if;
  elsif tg_op = 'UPDATE' then
    new.updated_by := coalesce(v_uid, new.updated_by);
  end if;
  return new;
end;
$$;

revoke all on function public.set_audit_user() from public, anon, authenticated;

drop trigger if exists trips_set_audit_user on public.trips;
create trigger trips_set_audit_user
  before insert or update on public.trips
  for each row execute function public.set_audit_user();

drop trigger if exists drivers_set_audit_user on public.drivers;
create trigger drivers_set_audit_user
  before insert or update on public.drivers
  for each row execute function public.set_audit_user();

drop trigger if exists vehicles_set_audit_user on public.vehicles;
create trigger vehicles_set_audit_user
  before insert or update on public.vehicles
  for each row execute function public.set_audit_user();

drop trigger if exists invoices_set_audit_user on public.invoices;
create trigger invoices_set_audit_user
  before insert or update on public.invoices
  for each row execute function public.set_audit_user();

drop trigger if exists rate_cards_set_audit_user on public.rate_cards;
create trigger rate_cards_set_audit_user
  before insert or update on public.rate_cards
  for each row execute function public.set_audit_user();

drop trigger if exists route_prices_set_audit_user on public.route_prices;
create trigger route_prices_set_audit_user
  before insert or update on public.route_prices
  for each row execute function public.set_audit_user();

drop trigger if exists workshop_bills_set_audit_user on public.workshop_bills;
create trigger workshop_bills_set_audit_user
  before insert or update on public.workshop_bills
  for each row execute function public.set_audit_user();

-- ---------------------------------------------------------------------------
-- save_driver_capture / save_vehicle_capture (00046) + owner_tag, updated_by.
-- On update, owner_tag only changes when the key is present in p_fields.
-- ---------------------------------------------------------------------------
create or replace function public.save_driver_capture(
  p_actor uuid,
  p_org uuid,
  p_driver_id uuid,
  p_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
  v_owner text := nullif(btrim(coalesce(p_fields->>'owner_tag', '')), '');
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if v_owner is not null and v_owner not in ('yaseen', 'fadia') then
    raise exception 'invalid_owner_tag';
  end if;

  if p_driver_id is null then
    insert into public.drivers (
      organisation_id, full_name, email, phone, license_number, license_code, license_code_other,
      license_expires_on, pdp_number, pdp_categories, pdp_expires_on, profile_id, status,
      owner_tag, created_by, updated_by
    ) values (
      p_org,
      p_fields->>'full_name',
      nullif(p_fields->>'email',''),
      nullif(p_fields->>'phone',''),
      nullif(p_fields->>'license_number',''),
      nullif(p_fields->>'license_code',''),
      nullif(p_fields->>'license_code_other',''),
      nullif(p_fields->>'license_expires_on','')::date,
      nullif(p_fields->>'pdp_number',''),
      nullif(p_fields->>'pdp_categories',''),
      nullif(p_fields->>'pdp_expires_on','')::date,
      nullif(p_fields->>'profile_id','')::uuid,
      coalesce(p_fields->>'status','active')::public.entity_status,
      v_owner,
      p_actor,
      p_actor
    ) returning id into v_id;
    v_action := 'driver.created';
  else
    update public.drivers set
      full_name = coalesce(p_fields->>'full_name', full_name),
      email = nullif(p_fields->>'email',''),
      phone = nullif(p_fields->>'phone',''),
      license_number = nullif(p_fields->>'license_number',''),
      license_code = nullif(p_fields->>'license_code',''),
      license_code_other = nullif(p_fields->>'license_code_other',''),
      license_expires_on = nullif(p_fields->>'license_expires_on','')::date,
      pdp_number = nullif(p_fields->>'pdp_number',''),
      pdp_categories = nullif(p_fields->>'pdp_categories',''),
      pdp_expires_on = nullif(p_fields->>'pdp_expires_on','')::date,
      profile_id = nullif(p_fields->>'profile_id','')::uuid,
      status = coalesce(p_fields->>'status', status::text)::public.entity_status,
      owner_tag = case when p_fields ? 'owner_tag' then v_owner else owner_tag end,
      updated_by = p_actor,
      updated_at = timezone('utc', now())
    where id = p_driver_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'driver.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'driver', v_id, jsonb_build_object('full_name', p_fields->>'full_name'), p_actor);
  return v_id;
end;
$$;

create or replace function public.save_vehicle_capture(
  p_actor uuid,
  p_org uuid,
  p_vehicle_id uuid,
  p_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
  v_owner text := nullif(btrim(coalesce(p_fields->>'owner_tag', '')), '');
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if v_owner is not null and v_owner not in ('yaseen', 'fadia') then
    raise exception 'invalid_owner_tag';
  end if;

  if p_vehicle_id is null then
    insert into public.vehicles (
      organisation_id, name, registration_number, vin, engine_number, make, model, model_year,
      colour, classification, operating_permit_number, operating_permit_expires_on,
      license_disc_expires_on, vehicle_type, capacity, company_id, status,
      owner_tag, created_by, updated_by
    ) values (
      p_org,
      p_fields->>'name',
      nullif(p_fields->>'registration_number',''),
      nullif(p_fields->>'vin',''),
      nullif(p_fields->>'engine_number',''),
      nullif(p_fields->>'make',''),
      nullif(p_fields->>'model',''),
      nullif(p_fields->>'model_year','')::integer,
      nullif(p_fields->>'colour',''),
      nullif(p_fields->>'classification',''),
      nullif(p_fields->>'operating_permit_number',''),
      nullif(p_fields->>'operating_permit_expires_on','')::date,
      nullif(p_fields->>'license_disc_expires_on','')::date,
      coalesce(p_fields->>'vehicle_type','other')::public.vehicle_type,
      nullif(p_fields->>'capacity','')::integer,
      nullif(p_fields->>'company_id','')::uuid,
      coalesce(p_fields->>'status','active')::public.entity_status,
      v_owner,
      p_actor,
      p_actor
    ) returning id into v_id;
    v_action := 'vehicle.created';
  else
    update public.vehicles set
      name = coalesce(p_fields->>'name', name),
      registration_number = nullif(p_fields->>'registration_number',''),
      vin = nullif(p_fields->>'vin',''),
      engine_number = nullif(p_fields->>'engine_number',''),
      make = nullif(p_fields->>'make',''),
      model = nullif(p_fields->>'model',''),
      model_year = nullif(p_fields->>'model_year','')::integer,
      colour = nullif(p_fields->>'colour',''),
      classification = nullif(p_fields->>'classification',''),
      operating_permit_number = nullif(p_fields->>'operating_permit_number',''),
      operating_permit_expires_on = nullif(p_fields->>'operating_permit_expires_on','')::date,
      license_disc_expires_on = nullif(p_fields->>'license_disc_expires_on','')::date,
      vehicle_type = coalesce(p_fields->>'vehicle_type', vehicle_type::text)::public.vehicle_type,
      capacity = nullif(p_fields->>'capacity','')::integer,
      company_id = nullif(p_fields->>'company_id','')::uuid,
      status = coalesce(p_fields->>'status', status::text)::public.entity_status,
      owner_tag = case when p_fields ? 'owner_tag' then v_owner else owner_tag end,
      updated_by = p_actor,
      updated_at = timezone('utc', now())
    where id = p_vehicle_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'vehicle.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'vehicle', v_id, jsonb_build_object('name', p_fields->>'name'), p_actor);
  return v_id;
end;
$$;

revoke execute on function public.save_driver_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_driver_capture(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. list_org_actor_names
-- ---------------------------------------------------------------------------
create or replace function public.list_org_actor_names(p_organisation_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
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
    raise exception 'Not authorised';
  end if;

  return query
  select distinct on (m.user_id)
    m.user_id,
    coalesce(
      nullif(btrim(p.full_name), ''),
      nullif(btrim(d.full_name), ''),
      nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
      'Unknown user'
    )::text as display_name
  from public.organisation_members m
  left join public.profiles p on p.id = m.user_id
  left join public.drivers d
    on d.profile_id = m.user_id
   and d.organisation_id = m.organisation_id
   and d.deleted_at is null
  where m.organisation_id = p_organisation_id
    and m.deleted_at is null
  order by m.user_id;
end;
$$;

revoke all on function public.list_org_actor_names(uuid) from public, anon;
grant execute on function public.list_org_actor_names(uuid) to authenticated;
