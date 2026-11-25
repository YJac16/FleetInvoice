-- =============================================================================
-- ROLLBACK: 00089_driver_invoice_print_override.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Drops the per-driver
-- invoice issuer override table and its RPC. Print falls back to the org's
-- settings.invoice_print (the app treats a missing table as "no override").
-- =============================================================================

begin;

drop function if exists public.set_driver_invoice_print_override(uuid, jsonb);
drop table if exists public.driver_invoice_print_overrides;

commit;
