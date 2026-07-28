-- =============================================================================
-- WorkOps Phase 6 — Employee portal, QR boarding, attendance
-- =============================================================================
-- Requires 00001–00007 (has_org_role_names, has_company_scope, current_driver_id,
-- notification_outbox). Apply only after 00007.

-- ---------------------------------------------------------------------------
-- employees.profile_id (mirror drivers)
-- ---------------------------------------------------------------------------

alter table public.employees
  add column if not exists profile_id uuid references public.profiles (id) on delete set null;

create index if not exists employees_profile_id_idx on public.employees (profile_id);

create unique index if not exists employees_org_profile_active_uidx
  on public.employees (organisation_id, profile_id)
  where profile_id is not null and deleted_at is null;

comment on column public.employees.profile_id is
  'Optional link to auth profile for employee portal and QR self-service.';

-- Allow employees to read their own row even when company_scope would hide it
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or profile_id = auth.uid()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'attendance_event_type'
  ) then
    create type public.attendance_event_type as enum (
      'issued',
      'boarded',
      'confirmed',
      'rejected'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper: current_employee_id
-- ---------------------------------------------------------------------------

create or replace function public.current_employee_id(org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  where e.organisation_id = org_id
    and e.profile_id = auth.uid()
    and e.deleted_at is null
  limit 1;
$$;

grant execute on function public.current_employee_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- qr_tokens
-- ---------------------------------------------------------------------------

create table if not exists public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  issued_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint qr_tokens_token_hash_unique unique (token_hash)
);

create index if not exists qr_tokens_org_trip_idx
  on public.qr_tokens (organisation_id, trip_id);
create index if not exists qr_tokens_employee_idx
  on public.qr_tokens (employee_id, created_at desc);
create index if not exists qr_tokens_expires_idx
  on public.qr_tokens (expires_at);

alter table public.qr_tokens enable row level security;

drop policy if exists qr_tokens_select on public.qr_tokens;
create policy qr_tokens_select on public.qr_tokens
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

-- No direct insert/update/delete — RPCs only
drop policy if exists qr_tokens_insert on public.qr_tokens;
drop policy if exists qr_tokens_update on public.qr_tokens;
drop policy if exists qr_tokens_delete on public.qr_tokens;

-- ---------------------------------------------------------------------------
-- attendance_events (immutable)
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  qr_token_id uuid references public.qr_tokens (id) on delete set null,
  event_type public.attendance_event_type not null,
  recorded_by uuid references auth.users (id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists attendance_events_org_trip_idx
  on public.attendance_events (organisation_id, trip_id, created_at desc);
create index if not exists attendance_events_employee_idx
  on public.attendance_events (employee_id, created_at desc);

alter table public.attendance_events enable row level security;

drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select on public.attendance_events
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

-- No direct mutations — RPCs only
drop policy if exists attendance_events_insert on public.attendance_events;
drop policy if exists attendance_events_update on public.attendance_events;
drop policy if exists attendance_events_delete on public.attendance_events;

-- ---------------------------------------------------------------------------
-- Internal: hash helper (hex sha256 of utf8 token via pgcrypto)
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

create or replace function public.hash_qr_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- RPC: issue_qr_token
-- Returns raw token once (client encodes into QR / email). DB stores hash only.
-- ---------------------------------------------------------------------------

create or replace function public.issue_qr_token(
  p_organisation_id uuid,
  p_trip_id uuid,
  p_employee_id uuid,
  p_ttl_minutes integer default 120
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_row public.trips%rowtype;
  emp public.employees%rowtype;
  is_ops boolean;
  raw_token text;
  token_id uuid;
  ttl integer;
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

  if not is_ops then
    raise exception 'Not authorised to issue QR tokens';
  end if;

  raw_token := encode(gen_random_bytes(24), 'base64');
  -- URL-safe-ish: strip padding
  raw_token := replace(replace(replace(raw_token, '+', '-'), '/', '_'), '=', '');

  insert into public.qr_tokens (
    organisation_id,
    trip_id,
    employee_id,
    token_hash,
    expires_at,
    issued_by
  )
  values (
    p_organisation_id,
    p_trip_id,
    p_employee_id,
    public.hash_qr_token(raw_token),
    timezone('utc', now()) + make_interval(mins => ttl),
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
    jsonb_build_object('ttl_minutes', ttl)
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
        'A boarding code was issued for your trip. It expires in %s minutes. Open the employee portal or present this code to the driver: %s',
        ttl,
        raw_token
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

  return raw_token;
end;
$$;

grant execute on function public.issue_qr_token(uuid, uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: scan_qr_token
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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Token required';
  end if;

  ev_type := coalesce(p_event_type, 'boarded');
  if ev_type not in ('boarded', 'confirmed', 'rejected') then
    raise exception 'Invalid scan event type %', ev_type;
  end if;

  select * into tok
  from public.qr_tokens q
  where q.token_hash = public.hash_qr_token(trim(p_token))
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
    jsonb_build_object('scanned_as_self', is_self)
  )
  returning * into evt;

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
