# Claude Code brief: GoOps UI review (proposal only)

Branch: `docs/ui-review-2026-11-25` (from `demo`). Do not touch `main`, production, or live DBs.

1. Read `docs/ui-review/2026-11-25/index.md`. View every screenshot there: the `.png` files if present, and the same images embedded in the sibling markdown files (`dashboard-trips-list.md`, `trips-detail-invoices.md`, `invoices-print-drivers.md`, `maintenance.md`, `reports-settings-driver.md`). Read the relevant app/feature code on this branch.
2. The Product charts/UI plan is already at `docs/ui-review/charts-plan.md` — use it.
3. Focus is invoices, fleet maintenance, and drivers only. Employees are going away: recommend hiding them from People, dashboard tiles, reports, and shortcuts. Do not drop tables or delete data.

**Mobile-first (required):** design each screen for the **390px phone first**, then say how it scales up to the 1440px desktop. `index.md` lists the phone shot first for every page.

Write `docs/ui-review/goops-ui-review-2026-11-25.md`: a prioritised P0/P1/P2 list of layout and setup improvements. Each item must have: before (screenshot filename), after (phone layout, then desktop scale-up), effort S/M/L, and files to change.

Make **NO code changes**. Commit **only** that review doc to this branch. No PR.
