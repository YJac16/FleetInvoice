-- =============================================================================
-- Rollback migration 00061 only (separate transaction from rollback.sql / 00060)
-- =============================================================================

BEGIN;

drop policy if exists trip_events_select on public.trip_events;
create policy trip_events_select on public.trip_events
  for select
  using (
    public.is_platform_owner()
    or (
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
    )
  );

drop policy if exists trip_assignments_select on public.trip_assignments;
create policy trip_assignments_select on public.trip_assignments
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or driver_id = public.current_driver_id(organisation_id)
      or (
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
      )
    )
  );

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
            when public.is_company_manager(organisation_id) then
              public.company_user_can_see(organisation_id, company_id)
            else
              company_id is null
              or public.has_company_scope(organisation_id, company_id)
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
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor',
        'driver'
      ]
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

drop index if exists public.trip_assignments_trip_id_driver_id_idx;

drop function if exists public.trip_assigned_to_current_driver(uuid);

COMMIT;
