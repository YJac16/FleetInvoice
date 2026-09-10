# Notification outbox cron

WorkOps queues invite and ops emails in `notification_outbox`. A worker must drain pending rows.

## Endpoint

```http
POST /api/notifications/process
Authorization: Bearer <NOTIFICATIONS_PROCESS_SECRET>
```

Implemented in [`app/api/notifications/process/route.ts`](../../app/api/notifications/process/route.ts).

Requires on the **server**:

- `SUPABASE_SERVICE_ROLE_KEY` — otherwise the route returns `503`
- `NOTIFICATIONS_PROCESS_SECRET` or `CRON_SECRET`
- `MAILERSEND_API_KEY` (+ verified `MAILERSEND_FROM_EMAIL`) to actually send; without MailerSend, rows are marked `skipped`

## Local / manual drain

With `npm run dev` running:

```bash
npm run notifications:drain
# or
npm run notifications:drain -- http://localhost:3000
```

## Production schedule

Call every **1–5 minutes**:

| Host | Suggestion |
|------|------------|
| Vercel | Cron Job → `POST /api/notifications/process` with `Authorization: Bearer $CRON_SECRET` (set `CRON_SECRET` = same value as process secret) |
| External | curl / GitHub Action / uptime cron hitting your production URL |

Example curl:

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/notifications/process" \
  -H "Authorization: Bearer $NOTIFICATIONS_PROCESS_SECRET"
```

## Auth URLs (production)

In Supabase → **Authentication → URL configuration**:

| Setting | Local | Production |
|---------|-------|------------|
| Site URL | `http://localhost:3000` | `https://your-domain.com` |
| Redirect URLs | `http://localhost:3000/auth/callback` | `https://your-domain.com/auth/callback` (+ keep localhost for dev) |

Also set `NEXT_PUBLIC_APP_URL` to the production origin so invite links are correct.

## Verify

1. `npm run env:check`
2. Create an invitation in the app
3. `npm run notifications:drain` and confirm MailerSend delivery or `skipped` status in `notification_outbox`
