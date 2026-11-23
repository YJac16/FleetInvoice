-- =============================================================================
-- 00074 — Fleet maintenance Drop 1, unit U2: audited write RPCs
-- =============================================================================
-- Builds on 00073 (schema + read-only RLS). All writes to suppliers,
-- maintenance_categories, workshop_bills and workshop_bill_lines go through
-- these SECURITY DEFINER functions, called by the API with the service role
-- (same pattern as 00046/00047). Every write calls write_audit_log.
--
--   save_supplier(p_actor, p_org, p_id, p_payload)              -> uuid
--   save_maintenance_category(p_actor, p_org, p_id, p_payload)  -> uuid
--   save_workshop_bill(p_actor, p_org, p_id, p_payload)         -> uuid
--   approve_workshop_bill(p_actor, p_org, p_id)                 -> void
--
-- p_id null = create, otherwise update that row (must belong to p_org).
--
-- Who may write: the platform owner, or an active organisation_admin/manager
-- of p_org. The org must be entitled to the 'maintenance' module through an
-- active/trialing subscription; the platform owner bypasses that check.
--
-- VAT is always worked out here; any money totals in the payload are ignored.
-- Per line, amount = quantity x unit_amount, rounded half-up to 2dp.
--   exclusive: excl = amount, vat = round(excl * rate / 100, 2)
--   inclusive: incl = amount, vat = round(incl * rate / (100 + rate), 2), excl = incl - vat
-- Lines with vat_applicable = false carry no VAT. Bill totals are the sums of
-- the lines. Default rate 15.
--
-- Approved bills can't be edited or re-approved.
--
-- Also adds workshop_bills.odometer_km (nullable integer >= 0). It is only ever
-- what the user typed; nothing here fills it from the vehicle or older bills.
--
-- No changes to invoices, rate cards or existing policies.

-- ---------------------------------------------------------------------------
-- odometer_km
-- ---------------------------------------------------------------------------

alter table public.workshop_bills
  add column if not exists odometer_km integer;

alter table public.workshop_bills
  drop constraint if exists workshop_bills_odometer_km_check;
alter table public.workshop_bills
  add constraint workshop_bills_odometer_km_check check (odometer_km is null or odometer_km >= 0);

comment on column public.workshop_bills.odometer_km is
  'Odometer reading typed by the user for this bill. Optional; never prefilled.';

-- ---------------------------------------------------------------------------
-- Internal: actor + entitlement check
-- ---------------------------------------------------------------------------

create or replace function public.maintenance_assert_writer(p_actor uuid, p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_actor is null or p_org is null then
    raise exception 'not_authorised';
  end if;

  -- Platform owner bypasses both the role and the entitlement check.
  if exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.is_platform_owner
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.role::text = any (array['organisation_admin', 'manager'])
  ) then
    raise exception 'not_authorised';
  end if;

  if not exists (
    select 1
    from public.subscriptions s
    join public.module_entitlements e on e.plan_id = s.plan_id
    where s.organisation_id = p_org
      and s.status in ('trialing', 'active')
      and e.module_key = 'maintenance'
  ) then
    raise exception 'module_not_entitled';
  end if;
end;
$$;

comment on function public.maintenance_assert_writer(uuid, uuid) is
  'Internal guard for maintenance RPCs: platform owner, or org admin/manager of an org entitled to maintenance.';

-- ---------------------------------------------------------------------------
-- save_supplier
-- ---------------------------------------------------------------------------

