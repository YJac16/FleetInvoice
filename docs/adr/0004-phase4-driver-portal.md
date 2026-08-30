# ADR 0004 — Phase 4 Driver Portal & Trip Workflow

## Status

Accepted — 2026-07-23

## Context

Phase 3 produces planned trips. Operations need to assign a driver (and optional vehicle) and let that driver execute Start → Arrive → Complete without GPS or QR yet.

## Decision

1. Split enum extension into `00005_phase4_trip_status_enum.sql` (must commit alone) then `00006_phase4_driver_portal.sql`.
2. Extend `trip_status` with `assigned`, `in_progress`, `completed` (keep `planned`, `cancelled`).
3. Tables: `trip_assignments` (one active per trip), `trip_events` (append-only).
4. Workflow mutations only via `assign_trip` and `transition_trip` security-definer RPCs.
5. Drivers linked via `drivers.profile_id = auth.uid()`; helper `current_driver_id(org)`.
6. Admin Trips UI for assign; separate driver portal route group (`/driver`) for execution.
7. Maps: external deep-link only (Google Maps directions URL from stop coords when available).

## Phase 5 foreshadow

Employee QR / attendance tokens and richer notification use of `notification_outbox`.

## Consequences

- Operators must run **00005 then 00006** as two separate SQL Editor executions.
- Reassigning a trip releases the previous assignment (`released_at`) and writes a new one.
- Cancelled/completed trips cannot be started again without a new trip instance.
