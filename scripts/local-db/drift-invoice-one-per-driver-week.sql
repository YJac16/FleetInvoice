-- Local pre-prod only: reproduce production index drift (founder reversal 00023).
-- Source: database/migrations/00023_invoice_per_trip_company_unique.sql
-- (supabase/migrations/00023 still has per-trip_company uniqueness from repo main).

drop index if exists public.invoices_org_driver_week_trip_company_active_uidx;

create unique index if not exists invoices_org_driver_week_active_uidx
  on public.invoices (organisation_id, driver_id, period_start, period_end)
  where deleted_at is null
    and status <> 'void'
    and driver_id is not null;
