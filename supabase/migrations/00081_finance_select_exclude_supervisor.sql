-- =============================================================================
-- 00081: hide finance rows from supervisor
-- =============================================================================
-- App side (lib/permissions): invoices, rate cards, route prices, pay rates and
-- payroll are no longer in VIEW_OPS. Supervisor gets none of them; dispatcher
-- keeps invoices only. This brings SELECT in line for:
--
--   * route_prices_select: drop 'supervisor' (00070 had admin, manager,
--     dispatcher, supervisor).
--   * invoices_select / invoice_lines_select: 00057 quals copied verbatim; the
--     only change is 'supervisor' added to the NOT list of the
--     has_company_scope branch. The company_manager branch and the
--     admin/manager/dispatcher branch are unchanged. has_company_scope() is
--     unchanged.
--
-- Not touched: rate_cards (00077), pay_rates / payroll_runs / payroll_lines
-- (00012). Inserts/updates/deletes are unchanged.
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
      array['organisation_admin', 'manager', 'dispatcher']
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
                array['organisation_admin', 'manager', 'dispatcher']
              )
              or (
                public.has_company_scope(organisation_id, company_id)
                and not public.has_org_role_names(
                  organisation_id,
                  array['driver', 'employee', 'supervisor']
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
                  array['organisation_admin', 'manager', 'dispatcher']
                )
                or (
                  public.has_company_scope(i.organisation_id, i.company_id)
                  and not public.has_org_role_names(
                    i.organisation_id,
                    array['driver', 'employee', 'supervisor']
                  )
                )
            end
          )
      )
    )
  );

commit;
