# UI P0s

`origin/demo` @ `11a7c2a241ae1c7a38c6b4b89344da2fd67606c5`. Items 1/3/4 only. One DRAFT PR into `demo` titled `UI P0s: print issuer, void confirm, drivers list (demo only)`. No merge. Never touch main/fyx/tggx/prod Vercel. No passwords or real bank numbers. Demo only.

Read §§1, 3, 4 of `docs/ui-review/goops-ui-review-2026-11-25.md` (`docs/ui-review-2026-11-25`; not here). Remove before adding. No pricing, dates, totals, or migrations unless item 1 needs one; then add a rollback; say so in the PR.

1. Jacobs Org `7faf5fbc-7ad7-4329-a014-6920b9def6dd` prints Demo Yaseen Org supplier/banking. Use the invoice's own org/owner issuer. Build on PR #95 owner tags + issuer override; per-owner banking (yaseen/fadia) if `owner_tag` is set, else org issuer. Add Settings Prints as card. `features/invoices/lib/invoice-print-settings.ts`, `features/settings/components/settings-page.tsx`.
3. Void confirm: dialog names invoice and amount; Cancel is default; not next to Print (⋯ menu). `features/invoices/components/invoices-page.tsx`, `components/shared/confirm-dialog.tsx`.
4. Drivers: don't clip actions at 390px (overflow menu or card rows). At 1440px, drop or merge columns; no 2126px table or horizontal scroll. `features/drivers/components/drivers-page.tsx`, `components/shared/entity-crud-page.tsx`, `components/shared/data-table.tsx`, `components/ui/table.tsx`.

Tests: Jacobs print issuer yaseen/fadia/unassigned; void confirm; drivers list layout. `npm run lint`, `npx tsc --noEmit`, `npm test`. Delete `GO.md`.
