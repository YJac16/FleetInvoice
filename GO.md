# GO.md

Demo only. Minimal; phone-first (390 then 1440). No main/fyx/tggx/prod, no rate cards, no invoice or trip logic or pricing changes, no migrations, no DB writes. Drivers never see prices or money. Real data only; never fake. Nothing paid.

Open ONE **draft** PR into `demo` (never `main`) titled "Nav and visuals polish (demo only)". No merge. Delete GO.md (`git rm`) in the final commit. Run `npm run lint`, `npx tsc --noEmit`, and `npm test`; fix failures. After the build, do a self-review and list findings in the PR body (what you changed, what you left, a11y, any leftover overflow at 390, and any skipped item).

Keep current URL / query state (`useDateRangeFilter`, `usePreservedRangeHref`, `lib/date-range/search-params.ts`). Dropdowns must be accessible: native `<select>` or a labelled button+menu (`components/ui/select.tsx` or `components/ui/dropdown-menu.tsx` already in the repo). Keyboard OK (Tab, Enter/Space, Escape, arrows). Prefer CSS or inline SVG for charts — **do not add a chart library**; `package.json` has none (no recharts, chart.js, etc.). Honour `prefers-reduced-motion` / `motion-reduce:` (see `components/shared/page-fade-in.tsx`).

Breakpoint: compact dropdowns below `lg` (1024px). Keep the existing chips / tabs at `lg` and up. jsdom tests have no real viewport — keep the chip path working when `matchMedia` is missing, or mock it in tests, so existing tests still pass.

## (a) Desktop sidebar collapse

Today the desktop rail is a fixed `w-64` in `components/layout/app-sidebar.tsx`, mounted from `components/layout/app-shell.tsx` (`hidden … md:flex`; phones use the header sheet in `components/layout/app-header.tsx`). Group accordions already exist; that is not this task.

- Add a control that **collapses and expands the whole desktop sidebar** (icon-only vs expanded labels). Remember the state in `localStorage` (pick a new key; do not reuse `DEMO_BAR_STORAGE_KEY` in `components/demo/role-switcher-panel.tsx`).
- Phones stay unchanged: do not alter the `md:hidden` sheet menu in `app-header.tsx`, and do not persist or apply the rail collapse inside the sheet.
- Collapsed rail: icons + accessible names (tooltip or `sr-only`), a clear expand control, no clipped focus rings. Subtle width transition with `motion-safe` / `motion-reduce:transition-none`.
- Files: `components/layout/app-sidebar.tsx`, `components/layout/app-shell.tsx`. Touch `app-header.tsx` only if required to keep the sheet untouched.

## (b) Period chips and section pills at 390

Period chips live in `components/shared/date-range-filter.tsx` (`FilterChipRow`). Presets come from `DATE_RANGE_PRESETS` in `lib/date-range/sast-range.ts`: Today, Yesterday, This week, Last week, Custom. At 390 they wrap to two rows (`flex-wrap`). Hook: `hooks/use-date-range-filter.ts`. Custom already opens the existing panel (`SastDateInput` From/To + Apply) — keep that panel; the compact control should still open it when Custom is chosen.

Used on (at least):

- `features/dashboard/components/dashboard-page.tsx`
- `features/trips/components/trips-page.tsx`
- `features/invoices/components/invoices-page.tsx`

Also used on dispatch, company invoices, driver history, and staff-trips monitor. Changing `DateRangeFilter` covers them; do not regress those pages. Below `lg`, replace the chip row with one compact period dropdown (current preset as the label, e.g. "This week ▾"). Keep chips at `lg+`. Update `tests/unit/date-range-filter.test.tsx` (it currently clicks the "Custom" button).

**Dashboard "Jump to" pills:** the `quickLinks` row in `dashboard-page.tsx` (Invoices, Maintenance, Drivers, Trips, Dispatch — permission/module filtered; some links already use `rangeHref`). At 390 they overflow horizontally (`overflow-x-auto`, "Dispatch" is cut off). Below `lg`, replace that row with a single labelled **"Jump to"** dropdown that navigates to the same hrefs (preserve range query params). Keep the pills at `lg+`.

**Trips and Invoices filter chips, if they overflow at 390:**

- Invoices: `features/invoices/components/invoice-list-filters.tsx` — status chips (All / Draft / Issued / Void) and owner chips (`OWNER_FILTERS`). Same dropdown-below-`lg`, chips-at-`lg+` pattern. State stays in the page (`invoices-page.tsx`); do not put filter values in the URL unless they are already there.
- Trips: period is `DateRangeFilter` above. Also the Scheduled trips / Pending driver trips toggle on `trips-page.tsx` (`tripsTab`). If that row overflows or wraps badly at 390, use the same compact picker; otherwise leave it.

## (c) Maintenance section tabs at 390

`features/maintenance/components/maintenance-tabs.tsx`, rendered from:

- `app/(dashboard)/maintenance/bills/page.tsx` (Workshop bills)
- `app/(dashboard)/maintenance/due/page.tsx` (Due)
- `app/(dashboard)/maintenance/suppliers/page.tsx` (Suppliers)
- `app/(dashboard)/maintenance/vehicles/page.tsx` (Worth keeping; organisation_admin / platform owner only)

Real labels today: **Workshop bills**, **Due**, **Suppliers**, and **Worth keeping** when `showWorthKeeping` is set. `/maintenance` redirects to `/maintenance/bills`. The tab row is already `overflow-x-auto`. At 390, if a labelled section picker dropdown is clearer than the scrolling tabs, use the dropdown below `lg` and keep the tabs at `lg+`. Links and active state stay pathname-based (`aria-current="page"`). Do not drop Worth keeping for admins.

## (d) Tasteful at-a-glance visuals

Minimal, phone-first, no heavy deps.

- Simple CSS/SVG charts for **invoice totals** and **maintenance costs**, from real org-scoped data only. Invoice money is already in `getDashboardSummary` / `features/dashboard/lib/summary.ts` (`sumIssuedInvoices`) and `services/dashboard.service.ts`, gated on `invoices:view` (drivers never have it). Maintenance costs: Final workshop bills (`total_incl` via `features/maintenance/lib/queries.ts`). If you need a small read-only aggregate, add it next to the existing dashboard summary queries — no migrations, no writes, no invoice/trip calculation changes.
- Money charts only for roles that already see those amounts. Drivers must never see prices, totals, or cost charts. On Due, managers already see dates/km only (`includeCost: ctx.isAdmin` in `due/page.tsx`) — do not leak rand to them on the dashboard either.
- The older "no charts" note on `DashboardSummaryCards` (`features/dashboard/components/dashboard-summary.tsx`) is superseded for this polish; keep the real-number cards and add a small visual beside or below them. Update `tests/unit/ui-do-now-dashboard-summary.test.ts` if the shape changes.
- Use existing status badges (`components/shared/status-badge.tsx`, `features/maintenance/components/bill-status-badge.tsx`) where they help at a glance (ops/invoice/bill status). Do not invent statuses.
- Subtle transitions on sidebar collapse and chip/dropdown changes; no motion when the user prefers reduced motion.

## Tests and PR

Add or extend unit tests for: sidebar collapse + `localStorage` (desktop only), period dropdown (Custom still opens the existing panel; preset still updates the same URL state), Jump to hrefs, maintenance section picker, and that money charts are omitted without the right permission.

Draft PR into `demo`. Body must include the self-review. No merge to `demo` is required from you if the PR is up; do not touch `main` or production.
