# ADR 0009 — Phase 8 Payroll MVP (Runs from Trips & Attendance)

## Status

Accepted — 2026-07-23

## Context

Phase 8 billing MVP delivered company invoices and commercial `rate_cards`. Ops still need internal payroll: pay drivers for completed trips and employees for boarded attendance in a period. Payslips, accounting export, and full reports remain deferred.

## Decision

1. Migration `00012_phase8_payroll.sql`.
2. `pay_rates` — org-scoped pay amounts with `subject_role` (`driver` | `employee`), `unit` (`trip` | `boarding` | `fixed`), optional `company_id`, effective dates. Distinct from commercial `rate_cards`.
3. `payroll_runs` — period window, status `draft | finalized | void`, currency, total; unique non-void run per org+period.
4. `payroll_lines` — one row per trip (driver) or boarding event (employee), or fixed pay-rate lines; optional FKs to `trip_id` / `attendance_event_id` / `pay_rate_id`.
5. RPCs (security definer):
   - `generate_payroll_run(org, period_start, period_end)` — idempotent; builds draft then sets totals (leaves status `draft` so ops can review before finalize).
   - `finalize_payroll_run(run_id)` — `draft → finalized`.
   - `void_payroll_run(run_id)` — `draft|finalized → void` (not from already void).
6. Permissions: `payroll:view` / `payroll:manage` for organisation_admin, manager, dispatcher (and platform_owner). Not company_manager / driver / employee.
7. UI: `/payroll` list, generate, lines drill-down, finalize/void; `/pay-rates` CRUD for rates.

## Consequences

- Driver lines: completed trips in period with active assignment; amount from matching driver/`trip` pay_rate (company via vehicle when set, else org-wide).
- Employee lines: `attendance_events.event_type = 'boarded'` in period; amount from employee/`boarding` pay_rate (company via employee.company_id when set).
- Fixed pay_rates add one line per matching subject role in the period (org-wide or company-scoped employees/drivers active).
- No payslip PDF/email in this slice.
