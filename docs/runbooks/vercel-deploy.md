# Deploy WorkOps to Vercel (first time)

WorkOps is **not** the UniCab Vercel project. Create a dedicated project.

## 1. Create project

From `FleetInvoice/`:

```bash
npx vercel link
# Or: Import the Git repo in Vercel Dashboard → New Project
# Root Directory: FleetInvoice (if monorepo) or leave blank if repo root is the app
# Framework: Next.js
```

Project name suggestion: `workops` or `fleet-invoice`.

**Production URL (this deploy):** https://workops-yaseens-projects-1765104f.vercel.app

Also available: https://workops-mu.vercel.app

Do **not** use framework preset **Other** — set **Next.js** (CLI-created projects default to Other and break Edge middleware).

## 2. Environment variables (Production + Preview)

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | WorkOps project `tggxnvombexvxblsntsm` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` or `https://<project>.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `CRON_SECRET` | Same value Vercel Cron uses as Bearer token |
| `NOTIFICATIONS_PROCESS_SECRET` | Optional alias; cron uses `CRON_SECRET` |
| `MAILERSEND_API_KEY` / `MAILERSEND_FROM_EMAIL` | Verified domain |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | URL-restrict in Mapbox |
| `YOCO_SECRET_KEY` / `YOCO_WEBHOOK_SECRET` / `NEXT_PUBLIC_YOCO_PUBLIC_KEY` | Phase 9a |

## 3. Cron

[`vercel.json`](../../vercel.json) schedules `GET/POST /api/cron/notifications` daily at 08:00 UTC (`0 8 * * *`). Hobby accounts cannot run crons more than once per day; upgrade to Pro for `*/5 * * * *`. Ensure `CRON_SECRET` is set so Vercel attaches `Authorization: Bearer …`. For more frequent drains on Hobby, use an external scheduler or `npm run notifications:drain`.

## 4. Supabase Auth

Site URL + redirect: `{NEXT_PUBLIC_APP_URL}/auth/callback`

## 5. Deploy

```bash
npx vercel --prod
```

Then run `npm run env:check` locally against production-shaped env, and `PLAYWRIGHT_BASE_URL=https://… npm run test:e2e:smoke` with `PLAYWRIGHT_SKIP_WEBSERVER=1`.

## 6. Custom domain

Vercel → Project → Domains → add hostname; update Auth URLs and Mapbox restrictions.
