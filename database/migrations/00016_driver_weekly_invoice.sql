-- =============================================================================
-- WorkOps — Driver weekly invoice (one bill per driver per week, WCL bill-to)
-- =============================================================================
-- Trips from all companies on one invoice; idempotent on org + driver + period.

-- ---------------------------------------------------------------------------
-- invoices.driver_id (nullable — legacy company-period invoices unchanged)
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists driver_id uuid references public.drivers (id) on delete set null;

create index if not exists invoices_driver_id_idx
  on public.invoices (driver_id)
  where driver_id is not null;

-- Company-period idempotency only when driver_id is null.
drop index if exists public.invoices_org_company_week_active_uidx;
create unique index invoices_org_company_week_active_uidx
  on public.invoices (organisation_id, company_id, period_start, period_end)
  where deleted_at is null and status <> 'void' and driver_id is null;

create unique index if not exists invoices_org_driver_week_active_uidx
  on public.invoices (organisation_id, driver_id, period_start, period_end)
  where deleted_at is null and status <> 'void' and driver_id is not null;

-- ---------------------------------------------------------------------------
-- Resolve bill-to company (org setting, then WCL Trading CC by name)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_invoice_bill_to_company_id(p_organisation_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bill_to uuid;
  setting text;
begin
  select o.settings->>'invoice_bill_to_company_id'
  into setting
  from public.organisations o
  where o.id = p_organisation_id
    and o.deleted_at is null;

  if setting is not null and setting <> '' then
    select c.id into bill_to
    from public.companies c
    where c.id = setting::uuid
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null;
    if bill_to is not null then
      return bill_to;
    end if;
  end if;

  select c.id into bill_to
  from public.companies c
  where c.organisation_id = p_organisation_id
    and c.deleted_at is null
    and lower(trim(c.name)) = lower('WCL Trading CC')
  order by c.created_at
  limit 1;

  return bill_to;
end;
$$;

grant execute on function public.resolve_invoice_bill_to_company_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: generate_driver_weekly_invoice
-- Completed trips for one driver; mixed companies as trip lines; draft only.
-- ---------------------------------------------------------------------------

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
  pax_count int;
  default_trip_rate constant numeric := 300;
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
    and i.period_end = p_period_end
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
    generated_by
  )
  values (
    p_organisation_id,
    bill_to_company_id,
    p_driver_id,
    p_period_start,
    p_period_end,
    'draft',
    auth.uid()
  )
  returning * into inv;

  for trip_row in
    select
      t.id,
      t.planned_start,
      t.notes,
      coalesce(nullif(trim(r.name), ''), '') as route_name,
      (
        select (regexp_match(t.notes, '(\d+)\s*pax', 'i'))[1]::int
      ) as pax_from_notes,
      (
        select trim(split_part(t.notes, '|', 3))
      ) as area_from_notes
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
    where t.organisation_id = p_organisation_id
      and t.deleted_at is null
      and t.status = 'completed'
      and t.planned_start >= (p_period_start::timestamp at time zone 'Africa/Johannesburg')
      and t.planned_start < (p_period_end::timestamp at time zone 'Africa/Johannesburg')
    order by t.planned_start
  loop
    trip_company_id := null;
    trip_rate := null;
    trip_card_id := null;

    select rc.unit_amount, rc.id into trip_rate, trip_card_id
    from public.rate_cards rc
    where rc.organisation_id = p_organisation_id
      and rc.deleted_at is null
      and rc.line_type = 'trip'
      and rc.unit = 'trip'
      and rc.company_id is null
      and rc.effective_from <= p_period_start
      and (rc.effective_to is null or rc.effective_to >= p_period_start)
    order by rc.effective_from desc
    limit 1;

    if trip_rate is null then
      select rc.unit_amount, rc.id into trip_rate, trip_card_id
      from public.rate_cards rc
      join public.companies c on c.id = rc.company_id
      where rc.organisation_id = p_organisation_id
        and rc.deleted_at is null
        and rc.line_type = 'trip'
        and rc.unit = 'trip'
        and lower(trim(c.name)) = lower(trim(trip_row.route_name))
        and rc.effective_from <= p_period_start
        and (rc.effective_to is null or rc.effective_to >= p_period_start)
      order by rc.effective_from desc
      limit 1;
    end if;

    trip_rate := coalesce(trip_rate, default_trip_rate);
    line_amount := round(trip_rate, 2);
    running_total := running_total + line_amount;
    pax_count := trip_row.pax_from_notes;

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
        '%s · %s · %s · %s',
        nullif(trip_row.route_name, ''),
        to_char(trip_row.planned_start at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI'),
        nullif(trim(trip_row.area_from_notes), ''),
        coalesce(trip_row.pax_from_notes::text, '')
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

grant execute on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) to authenticated;

comment on function public.generate_driver_weekly_invoice is
  'Idempotent draft invoice for one driver [period_start, period_end) in Africa/Johannesburg. Bill-to WCL; trip lines from all companies.';
