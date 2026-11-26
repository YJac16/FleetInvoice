-- =============================================================================
-- ROLLBACK: 00100_trip_price_guard.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Removes the trip price guard
-- and restores the 00097 grant on the invoice-line sync:
--
--   trigger  trips_reject_direct_billing_price  on trips   (new in 00100)
--   function trips_reject_direct_billing_price()           (new in 00100)
--   grant execute on sync_staff_trip_invoice_line to authenticated (00097)
-- =============================================================================

begin;

drop trigger if exists trips_reject_direct_billing_price on public.trips;
drop function if exists public.trips_reject_direct_billing_price();

revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public, anon;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to authenticated;

commit;
