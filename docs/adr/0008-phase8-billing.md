# ADR 0008 — Phase 8 Billing MVP (Rate Cards & Invoice Lifecycle)

## Status

Accepted — 2026-07-23

## Context

Phase 5 delivered fuel-only weekly invoices (`generate_weekly_fuel_invoice`) with statuses `draft | issued | void`. Ops need commercial rate cards (per company or org-wide), non-fuel invoice lines (completed trips, fixed fees, adjustments), and a clear paid state. Payroll and full operational reports remain later Phase 8 slices.

## Decision

1. Migration `00010_phase8_invoice_enums.sql` adds enum values in a **separate transaction**: `invoice_status.paid`, `invoice_line_type` values `trip`, `fixed`, `adjustment`.
2. Migration `00011_phase8_billing.sql`:
   - `rate_cards` — org-scoped pricing (`line_type`, optional `company_id`, `unit` trip|boarding|fixed, `unit_amount`, effective dates).
   - `invoices.paid_at` timestamptz.
   - `invoice_lines.rate_card_id` / `trip_id` optional FKs for traceability.
   - RPC `generate_period_invoice` — idempotent for org/company/period; fuel lines (same as Phase 5) plus trip lines (completed trips × matching rate card) plus active fixed rate cards as one-off lines.
   - RPC `set_invoice_status` — `draft → issued → paid`, or `void` from draft/issued (not from paid).
3. Permissions: `rate_cards:view` / `rate_cards:manage` for ops; company managers keep `invoices:view|manage` for their scoped companies (read rate cards for their company).
4. UI: `/rate-cards` CRUD; invoices page gains status actions + line type column; company hub shows paid status.
5. Existing `generate_weekly_fuel_invoice` remains for backward compatibility; new UI prefers `generate_period_invoice`.

## Consequences

- Enum migrations must commit alone before `00011` uses new labels.
- Trip billing counts `trips.status = 'completed'` in the period for the company (via vehicle `company_id` or route company linkage when available — MVP uses vehicle assignment company / trip vehicle).
- Payroll, CSV report suite, and subscription entitlements are **out of scope**.
