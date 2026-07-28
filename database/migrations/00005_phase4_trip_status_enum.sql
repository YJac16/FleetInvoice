-- =============================================================================
-- WorkOps Phase 4a — Extend trip_status enum
-- =============================================================================
-- MUST be applied in its own SQL Editor run (commit) BEFORE 00006.
-- Postgres forbids using newly added enum labels in the same transaction.

alter type public.trip_status add value if not exists 'assigned';
alter type public.trip_status add value if not exists 'in_progress';
alter type public.trip_status add value if not exists 'completed';
