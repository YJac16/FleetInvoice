-- =============================================================================
-- WorkOps Phase 0 — Foundation Hardening
-- =============================================================================
-- Extends Foundation v1 without modifying 00001.
-- Adds: supervisor + company_manager roles, member_scopes, audit_logs,
-- notification_outbox, company-scope RLS helpers, invite-email support RPCs.
--
-- Note: New enum labels cannot be cast to app_role in the same transaction
-- (Postgres 55P04). Role checks that include supervisor / company_manager
-- use has_org_role_names (text[]) instead of has_org_role (app_role[]).

-- ---------------------------------------------------------------------------
-- Enum extensions
-- ---------------------------------------------------------------------------

alter type public.app_role add value if not exists 'supervisor';
alter type public.app_role add value if not exists 'company_manager';

-- ---------------------------------------------------------------------------
-- Member scopes (Company Manager ABAC)
-- ---------------------------------------------------------------------------

create table if not exists public.member_scopes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  membership_id uuid not null references public.organisation_members (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint member_scopes_membership_company_unique unique (membership_id, company_id)
);

create index if not exists member_scopes_org_id_idx on public.member_scopes (organisation_id);
create index if not exists member_scopes_membership_id_idx on public.member_scopes (membership_id);
create index if not exists member_scopes_company_id_idx on public.member_scopes (company_id);

-- ---------------------------------------------------------------------------
-- Audit logs (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_org_created_idx
  on public.audit_logs (organisation_id, created_at desc);
create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Notification outbox
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'notification_channel'
  ) then
    create type public.notification_channel as enum ('email', 'sms', 'push');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'notification_status'
  ) then
    create type public.notification_status as enum (
      'pending',
      'processing',
      'sent',
      'failed',
      'skipped'
    );
  end if;
end $$;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete set null,
  channel public.notification_channel not null default 'email',
  status public.notification_status not null default 'pending',
  recipient text not null,
  subject text,
  body text,
  template_key text,
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  last_error text,
  scheduled_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_outbox_status_scheduled_idx
  on public.notification_outbox (status, scheduled_at);

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at
before update on public.notification_outbox
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Same-transaction-safe role check: compares m.role::text so new enum labels
-- (supervisor, company_manager) are never cast to app_role in this migration.
create or replace function public.has_org_role_names(org_id uuid, allowed text[])
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
        and m.role::text = any (allowed)
    );
$$;

create or replace function public.has_company_scope(org_id uuid, company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_owner()
    or public.has_org_role_names(
      org_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
    or exists (
      select 1
      from public.organisation_members m
      join public.member_scopes s on s.membership_id = m.id
      where m.organisation_id = org_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.deleted_at is null
        and s.company_id = company
        and s.organisation_id = org_id
    )
    or (
      -- Non–company-manager members with no scopes: full org company access
      exists (
        select 1
        from public.organisation_members m
        where m.organisation_id = org_id
          and m.user_id = auth.uid()
          and m.status = 'active'
          and m.deleted_at is null
          and m.role::text <> 'company_manager'
      )
    );
$$;

create or replace function public.write_audit_log(
  p_organisation_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.audit_logs (
    organisation_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organisation_id,
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.enqueue_notification(
  p_organisation_id uuid,
  p_channel public.notification_channel,
  p_recipient text,
  p_subject text,
  p_body text,
  p_template_key text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null and not public.is_platform_owner() then
    -- allow authenticated callers only
    null;
  end if;

  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_organisation_id is not null
     and not (
       public.is_platform_owner()
       or public.has_org_role(
         p_organisation_id,
         array['organisation_admin', 'manager']::public.app_role[]
       )
     )
  then
    raise exception 'Not authorised to enqueue notifications';
  end if;

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
    p_channel,
    lower(trim(p_recipient)),
    p_subject,
    p_body,
    p_template_key,
    coalesce(p_payload, '{}'::jsonb),
    auth.uid()
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.has_org_role_names(uuid, text[]) to authenticated;
grant execute on function public.has_company_scope(uuid, uuid) to authenticated;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.enqueue_notification(
  uuid, public.notification_channel, text, text, text, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: member_scopes
-- ---------------------------------------------------------------------------

alter table public.member_scopes enable row level security;

drop policy if exists member_scopes_select on public.member_scopes;
create policy member_scopes_select on public.member_scopes
  for select
  using (
    public.is_platform_owner()
    or public.is_org_member(organisation_id)
  );

drop policy if exists member_scopes_insert on public.member_scopes;
create policy member_scopes_insert on public.member_scopes
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

drop policy if exists member_scopes_update on public.member_scopes;
create policy member_scopes_update on public.member_scopes
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

drop policy if exists member_scopes_delete on public.member_scopes;
create policy member_scopes_delete on public.member_scopes
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role(
      organisation_id,
      array['organisation_admin']::public.app_role[]
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: audit_logs (select for admins; insert via RPC only)
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id is not null
      and public.has_org_role(
        organisation_id,
        array['organisation_admin', 'manager']::public.app_role[]
      )
    )
  );

-- No direct insert/update/delete policies for authenticated — use write_audit_log.

-- ---------------------------------------------------------------------------
-- RLS: notification_outbox
-- ---------------------------------------------------------------------------

alter table public.notification_outbox enable row level security;

drop policy if exists notification_outbox_select on public.notification_outbox;
create policy notification_outbox_select on public.notification_outbox
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id is not null
      and public.has_org_role(
        organisation_id,
        array['organisation_admin', 'manager']::public.app_role[]
      )
    )
  );

-- Inserts via enqueue_notification (security definer).
-- Service role / process route updates status.

-- ---------------------------------------------------------------------------
-- Tighten companies / employees SELECT for company managers
-- ---------------------------------------------------------------------------

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and public.has_company_scope(organisation_id, id)
      )
    )
  );

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          company_id is null
          or public.has_company_scope(organisation_id, company_id)
        )
      )
    )
  );

-- Allow supervisor on master-data writes (alongside existing ops roles)
-- Use has_org_role_names so 'supervisor' is not cast to app_role in this txn.

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists drivers_insert on public.drivers;
create policy drivers_insert on public.drivers
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists drivers_update on public.drivers;
create policy drivers_update on public.drivers
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor'
      ]
    )
  );

-- ---------------------------------------------------------------------------
-- Update create_invitation to allow supervisor? Keep admin-only for invites.
-- ---------------------------------------------------------------------------

comment on table public.member_scopes is
  'ABAC scopes for company_manager (and future scoped roles).';
comment on table public.audit_logs is
  'Append-only audit trail. Write via write_audit_log RPC only.';
comment on table public.notification_outbox is
  'Durable notification queue. Drain via /api/notifications/process.';
