-- =============================================================================
-- Driver weekly invoices: store period_end as inclusive Sunday (SAST Mon–Sun)
-- =============================================================================
-- service_week_bounds_sast previously returned exclusive Monday (+7), which was
-- persisted on auto-created draft invoices (waybill sync / backfill).

-- ---------------------------------------------------------------------------
-- Helpers: normalize stored period_end and SAST timestamptz bounds
-- ---------------------------------------------------------------------------

create or replace function public.normalize_invoice_period_end(
  p_period_start date,
  p_period_end date
)
returns date
language sql
immutable
as $$
  select case
    when p_period_end - p_period_start = 6 then p_period_end
    when p_period_end - p_period_start = 7 then p_period_end - 1
    else null
  end;
$$;

comment on function public.normalize_invoice_period_end(date, date) is
  'Returns inclusive Sunday period_end; accepts legacy exclusive Monday (+7 span).';

create or replace function public.invoice_period_lower_bound_sast(p_period_start date)
returns timestamptz
language sql
immutable
as $$
  select (p_period_start::timestamp at time zone 'Africa/Johannesburg');
$$;

create or replace function public.invoice_period_upper_bound_sast(
  p_period_start date,
  p_period_end date
)
returns timestamptz
language sql
immutable
as $$
  select case
    when public.normalize_invoice_period_end(p_period_start, p_period_end) is not null then
      (
        (public.normalize_invoice_period_end(p_period_start, p_period_end) + 1)::timestamp
        at time zone 'Africa/Johannesburg'
      )
    else
      (p_period_end::timestamp at time zone 'Africa/Johannesburg')
  end;
$$;

comment on function public.invoice_period_upper_bound_sast(date, date) is
  'Exclusive upper bound for trip timestamps: Monday 00:00 SAST after the service week.';

-- ---------------------------------------------------------------------------
-- Service week for planned_start in Africa/Johannesburg (stored dates)
-- ---------------------------------------------------------------------------

create or replace function public.service_week_bounds_sast(p_planned_start timestamptz)
returns table (period_start date, period_end date)
language sql
immutable
as $$
  select
    (
      (p_planned_start at time zone 'Africa/Johannesburg')::date
      - ((extract(isodow from (p_planned_start at time zone 'Africa/Johannesburg')::date)::int - 1) * interval '1 day')
    )::date as period_start,
    (
      (p_planned_start at time zone 'Africa/Johannesburg')::date
      - ((extract(isodow from (p_planned_start at time zone 'Africa/Johannesburg')::date)::int - 1) * interval '1 day')
      + interval '6 days'
    )::date as period_end;
$$;

comment on function public.service_week_bounds_sast(timestamptz) is
  'Mon–Sun service week in Africa/Johannesburg; period_end is inclusive Sunday.';

-- ---------------------------------------------------------------------------
-- sync_staff_trip_invoice_line — persist inclusive Sunday on new drafts
-- ---------------------------------------------------------------------------

create or replace function public.sync_staff_trip_invoice_line(
  p_trip_id uuid,
  p_remove boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
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
    and i.status = 'draft'
  limit 1;

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
  elsif inv.status <> 'draft' then
    raise exception 'Cannot add trip line: weekly invoice is % (must be draft)', inv.status;
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
      amount
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
      v_line_amount
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
        amount = v_line_amount
    where id = v_line_id;
  end if;

  perform public.recalculate_invoice_totals(inv.id);

  return v_line_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- generate_driver_weekly_invoice — store inclusive Sunday; SAST trip window
-- ---------------------------------------------------------------------------

create or replace function public.generate_driver_weekly_invoice(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_period_start date,
  p_period_end date
)
returns setof public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  can_generate boolean;
  bill_to_company_id uuid;
  inv public.invoices%rowtype;
  trip_row record;
  line_amount numeric;
  running_total numeric;
  trip_rate numeric;
  trip_card_id uuid;
  trip_company_id uuid;
  pax_count int;
  default_trip_rate constant numeric := 300;
  week_start_ts timestamptz;
  week_end_ts timestamptz;
  trip_company_label text;
  v_period_end date;
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

  for trip_company_label in
    select distinct coalesce(tc.name, 'Unknown company') as company_name
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
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.status = 'completed'
      and t.planned_start >= week_start_ts
      and t.planned_start < week_end_ts
    order by 1
  loop
    select * into inv
    from public.invoices i
    where i.organisation_id = p_organisation_id
      and i.driver_id = p_driver_id
      and i.period_start = p_period_start
      and (
        i.period_end = v_period_end
        or i.period_end = v_period_end + 1
      )
      and coalesce(i.trip_company, '') = trip_company_label
      and i.deleted_at is null
      and i.status <> 'void'
    limit 1;

    if not found then
      insert into public.invoices (
        organisation_id,
        company_id,
        driver_id,
        trip_company,
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
        trip_company_label,
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

      running_total := 0;

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
          and coalesce(tc.name, 'Unknown company') = trip_company_label
        order by t.planned_start
      loop
        trip_company_id := trip_row.company_id;
        trip_rate := null;
        trip_card_id := null;

        select rc.unit_amount, rc.id into trip_rate, trip_card_id
        from public.rate_cards rc
        where rc.organisation_id = p_organisation_id
          and rc.deleted_at is null
          and rc.line_type = 'trip'
          and rc.unit = 'trip'
          and (rc.company_id = trip_company_id or rc.company_id is null)
          and rc.effective_from <= p_period_start
          and (rc.effective_to is null or rc.effective_to >= p_period_start)
        order by rc.company_id nulls last, rc.effective_from desc
        limit 1;

        trip_rate := coalesce(trip_rate, default_trip_rate);
        line_amount := round(trip_rate, 2);
        running_total := running_total + line_amount;
        pax_count := coalesce(trip_row.pax_count, 0);

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
    end if;

    return next inv;
  end loop;

  return;
end;
$$;

comment on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) is
  'Idempotent draft invoices for one driver Mon–Sun (Africa/Johannesburg); period_end is inclusive Sunday.';
