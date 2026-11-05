# Security audit — WorkOps

Audit date: 2026-09-30. Scope: application source, API routes, and SQL migrations under `supabase/migrations` (effective policies are the latest migration that creates each policy). Findings below were checked against the code. Items that were reviewed and are not vulnerabilities are listed at the end.

No secret values are included.

## Verified vulnerabilities

### [CRITICAL] Any authenticated user can grant themselves platform owner

**Location:**
`supabase/migrations/00055_advisor_cleanup.sql` — policy `profiles_update` on `public.profiles` (same rule introduced in `supabase/migrations/00001_workops_foundation.sql`). Column `profiles.is_platform_owner`. No later migration adds a trigger or column privilege that blocks the flag.

**Vulnerability:**
Row Level Security lets a user update their own profile row, and the policy does not restrict columns. `is_platform_owner` is an ordinary boolean on that row. The browser only sends `full_name`, `phone`, and `avatar_url` from `services/profile.service.ts`, but the anon key is public and PostgREST accepts any column the policy allows. There is no `BEFORE UPDATE` guard.

**Attack scenario:**
A signed-in driver, employee, or organisation admin calls the Supabase REST API (or the JS client) with their session:

`PATCH /rest/v1/profiles?id=eq.<their user id>` body `{ "is_platform_owner": true }`.

`public.is_platform_owner()` then returns true for that user. Policies and RPCs that trust this flag (organisations, subscriptions, invoices, invitations, cross-organisation reads) treat them as the platform owner.

**Impact:**
Full platform privilege: every organisation’s data the platform-owner policies expose, organisation create/delete, subscription writes, and billing administration. This is cross-tenant privilege escalation.

**Evidence:**
`profiles_update` is `using (id = (select auth.uid()) or public.is_platform_owner())` with the same expression in `with check`. `is_platform_owner()` reads `profiles.is_platform_owner` for `auth.uid()`. No trigger in migrations 00001–00055 compares OLD and NEW for that column.

**Recommended fix:**
Reject changes to `is_platform_owner` unless the caller is already a platform owner, the service role, or a non-JWT database session (SQL editor / migrations used to bootstrap the first owner). Also revoke table-level `UPDATE` from `anon` and `authenticated` and grant `UPDATE` only on `full_name`, `phone`, and `avatar_url`.

**Confidence:**
High

---

### [HIGH] Compliance scan reads another organisation’s retained documents

**Location:**
`app/api/compliance/scan/route.ts` — `POST`, `loadRetainedDocumentBytes`.

**Vulnerability:**
The caller must be an active fleet operator (`organisation_admin`, `manager`, `dispatcher`, or `supervisor`) in the organisation that owns `subject_id`. Retained scans then load bytes with the service-role client by `document_id` only. `organisation_id` and the driver or vehicle id are not compared to the document row. Service role bypasses RLS.

**Attack scenario:**
An operator in organisation A learns a `driver_documents` or `vehicle_documents` id from organisation B (support export, log, shared link, or other leak). They `POST /api/compliance/scan` with `storage_mode: "retained"`, `subject_id` set to a driver or vehicle in A, and `document_id` set to B’s document. The route downloads B’s object from the private `vehicle-docs` bucket and returns OCR field suggestions (licence details, expiry, registration data).

**Impact:**
Cross-tenant disclosure of compliance document contents and extracted identity or vehicle data. The document view route is RLS-scoped; this scan path is not.

**Evidence:**
`loadRetainedDocumentBytes` selects `driver_documents` and `vehicle_documents` with `.eq("id", documentId)` and `.is("deleted_at", null)` only. `loadTempScanBytes` does compare `organisation_id`. `scanAuthorised` only checks membership in the subject’s organisation.

**Recommended fix:**
Load a retained document only when `organisation_id` matches the resolved subject organisation and `driver_id` or `vehicle_id` matches `subject_id`, depending on subject kind. Return not found otherwise, and do not download the object.

**Confidence:**
High

---

### [HIGH] Drivers and employees can read invoice line items

**Location:**
`supabase/migrations/00029_invoice_lines_company_scope.sql` — policy `invoice_lines_select`. Parent invoices were narrowed in `supabase/migrations/00030_invoices_exclude_driver_employee.sql`. `has_company_scope` in `supabase/migrations/00002_phase0_hardening.sql`.

