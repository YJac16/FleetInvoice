-- =============================================================================
-- Rollback migrations 00061–00067 (+ 00068 when present)
-- Separate transaction from rollback.sql / 00060.
-- Apply supabase/rollback-restore-pre-driver-self-entry.sql first
-- (see tests/db/run-rollback-00061-00067.sh).
--
-- Migration decisions (00064–00067):
--   00064 — REVERT: restore vehicles_select (00057); drop 00066 approve signature.
--           staff_can_manage_trips / duplicate RPC / audit RLS superseded by 00063 drop.
--   00065 — REVERT: submit_driver_trip without vehicle param removed in 00062 section.
--   00066 — REVERT: approve_driver_trip(uuid, uuid) dropped before 00062 section.
--   00067 — KEEP until RPC drop: anon EXECUTE revokes are moot once functions drop.
--
-- Audit rows (trip_audit, snapshots, billing overrides):
--   DROP — tables removed in 00063 revert (no archive; destructive rollback).
-- =============================================================================

BEGIN;

-- Apply supabase/rollback-restore-pre-driver-self-entry.sql first (see runner).

-- 00068 revert (when migration applied)
drop trigger if exists trip_audit_no_update on public.trip_audit;
drop trigger if exists trip_audit_no_delete on public.trip_audit;
drop function if exists public.trip_audit_reject_mutation();

alter table public.invoice_lines
  drop column if exists override_reason,
  drop column if exists price_overridden;

-- 00066 revert — approval requires vehicle param; drop before 00062/00063 function drops
drop function if exists public.approve_driver_trip(uuid, uuid);

-- 00064 revert — driver-visible fleet list policy (pre-00064 / 00057)
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or exists (
        select 1 from public.driver_vehicle_assignments a
        where a.vehicle_id = vehicles.id
          and a.driver_id = public.current_driver_id(vehicles.organisation_id)
          and a.ends_on is null
          and a.deleted_at is null
      )
      or exists (
        select 1 from public.trip_assignments ta
        where ta.vehicle_id = vehicles.id
          and ta.driver_id = public.current_driver_id(vehicles.organisation_id)
          and ta.released_at is null
          and ta.deleted_at is null
      )
      or (
        organisation_id in (select public.user_organisation_ids())
        and not public.has_org_role_names(
          organisation_id,
          array['driver']
        )
        and (
          case
            when public.is_company_manager(organisation_id) then
              false
            else
              company_id is null
              or public.has_company_scope(organisation_id, company_id)
          end
        )
      )
    )
  );

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
