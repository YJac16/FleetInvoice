# GoOps demo UI review captures — 25 Nov 2026

Source: [demo.goops.co.za](https://demo.goops.co.za), Jacobs Org. Captured with Playwright at **390×844 (phone) first**, then **1440×900 (desktop)**. Full-page PNGs. Times in the chrome are Africa/Johannesburg (SAST), about 14:14–14:20.

Roles:

- **jacobs-admin** — Jacobs organisation admin. A fresh login landed on Demo Yaseen Org; the header switcher was used, then the page was reloaded so the server picked up the org cookie.
- **jacobs-driver-zain** — Zain Demo driver. The driver shell has no org switcher, so the Jacobs Org cookie was set before `/driver`. After a 4s wait past load, the home still showed **0 trips** / **No trips assigned** (likely a genuine empty today; also relevant to the known 0-trips flash).

Credentials are not recorded here.

**How to use these shots:** design each screen for the 390px phone first, then say how it scales up to the 1440px desktop.

## Console and overflow

- One console error during the admin pass: `Failed to load resource: the server responded with a status of 400`. The request URL was not captured. The later vehicle / bill / driver recapture had no console errors.
- **Horizontal overflow (real layout):** `/trips` at 1440 — the trips table extends to ~1745px (`whitespace-nowrap` columns). `/drivers` at 1440 — the drivers table extends to ~2126px.
- **Horizontal overflow (minor):** `/drivers` at 390 — row action links sit about 29px past the left edge, so the first action reads as clipped (`pture` instead of `Capture`).
- Other listed pages: `document.scrollWidth` matched the viewport. Off-screen measuring can still flag sticky chrome or slightly overflowing buttons; treat the table overflows above as the clear issues.
- `/maintenance` redirects to `/maintenance/bills`. There is no separate maintenance overview. Vehicle detail is `/vehicles/:id/capture` (fleet), not a maintenance route. Trips have no `/trips/:id` page; “detail” is the Locations dialog on the list.

## Screens

Each pair is phone first, then desktop.

### Dashboard — `/dashboard` — jacobs-admin

- `admin-dashboard-390.png` — 390×844. Long stacked page: date chips, ops count tiles (this week: 9 completed, other ops tiles 0), Organisation counts including an **Employees** tile at 0, then a “Browse shortcuts” list that still includes Employees, Users, Places, Planning, Ops, Payroll, Membership. Top quick links are Dispatch, Trips, Attendance, Invoices — **no Maintenance shortcut**. Jacobs Org is in the header; the hamburger sits beside a cramped switcher.
- `admin-dashboard-1440.png` — 1440×900. Left sidebar (Overview / People / Fleet / Places / Planning / Ops / Finance / System) plus the same tiles and a “Browse modules” grid, still including Employees. Ops tiles in a row. No overflow.

### Trips list — `/trips` — jacobs-admin

- `admin-trips-list-390.png` — 390×844. Card list for this week’s staff waybills (Coastline, Mountain Shuttle, Metro Tech, Bay Hotel, Acme Logistics, etc.), each with Locations / Passengers. “Create waybill” and “Generate trips” at the top. Cards fit the width; no overflow.
- `admin-trips-list-1440.png` — 1440×900. Data table. **Overflow:** table width ~1745px against a 1440 viewport (nowrap headers/cells).

### Trip detail — `/trips` (Locations dialog; no `/trips/:id`) — jacobs-admin

- `admin-trips-detail-390.png` — 390×844. “Trip locations” panel opened from a list card (“Set GPS actions for this trip. Used on invoice print.” plus a Cape Town place search). The trip list remains in the full-page shot below the panel.
- `admin-trips-detail-1440.png` — 1440×900. Same dialog over the overflowing trips table.

### Invoices list — `/invoices` — jacobs-admin

- `admin-invoices-list-390.png` — 390×844. This-week cards: Demo Mountain Co R900 issued, owner **Unassigned**, driver blank; Demo WCL drafts for Freddy (Fadia, R300), Shaheed (Fadia, R1,380), Yaseen (Yaseen, R1,230). Owner filter chips (All / Yaseen / Fadia) and status chips. Actions wrap on the card (Lines, Print, Mark paid, Void). No overflow.
- `admin-invoices-list-1440.png` — 1440×900. Same week in a wider table/list. No overflow measured.

### Invoice print — `/invoices/:id/print` (Demo Mountain Co, R900) — jacobs-admin

- `admin-invoices-print-390.png` — 390×844. Print preview still shows the admin header. Footer/header supplier and banking still say **Demo Yaseen Org Accounts**. The company invoice names a single **DRIVER: PAULIN / REG NO: CA-DEMO-Y2**. Invoice date 25/11/2026; service 23/11–29/11. A banner notes email delivery is not configured on this environment. Two R450 lines, total R900. Line items stack as cards on the phone.
- `admin-invoices-print-1440.png` — 1440×900. Same print view, table layout for lines. No overflow.

### People / drivers — `/drivers` — jacobs-admin

- `admin-drivers-390.png` — 390×844. Driver cards (Freddy, Paulin, Shaheed, Yaseen, Zain). Row actions (Capture, Vehicle, Invoice issuer, Edit, Archive) are slightly clipped on the left. “Capture driver” / “Quick add” sit at the top.
- `admin-drivers-1440.png` — 1440×900. **Overflow:** table width ~2126px. People nav still implies Employees lives beside Drivers (see dashboard / sidebar).

### Maintenance overview — `/maintenance` → `/maintenance/bills` — jacobs-admin

- `admin-maintenance-overview-390.png` — 390×844. `/maintenance` redirects here. Workshop bills list: DEMO-WS-002 draft (Quantum Y2, R575) and DEMO-WS-001 final (Quantum Y1, R1,150). Tabs: Workshop bills / Suppliers. Export CSV + Add bill.
- `admin-maintenance-overview-1440.png` — 1440×900. Same list in a wider table. No overflow. There is no dedicated maintenance overview or due/overdue vehicle summary on this route.

### Maintenance vehicle — `/vehicles/:id/capture` (Demo Hiace F1) — jacobs-admin

- `admin-maintenance-vehicle-390.png` — 390×844. “Edit vehicle capture” for Demo Hiace F1 / CA-DEMO-F1, owner Fadia, van, capacity 10. Long stacked form (identity, documents, fleet details). Maintenance has no per-vehicle page, so this is the fleet capture screen.
- `admin-maintenance-vehicle-1440.png` — 1440×900. Same form, wider. No overflow.

### Maintenance bill — `/maintenance/bills/:id` (DEMO-WS-002) — jacobs-admin

- `admin-maintenance-bills-390.png` — 390×844. Draft bill detail: Demo Workshop Supplies, Quantum Y2, Demo brake check R500 + 15% VAT = R575. Actions: Edit, Finalise, Delete. No supplier file attached.
- `admin-maintenance-bills-1440.png` — 1440×900. Same detail, wider. No overflow.

### Reports — `/reports` — jacobs-admin

- `admin-reports-390.png` — 390×844. Period start/end shown as `11/23/2026` (US format). “Split by owner” and a type control labelled Trips (not opened in this capture; Product had reported the type dropdown would not open). Completed-trip rows, then “At a glance” counts that still include an **Employees** tile at 0.
- `admin-reports-1440.png` — 1440×900. Same report, wider. No overflow measured.

### Settings — `/settings` — jacobs-admin

- `admin-settings-390.png` — 390×844. Organisation name/slug already Jacobs Org / `jacobs-org`. Invoice print / banking / contact footer still use **Demo Yaseen Org** labels. Service locations (Cape Town metro) at the bottom. Long single column.
- `admin-settings-1440.png` — 1440×900. Same sections, wider. No overflow.

### Driver home — `/driver` — jacobs-driver-zain

- `driver-home-390.png` — 390×844. “Today · 0 trips”, “No trips assigned”, “No trip today”. Header: ZAIN DEMO, clock, theme/bell/sign-out. Bottom tab bar: Today, Log, Mine, Week, Profile. No overflow. No org switcher in this shell.
- `driver-home-1440.png` — 1440×900. The same phone-width column (max-width layout) centred on a large empty canvas, with the tab bar still at the bottom of the viewport rather than a desktop nav.
