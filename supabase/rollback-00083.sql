-- =============================================================================
-- ROLLBACK: 00083_workshop_bill_final_lock.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Drops the two triggers and
-- their functions. The RPC-level locks from 00074/00078 stay in place.
-- =============================================================================

begin;

drop trigger if exists workshop_bill_lines_final_lock on public.workshop_bill_lines;
drop trigger if exists workshop_bills_final_lock on public.workshop_bills;
drop function if exists public.guard_workshop_bill_line_final();
drop function if exists public.guard_workshop_bill_final();

commit;
