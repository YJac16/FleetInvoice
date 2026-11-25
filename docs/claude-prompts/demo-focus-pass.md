# Demo focus pass (demo only)

Build on `feat/demo-focus-pass` (from `demo` @ 6963771). Open a **DRAFT** PR into `demo`. Never touch `main`, live fyx, invoice/trip logic, or the database. Prefer removing clutter to adding anything. Yaseen: keep this easy and minimal.

## Dashboard Maintenance shortcut

`features/dashboard/components/dashboard-page.tsx` has no Maintenance block today. The Fleet nav item and the Browse-modules tile already go to `/maintenance` when the org is entitled (`maintenance:view`).

Add **one** small, quiet card or text link on the dashboard, for example `Maintenance: 2 due, 1 overdue`, linking to `/maintenance`. No chart, no extra widgets, no second row of tiles. Leave plenty of whitespace.

- If due / overdue counts already exist in a service, show them in that one line. They do not today (no `service_due` / overdue helper on `demo`); do **not** invent a metrics pipeline, new tables, or compliance-style charts just to fill the example numbers.
- If counts are not already available, use a quiet `Maintenance` link with no dummy numbers.
- Do not add Maintenance KPI tiles, graphs, or a widget cluster. If Browse modules makes the page busy, it is better to leave that grid than to pile a new widget on top; only tighten it if a small cleanup clearly helps.

## Quality

`npm run lint`, `npx tsc --noEmit`, `npm test`. Fix what you break. 390px and desktop screenshots if possible. Draft PR into `demo` only.
