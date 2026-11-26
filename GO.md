# GO.md

Demo only. Model: Sonnet. Base branch: `demo` (cut at 490b8da). No main/fyx/tggx/prod, no rate cards. **Do not apply any migration to any database.** Write the SQL and tests only. Drivers never see prices.

Goal: port PR #69 (self-serve invoice bill-to, branch `feat/self-serve-bill-to`, head bb4e0ad, based on `main`), then PR #70 (setup health page, branch `feat/admin-setup-dashboard`, head 761452b, stacked on #69) onto demo as ONE draft PR into `demo`.

1. Port #69 (cherry-pick or by hand).
   - Its migration `00070_self_serve_invoice_bill_to.sql` clashes with demo's applied 00070 (route_price_templates). Rename it to `supabase/migrations/00102_self_serve_invoice_bill_to.sql` and update every reference (comments, tests, `tests/db/self-serve-bill-to.test.mjs`, package.json scripts).
   - Rebase the SQL on demo's current definitions. In particular, check that nothing it re-creates has changed since main (organisations settings, invoice draft re-targeting vs 00085/00097/00099/00100/00101). Keep it additive and SECURITY DEFINER with `search_path = pg_catalog, public`. Keep the 00099 rules: no direct `invoices` UPDATE policy, and platform_owner can't be self-granted.
   - Add `supabase/rollback-00102.sql` (manual, `begin; ... commit;`, style of `supabase/rollback-00085.sql`), dropping exactly what 00102 adds.
   - Update the static numbering test `tests/unit/migration-00093-fuel-prices.test.ts` to allow `00102_`, and add `tests/unit/migration-00102-self-serve-bill-to.test.ts` (security definer, search_path, org-admin only, the rollback file exists and matches).
   - Update `docs/migrations/SKIPPED.md` with a line saying #69's original 00070 is now **00102**.
2. Resolve the conflicts:
   - `features/settings/components/settings-page.tsx`: keep demo's current sections and order, and add the bill-to card (`invoice-bill-to-card` anchor).
   - `package.json`: keep all of demo's scripts and add only #69/#70's new test scripts. No dependency changes.
3. Port #70 on top: the read-only `/setup` page, the nav entry (Finance → Setup health) in `lib/navigation.ts` following demo's current nav and entitlement gating, and its tests. No migration.
4. Keep all invoice and trip pricing logic unchanged. Only the bill-to target of DRAFT invoices may change, through the new RPC.
5. Run `npm run lint` (0 errors), `npx tsc --noEmit` and `npm test`, and fix any failures. Self-review the diff against `demo`.
6. Open ONE draft PR into `demo` titled "Self-serve bill-to + setup health (00102, #69 + #70, demo only)". In the body: the renumbering, the conflict resolutions, the check results, and "migration NOT applied". Say that it supersedes #69 and #70 (do not close them). No merge.
7. Delete GO.md (git rm) in the final commit.