**Vulnerability:**
`invoices_select` denies `driver` and `employee`. `invoice_lines_select` was not updated. It allows the row when `has_company_scope(organisation_id, company_id)` is true. That function returns true for every active member whose role is not `company_manager`, including drivers and employees, even when they have no company scope rows.

**Attack scenario:**
A driver or employee uses the public anon key and their session to `GET /rest/v1/invoice_lines?organisation_id=eq.<their org>`. Invoice headers are denied; line descriptions, quantities, unit prices, and amounts are returned.

**Impact:**
Same-organisation disclosure of customer billing detail to roles that were explicitly excluded from invoices. Not cross-tenant.

**Evidence:**
`00030` adds `not public.has_org_role_names(..., array['driver','employee'])` on invoices. `00029` has no equivalent predicate, and no later migration replaces `invoice_lines_select`. The final branch of `has_company_scope` matches any non-`company_manager` member.

**Recommended fix:**
Align `invoice_lines_select` with `invoices_select` from migration 00030, including the driver and employee exclusion.

**Confidence:**
High

---

### [HIGH] Direct invoice updates bypass payment status rules

**Location:**
`supabase/migrations/00007_phase5_fuel_and_invoices.sql` — policy `invoices_update`. Status rules live in `public.set_invoice_status` (`supabase/migrations/00011_phase8_billing.sql`). The application writes status through that RPC (`services/invoices.service.ts`). No client `.update()` on `invoices` exists.

**Vulnerability:**
`invoices_update` lets `organisation_admin`, `manager`, and `dispatcher` update any column on an invoice in their organisation, including `status`, `subtotal`, `total`, `paid_at`, `organisation_id`, and `company_id`. `set_invoice_status` rejects void transitions, reverting a paid invoice, and marking a draft paid. The table policy does not. There is no `INSERT` or `DELETE` policy; those writes already go through security-definer RPCs, which bypass RLS. A dropped `UPDATE` policy does not block those RPCs.

**Attack scenario:**
A dispatcher calls PostgREST `PATCH /rest/v1/invoices?id=eq.<invoice id>` with `{ "status": "paid", "total": 0 }` or changes a paid invoice back to `draft`. The state machine in `set_invoice_status` never runs.

**Impact:**
Payment status and billed totals can be forged or reversed inside the organisation by roles that are allowed to manage invoices in the UI, but without the server-side transition checks. Customer billing records and paid state are no longer trustworthy.

**Evidence:**
`invoices_update` `using` / `with check` only tests platform owner or `has_org_role_names` for organisation admin, manager, and dispatcher. `set_invoice_status` raises if status is `void`, if a paid invoice changes to something else, or if a non-issued invoice is marked paid. No migration drops `invoices_update`.

**Recommended fix:**
Drop `invoices_update` so invoice mutations stay on the existing security-definer RPCs (`set_invoice_status`, invoice generation, draft line edits and their total recalculation).

**Confidence:**
High

---

### [HIGH] Stripe customer and subscription ids are readable by every member

**Location:**
`supabase/migrations/00013_phase9_subscriptions.sql` — policy `subscriptions_select` on `public.subscriptions` (`stripe_customer_id`, `stripe_subscription_id`).

**Vulnerability:**
Any active member of an organisation, including drivers and employees, can select that organisation’s subscription row. Writes are already limited to platform owners (`subscriptions_write`). The subscriptions UI is limited to organisation admins and platform owners (`subscriptions:view`), but the database policy is not.

**Attack scenario:**
A driver selects `subscriptions` for their `organisation_id` through the Supabase client and reads `stripe_customer_id` and `stripe_subscription_id`.

**Impact:**
Payment-account identifiers for the organisation are exposed beyond billing administrators. The Stripe secret key is not in this response. The ids are still sensitive billing data and should not be readable by the whole workforce. Entitlements already use `org_entitled_modules`, which does not need this client select.

**Evidence:**
`subscriptions_select` is `is_platform_owner() or organisation_id in (select user_organisation_ids())`. No later migration replaces it. `getOrganisationSubscription` in `services/subscriptions.service.ts` is the only user-scoped reader, and it is used from the subscriptions screen.

