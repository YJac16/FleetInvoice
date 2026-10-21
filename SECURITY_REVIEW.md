# Security review — WorkOps

Review date: 2026-09-30. This report covers what was verified in this pass. It is not a claim that the application is free of vulnerabilities.

## Executive Summary

The application already had substantial controls: invite-only auth, RLS on tenant tables, service-role-only audit and compliance RPCs, signed Stripe webhooks, and bearer-protected cron routes. The audit still found one critical privilege-escalation path and several high-severity data and billing gaps. Those were confirmed in the current SQL and route code and fixed in this change set.

The critical issue was that any signed-in user could set `profiles.is_platform_owner` through the Supabase API, because the profile update policy allowed the whole row. The high issues were a cross-tenant compliance document read on the scan API, invoice lines readable by drivers and employees, direct invoice updates that skip payment-status rules, and Stripe customer identifiers readable by every organisation member.

Medium issues that were also fixed: invoice emails trusted a caller-supplied link (including `javascript:` URLs), any member could forge privileged audit events, and the `platform_owner` membership role could be assigned without the profile flag.

Next.js was upgraded from 15.5.20 to 15.5.26 to pick up patched framework advisories, including unauthenticated image-optimization and server-action issues. Remaining dependency highs are transitive or require a Next.js 16 major upgrade and were left in place.

Migration `supabase/migrations/00056_security_privilege_and_billing.sql` was not executed against a live Postgres instance in this environment. The statements were reviewed and asserted by unit test. They still need to be applied to each Supabase project before the database fixes are in effect.

## Vulnerabilities Found

| Severity | Vulnerability | Status |
| -------- | ------------- | ------ |
| Critical | Self-grant of `profiles.is_platform_owner` | Fixed in migration 00056 (must be applied) |
| High | Compliance scan reads another organisation’s retained document | Fixed in application code |
| High | Drivers and employees can read `invoice_lines` | Fixed in migration 00056 (must be applied) |
| High | Direct `invoices` update bypasses payment status rules | Fixed in migration 00056 (must be applied) |
| High | Stripe customer and subscription ids readable by every member | Fixed in migration 00056 (must be applied) |
| Medium | Invoice email accepts a caller-supplied `printUrl` | Fixed |
| Medium | Any member can write privileged client audit events | Fixed |
| Medium | `platform_owner` can be assigned as an organisation role | Fixed in migration 00056 (must be applied) |
| Low | GPS, cron, and Stripe signature errors return internal messages | Accepted |
| Low | Invitation token in the URL path | Accepted |
| Info | Security headers are not configured | Accepted |
| Info | Next.js 15.5.20 framework advisories | Fixed by upgrade to 15.5.26 |
| Info | Remaining `npm audit` highs (postcss via Next 16, sharp, and transitive packages) | Accepted |

## Changes Made

- `supabase/migrations/00056_security_privilege_and_billing.sql`
  - Trigger blocks changes to `is_platform_owner` unless the caller is already a platform owner, the service role, or a non-JWT database session (so the first owner can still be bootstrapped from the SQL editor).
  - `authenticated` / `anon` lose table-level `UPDATE` on `profiles`. `authenticated` may update only `full_name`, `phone`, and `avatar_url`.
  - Trigger rejects `platform_owner` on `organisation_members` and `invitations` when the JWT role is `authenticated` or `anon`.
  - `invoice_lines_select` matches the invoice reader rules from migration 00030, including the driver and employee exclusion.
  - `invoices_update` is dropped. Status and totals stay on the existing security-definer RPCs.
  - `subscriptions_select` is limited to platform owners and organisation admins.
- `app/api/compliance/scan/route.ts` — retained scans load a document only when its organisation and driver or vehicle match the subject.
- `app/api/audit/log/route.ts` — client audit writes require an ops membership role or a platform-owner profile.
- `app/api/invoices/send/route.ts`, `lib/notifications/invoice-print-link.ts`, `services/invoice-email.service.ts`, `features/invoices/components/invoice-delivery-panel.tsx` — print links are built from `NEXT_PUBLIC_APP_URL` and a fixed invoice path. Client URLs are ignored.
- `package.json` / `package-lock.json` — `next` and `eslint-config-next` set to 15.5.26.
- `SECURITY_AUDIT.md` — findings from the read-only audit.
- Tests listed below.

No secrets were added. No production data was modified.

## Tests Performed

Automated:

