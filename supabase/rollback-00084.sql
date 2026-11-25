-- =============================================================================
-- ROLLBACK: 00084_finance_rate_cards_payrates_admin_only.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores rate_cards_select as
-- 00079 defined it and pay_rates_select / payroll_runs_select /
-- payroll_lines_select as 00012 defined them.
-- =============================================================================

begin;

drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards for select using (
  deleted_at is null and (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher'])
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
        array['organisation_admin', 'manager', 'dispatcher']
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
        array['organisation_admin', 'manager', 'dispatcher']
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
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

commit;
