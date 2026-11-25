# Demo focus pass (demo only)

Build on `feat/demo-focus-pass` (from `demo` @ 6963771). Open a **DRAFT** PR into `demo`. Never touch `main`, live fyx, invoice/trip logic, invoice print driver/reg, invoice dates, or the database. Prefer removing clutter to adding anything. Yaseen: keep this easy and minimal.

## 1. Hide Employees from People

People should list drivers (and users) only. Hide the admin Employees UI. Do not drop tables, delete rows, or change APIs / `services/employees.service.ts`. Leave the passenger/employee portal (`/employee/*`) and Attendance untouched.

- `lib/navigation.ts`: remove or gate the People item Employees (`/employees`, `employees:view`). Keep Drivers and Users.
- `features/dashboard/components/dashboard-page.tsx`: hide the Employees StatCard and any Browse-modules tile for that item.
- Hide any other admin links to `/employees`. There is no `/people/employees` route; the page is `/employees`.
- `app/(dashboard)/employees/layout.tsx` today uses `guardModulePage(["passengers", "attendance"])`. Make `/employees` 404 (preferred, like other hidden modules) or redirect to `/drivers`.
- Keep `features/employees/**` in the repo.
- No changes to `app/(employee)/**`, `employee-shell.tsx`, or attendance pages. No migrations or plan/entitlement changes (`passengers` / `employees:view` stay).

### Regressions (must still work)

Add tests or explicit checks that all three still work after Employees is hidden:

- Staff-transport trips (`update_staff_trip`)
- The Attendance boardings report
- The `/employee/*` portal

Update `tests/unit/module-guard-layouts.test.ts` and `tests/unit/module-guard-coverage.test.ts` (they assume `/employees` is reachable). Assert the nav item is hidden and `/employees` 404s or redirects.

## 2. Dashboard Maintenance shortcut

`features/dashboard/components/dashboard-page.tsx` has no Maintenance block today. The Fleet nav item and the Browse-modules tile already go to `/maintenance` when the org is entitled (`maintenance:view`).

Add **one** small, quiet card or text link on the dashboard, for example `Maintenance: 2 due, 1 overdue`, linking to `/maintenance`. No chart, no extra widgets, no second row of tiles. Leave plenty of whitespace.

- If due / overdue counts already exist in a service, show them in that one line. They do not today (no `service_due` / overdue helper on `demo`); do **not** invent a metrics pipeline, new tables, or compliance-style charts just to fill the example numbers.
- If counts are not already available, use a quiet `Maintenance` link with no dummy numbers.
- Do not add Maintenance KPI tiles, graphs, or a widget cluster. If Browse modules makes the page busy, it is better to leave that grid than to pile a new widget on top; only tighten it if a small cleanup clearly helps.

## 3. Reports type label

On `/reports`, wire the 'Report' label to the type select trigger with `htmlFor` and `id`, so clicking the label opens the dropdown.

## 4. Driver home header skeleton

In `features/driver-portal/components/driver-today-page.tsx`, and the same in `DriverWeekPage`, show a placeholder or skeleton instead of '0 trips' while the trips query is pending.

## Quality

`npm run lint`, `npx tsc --noEmit`, `npm test`. Fix what you break. 390px and desktop screenshots if possible. Draft PR into `demo` only.

Delete `GO.md` in the PR.
