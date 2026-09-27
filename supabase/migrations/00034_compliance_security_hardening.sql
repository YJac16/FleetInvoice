-- =============================================================================
-- WorkOps — PR #36 follow-up: revoke anon on security definer RPCs, pin search_path
-- Idempotent; does not replace function bodies.
-- =============================================================================

-- Advisor: mutable search_path on SQL helpers (00032)
alter function public.compliance_milestone_for_days(integer) set search_path = public;
alter function public.compliance_status_for_days(integer) set search_path = public;
alter function public.validate_vehicle_model_year() set search_path = public;

-- Security definer RPCs from 00032 — authenticated (or service_role) only
revoke all on function public.driver_serves_company(uuid, uuid, integer) from public;
revoke all on function public.driver_serves_company(uuid, uuid, integer) from anon;
grant execute on function public.driver_serves_company(uuid, uuid, integer) to authenticated;

revoke all on function public.vehicle_in_company_scope(uuid, uuid) from public;
revoke all on function public.vehicle_in_company_scope(uuid, uuid) from anon;
grant execute on function public.vehicle_in_company_scope(uuid, uuid) to authenticated;

revoke all on function public.assign_vehicle_to_driver(uuid, uuid) from public;
revoke all on function public.assign_vehicle_to_driver(uuid, uuid) from anon;
grant execute on function public.assign_vehicle_to_driver(uuid, uuid) to authenticated;

revoke all on function public.unassign_vehicle(uuid) from public;
revoke all on function public.unassign_vehicle(uuid) from anon;
grant execute on function public.unassign_vehicle(uuid) to authenticated;

revoke all on function public.get_trip_driver_names(uuid[]) from public;
revoke all on function public.get_trip_driver_names(uuid[]) from anon;
grant execute on function public.get_trip_driver_names(uuid[]) to authenticated;

revoke all on function public.mark_admin_notification_read(uuid) from public;
revoke all on function public.mark_admin_notification_read(uuid) from anon;
grant execute on function public.mark_admin_notification_read(uuid) to authenticated;

-- Cron-only security definer from 00033 (idempotent with 00033 revokes)
revoke all on function public.enqueue_compliance_expiry_alerts() from public;
revoke all on function public.enqueue_compliance_expiry_alerts() from anon;
revoke all on function public.enqueue_compliance_expiry_alerts() from authenticated;
grant execute on function public.enqueue_compliance_expiry_alerts() to service_role;
