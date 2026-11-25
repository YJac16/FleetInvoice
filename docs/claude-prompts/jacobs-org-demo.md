Use **Opus 5.5** (`opusplan`) for planning and implementation.

Work in `/workspace/FleetInvoice` on a **new branch created from `origin/demo` (`684016e`)**, e.g. `feat/jacobs-org-demo-rehearsal`, and open a **draft PR targeting `demo`** (NEVER `main`).

**Hard safety rules:**
- NEVER touch `main`, live Supabase `fyxyajsugvhjgukzhlkc`, `tggxnvombexvxblsntsm`, or the KhayrCape DB.
- Do NOT apply any migrations to remote `goops-demo` (`afeeqbcwwpquqjeowksa`) — Engineering will apply and verify after your PR passes local tests.
- All seeded orgs, users, companies, drivers, vehicles, and bank details must be **100% fake** (`@example.com`, `DEMO-*` plates/accounts). Never copy real data or real account numbers into code, seeds, or tests.
- Leave `Cape Shuttle Ops` (`a1000000-0000-4000-8000-000000000001`) completely untouched.
- Migration numbering on `demo` currently ends at `00087_fix_weekly_fuel_invoice_ambiguity.sql`. Continue sequentially from **`00088`**.
- All tests (unit + local Postgres DB tests via `scripts/local-db/bootstrap-native.sh`) must pass before pushing.

---

### Goal
Implement the full **Jacobs Org** copy-and-verify rehearsal + multi-owner features + per-owner invoice print + user audit + owner-split reports on `demo`, ready for Product QA (`gates A–I` in `/workspace/bot-office/product/goops-jacobs-org-qa-plan-2026-11-25.md`) and matching `/workspace/bot-office/eng/jacobs-demo-monday-run-expected.md` line for line.

---

### 1. Migration `00088_owner_and_audit_columns.sql` (+ `supabase/rollback-00088.sql`)
1. **Owner dimension on fleet master data:**
   - Add `owner_tag text check (owner_tag is null or owner_tag in ('yaseen', 'fadia'))` to `public.drivers` and `public.vehicles`.
   - Also add `owner_tag text check (owner_tag is null or owner_tag in ('yaseen', 'fadia'))` to `public.invoices` (nullable; used when `driver_id is null` or as explicit override, while driver-week invoices default to `drivers.owner_tag`).
   - Update `save_driver_capture` and `save_vehicle_capture` (`00046` / `00069`) to persist `owner_tag` (`nullif(p_fields->>'owner_tag', '')`) and validate it against `('yaseen', 'fadia')`.
2. **User audit (`created_by` / `updated_by`):**
   - `trips`, `drivers`, `vehicles`, `rate_cards`, `route_prices`, `workshop_bills` already have `created_by`; `invoices` has `generated_by`.
   - Add `updated_by uuid references auth.users (id) on delete set null` to `public.trips`, `public.drivers`, `public.vehicles`, `public.invoices`, `public.rate_cards`, `public.route_prices`, `public.workshop_bills`.
   - Add `set_audit_user()` trigger function (`BEFORE INSERT OR UPDATE`) attached to those tables:
     - When `coalesce(current_setting('app.preserve_audit_actor', true), '') = 'true'` (used ONLY during org-copy migration), leave `NEW.created_by`, `NEW.generated_by`, and `NEW.updated_by` untouched.
     - Otherwise on `INSERT`: set `created_by := coalesce(NEW.created_by, auth.uid())` (or `generated_by` on `invoices`), and `updated_by := coalesce(auth.uid(), NEW.updated_by, NEW.created_by)`.
     - On `UPDATE`: set `NEW.updated_by := coalesce(auth.uid(), NEW.updated_by)`.
   - Ensure `assign_staff_trip`, `backfill_staff_waybill`, `submit_driver_trip`, `approve_driver_trip`, and `update_staff_trip` keep `created_by` accurate (`auth.uid()`) and never let drivers pick a `vehicle_id` on self-submission (`00062`/`00065` rule preserved).
   - **CRITICAL:** Add `owner_tag` (on `drivers`/`vehicles`/`invoices`) and `updated_by` to `lib/trip-columns.ts` (`TRIP_COLUMNS`) — NEVER add `manual_unit_price` or `manual_price_area_key` (00079 revoked column SELECT!).
