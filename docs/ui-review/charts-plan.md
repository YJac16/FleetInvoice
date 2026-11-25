_Copied into this repo for the 25 Nov 2026 UI review from the Product plan `goops-charts-ui-pass-plan-2026-11-25.md`. Plan only; not implemented on this branch._

# GoOps charts, motion, and UI pass (Product, 25 Nov 2026)

**Status:** Plan only, read-only. No builds, commits, DB writes, or live changes.  
**Sources:** `YJac16/FleetInvoice` `package.json` on `demo` and `cursor/admin-goops-loading-a2d8` (PR #75); loader commit `8813bec` / head `cf7d125`; dashboard and reports code; demo Supabase `afeeqbcwwpquqjeowksa` (schema already inspected in the maintenance fit check); QA in `/workspace/bot-office/product/qa/` (especially `goops-demo-qa-rerun-2026-11-24.md` and `goops-demo-combined-qa-2026-11-25.md`).

**Library:** there is **no chart library** in `package.json` (`recharts`, Chart.js, Nivo, etc. are all absent). Motion already in the app: `tw-animate-css`, `PageFadeIn` (300ms, `motion-safe` / `motion-reduce:animate-none`), skeletons from PR #60, and Sonner toasts. **Add `recharts` only** (the usual shadcn chart wrapper). Do not add Framer Motion. Keep the loader's CSS animations.

**Role rules (every chart and KPI):**
- **Drivers** never see prices or revenue. No money charts on `/driver`.
- **Ops** (manager, dispatcher, supervisor): operational counts only. **No rands** on fleet cost, fuel spend, or profitability charts. Dispatcher and supervisor already cannot open `/invoices` or `/maintenance`.
- **Admin and platform owner** see money charts. Manager may keep seeing invoice *list* amounts (already allowed) but not fleet-cost or profitability charts (same split as the wear-forecast plan).

---

## 1. Charts per screen

No vanity charts. If the data is empty, show an empty state, not a decorative graphic.

### Dashboard (`/dashboard`) — data exists today

The page is count tiles only (`getDashboardOpsSummary` on `trips` + `getDashboardCounts`). No charts yet.

| Chart | Question | Data source (today) | Type | Who |
|---|---|---|---|---|
| Trip mix in the selected range | How is this week's work going? | `trips.planned_start`, `trips.status` (same range as the existing ops tiles: planned / assigned / in progress / completed / unassigned) | Stacked bar, one column per day | Anyone who can see the ops tiles (not drivers) |
| Compliance coming due | What papers are overdue or coming up? | `list_compliance_renewals` (`vehicle_disc`, `vehicle_permit`, `vehicle_document` including roadworthy, driver licence / PrDP) | Horizontal bar: overdue / ≤30 / ≤60 / 90 days | Admin, manager, dispatcher, supervisor — counts only, no rands |

**Not on the dashboard in this pass:** invoice revenue (belongs on Invoices), workshop or fuel spend (fleet/maintenance), employee/passenger counts (being hidden).

### Invoices (`/invoices`) — data exists today

| Chart | Question | Data source (today) | Type | Who |
|---|---|---|---|---|
| Weekly billings | What did we bill each week? | `invoices` + `invoice_lines.amount`, by `period_start` / `period_end`. Include draft + issued + paid; exclude void and deleted (same rule as profitability). Split the bar by status if useful. | Vertical bar, one column per week | Admin and owner (manager sees the table, not this money chart) |

One demo invoice already has 10 lines across 4 vehicles; this chart stays at **invoice-week totals**, not a per-vehicle split (that is Drop 2).

### Fleet / maintenance (`/maintenance`, `/compliance`, `/fuel`)

| Chart | Question | Data source | When | Type | Who |
|---|---|---|---|---|---|
| Papers by urgency | Which vehicles need a disc, permit, or roadworthy? | `list_compliance_renewals` + `vehicles.license_disc_expires_on` | **Today** | Stacked bar per urgency, or a small fleet heatmap of counts | Ops and admin — counts only |
| Fuel litres over time | How much are we putting in? | `fuel_fillups.litres`, `filled_at`, `vehicle_id` (ops columns; amounts stay behind `list_fuel_fillup_amounts`) | **Today** | Line, litres only | Ops and admin. **Rands** (`total_amount`) are a second admin/owner-only series, never shown to ops |
| Workshop spend by category / month | What is each car costing? | Final `workshop_bills` + `workshop_bill_lines` (`total_incl`, `category_id`, `bill_date`, `vehicle_id`) | **After Drop 1** is in use (demo/live history is ~0 bills until then; show empty) | Stacked bar, ZAR incl. VAT | Admin and owner only |
| Service due mix | What is overdue vs coming up, by part? | Drop 1.5 per-part schedules + `recompute_vehicle_odometer` | **Drop 1.5** | Stacked bar: overdue / due soon / ok / no interval | Ops (no rands) and admin |

### Profitability (Drop 2)

| Chart | Question | Data source | Type | Who |
|---|---|---|---|---|
| Contribution by vehicle | Is this car earning more than it costs? | Same attribution as section H: trip lines → open `trip_assignments.vehicle_id`, Final workshop `total_incl`, fuel `total_amount`, prorated `vehicle_fixed_costs`. Unassigned is its own bar. | Grouped bar: revenue vs costs, plus contribution | Admin and owner only |
| Margin over the last 3 months | Is the trend getting better or worse? | Same figures, by month | Line, margin % | Admin and owner only |

Wear Earlier / Normal / Later is a badge or count on this screen, not a fourth money chart. Estimated big-ticket costs stay a short list, not a graph, and only from his own past bills.

---

## 2. Animations

**The loader Yaseen liked** is not on `demo` or `main` yet. It lives in open **PR #75** (`cursor/admin-goops-loading-a2d8`, head `cf7d125`; introduced in `8813bec`). Files: `components/brand/goops-loader.tsx`, `components/admin/admin-loading.tsx`, `BusyButton`.

**Style:** the GoOps wordmark is drawn with a short rounded stroke along the official path, in the brand gradient (blue `#0056FC` → cyan `#00B4F3` → teal `#01C7C7` → green `#01F183`), then the raster mark (`/brand/goops-mark-ui.png`) fades in on top. The loop is 1.7s, ease-in-out. In buttons, a small `GoOpsSymbol` pulses (1.25s, scale 0.94–1). It already honours **`prefers-reduced-motion`** (static full-opacity mark, no draw, no pulse), uses `role="status"` / `aria-busy`, and stays off print. PR #75 also keeps a failed refresh from replacing real content with the loader.

**Small motion set, consistent with that mark:**

| Motion | What | Cap |
|---|---|---|
| Page / skeleton fade | Reuse `PageFadeIn` and the PR #60 skeletons under `AdminLoading`. Don't invent a second fade. | 300ms, `motion-safe` only |
| Count-up on KPI tiles | `StatCard` numeric values ease up once when data first arrives | ≤300ms; skip if reduced motion or the value isn't a number |
| Chart draw-in | Recharts bar/line enter | ≤300ms; `isAnimationActive={false}` when reduced motion |
| Button / press | `BusyButton` (xs GoOps mark + pending label, clicks ignored). Light opacity/scale on press | 150–200ms |
| Toast | Existing Sonner; same short ease, no extra library | ≤300ms |

No layout-shifting motion, no per-row looping loaders (PR #75 already stopped refetch flicker), and no animation work on 390px that janks the main thread — opacity and transform only. The 1.7s loader loop is for **page loads**, not for every table cell.

---

## 3. Top UI fixes (8 or fewer, ranked)

| # | Fix | Why | Priority |
|---|---|---|---|
| 1 | **Demo role bar on phones.** Default to the collapsed “Demo \<role\>” pill below ~768px, and reserve bottom/top space so it never covers nav or Sign out. | QA rerun 24 Nov: expanded bar on fresh load still covers Sign out at ~320px; collapsing via “x” works, but the default state fails. Driver bottom nav was also partly covered. | **P0** (demo only) |
| 2 | **Land PR #75 (GoOps loader) on demo.** Rebase onto current `demo` if needed. It does not change trip, invoice, pricing, or print data. | The loader he liked is still only on the PR branch, not on `demo` or `main`. | **P0** (demo first) |
| 3 | **Staff-only invoice generation.** Hide and gate “Generate” so only admin/owner (and manager if they already may) can start a weekly run; confirm drivers and other roles have no button and no RPC. | Standing demo follow-up. API may already refuse (00085); leftover is likely the button. Touches invoice UI, so **not during the Jacobs freeze**. | **P0**, after 7 Dec |
| 4 | **Bill form categories.** Until the 11 categories are seeded (Drop 1.5), don't hide the field: show an empty-state “Add categories” path. | `BillForm` hides the dropdown when `maintenance_categories` has 0 rows (true on demo today). | **P1**, with Drop 1.5 (seed is the real fix) |
| 5 | **Roadworthy expiry on the vehicle form.** Quick-entry date next to licence disc, stored in existing `vehicle_documents` (`doc_type = 'roadworthy'`). | Already decided in the maintenance plan (section G). Buried in the documents modal today. | **P1**, Drop 1.5 — don't rebuild it here |
| 6 | **Company picker showing a raw UUID** after select on the log/waybill form (QA 24 Nov). | Confusing on phones; it's trip-form UI, so only after 7 Dec. | **P1**, after 7 Dec |
| 7 | **Dashboard “Pay rates” tile linking to `/geofences`** (QA 24 Nov). Recheck; if still wrong, point it at `/pay-rates` or drop the tile. | One-line nav bug, no invoice/trip logic. | **P1**, can go with the demo UI branch now |
| 8 | **Employee and client role-switcher landing** on “Not on your plan” rather than a clear demo message (QA 24 Nov). | Demo-only; low risk. A short message beats a dead end. | **P2**, demo only |

---

## 4. Ranking and effort

| Pack | Priority | Dev-days | Notes |
|---|---|---|---|
| Demo bar phone fix | P0 | 0.5 | Demo only |
| Rebase and land PR #75 on demo, plus the small motion set on tiles / toasts / BusyButton | P0 | 1–1.5 | No invoice or trip logic |
| Staff-only generate (UI + confirm RPC) | P0 | 0.5 | After 7 Dec |
| Dashboard + invoices charts (recharts wrapper, role gates, 390px, empty states) | P1 | 1.5–2.5 | After 7 Dec |
| Company UUID picker; Pay rates link if still broken; role-switcher copy | P1 / P2 | 0.5–1 | UUID picker after 7 Dec; link can go now |
| Fuel litres (and admin-only rands) chart | P1 | 0.5 | After 7 Dec; uses existing fill-up queries |
| Workshop spend chart | P1 | 0.5 | After Drop 1 has real bills |
| Profitability charts | P1 | 0.5–1 | Folded into Drop 2; not extra scope in that build if planned now |
| Category seed + roadworthy quick entry | P1 | already in Drop 1.5 | Do not count twice |

**Incremental total for this pass (not already in Drop 1.5 / Drop 2): about 4.5–7.5 dev-days.**  
If the Drop 2 chart slice is counted only there, this pass is **about 4–6.5 days**.

---

## 5. Slotting

| When | What |
|---|---|
| **This week** | PR #87 only (price-fix live bundle). No chart or motion work on `main`. |
| **Now, on `demo` only** | A single `feat/demo-ui-motion` (or similar) branch: land PR #75, the motion set, the demo-bar phone fix, and the Pay rates link if it is still wrong. **Must not touch invoice or trip logic**, print, or pricing. Product QA at 390px and desktop, then Yaseen's go before it is even on the demo site. |
| **Jacobs freeze (Mon 30 Nov–Mon 7 Dec)** | No UI churn on invoices or trips, except a true P0 (for example the demo bar if it is still covering Sign out). Rehearsal and QA through Thu 3 Dec; Jacobs Org live Fri 4 Dec. |
| **After Mon 7 Dec** (Monday run has passed) | Dashboard + invoices + fuel charts; staff-only generate; company UUID picker. Demo first. |
| **Week of 14 Dec onward** | Drop 1, then 1.5 (categories, roadworthy, service-due mix). Workshop spend chart once Final bills exist. |
| **Drop 2** | Profitability (and wear) charts on that screen. |

Nothing from this pass goes live without **Yaseen's own go**. `main` / fyx stay untouched until he says so.

---

## 6. How Claude is used

- Engineering uses **Mansur's Claude Pro** in the browser (Claude Code). **Opus 5.5 or opusplan** writes the implementation plan from this doc. **Sonnet 5.5** codes on the branch. **Never Fable.**
- PRs are opened **from the box**, not from Cursor cloud agents.
- One concern per PR where practical: (a) loader + motion + demo bar on `demo`; (b) charts after 7 Dec; (c) invoice-generate gate after 7 Dec.
- Product QAs each PR at **390px and desktop**, and checks role rules (driver sees no rands; ops sees no fleet-cost rands; admin/owner sees money). Reduced-motion is a required check.

---
**Correction (25 Nov 13:34, from CoS and Eng):** the loader is already on demo. PR #96 was squash-merged as 468a6cf and was READY at 13:27. Fix item 2 is dropped. Per CoS, Yaseen said yes at 13:29 to graphs, animations and the UI pass, with demo-only items now and charts after the 7 Dec run.
