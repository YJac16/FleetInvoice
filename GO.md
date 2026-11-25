# GO.md

Read `docs/ui-review/goops-ui-review-2026-11-25.md` §§10, 11 (dates), 13, 14 (preview), 18, 19 (one clock), 20, 21. Order: 21, 18, 19, 20, 13, 11, 14, 10, then ⋯.

Demo only. Minimal; remove before adding; mobile-first 390 then 1440. No invoice/trip logic, pricing, money calc, invoice dates, or migrations. No data deletion. Don't touch main/fyx/tggx/prod. Real data only; never fake.

- 21: find and fix the admin-pass console 400.
- 18: hide PortalClock below `sm`.
- 19: header clock only; subtitle "N trips today". No desktop shell.
- 20: remove Reports "At a glance".
- 13: SA dates (no US mm/dd); plain wording for "end (exclusive)"; fill Route; add Driver.
- 11: `dd MMM yyyy` display; no US mm/dd inputs (`SastDateInput`). Dates only — no layout/tabs.
- 14: Settings live print preview.
- 10: §10 layout. "Morning, <first name>" + real summary: unpaid/issued invoices (count + total); vehicles due/overdue (omit if no demo data); drivers' trips this week. No charts.
- ⋯: PR #101 `align="end"` squeezed left on mobile cards. Fix alignment and min-width.

Files: app-header, portal-clock, driver-today-page, reports-page, reports.service, vehicle-capture-form, sast-date-input, settings-page, invoice-print-view, dashboard-page, dashboard.service.

Tests: date formatting; Reports Driver/Route; dashboard summary queries (org-scoped, role-respecting; drivers never see prices or money).

Run lint, tsc, and npm test. Delete GO.md. Open ONE draft PR into demo titled "UI do-now pass (demo only)". No merge.
