# RLS test harness

WorkOps enforces multi-tenant isolation in Postgres via Row Level Security. Automated CI against a live database is recommended before Phase 3.

## Prerequisites

1. Apply migrations `00001` through `00012` (run `00005` alone before `00006`; run `00010` alone before `00011`)
2. Create two Auth users and two organisations with memberships

## Quick checks

Run [`foundation_checks.sql`](./foundation_checks.sql), [`phase4_checks.sql`](./phase4_checks.sql), [`phase5_checks.sql`](./phase5_checks.sql), [`phase6_checks.sql`](./phase6_checks.sql), [`phase7_checks.sql`](./phase7_checks.sql), [`phase8_checks.sql`](./phase8_checks.sql), and [`phase8_payroll_checks.sql`](./phase8_payroll_checks.sql) in the Supabase SQL editor.

## Required manual scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Member of Org A queries `companies` | Only Org A rows |
| 2 | `company_manager` with no `member_scopes` | Zero company/employee rows |
| 3 | `company_manager` scoped to Company X | Only Company X (+ employees with that `company_id`) |
| 4 | `driver` attempts insert on `vehicles` | Denied by RLS |
| 5 | `organisation_admin` calls `create_invitation` | Succeeds; outbox row enqueued from app |
| 6 | Authenticated user `insert into audit_logs` | Denied; `write_audit_log` RPC succeeds |
| 7 | Dispatcher `assign_trip` on planned trip | Assignment + status `assigned` |
| 8 | Linked driver `transition_trip(..., started)` | Status `in_progress` + event |
| 9 | Direct `insert into trip_events` | Denied (RPC only) |
| 10 | Linked driver `log_fuel_fillup` odometer decrease | Exception |
| 11 | Scoped `company_manager` weekly fuel invoice | Issued invoice + fuel lines |
| 12 | Repeat weekly invoice same week | Idempotent existing invoice |
| 13 | Ops `issue_qr_token` for trip + employee | Raw token returned; `issued` attendance event |
| 14 | Linked employee `scan_qr_token` | `boarded` event; token `used_at` set |
| 15 | Repeat scan same token | Exception `Token already used` |
| 16 | Direct insert into `qr_tokens` | Denied (RPC only) |
| 17 | Linked driver `ingest_gps_points` | `gps_points` + `gps_last_positions` upsert |
| 18 | Cross geofence radius | `geofence_events` enter/exit |
| 19 | Direct insert into `gps_points` | Denied (RPC only) |
| 20 | Ops create trip/fixed `rate_cards` | Insert succeeds |
| 21 | `generate_period_invoice` with rates + fuel | Issued invoice + mixed lines |
| 22 | `set_invoice_status` issued → paid | `paid_at` set |
| 23 | `set_invoice_status` paid → void | Exception |
| 24 | Ops create driver trip `pay_rates` | Insert succeeds |
| 25 | `generate_payroll_run` with trips + rates | Draft run + lines |
| 26 | `finalize_payroll_run` | Status finalized |
| 27 | Direct insert into `payroll_lines` | Denied (RPC only) |

## P0 go-live gate

Before production:

1. `npm run env:check` and `npm run db:audit`
2. Run the SQL presence scripts above in Supabase SQL Editor (quick schema gate)
3. `npm run test:e2e:smoke` (login page loads; app must start via Playwright webServer or set `PLAYWRIGHT_BASE_URL` + `PLAYWRIGHT_SKIP_WEBSERVER=1`)

Authenticated e2e (invite/trip) stay skipped until `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` are set.

## Unit tests (no database)

```bash
npm test
```

Covers permission matrix, invitation email, odometer, invoice weeks, hub redirects, QR helpers, and geofence haversine/transitions.
