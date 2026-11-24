-- =============================================================================
-- ROLLBACK: 00078_delete_workshop_bill.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Drops the RPC. Bills already
-- soft-deleted stay deleted; clear workshop_bills.deleted_at by hand to restore
-- one.
-- =============================================================================

begin;

drop function if exists public.delete_workshop_bill(uuid, uuid, uuid);

commit;
