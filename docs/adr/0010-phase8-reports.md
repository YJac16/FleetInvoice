# ADR 0010 — Phase 8 Operational Reports & CSV Exports

## Status

Accepted — 2026-07-24

## Context

Phase 8 billing and payroll MVPs are live. Operators still lack period-scoped operational reports and CSV export for trips, fuel, attendance, and commercial/payroll summaries. A full warehouse or BI stack is premature.

## Decision

1. No new migration — reports read existing OLTP tables under existing RLS.
2. Four report types on `/reports`: trips, fuel, attendance (boardings), commercial (invoices + payroll summary).
3. Period filter: inclusive `period_start` date, exclusive `period_end` date (same convention as invoice/payroll RPCs).
4. Export format: CSV only (client-side `toCsv` + download). No PDF in this slice.
5. Permission: `reports:view`. Company managers see only data already visible via company-scoped RLS (fuel/invoices); trips/payroll may be empty or partial based on policies.
6. Keep lightweight master-data count cards as a secondary “at a glance” section.

## Consequences

- Large orgs may need server-side pagination later; MVP loads period rows via existing list patterns with client filters.
- Next Architecture step after this: P0 production hardening (see ADR 0011), then P1 billing polish or Phase 9 subscriptions.
