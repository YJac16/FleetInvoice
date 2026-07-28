-- =============================================================================
-- WorkOps Phase 8 — Invoice enum extensions (commit alone)
-- =============================================================================
-- Postgres forbids using a newly added enum value in the same transaction that
-- added it. Apply this file, commit, then apply 00011_phase8_billing.sql.

alter type public.invoice_status add value if not exists 'paid';

alter type public.invoice_line_type add value if not exists 'trip';
alter type public.invoice_line_type add value if not exists 'fixed';
alter type public.invoice_line_type add value if not exists 'adjustment';
