# ADR 0002 — Phase 2 Master Data Completeness

## Status

Accepted — 2026-07-22

## Context

Foundation v1 + Phase 0 provide CRUD master data with soft deletes, but lack archive/restore UX, CSV bulk onboarding, uniqueness on business keys, driver identity linking, and vehicle document tracking — all required before Phase 3 routes/trips.

## Decision

1. Forward-only migration `00003_phase2_master_data.sql`.
2. Soft-delete remains the archive mechanism; UI exposes Active/Archived + Restore.
3. Partial unique indexes enforce uniqueness only on active (`deleted_at is null`) rows.
4. `drivers.profile_id` is optional; portal auth remains invite/membership based.
5. `vehicle_documents` stores metadata; binary files go to Storage bucket `vehicle-docs`.
6. Company Manager site visibility follows the same company-scope pattern as employees.

## Consequences

- Imports must handle unique-violation errors gracefully.
- Restoring an archived row may fail if an active row reuses the same business key.
- Operators must create the `vehicle-docs` Storage bucket (documented in env checklist).
