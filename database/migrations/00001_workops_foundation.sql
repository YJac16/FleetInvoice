-- =============================================================================
-- WorkOps Phase 1 — Foundation Schema
-- =============================================================================
-- Multi-tenant organisations, memberships, invitations, and master data.
--
-- Phase 2 extension points (NOT created here):
--   - trips / trip_legs — scheduled and live trip execution
--   - routes / route_stops — reusable route definitions and stop sequences
--   - invoices / invoice_lines — billing against trips and contracts
--   - attendance / check_ins — employee pickup/dropoff attendance
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.app_role as enum (
  'platform_owner',
  'organisation_admin',
  'manager',
  'dispatcher',
  'driver',
  'employee'
);

create type public.entity_status as enum (
  'active',
  'inactive',
  'suspended'
);

create type public.membership_status as enum (
  'active',
  'invited',
  'suspended'
);

create type public.invitation_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

create type public.vehicle_type as enum (
  'sedan',
  'suv',
  'van',
  'minibus',
  'bus',
  'truck',
  'other'
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint organisations_slug_unique unique (slug)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  is_platform_owner boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  user_id uuid not null references public.profiles (id),
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint organisation_members_org_user_unique unique (organisation_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  email text not null,
  role public.app_role not null,
  token text not null unique default gen_random_uuid()::text,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null,
  code text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null,
  code text,
  description text,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  company_id uuid references public.companies (id),
  area_id uuid references public.areas (id),
  name text not null,
  code text,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  site_id uuid references public.sites (id),
  area_id uuid references public.areas (id),
  name text not null,
  code text,
  address text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  full_name text not null,
  email text,
  phone text,
  license_number text,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  company_id uuid references public.companies (id),
  site_id uuid references public.sites (id),
  full_name text not null,
  email text,
  phone text,
  employee_number text,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null,
  registration_number text,
  vehicle_type public.vehicle_type not null default 'other',
  capacity integer,
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index organisations_deleted_at_idx on public.organisations (deleted_at);

create index organisation_members_organisation_id_idx
  on public.organisation_members (organisation_id);
create index organisation_members_user_id_idx
  on public.organisation_members (user_id);

create index invitations_token_idx on public.invitations (token);
create index invitations_email_idx on public.invitations (lower(email));
create index invitations_organisation_id_idx on public.invitations (organisation_id);
create unique index invitations_org_pending_email_unique
  on public.invitations (organisation_id, lower(email))
  where status = 'pending' and deleted_at is null;

create index companies_organisation_id_idx on public.companies (organisation_id);
create index areas_organisation_id_idx on public.areas (organisation_id);
create index sites_organisation_id_idx on public.sites (organisation_id);
create index sites_company_id_idx on public.sites (company_id);
create index sites_area_id_idx on public.sites (area_id);
create index pickup_points_organisation_id_idx on public.pickup_points (organisation_id);
create index drivers_organisation_id_idx on public.drivers (organisation_id);
create index employees_organisation_id_idx on public.employees (organisation_id);
create index vehicles_organisation_id_idx on public.vehicles (organisation_id);

-- ---------------------------------------------------------------------------
-- set_updated_at triggers
-- ---------------------------------------------------------------------------

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger organisation_members_set_updated_at
  before update on public.organisation_members
  for each row execute function public.set_updated_at();

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger areas_set_updated_at
  before update on public.areas
  for each row execute function public.set_updated_at();

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

create trigger pickup_points_set_updated_at
  before update on public.pickup_points
  for each row execute function public.set_updated_at();

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile auto-create on auth.users insert
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_platform_owner
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members m
    where m.organisation_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_owner()
    or exists (
      select 1
      from public.organisation_members m
      where m.organisation_id = org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.deleted_at is null
        and m.role = any (allowed_roles)
    );
$$;

create or replace function public.user_organisation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organisation_id
  from public.organisation_members m
  where m.user_id = auth.uid()
    and m.status = 'active'
    and m.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Invitation RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_invitation_by_token(p_token text)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
begin
  select *
  into inv
  from public.invitations i
  where i.token = p_token
    and i.status = 'pending'
    and i.deleted_at is null
    and i.expires_at > timezone('utc', now());

  if not found then
    return null;
  end if;

  return inv;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
  uid uuid := auth.uid();
  user_email text;
  membership_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  select *
  into inv
  from public.invitations i
  where i.token = p_token
    and i.deleted_at is null
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if inv.status <> 'pending' then
    raise exception 'Invitation is not pending';
  end if;

  if inv.expires_at <= timezone('utc', now()) then
    raise exception 'Invitation has expired';
  end if;

  select lower(coalesce(p.email, u.email))
  into user_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = uid;

  if user_email is null or lower(inv.email) <> user_email then
    raise exception 'Invitation email does not match authenticated user';
  end if;

  select m.id
  into membership_id
  from public.organisation_members m
  where m.organisation_id = inv.organisation_id
    and m.user_id = uid
    and m.deleted_at is null;

  if membership_id is null then
    insert into public.organisation_members (
      organisation_id,
      user_id,
      role,
      status,
      created_by
    )
    values (
      inv.organisation_id,
      uid,
      inv.role,
      'active',
      inv.invited_by
    )
    returning id into membership_id;
  else
    update public.organisation_members
    set
      role = inv.role,
      status = 'active',
      updated_at = timezone('utc', now())
    where id = membership_id;
  end if;

  update public.invitations
  set
    status = 'accepted',
    accepted_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = inv.id;

  return membership_id;
end;
$$;

create or replace function public.create_invitation(
  p_organisation_id uuid,
  p_email text,
  p_role public.app_role,
  p_expires_at timestamptz default (timezone('utc', now()) + interval '7 days')
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
begin
  if not (
    public.is_platform_owner()
    or public.has_org_role(p_organisation_id, array['organisation_admin']::public.app_role[])
  ) then
    raise exception 'Not authorised to create invitations for this organisation';
  end if;

  insert into public.invitations (
    organisation_id,
    email,
    role,
    expires_at,
    invited_by,
    status
  )
  values (
    p_organisation_id,
    lower(trim(p_email)),
    p_role,
    p_expires_at,
    auth.uid(),
    'pending'
  )
  returning * into inv;

  return inv;
end;
$$;

grant execute on function public.get_invitation_by_token(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.app_role, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.organisation_members enable row level security;
alter table public.invitations enable row level security;
alter table public.companies enable row level security;
alter table public.areas enable row level security;
alter table public.sites enable row level security;
alter table public.pickup_points enable row level security;
alter table public.drivers enable row level security;
alter table public.employees enable row level security;
alter table public.vehicles enable row level security;

-- organisations
create policy organisations_select on public.organisations
  for select
  using (
    public.is_platform_owner()
    or (
      id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy organisations_insert on public.organisations
  for insert
  with check (public.is_platform_owner());

create policy organisations_update on public.organisations
  for update
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

create policy organisations_delete on public.organisations
  for delete
  using (public.is_platform_owner());

-- profiles
create policy profiles_select on public.profiles
  for select
  using (
    public.is_platform_owner()
    or id = auth.uid()
  );

create policy profiles_update on public.profiles
  for update
  using (id = auth.uid() or public.is_platform_owner())
  with check (id = auth.uid() or public.is_platform_owner());

-- organisation_members
create policy organisation_members_select on public.organisation_members
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy organisation_members_insert on public.organisation_members
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

create policy organisation_members_update on public.organisation_members
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

create policy organisation_members_delete on public.organisation_members
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

-- invitations (manage via policies; invitees use get_invitation_by_token RPC)
create policy invitations_select on public.invitations
  for select
  using (
    public.is_platform_owner()
    or (
      public.has_org_role(
        organisation_id,
        array['organisation_admin']::public.app_role[]
      )
      and deleted_at is null
    )
  );

create policy invitations_insert on public.invitations
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

create policy invitations_update on public.invitations
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

create policy invitations_delete on public.invitations
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

-- Master data write roles
-- platform_owner | organisation_admin | manager | dispatcher

-- companies
create policy companies_select on public.companies
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy companies_insert on public.companies
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy companies_update on public.companies
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy companies_delete on public.companies
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

-- areas
create policy areas_select on public.areas
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy areas_insert on public.areas
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy areas_update on public.areas
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy areas_delete on public.areas
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

-- sites
create policy sites_select on public.sites
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy sites_insert on public.sites
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy sites_update on public.sites
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy sites_delete on public.sites
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

-- pickup_points
create policy pickup_points_select on public.pickup_points
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy pickup_points_insert on public.pickup_points
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy pickup_points_update on public.pickup_points
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy pickup_points_delete on public.pickup_points
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

-- drivers
create policy drivers_select on public.drivers
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy drivers_insert on public.drivers
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy drivers_update on public.drivers
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy drivers_delete on public.drivers
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

-- employees
create policy employees_select on public.employees
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy employees_insert on public.employees
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy employees_update on public.employees
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy employees_delete on public.employees
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

-- vehicles
create policy vehicles_select on public.vehicles
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and deleted_at is null
    )
  );

create policy vehicles_insert on public.vehicles
  for insert
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy vehicles_update on public.vehicles
  for update
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  )
  with check (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );

create policy vehicles_delete on public.vehicles
  for delete
  using (
    public.has_org_role(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']::public.app_role[]
    )
  );
