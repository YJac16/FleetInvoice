-- =============================================================================
-- ROLLBACK: 00095_fuel_price_backfill.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Drops the opt-in backfill
-- RPC. Fill-ups it already priced stay priced (locked).
-- =============================================================================

begin;

drop function if exists public.backfill_unpriced_fuel_fillups(uuid);

commit;
