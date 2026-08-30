# ADR 0003 — Phase 3 Routes, Scheduling & Trip Planning

## Status

Accepted — 2026-07-23

## Context

Phase 2 shipped production-quality master data. The next product step is planning work before execution: reusable routes with ordered stops, recurring schedules, and generated planned trips — without driver portal, GPS, or QR (Phases 4–5).

## Decision

1. Forward-only migration `00004_phase3_routes_scheduling.sql`.
2. Tables: `routes`, `route_stops`, `schedules`, `trips` with soft deletes.
3. `trip_status` starts as `planned` | `cancelled` only; execution statuses arrive in Phase 4.
4. Idempotent generation via `generate_trips` RPC using `generation_key = schedule_id:planned_start_utc`.
5. Company Manager visibility uses `has_company_scope` when `routes.company_id` / `trips.company_id` is set.
6. Role checks that include `supervisor` use `has_org_role_names` (same-transaction-safe text compare).

## Phase 4–5 foreshadow (not in this migration)

- Phase 4: `trip_assignments`, `trip_events`, driver PWA workflow.
- Phase 5: `attendance_events`, `qr_tokens`, richer notification use of existing outbox.

## Consequences

- Operators must apply 00001→00004 in order and create Storage bucket `vehicle-docs` (Phase 2).
- Re-running generate for the same window inserts only missing keys.
- Cancelled trips keep their generation_key; regenerating will not recreate them while the row exists undeleted.
