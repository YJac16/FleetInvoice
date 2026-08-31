# Retail go-live (Wave 0 — P0 operator gates)

Complete these on the **deployment host** before selling managed or self-serve retail. App tooling already exists; this is the human checklist.

**First Vercel project:** see [`vercel-deploy.md`](./vercel-deploy.md). Project slug on the team: **`workops`** (not UniCab).

## 1. Secrets & public config

| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Host env (WorkOps project `tggxnvombexvxblsntsm`) |
| `NEXT_PUBLIC_APP_URL` | Production hostname (`https://…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `NOTIFICATIONS_PROCESS_SECRET` or `CRON_SECRET` | Server only (`CRON_SECRET` required for Vercel Cron) |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | Verified sending domain |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Restrict by URL in Mapbox |
| Phase 9: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | After subscriptions live |

## 2. Supabase Auth

- Site URL = production `NEXT_PUBLIC_APP_URL`
- Redirect URLs include `{APP_URL}/auth/callback`

## 3. Outbox cron

- **Vercel:** `vercel.json` → `/api/cron/notifications` every 5 minutes (uses `CRON_SECRET`)
- Manual/other: `POST /api/notifications/process` — see [`notifications-cron.md`](./notifications-cron.md)

## 4. Verify

```bash
npm run env:check
npm run db:audit
npm run test:e2e:smoke
```

Apply Phase 9 SQL on **WorkOps** Supabase (`tggxnvombexvxblsntsm`) in the SQL editor:

1. `database/migrations/00013_phase9_subscriptions.sql`
2. `database/migrations/00014_phase9_white_label.sql`
3. `database/migrations/00016_membership_three_tiers.sql` (idempotent; live already has `membership_three_tiers`)

Then run `tests/rls/phase9_checks.sql`. Do **not** apply these to UniCab/other projects.

Run remaining SQL under `tests/rls/` for schema presence.

## 5. Paid project hygiene

Paid Supabase plan with backups enabled; Resend domain verified.

When this checklist is done, **managed retail** is unblocked (with P1 invoice print). **Self-serve SaaS** still needs Phase 9 waves.
