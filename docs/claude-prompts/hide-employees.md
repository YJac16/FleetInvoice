# Hide Employees from People (demo only)

Branch `feat/hide-employees-people` (`demo` @ 6963771). Open a **DRAFT** PR into `demo`. Never touch `main`, live fyx, or the database. Do not drop tables, delete rows, or change APIs / `services/employees.service.ts`.

People should list drivers (and users) only. Hide the admin Employees UI. Leave the passenger/employee portal (`/employee/*`) and Attendance untouched.

## UI

- `lib/navigation.ts`: remove or gate the People item Employees (`/employees`, `employees:view`). Keep Drivers and Users.
- `features/dashboard/components/dashboard-page.tsx`: hide the Employees StatCard and any Browse-modules tile for that item.
- Hide any other admin links to `/employees`. There is no `/people/employees` route; the page is `/employees`.

## Route

- `app/(dashboard)/employees/layout.tsx` today uses `guardModulePage(["passengers", "attendance"])`.
- Make `/employees` 404 (preferred, like other hidden modules) or redirect to `/drivers`.
- Keep `features/employees/**` in the repo.

## Out of scope

No changes to `app/(employee)/**`, `employee-shell.tsx`, or attendance pages. No migrations or plan/entitlement changes (`passengers` / `employees:view` stay).

## Tests

Update `tests/unit/module-guard-layouts.test.ts` and `tests/unit/module-guard-coverage.test.ts` (they assume `/employees` is reachable). Assert the nav item is hidden and `/employees` 404s or redirects. Run `npm run lint`, `npx tsc --noEmit`, `npm test`. Fix what you break. Draft PR into `demo`.
