-- =============================================================================
-- 00087: fix generate_weekly_fuel_invoice "column reference period_end is ambiguous"
-- =============================================================================
-- Root cause: the function declared a plpgsql variable named `period_end`, and
-- the "existing invoice" lookup compared `i.period_end = period_end`. The
-- unqualified right-hand `period_end` matches both the variable and the
-- invoices.period_end column that is in scope in that SELECT, so Postgres
-- raises 42702 (plpgsql.variable_conflict = error, the default). It is hit by
-- every authorised caller (admin / manager / platform owner); dispatcher /
-- supervisor are refused earlier by the role check, so they never reach it.
-- The bug is not new in 00085: the 00007 definition has the identical
-- declaration and comparison. 00085 only changed the role array.
--
-- Fix: rename the variable to v_period_end (a column cannot be aliased away on
-- the variable side, and the column side is already alias-qualified as
-- i.period_end). Signature, return type, SECURITY DEFINER, search_path and the
-- 00085 authorisation (platform owner + organisation_admin + manager, plus the
-- company_manager scoped branch) are unchanged. No other behaviour change.
--
-- Scan of the other 11 functions recreated in 00085: none is ambiguous (see PR
-- description), so nothing else is recreated here.
-- Not applied to any remote database from the PR.
-- Rollback: supabase/rollback-00087.sql
-- =============================================================================

begin;

create or replace function public.generate_weekly_fuel_invoice(
  p_organisation_id uuid,
  p_company_id uuid,
  p_week_start date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end date;
  existing public.invoices%rowtype;
  inv public.invoices%rowtype;
  can_generate boolean;
  fill record;
  line_amount numeric;
  running_total numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_period_end := p_week_start + 7;

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager']
    )
    or (
      public.has_org_role_names(p_organisation_id, array['company_manager'])
      and public.has_company_scope(p_organisation_id, p_company_id)
    );

  if not can_generate then
    raise exception 'Not authorised to generate invoices';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
  ) then
    raise exception 'Company not found';
  end if;

  select * into existing
  from public.invoices i
  where i.organisation_id = p_organisation_id
    and i.company_id = p_company_id
    and i.period_start = p_week_start
    and i.period_end = v_period_end
    and i.deleted_at is null
    and i.status <> 'void'
  limit 1;

  if found then
    return existing;
  end if;

  insert into public.invoices (
    organisation_id,
    company_id,
    period_start,
    period_end,
    status,
    generated_by
  )
  values (
    p_organisation_id,
    p_company_id,
    p_week_start,
    v_period_end,
    'draft',
    auth.uid()
  )
  returning * into inv;

  for fill in
    select f.*
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.company_id = p_company_id
      and f.deleted_at is null
      and f.filled_at >= p_week_start::timestamptz
      and f.filled_at < v_period_end::timestamptz
    order by f.filled_at
  loop
    line_amount := coalesce(
      fill.total_amount,
      case when fill.unit_price is not null then round(fill.litres * fill.unit_price, 2) else 0 end
    );
    running_total := running_total + line_amount;

    insert into public.invoice_lines (
      organisation_id,
      invoice_id,
      line_type,
      fuel_fillup_id,
      description,
      quantity,
      unit_price,
      amount
    )
    values (
      p_organisation_id,
      inv.id,
      'fuel',
      fill.id,
      format(
        'Fuel %s L @ %s km (%s)',
        fill.litres::text,
        fill.odometer_km::text,
        to_char(fill.filled_at at time zone 'UTC', 'YYYY-MM-DD')
      ),
      fill.litres,
      coalesce(fill.unit_price, 0),
      line_amount
    );
  end loop;

  update public.invoices
  set subtotal = running_total,
      total = running_total,
      status = 'issued',
      issued_at = timezone('utc', now())
  where id = inv.id
  returning * into inv;

  return inv;
end;
$$;

commit;
