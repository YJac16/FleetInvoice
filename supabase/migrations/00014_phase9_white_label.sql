-- =============================================================================
-- WorkOps Phase 9c — White-label host → organisation theming
-- =============================================================================

create table if not exists public.white_label_configs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  hostname text not null,
  logo_url text,
  primary_color text,
  accent_color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint white_label_configs_hostname_unique unique (hostname),
  constraint white_label_configs_org_unique unique (organisation_id)
);

create index if not exists white_label_configs_hostname_idx
  on public.white_label_configs (hostname);

alter table public.white_label_configs enable row level security;

drop policy if exists white_label_configs_select on public.white_label_configs;
create policy white_label_configs_select on public.white_label_configs
  for select
  using (
    public.is_platform_owner()
    or organisation_id in (select public.user_organisation_ids())
  );

drop policy if exists white_label_configs_write on public.white_label_configs;
create policy white_label_configs_write on public.white_label_configs
  for all
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

-- Anonymous/authenticated lookup by hostname for middleware (security definer)
create or replace function public.lookup_white_label(p_hostname text)
returns table (
  organisation_id uuid,
  logo_url text,
  primary_color text,
  accent_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.organisation_id,
    w.logo_url,
    w.primary_color,
    w.accent_color
  from public.white_label_configs w
  where lower(w.hostname) = lower(p_hostname)
  limit 1;
$$;

revoke all on function public.lookup_white_label(text) from public;
grant execute on function public.lookup_white_label(text) to anon, authenticated, service_role;
