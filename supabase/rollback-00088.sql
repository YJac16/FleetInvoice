-- =============================================================================
-- ROLLBACK: 00088_owner_and_audit_columns.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Drops owner_tag, updated_by,
-- set_audit_user() and its triggers, list_org_actor_names, and restores the
-- 00046 save_driver_capture / save_vehicle_capture definitions.
-- Run rollback-00089 .. rollback-00092 (or rollback-jacobs-org-copy.sql) first.
-- =============================================================================

begin;

drop trigger if exists trips_set_audit_user on public.trips;
drop trigger if exists drivers_set_audit_user on public.drivers;
drop trigger if exists vehicles_set_audit_user on public.vehicles;
drop trigger if exists invoices_set_audit_user on public.invoices;
drop trigger if exists rate_cards_set_audit_user on public.rate_cards;
drop trigger if exists route_prices_set_audit_user on public.route_prices;
drop trigger if exists workshop_bills_set_audit_user on public.workshop_bills;
drop function if exists public.set_audit_user();
drop function if exists public.list_org_actor_names(uuid);

alter table public.trips drop column if exists updated_by;
alter table public.drivers drop column if exists updated_by;
alter table public.vehicles drop column if exists updated_by;
alter table public.invoices drop column if exists updated_by;
alter table public.rate_cards drop column if exists updated_by;
alter table public.route_prices drop column if exists updated_by;
alter table public.workshop_bills drop column if exists updated_by;

alter table public.drivers drop column if exists owner_tag;
alter table public.vehicles drop column if exists owner_tag;
alter table public.invoices drop column if exists owner_tag;

CREATE OR REPLACE FUNCTION public.save_driver_capture(p_actor uuid, p_org uuid, p_driver_id uuid, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_action text;
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_driver_id is null then
    insert into public.drivers (
      organisation_id, full_name, email, phone, license_number, license_code, license_code_other,
      license_expires_on, pdp_number, pdp_categories, pdp_expires_on, profile_id, status, created_by
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
      updated_at = timezone('utc', now())
    where id = p_driver_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'driver.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'driver', v_id, jsonb_build_object('full_name', p_fields->>'full_name'), p_actor);
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_vehicle_capture(p_actor uuid, p_org uuid, p_vehicle_id uuid, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_action text;
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_vehicle_id is null then
    insert into public.vehicles (
      organisation_id, name, registration_number, vin, engine_number, make, model, model_year,
      colour, classification, operating_permit_number, operating_permit_expires_on,
      license_disc_expires_on, vehicle_type, capacity, company_id, status, created_by
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
      updated_at = timezone('utc', now())
    where id = p_vehicle_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'vehicle.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'vehicle', v_id, jsonb_build_object('name', p_fields->>'name'), p_actor);
  return v_id;
end;
$function$
;


revoke execute on function public.save_driver_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_driver_capture(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) to service_role;

commit;
