-- PR A — Draft invoice waybill re-sync (MANUAL ONLY — NOT auto-applied by migrations)
-- =============================================================================
-- Purpose: After deploying migration 00049, re-price completed staff waybill lines on
-- **draft** driver-week invoices using trip company + trip-date rate resolution.
--
-- DO NOT RUN against production without Founder approval.
-- DO NOT run on issued/paid invoices (this script only targets draft invoices).
--
-- Preconditions:
--   - Migration 00049_pr_a_waybill_company_rate_resolution.sql applied.
--   - Each trip company has an applicable trip rate card (or backfill will fail).
--
-- Idempotency: sync_staff_trip_invoice_line upserts by trip_id (unique index).

begin;

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select t.id as trip_id
    from public.trips t
    join public.invoice_lines il on il.trip_id = t.id
    join public.invoices i on i.id = il.invoice_id and i.deleted_at is null
    where t.deleted_at is null
      and t.is_staff_transport
      and t.status = 'completed'
      and i.status = 'draft'
    order by t.planned_start
  loop
    perform public.sync_staff_trip_invoice_line(r.trip_id, false);
    v_count := v_count + 1;
  end loop;

  raise notice 'Re-synced % draft waybill invoice line(s)', v_count;
end $$;

commit;
