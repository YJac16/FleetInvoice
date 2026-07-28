# ADR 0012 — P1 Invoice Print (HTML / browser PDF)

## Status

Accepted — 2026-07-24

## Context

Phase 8 invoices are listable and status-managed, but operators and company managers need a printable commercial document. Server-side PDF generation (Puppeteer) is costly on serverless hosts.

## Decision

1. Printable HTML views at `/invoices/[id]/print` and `/company/invoices/[id]/print`.
2. Primary export path: browser **Print → Save as PDF** (`window.print` + print-friendly layout).
3. Letterhead uses `organisations.name` and optional `logo_url`.
4. `getInvoice` + existing `listInvoiceLines` under RLS; no new migration.
5. List UI gains a Print action linking to the print route.

## Consequences

- No PDF binary storage in this slice.
- Payslips and accounting sync remain out of scope.
- Next: Phase 9 subscriptions for self-serve SaaS packaging.
