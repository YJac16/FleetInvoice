-- Second-user / self-serve organisation bootstrap (idempotent).
-- Allows authenticated users with no active membership to create their own org
-- and become organisation_admin. Org admins may update their organisation row.

create or replace function public.create_own_organisation(
  p_name text,
  p_slug text,
  p_settings jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean_name text;
  clean_slug text;
  org_id uuid;
  existing_memberships int;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtext(uid::text));

  clean_name := trim(p_name);
  if clean_name is null or length(clean_name) < 2 then
    raise exception 'Organisation name must be at least 2 characters';
  end if;

  clean_slug := lower(trim(coalesce(p_slug, '')));
  clean_slug := regexp_replace(clean_slug, '[^a-z0-9-]+', '-', 'g');
  clean_slug := regexp_replace(clean_slug, '-{2,}', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);

  if clean_slug is null or length(clean_slug) < 2 then
    raise exception 'Organisation slug must be at least 2 characters';
  end if;

  select count(*)::int
  into existing_memberships
  from public.organisation_members m
  where m.user_id = uid
    and m.status = 'active'
    and m.deleted_at is null;

  if existing_memberships > 0 then
    raise exception 'You already belong to an organisation. Ask an admin for an invitation.';
  end if;

  if exists (
    select 1
    from public.organisations o
    where o.slug = clean_slug
      and o.deleted_at is null
  ) then
    raise exception 'Organisation slug is already taken';
  end if;

  insert into public.organisations (
    name,
    slug,
    status,
    settings,
    created_by
  )
  values (
    clean_name,
    clean_slug,
    'active',
    coalesce(p_settings, '{}'::jsonb),
    uid
  )
  returning id into org_id;

  insert into public.organisation_members (
    organisation_id,
    user_id,
    role,
    status,
    created_by
  )
  values (
    org_id,
    uid,
    'organisation_admin',
    'active',
    uid
  );

  return org_id;
end;
$$;

comment on function public.create_own_organisation(text, text, jsonb) is
  'Self-serve: create organisation + organisation_admin membership when user has no active memberships.';

revoke all on function public.create_own_organisation(text, text, jsonb) from public;
grant execute on function public.create_own_organisation(text, text, jsonb) to authenticated;

-- Org admins can maintain their tenant settings (invoice print, branding, etc.)
drop policy if exists organisations_update on public.organisations;
create policy organisations_update on public.organisations
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role(
      id,
      array['organisation_admin']::public.app_role[]
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role(
      id,
      array['organisation_admin']::public.app_role[]
    )
  );
