-- Align invoice_lines SELECT with invoices SELECT (company-scoped managers).

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
            public.has_org_role_names(
              i.organisation_id,
              array['organisation_admin', 'manager', 'dispatcher']
            )
            or public.has_company_scope(i.organisation_id, i.company_id)
          )
      )
    )
  );
