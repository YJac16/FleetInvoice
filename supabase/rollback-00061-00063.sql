-- =============================================================================
-- Rollback migrations 00061–00063 (separate transaction from rollback.sql / 00060)
-- Restores pre-00063 billing RPCs before dropping 00063/00062 objects.
-- =============================================================================

BEGIN;

-- Apply supabase/rollback-restore-pre-driver-self-entry.sql first (see tests/db/run-rollback-00061-00063.sh).

revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public, anon, authenticated;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to service_role;

revoke all on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int
) from public, anon;
grant execute on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int
) to authenticated;

-- 00063 revert
drop function if exists public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
);
drop function if exists public.clear_trip_billing_override(uuid, text);
drop function if exists public.set_trip_billing_override(uuid, numeric, text);
drop function if exists public.assert_staff_trip_invoice_editable(uuid);
drop function if exists public.staff_can_manage_trips(uuid);
drop function if exists public.log_trip_audit(uuid, uuid, text, text, text, text);
drop function if exists public.normalize_trip_route_label(text);

drop table if exists public.trip_audit;
drop table if exists public.trip_billing_overrides;
drop table if exists public.trip_driver_submission_snapshots;

drop function if exists public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
);

-- 00062 revert
drop function if exists public.reject_driver_trip(uuid, text);
drop function if exists public.approve_driver_trip(uuid, uuid);
drop function if exists public.approve_driver_trip(uuid);
drop function if exists public.suggest_driver_trip_vehicle(uuid);
drop function if exists public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text
);
drop function if exists public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, uuid, numeric, text
);
drop function if exists public.driver_trip_duplicate_warning(uuid, uuid, uuid, timestamptz, text);
drop function if exists public.driver_trip_duplicate_warning(uuid, uuid, timestamptz, text);
drop function if exists public.driver_submission_pending(public.trips);

alter table public.trips
  drop column if exists rejected_reason,
  drop column if exists approved_at,
  drop column if exists approved_by,
  drop column if exists submitted_by_driver;

-- 00061 revert (policies before helper)
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
