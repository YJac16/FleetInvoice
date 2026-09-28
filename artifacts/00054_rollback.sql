-- =============================================================================
-- Rollback for 00054_fuel_slips.sql (fuel slip spec v2).
-- 00053 enum values (fuel_slip_queried / fuel_slip_rejected) cannot be removed in
-- PostgreSQL and are left in place; nothing depends on them after this rollback.
--
-- Dropping review_status would let pending/rejected/voided slip rows enter new
-- invoices again, so this aborts if any non-legacy row exists unless forced:
--   set fuel_rollback.force = 'true';
-- Photo objects in the fuel-slips bucket are NOT removed here; purge them through
-- the Storage API before deleting the bucket.
-- =============================================================================

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_fillups' and column_name = 'entry_method'
  ) and exists (
    select 1 from public.fuel_fillups where entry_method <> 'legacy_manual'
  ) and coalesce(current_setting('fuel_rollback.force', true), '') <> 'true' then
    raise exception 'fuel_fillups contains fuel-slip rows; set fuel_rollback.force = true to roll back anyway';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs and helpers introduced by 00054
-- ---------------------------------------------------------------------------

drop function if exists public.run_fuel_slip_retention(timestamptz);
drop function if exists public.save_fuel_settings(uuid, uuid, jsonb);
drop function if exists public.audit_fuel_report_export(uuid, uuid, text, jsonb, integer);
drop function if exists public.audit_fuel_slip_photo_view(uuid, uuid, uuid);
drop function if exists public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid, text);
drop function if exists public.void_fuel_slip(uuid, uuid, uuid, text, timestamptz);
drop function if exists public.review_fuel_slip(uuid, uuid, uuid, text, text, text, jsonb, timestamptz);
drop function if exists public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb, timestamptz);
drop function if exists public.update_fuel_slip(uuid, uuid, uuid, jsonb, timestamptz);
drop function if exists public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb);
drop function if exists public.evaluate_fuel_entry_flags(uuid, uuid, text);
drop function if exists public.fuel_slip_result(uuid);
drop function if exists public.fuel_refresh_flag_counts(uuid);
drop function if exists public.fuel_slip_photo_input(uuid, jsonb);
drop function if exists public.fuel_slip_normalise_fields(jsonb, text);
drop function if exists public.fuel_actor_driver_id(uuid, uuid);
drop function if exists public.fuel_actor_role(uuid, uuid);
drop function if exists public.fuel_parse_numeric(jsonb, text);
drop function if exists public.fuel_severity_rank(text);
drop function if exists public.fuel_fuel_family(text);
drop function if exists public.fuel_normalise_vrn(text);
drop function if exists public.fuel_path_sha256(text);
drop function if exists public.fuel_setting(uuid);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

drop table if exists public.fuel_entry_flags;
drop table if exists public.fuel_slip_photos;
drop table if exists public.fuel_settings;

-- ---------------------------------------------------------------------------
-- fuel_fillups: policies, indexes, constraints, columns
-- ---------------------------------------------------------------------------

drop policy if exists fuel_fillups_select on public.fuel_fillups;
create policy fuel_fillups_select on public.fuel_fillups
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          public.has_org_role_names(
            organisation_id,
            array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
          )
          or driver_id = public.current_driver_id(organisation_id)
          or (
            company_id is not null
            and public.has_company_scope(organisation_id, company_id)
          )
        )
      )
    )
  );

drop policy if exists fuel_fillups_insert on public.fuel_fillups;
create policy fuel_fillups_insert on public.fuel_fillups
  for insert
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    or driver_id = public.current_driver_id(organisation_id)
  );

