-- Drivers and employees must not inherit full-org company scope on invoices.

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
        )
      )
    )
  );
