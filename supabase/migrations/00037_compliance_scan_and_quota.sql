-- Phase 2 scan-assist metadata tables and atomic quota.

create table if not exists public.compliance_scan_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  requested_by uuid not null,
  subject_kind text not null check (
    subject_kind in (
      'driver_licence',
      'prdp',
      'vehicle_disc',
      'operating_permit',
      'registration_certificate'
    )
  ),
  subject_id uuid not null,
  document_id uuid,
  storage_mode text not null check (storage_mode in ('retained', 'scan_discard')),
  provider text not null,
  status text not null check (
    status in (
      'succeeded',
      'failed',
      'blocked_flag',
      'blocked_quota',
      'rejected_input'
    )
  ),
  consumed_quota boolean not null default false,
  input_tokens integer,
  output_tokens integer,
  est_cost_usd numeric(10, 6),
  latency_ms integer,
  fields_suggested integer,
  fields_confirmed_unchanged integer,
  fields_edited integer,
  created_at timestamptz not null default now()
);

alter table public.compliance_scan_events enable row level security;

drop policy if exists compliance_scan_events_select on public.compliance_scan_events;
create policy compliance_scan_events_select on public.compliance_scan_events
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

create table if not exists public.compliance_scan_temp_objects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  storage_path text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  deleted_at timestamptz
);

alter table public.compliance_scan_temp_objects enable row level security;

create table if not exists public.compliance_scan_quota (
  organisation_id uuid not null references public.organisations (id),
  period_month date not null,
  used integer not null default 0 check (used >= 0),
  primary key (organisation_id, period_month)
);

create or replace function public.consume_compliance_scan_quota(p_org uuid, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Africa/Johannesburg')::date;
  v_used integer;
begin
  if p_cap is null or p_cap < 1 then
    return false;
  end if;

  insert into public.compliance_scan_quota as q (organisation_id, period_month, used)
  values (p_org, v_month, 1)
  on conflict (organisation_id, period_month) do update
    set used = q.used + 1
    where q.used < p_cap
  returning used into v_used;

  return v_used is not null;
end;
$$;

revoke all on function public.consume_compliance_scan_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_compliance_scan_quota(uuid, integer) to service_role;
