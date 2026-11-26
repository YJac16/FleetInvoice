# GoOps UI review — layout and setup (25 Nov 2026)

**Status:** proposal only. No code changes on this branch.
**Branch:** `docs/ui-review-2026-11-25`.
**Inputs:**
- the 24 captures in `docs/ui-review/2026-11-25/`. The PNGs are not committed, so I viewed the copies embedded in the five sibling `.md` files. Every phone and desktop shot was checked.
- the Product plan `docs/ui-review/charts-plan.md`.
- the app code on this branch.

**Focus:** invoices, fleet maintenance, drivers. Employees are being retired from the UI. That means hide them from view only: no table drops and no data deletes.
**Method:** every item is designed for the **390px phone first**, then scaled up to **1440px desktop**.

## Slotting rules (from `charts-plan.md`)

- **Now (demo):** layout, nav and copy changes that don't touch invoice, trip, print or pricing logic.
- **Jacobs freeze, Mon 30 Nov – Mon 7 Dec:** no invoice or trip UI churn except a true P0. Jacobs Org goes live **Fri 4 Dec**.
- **After 7 Dec:** invoice and trip layout work, and the charts (recharts, role-gated, ≤300ms motion, reduced-motion safe).
- Nothing goes live without Yaseen's go.

Effort: **S** ≤ ½ day · **M** ½–2 days · **L** > 2 days.

## Summary

| # | Pri | Item | Effort | Slot |
|---|---|---|---|---|
| 1 | P0 | Invoice print shows **Demo Yaseen Org** supplier and banking for Jacobs Org | S | Now (true P0, before 4 Dec) |
| 2 | P0 | Hide Employees from People nav, dashboard, reports and shortcuts | S | Now |
| 3 | P0 | Invoice **Void** is one unconfirmed tap next to Print | S | Now (true P0) |
| 4 | P0 | Drivers: row actions clipped on phone, table 2126px wide on desktop | M | Now |
| 5 | P0 | Driver home shows "0 trips" while still loading | S | Now |
| 6 | P1 | Invoice print page: on phone the document starts below the fold | M | After 7 Dec |
| 7 | P1 | Invoices list: money formatting, card hierarchy, filter labels, Paid filter, week total | M | After 7 Dec |
| 8 | P1 | Invoice list driver/owner disagrees with the print ("—" vs "DRIVER: PAULIN") | M | After 7 Dec |
| 9 | P1 | Maintenance has no overview (`/maintenance` → bills) | M–L | After 7 Dec (counts today; spend after Drop 1) |
| 10 | P1 | Dashboard: focus on invoices / maintenance / drivers; compact tiles on phone | M | Now (layout), charts after 7 Dec |
| 11 | P1 | Vehicle capture: long single column, US date inputs, no maintenance link | M | Now (dates), rest with Drop 1.5 |
| 12 | P1 | Trips table 1745px wide on desktop | S–M | After 7 Dec (trip UI) |
| 13 | P1 | Reports: US dates, "end (exclusive)", blank Route, no Driver column | S–M | Now |
| 14 | P1 | Settings: no preview of what prints; long phone column | M | Now (preview), after 7 Dec |
| 15 | P1 | Trip locations dialog: current AREA not shown; placeholder truncated | S | After 7 Dec |
| 16 | P1 | No invoice number on the printed invoice | L | Decision needed |
| 17 | P2 | Maintenance bills list / bill detail: phone polish | S | After 7 Dec |
| 18 | P2 | Admin header on phone: switcher squeezed by the clock | S | Now |
| 19 | P2 | Driver home: three clocks; copy; desktop canvas | S / M | Now / later |
| 20 | P2 | Reports "At a glance" duplicates the dashboard; long phone card list | S | Now |
| 21 | P2 | Unexplained console 400 on the admin pass | S | Now |

---

## P0

### 1. Invoice print shows the wrong supplier and banking (Jacobs Org prints as "Demo Yaseen Org Accounts")

**Before:** `admin-invoices-print-390.png`, `admin-invoices-print-1440.png`, `admin-settings-390.png`, `admin-settings-1440.png`

