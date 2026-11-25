-- =============================================================================
-- ROLLBACK: 00081_finance_select_exclude_supervisor.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores route_prices_select
-- as 00070 defined it and invoices_select / invoice_lines_select as 00057
-- defined them.
-- =============================================================================

begin;

drop policy if exists route_prices_select on public.route_prices;
create policy route_prices_select on public.route_prices
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
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
                  array['driver', 'employee']
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
                    array['driver', 'employee']
                  )
                )
            end
          )
      )
    )
  );

commit;
