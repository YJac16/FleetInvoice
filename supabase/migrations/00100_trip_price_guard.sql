-- =============================================================================
-- 00100_trip_price_guard.sql
-- =============================================================================
-- Demo only. Ports PR #73 (commits 2a0f7bb, 9c56f86) as a new migration so the
-- already-applied 00070 stays untouched. The PR's 00071_invoice_sync_auth.sql
-- is NOT ported: 00097 has since changed the sync function body, and revoking
-- direct EXECUTE (below) makes its in-function auth check unnecessary.
--
--   1. Block direct client writes to the billed-price columns on trips
--      (insert and update). Security definer RPCs run as the function owner
--      and pass. Dispatcher/supervisor cancellation goes through the security
--      definer set_staff_trip_status path, so it keeps working.
--   2. Keep the invoice-line sync internal: no EXECUTE for authenticated.
--      Every SQL caller is security definer (verified), the client never
--      calls it.
--
-- No pricing logic changes. Rollback: supabase/rollback-00100.sql
-- =============================================================================

-- Table-level UPDATE is already granted to staff, so a column revoke would not
-- stick. Reject direct writes of the billed-price columns instead.
create or replace function public.trips_reject_direct_billing_price()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('authenticated', 'anon', 'authenticator') then
    if tg_op = 'INSERT' then
      if new.manual_unit_price is not null
         or new.manual_price_area_key is not null
         or coalesce(new.reprice_on_next_sync, false)
      then
        raise exception 'Trip price columns can only be changed by staff billing actions';
      end if;
    elsif new.manual_unit_price is distinct from old.manual_unit_price
       or new.manual_price_area_key is distinct from old.manual_price_area_key
       or new.reprice_on_next_sync is distinct from old.reprice_on_next_sync
    then
      raise exception 'Trip price columns can only be changed by staff billing actions';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trips_reject_direct_billing_price() from public, anon, authenticated;

drop trigger if exists trips_reject_direct_billing_price on public.trips;
create trigger trips_reject_direct_billing_price
  before insert or update on public.trips
  for each row
  execute function public.trips_reject_direct_billing_price();

-- Invoice-line sync is an internal helper (callers are security definer RPCs
-- and service_role jobs). 00097 re-granted it to authenticated; take it back.
revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public, anon, authenticated;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to service_role;
