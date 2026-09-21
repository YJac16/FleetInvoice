# Second user / multi-org onboarding

This document describes how a second real operator can use WorkOps without sharing the founder’s organisation, domain, or invoice letterhead.

## Auth

| Item | Status |
| --- | --- |
| Public sign-up UI at `/signup` | **VERIFIED** (this change) |
| Supabase Auth email/password | **VERIFIED** — same project as production (`tggxnvombexvxblsntsm`) |
| Email confirmation required | **UNKNOWN** — depends on Supabase Auth settings. If enabled, users must confirm before onboarding. |
| Sign-up must be enabled in Supabase | **INFERRED blocker** — Dashboard → Authentication → Providers → Email → “Enable sign ups” |

Login remains at `/login`. Invite accept flow at `/invite/[token]` is unchanged.

## Organisations & memberships

| Item | Status |
| --- | --- |
| Tables `organisations`, `organisation_members`, `profiles` | **VERIFIED** (migrations) |
| Founder org “Yaseen Org” slug `fleet` | **VERIFIED** (user / demo scripts) |
| Cape Shuttle Ops `cape-shuttle-ops` | **VERIFIED** (demo script) |
| Self-serve create when user has **no** active membership | **VERIFIED** — RPC `create_own_organisation` (migration `00028`) |
| Users with an existing membership cannot create another org via RPC | **VERIFIED** — RPC raises error; use invite or platform owner tools |

After sign-up, users without a membership are sent to `/onboarding/create-organisation` (replacing the old `/awaiting-invite` dead-end).

## Roles (simple mapping)

App roles are defined in `lib/constants.ts`. There is no separate `OWNER` / `ADMIN` / `USER` enum.

| WorkOps role | Treat as |
| --- | --- |
| `organisation_admin` | Owner / admin for the tenant |
| `manager`, `dispatcher`, `supervisor` | Ops staff |
| `company_manager` | Client company portal |
| `driver`, `employee` | Field / staff portals |
| `platform_owner` | Cross-tenant ops (founder) |

Self-serve sign-up assigns **`organisation_admin`** on the new org.

## RLS & data isolation

| Area | Status |
| --- | --- |
| Org-scoped SELECT via `user_organisation_ids()` on drivers, vehicles, companies, invoices, etc. | **VERIFIED** (foundation + phase migrations) |
| Invoice lines: SELECT only; writes via SECURITY DEFINER RPCs | **VERIFIED** (`tests/rls/phase5_checks.sql`) |
| Invoices: SELECT/UPDATE policies; no direct INSERT for authenticated | **VERIFIED** |
| `organisations` UPDATE for `organisation_admin` on own org | **VERIFIED** — migration `00028` |
| `organisations` INSERT still platform-owner only (direct) | **VERIFIED** — self-serve uses RPC |
| Service-role bypass | **INFERRED** — server scripts/cron use service role; not exposed to browser |

### Manual isolation test (demo data only)

Use two browsers or normal + incognito:

1. **User A** — founder account → Yaseen Org / Fleet: list invoices, open PDF, waybill → invoice path.
2. **User B** — new sign-up → create “Demo Org B” with demo business/banking details (no real PII).
3. User B adds a driver, vehicle, client company, trip, generates invoice/PDF.
4. Confirm User B PDF shows **Demo Org B** settings only.
5. Log out B, log in A — confirm Fleet data unchanged.
6. While logged in as B, paste a Fleet invoice URL or UUID — expect empty/forbidden, not Fleet rows.
7. Repeat with org switcher if User A is platform owner (should not leak B’s data into Fleet context).

Do **not** send real invite emails in automated tests without approval; copy invite URL from the UI when testing invites.

## Invoice PDF & settings

- Letterhead is read from **active organisation** `settings.invoice` / `settings.invoice_print` via `parseInvoicePrintSettings`.
- Global founder banking/contact defaults were **removed** from code so new orgs never inherit Yaseen Jacobs details.
- Founder org keeps working when those fields remain stored in **Yaseen Org’s** JSON settings.

## Email

- `RESEND_FROM_EMAIL` and `NEXT_PUBLIC_APP_URL` are env-based (**VERIFIED** in `.env.example`).
- No hardcoded founder email in new sign-up or onboarding paths.

## Migrations

Apply on Supabase (SQL editor or CLI):

```text
supabase/migrations/00028_second_user_org_bootstrap.sql
```

Idempotent: safe to re-run. **Does not delete or reset data.**

Creates:

- `create_own_organisation(name, slug, settings)` → new org + `organisation_admin` membership
- `organisations_update` policy for org admins

Duplicate copy: `database/migrations/00028_second_user_org_bootstrap.sql`.

## Env vars

See `.env.example`. Minimum for second-user testing:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (must include production URL in Supabase Auth redirect allow list)

Optional: `RESEND_*` for email; invites still work via copied URL without Resend.

## Backup notes

Before applying `00028` in production: take a Supabase backup or point-in-time snapshot if available. Migration only adds function + policy; no data migration.

## SaaS learning points

- Invite-only onboarding blocks self-serve tenants; RPC + onboarding UI fixes the chicken-and-egg (org insert vs membership).
- PDF defaults in application code become cross-tenant data leaks — keep defaults empty; store per-org in JSON.
- RLS on `organisations` UPDATE was platform-owner-only; org admins need UPDATE for Settings.

## Remaining limitations

- One self-serve org per user (no membership yet). Additional orgs: platform owner or future “add org” product work.
- Stripe / subscription UI unchanged.
- No custom domain or email product purchase in this phase.
- Email sign-up must be toggled in Supabase by project admin.

## Next three steps

1. Founder applies migration `00028` and confirms Auth sign-ups enabled + redirect URLs include `https://workops-mu.vercel.app`.
2. Run the manual two-user isolation checklist above on production with demo org names.
3. Optional: add Playwright `@smoke` covering sign-up → onboarding → dashboard (mock Supabase or staging project).
