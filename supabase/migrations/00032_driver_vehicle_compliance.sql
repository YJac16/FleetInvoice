-- =============================================================================
-- WorkOps — Driver & vehicle compliance (register, assignment, RLS, RPCs)
-- Requires 00027_compliance_renewals.sql. Enum alert fn in 00033.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SAST dates, milestones, status)
-- ---------------------------------------------------------------------------

create or replace function public.compliance_today_sast()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Africa/Johannesburg', now()))::date;
$$;

create or replace function public.compliance_milestone_for_days(p_days integer)
returns text
language sql
immutable
as $$
  select case
    when p_days < 0 then 'expired'
    when p_days <= 7 then '7'
    when p_days <= 30 then '30'
    when p_days <= 60 then '60'
    else null
  end;
$$;

create or replace function public.compliance_status_for_days(p_days integer)
returns text
language sql
immutable
as $$
  select case
    when p_days < 0 then 'expired'
    when p_days <= 7 then 'due_7'
    when p_days <= 30 then 'due_30'
    when p_days <= 60 then 'due_60'
    else 'ok'
  end;
$$;

grant execute on function public.compliance_today_sast() to authenticated;
grant execute on function public.compliance_milestone_for_days(integer) to authenticated;
grant execute on function public.compliance_status_for_days(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 1.1 Drivers: licence code
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column if not exists license_code text,
  add column if not exists license_code_other text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drivers_license_code_chk'
  ) then
    alter table public.drivers
      add constraint drivers_license_code_chk check (
        license_code is null
        or license_code in ('A1','A','B','EB','C1','C','EC1','EC','Other')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'drivers_license_code_other_chk'
  ) then
    alter table public.drivers
      add constraint drivers_license_code_other_chk check (
        (license_code = 'Other' and license_code_other is not null
          and length(btrim(license_code_other)) between 2 and 60)
        or (license_code is distinct from 'Other' and license_code_other is null)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1.2 Vehicles: register fields
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists model_year smallint,
  add column if not exists colour text,
  add column if not exists classification text,
  add column if not exists operating_permit_number text,
  add column if not exists operating_permit_expires_on date,
  add column if not exists license_disc_expires_on date;

comment on column public.vehicles.operating_permit_number is
  'Operating-licence/permit record associated with this vehicle in the fleet register (not a legal assertion).';
comment on column public.vehicles.operating_permit_expires_on is
  'Fleet-register operating permit expiry (authoritative for compliance alerts).';
comment on column public.vehicles.license_disc_expires_on is
  'Licence disc expiry on the vehicle record (authoritative for compliance alerts).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_model_year_backstop_chk') then
    alter table public.vehicles
      add constraint vehicles_model_year_backstop_chk check (
        model_year is null or (model_year >= 1950 and model_year <= 2100)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_make_len_chk') then
    alter table public.vehicles add constraint vehicles_make_len_chk check (
      make is null or length(btrim(make)) between 1 and 60
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_model_len_chk') then
    alter table public.vehicles add constraint vehicles_model_len_chk check (
      model is null or length(btrim(model)) between 1 and 60
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_colour_len_chk') then
    alter table public.vehicles add constraint vehicles_colour_len_chk check (
      colour is null or length(btrim(colour)) between 1 and 40
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_classification_len_chk') then
    alter table public.vehicles add constraint vehicles_classification_len_chk check (
      classification is null or length(btrim(classification)) between 1 and 60
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicles_operating_permit_number_len_chk') then
    alter table public.vehicles add constraint vehicles_operating_permit_number_len_chk check (
      operating_permit_number is null
      or length(btrim(operating_permit_number)) between 1 and 60
    );
  end if;
end $$;

create or replace function public.validate_vehicle_model_year()
returns trigger
language plpgsql
as $$
declare
  v_max smallint;
begin
  if new.model_year is null then
    return new;
  end if;
  v_max := (extract(year from timezone('Africa/Johannesburg', now()))::integer + 1)::smallint;
  if new.model_year < 1950 or new.model_year > v_max then
    raise exception 'model_year must be between 1950 and %', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_validate_model_year on public.vehicles;
create trigger vehicles_validate_model_year
before insert or update of model_year on public.vehicles
for each row execute function public.validate_vehicle_model_year();

create index if not exists vehicles_permit_expires_idx
  on public.vehicles (organisation_id, operating_permit_expires_on)
  where deleted_at is null and operating_permit_expires_on is not null;

create index if not exists vehicles_disc_expires_idx
  on public.vehicles (organisation_id, license_disc_expires_on)
  where deleted_at is null and license_disc_expires_on is not null;

-- ---------------------------------------------------------------------------
-- 1.3 Standing driver ↔ vehicle assignment
-- ---------------------------------------------------------------------------

create table if not exists public.driver_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  starts_on date not null default current_date,
  ends_on date,
  created_by uuid default auth.uid(),
  ended_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (ends_on is null or ends_on >= starts_on)
);

create unique index if not exists dva_one_open_per_driver
  on public.driver_vehicle_assignments (driver_id)
  where ends_on is null and deleted_at is null;

create unique index if not exists dva_one_open_per_vehicle
  on public.driver_vehicle_assignments (vehicle_id)
  where ends_on is null and deleted_at is null;

create index if not exists dva_org_open_idx
  on public.driver_vehicle_assignments (organisation_id, driver_id)
  where ends_on is null and deleted_at is null;

drop trigger if exists driver_vehicle_assignments_set_updated_at on public.driver_vehicle_assignments;
create trigger driver_vehicle_assignments_set_updated_at
before update on public.driver_vehicle_assignments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 1.5 Alert dedupe + admin inbox
-- ---------------------------------------------------------------------------

create table if not exists public.compliance_alerts_sent (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  subject_kind text not null check (subject_kind in
    ('driver_license','driver_pdp','vehicle_permit','vehicle_disc','vehicle_document')),
  subject_id uuid not null,
  expires_on date not null,
  milestone text not null check (milestone in ('60','30','7','expired')),
  audience text not null check (audience in ('admin','driver')),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (subject_kind, subject_id, expires_on, milestone, audience, recipient_user_id)
);

alter table public.compliance_alerts_sent enable row level security;

create table if not exists public.admin_inbox_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null default 'compliance_expiry',
  title text not null,
  body text not null,
  link_path text,
  subject_kind text,
  subject_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_inbox_recipient_idx
  on public.admin_inbox_notifications (organisation_id, recipient_user_id, created_at desc);

alter table public.admin_inbox_notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Company scope helpers for compliance RPCs
-- ---------------------------------------------------------------------------

create or replace function public.driver_serves_company(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_within_days integer default 90
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.driver_vehicle_assignments dva
    join public.vehicles v on v.id = dva.vehicle_id
    where dva.driver_id = p_driver_id
      and dva.organisation_id = p_organisation_id
      and dva.ends_on is null
      and dva.deleted_at is null
      and v.deleted_at is null
      and v.company_id is not null
      and public.has_company_scope(p_organisation_id, v.company_id)
  )
  or exists (
    select 1
    from public.trip_assignments ta
    join public.trips t on t.id = ta.trip_id
    join public.companies c on c.id = t.company_id
    where ta.driver_id = p_driver_id
      and ta.organisation_id = p_organisation_id
      and ta.deleted_at is null
      and ta.released_at is null
      and t.deleted_at is null
      and t.company_id is not null
      and public.has_company_scope(p_organisation_id, t.company_id)
      and (t.planned_start::date - public.compliance_today_sast()) between -p_within_days and p_within_days
  );
$$;

create or replace function public.vehicle_in_company_scope(
  p_organisation_id uuid,
  p_vehicle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and (
        v.company_id is null
        or public.has_company_scope(p_organisation_id, v.company_id)
      )
  );
$$;

grant execute on function public.driver_serves_company(uuid, uuid, integer) to authenticated;
grant execute on function public.vehicle_in_company_scope(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Assignment RPCs
-- ---------------------------------------------------------------------------

create or replace function public.assign_vehicle_to_driver(
  p_driver_id uuid,
  p_vehicle_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.drivers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_org uuid;
  v_existing_driver_vehicle uuid;
  v_existing_vehicle_driver uuid;
  v_new_id uuid;
  v_old_vehicle_id uuid;
  v_old_driver_id uuid;
begin
  if p_driver_id is null or p_vehicle_id is null then
    raise exception 'driver_id and vehicle_id are required';
  end if;

  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found or v_driver.deleted_at is not null then
    raise exception 'Driver not found';
  end if;
  if v_driver.status <> 'active' then
    raise exception 'Driver is not active';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or v_vehicle.deleted_at is not null then
    raise exception 'Vehicle not found';
  end if;
  if v_vehicle.status <> 'active' then
    raise exception 'Vehicle is not active';
  end if;

  if v_driver.organisation_id <> v_vehicle.organisation_id then
    raise exception 'Driver and vehicle must belong to the same organisation';
  end if;

  v_org := v_driver.organisation_id;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      v_org,
      array['organisation_admin','manager','dispatcher','supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_org::text || ':dva:' || p_driver_id::text));
  perform pg_advisory_xact_lock(hashtext(v_org::text || ':dva:' || p_vehicle_id::text));

  select vehicle_id into v_existing_driver_vehicle
  from public.driver_vehicle_assignments
  where driver_id = p_driver_id
    and ends_on is null
    and deleted_at is null
  limit 1;

  if v_existing_driver_vehicle = p_vehicle_id then
    return (
      select id from public.driver_vehicle_assignments
      where driver_id = p_driver_id and vehicle_id = p_vehicle_id
        and ends_on is null and deleted_at is null
      limit 1
    );
  end if;

  select driver_id into v_existing_vehicle_driver
  from public.driver_vehicle_assignments
  where vehicle_id = p_vehicle_id
    and ends_on is null
    and deleted_at is null
  limit 1;

  v_old_vehicle_id := v_existing_driver_vehicle;
  v_old_driver_id := v_existing_vehicle_driver;

  update public.driver_vehicle_assignments
  set ends_on = public.compliance_today_sast(),
      ended_by = auth.uid(),
      updated_at = timezone('utc', now())
  where organisation_id = v_org
    and ends_on is null
    and deleted_at is null
    and (driver_id = p_driver_id or vehicle_id = p_vehicle_id);

  insert into public.driver_vehicle_assignments (
    organisation_id, driver_id, vehicle_id, created_by
  )
  values (v_org, p_driver_id, p_vehicle_id, auth.uid())
  returning id into v_new_id;

  if v_old_vehicle_id is not null and v_old_vehicle_id <> p_vehicle_id then
    perform public.write_audit_log(
      v_org,
      'driver_vehicle.reassigned',
      'driver_vehicle_assignment',
      v_new_id,
      jsonb_build_object(
        'driver_id', p_driver_id,
        'from_vehicle_id', v_old_vehicle_id,
        'to_vehicle_id', p_vehicle_id
      )
    );
  elsif v_old_driver_id is not null and v_old_driver_id <> p_driver_id then
    perform public.write_audit_log(
      v_org,
      'driver_vehicle.reassigned',
      'driver_vehicle_assignment',
      v_new_id,
      jsonb_build_object(
        'vehicle_id', p_vehicle_id,
        'from_driver_id', v_old_driver_id,
        'to_driver_id', p_driver_id
      )
    );
  else
    perform public.write_audit_log(
      v_org,
      'driver_vehicle.assigned',
      'driver_vehicle_assignment',
      v_new_id,
      jsonb_build_object(
        'driver_id', p_driver_id,
        'vehicle_id', p_vehicle_id,
        'registration_number', v_vehicle.registration_number
      )
    );
  end if;

  return v_new_id;
exception
  when unique_violation then
    raise exception 'An open assignment already exists for this driver or vehicle';
end;
$$;

create or replace function public.unassign_vehicle(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.drivers%rowtype;
  v_open record;
begin
  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found or v_driver.deleted_at is not null then
    raise exception 'Driver not found';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      v_driver.organisation_id,
      array['organisation_admin','manager','dispatcher','supervisor']
    )
  ) then
    raise exception 'Not authorised';
  end if;

  select * into v_open
  from public.driver_vehicle_assignments
  where driver_id = p_driver_id
    and ends_on is null
    and deleted_at is null
  for update;

  if not found then
    return;
  end if;

  update public.driver_vehicle_assignments
  set ends_on = public.compliance_today_sast(),
      ended_by = auth.uid(),
      updated_at = timezone('utc', now())
  where id = v_open.id;

  perform public.write_audit_log(
    v_driver.organisation_id,
    'driver_vehicle.unassigned',
    'driver_vehicle_assignment',
    v_open.id,
    jsonb_build_object(
      'driver_id', p_driver_id,
      'vehicle_id', v_open.vehicle_id
    )
  );
end;
$$;

grant execute on function public.assign_vehicle_to_driver(uuid, uuid) to authenticated;
grant execute on function public.unassign_vehicle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_trip_driver_names — trip-scoped driver names (no licence fields)
-- ---------------------------------------------------------------------------

create or replace function public.get_trip_driver_names(p_trip_ids uuid[])
returns table (trip_id uuid, driver_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_trip_ids is null or coalesce(array_length(p_trip_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  select t.id as trip_id, d.id as driver_id, d.full_name
  from public.trips t
  join public.trip_assignments ta on ta.trip_id = t.id and ta.deleted_at is null
  join public.drivers d on d.id = ta.driver_id and d.deleted_at is null
  where t.id = any (p_trip_ids)
    and t.deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        t.organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or (
        public.is_org_member(t.organisation_id)
        and (
          ta.driver_id = public.current_driver_id(t.organisation_id)
          or exists (
            select 1 from public.trip_passengers tp
            join public.employees e on e.id = tp.employee_id
            where tp.trip_id = t.id
              and e.profile_id = auth.uid()
          )
        )
      )
    );
end;
$$;

grant execute on function public.get_trip_driver_names(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- list_compliance_renewals — new contract
-- ---------------------------------------------------------------------------

drop function if exists public.list_compliance_renewals(uuid, integer);

create or replace function public.list_compliance_renewals(
  p_organisation_id uuid,
  p_within_days integer default 90
)
returns table (
  subject_kind text,
  subject_id uuid,
  organisation_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  subject_name text,
  registration_number text,
  document_label text,
  expires_on date,
  days_remaining integer,
  status text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today date := public.compliance_today_sast();
  v_full_access boolean;
  v_company_scope boolean;
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required';
  end if;
  if p_within_days is null or p_within_days < 0 then
    raise exception 'within_days must be >= 0';
  end if;

  v_full_access := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin','manager','dispatcher','supervisor']
    );

  v_company_scope := public.has_org_role_names(
    p_organisation_id,
    array['company_manager']
  );

  if not v_full_access and not v_company_scope then
    raise exception 'Not authorised';
  end if;

  return query
  select *
  from (
    select
      'driver_license'::text,
      d.id,
      d.organisation_id,
      d.id,
      oav.vehicle_id,
      d.full_name,
      v.registration_number,
      null::text,
      d.license_expires_on,
      (d.license_expires_on - v_today)::integer,
      public.compliance_status_for_days((d.license_expires_on - v_today)::integer)
    from public.drivers d
    left join lateral (
      select dva.vehicle_id
      from public.driver_vehicle_assignments dva
      where dva.driver_id = d.id and dva.ends_on is null and dva.deleted_at is null
      limit 1
    ) oav on true
    left join public.vehicles v on v.id = oav.vehicle_id
    where d.organisation_id = p_organisation_id
      and d.deleted_at is null
      and d.license_expires_on is not null
      and (d.license_expires_on - v_today) <= p_within_days
      and (
        v_full_access
        or public.driver_serves_company(p_organisation_id, d.id, p_within_days)
      )

    union all

    select
      'driver_pdp'::text,
      d.id,
      d.organisation_id,
      d.id,
      oav.vehicle_id,
      d.full_name,
      v.registration_number,
      null::text,
      d.pdp_expires_on,
      (d.pdp_expires_on - v_today)::integer,
      public.compliance_status_for_days((d.pdp_expires_on - v_today)::integer)
    from public.drivers d
    left join lateral (
      select dva.vehicle_id
      from public.driver_vehicle_assignments dva
      where dva.driver_id = d.id and dva.ends_on is null and dva.deleted_at is null
      limit 1
    ) oav on true
    left join public.vehicles v on v.id = oav.vehicle_id
    where d.organisation_id = p_organisation_id
      and d.deleted_at is null
      and d.pdp_expires_on is not null
      and (d.pdp_expires_on - v_today) <= p_within_days
      and (
        v_full_access
        or public.driver_serves_company(p_organisation_id, d.id, p_within_days)
      )

    union all

    select
      'vehicle_permit'::text,
      v.id,
      v.organisation_id,
      oad.driver_id,
      v.id,
      v.name,
      v.registration_number,
      null::text,
      v.operating_permit_expires_on,
      (v.operating_permit_expires_on - v_today)::integer,
      public.compliance_status_for_days((v.operating_permit_expires_on - v_today)::integer)
    from public.vehicles v
    left join lateral (
      select dva.driver_id
      from public.driver_vehicle_assignments dva
      where dva.vehicle_id = v.id and dva.ends_on is null and dva.deleted_at is null
      limit 1
    ) oad on true
    where v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and v.operating_permit_expires_on is not null
      and (v.operating_permit_expires_on - v_today) <= p_within_days
      and (
        v_full_access
        or public.vehicle_in_company_scope(p_organisation_id, v.id)
      )

    union all

    select
      'vehicle_disc'::text,
      v.id,
      v.organisation_id,
      oad.driver_id,
      v.id,
      v.name,
      v.registration_number,
      null::text,
      v.license_disc_expires_on,
      (v.license_disc_expires_on - v_today)::integer,
      public.compliance_status_for_days((v.license_disc_expires_on - v_today)::integer)
    from public.vehicles v
    left join lateral (
      select dva.driver_id
      from public.driver_vehicle_assignments dva
      where dva.vehicle_id = v.id and dva.ends_on is null and dva.deleted_at is null
      limit 1
    ) oad on true
    where v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and v.license_disc_expires_on is not null
      and (v.license_disc_expires_on - v_today) <= p_within_days
      and (
        v_full_access
        or public.vehicle_in_company_scope(p_organisation_id, v.id)
      )

    union all

    select
      'vehicle_document'::text,
      vd.id,
      vd.organisation_id,
      oad.driver_id,
      v.id,
      v.name,
      v.registration_number,
      vd.name,
      vd.expires_at,
      (vd.expires_at - v_today)::integer,
      public.compliance_status_for_days((vd.expires_at - v_today)::integer)
    from public.vehicle_documents vd
    join public.vehicles v on v.id = vd.vehicle_id and v.organisation_id = vd.organisation_id
    left join lateral (
      select dva.driver_id
      from public.driver_vehicle_assignments dva
      where dva.vehicle_id = v.id and dva.ends_on is null and dva.deleted_at is null
      limit 1
    ) oad on true
    where vd.organisation_id = p_organisation_id
      and vd.deleted_at is null
      and v.deleted_at is null
      and vd.expires_at is not null
      and vd.doc_type not in ('license_disk')
      and (vd.expires_at - v_today) <= p_within_days
      and (
        v_full_access
        or public.vehicle_in_company_scope(p_organisation_id, v.id)
      )
  ) items
  order by expires_on asc, subject_kind asc, subject_name asc;
end;
$$;

grant execute on function public.list_compliance_renewals(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- list_my_compliance — driver self view
-- ---------------------------------------------------------------------------

create or replace function public.list_my_compliance(p_organisation_id uuid)
returns table (
  subject_kind text,
  subject_id uuid,
  organisation_id uuid,
  driver_id uuid,
  vehicle_id uuid,
  subject_name text,
  registration_number text,
  document_label text,
  expires_on date,
  days_remaining integer,
  status text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_today date := public.compliance_today_sast();
begin
  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'Not authorised';
  end if;

  return query
  select *
  from (
    select
      'driver_license'::text,
      d.id,
      d.organisation_id,
      d.id,
      oav.vehicle_id,
      d.full_name,
      v.registration_number,
      null::text,
      d.license_expires_on,
      (d.license_expires_on - v_today)::integer,
      public.compliance_status_for_days((d.license_expires_on - v_today)::integer)
    from public.drivers d
    left join lateral (
      select dva.vehicle_id from public.driver_vehicle_assignments dva
      where dva.driver_id = d.id and dva.ends_on is null and dva.deleted_at is null limit 1
    ) oav on true
    left join public.vehicles v on v.id = oav.vehicle_id
    where d.id = v_driver_id and d.license_expires_on is not null

    union all

    select
      'driver_pdp'::text,
      d.id,
      d.organisation_id,
      d.id,
      oav.vehicle_id,
      d.full_name,
      v.registration_number,
      null::text,
      d.pdp_expires_on,
      (d.pdp_expires_on - v_today)::integer,
      public.compliance_status_for_days((d.pdp_expires_on - v_today)::integer)
    from public.drivers d
    left join lateral (
      select dva.vehicle_id from public.driver_vehicle_assignments dva
      where dva.driver_id = d.id and dva.ends_on is null and dva.deleted_at is null limit 1
    ) oav on true
    left join public.vehicles v on v.id = oav.vehicle_id
    where d.id = v_driver_id and d.pdp_expires_on is not null

    union all

    select
      'vehicle_permit'::text,
      v.id,
      v.organisation_id,
      v_driver_id,
      v.id,
      v.name,
      v.registration_number,
      null::text,
      v.operating_permit_expires_on,
      (v.operating_permit_expires_on - v_today)::integer,
      public.compliance_status_for_days((v.operating_permit_expires_on - v_today)::integer)
    from public.vehicles v
    join public.driver_vehicle_assignments dva on dva.vehicle_id = v.id
      and dva.driver_id = v_driver_id and dva.ends_on is null and dva.deleted_at is null
    where v.operating_permit_expires_on is not null

    union all

    select
      'vehicle_disc'::text,
      v.id,
      v.organisation_id,
      v_driver_id,
      v.id,
      v.name,
      v.registration_number,
      null::text,
      v.license_disc_expires_on,
      (v.license_disc_expires_on - v_today)::integer,
      public.compliance_status_for_days((v.license_disc_expires_on - v_today)::integer)
    from public.vehicles v
    join public.driver_vehicle_assignments dva on dva.vehicle_id = v.id
      and dva.driver_id = v_driver_id and dva.ends_on is null and dva.deleted_at is null
    where v.license_disc_expires_on is not null

    union all

    select
      'vehicle_document'::text,
      vd.id,
      vd.organisation_id,
      v_driver_id,
      v.id,
      v.name,
      v.registration_number,
      vd.name,
      vd.expires_at,
      (vd.expires_at - v_today)::integer,
      public.compliance_status_for_days((vd.expires_at - v_today)::integer)
    from public.vehicle_documents vd
    join public.vehicles v on v.id = vd.vehicle_id
    join public.driver_vehicle_assignments dva on dva.vehicle_id = v.id
      and dva.driver_id = v_driver_id and dva.ends_on is null and dva.deleted_at is null
    where vd.deleted_at is null
      and vd.expires_at is not null
      and vd.doc_type not in ('license_disk')
  ) items
  order by expires_on asc nulls last;
end;
$$;

grant execute on function public.list_my_compliance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_compliance_missing_data
-- ---------------------------------------------------------------------------

create or replace function public.list_compliance_missing_data(p_organisation_id uuid)
returns table (
  category text,
  entity_kind text,
  entity_id uuid,
  entity_name text,
  link_path text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_full_access boolean;
  v_company_scope boolean;
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required';
  end if;

  v_full_access := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin','manager','dispatcher','supervisor']
    );
  v_company_scope := public.has_org_role_names(
    p_organisation_id,
    array['company_manager']
  );

  if not v_full_access and not v_company_scope then
    raise exception 'Not authorised';
  end if;

  return query
  select 'missing_license_expiry'::text, 'driver'::text, d.id, d.full_name,
    format('/drivers?edit=%s', d.id)
  from public.drivers d
  where d.organisation_id = p_organisation_id
    and d.deleted_at is null
    and d.status = 'active'
    and d.license_expires_on is null
    and (v_full_access or public.driver_serves_company(p_organisation_id, d.id, 90))

  union all

  select 'missing_pdp', 'driver', d.id, d.full_name, format('/drivers?edit=%s', d.id)
  from public.drivers d
  where d.organisation_id = p_organisation_id
    and d.deleted_at is null
    and d.status = 'active'
    and (d.pdp_number is null or d.pdp_expires_on is null)
    and (v_full_access or public.driver_serves_company(p_organisation_id, d.id, 90))

  union all

  select 'missing_license_code', 'driver', d.id, d.full_name, format('/drivers?edit=%s', d.id)
  from public.drivers d
  where d.organisation_id = p_organisation_id
    and d.deleted_at is null
    and d.status = 'active'
    and d.license_code is null
    and (v_full_access or public.driver_serves_company(p_organisation_id, d.id, 90))

  union all

  select 'missing_vehicle_permit', 'vehicle', v.id, v.name, format('/vehicles?edit=%s', v.id)
  from public.vehicles v
  where v.organisation_id = p_organisation_id
    and v.deleted_at is null
    and v.status = 'active'
    and (v.operating_permit_number is null or v.operating_permit_expires_on is null)
    and (v_full_access or public.vehicle_in_company_scope(p_organisation_id, v.id))

  union all

  select 'missing_disc_expiry', 'vehicle', v.id, v.name, format('/vehicles?edit=%s', v.id)
  from public.vehicles v
  where v.organisation_id = p_organisation_id
    and v.deleted_at is null
    and v.status = 'active'
    and v.license_disc_expires_on is null
    and (v_full_access or public.vehicle_in_company_scope(p_organisation_id, v.id))

  union all

  select 'missing_driver_assignment', 'driver', d.id, d.full_name, format('/drivers?edit=%s', d.id)
  from public.drivers d
  where d.organisation_id = p_organisation_id
    and d.deleted_at is null
    and d.status = 'active'
    and not exists (
      select 1 from public.driver_vehicle_assignments dva
      where dva.driver_id = d.id and dva.ends_on is null and dva.deleted_at is null
    )
    and (v_full_access or public.driver_serves_company(p_organisation_id, d.id, 90))

  union all

  select 'missing_vehicle_assignment', 'vehicle', v.id, v.name, format('/vehicles?edit=%s', v.id)
  from public.vehicles v
  where v.organisation_id = p_organisation_id
    and v.deleted_at is null
    and v.status = 'active'
    and not exists (
      select 1 from public.driver_vehicle_assignments dva
      where dva.vehicle_id = v.id and dva.ends_on is null and dva.deleted_at is null
    )
    and (v_full_access or public.vehicle_in_company_scope(p_organisation_id, v.id));
end;
$$;

grant execute on function public.list_compliance_missing_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_company_drivers_status
-- ---------------------------------------------------------------------------

create or replace function public.list_company_drivers_status(p_organisation_id uuid)
returns table (
  driver_id uuid,
  full_name text,
  license_expires_on date,
  pdp_expires_on date,
  license_status text,
  pdp_status text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today date := public.compliance_today_sast();
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(p_organisation_id, array['company_manager'])
  ) then
    raise exception 'Not authorised';
  end if;

  return query
  select
    d.id,
    d.full_name,
    d.license_expires_on,
    d.pdp_expires_on,
    case
      when d.license_expires_on is null then 'not_captured'
      else public.compliance_status_for_days((d.license_expires_on - v_today)::integer)
    end,
    case
      when d.pdp_expires_on is null then 'not_captured'
      else public.compliance_status_for_days((d.pdp_expires_on - v_today)::integer)
    end
  from public.drivers d
  where d.organisation_id = p_organisation_id
    and d.deleted_at is null
    and public.driver_serves_company(p_organisation_id, d.id, 90);
end;
$$;

grant execute on function public.list_company_drivers_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_admin_notification_read
-- ---------------------------------------------------------------------------

create or replace function public.mark_admin_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_inbox_notifications
  set read_at = timezone('utc', now())
  where id = p_id
    and recipient_user_id = auth.uid()
    and organisation_id in (select public.user_organisation_ids());
end;
$$;

grant execute on function public.mark_admin_notification_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS updates
-- ---------------------------------------------------------------------------

drop policy if exists drivers_select on public.drivers;
create policy drivers_select on public.drivers
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or id = public.current_driver_id(organisation_id)
    )
  );

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or exists (
        select 1 from public.driver_vehicle_assignments a
        where a.vehicle_id = vehicles.id
          and a.driver_id = public.current_driver_id(vehicles.organisation_id)
          and a.ends_on is null
          and a.deleted_at is null
      )
      or exists (
        select 1 from public.trip_assignments ta
        where ta.vehicle_id = vehicles.id
          and ta.driver_id = public.current_driver_id(vehicles.organisation_id)
          and ta.released_at is null
          and ta.deleted_at is null
      )
      or (
        organisation_id in (select public.user_organisation_ids())
        and not public.has_org_role_names(
          organisation_id,
          array['driver']
        )
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

drop policy if exists vehicle_documents_select on public.vehicle_documents;
create policy vehicle_documents_select on public.vehicle_documents
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or exists (
        select 1
        from public.driver_vehicle_assignments a
        where a.vehicle_id = vehicle_documents.vehicle_id
          and a.driver_id = public.current_driver_id(vehicle_documents.organisation_id)
          and a.ends_on is null
          and a.deleted_at is null
      )
    )
  );

alter table public.driver_vehicle_assignments enable row level security;

drop policy if exists driver_vehicle_assignments_select on public.driver_vehicle_assignments;
create policy driver_vehicle_assignments_select on public.driver_vehicle_assignments
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or driver_id = public.current_driver_id(organisation_id)
    )
  );

drop policy if exists admin_inbox_select on public.admin_inbox_notifications;
create policy admin_inbox_select on public.admin_inbox_notifications
  for select
  using (
    recipient_user_id = auth.uid()
    and organisation_id in (select public.user_organisation_ids())
  );

drop policy if exists admin_inbox_update on public.admin_inbox_notifications;
create policy admin_inbox_update on public.admin_inbox_notifications
  for update
  using (
    recipient_user_id = auth.uid()
    and organisation_id in (select public.user_organisation_ids())
  )
  with check (
    recipient_user_id = auth.uid()
    and organisation_id in (select public.user_organisation_ids())
  );

comment on table public.driver_vehicle_assignments is
  'Standing 1:1 driver-to-vehicle assignments (v1). Writes via assign_vehicle_to_driver / unassign_vehicle only.';