**Recommended fix:**
Limit `subscriptions_select` to platform owners and organisation admins of that organisation. Service-role billing routes keep working because they bypass RLS.

**Confidence:**
High

---

### [MEDIUM] Invoice email accepts a caller-supplied link

**Location:**
`app/api/invoices/send/route.ts` — `printUrl: z.string().url()`. Rendered in `lib/notifications/invoice-email.ts` as `<a href="${escapeHtml(input.printUrl)}">`.

**Vulnerability:**
`escapeHtml` encodes quotes and angle brackets. It does not restrict the URL scheme. Zod’s `z.string().url()` accepts `javascript:` and `data:` URLs (verified with Zod 4 in this repo). A user who may send invoice email can put that URL in the message the server sends through Resend. The UI sends `window.location.href`; the API does not require that value.

**Attack scenario:**
An organisation admin, manager, dispatcher, or scoped company manager calls `POST /api/invoices/send` with `printUrl` set to a `javascript:` or `data:` URL, or to an off-site `https://` page. Recipients who follow “View and print invoice” leave the application. Clients that still honor `javascript:` links in HTML mail can run script in the message context.

**Impact:**
Phishing and HTML-mail script injection from a trusted invoice sender, aimed at customer billing contacts. Invoice field text in the same template is escaped and is not the issue.

**Recommended fix:**
Ignore client URLs. Build the print link on the server from `NEXT_PUBLIC_APP_URL` and a fixed path for the invoice (`/invoices/{id}/print` or `/company/invoices/{id}/print`).

**Confidence:**
High

---

### [MEDIUM] Any member can write privileged audit events

**Location:**
`app/api/audit/log/route.ts` — `POST`. Allowlist in `lib/audit/client-audit-allowlist.ts`.

**Vulnerability:**
The route requires an authenticated user and any active membership in `organisationId`. It does not check role. The allowlist includes `organisation.deleted`, `member.role_updated`, `member.suspended`, and `invitation.created`. `write_audit_log` stores the session user as `actor_id` and does not perform those business actions. The log entry is still false.

**Attack scenario:**
A driver in the organisation posts `{ "action": "organisation.deleted", "entityType": "organisation", "entityId": "<org>" }`. The audit log records that the driver deleted the organisation.

**Impact:**
Audit integrity. Investigations and compliance reviews can be misled. This is not privilege escalation: the RPC cannot change membership or delete the organisation, and `p_actor` cannot be overridden from the body (strict schema; covered by `tests/unit/audit-log-route.test.ts`).

**Evidence:**
Membership lookup selects `id` and checks `status = active` only. `CLIENT_AUDIT_ENTITY_BY_ACTION` lists the admin actions above. Call sites that legitimately write these events are organisation admins, managers, dispatchers, supervisors, and platform owners (`services/users.service.ts`, `services/employees.service.ts`, `services/organisations.service.ts`, `services/vehicle-documents.service.ts`).

**Recommended fix:**
Require an active membership whose role is `organisation_admin`, `manager`, `dispatcher`, or `supervisor`, or a profile with `is_platform_owner`. Keep the allowlist and the session actor.

**Confidence:**
High

---

### [MEDIUM] Organisation role `platform_owner` can be assigned without the profile flag

**Location:**
`public.create_invitation` in `supabase/migrations/00001_workops_foundation.sql`. `organisation_members_update` in the same file allows an organisation admin to set `role`. `lib/auth/require-permission.ts` treats `activeRole === "platform_owner"` as access to the operations dashboard. `lib/permissions/index.ts` grants platform permissions when the membership role is `platform_owner`, even if `isPlatformOwner` is false.

**Vulnerability:**
`app_role` includes `platform_owner`, but real platform power is `profiles.is_platform_owner`. `create_invitation` accepts any `app_role`. An organisation admin can invite or update a member to `platform_owner`. Server RLS for organisations and subscriptions still checks the profile flag, so this is not full platform takeover. The app shell and client permission checks do trust the membership role.

**Attack scenario:**
An organisation admin updates their membership with `{ "role": "platform_owner" }` or invites another user with that role. After refresh, `requireRole(..., "platform_owner")` lets them into the operations dashboard on the strength of the membership role, and client `hasPermission` shows platform management actions. Those writes still fail RLS unless the profile flag is set.

