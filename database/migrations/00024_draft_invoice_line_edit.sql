-- =============================================================================
-- WorkOps — Admin edit draft invoice lines (description, qty, unit price)
-- =============================================================================

create or replace function public.update_draft_invoice_line(
  p_line_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric
)
returns public.invoice_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  line public.invoice_lines%rowtype;
  inv public.invoices%rowtype;
  can_manage boolean;
  trimmed_description text;
  line_amount numeric;
  invoice_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  trimmed_description := trim(coalesce(p_description, ''));
  if trimmed_description = '' then
    raise exception 'Description is required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'Unit price cannot be negative';
  end if;

  select * into line
  from public.invoice_lines il
  where il.id = p_line_id;
  if not found then
    raise exception 'Invoice line not found';
  end if;

  select * into inv
  from public.invoices i
  where i.id = line.invoice_id
    and i.deleted_at is null;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if inv.status <> 'draft' then
    raise exception 'Only draft invoice lines can be edited';
  end if;

  can_manage := public.is_platform_owner()
    or public.has_org_role_names(
      inv.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
    or (
      public.has_org_role_names(inv.organisation_id, array['company_manager'])
      and public.has_company_scope(inv.organisation_id, inv.company_id)
    );

  if not can_manage then
    raise exception 'Not authorised to update invoice lines';
  end if;

  line_amount := round(p_quantity * p_unit_price, 2);

  update public.invoice_lines
  set description = trimmed_description,
      quantity = p_quantity,
      unit_price = p_unit_price,
      amount = line_amount
  where id = line.id
  returning * into line;

  select coalesce(sum(il.amount), 0)
  into invoice_total
  from public.invoice_lines il
  where il.invoice_id = inv.id;

  update public.invoices
  set subtotal = invoice_total,
      total = invoice_total,
      updated_at = timezone('utc', now())
  where id = inv.id;

  return line;
end;
$$;

grant execute on function public.update_draft_invoice_line(uuid, text, numeric, numeric) to authenticated;

comment on function public.update_draft_invoice_line is
  'Patch description, quantity, and unit_price on a draft invoice line; recalculates line amount and invoice totals.';
