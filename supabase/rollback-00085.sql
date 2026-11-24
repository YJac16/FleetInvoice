-- =============================================================================
-- ROLLBACK: 00085_finance_writes_admin_only.sql
-- =============================================================================
-- Manual script, not part of the migration chain. Restores each function and
-- policy exactly as its latest definition before 00085:
--
--   apply_company_trip_rate          (latest 00069_rate_card_edit_archive_restore.sql)
--   earliest_unbilled_trip_date      (latest 00069_rate_card_edit_archive_restore.sql)
--   list_archived_rate_cards         (latest 00069_rate_card_edit_archive_restore.sql)
--   generate_period_invoice          (latest 00057_company_portal_phase1_isolation.sql)
--   generate_driver_weekly_invoice   (latest 00051_invoice_period_inclusive_sunday_sast.sql)
--   generate_weekly_fuel_invoice     (latest 00007_phase5_fuel_and_invoices.sql)
--   set_invoice_status               (latest 00057_company_portal_phase1_isolation.sql)
--   update_draft_invoice_line        (latest 00070_route_price_templates.sql)
--   update_invoice_line_area         (latest 00018_locations_and_invoice_area.sql)
--   generate_payroll_run             (latest 00012_phase8_payroll.sql)
--   finalize_payroll_run             (latest 00012_phase8_payroll.sql)
--   void_payroll_run                 (latest 00012_phase8_payroll.sql)
--   policy invoices_update           on invoices      (latest 00007_phase5_fuel_and_invoices.sql)
--   policy rate_cards_insert         on rate_cards    (latest 00011_phase8_billing.sql)
--   policy rate_cards_update         on rate_cards    (latest 00011_phase8_billing.sql)
--   policy route_prices_insert       on route_prices  (latest 00070_route_price_templates.sql)
--   policy route_prices_update       on route_prices  (latest 00070_route_price_templates.sql)
--   policy pay_rates_insert          on pay_rates     (latest 00012_phase8_payroll.sql)
--   policy pay_rates_update          on pay_rates     (latest 00012_phase8_payroll.sql)
-- =============================================================================

begin;

create or replace function public.apply_company_trip_rate(
  p_organisation_id uuid,
  p_company_id uuid,
  p_amount numeric,
  p_effective_from date,
  p_name text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company public.companies%rowtype;
  v_card_id uuid;
  v_next_from date;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised to manage rate cards';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Trip rate must be zero or more';
  end if;
  if p_effective_from is null then
    raise exception 'Trip rate effective from is required when setting a trip rate';
  end if;

  select * into v_company from public.companies
  where id = p_company_id and organisation_id = p_organisation_id and deleted_at is null;
  if not found then
    raise exception 'Company not found';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_company.name || ' trip rate');

  -- Same effective_from: correct the existing card in place.
  select rc.id into v_card_id
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.company_id = p_company_id
    and rc.line_type = 'trip'
    and rc.deleted_at is null
    and rc.effective_from = p_effective_from
  order by rc.created_at desc
  limit 1;

  if v_card_id is not null then
    update public.rate_cards
    set unit_amount = p_amount,
        name = v_name,
        notes = coalesce(nullif(trim(p_notes), ''), notes),
        updated_at = timezone('utc', now())
    where id = v_card_id;
  else
    -- Next card after the new date (if any) bounds the new card.
    select min(rc.effective_from) into v_next_from
    from public.rate_cards rc
    where rc.organisation_id = p_organisation_id
      and rc.company_id = p_company_id
      and rc.line_type = 'trip'
      and rc.deleted_at is null
      and rc.effective_from > p_effective_from;

    -- Close the card that was open on the new date.
    update public.rate_cards rc
    set effective_to = p_effective_from - 1,
        updated_at = timezone('utc', now())
    where rc.organisation_id = p_organisation_id
      and rc.company_id = p_company_id
      and rc.line_type = 'trip'
      and rc.deleted_at is null
      and rc.effective_from < p_effective_from
      and (rc.effective_to is null or rc.effective_to >= p_effective_from);

    insert into public.rate_cards (
      organisation_id, company_id, name, line_type, unit, unit_amount,
      currency, effective_from, effective_to, notes, created_by
    )
    values (
      p_organisation_id, p_company_id, v_name, 'trip', 'fixed', p_amount,
      'ZAR', p_effective_from,
      case when v_next_from is not null then v_next_from - 1 end,
      nullif(trim(p_notes), ''), auth.uid()
    )
    returning id into v_card_id;
  end if;

  perform public.reprice_draft_trip_lines(p_organisation_id, p_company_id, p_effective_from);
  return v_card_id;
