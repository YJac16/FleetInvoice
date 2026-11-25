-- =============================================================================
-- ROLLBACK: 00077_rate_cards_select_hide_driver_employee.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores the rate_cards_select
-- policy exactly as 00057 defined it.
-- =============================================================================

begin;

drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
      or (
        case
          when public.is_company_manager(organisation_id) then
            company_id is not null
            and public.company_user_can_see(organisation_id, company_id)
          else
            company_id is not null
            and public.has_company_scope(organisation_id, company_id)
        end
      )
    )
  );

commit;
