# Period invoice owner stamp (demo only)

Work on existing branch `feat/period-invoice-owner-stamp`, cut from `origin/demo` @ `6963771c3b4382d4b2b791d3d8bf05fc3b0f8d29`. Open a **DRAFT** PR into `demo`. Do not merge, touch `main`, deploy, or apply migrations to any remote DB (`goops-demo`, `fyx`, `tggx`). Do not backfill or edit existing invoices, Jacobs Org data, or the unbilled 23–29 Nov week.

## Goal

`generate_period_invoice` creates company invoices (`driver_id` null) as **issued**, and currently leaves `invoices.owner_tag` null. After inserting the invoice, if every included trip's assigned driver has the same non-null `drivers.owner_tag`, set `invoices.owner_tag` to that value; otherwise leave it null (it already shows under All). Product (25 Nov): keep status `'issued'`; this stamp is the only behaviour change.

Driver-week invoices already resolve owner from `drivers.owner_tag` in the UI (`lib/owner-tag.ts`). Do **not** change `generate_driver_weekly_invoice` or any other RPC.

## Migration — use **00096**

`demo` is through 00092. **00093–00095 are reserved** by `feat/fuel-price-table`. Add `supabase/migrations/00096_period_invoice_owner_stamp.sql`. If 00096 is taken when you land, bump and say so. Wrap in `begin;…commit;`. Add `supabase/rollback-00096.sql` that restores the previous `generate_period_invoice` definition **exactly** (the 00085 body, including its `set search_path = public`).

The current definition on `demo` is in `supabase/migrations/00085_finance_writes_admin_only.sql` (the `generate_period_invoice` block, around line 203). No later demo migration redefines it: 00088 added `invoices.owner_tag` (`'yaseen' | 'fadia' | null`) but not this function. Copy that body and keep everything else identical, including:

- Auth: platform owner or `organisation_admin` / `manager`; not authorised otherwise.
- Idempotent early return when a non-void company invoice already exists for that org/company/period (`driver_id is null`). Do not stamp or rewrite existing rows.
- Insert still starts as `'draft'`; the final `update` still sets `status = 'issued'` and `issued_at`.
- Trip inclusion and driver resolution: the existing `trip_assignments` join (`released_at is null`, vehicle company match, completed trips in the period — the same join the trip-line loop already uses).
- Signature, return type, `security definer`, and grants (CREATE OR REPLACE keeps owner and grants; do not GRANT/REVOKE unless a grant would otherwise drop). Pin `search_path` to `pg_catalog, public` on the new body (00085 currently has `set search_path = public`; this pin is required). Rollback must still restore the 00085 text exactly.

Stamp **after** the included trip lines are known (the final invoice update is a good place). Rules:

- Consider only trips actually included on the invoice (that same assignment join). If there are no included trips (fuel/fixed only), leave `owner_tag` null.
- If every included trip's assigned driver has the same non-null `drivers.owner_tag`, set `invoices.owner_tag` to that value (`'yaseen'` or `'fadia'` only, already constrained by 00088).
- Mixed owners → null. Any included driver with a null `owner_tag` → null.
- Do not invent tags, do not take owner from vehicles or companies, and do not change totals, line items, or period bounds.

No new RPC. `generate_period_invoice` is already on `scripts/db/00060-client-rpc-allowlist.mjs`; leave it.

## UI

No UI change unless needed. Confirm that the invoice owner filter already picks up `invoices.owner_tag` for company invoices (`driver_id` is null, so `drivers` is null): `resolveInvoiceOwner` in `lib/owner-tag.ts` is `drivers.owner_tag ?? invoices.owner_tag`, and `matchesInvoiceOwnerFilter` in `features/invoices/lib/invoice-list-filters.ts` uses it. Filter `all` already includes null/Unassigned. If that path is broken, fix it minimally and extend `tests/unit/jacobs-org-owner.test.ts`. Do not change driver-week resolution (the driver tag still wins).

## Tests

Cover, in the existing style (`tests/unit/migration-00085-finance-writes.test.ts`, `tests/rls/phase8_checks.sql`, `tests/unit/jacobs-org-owner.test.ts`):

- All included trips share one owner → `invoices.owner_tag` is stamped with that tag.
- Mixed owners → null.
- Any null owner among included drivers → null.
- Final status is still `'issued'`.
- Existing finance / RLS tests still pass (00085 unit tests, phase5/phase8 checks). Do not edit 00085. Add 00096, and only adjust a static "latest definition" assertion if it would otherwise break.

Do not apply 00096 to any remote database from this work; local test DBs only.

## Quality gate

- `npm run lint`, `npx tsc --noEmit`, `npm test`. Fix anything you break.
- Open a **DRAFT** PR into `demo`. Never touch `main`. Report lint, tsc, tests, and the PR URL.

Delete `GO.md` in the PR.
