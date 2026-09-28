-- =============================================================================
-- WorkOps — driver_notification_type: fuel slip review outcomes
-- Enum new values cannot be used in the same transaction on PostgreSQL.
-- Requires 00053_fuel_slips.sql for RPC usage.
-- =============================================================================

alter type public.driver_notification_type add value if not exists 'fuel_slip_queried';
alter type public.driver_notification_type add value if not exists 'fuel_slip_rejected';
