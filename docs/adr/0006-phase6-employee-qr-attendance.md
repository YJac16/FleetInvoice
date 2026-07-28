# ADR 0006 — Phase 6 Employee Portal, QR Boarding & Attendance

## Status

Accepted — 2026-07-23

## Context

Phases 4–5 delivered driver execution, fuel capture, and role hubs. Operators still cannot verify that a specific employee boarded a trip. Architecture defers GPS (Phase 7) until attendance exists. Employees have an `app_role` and master-data row but no `profile_id` link and no portal hub.

## Decision

1. Migration `00008_phase6_employee_qr_attendance.sql`.
2. Add `employees.profile_id` (mirror drivers) and `current_employee_id(org)`.
3. Tables `qr_tokens` (opaque token hash, trip, employee, expiry, used_at) and `attendance_events` (immutable board/scan/confirm rows).
4. Mutations only via security-definer RPCs: `issue_qr_token`, `scan_qr_token`. Issue returns the raw token once; DB stores `sha256` hex.
5. Issue/scan enqueue `notification_outbox` rows from the RPCs (durable outbox; bypass client-only enqueue auth).
6. Route group `app/(employee)/` + hub redirect `employee` → `/employee`. Admin `/attendance` for issue/scan/list; driver `/driver/scan` for paste-token verify.
7. App permissions: `attendance:self` (+ `trips:self` for schedule) on role `employee`; keep `attendance:view` / `attendance:manage` for ops.

## Consequences

- Employees must be linked via `profile_id` to use the portal and receive self-scoped schedule/QR rows.
- Tokens are single-use after successful scan; expired tokens fail verify.
- Apply `00008` only after `00007`.
- GPS / Mapbox remain Phase 7.