drop policy if exists fuel_fillups_update on public.fuel_fillups;
create policy fuel_fillups_update on public.fuel_fillups
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  )
  with check (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

grant select, insert, update, delete on public.fuel_fillups to authenticated;

drop index if exists public.fuel_fillups_review_queue_idx;
drop index if exists public.fuel_fillups_driver_filled_live_idx;
drop index if exists public.fuel_fillups_org_client_entry_uidx;
drop index if exists public.fuel_fillups_org_vat_slip_idx;
drop index if exists public.fuel_fillups_org_auth_filled_idx;
drop index if exists public.fuel_fillups_org_retain_until_idx;

alter table public.fuel_fillups
  drop constraint if exists fuel_fillups_entry_method_check,
  drop constraint if exists fuel_fillups_review_status_check,
  drop constraint if exists fuel_fillups_fuel_type_check,
  drop constraint if exists fuel_fillups_slip_vrn_status_check,
  drop constraint if exists fuel_fillups_slip_vrn_format_check,
  drop constraint if exists fuel_fillups_slip_vrn_required_check,
  drop constraint if exists fuel_fillups_authorisation_no_check,
  drop constraint if exists fuel_fillups_order_no_check,
  drop constraint if exists fuel_fillups_pump_no_check,
  drop constraint if exists fuel_fillups_station_vat_no_check,
  drop constraint if exists fuel_fillups_slip_number_check,
  drop constraint if exists fuel_fillups_max_open_severity_check,
  drop constraint if exists fuel_fillups_odometer_max_check,
  drop constraint if exists fuel_fillups_litres_max_check,
  drop constraint if exists fuel_fillups_unit_price_range_check,
  drop constraint if exists fuel_fillups_total_amount_range_check,
  drop constraint if exists fuel_fillups_amounts_required_check,
  drop constraint if exists fuel_fillups_notes_length_check;

alter table public.fuel_fillups
  drop column if exists slip_vrn_normalised,
  drop column if exists entry_method,
  drop column if exists field_sources,
  drop column if exists client_entry_id,
  drop column if exists review_status,
  drop column if exists fuel_type,
  drop column if exists slip_vrn,
  drop column if exists slip_vrn_status,
  drop column if exists vehicle_vrn_snapshot,
  drop column if exists calculated_total,
  drop column if exists authorisation_no,
  drop column if exists order_no,
  drop column if exists pump_no,
  drop column if exists station_vat_no,
  drop column if exists slip_number,
  drop column if exists is_full_tank,
  drop column if exists submitted_at,
  drop column if exists reviewed_at,
  drop column if exists reviewed_by,
  drop column if exists review_reason_code,
  drop column if exists review_note,
  drop column if exists open_flag_count,
  drop column if exists max_open_severity,
  drop column if exists retain_until,
  drop column if exists legal_hold,
  drop column if exists photo_purged_at,
  drop column if exists retention_processed_at;

comment on column public.fuel_fillups.total_amount is null;

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------

alter table public.vehicles
  drop constraint if exists vehicles_tank_capacity_litres_range,
  drop constraint if exists vehicles_default_fuel_type_check,
  drop column if exists tank_capacity_litres,
  drop column if exists default_fuel_type;

-- ---------------------------------------------------------------------------
-- Legacy log_fuel_fillup: restore 00007 grant
-- ---------------------------------------------------------------------------

grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to authenticated;

comment on function public.log_fuel_fillup(uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text) is
  'Insert fuel fill-up; rejects odometer lower than previous fill for vehicle.';

-- ---------------------------------------------------------------------------
-- save_vehicle_capture: restore 00046 body (no fuel profile)
-- ---------------------------------------------------------------------------

create or replace function public.save_vehicle_capture(
  p_actor uuid,
  p_org uuid,
  p_vehicle_id uuid,
  p_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
begin
  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org and om.user_id = p_actor and om.status = 'active'
      and om.role::text = any (array['organisation_admin','manager','dispatcher','supervisor'])
  ) then
    raise exception 'not_authorised';
  end if;

  if p_vehicle_id is null then
    insert into public.vehicles (
      organisation_id, name, registration_number, vin, engine_number, make, model, model_year,
      colour, classification, operating_permit_number, operating_permit_expires_on,
      license_disc_expires_on, vehicle_type, capacity, company_id, status, created_by
    ) values (
      p_org,
      p_fields->>'name',
      nullif(p_fields->>'registration_number',''),
      nullif(p_fields->>'vin',''),
      nullif(p_fields->>'engine_number',''),
      nullif(p_fields->>'make',''),
      nullif(p_fields->>'model',''),
      nullif(p_fields->>'model_year','')::integer,
      nullif(p_fields->>'colour',''),
      nullif(p_fields->>'classification',''),
      nullif(p_fields->>'operating_permit_number',''),
      nullif(p_fields->>'operating_permit_expires_on','')::date,
      nullif(p_fields->>'license_disc_expires_on','')::date,
      coalesce(p_fields->>'vehicle_type','other')::public.vehicle_type,
      nullif(p_fields->>'capacity','')::integer,
      nullif(p_fields->>'company_id','')::uuid,
      coalesce(p_fields->>'status','active')::public.entity_status,
      p_actor
    ) returning id into v_id;
    v_action := 'vehicle.created';
  else
    update public.vehicles set
      name = coalesce(p_fields->>'name', name),
      registration_number = nullif(p_fields->>'registration_number',''),
      vin = nullif(p_fields->>'vin',''),
      engine_number = nullif(p_fields->>'engine_number',''),
      make = nullif(p_fields->>'make',''),
      model = nullif(p_fields->>'model',''),
      model_year = nullif(p_fields->>'model_year','')::integer,
      colour = nullif(p_fields->>'colour',''),
      classification = nullif(p_fields->>'classification',''),
      operating_permit_number = nullif(p_fields->>'operating_permit_number',''),
      operating_permit_expires_on = nullif(p_fields->>'operating_permit_expires_on','')::date,
      license_disc_expires_on = nullif(p_fields->>'license_disc_expires_on','')::date,
      vehicle_type = coalesce(p_fields->>'vehicle_type', vehicle_type::text)::public.vehicle_type,
      capacity = nullif(p_fields->>'capacity','')::integer,
      company_id = nullif(p_fields->>'company_id','')::uuid,
      status = coalesce(p_fields->>'status', status::text)::public.entity_status,
      updated_at = timezone('utc', now())
    where id = p_vehicle_id and organisation_id = p_org and deleted_at is null
    returning id into v_id;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'vehicle.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'vehicle', v_id, jsonb_build_object('name', p_fields->>'name'), p_actor);
  return v_id;
end;
$$;

revoke all on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- generate_weekly_fuel_invoice: restore 00007 body (no approved-only guard)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- generate_period_invoice: restore 00031 body (no approved-only guard)
-- ---------------------------------------------------------------------------

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

-- Optional, only after every fuel-slips object has been purged via the Storage API:
-- delete from storage.buckets where id = 'fuel-slips';

commit;