- `npx vitest run` — 290 passed, 1 skipped (`tests/unit/rls-isolation-runner.test.ts`, which skips when the local RLS database is absent). Re-run after the Next.js upgrade with the same result.
- `npx next build` — compiled, linted, and typechecked successfully on Next.js 15.5.26.

Security tests added:

- `tests/unit/compliance-scan-tenant-binding.test.ts` — a document id from another organisation is not downloaded; a matching org and driver is downloaded; unauthenticated scan returns 401.
- `tests/unit/audit-log-route.test.ts` — a driver cannot write `organisation.deleted`; a platform owner can still write an allowed event; existing unauthenticated, cross-org, allowlist, and actor-spoof cases still pass.
- `tests/unit/invoice-send-print-url.test.ts` — a `javascript:` `printUrl` is ignored and the email uses the app origin; company portal path is used when requested; unauthenticated and unauthorized senders are rejected.
- `tests/unit/migration-00056-security.test.ts` — the migration text contains the platform-owner guard, role rejection, invoice policy changes, and subscription select restriction.

Browser and API (local `next start` on port 3000, no Supabase credentials):

- `/login` rendered the sign-in form (email, password, forgot-password link) and the “Supabase is not configured” alert.
- Submitting the login form with `?redirect=https://evil.example` stayed on `/login` and did not leave the origin.
- `/forgot-password` rendered the reset form and a link back to sign-in.
- `/dashboard` returned 503. Middleware fails closed in production when Supabase is not configured.
- Unauthenticated `POST /api/audit/log`, `/api/compliance/scan`, and `/api/invoices/send` returned 503 from that same middleware gate.
- `POST /api/cron/notifications` without a bearer token returned 401 `Unauthorized`.
- `POST /api/webhooks/stripe` without configuration returned 503 `Stripe webhook not configured` and did not accept the body as a paid event.

Not executed here:

- Logged-in flows (dashboard, admin, bookings, file view, role changes). There is no configured Supabase project in this environment.
- Applying migration 00056 to Postgres and re-running the RLS harness (`npm run test:rls` and related scripts).
- A real or test Stripe checkout. No payment was made.
- End-to-end Playwright suite (`npm run test:e2e`).

## Remaining Risks

- Database fixes do nothing until `00056_security_privilege_and_billing.sql` is applied to the Supabase project that serves production. Until then, the profile flag, invoice policies, subscription select, and membership role trigger are unchanged in that database.
- The profile trigger allows a non-JWT database session to set `is_platform_owner`. That is required to bootstrap the first platform owner. Anyone who can run SQL as the table owner can still grant the flag. That is the intended break-glass path.
- An existing platform owner can still set the flag on another profile. That matches the current admin model.
- Direct invoice updates are removed. Invoice changes must go through the RPCs. No application caller updates `invoices` with the user client today. A future client update of notes or similar columns will be rejected until a dedicated RPC exists.
- Low findings (verbose GPS and webhook errors, invite tokens in URLs) are unchanged.
- Security headers are still absent. They were not added without a configured browser pass against Mapbox, Stripe, and Supabase.
- `npm audit` still reports high issues in transitive packages. `postcss` is only cleared by a Next.js 16 upgrade in the advisory metadata. `sharp` and several other highs were not force-upgraded.
- RLS for the rest of the schema was reviewed against migrations, not by connecting as two tenants in a running database during this pass. Existing RLS scripts in `tests/rls` were not run.
- Compliance scan still consumes the caller’s scan quota before the document lookup. A mismatched document returns 404 and does not download bytes. Quota consumption on a miss is pre-existing.

## Production Readiness

- Critical vulnerabilities remaining in this change set: 0 in code. 1 remains in any database that has not applied migration 00056.
- High vulnerabilities remaining in this change set: 0 in application code. 3 remain in any database that has not applied migration 00056 (invoice lines, invoice update, subscription select). The compliance scan high is fixed in the application and does not depend on the migration.
- Medium vulnerabilities remaining: 0 in this change set once 00056 is applied. The membership-role medium depends on that migration. The email link and audit-role mediums are fixed in application code.
- Important unresolved risks: migration 00056 is not applied here; security headers are unset; some transitive dependency highs remain; authenticated multi-tenant behavior was not exercised against a live database.

SECURITY VERDICT:
REQUIRES CHANGES

The code changes are ready for independent review. Production is not ready until migration 00056 is applied and the database policies are re-checked in that environment. Do not treat this review as a guarantee that the system is secure.
