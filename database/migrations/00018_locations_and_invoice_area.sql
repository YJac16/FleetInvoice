-- Phase 18: Service locations catalogue (Cape Town metro) for invoice AREA values.
-- Shared catalogue (organisation_id null) + optional org-specific locations.

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  region text not null default 'cape_town',
  status public.entity_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint locations_name_nonempty check (char_length(trim(name)) > 0)
);

create index if not exists locations_org_id_idx
  on public.locations (organisation_id)
  where deleted_at is null;

create unique index if not exists locations_shared_name_uidx
  on public.locations (lower(trim(name)))
  where organisation_id is null and deleted_at is null;

create unique index if not exists locations_org_name_uidx
  on public.locations (organisation_id, lower(trim(name)))
  where organisation_id is not null and deleted_at is null;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

alter table public.locations enable row level security;

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select
  using (
    deleted_at is null
    and (
      organisation_id is null
      or public.is_platform_owner()
      or organisation_id in (select public.user_organisation_ids())
    )
  );

drop policy if exists locations_insert on public.locations;
create policy locations_insert on public.locations
  for insert
  with check (
    organisation_id is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager']
      )
    )
  );

drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations
  for update
  using (
    organisation_id is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager']
      )
    )
  )
  with check (
    organisation_id is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager']
      )
    )
  );

drop policy if exists locations_delete on public.locations;
create policy locations_delete on public.locations
  for delete
  using (
    organisation_id is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager']
      )
    )
  );

-- Trip service locations (comma or slash-joined canonical place names for invoice AREA)
alter table public.trips
  add column if not exists service_locations text;

comment on column public.trips.service_locations is
  'Canonical Cape Town metro place names for invoice AREA (e.g. Milnerton / Dunoon).';

comment on table public.locations is
  'Cape Town metro place names for trip and invoice AREA; organisation_id null = shared catalogue.';

-- ---------------------------------------------------------------------------
-- RPC: update_invoice_line_area — patch AREA on trip invoice lines
-- ---------------------------------------------------------------------------

create or replace function public.update_invoice_line_area(
  p_line_id uuid,
  p_area text
)
returns public.invoice_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  line public.invoice_lines%rowtype;
  inv public.invoices%rowtype;
  can_manage boolean;
  trimmed_area text;
  parts text[];
  datetime_part text;
  company_part text;
  pax_part text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  trimmed_area := trim(coalesce(p_area, ''));
  if trimmed_area = '' then
    raise exception 'AREA is required';
  end if;

  select * into line
  from public.invoice_lines il
  where il.id = p_line_id;
  if not found then
    raise exception 'Invoice line not found';
  end if;

  select * into inv
  from public.invoices i
  where i.id = line.invoice_id
    and i.deleted_at is null;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if inv.status = 'void' then
    raise exception 'Cannot edit void invoice lines';
  end if;

  can_manage := public.is_platform_owner()
    or public.has_org_role_names(
      inv.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
    or (
      public.has_org_role_names(inv.organisation_id, array['company_manager'])
      and public.has_company_scope(inv.organisation_id, inv.company_id)
    );

  if not can_manage then
    raise exception 'Not authorised to update invoice lines';
  end if;

  parts := string_to_array(line.description, '|');
  if array_length(parts, 1) >= 4 then
    datetime_part := trim(parts[1]);
    company_part := trim(parts[2]);
    pax_part := trim(parts[3]);
    line.description := datetime_part || ' | ' || company_part || ' | ' || pax_part || ' | ' || trimmed_area;
  elsif line.line_type = 'trip' and line.trip_id is not null then
    line.description := trimmed_area;
  else
    line.description := trimmed_area;
  end if;

  update public.invoice_lines
  set description = line.description
  where id = line.id
  returning * into line;

  return line;
end;
$$;

grant execute on function public.update_invoice_line_area(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared Cape Town metro starter catalogue
-- ---------------------------------------------------------------------------

insert into public.locations (organisation_id, name, aliases, region)
select null, v.name, v.aliases, 'cape_town'
from (
  values
    ('Milnerton', '{}'::text[]),
    ('Dunoon', array['Danoon']),
    ('Delft', array['Delf']),
    ('Mfuleni', '{}'::text[]),
    ('Eerste River', array['Eersteriver', 'Eerster River']),
    ('Lansdowne', '{}'::text[]),
    ('Strandfontein', '{}'::text[]),
    ('Brooklyn', '{}'::text[]),
    ('Bloubergstrand', array['Blouberg']),
    ('Joe Slovo Park', array['Joe Slovo']),
    ('Parklands', '{}'::text[]),
    ('Paarden Eiland', array['Paardeneiland']),
    ('Woodstock', '{}'::text[]),
    ('Cape Town CBD', array['CBD', 'City Bowl']),
    ('Central', '{}'::text[]),
    ('Rondebosch', '{}'::text[]),
    ('Kensington', '{}'::text[]),
    ('Hout Bay', '{}'::text[]),
    ('Table View', '{}'::text[]),
    ('Bellville', '{}'::text[]),
    ('Parow', '{}'::text[]),
    ('Goodwood', '{}'::text[]),
    ('Athlone', '{}'::text[]),
    ('Mitchells Plain', '{}'::text[]),
    ('Khayelitsha', '{}'::text[]),
    ('Claremont', '{}'::text[]),
    ('Observatory', '{}'::text[]),
    ('Salt River', '{}'::text[]),
    ('Ottery', '{}'::text[]),
    ('Wynberg', '{}'::text[]),
    ('Plumstead', '{}'::text[]),
    ('Brackenfell', '{}'::text[]),
    ('Kuils River', '{}'::text[])
) as v(name, aliases)
where not exists (
  select 1
  from public.locations l
  where l.organisation_id is null
    and l.deleted_at is null
    and lower(trim(l.name)) = lower(trim(v.name))
);