end;
$$;

create or replace function public.earliest_unbilled_trip_date(
  p_organisation_id uuid,
  p_company_id uuid
)
returns date
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select min((t.planned_start at time zone 'Africa/Johannesburg')::date)
  from public.trips t
  where t.organisation_id = p_organisation_id
    and t.company_id = p_company_id
    and t.deleted_at is null
    and t.status = 'completed'
    and auth.uid() is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        p_organisation_id,
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
    )
    and not exists (
      select 1
      from public.invoice_lines il
      join public.invoices i on i.id = il.invoice_id
      where il.trip_id = t.id
        and i.deleted_at is null
        and i.status <> 'draft'
    );
$$;

create or replace function public.list_archived_rate_cards(p_organisation_id uuid)
returns setof public.rate_cards
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select rc.*
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.deleted_at is not null
    and auth.uid() is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        p_organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
  order by rc.name, rc.effective_from desc;
$$;

create or replace function public.generate_period_invoice(
  p_organisation_id uuid,
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  can_generate boolean;
  existing public.invoices%rowtype;
  inv public.invoices%rowtype;
  fill public.fuel_fillups%rowtype;
  trip_row record;
  card public.rate_cards%rowtype;
  line_amount numeric;
  running_total numeric := 0;
  trip_rate numeric;
  trip_card_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
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

  perform pg_advisory_xact_lock(
    hashtext(p_organisation_id::text || ':' || p_company_id::text),
    hashtext(p_period_start::text || ':' || p_period_end::text)
  );

  select * into existing
  from public.invoices i
  where i.organisation_id = p_organisation_id
    and i.company_id = p_company_id
    and i.period_start = p_period_start
    and i.period_end = p_period_end
    and i.deleted_at is null
    and i.status <> 'void'
    and i.driver_id is null
  limit 1;

  if found then
    return existing;
  end if;

  begin
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
      p_period_start,
      p_period_end,
      'draft',
      auth.uid()
    )
    returning * into inv;
  exception
    when unique_violation then
      select * into inv
      from public.invoices i
      where i.organisation_id = p_organisation_id
        and i.company_id = p_company_id
        and i.period_start = p_period_start
        and i.period_end = p_period_end
        and i.deleted_at is null
        and i.status <> 'void'
        and i.driver_id is null
      limit 1;

      if not found then
        raise;
      end if;

      return inv;
  end;

  for fill in
    select f.*
    from public.fuel_fillups f
    where f.organisation_id = p_organisation_id
      and f.company_id = p_company_id
      and f.deleted_at is null
      and f.filled_at >= p_period_start::timestamptz
      and f.filled_at < p_period_end::timestamptz
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

  select rc.unit_amount, rc.id into trip_rate, trip_card_id
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.deleted_at is null
    and rc.line_type = 'trip'
    and rc.unit = 'trip'
    and (rc.company_id = p_company_id or rc.company_id is null)
    and rc.effective_from <= p_period_start
    and (rc.effective_to is null or rc.effective_to >= p_period_start)
  order by rc.company_id nulls last, rc.effective_from desc
  limit 1;

  if trip_rate is not null then
    for trip_row in
      select t.id, t.planned_start
      from public.trips t
      join public.trip_assignments ta
        on ta.trip_id = t.id
       and ta.organisation_id = t.organisation_id
       and ta.deleted_at is null
       and ta.released_at is null
      join public.vehicles v
        on v.id = ta.vehicle_id
       and v.deleted_at is null
      where t.organisation_id = p_organisation_id
        and t.deleted_at is null
        and t.status = 'completed'
        and v.company_id = p_company_id
        and t.planned_start >= p_period_start::timestamptz
        and t.planned_start < p_period_end::timestamptz
      order by t.planned_start
    loop
      line_amount := round(trip_rate, 2);
      running_total := running_total + line_amount;

      insert into public.invoice_lines (
        organisation_id,
        invoice_id,
        line_type,
        rate_card_id,
        trip_id,
        description,
        quantity,
        unit_price,
        amount
      )
      values (
        p_organisation_id,
        inv.id,
        'trip',
        trip_card_id,
        trip_row.id,
        format(
          'Completed trip %s',
          to_char(trip_row.planned_start at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
        ),
        1,
        trip_rate,
        line_amount
      );
    end loop;
  end if;

  for card in
    select rc.*
    from public.rate_cards rc
    where rc.organisation_id = p_organisation_id
      and rc.deleted_at is null
      and rc.line_type = 'fixed'
      and rc.unit = 'fixed'
      and (rc.company_id = p_company_id or rc.company_id is null)
      and rc.effective_from < p_period_end
      and (rc.effective_to is null or rc.effective_to >= p_period_start)
    order by rc.name
  loop
    line_amount := round(card.unit_amount, 2);
    running_total := running_total + line_amount;

    insert into public.invoice_lines (
      organisation_id,
      invoice_id,
      line_type,
      rate_card_id,
      description,
      quantity,
      unit_price,
      amount
    )
    values (
      p_organisation_id,
      inv.id,
      'fixed',
      card.id,
      card.name,
      1,
      card.unit_amount,
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

create or replace function public.generate_driver_weekly_invoice(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  can_generate boolean;
  bill_to_company_id uuid;
  existing public.invoices%rowtype;
  inv public.invoices%rowtype;
  trip_row record;
  line_amount numeric;
  running_total numeric := 0;
  trip_rate numeric;
  trip_card_id uuid;
  trip_company_id uuid;
  v_rate_effective_on date;
  v_trip_date date;
  pax_count int;
  week_start_ts timestamptz;
  week_end_ts timestamptz;
  v_period_end date;
  rate_err constant text :=
    'No trip rate configured for this company. Add a rate before saving this waybill.';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_period_end := public.normalize_invoice_period_end(p_period_start, p_period_end);
  if v_period_end is null then
    raise exception 'Invalid invoice week: period_end must be Sunday (start + 6 days)';
  end if;

  if v_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  week_start_ts := public.invoice_period_lower_bound_sast(p_period_start);
  week_end_ts := public.invoice_period_upper_bound_sast(p_period_start, v_period_end);

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    );

  if not can_generate then
    raise exception 'Not authorised to generate invoices';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  bill_to_company_id := public.resolve_invoice_bill_to_company_id(p_organisation_id);
  if bill_to_company_id is null then
    raise exception 'Bill-to company not configured (set organisations.settings.invoice_bill_to_company_id or add WCL Trading CC)';
  end if;

  select * into existing
  from public.invoices i
  where i.organisation_id = p_organisation_id
    and i.driver_id = p_driver_id
    and i.period_start = p_period_start
    and (
      i.period_end = v_period_end
      or i.period_end = v_period_end + 1
    )
    and coalesce(i.trip_company, '') = ''
    and i.deleted_at is null
    and i.status <> 'void'
  limit 1;

  if found then
    return existing;
  end if;

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
    p_organisation_id,
    bill_to_company_id,
    p_driver_id,
    p_period_start,
    v_period_end,
    'draft',
    auth.uid(),
    format(
      'Invoice date %s (Monday after Sunday %s)',
      to_char(v_period_end + 1, 'DD/MM/YYYY'),
      to_char(v_period_end, 'DD/MM/YYYY')
    )
  )
  returning * into inv;

  for trip_row in
    select
      t.id,
      t.planned_start,
      coalesce(t.company_id, r.company_id) as company_id,
      coalesce(tc.name, 'Unknown company') as company_name,
      coalesce(a.name, 'Unknown area') as area_name,
      (
        select count(*)::int
        from public.trip_passengers tp
        where tp.trip_id = t.id
          and tp.organisation_id = t.organisation_id
          and tp.status <> 'cancelled'
      ) as pax_count
    from public.trips t
    join public.trip_assignments ta
      on ta.trip_id = t.id
     and ta.organisation_id = t.organisation_id
     and ta.deleted_at is null
     and ta.released_at is null
     and ta.driver_id = p_driver_id
    join public.routes r
      on r.id = t.route_id
     and r.deleted_at is null
    left join public.companies tc
      on tc.id = coalesce(t.company_id, r.company_id)
     and tc.deleted_at is null
    left join public.areas a
      on a.id = r.area_id
     and a.deleted_at is null
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.status = 'completed'
      and t.planned_start >= week_start_ts
      and t.planned_start < week_end_ts
    order by t.planned_start
  loop
    trip_company_id := trip_row.company_id;
    v_trip_date := (trip_row.planned_start at time zone 'Africa/Johannesburg')::date;

    select r.unit_amount, r.rate_card_id, r.rate_effective_on
    into trip_rate, trip_card_id, v_rate_effective_on
    from public.resolve_trip_line_rate(
      p_organisation_id,
      trip_company_id,
      v_trip_date
    ) r;

    if trip_rate is null then
      raise exception '%', rate_err;
    end if;

    line_amount := round(trip_rate, 2);
    running_total := running_total + line_amount;
    pax_count := coalesce(trip_row.pax_count, 0);

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
      amount
    )
    values (
      p_organisation_id,
      inv.id,
      'trip',
      trip_card_id,
      trip_row.id,
      trip_company_id,
      v_rate_effective_on,
      format(
        '%s · %s · %s · %s pax',
        trip_row.company_name,
        to_char(trip_row.planned_start at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI'),
        trip_row.area_name,
        pax_count::text
      ),
      1,
      trip_rate,
      line_amount
    );
  end loop;

  update public.invoices
  set subtotal = running_total,
      total = running_total
  where id = inv.id
  returning * into inv;

  return inv;
end;
$$;

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
  period_end date;
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

  period_end := p_week_start + 7;

  can_generate := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
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
    and i.period_end = period_end
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
    period_end,
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
      and f.filled_at < period_end::timestamptz
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

create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_status public.invoice_status
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices%rowtype;
  can_manage boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.invoices i
  where i.id = p_invoice_id
    and i.deleted_at is null;
  if not found then
    raise exception 'Invoice not found';
  end if;

  can_manage := public.is_platform_owner()
    or public.has_org_role_names(
      inv.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    );

  if not can_manage then
    raise exception 'Not authorised to update invoice status';
  end if;

  if inv.status = 'void' then
    raise exception 'Void invoices cannot change status';
  end if;

  if inv.status = 'paid' and p_status <> 'paid' then
    raise exception 'Paid invoices cannot change status';
  end if;

  if p_status = 'void' then
    if inv.status not in ('draft', 'issued') then
      raise exception 'Only draft or issued invoices can be voided';
    end if;
    update public.invoices
    set status = 'void',
        updated_at = timezone('utc', now())
    where id = inv.id
    returning * into inv;
    return inv;
  end if;

  if p_status = 'issued' then
    if inv.status not in ('draft', 'issued') then
      raise exception 'Cannot issue invoice from status %', inv.status;
    end if;
    update public.invoices
    set status = 'issued',
        issued_at = coalesce(issued_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where id = inv.id
    returning * into inv;
    return inv;
  end if;

  if p_status = 'paid' then
    if inv.status not in ('issued', 'paid') then
      raise exception 'Only issued invoices can be marked paid';
    end if;
    update public.invoices
    set status = 'paid',
        paid_at = coalesce(paid_at, timezone('utc', now())),
        issued_at = coalesce(issued_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where id = inv.id
    returning * into inv;
    return inv;
  end if;

  if p_status = 'draft' then
    raise exception 'Cannot revert to draft';
  end if;

  raise exception 'Unsupported status %', p_status;
end;
$$;

create or replace function public.update_draft_invoice_line(
  p_line_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric
)
returns public.invoice_lines
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  line public.invoice_lines%rowtype;
  inv public.invoices%rowtype;
  can_manage boolean;
  trimmed_description text;
  line_amount numeric;
  invoice_total numeric;
  v_price_changed boolean;
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
    );

  if not can_manage then
    raise exception 'Not authorised to update invoice lines';
  end if;

  line_amount := round(p_quantity * p_unit_price, 2);
  v_price_changed := round(p_unit_price, 2) is distinct from round(line.unit_price, 2);

  update public.invoice_lines
  set description = trimmed_description,
      quantity = p_quantity,
      unit_price = p_unit_price,
      amount = line_amount,
      price_overridden = case when v_price_changed then true else line.price_overridden end,
      override_reason = case when v_price_changed then null else line.override_reason end,
      route_price_id = case when v_price_changed then null else line.route_price_id end
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

create or replace function public.update_invoice_line_area(
  p_line_id uuid,
  p_area text
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
  trimmed_area text;
  parts text[];
  datetime_part text;
  company_part text;
  pax_part text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  trimmed_area := trim(coalesce(p_area, ''));
  if trimmed_area = '' then
    raise exception 'AREA is required';
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

  if inv.status = 'void' then
    raise exception 'Cannot edit void invoice lines';
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

  parts := string_to_array(line.description, '|');
  if array_length(parts, 1) >= 4 then
    datetime_part := trim(parts[1]);
    company_part := trim(parts[2]);
    pax_part := trim(parts[3]);
    line.description := datetime_part || ' | ' || company_part || ' | ' || pax_part || ' | ' || trimmed_area;
  elsif line.line_type = 'trip' and line.trip_id is not null then
    line.description := trimmed_area;
  else
    line.description := trimmed_area;
  end if;

  update public.invoice_lines
  set description = line.description
  where id = line.id
  returning * into line;

  return line;
end;
$$;

create or replace function public.generate_payroll_run(
  p_organisation_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  can_manage boolean;
  existing public.payroll_runs%rowtype;
  run public.payroll_runs%rowtype;
  trip_row record;
  board_row record;
  rate public.pay_rates%rowtype;
  line_amount numeric;
  running_total numeric := 0;
  company_for_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'period_end must be after period_start';
  end if;

  can_manage := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    );

  if not can_manage then
    raise exception 'Not authorised to generate payroll';
  end if;

  select * into existing
  from public.payroll_runs r
  where r.organisation_id = p_organisation_id
    and r.period_start = p_period_start
    and r.period_end = p_period_end
    and r.deleted_at is null
    and r.status <> 'void'
  limit 1;

  if found then
    return existing;
  end if;

  insert into public.payroll_runs (
    organisation_id,
    period_start,
    period_end,
    status,
    generated_by
  )
  values (
    p_organisation_id,
    p_period_start,
    p_period_end,
    'draft',
    auth.uid()
  )
  returning * into run;

  -- Driver trip lines
  for trip_row in
    select
      t.id as trip_id,
      t.planned_start,
      ta.driver_id,
      v.company_id
    from public.trips t
    join public.trip_assignments ta
      on ta.trip_id = t.id
     and ta.organisation_id = t.organisation_id
     and ta.deleted_at is null
     and ta.released_at is null
    left join public.vehicles v
      on v.id = ta.vehicle_id
     and v.deleted_at is null
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.status = 'completed'
      and t.planned_start >= p_period_start::timestamptz
      and t.planned_start < p_period_end::timestamptz
    order by t.planned_start
  loop
    company_for_trip := trip_row.company_id;
    select * into rate
    from public.resolve_pay_rate(
      p_organisation_id,
      'driver'::public.pay_subject_role,
      'trip'::public.pay_rate_unit,
      company_for_trip,
      p_period_start
    );
    if not found then
      continue;
    end if;

    line_amount := round(rate.unit_amount, 2);
    running_total := running_total + line_amount;

    insert into public.payroll_lines (
      organisation_id,
      payroll_run_id,
      line_type,
      driver_id,
      pay_rate_id,
      trip_id,
      description,
      quantity,
      unit_amount,
      amount
    )
    values (
      p_organisation_id,
      run.id,
      'trip',
      trip_row.driver_id,
      rate.id,
      trip_row.trip_id,
      format(
        'Completed trip %s',
        to_char(trip_row.planned_start at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
      ),
      1,
      rate.unit_amount,
      line_amount
    );
  end loop;

  -- Employee boarding lines
  for board_row in
    select
      ae.id as attendance_event_id,
      ae.employee_id,
      ae.created_at,
      e.company_id,
      e.full_name
    from public.attendance_events ae
    join public.employees e
      on e.id = ae.employee_id
     and e.deleted_at is null
    where ae.organisation_id = p_organisation_id
      and ae.event_type = 'boarded'
      and ae.created_at >= p_period_start::timestamptz
      and ae.created_at < p_period_end::timestamptz
    order by ae.created_at
  loop
    select * into rate
    from public.resolve_pay_rate(
      p_organisation_id,
      'employee'::public.pay_subject_role,
      'boarding'::public.pay_rate_unit,
      board_row.company_id,
      p_period_start
    );
    if not found then
      continue;
    end if;

    line_amount := round(rate.unit_amount, 2);
    running_total := running_total + line_amount;

    insert into public.payroll_lines (
      organisation_id,
      payroll_run_id,
      line_type,
      employee_id,
      pay_rate_id,
      attendance_event_id,
      description,
      quantity,
      unit_amount,
      amount
    )
    values (
      p_organisation_id,
      run.id,
      'boarding',
      board_row.employee_id,
      rate.id,
      board_row.attendance_event_id,
      format(
        'Boarding %s (%s)',
        coalesce(board_row.full_name, 'employee'),
        to_char(board_row.created_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
      ),
      1,
      rate.unit_amount,
      line_amount
    );
  end loop;

  -- Fixed rates (one org-level line per active fixed pay_rate)
  for rate in
    select pr.*
    from public.pay_rates pr
    where pr.organisation_id = p_organisation_id
      and pr.deleted_at is null
      and pr.unit = 'fixed'
      and pr.effective_from < p_period_end
      and (pr.effective_to is null or pr.effective_to >= p_period_start)
    order by pr.name
  loop
    line_amount := round(rate.unit_amount, 2);
    running_total := running_total + line_amount;

    insert into public.payroll_lines (
      organisation_id,
      payroll_run_id,
      line_type,
      pay_rate_id,
      description,
      quantity,
      unit_amount,
      amount
    )
    values (
      p_organisation_id,
      run.id,
      'fixed',
      rate.id,
      rate.name,
      1,
      rate.unit_amount,
      line_amount
    );
  end loop;

  update public.payroll_runs
  set total = running_total
  where id = run.id
  returning * into run;

  return run;
end;
$$;

create or replace function public.finalize_payroll_run(p_run_id uuid)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.payroll_runs%rowtype;
  can_manage boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into run
  from public.payroll_runs r
  where r.id = p_run_id
    and r.deleted_at is null;
  if not found then
    raise exception 'Payroll run not found';
  end if;

  can_manage := public.is_platform_owner()
    or public.has_org_role_names(
      run.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    );
  if not can_manage then
    raise exception 'Not authorised to finalize payroll';
  end if;

  if run.status <> 'draft' then
    raise exception 'Only draft runs can be finalized';
  end if;

  update public.payroll_runs
  set status = 'finalized',
      finalized_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = run.id
  returning * into run;

  return run;
end;
$$;

create or replace function public.void_payroll_run(p_run_id uuid)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  run public.payroll_runs%rowtype;
  can_manage boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into run
  from public.payroll_runs r
  where r.id = p_run_id
    and r.deleted_at is null;
  if not found then
    raise exception 'Payroll run not found';
  end if;

  can_manage := public.is_platform_owner()
    or public.has_org_role_names(
      run.organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    );
  if not can_manage then
    raise exception 'Not authorised to void payroll';
  end if;

  if run.status = 'void' then
    raise exception 'Run already void';
  end if;

  update public.payroll_runs
  set status = 'void',
      updated_at = timezone('utc', now())
  where id = run.id
  returning * into run;

  return run;
end;
$$;

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists rate_cards_insert on public.rate_cards;
create policy rate_cards_insert on public.rate_cards
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists rate_cards_update on public.rate_cards;
create policy rate_cards_update on public.rate_cards
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists route_prices_insert on public.route_prices;
create policy route_prices_insert on public.route_prices
  for insert
  with check (
    (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
    and exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.organisation_id = route_prices.organisation_id
        and c.deleted_at is null
    )
  );

drop policy if exists route_prices_update on public.route_prices;
create policy route_prices_update on public.route_prices
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
    and exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.organisation_id = route_prices.organisation_id
        and c.deleted_at is null
    )
  );

drop policy if exists pay_rates_insert on public.pay_rates;
create policy pay_rates_insert on public.pay_rates
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists pay_rates_update on public.pay_rates;
create policy pay_rates_update on public.pay_rates
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

commit;
