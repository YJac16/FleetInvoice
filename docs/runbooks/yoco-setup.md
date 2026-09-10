# Yoco setup (when account is ready)

WorkOps membership checkout uses Yoco. **MailerSend and Mapbox can go live without Yoco** — platform owners can assign plans manually at `/subscriptions` until checkout is configured.

## Prerequisites

1. [Yoco business account](https://www.yoco.com/)
2. Checkout API enabled in the Yoco app (e‑Commerce integrations → Checkout API)
3. Domain verified in Yoco for `workops-mu.vercel.app` (or your custom domain)

## 1. Keys (Vercel → workops → Environment Variables)

| Variable | Source |
|----------|--------|
| `YOCO_SECRET_KEY` | Yoco app → Checkout API → test/live secret key |
| `NEXT_PUBLIC_YOCO_PUBLIC_KEY` | Yoco app → public key (optional for future client-side use) |
| `YOCO_WEBHOOK_SECRET` | Shown **once** when you register the webhook (starts with `whsec_`) |

Start with **test keys** while building; swap to live keys after domain verification.

## 2. Webhook

Register in Yoco (or via API):

- **URL:** `https://workops-mu.vercel.app/api/webhooks/yoco`
- **Events:** payment / checkout success (as offered in Yoco dashboard)

Copy the webhook secret immediately into Vercel as `YOCO_WEBHOOK_SECRET`. Yoco does not show it again.

## 3. Verify

1. Redeploy production after setting env vars
2. As platform owner, open `/subscriptions` → **Pay with Yoco** on a plan with a monthly price
3. Complete a test payment
4. Confirm `subscriptions.status` becomes `active` for the organisation

## Without Yoco

- Invite emails still send (MailerSend)
- Dispatch map still works (Mapbox)
- Plan changes: use **Assign** on `/subscriptions` (platform owner only)
- Checkout buttons stay hidden until `YOCO_SECRET_KEY` is set

See also [`retail-go-live.md`](./retail-go-live.md) and [Yoco Checkout API help](https://support.yoco.help/en/articles/739322-yoco-checkout-api).
