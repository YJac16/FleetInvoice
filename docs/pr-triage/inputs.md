# FleetInvoice open-PR triage inputs

Snapshot for a read-only Claude Code (Opus 5.5) judgement pass.
Generated **26 Nov 2026, 10:30 SAST** (Africa/Johannesburg). This file is facts only, not a verdict.

Repo: `YJac16/FleetInvoice`. Branch `docs/pr-triage-2026-11-26` was cut from `origin/demo`.

## Refs at snapshot

| Ref | SHA | Tip date (SAST) | Subject |
|-----|-----|-----------------|---------|
| `origin/demo` | `8556f05d825d38b2c9441571925f2555a9522aa4` | 2026-11-25 15:21 SAST | Void then regenerate: free trips from void invoices (demo only) (#102) |
| `origin/main` | `25a2dedfd28a43c7499f14e424234f61ba7940cc` | 2026-11-11 11:16 SAST | Add editable route price templates that pre-fill trip prices (#72) |

Open PR count: **29**. All still `open` (none merged). Author on all: YJac16.

**Rules for the judgement pass:** read-only on every existing PR and PR branch. Do not close, merge, comment, or push to them. Do not touch `main`, fyx, tggx, or prod Vercel. After writing `docs/pr-triage/verdict.md`, commit it, delete `GO.md`, and push only `docs/pr-triage-2026-11-26`. Do not open a PR.

## How counts were taken

- **Files / + / −** for PRs #8–#51 are GitHub's official change counts (they matched `git diff --shortstat <recorded-base-sha>...<head>`). For the rest they match three-dot vs the **current tip** of the PR's base branch (`origin/main`, `origin/demo`, or the feature-branch base).
- PRs **#8, #10, #19, #21, #26, #34, #44** have **no merge-base with current `origin/main`** (unrelated or rewritten history). GitHub still reports the diff against the recorded base SHA from when the PR was opened. Three-dot vs current `main` is empty and must be ignored. `git cherry` vs demo/main is also meaningless for these.
- **Created / updated** are GitHub UTC converted to Africa/Johannesburg (SAST, UTC+2).
- **Contained?** is `git merge-base --is-ancestor <head> origin/demo` or `origin/main`.
- Migrations listed are `supabase/migrations/*.sql` in the PR's own three-dot diff vs its recorded or live base (plus a `database/migrations/` mirror when that copy is also in the diff).

## Migration number map

Demo has **90** SQL migrations; highest number **00097**. Main has **66**; highest number **00070**.

Gaps on **demo** in 00001–00097: `00028`, `00053`, `00054`, `00056`, `00071`, `00072`, `00096`.

Gaps on **main** in 00001–00070: `00028`, `00053`, `00054`, `00056`. Main has nothing numbered 00071–00097.

Demo jumps `00070` → `00073` (no 00071/00072) and `00095` → `00097` (no 00096). As of this snapshot, `00096` exists only on PR #100.

## Heads already contained (merged-in-effect)

No open PR head is an ancestor of `origin/main`.

| PR | Head | In `origin/demo`? | In `origin/main`? | Fact |
|----|------|-------------------|-------------------|------|
| **#77** | `dbe5ff654718` `feat/maintenance-drop1` | **YES** | no | Drop 1 (U1–U6) and migrations 00073–00075 are already in demo history. Still open vs `main`. Still the base of open #79 and #82. |
| **#78** | `a87b44c8aedd` `feat/demo-role-switcher` | **YES** | no | Demo role switcher already in demo history. Still open vs `main`. #94 is a later allowlist follow-up (not contained). |
| **#79** | `503bda925afd` `feat/goops-refocus` | **YES** | no | Stacked on #77. `00076_goops_entitlements.sql` on this head is **byte-identical** to demo's 00076. #83's title says #83 supersedes #79; #83's 00076 **differs**. |

## Cross-PR and vs-demo/main migration-number collisions

Same number, different path and/or different blob:

| Number | Who | Paths / blobs | vs demo / main |
|--------|-----|---------------|----------------|
| **00016** | #8 | `00016_driver_weekly_invoice.sql` | Collides with already-landed `00016_membership_three_tiers.sql`. A later `00022_driver_weekly_invoice.sql` already exists on demo and main — inspect whether #8 was relanded under 00022. |
| **00017** | #10 | `00017_fleet_identity_clarity.sql` | Collides with already-landed `00017_org_logos_storage.sql`. |
| **00022** | #26 | `00022_phase12_areas_invoices_qr.sql` | Collides with already-landed `00022_driver_weekly_invoice.sql`. |
| **00028** | #34 | `00028_second_user_org_bootstrap.sql` | Gap on demo and main (number is free). Multi-org / Jacobs Org work later landed on demo as 00088–00092 — inspect overlap of intent. The PR body historically names a legacy Supabase project as the apply target; **do not apply anything to tggx or fyx**. |
| **00053 / 00054** | #44 | `00053_fuel_slip_enums.sql`, `00054_fuel_slips.sql` | Gaps on demo and main (numbers are free). Demo later added fuel **price** work as 00093–00095 (different feature). |
| **00056** | #49 | `00056_security_privilege_and_billing.sql` | Gap on demo and main. Later security hardening exists on main/demo (00052, 00055, 00060, 00067, etc.) — inspect whether 00056 is still needed. |
| **00069** | #66 | `00069_trip_pickup_dropoff.sql` | Collides with already-landed `00069_rate_card_edit_archive_restore.sql` on demo and main. Pickup schema is not present on demo under this filename; inspect whether structured pickup/drop-off later landed under other migrations or only in app code. |
| **00070** | #69 and #73 | #69 `00070_self_serve_invoice_bill_to.sql` vs #73 `00070_route_price_templates.sql` (different blobs) | Demo and main already have `00070_route_price_templates.sql` (main #72). #69's filename collides with that number. #73 is based on current main and its three-dot still **modifies** the already-landed 00070 file, and adds `00071_invoice_sync_auth.sql`. |
| **00071** | #73 and #74 | #73 `00071_invoice_sync_auth.sql` vs #74 `00071_driver_price_privacy_and_stops.sql` | Gap on demo and main. The two PRs cannot both land under 00071. #74's driver-price intent later appears on demo as 00079/00080 (and in #87). |
| **00072** | #76 | `00072_driver_invoice_print_override.sql` | Gap on demo and main. Demo already has `00089_driver_invoice_print_override.sql` (Jacobs Org rehearsal, `6963771`). Content vs #76's 00072 is similar (~0.86 after normalizing the number in the header; 162 vs 154 lines) but **not identical**. Inspect whether #76 was relanded as 00089. |
| **00076** | #79 and #83 | both `00076_goops_entitlements.sql`, **two blobs** | Demo's 00076 is **identical to #79**, **different from #83**. Landing #83's 00076 as-is would conflict with an already-applied demo migration. |
| **00077, 00079, 00080, 00081, 00084–00087** | #87 | eight files, listed in the table | All eight blobs are **byte-identical** to the same paths already on `origin/demo`. They are **not** on `origin/main`. #87's head is not a commit-ancestor of demo (same files, different commits). The PR targets `main`. |
| **00096** | #100 | `00096_period_invoice_owner_stamp.sql` | Gap on current demo (demo jumped to 00097 via #102) and absent from main. #100 was cut from older demo `6963771` and is behind current demo. |

## Stacking and declared supersession

- #70 is stacked on #69 (`base: feat/self-serve-bill-to`).
- #79 and #82 are stacked on #77 (`base: feat/maintenance-drop1`).
- #83's title says it supersedes #79 (standalone retarget to `main`).
- #94 is a follow-up to #78 (role switcher allowlist) but targets an older `demo`.
- #97 (UI slice 1) and #103 (UI do-now) both target `demo` and overlap UI work; #103 is up to date with current demo, #97 is not.
- #61's title says it is stacked on #60 (that PR is not in the open set).

## Open PR table

SHA is abbreviated to 12 characters; full SHAs are in the appendix. Times are SAST.

| # | Title | Draft | Base | Head branch | SHA | Created | Updated | Files | + | − | Migrations in PR diff | In demo? | In main? |
|---|-------|-------|------|-------------|-----|---------|---------|------|---|---|------------------------|----------|----------|
| 8 | Driver-week invoice generate (WCL bill-to, mixed company lines) | yes | main | `cursor/driver-weekly-invoice-e600` | `ebafa7855247` | 2026-08-30 20:28 | 2026-08-31 05:31 | 19 | 1648 | 154 | `00016_driver_weekly_invoice.sql` (+ `database/migrations/` mirror) | no | no |
| 10 | Clarify invoices, vehicles, and driver profiles | no | main | `cursor/fleet-identity-clarity-4925` | `fd99f97055e9` | 2026-08-31 08:52 | 2026-08-31 08:53 | 29 | 2963 | 139 | `00017_fleet_identity_clarity.sql` | no | no |
| 19 | Founder GoOps PNG lockups + mark-only favicons | yes | main | `cursor/goops-final-logo-assets-2846` | `66af98fb14c1` | 2026-09-08 22:06 | 2026-09-09 08:59 | 78 | 392 | 149 | none | no | no |
| 21 | Add Cloud Agent development environment (Next.js + local Supabase) | no | main | `cursor/dev-environment-setup-01d8` | `c2897a750775` | 2026-09-09 11:05 | 2026-09-09 11:42 | 6 | 218 | 1 | none | no | no |
| 26 | Map-verified Areas, waybill invoices, and QR pairing | yes | main | `cursor/areas-maps-trips-qr-8774` | `599481eaafd9` | 2026-09-10 09:46 | 2026-09-10 09:47 | 30 | 3899 | 52 | `00022_phase12_areas_invoices_qr.sql` | no | no |
| 34 | Second-user / multi-org: self-serve signup and org bootstrap | yes | main | `cursor/second-user-multi-org-6280` | `273b5ff4565b` | 2026-09-21 21:11 | 2026-09-21 22:12 | 23 | 942 | 70 | `00028_second_user_org_bootstrap.sql` | no | no |
| 44 | Fuel slip capture (spec v2) — draft implementation | yes | main | `cursor/fuel-slip-capture-8c18` | `2771518a647a` | 2026-09-28 09:36 | 2026-09-28 10:24 | 39 | 6989 | 447 | `00053_fuel_slip_enums.sql`, `00054_fuel_slips.sql` | no | no |
| 48 | Add Open Graph preview image and full-logo favicons | no | main | `cursor/og-favicon-metadata-2aff` | `76f6637a8113` | 2026-09-28 16:47 | 2026-09-28 16:48 | 17 | 26 | 16 | none | no | no |
| 49 | Fix platform-owner escalation and billing data exposure | yes | main | `cursor/security-audit-fixes-836c` | `063ab06a6f3c` | 2026-09-30 08:46 | 2026-09-30 08:48 | 15 | 1146 | 71 | `00056_security_privilege_and_billing.sql` | no | no |
| 51 | Spec: client company portal (billing, staff, trip status) | yes | main | `cursor/company-portal-spec-36f5` | `f3c0d7be8fd5` | 2026-10-03 23:17 | 2026-10-03 23:18 | 2 | 597 | 0 | none (docs only) | no | no |
| 61 | fix(ui): date-range polish follow-up (stacked on #60) | yes | main | `cursor/date-range-polish-followup` | `41a1793c5292` | 2026-10-13 04:37 | 2026-10-13 08:27 | 35 | 1366 | 172 | none | no | no |
| 63 | invoice print: keep total with table, column widths | yes | main | `cursor/invoice-print-table-totals-e9a5` | `1ae125501bab` | 2026-10-13 11:34 | 2026-10-13 12:28 | 10 | 879 | 53 | none | no | no |
| 66 | Structured pickup/drop-off, Cape Town map default, flagged Mapbox PlacePicker | no | main | `feat/pickup-dropoff-cape-town` | `d720e584474b` | 2026-10-26 19:10 | 2026-10-26 19:12 | 28 | 2777 | 28 | `00069_trip_pickup_dropoff.sql` | no | no |
| 69 | feat(billing): self-serve invoice bill-to for org admins (00070) | yes | main | `feat/self-serve-bill-to` | `bb4e0adee5f1` | 2026-11-03 01:06 | 2026-11-03 01:07 | 8 | 459 | 3 | `00070_self_serve_invoice_bill_to.sql` | no | no |
| 70 | feat(dashboard): read-only per-org setup health page | yes | `feat/self-serve-bill-to` (#69) | `feat/admin-setup-dashboard` | `761452bce616` | 2026-11-03 01:11 | 2026-11-03 01:12 | 7 | 498 | 1 | none vs #69 | no | no |
| 73 | Keep invoice sync internal and block direct trip price writes | no | main | `cursor/invoice-sync-auth-c383` | `9c56f861589a` | 2026-11-11 11:17 | 2026-11-11 11:37 | 3 | 534 | 3 | modifies `00070_route_price_templates.sql`; adds `00071_invoice_sync_auth.sql` | no | no |
| 74 | Hide driver prices and let drivers add named stops | no | main | `cursor/driver-prices-stops-a2f6` | `30844337c767` | 2026-11-11 16:55 | 2026-11-11 17:22 | 36 | 2719 | 97 | `00071_driver_price_privacy_and_stops.sql` | no | no |
| 75 | Brand admin loading and busy actions with the GoOps mark | no | main | `cursor/admin-goops-loading-a2d8` | `cf7d125320d4` | 2026-11-11 17:11 | 2026-11-11 17:36 | 69 | 1613 | 484 | none | no | no |
| 76 | Per-driver invoice issuer + banking override (00072) | yes | main | `feat/driver-invoice-print-override` | `5bffb80b6cd9` | 2026-11-22 20:21 | 2026-11-22 20:22 | 9 | 786 | 8 | `00072_driver_invoice_print_override.sql` | no | no |
| 77 | WIP: Fleet maintenance Drop 1 (U1-U6) | yes | main | `feat/maintenance-drop1` | `dbe5ff654718` | 2026-11-23 15:18 | 2026-11-23 17:58 | 56 | 7019 | 7 | `00073_maintenance_schema.sql`, `00074_maintenance_rpcs.sql`, `00075_maintenance_storage.sql` | **YES** | no |
| 78 | Demo-only role switcher (goops-demo) | yes | main | `feat/demo-role-switcher` | `a87b44c8aedd` | 2026-11-23 15:50 | 2026-11-23 15:51 | 9 | 551 | 0 | none | **YES** | no |
| 79 | GoOps refocus: module guards, plan entitlements (00076), no-access page, role gating | yes | `feat/maintenance-drop1` (#77) | `feat/goops-refocus` | `503bda925afd` | 2026-11-23 16:02 | 2026-11-23 17:59 | 48 | 3231 | 143 | `00076_goops_entitlements.sql` (identical to demo) | **YES** | no |
| 82 | chore(maintenance): rollback scripts for 00073-00075 | no | `feat/maintenance-drop1` (#77) | `chore/maintenance-drop1-rollbacks` | `04907a03285b` | 2026-11-24 21:51 | 2026-11-24 21:54 | 3 | 111 | 0 | none in `supabase/migrations/` (adds `supabase/rollback-00073.sql`, `rollback-00074.sql`, `rollback-00075.sql`) | no | no |
| 83 | GoOps refocus: module guards, plan entitlements (00076), no-access page, role gating (standalone, supersedes #79) | yes | main | `feat/goops-refocus-standalone` | `087c8bf3e6e2` | 2026-11-24 21:51 | 2026-11-24 21:52 | 44 | 3157 | 29 | `00076_goops_entitlements.sql` (**differs** from demo/#79) | no | no |
| 87 | Live: driver price leak + finance role isolation (00077, 00079, 00080, 00081, 00084, 00085, 00086, 00087) | yes | main | `fix/driver-price-leak-main` | `106370999ea6` | 2026-11-24 22:27 | 2026-11-25 12:58 | 64 | 8857 | 223 | `00077_rate_cards_select_hide_driver_employee.sql`, `00079_hide_trip_prices_from_drivers.sql`, `00080_mask_trip_prices_in_rpc_returns.sql`, `00081_finance_select_exclude_supervisor.sql`, `00084_finance_rate_cards_payrates_admin_only.sql`, `00085_finance_writes_admin_only.sql`, `00086_fuel_cost_finance_only.sql`, `00087_fix_weekly_fuel_invoice_ambiguity.sql` (all identical to demo) | no | no |
| 94 | Demo: show role switcher for demo@goops.co.za | yes | demo | `fix/demo-switcher-allowlist` | `ba2af36109c5` | 2026-11-25 12:14 | 2026-11-25 12:16 | 3 | 95 | 4 | none | no | no |
| 97 | UI pass slice 1: demo bar on phones + motion set | yes | demo | `feat/ui-pass-slice1` | `144d761c1a4e` | 2026-11-25 13:48 | 2026-11-25 13:50 | 14 | 349 | 16 | none | no | no |
| 100 | Period invoice owner stamp (00096, demo only) | yes | demo | `feat/period-invoice-owner-stamp` | `deaf010f52dd` | 2026-11-25 14:46 | 2026-11-25 14:48 | 6 | 782 | 0 | `00096_period_invoice_owner_stamp.sql` | no | no |
| 103 | UI do-now pass (demo only) | yes | demo | `feat/ui-do-now` | `c2c0b916af03` | 2026-11-25 15:36 | 2026-11-25 15:38 | 25 | 1355 | 233 | none | no | no |

## Extra facts worth inspecting

**Unrelated history (#8, #10, #19, #21, #26, #34, #44).** These heads do not share a merge-base with current `origin/main`. #19 GitHub `commits` = 264 (whole rewritten history, not 264 unique feature commits) and mergeable_state was `dirty`. #26 and #44 were also `dirty`. #21 and #34 were `clean` at fetch. #19's PR body said the founder PNG assets were not yet committed. #21's PR body contains a demo login; do not copy credentials into the verdict.

**Docs-only / likely superseded intent.** #51 is docs only (`docs/specs/company-portal.md`). Company portal Phase 1 later landed on demo as 00057 (`f3e2d71`, historical #56). Refocus PRs #79/#83 also touch company-portal visibility.

**Brand / favicon overlap.** #19 and #48 both touch lockups/favicons; later main/demo brand files may already cover some of this.

**Invoice print.** #63 is an older print-layout pass on `main`. Demo print has since gained issuer override (00089), owner-stamp work (#100, not yet on demo), and UI do-now print changes (#103). Inspect leftover unique work before keeping #63 as-is.

**#94, #97, #100 are based on older demo tips** (`684016e` or `6963771`), not current `8556f05`, so they are behind demo and would need a rebase before landing. #103 is not: merge-base with `origin/demo` is `8556f05`, behind 0, and current demo is contained in the head.

**#103 line-count confusion.** True do-now delta vs **current demo**: 25 files, +1355/−233. Vs **main**: 301 files, +34500/−666 (this is all of demo's divergence from main, plus the three do-now commits). An earlier "~17,200 lines added" figure is not the do-now delta vs demo; it matches a main-based (or mid-state) view of the branch. Unique commits vs demo: `b0a5f8b` docs UI review, `0e7f009` GO.md, `c2c0b91` the do-now implementation.

**#87 vs demo.** The eight listed migrations are byte-identical to demo, but the PR also has app/test changes vs `main` (64 files, +8857/−223). `git cherry` reports 5 unique commits vs demo because the work was applied on demo under different commits. Inspect whether any app change in #87 is still missing from demo before treating the whole PR as already-on-demo.

**#82** adds only rollback scripts for 00073–00075; no new forward migration. Not contained in demo.

## Full head SHAs

| # | Full head SHA |
|---|----------------|
| 8 | `ebafa785524786243aeec563fddd26dd0a7b1f6a` |
| 10 | `fd99f97055e984483cca39f1e1bd8dab374c7dfb` |
| 19 | `66af98fb14c19b1b1780d30a45d53457188bfde9` |
| 21 | `c2897a750775e13c879e4bb33ed12d21ef555f9e` |
| 26 | `599481eaafd92eb4cdc26cf51a0ab74ee5b4f6b2` |
| 34 | `273b5ff4565b046894f5364a8c60ac11402f0796` |
| 44 | `2771518a647aed150f19f7ed0c7e16d321509a5e` |
| 48 | `76f6637a81135775d78887fd2640b57620a1d9e7` |
| 49 | `063ab06a6f3c2c9b5ea71cfd81f0545adbf672a6` |
| 51 | `f3c0d7be8fd52a477b8ed5b0ffae1ac6ec593700` |
| 61 | `41a1793c5292398b53b631771c290e9b98e85ef9` |
| 63 | `1ae125501bab32c3846d2e69dfb8c60f0a6f9643` |
| 66 | `d720e584474b10dc426050ac2cd002a15c616edc` |
| 69 | `bb4e0adee5f1ec822fc226caafb2d78c7818f073` |
| 70 | `761452bce61610c9fbadce9ec235b07696ccafb6` |
| 73 | `9c56f861589a0e789aac43456405756554ec376b` |
| 74 | `30844337c767c8485f5721c1d9e0f50ae5c668e4` |
| 75 | `cf7d125320d4a50ac7b51b373a2702e6e844b038` |
| 76 | `5bffb80b6cd945f69c60d105c3ea93e9ad66d5fa` |
| 77 | `dbe5ff6547182731adb6b0782b3b8da0fba250e4` |
| 78 | `a87b44c8aeddd195364de9ae8201efdc45c36daf` |
| 79 | `503bda925afd5f8daf37636751300e7ebf338cbd` |
| 82 | `04907a03285bdcce9a36deec367d7e36e923ac42` |
| 83 | `087c8bf3e6e2b279540bdf14979a5d900f007f90` |
| 87 | `106370999ea61c35cbd41a9dcc7a02396a9bc511` |
| 94 | `ba2af36109c5e8fa96c16b164751466412bb3831` |
| 97 | `144d761c1a4ec8a565451f6e94ff974d61588965` |
| 100 | `deaf010f52dde3bba47ceff0ce15b25fbbd8bdf7` |
| 103 | `c2c0b916af03b627549a297810ee9dcd78d51789` |
