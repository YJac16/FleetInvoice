# Void then regenerate (demo only)

Option (b). DRAFT PR into `demo` titled "Void then regenerate: free trips from void invoices (demo only)". No merge, no `main`, no remote DB.

Index (00025, demo=fyx): unique `trip_id` where not null. Void RPC (00085) does not touch lines, so period generate (00085) conflicts and driver-week generate (00091) skips those trip_ids. Option (a) needs a synced flag (can drift) and every `not exists (…il.trip_id)` rewritten.

00096 reserved (PR #100). Add `supabase/migrations/00097_void_release_trip_ids.sql` + `supabase/rollback-00097.sql`. `begin;…commit;`. `search_path = pg_catalog, public`.

- Nullable `invoice_lines.voided_trip_id uuid` FK to `trips` (not unique).
- BEFORE UPDATE on `invoices` when status→void: for lines with `trip_id is not null`, `voided_trip_id = coalesce(voided_trip_id, trip_id)`, `trip_id = null`. Keep the unique index. Backfill existing voids. Keep `set_invoice_status` auth / no-unvoid.
- `sync_staff_trip_invoice_line` (00070) week lookup: add `and i.status <> 'void'` (else "weekly invoice is void").
- Print: `listInvoiceLinesWithTrips` embeds `voided_trips:voided_trip_id` and coalesces with `trips`.

Tests: void then period + driver-week generate succeed; totals unchanged; `trip_id` null / `voided_trip_id` set; unique still blocks two non-void invoices. Rollback: restore `trip_id` only if no unique conflict; drop trigger/column; restore 00070 (and 00085 if changed).

`npm run lint`, `npx tsc --noEmit`, `npm test`. Delete `GO.md`. Report PR URL.