**Problem:** Settings → Supplier name is **Jacobs Org**, but the printed header says **Demo Yaseen Org Accounts**. There are two causes:

- **Code:** `resolvePrintSupplierName` (`features/invoices/lib/invoice-print-settings.ts:133`) ignores the supplier name when it equals the organisation name. It then falls back to the contact name, which is still the demo value.
- **Data:** Jacobs Org's banking and contact footer are still the Demo Yaseen values (`DEMO-BANK`, `Demo Yaseen Org`, `accounts@demo-yaseen…`).

An invoice to a real client with another org's banking details is a live-money risk on 4 Dec.

**After — phone (390):**
- The print header uses the Supplier name exactly as typed. It falls back to contact or account name only when Supplier name is empty.
- Settings → Invoice print gets a **"Prints as"** summary card at the top of the section: supplier name, bank, account name and number (masked to the last 4), contact email. It's one tap-to-expand card.
- If any banking or contact field still contains "Demo", show an amber warning on that card.

**After — desktop (1440):**
- Same rule. The "Prints as" card sits in a right-hand column beside the Invoice print form (see #14), so the preview stays visible while editing.

**Setup (not code):** someone with admin access re-enters Jacobs Org's banking and contact footer in Settings before rehearsal (Thu 3 Dec). This is a settings edit, not a DB migration.

**Effort:** S.

**Files:**
- `features/invoices/lib/invoice-print-settings.ts` (`resolvePrintSupplierName`; plus a unit test next to the existing print-settings tests)
- `features/settings/components/settings-page.tsx` ("Prints as" card)

**Slot:** true P0. This is a print-logic change, so it needs Yaseen's explicit go during the freeze.

### 2. Hide Employees everywhere a user sees it (no data change)

**Before:**
- `admin-dashboard-390.png`: Employees tile at 0, and Employees in "Browse modules".
- `admin-dashboard-1440.png`: Employees tile and Browse grid.
- `admin-drivers-1440.png`: the People sidebar lists Users / Drivers / **Employees**.
- `admin-reports-390.png`, `admin-reports-1440.png`: Employees tile in "At a glance".

**Root cause:**
- `lib/entitlements.ts` already says the `passengers` module (Employees screen, employee hub) is hidden from the product and never fails open.
- But the Employees nav item in `lib/navigation.ts` has no explicit module. So `moduleForPermission("employees:view")` returns **`core`**, and the item shows for everyone.
- The dashboard and reports tiles are not gated at all.

**After — phone (390):**
- The hamburger sheet's People group shows **Drivers, Users**. Drivers comes first because it is a focus area.
- The dashboard Organisation tiles drop Employees.
- "Browse modules" loses Employees, because it is built from `MAIN_NAV`.
- Reports "At a glance" drops Employees.

**After — desktop (1440):**
- Same set. The sidebar's People group is Drivers, Users.

**Do not change:**
- The `/employees` route guard (`app/(dashboard)/employees/layout.tsx` allows `passengers` **or** `attendance`), so attendance flows and deep links keep working.
- The `employees` table and `getDashboardCounts` query. Leave the count in the payload; just don't render it.

**Open question:** Attendance (quick link and Ops nav) is employee boarding. Hide it too? I recommend dropping the dashboard **quick link** now (#10) and leaving the Ops nav item until Product decides.

**Effort:** S.

**Files:**
- `lib/navigation.ts` (pass `"passengers"` as the Employees item's module; put Drivers before Users)
- `features/dashboard/components/dashboard-page.tsx` (gate the Employees `StatCard` on `canModule("passengers")`)
- `features/reports/components/reports-page.tsx:572` (same gate)
- Optionally `features/reports/components/reports-page.tsx:170`: the "Employee" column in the attendance report, which stays because it is attendance data.

### 3. Invoice Void needs a confirm

**Before:** `admin-invoices-list-390.png` (Lines · Print · Mark paid · **Void** in one wrapped row), `admin-invoices-list-1440.png`

**Problem:** `invoices-page.tsx:428–440` calls `statusMutation.mutate({ status: "void" })` straight from a ghost button. On a phone, Void sits about 8px from Print and Mark paid. There is no undo in the UI.

**After — phone (390):**
- Void moves into a **⋯ More** menu at the right of the card's action row.
- Choosing it opens the existing `ConfirmDialog` as a bottom sheet: "Void invoice for Demo Mountain Co, R900.00? This can't be undone." The Void button is destructive-styled; Cancel is the default focus.

**After — desktop (1440):**
- The same ⋯ menu sits in the last column, with the same centred confirm dialog.

**Effort:** S.

**Files:**
- `features/invoices/components/invoices-page.tsx`
- `components/shared/confirm-dialog.tsx` (reuse)

**Slot:** true P0. It is a guard on a destructive action, not a logic change.

### 4. Drivers list: clipped actions on phone, 2126px table on desktop

**Before:** `admin-drivers-390.png` ("pture" for Capture on every card), `admin-drivers-1440.png` (columns run past "Assigned v…"; Linked user, Status and every action are off-screen)

**Root cause:**
- `components/shared/entity-crud-page.tsx:153` wraps row actions in `flex justify-end gap-2` with no wrap. Five ghost buttons overflow the card to the **left**.
- On desktop, 11 `whitespace-nowrap` columns (`components/ui/table.tsx:73,86`) plus the actions add up to about 2126px.

**After — phone (390):**
- **Card header:** name, then the status badge, then the owner chip, on one line.
- **Body:**
  - **Phone**: a `tel:` link.
  - **Vehicle**: "Demo Quantum Y1 · CA-DEMO-Y1", or "Not assigned" with an inline *Assign* link.
  - **Papers**: one row with two compact badges, "Licence: Not captured" and "PrDP: Not captured", red or amber when expired or due.
- **Moved off the card:** Email, License no., Code and Linked user move to the driver detail (`/drivers/[id]`). They are not decision data on a list.
- **Actions:** one primary **Capture** button full-width-left, plus a **⋯** menu (Vehicle, Invoice issuer, Edit, Archive).
- **Fix for every CRUD page:** the actions container becomes `flex flex-wrap justify-start gap-2` on mobile.

**After — desktop (1440):** 8 columns that fit in about 1150px of content width:
- **Driver**: name, with email as a muted second line.
- **Phone**.
- **Licence**: number and code, e.g. "DEMO-LIC-2102 · C1".
- **Papers**: Licence and PrDP badges together.
- **Owner**.
- **Vehicle**.
- **Status**.
- **Actions**: Capture plus ⋯.

The header row keeps "Capture driver" as primary, with "Quick add" and "Import CSV" as outline buttons. Today there are two dark primaries side by side (`admin-drivers-1440.png`).

Also fix the label clash: "License" (number) and "Licence" (expiry) are two columns with two spellings. Use **Licence** (en-ZA) throughout, and call the expiry column **Papers**.

**Effort:** M.

**Files:**
- `features/drivers/components/drivers-page.tsx` (columns 112–163, row actions, header buttons)
- `components/shared/entity-crud-page.tsx:153` (wrap)
- `components/shared/data-table.tsx` (mobile action row alignment)
- Allow a `className` on cells so a column can opt out of `whitespace-nowrap` (`components/ui/table.tsx`)

### 5. Driver home says "0 trips" before the trips have loaded

**Before:** `driver-home-390.png` (blue route-progress bar still running at the top while the header says "Today · 0 trips"), `driver-home-1440.png`

**Root cause:** `tripCountLabel` (`features/driver-portal/components/driver-today-page.tsx:174`) is built from `trips.length`, and `trips` is `tripsQuery.data ?? []`. So it says "0 trips" while the query is pending. This is the known 0-trips flash.

**After — phone (390):**
- While `showTripsSkeleton` is true, the subtitle reads "Loading trips…" with a skeleton line. Once loaded it shows "2 trips · 14:20 SAST".
- The "No trips assigned" card only renders after a successful load. That is already true; keep it.

**After — desktop (1440):** same. See #19 for the desktop shell.

**Effort:** S.

**Files:**
- `features/driver-portal/components/driver-today-page.tsx`

---

## P1

### 6. Invoice print page: put the invoice first on phones

**Before:** `admin-invoices-print-390.png` (the sheet starts around y=665; the first screen is all the download/email panels), `admin-invoices-print-1440.png`

**After — phone (390):**
- **Top:** a slim bar: ← Invoices, then the invoice title ("Demo Mountain Co · R900.00 · Issued").
- **Then the invoice sheet,** straight away:
  - Reduce the sheet padding from `p-8` to `p-4` on mobile.
  - Line cards keep the current stacked layout.
  - The total row is sticky inside the sheet's bottom when it is long.
- **Sticky bottom action bar,** safe-area aware: **Download PDF** (primary) · **Print** · **Email**.
- **Email** opens the current `InvoiceDeliveryPanel` as a bottom sheet. The "email delivery not configured" notice lives inside that sheet, and the Email button is disabled with a short reason.
- The "Download before you email" card is removed; its hint moves into the email sheet.

**After — desktop (1440):**
- Two columns inside the content area: the sheet on the left (`max-w-3xl`) and a 320px sticky right rail with Download / Print / Email and the delivery form.
- This also removes the 300px empty gutters visible in the capture.
- Print CSS is unchanged (the rail is `print:hidden`).

**Effort:** M.

**Files:**
- `features/invoices/components/invoice-print-view.tsx`
- `features/invoices/components/invoice-delivery-panel.tsx`
- `features/invoices/components/invoice-print-page.tsx`

### 7. Invoices list: hierarchy, money format, filters, week total

**Before:** `admin-invoices-list-390.png`, `admin-invoices-list-1440.png`

**Problems:**
- Totals render as `ZAR 1380` (`invoices-page.tsx:392` uses `` `${currency} ${total}` ``). Maintenance already shows `R1,150.00` through `formatZarAmount` (`features/invoices/lib/invoice-print-format.ts`).
- There are two unlabelled chip rows that both start with "All".
- There is no **Paid** status filter (`invoice-list-filters.tsx:11–16`), although Mark paid exists.
- Newest/Oldest sits above the date chips, looking like a primary filter.

**After — phone (390):**
1. **Header:** "Invoices", then the primary **Generate period** with **Generate driver week** as outline. (Whether these are shown at all follows the charts-plan item 3, staff-only generate.)
2. **Week summary strip** (admin/owner only): "4 invoices · R3,810.00", plus small counts "1 issued · 3 draft". Tapping a count sets the status filter. After 7 Dec, the plan's **Weekly billings** bar chart (admin/owner only) goes here, collapsed by default on phone.
3. **Date chips** (unchanged).
4. **Filters:** one horizontally scrollable row with a **Status ▾** chip (All / Draft / Issued / **Paid** / Void), an **Owner ▾** chip (All / Yaseen / Fadia) and **Sort ▾**. Each chip shows its current value ("Status: All").
5. **Cards:**
   - Line 1: **Bill to**, with the **total** right-aligned (`R1,380.00`, tabular).
   - Line 2: status badge · owner chip · driver.
   - Line 3: period.
   - Actions: one status-driven primary (Draft → **Lines**, Issued → **Mark paid**), **Print**, and ⋯ (Void, see #3).

**After — desktop (1440):**
- The summary strip becomes three small stat cards in a row (count, billed, outstanding).
- The weekly billings chart goes to their right, after 7 Dec.
- The table keeps its columns, plus a right-aligned, tabular Total.
- The filters sit in one toolbar row with the search field.

**Effort:** M.

**Files:**
- `features/invoices/components/invoices-page.tsx`
- `features/invoices/components/invoice-list-filters.tsx`
- `features/invoices/lib/invoice-print-format.ts` (reuse `formatZarAmount`)
- `components/shared/stat-card.tsx`

### 8. Invoice list driver/owner vs the printed invoice

**Before:** `admin-invoices-list-390.png` (Demo Mountain Co: Driver "—", Owner **Unassigned**), `admin-invoices-print-390.png` (the same invoice prints **DRIVER: PAULIN / REG NO: CA-DEMO-Y2**)

**Problem:** the print resolves driver and reg from the trip lines (`resolveDriverLabel` / `resolveVehicleReg`), but the list only reads `invoices.driver_id`. Ops see "Unassigned" on an invoice that prints a driver.

**After — phone and desktop:**
- The list shows the same resolved driver as the print: "Paulin Demo", or "Multiple (3)" when lines span drivers.
- Owner falls back to the resolved driver's owner tag.
- Keep the "Unassigned" chip only when no line has a driver.

**Effort:** M. It needs line data in the list query, or a small view or RPC, so check the query cost first.

**Files:**
- `features/invoices/components/invoices-page.tsx` (columns 368–378)
- the invoices service list query
- `features/invoices/components/invoice-print-view.tsx` (share the resolver)

### 9. Maintenance overview (replace the redirect)

**Before:**
- `admin-maintenance-overview-390.png` and `admin-maintenance-overview-1440.png`: `/maintenance` → `/maintenance/bills`, so there is no due/overdue view.
- `admin-maintenance-vehicle-390.png`: the vehicle page is fleet capture, with no maintenance on it.

**After — phone (390),** `/maintenance` becomes an **Overview** tab next to Workshop bills and Suppliers:
1. **Papers coming due:** a compact horizontal stacked bar (overdue / ≤30 / ≤60 / ≤90 days), with counts only. Each segment links to `/compliance` filtered. Data: `list_compliance_renewals` (the charts plan's "Papers by urgency"), available today. The empty state says "All papers in date".
2. **To do:** "1 draft bill to finalise" → the bills list filtered to Draft.
3. **This month's workshop spend:** admin and owner only (charts-plan role rule), shown as one number. It becomes the plan's stacked "Workshop spend by category / month" once Drop 1 bills exist. Until then: "No final bills yet".
4. **Recent bills:** the last 3 bill cards, then "All bills →".

**After — desktop (1440):**
- A 3-column KPI row (Papers overdue · Due ≤30 days · Drafts to finalise), plus spend for admin.
- Below it, the papers chart (left, 2/3) and recent bills (right, 1/3).
- With Drop 1.5, the **Service due mix** chart joins the row.
- Add **Maintenance** to the dashboard quick links (#10).

**Effort:**
- M for the overview with counts and recent bills.
- +S for the admin spend number.
- Charts per the plan's estimates.

**Files:**
- `app/(dashboard)/maintenance/page.tsx` (replace the redirect)
- new `features/maintenance/components/maintenance-overview.tsx`
- `features/maintenance/components/maintenance-tabs.tsx` (add Overview)
- `features/maintenance/lib/queries.ts`
- `features/compliance/*` (reuse the renewals query)

### 10. Dashboard: lead with the three focus areas, compact on phone

**Before:** `admin-dashboard-390.png` (3762px tall: five full-width ops tiles, seven full-width org tiles including Sites 0, Pickup points 0, Employees 0, then a 30-row module list that repeats the sidebar), `admin-dashboard-1440.png`

**After — phone (390):**
1. **Quick links** (one scroll row): **Invoices · Maintenance · Drivers · Trips**, each gated by permission and module. Drop Attendance (employee boarding) and add Maintenance (`canModule("maintenance")`).
2. **Date chips.**
3. **Operations:**
   - A **2-column grid** (`grid-cols-2`) of compact tiles: In progress, Assigned, Planned, Completed.
   - **Unassigned** spans both columns, highlighted when > 0.
   - About 360px instead of about 640px.
   - After 7 Dec: the plan's **Trip mix** stacked bar per day (non-drivers).
4. **Fleet & people:**
   - A 2-column grid: Drivers, Vehicles, plus **Papers due ≤30 days** (counts, from `list_compliance_renewals`) and **Draft invoices** (admin/manager).
   - Sites, Pickup points and Users move out of the tiles; they stay reachable from the nav.
   - Hide zero-value tiles for modules the org doesn't use.
5. **Browse modules:** collapsed behind an "All modules" disclosure on phone, because it duplicates the hamburger sheet.

**After — desktop (1440):**
- Ops tiles stay in one row of 5.
- Fleet & people becomes a row of 4.
- The Trip mix chart (left, 2/3) and the **Compliance coming due** chart (right, 1/3) sit under them (after 7 Dec).
- **Hide "Browse modules" at `md` and up.** The sidebar already gives the same links, and it is 750px of the 1616px page.

**Effort:** M for layout. Charts per `charts-plan.md` (1.5–2.5 days with invoices).

**Files:**
- `features/dashboard/components/dashboard-page.tsx`
- `components/shared/stat-card.tsx` (a `size="compact"` variant: smaller value, less padding)
- `components/shared/card-grid-skeleton.tsx` (match the grids)
- `services/dashboard.service.ts` (papers-due and draft-invoice counts)

### 11. Vehicle capture: dates, layout, link to maintenance

**Before:** `admin-maintenance-vehicle-390.png` (2126px of stacked inputs; dates show `mm/dd/yyyy`), `admin-maintenance-vehicle-1440.png` (a 430px form column centred in about 1150px, with large empty gutters)

**After — phone (390):**
- **Header:** "Demo Hiace F1 · CA-DEMO-F1", with an owner chip and a status badge.
- **Segmented tabs:** **Details · Papers · Maintenance**.
  - **Details:** Registration & identity and Fleet details as collapsible sections. The first section is open; the others show a one-line summary, e.g. "Van · 10 seats · Fadia".
  - **Papers:** licence disc and operating permit, each as a card with expiry, document status and Take photo / Upload. Roadworthy quick entry (charts plan item 5, Drop 1.5) goes here.
  - **Maintenance:** this vehicle's workshop bills (list plus "Add bill" prefilled with the vehicle), then service-due once Drop 1.5 lands.
- **Sticky bottom "Save changes" bar,** shown only when the form is dirty.
- **All date fields use `SastDateInput`** (`components/shared/sast-date-input.tsx`, en-ZA `dd/mm/yyyy`) instead of native `type="date"`.

**After — desktop (1440):**
- Tabs across the top.
- Details is a 2-column field grid (`md:grid-cols-2`) at full content width; Papers is 2 cards side by side.
- The Save bar is right-aligned in the page header.

**Effort:**
- S for the date inputs (do now).
- M for the tabs and layout.
- The Maintenance tab needs a bills-by-vehicle filter (S on top).

**Files:**
- `features/vehicles/components/vehicle-capture-form.tsx` (lines 120, 134)
- `features/vehicles/components/vehicle-capture-screen.tsx`
- `features/vehicles/components/vehicle-documents-dialog.tsx` (192, 309)
- `features/maintenance/components/bills-list.tsx` (vehicle filter)
- `features/maintenance/lib/queries.ts`

### 12. Trips table width

**Before:** `admin-trips-list-1440.png` ("Entered by" is cut off; Status and actions are off-screen at about 1745px), `admin-trips-list-390.png` (cards are fine)

**After — phone (390):**
- Keep the cards.
- Merge Planned start and Planned end into one **When** row ("27 Nov · 17:00–18:00").
- Put **Status** in the card header beside the title, and move "Entered by" to a muted footer line.
- This cuts each card from about 290px to about 200px.

**After — desktop (1440):** columns **Route · When · AREA (wraps, max 2 lines) · Driver · Status · actions**.
- "Entered by" becomes a muted second line under Route, or shows only at `2xl`.
- Let AREA opt out of `whitespace-nowrap`.

**Effort:** S–M.

**Files:**
- `features/trips/components/trips-page.tsx` (columns 141–192)
- `lib/trip-columns.ts`
- `components/ui/table.tsx` (cell opt-out, shared with #4)

### 13. Reports: dates, end date, route, driver

**Before:** `admin-reports-390.png`, `admin-reports-1440.png`

**Problems:**
- The period inputs are native `type="date"`, so they show `11/23/2026` (`reports-page.tsx:521,527`).
- "Period end (exclusive)" shows **29 Nov** while the dashboard says "23 Nov – 29 Nov" inclusive.
- The **Route** column is blank for staff waybills, because `services/reports.service.ts:181` only reads `routes?.name`. The trips list shows "Staff waybill · Demo Coastline" for the same rows.
- There is no **Driver** column, although drivers are a focus area.
- The type dropdown was reported not to open. It was not opened in this capture, so re-test it at 390.

**After — phone (390):**
- **Collapsed filter card:** "Trips · 23–29 Nov · All owners" with an Edit button. Expanded, it shows the type, the date chips (same `DateRangeFilter` as the other pages), Owner, and Run.
- **Download CSV** moves into the results header.
- "Split by owner" stays as is.
- **Results are compact rows:** "27 Nov 17:00 · Staff waybill · Demo Coastline", then "Shaheed Demo · Fadia". Status shows only when it isn't Completed.

**After — desktop (1440):**
- The filter bar stays in one row, but with `DateRangeFilter`/`SastDateInput` and an **inclusive** end date (convert to exclusive in the query).
- Table columns: Planned start · Route · **Driver** · Owner · Status · Entered by.

**Effort:** S–M.

**Files:**
- `features/reports/components/reports-page.tsx`
- `services/reports.service.ts` (route label fallback via the same helper the trips list uses; add driver)
- `features/reports/lib/*`

### 14. Settings: show what prints; shorter on phone

**Before:**
- `admin-settings-390.png`: 2520px; 4 save buttons spread down one column.
- `admin-settings-1440.png`: the form uses about 670px of about 1150px.

**After — phone (390):**
- **Sticky section chips** under the title: Organisation · Logo · **Invoice print** · Locations.
- Invoice print starts with the **"Prints as"** card from #1, then the Supplier / Banking / Contact / Print defaults groups as collapsible blocks.
- Each section's Save is sticky at the bottom of its section while it is dirty.

**After — desktop (1440):**
- Form column on the left (`max-w-2xl`).
- Right column: a sticky **live invoice header and footer preview**. It reuses the header and banking blocks of `invoice-print-view.tsx` at small scale, so ops can see the banking before saving.

**Effort:** M.

**Files:**
- `features/settings/components/settings-page.tsx`
- `features/invoices/components/invoice-print-view.tsx` (export the header and footer pieces)
- `features/settings/components/service-locations-settings.tsx`

### 15. Trip locations dialog

**Before:**
- `admin-trips-detail-390.png`: the search input is empty and no current places are shown, although the card says "Demo Coastline Office → Demo Beach Road". The placeholder is cut to "(/ for multi-dr".
- `admin-trips-detail-1440.png`.

**After — phone (390):**
- A full-width **bottom sheet**.
- Current AREA places as removable chips at the top.
- A search field with the short placeholder "Search places", and the multi-drop hint as helper text under it.
- **Save** pinned to the bottom of the sheet.

**After — desktop (1440):** the same content in the existing centred dialog (480px).

**Effort:** S.

**Files:**
- `features/trips/components/trip-locations-dialog.tsx`
- `features/locations/components/location-input.tsx`

### 16. No invoice number on the print

**Before:** `admin-invoices-print-390.png`, `admin-invoices-print-1440.png`. The header has a date and a service period, but no invoice number.

**Problem:** I found no invoice-number column in `types/` or the migrations, so this is not just layout. Many SA clients' AP teams will expect one.

**After:**
- **Phone:** "Invoice **INV-2026-0042**" as the first line of the right-hand header block, stacked above the date.
- **Desktop:** the same line, right-aligned.

**Effort:** L. It needs a sequenced per-org number, a migration and print changes.

**Decision for Yaseen:** needed before go-live or not. If not, leave it out of the freeze.

**Files:**
- a new migration
- `features/invoices/components/invoice-print-view.tsx`
- `features/invoices/components/invoices-page.tsx`

---

## P2

### 17. Maintenance bills list and bill detail polish

**Before:** `admin-maintenance-overview-390.png` / `-1440.png` (list), `admin-maintenance-bills-390.png` / `-1440.png` (detail)

**After — phone (390):**
- **List:** a Draft / Final status chip row above the cards. The card header shows the supplier with the total right-aligned and the bill number under it. Drafts sort first.
- **Detail:**
  - Show the Draft badge as a badge, not plain text beside the buttons.
  - Keep **Finalise** as primary in a sticky bottom bar; move **Delete** into ⋯.
  - Edit stays as an outline button.
  - The Supplier bill upload card is fine.

**After — desktop (1440):**
- **List:** the same filter chips in the toolbar, and right-align "Total incl. VAT".
- **Detail:** actions stay in the header, with Delete in ⋯.

**Effort:** S.

**Files:**
- `features/maintenance/components/bills-list.tsx`
- `features/maintenance/components/bill-detail.tsx`
- `features/maintenance/components/delete-bill-button.tsx`
- `features/maintenance/components/bill-status-badge.tsx`

### 18. Admin header on phone

**Before:** `admin-dashboard-390.png`. The hamburger, org switcher, a two-line clock, the bell and the avatar all share 390px, and the switcher is squeezed.

**After:**
- **Phone (390):** hide `PortalClock` below `sm`. The page date chips already show the range, and the driver shell has its own clock. The switcher gets the space.
- **Desktop (1440):** unchanged.

**Effort:** S.

**Files:**
- `components/layout/app-header.tsx`
- `components/layout/portal-clock.tsx`

### 19. Driver home: clocks, copy, desktop canvas

**Before:** `driver-home-390.png` (the time appears three times: header "25 Nov 14:20", "0 trips · 14:20 SAST", and a right-aligned "14:20"), `driver-home-1440.png` (a phone-width column on a blank 1440 canvas, with the tab bar pinned at the bottom)

**After — phone (390):**
- Keep the header clock only. The subtitle becomes "2 trips today".
- Copy: "If you are not driving today, record it below" → "Not driving today? Tap below." The button sits inside the card.

**After — desktop (1440)** (drivers are mostly on phones, so this is low priority):
- At `md` and up, move the five tabs into the header as a horizontal nav.
- Widen the column to `max-w-2xl`.
- Keep the bottom bar below `md`.

**Effort:** S (phone), M (desktop shell).

**Files:**
- `features/driver-portal/components/driver-today-page.tsx`
- `components/layout/driver-shell.tsx` (lines 109–110, 163)

### 20. Reports "At a glance"

**Before:** `admin-reports-390.png` (seven full-width count cards under the report, about 900px), `admin-reports-1440.png`

**After:**
- Remove the section; these org counts belong on the dashboard (#10).
- If Product wants to keep it, use the same compact 2-column grid on phone and a row of 4 on desktop, with Employees hidden (#2).

**Effort:** S.

**Files:**
- `features/reports/components/reports-page.tsx` (around 560–600)

### 21. Console 400 during the admin pass

**Before:** noted in `index.md`; the URL was not captured. The later recapture was clean.

**After:** re-run the admin pass with request logging (Playwright `page.on('response')`) at 390 and 1440. Fix or document the failing call.

**Effort:** S.

**Files:** unknown until it is reproduced.

---

## Cross-cutting setup notes

- **Tables:** `components/ui/table.tsx` forces `whitespace-nowrap` on every head and cell. Add a per-column opt-out, and give each `DataTable` a column budget that fits about 1150px of content at 1440. The drivers and trips overflows (#4, #12) are both this.
- **Dates:** use `SastDateInput` / `DateRangeFilter` everywhere. Native `type="date"` renders US order in the capture browser (#11, #13).
- **Money:** use `formatZarAmount` for every rand value (#7). Respect the charts-plan role rules: no rands for drivers or ops on fleet cost.
- **Mobile action rows:** one primary action plus a ⋯ menu per card. Destructive actions always sit behind a confirm (#3, #4, #17).
- **Motion:** follow `charts-plan.md` section 2 only: `PageFadeIn`, count-up on `StatCard`, chart draw-in under 300ms, and `motion-reduce` off.
- **QA for every item:** 390px and 1440px screenshots, role checks (driver / ops / admin), and reduced motion.
