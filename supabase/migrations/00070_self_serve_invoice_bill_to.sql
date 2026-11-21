-- =============================================================================
-- 00070: self-serve invoice bill-to (additive; functions only)
--   set_org_invoice_bill_to: ORGANISATION ADMINS only (platform owner kept for
--     support). The company must belong to the same org, not be deleted and
--     be active. Only settings.invoice_bill_to_company_id is written; the
--     organisations RLS is unchanged.
--     Re-targets DRAFT driver-week invoices (driver_id is not null) that are
--     billed to the previous bill-to. Issued, paid and void invoices are
--     never touched. Company-level invoices (driver_id null) bill the client,
--     not the bill-to, so they are left alone.
--   get_org_invoice_bill_to: read for org members (the resolver is revoked
--     from authenticated in 00055).
-- Independent of 00069 (PR A); either can apply first.
-- =============================================================================

create or replace function public.set_org_invoice_bill_to(
  p_organisation_id uuid,
  p_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old uuid;
  v_retargeted integer := 0;
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(p_organisation_id, array['organisation_admin'])
  ) then
    raise exception 'Only organisation admins can set the invoice bill-to company';
  end if;

  if p_company_id is null then
    raise exception 'Bill-to company is required';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
      and c.status = 'active'
  ) then
    raise exception 'Bill-to company must be an active company in this organisation';
  end if;

  v_old := public.resolve_invoice_bill_to_company_id(p_organisation_id);

  update public.organisations
  set settings = jsonb_set(
        coalesce(settings, '{}'::jsonb),
        '{invoice_bill_to_company_id}',
        to_jsonb(p_company_id::text),
        true
      ),
      updated_at = timezone('utc', now())
  where id = p_organisation_id;

  if not found then
    raise exception 'Organisation not found';
  end if;

  if v_old is not null and v_old <> p_company_id then
    with moved as (
      update public.invoices i
      set company_id = p_company_id,
          updated_at = timezone('utc', now())
      where i.organisation_id = p_organisation_id
        and i.status = 'draft'
        and i.deleted_at is null
        and i.driver_id is not null
        and i.company_id = v_old
      returning i.id
    )
    select coalesce(array_agg(id), '{}') into v_ids from moved;
    v_retargeted := coalesce(array_length(v_ids, 1), 0);
  end if;

  perform public.write_audit_log(
    p_organisation_id,
    'organisation.invoice_bill_to.set',
    'organisation',
    p_organisation_id,
    jsonb_build_object(
      'old_company_id', v_old,
      'new_company_id', p_company_id,
      'draft_invoices_retargeted', v_retargeted
    )
  );

  return v_retargeted;
end;
$$;

revoke all on function public.set_org_invoice_bill_to(uuid, uuid) from public, anon;
grant execute on function public.set_org_invoice_bill_to(uuid, uuid) to authenticated;

create or replace function public.get_org_invoice_bill_to(p_organisation_id uuid)
returns table (company_id uuid, company_name text, is_explicit boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.id,
         c.name,
         coalesce((o.settings->>'invoice_bill_to_company_id') = c.id::text, false)
  from public.organisations o
  join public.companies c
    on c.id = public.resolve_invoice_bill_to_company_id(o.id)
  where o.id = p_organisation_id
    and auth.uid() is not null
    and (
      public.is_platform_owner()
      or p_organisation_id in (select public.user_organisation_ids())
    );
$$;

revoke all on function public.get_org_invoice_bill_to(uuid) from public, anon;
grant execute on function public.get_org_invoice_bill_to(uuid) to authenticated;
