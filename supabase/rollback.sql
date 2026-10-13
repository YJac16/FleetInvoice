-- Rollback for 00060_supabase_audit_hardening_13_oct.sql (apply manually; not run by Supabase CLI chain).

-- ---------------------------------------------------------------------------
-- Storage policies (pre-00060)
-- ---------------------------------------------------------------------------

drop policy if exists org_logos_select on storage.objects;
create policy org_logos_select on storage.objects
  for select
  using (bucket_id = 'org-logos');

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select
  using (bucket_id = 'avatars');

-- ---------------------------------------------------------------------------
-- get_invitation_by_token (pre-00060 — full invitations row)
-- ---------------------------------------------------------------------------

drop function if exists public.get_invitation_by_token(text);

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

revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scope helpers (pre-00060)
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

create or replace function public.org_entitled_modules(p_organisation_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(distinct e.module_key order by e.module_key)
      from public.subscriptions s
      join public.module_entitlements e on e.plan_id = s.plan_id
      where s.organisation_id = p_organisation_id
        and s.status in ('trialing', 'active')
    ),
    array[
      'core',
      'gps',
      'attendance',
      'billing',
      'payroll',
      'reports',
      'portal'
    ]::text[]
  );
$$;

revoke all on function public.driver_serves_company(uuid, uuid, integer) from public, anon;
grant execute on function public.driver_serves_company(uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.vehicle_in_company_scope(uuid, uuid) from public, anon;
grant execute on function public.vehicle_in_company_scope(uuid, uuid) to authenticated, service_role;

revoke all on function public.org_entitled_modules(uuid) from public, anon;
grant execute on function public.org_entitled_modules(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Staff / employee RPCs — pre-00060 bodies (from 00059 / 00015)
-- ---------------------------------------------------------------------------

create or replace function public.start_staff_trip(
  p_trip_id uuid,
  p_opening_km numeric,
  p_waybill_confirmed boolean default true
)
returns public.trips
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx record;
  t public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into ctx from public.assert_staff_trip_driver(p_trip_id);
  t := ctx.trip;

  if t.status::text not in ('assigned', 'planned') then
    raise exception 'Trip cannot be started from status %', t.status;
  end if;

  if p_opening_km is null or p_opening_km < 0 then
    raise exception 'Opening km is required';
  end if;

  perform public.ensure_trip_assignment_vehicle(p_trip_id, ctx.driver_id, null);

  update public.trips
  set
    opening_km = p_opening_km,
    waybill_confirmed_at = case when p_waybill_confirmed then timezone('utc', now()) else waybill_confirmed_at end,
    staff_started_at = timezone('utc', now())
  where id = p_trip_id;

  return public.set_staff_trip_status(
    p_trip_id,
    'en_route_pickup'::public.trip_status,
    'started'::public.trip_event_type,
    'En route to pickup',
    jsonb_build_object('opening_km', p_opening_km)
  );
end;
$$;

-- Re-apply 00052-style SECURITY DEFINER grants if needed after rollback (run 00052 section 1 or deploy prior migration).

grant select on all tables in schema public to anon;
