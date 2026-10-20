-- =============================================================================
-- 00067 — Ensure anon cannot execute driver/admin trip RPCs after bootstrap grants
-- =============================================================================

revoke all on function public.set_trip_billing_override(uuid, numeric, text) from anon;
grant execute on function public.set_trip_billing_override(uuid, numeric, text) to authenticated;

revoke all on function public.clear_trip_billing_override(uuid, text) from anon;
grant execute on function public.clear_trip_billing_override(uuid, text) to authenticated;

revoke all on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
) from anon;
grant execute on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
) to authenticated;

revoke all on function public.trip_assigned_to_current_driver(uuid) from anon;
grant execute on function public.trip_assigned_to_current_driver(uuid) to authenticated;
