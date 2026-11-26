# GO.md

Demo only. Model: Sonnet. Base branch: `demo` (cut at 490b8da). No main/fyx/tggx/prod, no migrations, no DB writes, no new dependencies, no rate cards. Drivers never see prices. Phone-first: check 390 px, then 1440 px.

Goal: land PR #97 (UI pass slice 1, branch `feat/ui-pass-slice1`, head 144d761) and PR #75's busy and loading work (branch `cursor/admin-goops-loading-a2d8`, head cf7d125, it was based on `main`) as ONE draft PR into `demo`, using ONE BusyButton.

1. Port #97 onto this branch (cherry-pick 144d761 or port by hand). Leave out `docs/claude-prompts/ui-pass-slice1.md`.
   - Conflict: `components/shared/stat-card.tsx` with #103 (bf4c843, UI do-now pass). Keep #103's layout and classes and add #97's `CountUp` and `tabular-nums` on the value. The final rendered text must equal the original `value`.
2. Fold in #75 (commits 8813bec, 241dc86, cf7d125): the GoOps-mark loader (`components/brand/goops-loader.tsx`, `goops-mark-path.ts`), `components/admin/admin-loading.tsx`, the `loading.tsx` route files, busy states on action buttons, and "keep loaded data on a failed refresh". #75 conflicts with demo in about 15 files. Resolve each one in favour of demo's current behaviour and layout, then add #75's loading and busy UI on top. Do not bring back anything demo has removed or renamed since #75 branched (for example the hidden Employees and company-portal screens, maintenance changes from #104/#105/#108, or the #106 `invoice-delivery-panel.tsx` change that removed `printUrl`). If a #75 hunk only makes sense on the old main code, drop it and list it in the PR.
3. One BusyButton:
   - The single component is `components/ui/busy-button.tsx`. It has #75's API (`pending`, `pendingLabel`, the `GoOpsLoader size="xs" decorative` spinner, `aria-busy`, `data-pending`, disabled while pending) plus #97's click guard while pending and its press feedback (opacity and transform only, 150 ms).
   - Delete `components/admin/busy-button.tsx` and update every import (#75 has about 43 call sites, plus #97's `SignOutButton`).
   - Honour `prefers-reduced-motion`: no loader animation and no press scale under reduce. The loader still shows as a static mark.
4. Keep ALL invoice and trip logic unchanged: no changes to queries, mutations, RPC calls, totals, pricing, print data, status transitions or permissions. Only loading, busy and visual state may change in `features/invoices/**` and `features/trips/**`. The invoice and trip UI freeze for live runs 30 Nov to 7 Dec. This PR is demo only.
5. Tests: keep #97's `tests/unit/ui-motion.test.tsx` and #75's `tests/unit/admin-loading.test.tsx`, adapted to the single BusyButton path. Add one test that `components/admin/busy-button.tsx` no longer exists and nothing imports it.
6. Run `npm run lint` (0 errors), `npx tsc --noEmit` and `npm test`, and fix any failures. Self-review the full diff against `demo`: list every file you touched under `features/invoices` or `features/trips` with one line saying why it is UI-only.
7. Open ONE draft PR into `demo` titled "UI: busy and loading states, one BusyButton (#97 + #75, demo only)". In the body: what was ported, which #75 hunks you dropped and why, the stat-card resolution, the self-review list, and the check results. Say that it supersedes #97 and #75 (do not close them). No merge.
8. Delete GO.md (git rm) in the final commit.
