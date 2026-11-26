-- =============================================================================
-- ROLLBACK: 00074_maintenance_rpcs.sql  (Fleet maintenance Drop 1, U2)
-- =============================================================================
-- Manual script, not part of the migration chain. Reverses 00074 only.
-- Run rollback-00075 first: set_workshop_bill_attachment calls
-- maintenance_assert_writer, so dropping it here before 00075 is undone fails
-- the dependency check on purpose (no CASCADE is used anywhere below).
--
-- Drops the audited write RPCs and the internal writer check, then removes the
-- odometer_km column and its check constraint that 00074 added to
-- workshop_bills. DATA LOSS: any odometer readings entered are discarded.
-- Audit-log rows written by the RPCs are not touched.
-- =============================================================================

begin;

-- Callers before the helper they call.
drop function if exists public.approve_workshop_bill(uuid, uuid, uuid);
drop function if exists public.save_workshop_bill(uuid, uuid, uuid, jsonb);
drop function if exists public.save_maintenance_category(uuid, uuid, uuid, jsonb);
drop function if exists public.save_supplier(uuid, uuid, uuid, jsonb);
drop function if exists public.maintenance_assert_writer(uuid, uuid);

alter table if exists public.workshop_bills
  drop constraint if exists workshop_bills_odometer_km_check;
alter table if exists public.workshop_bills
  drop column if exists odometer_km;

commit;
