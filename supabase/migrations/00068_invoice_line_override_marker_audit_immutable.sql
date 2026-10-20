-- =============================================================================
-- 00068 — Invoice line override markers + append-only trip_audit
-- =============================================================================

alter table public.invoice_lines
  add column if not exists price_overridden boolean not null default false,
  add column if not exists override_reason text;

comment on column public.invoice_lines.price_overridden is
  'True when unit_price came from trip_billing_overrides, not rate card.';
comment on column public.invoice_lines.override_reason is
  'Staff reason copied from trip_billing_overrides when price_overridden is true.';

update public.invoice_lines il
set
  price_overridden = true,
  override_reason = bo.reason
from public.trip_billing_overrides bo
where bo.trip_id = il.trip_id
  and il.price_overridden = false;

-- ---------------------------------------------------------------------------
-- trip_audit append-only (app roles cannot UPDATE/DELETE)
-- ---------------------------------------------------------------------------

create or replace function public.trip_audit_reject_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'trip_audit is append-only';
end;
$$;

revoke all on function public.trip_audit_reject_mutation() from public, anon, authenticated;

drop trigger if exists trip_audit_no_update on public.trip_audit;
create trigger trip_audit_no_update
  before update on public.trip_audit
  for each row
  execute function public.trip_audit_reject_mutation();

drop trigger if exists trip_audit_no_delete on public.trip_audit;
create trigger trip_audit_no_delete
  before delete on public.trip_audit
  for each row
  execute function public.trip_audit_reject_mutation();

revoke update, delete on table public.trip_audit from authenticated;

-- ---------------------------------------------------------------------------
-- sync_staff_trip_invoice_line — set override markers on invoice lines
-- ---------------------------------------------------------------------------