create or replace function public.save_supplier(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_action text;
  v_name text;
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_name := nullif(btrim(p_payload->>'name'), '');
  if v_name is null then
    raise exception 'name_required';
  end if;

  if p_id is null then
    insert into public.suppliers (
      organisation_id, name, vat_number, contact_phone, email, notes, active, created_by
    ) values (
      p_org,
      v_name,
      nullif(btrim(p_payload->>'vat_number'), ''),
      nullif(btrim(p_payload->>'contact_phone'), ''),
      nullif(btrim(p_payload->>'email'), ''),
      nullif(btrim(p_payload->>'notes'), ''),
      coalesce((p_payload->>'active')::boolean, true),
      p_actor
    ) returning id into v_id;
    v_action := 'supplier.created';
  else
    update public.suppliers set
      name = v_name,
      vat_number = nullif(btrim(p_payload->>'vat_number'), ''),
      contact_phone = nullif(btrim(p_payload->>'contact_phone'), ''),
      email = nullif(btrim(p_payload->>'email'), ''),
      notes = nullif(btrim(p_payload->>'notes'), ''),
      active = coalesce((p_payload->>'active')::boolean, active)
    where id = p_id
      and organisation_id = p_org
      and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
    v_action := 'supplier.updated';
  end if;

  perform public.write_audit_log(
    p_org, v_action, 'supplier', v_id,
    jsonb_build_object('name', v_name),
    p_actor
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_maintenance_category
-- ---------------------------------------------------------------------------

create or replace function public.save_maintenance_category(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_action text;
  v_name text;
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  v_name := nullif(btrim(p_payload->>'name'), '');
  if v_name is null then
    raise exception 'name_required';
  end if;

  if p_id is null then
    insert into public.maintenance_categories (organisation_id, name, active, created_by)
    values (p_org, v_name, coalesce((p_payload->>'active')::boolean, true), p_actor)
    returning id into v_id;
    v_action := 'maintenance_category.created';
  else
    update public.maintenance_categories set
      name = v_name,
      active = coalesce((p_payload->>'active')::boolean, active)
    where id = p_id
      and organisation_id = p_org
      and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'not_found';
    end if;
    v_action := 'maintenance_category.updated';
  end if;

  perform public.write_audit_log(
    p_org, v_action, 'maintenance_category', v_id,
    jsonb_build_object('name', v_name),
    p_actor
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_workshop_bill
-- ---------------------------------------------------------------------------
-- Payload:
--   supplier_id (required), vehicle_id, bill_date (required), invoice_ref
--   (required), vat_mode ('exclusive' default | 'inclusive'), vat_rate
--   (default 15), notes, odometer_km, lines: [{ category_id, description,
--   quantity (default 1), unit_amount, vat_applicable (default true),
--   sort_order }]
-- On update the bill's lines are replaced by the payload's lines.

create or replace function public.save_workshop_bill(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_action text;
  v_status text;
  v_supplier uuid;
  v_vehicle uuid;
  v_bill_date date;
  v_ref text;
  v_mode text;
  v_rate numeric(5, 2);
  v_odo integer;
  v_lines jsonb;
  v_line jsonb;
  v_idx integer := 0;
  v_cat uuid;
  v_desc text;
  v_qty numeric(12, 3);
  v_unit numeric(14, 2);
  v_vat_app boolean;
  v_amount numeric(14, 2);
  v_excl numeric(14, 2);
  v_vat numeric(14, 2);
  v_incl numeric(14, 2);
  v_sum_excl numeric(14, 2) := 0;
  v_sum_vat numeric(14, 2) := 0;
  v_sum_incl numeric(14, 2) := 0;
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  -- Lock and check the existing bill before anything else.
  if p_id is not null then
    select b.status into v_status
    from public.workshop_bills b
    where b.id = p_id
      and b.organisation_id = p_org
      and b.deleted_at is null
    for update;
    if not found then
      raise exception 'not_found';
    end if;
    if v_status = 'approved' then
      raise exception 'bill_approved_locked';
    end if;
  end if;

  -- Header fields
  v_supplier := nullif(p_payload->>'supplier_id', '')::uuid;
  if v_supplier is null then
    raise exception 'supplier_required';
  end if;
  if not exists (
    select 1 from public.suppliers s
    where s.id = v_supplier and s.organisation_id = p_org and s.deleted_at is null
  ) then
    raise exception 'supplier_org_mismatch';
  end if;

  v_vehicle := nullif(p_payload->>'vehicle_id', '')::uuid;
  if v_vehicle is not null and not exists (
    select 1 from public.vehicles v
    where v.id = v_vehicle and v.organisation_id = p_org and v.deleted_at is null
  ) then
    raise exception 'vehicle_org_mismatch';
  end if;

  v_bill_date := nullif(p_payload->>'bill_date', '')::date;
  if v_bill_date is null then
    raise exception 'bill_date_required';
  end if;

  v_ref := nullif(btrim(p_payload->>'invoice_ref'), '');
  if v_ref is null then
    raise exception 'invoice_ref_required';
  end if;

  v_mode := coalesce(nullif(p_payload->>'vat_mode', ''), 'exclusive');
  if v_mode not in ('inclusive', 'exclusive') then
    raise exception 'invalid_vat_mode';
  end if;

  v_rate := coalesce(nullif(p_payload->>'vat_rate', '')::numeric, 15);
  if v_rate < 0 or v_rate > 100 then
    raise exception 'invalid_vat_rate';
  end if;

  if nullif(p_payload->>'odometer_km', '') is null then
    v_odo := null;
  else
    if (p_payload->>'odometer_km') !~ '^\s*\d+\s*$' then
      raise exception 'invalid_odometer';
    end if;
    v_odo := (p_payload->>'odometer_km')::integer;
  end if;

  v_lines := coalesce(p_payload->'lines', '[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'invalid_lines';
  end if;

  -- Validate every line's category before writing anything.
  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'invalid_lines';
    end if;
    v_cat := nullif(v_line->>'category_id', '')::uuid;
    if v_cat is not null and not exists (
      select 1 from public.maintenance_categories c
      where c.id = v_cat and c.organisation_id = p_org and c.deleted_at is null
    ) then
      raise exception 'category_org_mismatch';
    end if;
  end loop;

  -- Header write (totals filled in after the lines).
  if p_id is null then
    insert into public.workshop_bills (
      organisation_id, supplier_id, vehicle_id, bill_date, invoice_ref,
      vat_mode, vat_rate, odometer_km, notes, status, created_by
    ) values (
      p_org, v_supplier, v_vehicle, v_bill_date, v_ref,
      v_mode, v_rate, v_odo, nullif(btrim(p_payload->>'notes'), ''), 'draft', p_actor
    ) returning id into v_id;
    v_action := 'workshop_bill.created';
  else
    update public.workshop_bills set
      supplier_id = v_supplier,
      vehicle_id = v_vehicle,
      bill_date = v_bill_date,
      invoice_ref = v_ref,
      vat_mode = v_mode,
      vat_rate = v_rate,
      odometer_km = v_odo,
      notes = nullif(btrim(p_payload->>'notes'), '')
    where id = p_id
    returning id into v_id;
    delete from public.workshop_bill_lines where bill_id = v_id;
    v_action := 'workshop_bill.updated';
  end if;

  -- Lines: VAT per line, half-up to 2dp.
  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    v_idx := v_idx + 1;
    v_cat := nullif(v_line->>'category_id', '')::uuid;
    v_desc := nullif(btrim(v_line->>'description'), '');
    if v_desc is null then
      raise exception 'line_description_required';
    end if;
    v_qty := coalesce(nullif(v_line->>'quantity', '')::numeric, 1);
    if v_qty <= 0 then
      raise exception 'invalid_quantity';
    end if;
    v_unit := nullif(v_line->>'unit_amount', '')::numeric;
    if v_unit is null or v_unit < 0 then
      raise exception 'invalid_unit_amount';
    end if;
    v_vat_app := coalesce((v_line->>'vat_applicable')::boolean, true);

    -- numeric round() is half away from zero; amounts are >= 0, so half-up.
    v_amount := round(v_qty * v_unit, 2);

    if not v_vat_app then
      v_excl := v_amount;
      v_vat := 0;
      v_incl := v_amount;
    elsif v_mode = 'exclusive' then
      v_excl := v_amount;
      v_vat := round(v_excl * v_rate / 100, 2);
      v_incl := v_excl + v_vat;
    else
      v_incl := v_amount;
      v_vat := round(v_incl * v_rate / (100 + v_rate), 2);
      v_excl := v_incl - v_vat;
    end if;

    insert into public.workshop_bill_lines (
      bill_id, organisation_id, category_id, description, quantity, unit_amount,
      vat_applicable, line_excl, line_vat, line_incl, sort_order
    ) values (
      v_id, p_org, v_cat, v_desc, v_qty, v_unit,
      v_vat_app, v_excl, v_vat, v_incl,
      coalesce(nullif(v_line->>'sort_order', '')::integer, v_idx)
    );

    v_sum_excl := v_sum_excl + v_excl;
    v_sum_vat := v_sum_vat + v_vat;
    v_sum_incl := v_sum_incl + v_incl;
  end loop;

  update public.workshop_bills set
    subtotal_excl = v_sum_excl,
    vat_amount = v_sum_vat,
    total_incl = v_sum_incl
  where id = v_id;

  perform public.write_audit_log(
    p_org, v_action, 'workshop_bill', v_id,
    jsonb_build_object(
      'supplier_id', v_supplier,
      'vehicle_id', v_vehicle,
      'invoice_ref', v_ref,
      'vat_mode', v_mode,
      'vat_rate', v_rate,
      'line_count', v_idx,
      'subtotal_excl', v_sum_excl,
      'vat_amount', v_sum_vat,
      'total_incl', v_sum_incl,
      'odometer_km', v_odo
    ),
    p_actor
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_workshop_bill
-- ---------------------------------------------------------------------------

create or replace function public.approve_workshop_bill(
  p_actor uuid,
  p_org uuid,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_total numeric(14, 2);
begin
  perform public.maintenance_assert_writer(p_actor, p_org);

  select b.status, b.total_incl into v_status, v_total
  from public.workshop_bills b
  where b.id = p_id
    and b.organisation_id = p_org
    and b.deleted_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status = 'approved' then
    raise exception 'bill_already_approved';
  end if;
  if not exists (select 1 from public.workshop_bill_lines l where l.bill_id = p_id) then
    raise exception 'bill_has_no_lines';
  end if;

  update public.workshop_bills set
    status = 'approved',
    approved_by = p_actor,
    approved_at = timezone('utc', now())
  where id = p_id;

  perform public.write_audit_log(
    p_org, 'workshop_bill.approved', 'workshop_bill', p_id,
    jsonb_build_object('total_incl', v_total),
    p_actor
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only
-- ---------------------------------------------------------------------------

revoke all on function public.maintenance_assert_writer(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_supplier(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_maintenance_category(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_workshop_bill(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.approve_workshop_bill(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.save_supplier(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_maintenance_category(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_workshop_bill(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.approve_workshop_bill(uuid, uuid, uuid) to service_role;
