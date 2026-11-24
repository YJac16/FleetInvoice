-- 00077: hide rate cards from drivers and employees.
-- 00057 let any user with has_company_scope() read company rate cards, which
-- includes drivers and employees. Rate cards are pricing data: only ops roles,
-- the platform owner and company managers (for their own companies) read them.
-- has_company_scope() itself is unchanged.
begin;
drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards for select using (
  deleted_at is null and (
    public.is_platform_owner()
    or public.has_org_role_names(organisation_id, array['organisation_admin','manager','dispatcher','supervisor'])
    or (public.is_company_manager(organisation_id) and company_id is not null and public.company_user_can_see(organisation_id, company_id))
  ));
commit;
