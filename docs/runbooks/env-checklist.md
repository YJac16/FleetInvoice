# Environment & secrets checklist

Use this before deploying WorkOps Foundation / Phase 0.

## Required (app)

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/anon key (RLS enforced) | No (public) |
| `NEXT_PUBLIC_APP_URL` | Auth redirects + invite links | No |

## Required for invitation email delivery

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Drain `notification_outbox` (server only) | **Yes** |
| `NOTIFICATIONS_PROCESS_SECRET` or `CRON_SECRET` | Authorize `POST /api/notifications/process` | **Yes** |
| `MAILERSEND_API_KEY` | Send email via MailerSend | **Yes** |
| `MAILERSEND_FROM_EMAIL` | From address (verified domain) | No |

Without MailerSend, invites still work: the app shows/copies the invite URL and outbox rows are marked `skipped`.

## Never expose

- Service role key in client bundles
- Process/cron secrets in `NEXT_PUBLIC_*`
- Database passwords in the Next.js app

## Auth (local Next.js)

In Supabase → **Authentication → URL configuration**:

- Site URL: `http://localhost:3000`
- Redirect URLs: include `http://localhost:3000/auth/callback`

Without these, password recovery and invite accept redirects fail on local.

## Auth (production)

- Site URL: `https://your-domain.com` (must match `NEXT_PUBLIC_APP_URL`)
- Redirect URLs: include `https://your-domain.com/auth/callback` (keep localhost entries for local dev)
- Restrict Mapbox token by production URL in the Mapbox dashboard

Full outbox/cron steps: [`notifications-cron.md`](./notifications-cron.md).

## Database

Apply in order:

1. `database/migrations/00001_workops_foundation.sql`
2. `database/migrations/00002_phase0_hardening.sql`
3. `database/migrations/00003_phase2_master_data.sql`
4. `database/migrations/00004_phase3_routes_scheduling.sql`
5. `database/migrations/00005_phase4_trip_status_enum.sql` — **commit this on its own** (separate SQL Editor run); Postgres forbids using a newly added enum value in the same transaction that added it
6. `database/migrations/00006_phase4_driver_portal.sql`
7. `database/migrations/00007_phase5_fuel_and_invoices.sql`
8. `database/migrations/00008_phase6_employee_qr_attendance.sql`
9. `database/migrations/00009_phase7_gps_and_dispatch.sql`
10. `database/migrations/00010_phase8_invoice_enums.sql` — **commit alone** (new enum labels)
11. `database/migrations/00011_phase8_billing.sql`
12. `database/migrations/00012_phase8_payroll.sql`
13. `database/migrations/00013_phase9_subscriptions.sql`
14. `database/migrations/00014_phase9_white_label.sql`
15. `database/migrations/00015_phase10_hub_ux.sql`
16. `database/migrations/00016_membership_three_tiers.sql`
17. Promote platform owner via `database/seed.example.sql`

Optional for Phase 7 dispatcher map:

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox GL JS on `/dispatch` | No (public token; restrict by URL in Mapbox dashboard) |

After setting API keys in `.env.local`, run:

```bash
npm run env:check
npm run db:audit
```

### Production retail checklist (P0)

Before selling as a live product:

1. Set `SUPABASE_SERVICE_ROLE_KEY` (server only) and verify MailerSend + Mapbox for your production domain.
2. Supabase Auth Site URL + redirect URLs for the production hostname (not only localhost).
3. Schedule `POST /api/notifications/process` — see [`notifications-cron.md`](./notifications-cron.md); local: `npm run notifications:drain`.
4. Confirm `vehicle-docs` private bucket exists (`db:audit` creates it when service role is set).
5. Run RLS smoke SQL under `tests/rls/` and `npm run test:e2e:smoke`.

Full operator go-live steps: [`retail-go-live.md`](./retail-go-live.md). See Architecture for the P0–P3 retail roadmap.

## Storage (Phase 2 vehicle documents)

Create a private Supabase Storage bucket named **`vehicle-docs`**.

Recommended policies (authenticated org members via your usual RLS approach, or start with authenticated upload/read for development):

- Path convention: `{organisation_id}/{vehicle_id}/{uuid}-{filename}`
- If the bucket is missing, the app still saves document **metadata** without a file.

## Cron suggestion

Call every minute (or every 5 minutes):

```http
POST /api/notifications/process
Authorization: Bearer <NOTIFICATIONS_PROCESS_SECRET>
```

Details and Vercel/curl examples: [`notifications-cron.md`](./notifications-cron.md).

## Architecture reference

See [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) and [`docs/adr/0001-phase0-foundation-hardening.md`](../adr/0001-phase0-foundation-hardening.md).
