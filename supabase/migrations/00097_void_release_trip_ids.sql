-- =============================================================================
-- 00097: Void then regenerate (demo only)
-- =============================================================================
-- Voiding an invoice now frees its trips so they can be billed again.
--
-- invoice_lines_trip_id_uidx (00025) keeps one line per trip_id across all
-- invoices, and set_invoice_status (00085) voids without touching lines, so a
-- voided invoice's trip lines kept their trip_id: generate_period_invoice
-- (00085) hit the unique index and generate_driver_weekly_invoice (00091)
-- skipped those trips (`not exists (... il.trip_id = t.id)`).
--
-- Fix: when an invoice turns void, move each line's trip_id into
-- voided_trip_id and null trip_id. The unique index stays as it is, so two
-- non-void invoices still cannot bill the same trip. Line amounts and invoice
-- totals are not changed. Existing void invoices are backfilled.
--
-- sync_staff_trip_invoice_line (00070) matched void weekly invoices in its
-- week lookup and raised "weekly invoice is void". The lookup now skips void
-- invoices, so it files the trip on a new draft for that week.
--
-- set_invoice_status is unchanged (auth checks, void is final).
-- Rollback: supabase/rollback-00097.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- invoice_lines.voided_trip_id
-- ---------------------------------------------------------------------------

alter table public.invoice_lines
  add column if not exists voided_trip_id uuid
    references public.trips (id) on delete set null;

comment on column public.invoice_lines.voided_trip_id is
  'Trip this line billed before its invoice was voided (trip_id is then null so the trip can be billed again). Not unique.';

create index if not exists invoice_lines_voided_trip_id_idx
  on public.invoice_lines (voided_trip_id)
  where voided_trip_id is not null;

-- ---------------------------------------------------------------------------
-- Trigger: release trip_ids when an invoice is voided
-- ---------------------------------------------------------------------------

create or replace function public.invoices_release_trip_ids_on_void()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.invoice_lines il
  set voided_trip_id = coalesce(il.voided_trip_id, il.trip_id),
      trip_id = null
  where il.invoice_id = new.id
    and il.trip_id is not null;
  return new;
end;
$$;

revoke all on function public.invoices_release_trip_ids_on_void() from public, anon, authenticated;

drop trigger if exists invoices_release_trip_ids_on_void on public.invoices;
create trigger invoices_release_trip_ids_on_void
  before update of status on public.invoices
  for each row
  when (new.status = 'void' and old.status is distinct from 'void')
  execute function public.invoices_release_trip_ids_on_void();

-- ---------------------------------------------------------------------------
-- Backfill: invoices already void
-- ---------------------------------------------------------------------------

update public.invoice_lines il
set voided_trip_id = coalesce(il.voided_trip_id, il.trip_id),
    trip_id = null
from public.invoices i
where i.id = il.invoice_id
  and i.status = 'void'
  and il.trip_id is not null;

