# Company portal — founder review spec

**Status:** Proposal only. No feature code, no database change, no merge.
**Product:** GoOps (WorkOps)
**Audience:** Founder review before any build
**Date:** 3 October 2026

---

## Summary

The company login is for the **client companies GoOps is contracted to transport** (Lewis, Teleperformance, and the other companies on the waybill). A company user should see only their own people, their own trips, and their own bill.

That bill is a **new document**. It charges the client company for its completed trips times that company’s own trip rate, one document per company per week. It is separate from the invoice GoOps already sends to **WCL Trading CC**, which stays one invoice per driver per week and is not changed by this work.

Today a “Company” login already exists, but it is a fleet hub (fuel, vehicles, and the operator’s invoice list). It does not let a client add their own staff, it does not show whether those staff trips finished, and it does not give the client their own invoice. Several database rules would also let a badly scoped company user see another company’s trips, or the WCL driver invoices, if an admin attaches the wrong company.

This spec says what to reuse, what is missing, and the smallest safe order to build it.

---

## What this document is

A build spec for a later pull request. It proposes tables, screens, and rules. It does not apply them.

**Assumption:** “Company” in this spec means the contracted client (the company on the waybill), not WCL Trading CC and not the GoOps organisation itself.

---

## Founder locks (do not change)

These stay as they are. The company portal must work beside them.

| Lock | What the code does today |
| --- | --- |
| One invoice per driver per week, billed to WCL Trading CC | `invoices.driver_id` is set. `invoices.company_id` is the bill-to company, resolved by `resolve_invoice_bill_to_company_id`: `organisations.settings.invoice_bill_to_company_id`, otherwise the company named `WCL Trading CC`. Uniqueness the later waybill sync relies on is one non-void invoice per organisation + driver + week. |
| The company decides the trip rate | Waybill save calls `resolve_trip_line_rate` for that trip’s `company_id` on the trip date (Africa/Johannesburg). There is no silent org-wide fallback. |
| No rate means save is blocked | If no matching company trip rate card exists, waybill save raises: “No trip rate configured for this company. Add a rate before saving this waybill.” |
| Invoice line amounts stay put, with rate provenance | Once a driver-invoice line has `trip_company_id`, `rate_card_id`, and `unit_price`, a later re-sync keeps those values. New rate cards do not rewrite the line. Columns: `invoice_lines.trip_company_id`, `rate_card_id`, `rate_effective_on`, `unit_price`, `amount`. |
| Re-sync is idempotent | `sync_staff_trip_invoice_line` updates the existing line for that `trip_id` or inserts one. It does not add a second line for the same trip. A repeat call on an unchanged completed trip leaves the draft driver invoice as it was. |

Admin generation, admin numbering (there is none today — invoices are identified by id), admin print, and admin status changes (`draft → issued → paid`, or `void`) stay on the existing `invoices` table. This spec does not alter `generate_driver_weekly_invoice`, `sync_staff_trip_invoice_line`, `backfill_staff_waybill`, or the WCL bill-to resolver.

**Repo drift to respect, not “fix” in the portal work:** `supabase/migrations/00023_invoice_per_trip_company_unique.sql` once split driver invoices per trip company. `database/migrations/00023_invoice_per_trip_company_unique.sql` and `scripts/local-db/drift-invoice-one-per-driver-week.sql` put uniqueness back to one invoice per driver per week. Later waybill sync (`00049`, `00051`) writes one draft per driver per week with an empty `trip_company`. The locked behaviour is one invoice per driver per week. Confirm the live index matches that before building company documents. Do not change it as part of the portal.

---

## What already exists

### Roles

Eight roles in `app_role` (`lib/constants.ts`):

| Role | Who they are today | Where they land after login |
| --- | --- | --- |
| `platform_owner` | GoOps platform operator | `/dashboard` |
| `organisation_admin` | Org admin (invite, settings, full ops) | `/dashboard` |
| `manager` | Ops manager | `/dashboard` |
| `dispatcher` | Dispatcher | `/dashboard` |
| `supervisor` | Supervisor (people, vehicles, attendance; no invoice manage) | `/dashboard` |
| `company_manager` | “Company” user, scoped with `member_scopes` | `/company` |
| `driver` | Driver | `/driver` |
| `employee` | A passenger who has a login | `/employee` |

There is no separate “client company” role. The closest match is `company_manager`.

**Assumption:** Reuse `company_manager` for the client login. Do not add a ninth role unless the founder rejects that (see open questions).

