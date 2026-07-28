-- Phase 10: Hub UX — employee home address, avatar storage policies,
-- trip_passengers seat requests, QR backup codes, employee self-issue QR

-- ---------------------------------------------------------------------------
-- Employee home address
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists home_address text,
  add column if not exists home_latitude double precision,
  add column if not exists home_longitude double precision;

-- ---------------------------------------------------------------------------
-- Avatars storage bucket + policies (path: {user_id}/...)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ---------------------------------------------------------------------------
-- Enums for trip passengers
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_passenger_direction') then
    create type public.trip_passenger_direction as enum ('to_work', 'from_work');
  end if;
  if not exists (select 1 from pg_type where typname = 'trip_passenger_status') then
    create type public.trip_passenger_status as enum (
      'requested',
      'confirmed',
      'cancelled',
      'boarded'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- trip_passengers
-- ---------------------------------------------------------------------------

create table if not exists public.trip_passengers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  direction public.trip_passenger_direction not null default 'to_work',
  status public.trip_passenger_status not null default 'requested',
  requested_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  boarded_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint trip_passengers_trip_employee_unique unique (trip_id, employee_id)
);

create index if not exists trip_passengers_org_trip_idx
  on public.trip_passengers (organisation_id, trip_id);
create index if not exists trip_passengers_employee_idx
  on public.trip_passengers (employee_id, requested_at desc);
create index if not exists trip_passengers_status_idx
  on public.trip_passengers (organisation_id, status);

alter table public.trip_passengers enable row level security;

drop policy if exists trip_passengers_select on public.trip_passengers;
create policy trip_passengers_select on public.trip_passengers
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor',
        'company_manager',
        'driver'
      ]
    )
    or employee_id = public.current_employee_id(organisation_id)
  );

-- Mutations via RPCs only
drop policy if exists trip_passengers_insert on public.trip_passengers;
drop policy if exists trip_passengers_update on public.trip_passengers;
drop policy if exists trip_passengers_delete on public.trip_passengers;

-- ---------------------------------------------------------------------------
-- QR backup code hash column
-- ---------------------------------------------------------------------------

alter table public.qr_tokens
  add column if not exists backup_code_hash text;

create unique index if not exists qr_tokens_backup_code_hash_active_uidx
  on public.qr_tokens (backup_code_hash)
  where backup_code_hash is not null
    and used_at is null;

-- ---------------------------------------------------------------------------
-- Employee self-update home address
-- ---------------------------------------------------------------------------

create or replace function public.update_my_employee_home(
  p_organisation_id uuid,
  p_home_address text default null,
  p_home_latitude double precision default null,
  p_home_longitude double precision default null
)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  emp public.employees%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  update public.employees
  set
    home_address = nullif(trim(coalesce(p_home_address, '')), ''),
    home_latitude = coalesce(p_home_latitude, home_latitude),
    home_longitude = coalesce(p_home_longitude, home_longitude),
    updated_at = timezone('utc', now())
  where id = emp_id
  returning * into emp;

  return emp;
end;
$$;