3. **Actor name resolution under `profiles` RLS:**
   - Remember `profiles_select` only allows `is_platform_owner()` or `id = auth.uid()`, so non-platform-owner admins (e.g. Demo Faadiah) cannot `select` other users' `profiles` directly.
   - Add a `SECURITY DEFINER` RPC `list_org_actor_names(p_organisation_id uuid)` (or extend existing `hydrateMemberProfiles` pattern in `services/users.service.ts`) restricted to `is_platform_owner()` or `has_org_role_names(p_organisation_id, array['organisation_admin', 'manager', 'dispatcher', 'supervisor'])` (NEVER `driver`, `employee`, `company_manager`) returning `(user_id uuid, display_name text)`.

---

### 2. Migration `00089_driver_invoice_print_override.sql` (PR #76 adapted for `demo`)
1. Bring in `origin/feat/driver-invoice-print-override` (PR #76) renumbered from `00072` to `00089_driver_invoice_print_override.sql` (plus `supabase/rollback-00089.sql`):
   - `driver_invoice_print_overrides` table (`driver_id` PK, `organisation_id`, `settings` jsonb, `updated_by`), `set_driver_invoice_print_override(p_driver_id, p_settings)`.
   - `features/invoices/lib/invoice-print-settings.ts` (`parseDriverInvoicePrintOverride`, `applyDriverInvoicePrintOverride`), `features/invoices/lib/driver-invoice-print-override.ts`, `services/driver-invoice-print-override.service.ts`, `features/invoices/components/invoice-print-page.tsx`, `app/api/invoices/send/route.ts`.
2. **CRITICAL SECURITY FIX vs PR #76:**
   - On `demo`, `00081`/`00084`/`00085` exclude `dispatcher` from all finance data. In PR #76, `driver_invoice_print_overrides_select` allowed `'dispatcher'` — **REMOVE `'dispatcher'`**!
   - Set `driver_invoice_print_overrides_select` to:
     `public.is_platform_owner() or public.has_org_role_names(organisation_id, array['organisation_admin', 'manager'])`
     (no `dispatcher`, no `supervisor`, no `driver`, no `company_manager`).
3. **Admin UI for per-driver / per-owner print override:**
   - PR #76 had no UI form. Add an admin-only `"Invoice issuer"` button/dialog on `features/drivers/components/drivers-page.tsx` (visible only when `can("invoices:manage")` and `can("drivers:manage")`) that lets an `organisation_admin` inspect/save/clear `supplier`, `contact`, and `banking` blocks via `set_driver_invoice_print_override`.
   - Never log or write banking field values to `audit_logs` or console output.

---

### 3. App & UI changes (Owner tags, Owner-split Reports/Invoices, Entered-by Audit)
1. **Drivers & Vehicles (`features/drivers/`, `features/vehicles/`, `lib/capture/fleet-fields.ts`, `types/index.ts`):**
   - Add `Owner` (`Unassigned` / `Yaseen` / `Fadia`) select to Driver capture/quick-add form, Vehicle capture/quick-add form, table columns (`Owner` badge), search filter, and CSV import schemas/templates.
2. **Entered by / Last edited by (`features/trips/`, `services/trips.service.ts`, `services/staff-trips.service.ts`):**
   - Show **`Entered by`** (from `created_by`) and **`Last edited by`** (from `updated_by`, when different/present) on:
     - `TripsPage` table / detail
     - `StaffTripsMonitorPage` cards & `EditWaybillDialog`
     - Trips report & CSV export (`entered_by`, `updated_by` columns in `services/reports.service.ts`).
   - Do not expose actor names or prices to drivers (`driver-trips-page.tsx`).
3. **Invoices List (`features/invoices/components/invoices-page.tsx`, `invoice-list-filters.ts`, `invoice-list-filters.tsx`):**
   - Derive each invoice's owner as `invoice.drivers?.owner_tag ?? invoice.owner_tag ?? null`.
   - Add an **`All` / `Yaseen` / `Fadia`** owner filter alongside status/week/sort filters, plus an `Owner` column/badge in the table.
4. **Owner-split Reports (`features/reports/components/reports-page.tsx`, `services/reports.service.ts`, `features/reports/schemas/report.ts`):**
   - Add owner filter **`All` / `Yaseen` / `Fadia`** to `reportFilterSchema` and `ReportsPage`.
   - **Default view requirement:** when owner filter is `All`, show **Split by owner** (Yaseen subtotal + Fadia subtotal, plus Unassigned if non-zero) **by default**, with a **"Combined view"** toggle (`Split by owner` on by default) so the user sees split totals immediately and can toggle to combined totals (`All = Yaseen + Fadia` + unassigned).
   - Ensure filtering to `Yaseen` or `Fadia` produces totals equal to that owner's slice across `trips`, `fuel`, and `commercial` reports.
   - Include an `owner` column (`Yaseen` / `Fadia` / `Unassigned`) in `reportToCsvRows` for `trips`, `fuel`, and `commercial` CSVs.

---

### 4. Migration `00090_demo_jacobs_source_orgs_seed.sql` (DEMO ONLY — fake data)
Create two **fake** source orgs on `goops-demo` (and compatible with `scripts/local-db/bootstrap-native.sh` auth stub) while leaving `Cape Shuttle Ops` untouched:
- **Fake auth users & profiles (`@example.com`):**
  1. `demo-jacobs-yaseen@example.com` (`Demo Yaseen Jacobs`, `organisation_admin` on both source orgs — Entry Login #1)
  2. `demo-jacobs-faadiah@example.com` (`Demo Faadiah Jacobs`, `organisation_admin` on `Demo Fadia Org` — Entry Login #2)
  3. `demo-jacobs-clerk@example.com` (`Demo Ops Clerk`, `manager` on both source orgs — Entry Login #3)
  4. `demo-jacobs-driver-yaseen@example.com` (`Yaseen Demo`, `driver` on `Demo Yaseen Org`)
  5. `demo-jacobs-driver-zain@example.com` (`Zain Demo`, `driver` on `Demo Fadia Org`)
- **Fake source orgs:**
  - `Demo Yaseen Org` (slug `demo-yaseen-org`, **Starter** plan, `settings.invoice_bill_to_company_id` -> `Demo WCL Trading CC`, fake `settings.invoice_print`).
  - `Demo Fadia Org` (slug `demo-fadia-org`, **NO subscription row** — tests the no-plan fallback elimination, `settings.invoice_bill_to_company_id` -> `Demo WCL Trading CC`, fake `settings.invoice_print`).
- **Fake fleet & master data (with `owner_tag` `'yaseen'` / `'fadia'`):**
  - Drivers: `Yaseen Demo` (linked login, `yaseen`), `Paulin Demo` (no login, `yaseen`), `Shaheed Demo` (no login, `fadia`), `Freddy Demo` (no login, `fadia`), `Zain Demo` (linked login, `fadia`).
  - Per-driver print overrides on source drivers (fake bank details only: `Demo Yaseen Transport / DEMO-FNB / DEMO-ACC-1001`, `Demo Shaheed Transport / DEMO-ABSA / DEMO-ACC-2002`, `Demo Mansur Logistics / DEMO-NEDBANK / DEMO-ACC-3003`).
  - Vehicles: 2 `yaseen` (`CA-DEMO-Y1`, `CA-DEMO-Y2`) and 2 `fadia` (`CA-DEMO-F1`, `CA-DEMO-F2`), plus 1 standing `driver_vehicle_assignments` row.
  - Overlapping companies in BOTH orgs: `Demo WCL Trading CC`, `Demo Acme Logistics`, `Demo Bay Hotel`, `Demo Metro Tech`; plus Yaseen-only `Demo Mountain Co`, and Fadia-only `Demo Coastline`.
  - Rate cards (`Demo Acme Logistics` R300 both; `Demo Bay Hotel` R450 both; `Demo Metro Tech` Yaseen R440 vs Fadia R450; `Demo Coastline` R440; `Demo Mountain Co` R450) and `route_prices` (`Demo Bay Hotel`: `Airport -> Demo Bay Hotel` R410.00).
  - `pay_rates` (1 Yaseen row), `routes` (1 `Demo Mountain Co` route `Demo Mountain Shuttle`).
  - Historical copied week(s) (e.g. `2026-11-09..2026-11-15` and `2026-11-16..2026-11-22`):
    - Completed trips entered by all 3 entry logins (`created_by` split across Yaseen, Faadiah, Clerk), trip assignments, trip events, trip audit.
    - **Draft** invoices (some with `issued_at` set, some null), **1 `void` invoice**, **1 `void` + `deleted_at` invoice with 0 lines** (mirrors live's header/line void-deleted gap), and `invoice_lines` with `price_overridden = true` + `override_reason`.
    - Historical `workshop_bills` (guarded if maintenance tables exist: 1 `final` locked bill, 1 `draft` bill, 1 `suppliers` row, 1 `maintenance_categories` row).
  - **Unbilled Gate F Monday-run week (`2026-11-23 .. 2026-11-29`):**
    - Seed the exact 7 unbilled completed staff trips + 2 unbilled completed non-staff `Demo Mountain Co` trips specified in `/workspace/bot-office/eng/jacobs-demo-monday-run-expected.md` (with **no `invoices` or `invoice_lines` rows** for `2026-11-23..2026-11-29` yet!).
    - Include the `trip_billing_overrides` row (`640.00`, `'Executive transfer'`) on `Shaheed Demo`'s Thu 26 Nov trip, and `manual_unit_price = 520.00` on `Yaseen Demo`'s Wed 25 Nov trip!

---

### 5. Migration `00091_jacobs_org_copy_function.sql` + `00092_demo_jacobs_org_copy_run.sql`
1. Create `public.org_copy_map (batch_id uuid, source_org_id uuid, source_table text, source_id uuid, new_id uuid, created_at timestamptz default timezone('utc', now()), primary key (batch_id, source_table, source_id))` (RLS enabled, `service_role` / `postgres` only; `revoke all from anon, authenticated`).
2. Create `public.copy_orgs_to_jacobs_org(p_source_org_ids uuid[], p_target_name text default 'Jacobs Org', p_target_slug text default 'jacobs-org', p_batch_id uuid default gen_random_uuid()) returns uuid`:
   - Runs in one transaction (`SET LOCAL app.preserve_audit_actor = 'true'`).
   - Creates `Jacobs Org` AND inserts an active `growth` subscription in the **same call** (never no-plan!).
   - Copies all org-scoped tables with **new UUIDs** recorded in `org_copy_map`:
     - `companies` (dedupe exact `lower(btrim(name))` across source orgs onto one survivor; remap `settings.invoice_bill_to_company_id` to surviving WCL row)
     - `drivers` (dedupe by `profile_id` or normalised `license_number` / `full_name`, preserving `profile_id` and `owner_tag`)
     - `vehicles` (dedupe by normalised `registration_number`, preserving `owner_tag`)
     - `driver_vehicle_assignments`, `driver_invoice_print_overrides`
     - `areas`, `sites`, `pickup_points`, `routes`, `route_stops`, `schedules`, `employees`
     - `rate_cards`, `route_prices` (handle `route_prices_active_label_uidx` after company dedupe cleanly without failing or rewriting historical lines)
     - `pay_rates`, `payroll_runs`, `payroll_lines`
     - `trips` (preserving `created_by`, `updated_by`, `approved_by`, `manual_unit_price`, `manual_price_area_key` — NO `generate_*`, NO `suggest_trip_unit_price`, NO `sync_staff_trip_invoice_line`!)
     - `trip_assignments`, `trip_events`, `trip_passengers`, `trip_audit`, `trip_billing_overrides`, `trip_driver_submission_snapshots`
     - `fuel_fillups`, `driver_presence`, `driver_inbox_notifications`, `admin_inbox_notifications`
     - `invoices` (preserving `status`, `issued_at`, `paid_at`, `period_start`, `period_end`, `notes`, `subtotal`, `total`, `deleted_at`, `generated_by`, `updated_by`, `owner_tag`)
     - `invoice_lines` (preserving `unit_price`, `amount`, `quantity`, `price_overridden`, `override_reason`, `rate_effective_on`, `priced_area_key`, remapping `invoice_id`, `trip_id`, `trip_company_id`, `rate_card_id`, `route_price_id`)
     - `driver_documents`, `vehicle_documents` (remapping `storage_path` org/entity UUID segments if present)
     - `maintenance_categories`, `suppliers`, `workshop_bills` (preserving `status = 'final'`, `approved_by`, `approved_at`, remapping `attachment_path` if present), `workshop_bill_lines` (guarded with `to_regclass('public.workshop_bills') is not null` so the function works even on schemas without Drop 1)
     - `audit_logs` (remapping `entity_id` via `org_copy_map` where mapped, keeping original `actor_id` and `created_at`).
   - **Memberships:** inserts `organisation_members` on `Jacobs Org` for every unique `user_id` across source orgs (highest privilege if a user appears in both, e.g. `organisation_admin`), leaving source org memberships untouched.
   - Do **NOT** copy `notification_outbox` or global `locations` (`organisation_id is null`). Mint new `invitations` tokens only if needed or skip pending invites.
   - Verify no insert trigger on `trips` or `invoice_lines` recomputes prices.
3. Also update `generate_driver_weekly_invoice` (after `00087`) so when invoked for a driver + week that has unbilled completed staff trips (`is_staff_transport = true`), it sweeps them through `sync_staff_trip_invoice_line` (respecting `manual_unit_price`, `trip_billing_overrides`, `route_prices`, and `rate_cards`) so `"Generate driver week"` from `/invoices` produces the exact Gate F draft totals line for line (and still returns existing non-void invoices untouched if already generated).
4. `00092_demo_jacobs_org_copy_run.sql`: invokes `copy_orgs_to_jacobs_org` for `Demo Yaseen Org` and `Demo Fadia Org` -> `Jacobs Org`.

---

### 6. Rollback & Archive scripts (archive NOT run by migrations!)
- `supabase/rollback-jacobs-org-copy.sql`: deletes all `Jacobs Org` child rows in FK-safe order, Growth subscription, `Jacobs Org`, and its `org_copy_map` batch, leaving `Demo Yaseen Org`, `Demo Fadia Org`, and `Cape Shuttle Ops` byte-identical.
- `supabase/archive-source-orgs-jacobs.sql` (**NOT in `supabase/migrations/` — never auto-run**): verifies reconciliation counts/totals pass first, then archives source orgs (`status = 'inactive'`, `deleted_at = timezone('utc', now())`) and sets their `organisation_members` `status = 'suspended'`, `deleted_at = timezone('utc', now())` (no hard delete).
- `supabase/rollback-archive-source-orgs.sql`: restores archived source orgs and memberships back to `active` / `deleted_at = null`.

---

### 7. Tests required (must all pass locally)
1. **DB test (`tests/db/jacobs-org-copy.test.mjs`, wired in `package.json`):**
   - Runs on local Postgres (`scripts/local-db/bootstrap-native.sh`).
   - **Reconciliation (Gate A):** executes the exact before/after SQL from `/workspace/bot-office/eng/goops-org-merge-assessment.md` (table counts, active draft/void/void+deleted invoice totals to the cent, 1:1 `org_copy_map` invoice identity, 0 `invoice_lines` price mismatches, `price_overridden` count match, `Jacobs Org` has active `growth` subscription with `maintenance` module).
   - **Access & Security (Gate B):** Jacobs admin & manager read all money + `driver_invoice_print_overrides`; drivers see only own trips with NULL/hidden prices and cannot select a vehicle; `dispatcher` and `supervisor` read 0 rows from `invoices`, `invoice_lines`, `rate_cards`, `workshop_bills`, and `driver_invoice_print_overrides`; `Cape Shuttle Ops` stays isolated.
   - **Per-owner Print Overrides (Gate C):** reads `driver_invoice_print_overrides` for `Yaseen Demo`, `Shaheed Demo`, `Freddy Demo` and verifies distinct supplier/banking blocks; verifies `audit_logs` never contains account digits.
   - **Entry Audit (Gate E):** verifies copied `trips.created_by` preserved across all 3 entry logins; simulates new trip inserts/updates from each of the 3 logins and verifies `created_by` and `updated_by` stamp `auth.uid()`.
   - **Monday Run (Gate F):** runs `generate_driver_weekly_invoice` for `Yaseen Demo`, `Shaheed Demo`, `Freddy Demo` and `generate_period_invoice` for `Demo Mountain Co` on `2026-11-23..2026-11-29` inside `Jacobs Org`, and asserts **exact cent-for-cent match** with `/workspace/bot-office/eng/jacobs-demo-monday-run-expected.md`:
     - `Yaseen Demo`: `1230.00` (300 + 410 + 520)
     - `Shaheed Demo`: `1380.00` (300 + 640 + 440, `override_reason = 'Executive transfer'`)
     - `Freddy Demo`: `300.00`
     - `Demo Mountain Co`: `900.00` (2 × 450)
     - Combined: `3810.00`
   - **Maintenance on Jacobs Org (Gate G):** verifies copied `final` workshop bill remains locked against edit/delete while `draft` bill can be edited by admin/manager and blocked for dispatcher/driver.
   - **Rollback & Archive (Gate H):** runs `rollback-jacobs-org-copy.sql` and verifies `Demo Yaseen Org` and `Demo Fadia Org` row counts & checksums are byte-identical to pre-copy; re-runs copy, tests `archive-source-orgs-jacobs.sql` + `rollback-archive-source-orgs.sql` round-trip.
2. **Unit tests (`vitest run`):**
   - `applyDriverInvoicePrintOverride` per-driver/per-owner footer precedence (Yaseen / Shaheed / Freddy-Mansur, no cross-bleed).
   - Owner filter on `filterAndSortInvoices` (`All` / `Yaseen` / `Fadia`).
   - Owner-split reports (`buildOpsReport` split vs combined totals: `All = Yaseen + Fadia`, plus `owner` column in `reportToCsvRows`, plus `entered_by`/`updated_by` in trips CSV).
   - Permissions & layout/service tests confirming `dispatcher` cannot read print overrides and `TRIP_COLUMNS` never includes revoked price columns.
3. Run `npm test`, `npm run lint`, `npx tsc --noEmit`, and all DB test suites (`npm run test:finance-00081`, `npm run test:maintenance-rls`, `npm run test:maintenance-final-lock`, plus the new `jacobs-org-copy` DB test). Open a **draft PR targeting `demo`** and report PR URL, commit SHA, and test results.