-- ---------------------------------------------------------------------------
-- sync_staff_trip_invoice_line: 00070 definition, week lookup skips void
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
  v_existing_price_overridden boolean;
  v_existing_override_reason text;
  v_existing_route_price_id uuid;
  v_existing_priced_area_key text;
  v_preserve_rate boolean := false;
  v_override numeric;
  v_override_reason text;
  v_price_overridden boolean := false;
  v_area_key text;
  v_route_price_id uuid := null;
  v_matched_route_id uuid;
  v_matched_route_amount numeric;
  v_card_amount numeric;
  v_card_id uuid;
  v_card_effective date;
  v_route_changed boolean := false;
  v_use_route boolean := false;
  v_can_preserve boolean := false;
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
    update public.trips
    set reprice_on_next_sync = false
    where id = p_trip_id
      and reprice_on_next_sync;
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
  v_area_key := public.route_area_key(coalesce(t.area_text, ''));

  select bo.override_unit_price, bo.reason
  into v_override, v_override_reason
  from public.trip_billing_overrides bo
  where bo.trip_id = p_trip_id;

  -- A price typed for this route wins, with an empty invoice reason.
  -- A saved billing override still wins when nothing was typed for this route,
  -- so existing overrides keep their amount and reason.
  if t.manual_unit_price is not null
     and t.manual_price_area_key is not distinct from v_area_key then
    v_rate := t.manual_unit_price;
    v_price_overridden := true;
    v_override_reason := null;
    v_route_price_id := null;
    select x.rate_card_id, x.rate_effective_on
    into v_rate_card_id, v_rate_effective_on
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date) x;
    v_rate_effective_on := coalesce(v_rate_effective_on, v_trip_date);
  elsif v_override is not null then
    v_rate := v_override;
    v_rate_card_id := null;
    v_rate_effective_on := v_trip_date;
    v_price_overridden := true;
  else
    v_override_reason := null;
    v_price_overridden := false;

    if v_line_id is not null then
      select
        il.trip_company_id,
        il.rate_card_id,
        il.unit_price,
        il.rate_effective_on,
        il.price_overridden,
        il.override_reason,
        il.route_price_id,
        il.priced_area_key
      into
        v_existing_trip_company_id,
        v_existing_rate_card_id,
        v_existing_unit_price,
        v_existing_rate_effective_on,
        v_existing_price_overridden,
        v_existing_override_reason,
        v_existing_route_price_id,
        v_existing_priced_area_key
      from public.invoice_lines il
      where il.id = v_line_id;
    end if;

    select rp.route_price_id, rp.unit_amount
    into v_matched_route_id, v_matched_route_amount
    from public.resolve_route_price(t.organisation_id, t.company_id, t.area_text) rp;

    select x.unit_amount, x.rate_card_id, x.rate_effective_on
    into v_card_amount, v_card_id, v_card_effective
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date) x;

    v_route_changed := t.reprice_on_next_sync
      or (
        v_existing_priced_area_key is not null
        and v_existing_priced_area_key is distinct from v_area_key
      );

    v_use_route := v_matched_route_id is not null
      and v_card_amount is not null
      and round(v_matched_route_amount, 2) is distinct from round(v_card_amount, 2);

    v_can_preserve := v_line_id is not null
      and v_existing_trip_company_id = t.company_id
      and v_existing_rate_card_id is not null
      and v_existing_unit_price is not null;

    if v_can_preserve and not v_route_changed then
      -- Unchanged route: keep the snapshotted amount, including lines written
      -- before templates existed (priced_area_key is null).
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
      v_price_overridden := coalesce(v_existing_price_overridden, false);
      v_override_reason := v_existing_override_reason;
      v_route_price_id := v_existing_route_price_id;
    elsif v_can_preserve
      and v_route_changed
      and not v_use_route
      and v_existing_route_price_id is null
      and coalesce(v_existing_price_overridden, false) = false then
      -- Route changed but no template applies, and the line was a plain rate-card
      -- price. Leave that snapshot alone (same as before templates existed).
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
      v_price_overridden := false;
      v_override_reason := null;
      v_route_price_id := null;
    elsif v_use_route then
      v_rate := v_matched_route_amount;
      v_rate_card_id := v_card_id;
      v_rate_effective_on := coalesce(v_card_effective, v_trip_date);
      v_price_overridden := true;
      v_override_reason := null;
      v_route_price_id := v_matched_route_id;
    else
      if v_card_amount is null then
        raise exception 'No trip rate configured for this company. Add a rate before saving this waybill.';
      end if;
      v_rate := v_card_amount;
      v_rate_card_id := v_card_id;
      v_rate_effective_on := v_card_effective;
      v_price_overridden := false;
      v_override_reason := null;
      v_route_price_id := null;
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
    and i.status <> 'void'
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
      override_reason,
      route_price_id,
      priced_area_key
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
      v_override_reason,
      v_route_price_id,
      v_area_key
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
        override_reason = v_override_reason,
        route_price_id = v_route_price_id,
        priced_area_key = v_area_key
    where id = v_line_id;
  end if;

  perform public.recalculate_invoice_totals(inv.id);

  update public.trips
  set reprice_on_next_sync = false
  where id = p_trip_id
    and reprice_on_next_sync;

  return v_line_id;
end;
$$;

revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public, anon;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to authenticated;

commit;
