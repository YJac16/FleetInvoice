-- Fleet driver/vehicle writes: audited RPCs only (no direct client INSERT/UPDATE).

create or replace function public.import_drivers_capture(
  p_actor uuid,
  p_org uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows';
  end if;

  for rec in select value from jsonb_array_elements(p_rows)
  loop
    v_id := public.save_driver_capture(p_actor, p_org, null, rec);
    v_ids := array_append(v_ids, v_id);
  end loop;

  if array_length(v_ids, 1) > 0 then
    perform public.write_audit_log(
      p_org,
      'drivers.imported',
      'driver',
      v_ids[1],
      jsonb_build_object('count', array_length(v_ids, 1)),
      p_actor
    );
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids));
end;
$$;

create or replace function public.import_vehicles_capture(
  p_actor uuid,
  p_org uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows';
  end if;

  for rec in select value from jsonb_array_elements(p_rows)
  loop
    v_id := public.save_vehicle_capture(p_actor, p_org, null, rec);
    v_ids := array_append(v_ids, v_id);
  end loop;

  if array_length(v_ids, 1) > 0 then
    perform public.write_audit_log(
      p_org,
      'vehicles.imported',
      'vehicle',
      v_ids[1],
      jsonb_build_object('count', array_length(v_ids, 1)),
      p_actor
    );
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids));
end;
$$;

create or replace function public.save_driver_self_contact(
  p_org uuid,
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
begin
  v_driver_id := public.current_driver_id(p_org);
  if v_driver_id is null then
    raise exception 'not_authorised';
  end if;

  update public.drivers
  set
    full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
    phone = nullif(btrim(p_phone), ''),
    updated_at = timezone('utc', now())
  where id = v_driver_id
    and organisation_id = p_org
    and deleted_at is null;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'driver.contact_updated',
    'driver',
    v_driver_id,
    jsonb_build_object('phone_set', p_phone is not null and btrim(p_phone) <> ''),
    auth.uid()
  );
end;
$$;

revoke all on function public.import_drivers_capture(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.import_vehicles_capture(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_drivers_capture(uuid, uuid, jsonb) to service_role;
grant execute on function public.import_vehicles_capture(uuid, uuid, jsonb) to service_role;

revoke all on function public.save_driver_self_contact(uuid, text, text) from public, anon;
grant execute on function public.save_driver_self_contact(uuid, text, text) to authenticated;

-- Direct client INSERT/UPDATE on fleet rows is denied; use audited RPCs via API.
drop policy if exists drivers_insert on public.drivers;
drop policy if exists drivers_update on public.drivers;
drop policy if exists vehicles_insert on public.vehicles;
drop policy if exists vehicles_update on public.vehicles;

-- Ensure vehicle_type uses enum on capture writes.
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
$$;
