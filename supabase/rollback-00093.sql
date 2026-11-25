-- =============================================================================
-- ROLLBACK: 00093_fuel_prices.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Run rollback-00095.sql and
-- rollback-00094.sql first (fuel_fillups.priced_from_id references this
-- table; the drop below fails rather than cascading if it still exists).
-- Drops the fuel price RPCs and the fuel_prices table (all rates, global and
-- org, are lost).
-- =============================================================================

begin;

drop function if exists public.notify_fuel_price_ingest_failure(text);
drop function if exists public.ingest_global_fuel_prices(jsonb, text);
drop function if exists public.resolve_fuel_unit_price(uuid, text, text, date);
drop function if exists public.upsert_org_fuel_price(uuid, text, date, numeric, text);
drop function if exists public.confirm_fuel_prices(uuid, date);
drop function if exists public.list_fuel_prices(uuid);
drop table if exists public.fuel_prices;

commit;
