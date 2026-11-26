-- =============================================================================
-- ROLLBACK: 00102_self_serve_invoice_bill_to.sql
-- =============================================================================
-- Manual script, not part of the migration chain. 00102 only adds two
-- functions (nothing else is created or altered), so this drops exactly those:
--
--   set_org_invoice_bill_to(uuid, uuid)
--   get_org_invoice_bill_to(uuid)
--
-- It does NOT undo data: organisations.settings.invoice_bill_to_company_id and
-- any DRAFT invoices already re-targeted keep their values (the resolver in
-- 00022 still reads the setting). Neither function existed before 00102.
-- Demo only. Run by hand; the app's Settings -> Invoicing card stops working
-- until 00102 is re-applied.
-- =============================================================================

begin;

drop function if exists public.set_org_invoice_bill_to(uuid, uuid);
drop function if exists public.get_org_invoice_bill_to(uuid);

commit;
