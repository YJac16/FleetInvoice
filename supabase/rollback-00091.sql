-- =============================================================================
-- ROLLBACK: 00091_jacobs_org_copy_function.sql
-- =============================================================================
-- Manual script. Run supabase/rollback-jacobs-org-copy.sql first (it needs
-- org_copy_map). Drops the copy functions and org_copy_map, and restores the
-- 00085 generate_driver_weekly_invoice (no staff-trip sweep).
-- =============================================================================

begin;

drop function if exists public.copy_orgs_to_jacobs_org(uuid[], text, text, uuid);
drop function if exists public.org_copy_table(uuid, uuid[], uuid, text, jsonb);
drop function if exists public.org_copy_dedupe(uuid, uuid[], text, text, text);
drop function if exists public.org_copy_remap(uuid, text, uuid);
drop table if exists public.org_copy_map;

CREATE OR REPLACE FUNCTION public.generate_driver_weekly_invoice(p_organisation_id uuid, p_driver_id uuid, p_period_start date, p_period_end date)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      array['organisation_admin', 'manager']
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
$function$
;

revoke all on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) from public, anon;
grant execute on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) to authenticated;

commit;
