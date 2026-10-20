-- =============================================================================
-- 00061 — Driver RLS privacy: trips + trip_passengers scoped to assignment
-- =============================================================================

create or replace function public.trip_assigned_to_current_driver(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.trips t
    inner join public.trip_assignments ta
      on ta.trip_id = t.id
      and ta.organisation_id = t.organisation_id
      and ta.deleted_at is null
      and ta.released_at is null
    where t.id = p_trip_id
      and t.deleted_at is null
      and ta.driver_id = public.current_driver_id(t.organisation_id)
  );
$$;

revoke all on function public.trip_assigned_to_current_driver(uuid) from public, anon;
grant execute on function public.trip_assigned_to_current_driver(uuid) to authenticated;

comment on function public.trip_assigned_to_current_driver(uuid) is
  'True when the active trip assignment belongs to the authenticated user''s driver record in that trip''s org.';

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          case
            when public.has_org_role_names(
              organisation_id,
              array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
            ) then
              case
                when public.is_company_manager(organisation_id) then
                  public.company_user_can_see(organisation_id, company_id)
                else
                  company_id is null
                  or public.has_company_scope(organisation_id, company_id)
              end
            when public.has_org_role_names(organisation_id, array['driver']) then
              public.trip_assigned_to_current_driver(id)
            else
              case
                when public.is_company_manager(organisation_id) then
                  public.company_user_can_see(organisation_id, company_id)
                else
                  company_id is null
                  or public.has_company_scope(organisation_id, company_id)
              end
          end
        )
      )
    )
  );

drop policy if exists trip_passengers_select on public.trip_passengers;
create policy trip_passengers_select on public.trip_passengers
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or (
      public.has_org_role_names(organisation_id, array['driver'])
      and public.trip_assigned_to_current_driver(trip_id)
    )
    or (
      public.is_company_manager(organisation_id)
      and exists (
        select 1
        from public.employees e
        where e.id = trip_passengers.employee_id
          and e.deleted_at is null
          and public.company_user_can_see(e.organisation_id, e.company_id)
      )
      and exists (
        select 1
        from public.trips t
        where t.id = trip_passengers.trip_id
          and t.deleted_at is null
          and public.company_user_can_see(t.organisation_id, t.company_id)
      )
    )
    or employee_id = public.current_employee_id(organisation_id)
  );

drop policy if exists trip_assignments_select on public.trip_assignments;
create policy trip_assignments_select on public.trip_assignments
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        case
          when public.has_org_role_names(
            organisation_id,
            array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
          ) then
            case
              when public.is_company_manager(organisation_id) then
                exists (
                  select 1
                  from public.trips t
                  where t.id = trip_assignments.trip_id
                    and t.deleted_at is null
                    and public.company_user_can_see(t.organisation_id, t.company_id)
                )
              else
                organisation_id in (select public.user_organisation_ids())
            end
          when public.has_org_role_names(organisation_id, array['driver']) then
            public.trip_assigned_to_current_driver(trip_id)
          else
            case
              when public.is_company_manager(organisation_id) then
                exists (
                  select 1
                  from public.trips t
                  where t.id = trip_assignments.trip_id
                    and t.deleted_at is null
                    and public.company_user_can_see(t.organisation_id, t.company_id)
                )
              else
                organisation_id in (select public.user_organisation_ids())
            end
        end
      )
    )
  );

drop policy if exists trip_events_select on public.trip_events;
create policy trip_events_select on public.trip_events
  for select
  using (
    public.is_platform_owner()
    or (
      case
        when public.has_org_role_names(
          organisation_id,
          array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
        ) then
          case
            when public.is_company_manager(organisation_id) then
              exists (
                select 1
                from public.trips t
                where t.id = trip_events.trip_id
                  and t.deleted_at is null
                  and public.company_user_can_see(t.organisation_id, t.company_id)
              )
            else
              organisation_id in (select public.user_organisation_ids())
          end
        when public.has_org_role_names(organisation_id, array['driver']) then
          public.trip_assigned_to_current_driver(trip_id)
        else
          case
            when public.is_company_manager(organisation_id) then
              exists (
                select 1
                from public.trips t
                where t.id = trip_events.trip_id
                  and t.deleted_at is null
                  and public.company_user_can_see(t.organisation_id, t.company_id)
              )
            else
              organisation_id in (select public.user_organisation_ids())
          end
      end
    )
  );

create index if not exists trip_assignments_trip_id_driver_id_idx
  on public.trip_assignments (trip_id, driver_id);