### Companies, rates, and people

- `companies` holds the client: name, code, contact, address, status. Admin creates them on `/companies`. Saving a trip rate writes a company-specific `rate_cards` row (`line_type = trip`) through `upsert_company_with_trip_rate`. The rate is effective-dated.
- `employees` are the passengers/staff. Each row can point at `company_id` and `site_id`. Fields include name, email, phone, employee number, status (`active` / `inactive` / `suspended`), optional `profile_id` (links a passenger login), and home address. Admin manages them on `/employees`, including CSV import. Delete is a soft delete (`deleted_at`).
- `member_scopes` ties a membership to one or more `company_id` values. Admin sets this on the Users screen, and only for someone whose role is `company_manager`. The invite itself does not carry a company.
- `has_company_scope(org, company)` is the database check. For a `company_manager` it is true only when a `member_scopes` row matches. For every other role it is true for every company in the org (the function treats “not a company manager” as full company access). Later policies then carve drivers and some invoice reads back out. That split is easy to get wrong.

### Two different “invoices” already in the database

1. **Driver invoice (the admin document).** Completed staff waybills sync onto one draft invoice per driver per service week (Monday–Sunday, Africa/Johannesburg; `period_end` is the inclusive Sunday). Bill-to is WCL. Each line is one trip: description is date, company name, passenger count, and area. The amount is that company’s trip rate, snapshotted with the rate card id and effective date. Fuel is not on this document.
2. **Period invoice (`generate_period_invoice`).** One row per company per period where `driver_id` is null. It was built for fuel fill-ups, completed trips, and fixed fees. A `company_manager` who is scoped to that company is allowed to generate it and to change its status. This is not the client bill described below. It can include fuel, and it prices trips with its own query rather than copying the waybill snapshot.

Invoices have no human document number. Print is an HTML page (`/invoices/[id]/print` and the same page under `/company/invoices`).

Payroll (`pay_rates`, `payroll_runs`, `payroll_lines`) is driver/employee pay. Company managers have no `payroll:view` permission, and payroll row policies allow only platform owner, org admin, manager, and dispatcher. That part is already closed.

### Company hub that exists today

Route group `app/(company)/`, role gate `requireRole("company_manager")`.

| Screen | What it shows |
| --- | --- |
| `/company` | Counts of open invoices, fleet vehicles, recent fuel rows. Links to fuel, fleet, invoices, reports. |
| `/company/fuel` | Fuel fill-ups. |
| `/company/fleet` | Vehicles. |
| `/company/invoices` | The same invoice screen as admin (`InvoicesPage`), including driver name, “generate period invoice”, “generate driver weekly invoice”, void, mark paid, and draft line editing when the role has `invoices:manage`. |
| `/company/reports` | Trips, fuel, attendance, and a commercial report labelled “Invoices & payroll”. |
| `/company/profile` | Profile. |

`company_manager` permissions today (`lib/permissions/index.ts`): view dashboard, companies, employees, drivers, vehicles, sites, routes, schedules, trips, reports, attendance (including manage), fuel, invoices (including manage), and rate cards. They cannot manage companies, users, trips, or payroll.

There is **no** company screen for employees, and **no** company screen for trip status. `trips:view` is granted, but the app sends a company user who asks for trips back to `/company`.

### Employee login (a different person)

The `employee` role is the passenger’s own phone/web portal: today’s seat, booking, QR boarding. It is not the company office login. A passenger row with no `profile_id` is just a name on the manifest. They do not need a login for the company to manage them.

### Trip and waybill facts the portal can reuse

Staff trips (`trips.is_staff_transport`) require `company_id` and an area. Status values include `assigned`, `en_route_pickup`, `en_route_company`, `completed`, `cancelled`. `waybill_confirmed_at` is set when the waybill is confirmed. `trip_passengers` links an employee to a trip with status `requested`, `confirmed`, `boarded`, or `cancelled`.

A completed staff trip with a driver is what creates the admin invoice line. The line amount is the company rate, not a driver pay rate.

---

## What is missing

1. A company user cannot add, edit, or remove their own employees. The permission `employees:manage` is ops-only, and employee insert/update policies exclude `company_manager`.
2. A company user cannot see a list of their trips and whether each one completed.
3. There is no client billing document. The invoices a company user can see are rows whose `invoices.company_id` is a company they are scoped to. Driver invoices use WCL as that id, so a correctly scoped client sees none of their trip charges. The old period invoice is a different document (fuel and fees included) and must not be reused as this bill.
4. Invite does not attach the company. An admin can invite `company_manager` and forget the scope, or attach WCL.
5. The company hub still offers fuel, fleet, driver names, invoice void, and draft price edits.