create or replace function public.sync_staff_trip_invoice_line(
  p_trip_id uuid,
  p_remove boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
  v_bounds record;
  v_bill_to uuid;
  inv public.invoices%rowtype;
  v_rate numeric;
  v_rate_card_id uuid;
  v_rate_effective_on date;
  v_line_amount numeric;
  v_description text;
  v_line_id uuid;
  v_old_invoice_id uuid;
  v_trip_date date;
  v_existing_trip_company_id uuid;
  v_existing_rate_card_id uuid;
  v_existing_unit_price numeric;
  v_existing_rate_effective_on date;
  v_preserve_rate boolean := false;
  v_override numeric;
  v_override_reason text;
  v_price_overridden boolean := false;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    return null;
  end if;

  select il.id, il.invoice_id
  into v_line_id, v_old_invoice_id
  from public.invoice_lines il
  where il.trip_id = p_trip_id
  limit 1;

  if p_remove or t.status = 'cancelled' then
    if v_line_id is not null then
      select * into inv
      from public.invoices i
      where i.id = v_old_invoice_id
        and i.deleted_at is null;

      if found and inv.status <> 'draft' then
        raise exception 'Cannot remove line: invoice is % (only draft invoices can be synced)', inv.status;
      end if;

      delete from public.invoice_lines where id = v_line_id;
      if v_old_invoice_id is not null then
        perform public.recalculate_invoice_totals(v_old_invoice_id);
      end if;
    end if;
    return null;
  end if;

  if t.status <> 'completed' then
    return null;
  end if;

  if public.driver_submission_pending(t) then
    return null;
  end if;

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.organisation_id = t.organisation_id
    and ta.deleted_at is null
    and ta.released_at is null
  limit 1;

  if v_driver_id is null then
    raise exception 'Trip has no active driver assignment';
  end if;

  if t.company_id is null then
    raise exception 'Trip company is not set';
  end if;

  v_trip_date := (t.planned_start at time zone 'Africa/Johannesburg')::date;
  select * into v_bounds from public.service_week_bounds_sast(t.planned_start);

  select bo.override_unit_price, bo.reason
  into v_override, v_override_reason
  from public.trip_billing_overrides bo
  where bo.trip_id = p_trip_id;

  if v_override is not null then
    v_rate := v_override;
    v_rate_card_id := null;
    v_rate_effective_on := v_trip_date;
    v_price_overridden := true;
  else
    v_override_reason := null;
    v_price_overridden := false;
    if v_line_id is not null then
      select il.trip_company_id, il.rate_card_id, il.unit_price, il.rate_effective_on
      into v_existing_trip_company_id, v_existing_rate_card_id, v_existing_unit_price, v_existing_rate_effective_on
      from public.invoice_lines il
      where il.id = v_line_id;

      if v_existing_trip_company_id = t.company_id
         and v_existing_rate_card_id is not null
         and v_existing_unit_price is not null then
        v_preserve_rate := true;
        v_rate := v_existing_unit_price;
        v_rate_card_id := v_existing_rate_card_id;
        v_rate_effective_on := v_existing_rate_effective_on;
      end if;
    end if;

    if not v_preserve_rate then
      select unit_amount, rate_card_id, rate_effective_on
      into v_rate, v_rate_card_id, v_rate_effective_on
      from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date);

      if v_rate is null then
        raise exception 'No trip rate configured for this company. Add a rate before saving this waybill.';
      end if;
    end if;
  end if;

  v_bill_to := public.resolve_invoice_bill_to_company_id(t.organisation_id);
  if v_bill_to is null then
    raise exception 'Bill-to company not configured (set organisations.settings.invoice_bill_to_company_id or add WCL Trading CC)';
  end if;

  select * into inv
  from public.invoices i
  where i.organisation_id = t.organisation_id
    and i.driver_id = v_driver_id
    and i.period_start = v_bounds.period_start
    and (
      i.period_end = v_bounds.period_end
      or i.period_end = v_bounds.period_end + 1
    )
    and coalesce(i.trip_company, '') = ''
    and i.deleted_at is null
  limit 1;

  if found and inv.status <> 'draft' then
    raise exception 'Cannot add trip line: weekly invoice is % (must be draft)', inv.status;
  end if;

  if not found then
    insert into public.invoices (
      organisation_id,
      company_id,
      driver_id,
      period_start,
      period_end,
      status,
      generated_by,
      notes
    )
    values (
      t.organisation_id,
      v_bill_to,
      v_driver_id,
      v_bounds.period_start,
      v_bounds.period_end,
      'draft',
      auth.uid(),
      format(
        'Invoice date %s (Monday after Sunday %s)',
        to_char(v_bounds.period_end + 1, 'DD/MM/YYYY'),
        to_char(v_bounds.period_end, 'DD/MM/YYYY')
      )
    )
    returning * into inv;
  end if;

  v_line_amount := round(v_rate, 2);
  v_description := public.staff_trip_invoice_line_description(t);

  if v_line_id is not null and v_old_invoice_id is distinct from inv.id then
    delete from public.invoice_lines where id = v_line_id;
    perform public.recalculate_invoice_totals(v_old_invoice_id);
    v_line_id := null;
  end if;

  if v_line_id is null then
    insert into public.invoice_lines (
      organisation_id,
      invoice_id,
      line_type,
      rate_card_id,
      trip_id,
      trip_company_id,
      rate_effective_on,
      description,
      quantity,
      unit_price,
      amount,
      price_overridden,
      override_reason
    )
    values (
      t.organisation_id,
      inv.id,
      'trip',
      v_rate_card_id,
      p_trip_id,
      t.company_id,
      v_rate_effective_on,
      v_description,
      1,
      v_rate,
      v_line_amount,
      v_price_overridden,
      v_override_reason
    )
    returning id into v_line_id;
  else
    update public.invoice_lines
    set invoice_id = inv.id,
        rate_card_id = v_rate_card_id,
        trip_company_id = t.company_id,
        rate_effective_on = v_rate_effective_on,
        description = v_description,
        quantity = 1,
        unit_price = v_rate,
        amount = v_line_amount,
        price_overridden = v_price_overridden,
        override_reason = v_override_reason
    where id = v_line_id;
  end if;

  perform public.recalculate_invoice_totals(inv.id);

  return v_line_id;
end;
$$;