**Impact:**
Client-side authorization confusion and a footgun for any future server check that uses `organisation_members.role` instead of `profiles.is_platform_owner`. UI-only today for true platform data.

**Evidence:**
`INVITABLE_ROLES` in `lib/constants.ts` excludes `platform_owner`, but that list is not enforced in SQL. `create_invitation` inserts `p_role` after checking only that the caller is a platform owner or organisation admin. No trigger rejects the enum value.

**Recommended fix:**
Reject `platform_owner` as an organisation membership or invitation role when the request JWT role is `authenticated` or `anon`. Bootstrap SQL without a JWT can still repair rows.

**Confidence:**
High

---

## Reviewed and not reported as vulnerabilities

- Cron and notification routes require a bearer secret compared with `timingSafeEqual`. Missing secrets fail closed (`lib/auth/cron-bearer.ts`).
- Stripe webhooks use `constructEvent` on the raw body before any subscription write (`app/api/webhooks/stripe/route.ts`). Checkout prices come from `plans.stripe_price_id`, not from the client (`app/api/billing/checkout/route.ts`).
- Login and auth callback redirects go through `sanitizeAppRedirectPath`.
- No `dangerouslySetInnerHTML` or markdown HTML renderer in application code. Invoice email fields other than the print link are escaped.
- Compliance document view loads metadata with the user-scoped client before signing a URL (`app/api/compliance/documents/[id]/view/route.ts`).
- `write_audit_log` execute is limited to `service_role` (`00048`, `00052`). The audit route passes the session user as `p_actor`.
- Service role and Stripe secrets are server environment variables, not `NEXT_PUBLIC_` keys (`lib/env.ts`). `lib/supabase/admin.ts` is not imported from client components. No live API keys or service-role JWTs are tracked. Git history does not add `sk_live_` / `sk_test_` material. `.env.example` is placeholders only.
- GPS ingest calls `ingest_gps_points` as the user, so RLS and the RPC apply. Returning `error.message` is low-sensitivity information disclosure and is not fixed in this pass.
- Cookie session model is SameSite lax via Supabase SSR defaults. No `SameSite=None` cookie is set by the app. No concrete cross-site state change was identified.
- Security response headers (CSP, HSTS, frame options, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy) are not set in `next.config.ts`. No application XSS was found that depends on CSP. Classified as informational only; headers were not added in this pass because a strict CSP can break Mapbox, Stripe, and Supabase without a browser pass against a configured environment.

## Informational

### [INFO] Security headers are not configured

**Location:** `next.config.ts`

**Vulnerability:** Responses do not set Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, frame ancestors, or Permissions-Policy.

**Attack scenario:** A future XSS or clickjacking bug would have less browser containment.

**Impact:** Defense in depth only, given the current rendering paths.

**Evidence:** `nextConfig` exports only a Turbopack root.

**Recommended fix:** Add headers after a browser pass on login, maps, billing redirects, and document downloads. Not applied in this change set.

**Confidence:** High

### [LOW] Database and webhook errors are returned to clients

**Location:** `app/api/gps/ingest/route.ts` (`error.message`); `app/api/webhooks/stripe/route.ts` (signature exception message); some cron routes.

**Vulnerability:** Internal constraint or SDK text can be returned to the caller.

**Attack scenario:** An authenticated user probes GPS ingest and reads Postgres wording. A caller with a bad Stripe signature sees the SDK’s validation message.

**Impact:** Limited reconnaissance. No secret material is intentionally included.

**Evidence:** Those handlers pass `error.message` or `err.message` into JSON.

**Recommended fix:** Return a stable error code. Not applied in this change set (low severity).

**Confidence:** High

### [LOW] Invitation tokens are path segments

**Location:** `app/invite/[token]/page.tsx`, `services/auth.service.ts`

**Vulnerability:** The invite token is in the URL, so it can appear in browser history, Referer, and logs.

**Attack scenario:** Someone with access to those channels opens the invite.

**Impact:** Account join for that invitation only. Tokens are random UUIDs. Acceptance still requires the invited email (`accept_invitation`).

**Evidence:** Invite URL is `${NEXT_PUBLIC_APP_URL}/invite/${row.token}`.

**Recommended fix:** Prefer a one-time token that is not logged, or a fragment. Not changed here; it would break the current email and copy-link flow.

**Confidence:** High