---

## Gaps in the current portal

These are findings, not a licence to change admin billing.

| Gap | Why it matters |
| --- | --- |
| Company invoice screen is the admin invoice screen | `company_manager` has `invoices:manage`. The UI offers void, mark paid, and draft line edits. `set_invoice_status` and `update_draft_invoice_line` allow a company manager who has scope on `invoices.company_id`. Draft line edit can change `unit_price`. That fights the immutability lock if a client can reach a draft. Driver-weekly generation itself rejects company managers; period generation does not. |
| Scoping a client to WCL shows every driver invoice | Driver invoices are stored with `company_id` = WCL. A company manager scoped to WCL can read every driver’s weekly invoice, and every client’s trip rate on those lines. |
| `trip_passengers` is not company-scoped | Any `company_manager` in the org can select every passenger row, including other companies’ staff. |
| Rows with a blank `company_id` are visible | Trip, employee, and vehicle read policies allow `company_id is null` for org members who pass the surrounding checks. A company user can see trips, staff, and vehicles that were never assigned to their company. |
| Org-wide rate cards are visible to every company manager | `rate_cards` with `company_id` null are readable by `company_manager`. Company-specific cards are scoped. Driver pay rates are not on this table and stay hidden. |
| Vehicles with a blank company are visible | The current vehicle read policy still allows a non-driver org member to see vehicles whose `company_id` is null. |
| Commercial report asks for payroll | `/company/reports` can request “Invoices & payroll”. Payroll policies return no rows to a company manager, so the payroll total falls out as zero, but the screen still talks about payroll. |
| Employee hard delete would wipe history | `trip_passengers.employee_id` is `on delete cascade`. A real delete removes seats. Soft delete does not. Company remove must be soft delete only. |
| `has_company_scope` is broad for non-company roles | Drivers and employees pass `has_company_scope` for every company, and later policies are supposed to undo that. New company-portal policies must not trust `has_company_scope` alone. |

---

## Roles and permissions

**Assumption:** The client office user is `company_manager`, scoped to exactly one client company. Ops roles keep every permission they have today. This matrix is the target, not the code today.

| Action | Platform owner / org admin | Manager / dispatcher | Supervisor | Company user | Driver | Employee (passenger login) |
| --- | --- | --- | --- | --- | --- | --- |
| Sign in on the shared login page | Yes | Yes | Yes | Yes, then `/company` | Yes, then `/driver` | Yes, then `/employee` |
| See another company’s staff, trips, rates, or bills | Yes | Yes | Staff and trips only where their policies already allow | No | Own trips only | Own seats only |
| Add / edit / soft-remove own company’s employees | Yes, any company | Yes, any company | Yes, any company | Own company only | No | No |
| Link an employee to a login (`profile_id`) | Yes | Yes | Yes | No in the first build | No | No |
| See own company’s trip status | Yes | Yes | Yes | Yes | Own assignments | Own seats |
| Change a trip status or waybill | Yes | Yes | Limited, as today | No | Own trip flow, as today | No |
| See amount being billed for own completed trips | Yes | Yes | No | Yes | No | No |
| See or print own company invoice | Yes | Yes | No | Yes, own company, read only | No | No |
| Generate or issue a company invoice | Yes | Yes | No | No | No | No |
| Mark a company invoice paid or void | Yes | Yes | No | No | No | No |
| See or change a driver invoice (WCL, per driver per week) | Yes | Yes | View only if they already can | No | No | No |
| See driver pay, payroll, or another company’s rate | Yes | Yes | Pay rates follow current payroll policies | No | No | No |
| Edit a trip rate | Yes | Yes | No | No. The company rate stays an admin setting | No | No |
| See fuel or the GoOps fleet | Yes | Yes | Yes | No on the client portal | Own fuel / own vehicle, as today | No |
| Invite a company user and attach their company | Org admin and platform owner | No (`users:manage` is admin-only today) | No | No | No | No |

Permission changes for `company_manager` when this is built:

- Add `employees:manage`, enforced in the database as “own scoped company only”.
- Remove `invoices:manage`. They keep a new read permission for their own company documents only (name it `company_invoices:view` so it cannot be confused with `invoices:view`).
- Remove `fuel:view`, `vehicles:view`, `drivers:view`, `rate_cards:view`, `attendance:manage`, and `invoices:view` from the client portal. **Assumption:** those views were for a fleet customer, which is not this portal. If a real fleet customer still needs them, that is a separate role (open question).
- Keep `trips:view` but only through a company-scoped trip query, not the admin trips table unfiltered.

---

## Data model (proposal only)

Do not add these tables in the spec pull request.

### Leave these tables alone

`invoices`, `invoice_lines`, `rate_cards`, `pay_rates`, `payroll_runs`, `payroll_lines`, and the waybill sync functions. Company documents must not be rows in `invoices`. Sharing that table would mix WCL driver invoices with client bills: the unique key, the bill-to column, RLS, print, and void would all collide.

`generate_period_invoice` stays as legacy. Do not point the company portal at it.

### New: `company_invoices`

One row per client company per service week.

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organisation_id` | Tenant |
| `company_id` | The client company. This is also who the document is billed to |
| `period_start` | Monday of the service week, same SAST week as the driver invoice |
| `period_end` | Inclusive Sunday, same rule as `normalize_invoice_period_end` |
| `document_number` | Human number, set once (see numbering below) |
| `status` | `draft`, `issued`, `paid`, `void` |
| `currency` | `ZAR` |
| `subtotal`, `total` | Sum of lines |
| `issued_at`, `paid_at`, `voided_at` | Status timestamps |
| `generated_by` | Ops user |
| `notes` | Optional |
| `created_at`, `updated_at`, `deleted_at` | Same soft-delete pattern as other tenant tables |

Unique: one non-deleted, non-void document per (`organisation_id`, `company_id`, `period_start`, `period_end`).

### New: `company_invoice_lines`

One row per completed trip on that document.

| Column | Purpose |
| --- | --- |
| `id` | Primary key |
| `organisation_id` | Tenant |
| `company_invoice_id` | Parent document |
| `trip_id` | The staff trip |
| `source_invoice_line_id` | The admin `invoice_lines.id` this amount was copied from. Reconciliation key |
| `rate_card_id`, `rate_effective_on` | Copied from that admin line, not looked up again |
| `description` | Date, area, passenger count. No driver name, no pay |
| `quantity` | `1` |
| `unit_price`, `amount` | Copied from the admin line. Never recomputed from a newer rate card |
| `created_at` | Insert time |

Unique: one line per `trip_id` among non-void company documents. A trip is billed to the client once.

**Assumption:** The amount is copied from the admin waybill line after that line exists. The portal does not price the trip a second time. If the admin line does not exist yet, that trip is left off the company document and listed on the admin reconciliation report as “completed, not yet on a driver invoice”. That keeps one rate source and makes the two totals match.

No fuel lines. No fixed fees. No adjustments, unless the founder later asks for a credit note (open question).

### Employee changes

No new employee table. Company users write the existing `employees` row.

**Assumption:** They may set name, email, phone, employee number, site, and status `active` or `inactive`. They may not change `company_id`, `profile_id`, or `organisation_id`. They may not see employees whose `company_id` is null or belongs to someone else.

### What a company user must never be able to select

- `invoices` where `driver_id` is not null
- `invoices` whose `company_id` is the WCL / bill-to company
- `invoice_lines` hanging off those invoices
- `pay_rates`, `payroll_runs`, `payroll_lines`
- `rate_cards` for any company but their own (and not org-wide cards)
- `companies` other than their scope
- `drivers` (name, phone, licence)
- `fuel_fillups`
- vehicles and vehicle documents
- trips whose `company_id` is not theirs, including trips with a blank `company_id`
- `trip_passengers` for employees outside their company

---

## Isolation rules

A company user sees a row only when all of these are true:

1. They have an active `company_manager` membership in the organisation.
2. They have a `member_scopes` row for the company.
3. The row’s `company_id` equals that scope.
4. The row is not a driver invoice, a pay rate, or another company’s rate.

Blank `company_id` does not mean “visible to every company”. For this role it means “hidden”.

The bill-to company (WCL Trading CC, or whatever `resolve_invoice_bill_to_company_id` returns) cannot be chosen as a company-user scope. The Users screen should refuse it, and the database should refuse the insert.

**Assumption:** One scope per company user. The table already allows several. The first build should enforce one, so one login cannot sit across two clients. An admin who needs two clients gets two users.

Ops roles keep their current access, including every driver invoice and every company rate. The new company-invoice tables are readable by ops for the whole organisation, and writable only by platform owner, org admin, manager, and dispatcher, through a single generate/issue function (same pattern as invoice RPCs, not open table writes).

Company users do not get `security definer` functions that accept an arbitrary `company_id`. The function reads the caller’s scope and ignores any other company id passed in.

---

## Screens

Company shell stays `/company`. Drop Fuel and Fleet from the nav.

| Screen | What the user sees | What they can do |
| --- | --- | --- |
| Home | This week: trips completed, trips not yet completed, trips cancelled, amount on completed trips, any issued invoice for the week | Open trips, people, or the bill |
| People | Their employees, active and inactive. Removed people stay out of the list | Add, edit, soft-remove |
| Trips | Their staff trips for a chosen week: date and time, area, their passengers, status, and a clear “completed” or “not completed” | Filter by status. Read only |
| Billing | Running total for the open week (completed trips only), then the list of their company invoices with number, week, status, and total | Open and print an issued invoice. No generate, void, paid, or price edit |
| Profile | Own name and sign-out | Same as today |

Admin keeps `/invoices` exactly as it is. Add a separate admin screen later, for example `/company-invoices`, to generate and issue client documents and to open the reconciliation list. That screen is ops-only. It must not be a new button inside the driver-invoice editor.

Print for a company invoice is its own page. It shows the client company as bill-to, the document number, the week, and one line per trip (date, area, passengers, rate, amount). It does not show the driver, the vehicle, WCL, or a driver-invoice id.

**Assumption:** No live map in the first build. Status text is enough to answer “did the trip finish?”.

**Assumption:** The company does not book or cancel trips in the first build. Dispatch stays with GoOps.

---

## Employee add, edit, and remove

The people on this screen are `employees` rows for the scoped company: the staff who ride. They are not the company user’s login, and they are not drivers.

### Add

Required: full name. Optional: email, phone, employee number, site (sites already linked to that company only).

The new row is `status = active`, `company_id` = the user’s scope, `organisation_id` = the active org. `profile_id` stays empty.

**Assumption:** Adding a person does not send them a login invite. Passenger login stays an admin action. If the founder wants the company to invite riders, that is a later phase.

Employee number stays unique per organisation among non-deleted rows (index already exists). A duplicate shows a plain error.

### Edit

Allowed: name, email, phone, employee number, site, status `active` or `inactive`.

Not allowed: moving the person to another company, attaching a login, or editing someone who is not in the scoped company.

`inactive` keeps the row visible to the company and to admins. They drop off pickers for new trips.

**Assumption:** An inactive person who is already on a future trip stays on that trip until an admin or driver changes the manifest. The company portal does not strip them automatically, because that would change dispatch.

### Remove

Remove sets `deleted_at` (the same soft delete admin uses). It does not run a SQL `DELETE`.

Effects:

- The person disappears from the company list and from new-trip pickers.
- Past `trip_passengers` rows stay. Completed and historical trips still show their name.
- Past invoice lines stay. Amounts do not change.
- A trip that is already in progress keeps the seat.
- Restore is admin-only in the first build.

**Assumption:** “Remove” means soft delete, not status `inactive`. The screen should use the words “Remove” and “Inactive” for those two different outcomes so the office user can tell them apart.

---

## Trip status

Source: staff trips with `trips.company_id` equal to the scoped company, plus that trip’s `trip_passengers` whose employee belongs to the same company.

Show:

| Field | Rule |
| --- | --- |
| When | `planned_start` in Africa/Johannesburg |
| Area | `area_text` |
| Passengers | Names of that company’s employees on the trip, and each seat status |
| Trip status | The existing labels: assigned, en route to pickup, en route to company, completed, cancelled |
| Outcome | **Completed successfully** only when `status = completed`. **Not completed** for every other non-cancelled status. **Cancelled** when `status = cancelled` |

**Assumption:** `waybill_confirmed_at` is not required for the company to see “completed”. If the founder wants “completed” to mean “waybill confirmed and on the driver invoice”, say so. Until then, a completed trip that is not yet on an invoice still shows as completed, and the billing screen shows it as completed but not yet on an issued company invoice.

Do not show driver name, driver phone, pay, vehicle registration, fuel, or GPS.

Cancelled trips are listed so the company can see they did not happen. They are not billed.

---

## Company invoice and statement

### The two documents

| | Driver invoice (exists, unchanged) | Company invoice (new) |
| --- | --- | --- |
| Who it is for | GoOps billing the admin side | The client company |
| Bill-to | WCL Trading CC | That client company |
| How many | One per driver per week | One per client company per week |
| What a line is | One completed staff trip, on that driver’s invoice | The same completed trip, on the client’s invoice |
| Amount | Company trip rate, snapshotted at waybill save | The same snapshotted amount, copied |
| Fuel, fixed fees, driver pay | Not on the waybill invoice | Not on this document either |
| Who can open it | Ops | Ops, and the company user for their own company |
| Table | `invoices` / `invoice_lines` | `company_invoices` / `company_invoice_lines` |

A week with three drivers and two client companies still produces three driver invoices (one each, all billed to WCL) and two company invoices (one per client). The trips are the same trips. The grouping is different.

### What the company is billed

For a service week, the client is billed for each staff trip where:

- `company_id` is that client
- `status` is `completed`
- `planned_start` falls in that Monday–Sunday SAST week
- the trip is not deleted
- an admin invoice line already exists for that `trip_id`

Line amount = that admin line’s `amount` (the company rate, already rounded). Quantity is 1. The company is not billed per passenger and not billed for cancelled or unfinished trips.

**Assumption:** One completed trip is one charge, even when several of their staff rode. That matches the current waybill line, which is one amount per trip, with passenger count only in the description.

The home and billing screens may show a **statement** before the document is issued: the same trips and the same copied amounts, labelled “not yet invoiced”. The statement is a read of eligible trips. It is not a second pricing pass. An issued document is the frozen copy.

### How it is generated

Ops only, from the admin company-invoice screen. Not from the driver-invoice screen, and not by the company user.

1. Ops picks the client and the service week (the same week control the driver invoices use).
2. The function takes a transaction lock on organisation + company + week (same idea as `generate_period_invoice`’s advisory lock).
3. If a non-void document for that company and week exists and is `issued`, `paid`, or `void`-excluded, generation stops with a clear message. Issued totals never change.
4. If a `draft` exists, reuse it. If none exists, insert one and assign the document number.
5. For each eligible trip that is not already a line, insert a line by copying amount, rate card, effective date, and `source_invoice_line_id` from the admin line.
6. Do not update `unit_price` or `amount` on a line that already exists.
7. If a trip was cancelled and the document is still `draft`, remove that line and recalculate the total. If the document is already `issued`, do not remove the line; the reconciliation report flags it for a human.
8. Recalculate `subtotal` and `total` from the lines.
9. Calling it again with no new trips returns the same document and the same lines.

Issue is a separate step: `draft → issued`. Then `issued → paid`, or `void` from `draft` or `issued`. No return to draft. Same lifecycle words as admin invoices, on the new table only.

**Assumption:** Voiding a company invoice does not void or edit the driver invoice. A replacement company draft can be generated for that company and week after void, because the unique key ignores void rows. Line amounts are copied again from the admin lines, which are unchanged.

### Numbering

Company documents get a number. Driver invoices do not get one in this work.

Format, assigned once on first insert and never changed on re-sync:

`CI-{company code}-{YYYYMMDD}`

- `{company code}` is `companies.code` when it is set, otherwise the first 8 characters of the company id.
- `{YYYYMMDD}` is `period_start` (the Monday).

Example: `CI-LEWIS-20261005`.

The number is unique per organisation. A voided document keeps its number. A replacement after void gets a suffix `-2`, then `-3`, so the original number is never reused.

**Assumption:** Weekly is the only period. It matches the driver invoice week. A monthly client statement would be a later choice.

### How the two sides stay in step

For one service week, across the organisation:

- Every completed staff trip has at most one non-void driver-invoice line (true today via `trip_id` on the line).
- Every completed staff trip has at most one non-void company-invoice line (new unique rule).
- When both lines exist, `company_invoice_lines.amount` equals `invoice_lines.amount`, and the rate card id matches.
- Sum of company-invoice line amounts for the week equals sum of driver-invoice trip line amounts for the week.

The admin reconciliation list shows trips that break those rules: completed but missing a driver line, completed but missing a company line, amounts that differ, or a company line whose trip was cancelled after issue. Company users never see that list, because it contains other companies and driver invoices.

Re-sync of a driver invoice must not rewrite company-invoice amounts. The copy already happened. If an admin edits a **draft** driver line price (the existing draft-line editor can do that), the reconciliation list shows the mismatch until someone voids the draft company document and generates it again, or until a deliberate “refresh draft company lines that are still draft” action copies the new snapshot. **Assumption:** automatic refresh is allowed only while the company document is `draft` and only from the admin line. Issued company lines never move. This does not change the admin editor.

---

## Invite and login

Login stays the one GoOps page. Company users are not a second product.

Flow:

1. An org admin invites an email as `company_manager` (invite already exists).
2. The invite must include the client company. **Assumption:** extend the invite so the company is stored with it and written into `member_scopes` when the invite is accepted. Until that ships, the admin must set Scopes on the Users screen before telling the person to sign in.
3. The company picker lists client companies only. It hides the bill-to company (WCL).
4. The person opens the existing invite link, sets a password, and lands on `/company`.
5. If they have no scope, the home page says their company is not linked yet, and every data query returns nothing. It does not fall back to the whole organisation.
6. Suspend on the Users screen blocks them the same way it blocks any other member.

A company user who also has a driver or employee membership uses the active membership’s hub, as today. **Assumption:** a client office login should not also be a driver in the same org. The invite UI can warn if that email already has another role. Do not invent a new switcher in the first build.

Password reset stays the existing forgot-password flow.

---

## Security risks

| Risk | What to do |
| --- | --- |
| Company user scoped to WCL reads every driver invoice and every client’s rate | Refuse that scope in the UI and in the database. Company invoice reads use the new tables only. |
| Company user voids or reprices a draft invoice | Remove `invoices:manage` from the role. Do not grant them `set_invoice_status` or draft line edit on `invoices`. |
| Passenger list leaks across companies | Scope `trip_passengers` by the employee’s `company_id` for `company_manager`. Today the policy only checks the role name. |
| Blank `company_id` leaks trips, staff, and vehicles | For `company_manager`, blank means hidden. |
| Org-wide rate card is readable by every company manager | Stop that read. They see their own applied rate on their own lines only. |
| Generate function trusts a company id from the browser | Ignore it. Use the membership scope inside the function. |
| Hard delete of an employee cascades seats | Company remove is soft delete only. Do not grant `DELETE` on `employees` to this role. |
| Company invoice print or API includes the driver invoice id in the URL | Use the company document id only. `source_invoice_line_id` stays server-side for ops reconciliation. |
| Reports export payroll or other companies | Company reports export only their trips and their company invoices. Remove the payroll report from that hub. |
| `has_company_scope` returns true for drivers and employees | Do not use it as the only check on new tables. Name the company-user check explicitly (`company_manager` plus matching scope). |
| Admin draft line edit changes a price after the company draft copied it | Reconciliation report, and refresh only while the company document is draft. Issued lines stay. |

---

## Phased delivery

Smallest safe first pull request. Each phase is releasable on its own. None of them change driver-invoice generation, WCL bill-to, rate resolution, or line immutability on `invoice_lines`.

### Phase 1 — stop the leaks (first PR)

No new tables.

- Remove fuel, fleet, invoice generate, void, mark paid, and draft price edit from the company hub.
- Remove `invoices:manage` (and the fuel / fleet / driver / rate-card view permissions) from `company_manager`.
- Database: a `company_manager` cannot read driver invoices, cannot read the bill-to company’s invoices, cannot read blank-company trips, employees, or vehicles, cannot read other companies’ passengers, and cannot read org-wide rate cards.
- Users screen refuses a scope pointing at the bill-to company.
- Tests listed below for this phase. No company billing document yet.

After this phase a company user can sign in and see an almost empty hub. That is the point. They cannot see someone else’s bill.

### Phase 2 — people

- People screen: add, edit, inactive, soft-remove, scoped in the database.
- Audit log on those writes (the audit helper already exists).

### Phase 3 — trip status

- Trips screen and the home counts, read only, own company only.

### Phase 4 — company invoice

- New tables and the generate / issue / void functions.
- Ops screen and reconciliation list.
- Company billing screen and print.
- Numbering and idempotent re-sync as specified above.

### Phase 5 — invite carries the company

- Invite stores the company and creates the scope on accept.
- Empty-scope message until then is already in phase 1.

**Assumption:** Phases 1–3 can ship before any company is shown a rand amount. The statement in phase 4 is the first time they see money.

---

## Test plan

### Phase 1

- Two company users, two companies. Each query for employees, trips, trip passengers, companies, rate cards, and invoices returns only their own company. Blank-company rows are absent.
- A company user scoped only to a client gets zero rows from `invoices` when every invoice is a WCL driver invoice.
- Saving a scope for the WCL / bill-to company fails.
- Company user calling `generate_driver_weekly_invoice`, `generate_period_invoice`, `set_invoice_status`, and draft line edit fails.
- Company user opening `/invoices`, `/payroll`, `/drivers`, and `/company/fuel` is sent back to `/company`.
- A driver invoice re-sync still updates one draft per driver per week and does not change an existing line amount. Existing waybill tests stay green.

### Phase 2

- Company user creates an employee and sees them. The other company does not.
- They cannot set `company_id` to the other company or set `profile_id`.
- Soft-remove hides the person from the list. A past `trip_passengers` row and a past invoice line remain.
- A second employee with the same employee number in the org is rejected.

### Phase 3

- Completed, assigned, and cancelled trips for their company show the right outcome label.
- Another company’s trip is absent, including a trip with a blank `company_id`.
- Passenger names from the other company are absent even if they somehow share a trip id.

### Phase 4

- Generate twice for the same company and week: one document, one number, one line per trip.
- Line amount equals the admin line amount and rate card id. A newer rate card does not change either line.
- A trip with no admin line is skipped and appears on the ops reconciliation list.
- Sum of company lines for the week equals sum of driver-invoice trip lines for the week when every completed trip has both.
- Issued document: a second generate does not add lines or change amounts.
- Void, then generate: a new draft, number suffixed `-2`, amounts copied again.
- Cancelling a trip while the company document is draft drops the line. Cancelling after issue leaves the line and flags reconciliation.
- Company user cannot insert, update, or delete `company_invoices`.
- Print page has no driver name and no WCL invoice id.

### Isolation fixture

Run the phase 1 reads as part of `tests/rls`, with two orgs as well as two companies, so a company user in org A cannot see org B.

---

## Open questions for the founder

1. Is `company_manager` the right role to reuse, or do you want a new role name on the invite screen (the label can say “Company” either way)?
2. Should one login ever cover two client companies, or is one company per user the rule?
3. Is WCL Trading CC always the only bill-to company, including in other organisations on this platform?
4. Does “completed successfully” mean trip status `completed`, or completed and waybill confirmed?
5. Is the client charged once per completed trip (current waybill), or once per employee who rode?
6. Should the company user see their own trip rate on the invoice line? This spec says yes, because it is their price. They still cannot see any other company’s rate or any driver pay rate.
7. Who may issue the company invoice: only GoOps admin, or may the company user also press issue? This spec keeps issue with GoOps.
8. Do you want a monthly statement as well as the weekly document?
9. If a trip is cancelled after the company invoice was issued, is the fix a void-and-reissue, or a later credit line?
10. Should “Inactive” staff be blocked from new trips automatically, or only hidden in pickers?
11. Should the company be able to invite the passenger into the employee app, or does GoOps admin keep that?
12. The current company hub shows fuel and fleet. Is there a real customer who still needs that, or can it leave the company login?
13. Should the company see the driver’s first name on a trip for “who collected my staff”, or no driver identity at all? This spec hides the driver.
14. Confirm the live database unique key is one driver invoice per driver per week (the founder lock), given the old per-company split still sitting in `supabase/migrations/00023`.

---

## Assumptions (index)

Every item marked **Assumption** above is a proposal, not a founder decision:

- “Company” means the contracted client, not WCL and not the GoOps org.
- Reuse the `company_manager` role.
- One company scope per company user.
- Company users do not keep the fuel, fleet, driver, rate-card, or admin-invoice permissions.
- Company users do not link passenger logins in the first build.
- Inactive does not auto-remove someone from a trip already assigned.
- Remove means soft delete. Restore is admin-only at first.
- “Completed successfully” follows trip status `completed`, without waiting for waybill confirmation.
- No map, no booking, and no cancel on the company portal in the first build.
- One charge per completed trip, copied from the admin line, not priced again.
- Weekly documents only. Number format `CI-{code}-{YYYYMMDD}`, with `-2` after void.
- Only ops generate and issue. The company user is read-only on money.
- Voiding a company invoice does not touch the driver invoice.
- Draft company lines may be refreshed from the admin snapshot. Issued lines never change.
- A client office user should not also be a driver in the same org; warn only.
- Phases 1–3 ship before any rand amount is shown to the company.
