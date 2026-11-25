-- =============================================================================
-- 00081: finance rows for admin / manager only (no dispatcher, no supervisor)
-- =============================================================================
-- App side (lib/permissions): invoices, rate cards, route prices, pay rates and
-- payroll are no longer in VIEW_OPS. Platform owner, organisation_admin and
-- manager get them; dispatcher and supervisor get none; company_manager keeps
-- its own invoices:view. This brings SELECT in line for:
--
--   * route_prices_select: platform owner, organisation_admin, manager
--     (00070 also had dispatcher and supervisor).
--   * invoices_select / invoice_lines_select: the 00057 quals with two
--     changes in the ELSE branch:
--       - 'dispatcher' dropped from the admin/manager/dispatcher list;
--       - 'dispatcher' and 'supervisor' added to the NOT list of the
--         has_company_scope branch (has_company_scope() is true for every
--         ops role, so without this they would still pass).
--     The company_manager branch is unchanged. has_company_scope() is
--     unchanged.
--
-- Driver-trip approval and price prefill are unaffected: approve_driver_trip,
-- suggest_trip_unit_price and every helper they call (sync_staff_trip_invoice_line,
-- resolve_route_price, resolve_trip_line_rate, recalculate_invoice_totals, ...)
-- are SECURITY DEFINER, so they don't depend on the caller's SELECT policies.
--
-- Not touched: rate_cards (00079), pay_rates / payroll_runs / payroll_lines
-- (00012), invoice insert/update/delete policies.
-- Rollback: supabase/rollback-00081.sql
-- =============================================================================

begin;

drop policy if exists route_prices_select on public.route_prices;
create policy route_prices_select on public.route_prices
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          case
            when public.is_company_manager(organisation_id) then
              driver_id is null
              and public.company_user_can_see(organisation_id, company_id)
            else
              public.has_org_role_names(
                organisation_id,
                array['organisation_admin', 'manager']
              )
              or (
                public.has_company_scope(organisation_id, company_id)
                and not public.has_org_role_names(
                  organisation_id,
                  array['driver', 'employee', 'dispatcher', 'supervisor']
                )
              )
          end
        )
      )
    )
  );

drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and exists (
        select 1
        from public.invoices i
        where i.id = invoice_lines.invoice_id
          and i.organisation_id = invoice_lines.organisation_id
          and i.deleted_at is null
          and (
            case
              when public.is_company_manager(i.organisation_id) then
                i.driver_id is null
                and public.company_user_can_see(i.organisation_id, i.company_id)
              else
                public.has_org_role_names(
                  i.organisation_id,
                  array['organisation_admin', 'manager']
                )
                or (
                  public.has_company_scope(i.organisation_id, i.company_id)
                  and not public.has_org_role_names(
                    i.organisation_id,
                    array['driver', 'employee', 'dispatcher', 'supervisor']
                  )
                )
            end
          )
      )
    )
  );

commit;