grant execute on function public.update_my_employee_home(
  uuid, text, double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------------
-- Seat request RPC — auto-confirm under capacity
-- ---------------------------------------------------------------------------

create or replace function public.request_trip_seat(
  p_organisation_id uuid,
  p_trip_id uuid,
  p_direction public.trip_passenger_direction default 'to_work'
)
returns public.trip_passengers
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  trip_row public.trips%rowtype;
  emp public.employees%rowtype;
  existing public.trip_passengers%rowtype;
  has_existing boolean := false;
  confirmed_count integer;
  vehicle_capacity integer;
  new_status public.trip_passenger_status;
  result_row public.trip_passengers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  -- Serialize seat booking per trip to avoid over-confirm under concurrency
  perform pg_advisory_xact_lock(hashtext(p_trip_id::text));

  select * into trip_row
  from public.trips t
  where t.id = p_trip_id
    and t.organisation_id = p_organisation_id
    and t.deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if trip_row.status in ('cancelled', 'completed') then
    raise exception 'Cannot book seat on trip status %', trip_row.status;
  end if;

  select * into emp
  from public.employees e
  where e.id = emp_id
    and e.deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  -- Employees with a company may only book trips for that company (or unscoped trips)
  if emp.company_id is not null
     and trip_row.company_id is not null
     and trip_row.company_id is distinct from emp.company_id then
    raise exception 'Trip is not available for your company';
  end if;

  select * into existing
  from public.trip_passengers tp
  where tp.trip_id = p_trip_id
    and tp.employee_id = emp_id;
  has_existing := found;

  if has_existing then
    if existing.status in ('requested', 'confirmed', 'boarded') then
      raise exception 'Seat already booked for this trip';
    end if;
  end if;

  -- Capacity only counts seats that hold inventory (confirmed + boarded)
  select count(*)::integer into confirmed_count
  from public.trip_passengers tp
  where tp.trip_id = p_trip_id
    and tp.status in ('confirmed', 'boarded');

  select v.capacity into vehicle_capacity
  from public.trip_assignments ta
  join public.vehicles v on v.id = ta.vehicle_id and v.deleted_at is null
  where ta.trip_id = p_trip_id
    and ta.deleted_at is null
    and ta.released_at is null
  order by ta.assigned_at desc
  limit 1;

  if vehicle_capacity is not null and confirmed_count >= vehicle_capacity then
    new_status := 'requested';
  else
    new_status := 'confirmed';
  end if;

  if has_existing and existing.status = 'cancelled' then
    update public.trip_passengers
    set
      direction = coalesce(p_direction, 'to_work'),
      status = new_status,
      requested_at = timezone('utc', now()),
      confirmed_at = case when new_status = 'confirmed' then timezone('utc', now()) else null end,
      cancelled_at = null,
      boarded_at = null,
      updated_at = timezone('utc', now())
    where id = existing.id
    returning * into result_row;
  else
    insert into public.trip_passengers (
      organisation_id,
      trip_id,
      employee_id,
      direction,
      status,
      confirmed_at,
      created_by
    )
    values (
      p_organisation_id,
      p_trip_id,
      emp_id,
      coalesce(p_direction, 'to_work'),
      new_status,
      case when new_status = 'confirmed' then timezone('utc', now()) else null end,
      auth.uid()
    )
    returning * into result_row;
  end if;

  return result_row;
end;
$$;

grant execute on function public.request_trip_seat(
  uuid, uuid, public.trip_passenger_direction
) to authenticated;

create or replace function public.cancel_trip_seat(
  p_organisation_id uuid,
  p_trip_id uuid
)
returns public.trip_passengers
language plpgsql
security definer
set search_path = public
as $$
declare
  emp_id uuid;
  result_row public.trip_passengers%rowtype;
  vehicle_capacity integer;
  confirmed_count integer;
  waitlisted public.trip_passengers%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  emp_id := public.current_employee_id(p_organisation_id);
  if emp_id is null then
    raise exception 'Employee profile not linked';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_trip_id::text));

  update public.trip_passengers
  set
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where trip_id = p_trip_id
    and organisation_id = p_organisation_id
    and employee_id = emp_id
    and status in ('requested', 'confirmed')
  returning * into result_row;

  if not found then
    raise exception 'Active seat booking not found';
  end if;

  -- Promote oldest waitlisted seat when capacity frees up
  select v.capacity into vehicle_capacity
  from public.trip_assignments ta
  join public.vehicles v on v.id = ta.vehicle_id and v.deleted_at is null
  where ta.trip_id = p_trip_id
    and ta.deleted_at is null
    and ta.released_at is null
  order by ta.assigned_at desc
  limit 1;

  select count(*)::integer into confirmed_count
  from public.trip_passengers tp
  where tp.trip_id = p_trip_id
    and tp.status in ('confirmed', 'boarded');

  if vehicle_capacity is null or confirmed_count < vehicle_capacity then
    select * into waitlisted
    from public.trip_passengers tp
    where tp.trip_id = p_trip_id
      and tp.status = 'requested'
    order by tp.requested_at asc
    limit 1;

    if found then
      update public.trip_passengers
      set
        status = 'confirmed',
        confirmed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
      where id = waitlisted.id;
    end if;
  end if;

  return result_row;
end;
$$;

