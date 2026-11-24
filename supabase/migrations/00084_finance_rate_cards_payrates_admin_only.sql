-- =============================================================================
-- 00084: rate cards and pay rates / payroll SELECT for admin / manager only
-- =============================================================================
-- Finance tables are platform owner, organisation_admin and manager only
-- (app: FINANCE_VIEW in lib/permissions; 00081 did invoices, invoice_lines and
-- route_prices). Each policy below is the latest definition copied verbatim
-- with only the role set changed:
--
--   rate_cards_select     (00079): admin/manager/dispatcher -> admin/manager.
--                         Supervisor was already removed by 00079; driver and
--                         employee were never in it. The scoped company_manager
--                         branch is unchanged.
--   pay_rates_select      (00012): admin/manager/dispatcher -> admin/manager.
--   payroll_runs_select   (00012): admin/manager/dispatcher -> admin/manager.
--   payroll_lines_select  (00012): admin/manager/dispatcher -> admin/manager.
--
-- Insert/update/delete policies and SECURITY DEFINER RPCs are not changed.
-- approve_driver_trip / suggest_trip_unit_price and their price helpers
-- (resolve_trip_line_rate, resolve_route_price, sync_staff_trip_invoice_line)
-- are SECURITY DEFINER, so admin/manager approval with the pre-filled price is
-- unaffected; dispatcher stays refused by staff_can_manage_trips (00064).
--
-- Not applied to any remote database from the PR.
-- Rollback: supabase/rollback-00084.sql
-- =============================================================================

begin;

drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards for select using (
  deleted_at is null and (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin','manager'])
    or (public.is_company_manager(organisation_id) and company_id is not null and public.company_user_can_see(organisation_id, company_id))
  ));

drop policy if exists pay_rates_select on public.pay_rates;
create policy pay_rates_select on public.pay_rates
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager']
      )
    )
  );

drop policy if exists payroll_runs_select on public.payroll_runs;
create policy payroll_runs_select on public.payroll_runs
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager']
      )
    )
  );

drop policy if exists payroll_lines_select on public.payroll_lines;
create policy payroll_lines_select on public.payroll_lines
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

commit;
