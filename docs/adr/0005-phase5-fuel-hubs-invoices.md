# ADR 0005 — Phase 5 Fuel Monitoring, Role Hubs & Weekly Company Invoices

## Status

Accepted — 2026-07-23

## Context

Phase 4 delivered driver trip execution. Operators need fuel fill-up capture (odometer km + litres), role-specific hubs (admin / driver / company), and a minimal weekly fuel invoice for company managers. Employee QR (old Phase 5) is deferred.

## Decision

1. Migration `00007_phase5_fuel_and_invoices.sql`.
2. `fuel_fillups` with monotonic odometer enforced in `log_fuel_fillup` RPC.
3. Optional `vehicles.company_id` for company fleet scoping.
4. `invoices` + `invoice_lines` (fuel lines only); `generate_weekly_fuel_invoice` is idempotent per org/company/week.
5. Route groups: `(dashboard)` admin, `(driver)` driver, `(company)` company_manager; post-login hub redirect by active role.
6. Roadmap renumber: this work is Phase 5; QR → Phase 6; GPS → Phase 7; full billing remains later.

## Consequences

- Drivers must enter odometer ≥ last fill for the vehicle.
- Fill-ups without `company_id` do not appear on company invoices until attributed.
- Apply `00007` only after `00005`/`00006`.
