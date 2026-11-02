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
| `NEXT_PUBLIC_SUPABASE_URL` | WorkOps project `fyxyajsugvhjgukzhlkc` (live prod; `tggxnvombexvxblsntsm` is the old project) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` or `https://<project>.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `CRON_SECRET` | Same value Vercel Cron uses as Bearer token |
| `NOTIFICATIONS_PROCESS_SECRET` | Optional alias; cron uses `CRON_SECRET` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Verified domain |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | URL-restrict in Mapbox |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Phase 9a |

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

## Migration history on live prod (fyx), checked 3 Nov 2026
`fyxyajsugvhjgukzhlkc` was created from a schema dump on 25 Oct 2026. Its `supabase_migrations.schema_migrations` table holds only `rehearsal_schema_pre` and `rehearsal_schema_post`, but the objects from 00001–00068 are present. **Do not run `supabase db push` against fyx**, because it would try to replay every migration. Apply new migrations one at a time (for example 00069 through the Supabase MCP `apply_migration`), and only after the founder says go.