grant execute on function public.cancel_trip_seat(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Replace issue_qr_token to support employee self-issue + backup code
-- Returns jsonb: { token, backup_code, expires_at }
-- ---------------------------------------------------------------------------

drop function if exists public.issue_qr_token(uuid, uuid, uuid, integer);

create or replace function public.issue_qr_token(
  p_organisation_id uuid,
  p_trip_id uuid,
  p_employee_id uuid,
  p_ttl_minutes integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_row public.trips%rowtype;
  emp public.employees%rowtype;
  is_ops boolean;
  is_self boolean;
  raw_token text;
  backup_code text;
  token_id uuid;
  ttl integer;
  expires timestamptz;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  ttl := greatest(coalesce(p_ttl_minutes, 120), 5);

  select * into trip_row
  from public.trips t
  where t.id = p_trip_id
    and t.organisation_id = p_organisation_id
    and t.deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if trip_row.status in ('cancelled', 'completed') then
    raise exception 'Cannot issue QR for trip status %', trip_row.status;
  end if;

  select * into emp
  from public.employees e
  where e.id = p_employee_id
    and e.organisation_id = p_organisation_id
    and e.deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or (
      public.has_org_role_names(p_organisation_id, array['company_manager'])
      and (
        emp.company_id is null
        or public.has_company_scope(p_organisation_id, emp.company_id)
      )
    )
    or public.current_driver_id(p_organisation_id) is not null;

  is_self := p_employee_id = public.current_employee_id(p_organisation_id);

  if not (is_ops or is_self) then
    raise exception 'Not authorised to issue QR tokens';
  end if;

  -- Self-issue only when employee has a confirmed seat (not waitlisted)
  if is_self and not is_ops then
    if not exists (
      select 1
      from public.trip_passengers tp
      where tp.trip_id = p_trip_id
        and tp.employee_id = p_employee_id
        and tp.status in ('confirmed', 'boarded')
    ) then
      raise exception 'Confirm a seat before issuing a boarding QR';
    end if;
  end if;

  raw_token := encode(gen_random_bytes(24), 'base64');
  raw_token := replace(replace(replace(raw_token, '+', '-'), '/', '_'), '=', '');

  -- 8-char backup from a larger alphabet; retry until unique among unused tokens
  for i in 1..12 loop
    backup_code := upper(substr(
      translate(
        encode(gen_random_bytes(12), 'base64'),
        '+/=0O1Il',
        'ABCDEFGH'
      ),
      1, 8
    ));
    exit when not exists (
      select 1
      from public.qr_tokens q
      where q.backup_code_hash = public.hash_qr_token(backup_code)
        and q.used_at is null
        and q.expires_at > timezone('utc', now())
    );
  end loop;

  expires := timezone('utc', now()) + make_interval(mins => ttl);

  insert into public.qr_tokens (
    organisation_id,
    trip_id,
    employee_id,
    token_hash,
    backup_code_hash,
    expires_at,
    issued_by
  )
  values (
    p_organisation_id,
    p_trip_id,
    p_employee_id,
    public.hash_qr_token(raw_token),
    public.hash_qr_token(backup_code),
    expires,
    auth.uid()
  )
  returning id into token_id;

  insert into public.attendance_events (
    organisation_id,
    trip_id,
    employee_id,
    qr_token_id,
    event_type,
    recorded_by,
    notes,
    metadata
  )
  values (
    p_organisation_id,
    p_trip_id,
    p_employee_id,
    token_id,
    'issued',
    auth.uid(),
    'QR boarding token issued',
    jsonb_build_object('ttl_minutes', ttl, 'self_issued', is_self)
  );

  if emp.email is not null and length(trim(emp.email)) > 0 then
    insert into public.notification_outbox (
      organisation_id,
      channel,
      recipient,
      subject,
      body,
      template_key,
      payload,
      created_by
    )
    values (
      p_organisation_id,
      'email',
      lower(trim(emp.email)),
      'Your boarding QR code',
      format(
        'A boarding code was issued for your trip. It expires in %s minutes. Backup code: %s',
        ttl,
        backup_code
      ),
      'attendance.qr_issued',
      jsonb_build_object(
        'trip_id', p_trip_id,
        'employee_id', p_employee_id,
        'qr_token_id', token_id,
        'expires_in_minutes', ttl
      ),
      auth.uid()
    );
  end if;

  return jsonb_build_object(
    'token', raw_token,
    'backup_code', backup_code,
    'expires_at', expires,
    'qr_token_id', token_id
  );
end;
$$;

grant execute on function public.issue_qr_token(uuid, uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- scan_qr_token — also accept backup code; mark passenger boarded
-- ---------------------------------------------------------------------------

create or replace function public.scan_qr_token(
  p_token text,
  p_event_type public.attendance_event_type default 'boarded',
  p_notes text default null
)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.qr_tokens%rowtype;
  emp public.employees%rowtype;
  is_ops boolean;
  is_self boolean;
  evt public.attendance_events%rowtype;
  ev_type public.attendance_event_type;
  trimmed text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  trimmed := trim(coalesce(p_token, ''));
  if length(trimmed) = 0 then
    raise exception 'Token required';
  end if;

  ev_type := coalesce(p_event_type, 'boarded');
  if ev_type not in ('boarded', 'confirmed', 'rejected') then
    raise exception 'Invalid scan event type %', ev_type;
  end if;

  select * into tok
  from public.qr_tokens q
  where q.token_hash = public.hash_qr_token(trimmed)
     or (
       length(trimmed) = 8
       and q.backup_code_hash = public.hash_qr_token(upper(trimmed))
       and q.used_at is null
       and q.expires_at > timezone('utc', now())
     )
  order by q.created_at desc
  limit 1;
  if not found then
    raise exception 'Invalid token';
  end if;

  if tok.used_at is not null then
    raise exception 'Token already used';
  end if;

  if tok.expires_at <= timezone('utc', now()) then
    raise exception 'Token expired';
  end if;

  select * into emp
  from public.employees e
  where e.id = tok.employee_id
    and e.deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      tok.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or (
      public.has_org_role_names(tok.organisation_id, array['company_manager'])
      and (
        emp.company_id is null
        or public.has_company_scope(tok.organisation_id, emp.company_id)
      )
    )
    or public.current_driver_id(tok.organisation_id) is not null;

  is_self := tok.employee_id = public.current_employee_id(tok.organisation_id);

  if not (is_ops or is_self) then
    raise exception 'Not authorised to scan token';
  end if;

  update public.qr_tokens
  set used_at = timezone('utc', now())
  where id = tok.id;

  insert into public.attendance_events (
    organisation_id,
    trip_id,
    employee_id,
    qr_token_id,
    event_type,
    recorded_by,
    notes,
    metadata
  )
  values (
    tok.organisation_id,
    tok.trip_id,
    tok.employee_id,
    tok.id,
    ev_type,
    auth.uid(),
    nullif(trim(p_notes), ''),
    jsonb_build_object(
      'scanned_as_self', is_self,
      'via_backup_code', length(trimmed) = 8
    )
  )
  returning * into evt;

  if ev_type = 'boarded' then
    update public.trip_passengers
    set
      status = 'boarded',
      boarded_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where trip_id = tok.trip_id
      and employee_id = tok.employee_id
      and status in ('confirmed', 'requested');
  end if;

  if emp.email is not null and length(trim(emp.email)) > 0 and ev_type = 'boarded' then
    insert into public.notification_outbox (
      organisation_id,
      channel,
      recipient,
      subject,
      body,
      template_key,
      payload,
      created_by
    )
    values (
      tok.organisation_id,
      'email',
      lower(trim(emp.email)),
      'Boarding confirmed',
      'Your boarding was recorded successfully.',
      'attendance.boarded',
      jsonb_build_object(
        'trip_id', tok.trip_id,
        'employee_id', tok.employee_id,
        'attendance_event_id', evt.id
      ),
      auth.uid()
    );
  end if;

  return evt;
end;
$$;

grant execute on function public.scan_qr_token(
  text, public.attendance_event_type, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Manual attendance exception (ops)
-- ---------------------------------------------------------------------------

create or replace function public.record_manual_boarding(
  p_organisation_id uuid,
  p_trip_id uuid,
  p_employee_id uuid,
  p_notes text default null
)
returns public.attendance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  is_ops boolean;
  evt public.attendance_events%rowtype;
  trip_row public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or public.current_driver_id(p_organisation_id) is not null;

  if not is_ops then
    raise exception 'Not authorised';
  end if;

  select * into trip_row
  from public.trips t
  where t.id = p_trip_id
    and t.organisation_id = p_organisation_id
    and t.deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not exists (
    select 1 from public.employees e
    where e.id = p_employee_id
      and e.organisation_id = p_organisation_id
      and e.deleted_at is null
  ) then
    raise exception 'Employee not found';
  end if;

  insert into public.attendance_events (
    organisation_id,
    trip_id,
    employee_id,
    event_type,
    recorded_by,
    notes,
    metadata
  )
  values (
    p_organisation_id,
    p_trip_id,
    p_employee_id,
    'boarded',
    auth.uid(),
    coalesce(nullif(trim(p_notes), ''), 'Manual boarding override'),
    jsonb_build_object('manual_exception', true)
  )
  returning * into evt;

  update public.trip_passengers
  set
    status = 'boarded',
    boarded_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where trip_id = p_trip_id
    and employee_id = p_employee_id
    and status in ('confirmed', 'requested');

  insert into public.trip_passengers (
    organisation_id,
    trip_id,
    employee_id,
    direction,
    status,
    confirmed_at,
    boarded_at,
    created_by
  )
  values (
    p_organisation_id,
    p_trip_id,
    p_employee_id,
    'to_work',
    'boarded',
    timezone('utc', now()),
    timezone('utc', now()),
    auth.uid()
  )
  on conflict (trip_id, employee_id) do update
  set
    status = 'boarded',
    boarded_at = timezone('utc', now()),
    updated_at = timezone('utc', now());

  return evt;
end;
$$;

grant execute on function public.record_manual_boarding(
  uuid, uuid, uuid, text
) to authenticated;
