-- =============================================================================
-- 00057 — Company portal Phase 1 isolation
-- =============================================================================
-- company_manager sees only an explicit client-company scope, and never the
-- bill-to company (resolve_invoice_bill_to_company_id). Billing RPCs are
-- ops-only. No new tables. Idempotent: drop policy if exists + create policy,
-- create or replace function. Applies with or without 00056 (keeps that
-- migration's invoice_lines driver/employee exclusion). Does not add a
-- direct UPDATE policy on invoices.
--
-- Follow-up (not in the spec never-select list): routes, sites, schedules,
-- areas, pickup_points, and route_stops stay org-visible reference data.

-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------
-- security definer + stable so RLS can call them as the authenticated role.
-- resolve_invoice_bill_to_company_id stays revoked from authenticated (00055);
-- the definer owner calls it.

create or replace function public.is_company_manager(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and not public.is_platform_owner()
    and not public.has_org_role_names(
      org,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
    and exists (
      select 1
      from public.organisation_members m
      where m.organisation_id = org
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.deleted_at is null
        and m.role::text = 'company_manager'
    );
$$;

create or replace function public.company_user_can_see(org uuid, company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    company is not null
    and exists (
      select 1
      from public.organisation_members m
      join public.member_scopes s on s.membership_id = m.id
      where m.organisation_id = org
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.deleted_at is null
        and m.role::text = 'company_manager'
        and s.organisation_id = org
        and s.company_id = company
    )
    and company is distinct from public.resolve_invoice_bill_to_company_id(org);
$$;

revoke all on function public.is_company_manager(uuid) from public, anon;
revoke all on function public.company_user_can_see(uuid, uuid) from public, anon;
grant execute on function public.is_company_manager(uuid) to authenticated;
grant execute on function public.company_user_can_see(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Policies — ops / driver / employee branches unchanged
-- ---------------------------------------------------------------------------

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          case
            when public.is_company_manager(organisation_id) then
              driver_id is null
              and public.company_user_can_see(organisation_id, company_id)
            else
              public.has_org_role_names(
                organisation_id,
                array['organisation_admin', 'manager', 'dispatcher']
              )
              or (
                public.has_company_scope(organisation_id, company_id)
                and not public.has_org_role_names(
                  organisation_id,
                  array['driver', 'employee']
                )
              )
          end
        )
      )
    )
  );

-- Matches 00056 invoice_lines_select for non-company users (driver/employee
-- excluded), and hides driver invoices plus other companies from company_manager.
drop policy if exists invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines
  for select
  using (
    public.is_platform_owner()
    or (
      organisation_id in (select public.user_organisation_ids())
      and exists (
        select 1
        from public.invoices i
        where i.id = invoice_lines.invoice_id
          and i.organisation_id = invoice_lines.organisation_id
          and i.deleted_at is null
          and (
            case
              when public.is_company_manager(i.organisation_id) then
                i.driver_id is null
                and public.company_user_can_see(i.organisation_id, i.company_id)
              else
                public.has_org_role_names(
                  i.organisation_id,
                  array['organisation_admin', 'manager', 'dispatcher']
                )
                or (
                  public.has_company_scope(i.organisation_id, i.company_id)
                  and not public.has_org_role_names(
                    i.organisation_id,
                    array['driver', 'employee']
                  )
                )
            end
          )
      )
    )
  );

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          case
            when public.is_company_manager(organisation_id) then
              public.company_user_can_see(organisation_id, company_id)
            else
              company_id is null
              or public.has_company_scope(organisation_id, company_id)
          end
        )
      )
    )
  );

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or profile_id = (select auth.uid())
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          case
            when public.is_company_manager(organisation_id) then
              public.company_user_can_see(organisation_id, company_id)
            else
              company_id is null
              or public.has_company_scope(organisation_id, company_id)
          end
        )
      )
    )
  );

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin','manager','dispatcher','supervisor']
      )
      or exists (
        select 1 from public.driver_vehicle_assignments a
        where a.vehicle_id = vehicles.id
          and a.driver_id = public.current_driver_id(vehicles.organisation_id)
          and a.ends_on is null
          and a.deleted_at is null
      )
      or exists (
        select 1 from public.trip_assignments ta
        where ta.vehicle_id = vehicles.id
          and ta.driver_id = public.current_driver_id(vehicles.organisation_id)
          and ta.released_at is null
          and ta.deleted_at is null
      )
      or (
        organisation_id in (select public.user_organisation_ids())
        and not public.has_org_role_names(
          organisation_id,
          array['driver']
        )
        and (
          case
            when public.is_company_manager(organisation_id) then
              false
            else
              company_id is null
              or public.has_company_scope(organisation_id, company_id)
          end
        )
      )
    )
  );

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
            case
              when public.is_company_manager(organisation_id) then
                false
              else
                company_id is not null
                and public.has_company_scope(organisation_id, company_id)
            end
          )
        )
      )
    )
  );

-- Org-wide (company_id is null) cards are no longer readable by company_manager.
drop policy if exists rate_cards_select on public.rate_cards;
create policy rate_cards_select on public.rate_cards
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
      or (
        case
          when public.is_company_manager(organisation_id) then
            company_id is not null
            and public.company_user_can_see(organisation_id, company_id)
          else
            company_id is not null
            and public.has_company_scope(organisation_id, company_id)
        end
      )
    )
  );

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or (
        organisation_id in (select public.user_organisation_ids())
        and (
          case
            when public.is_company_manager(organisation_id) then
              public.company_user_can_see(organisation_id, id)
            else
              public.has_company_scope(organisation_id, id)
          end
        )
      )
    )
  );

drop policy if exists trip_passengers_select on public.trip_passengers;
create policy trip_passengers_select on public.trip_passengers
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor',
        'driver'
      ]
    )
    or (
      public.is_company_manager(organisation_id)
      and exists (
        select 1
        from public.employees e
        where e.id = trip_passengers.employee_id
          and e.deleted_at is null
          and public.company_user_can_see(e.organisation_id, e.company_id)
      )
      and exists (
        select 1
        from public.trips t
        where t.id = trip_passengers.trip_id
          and t.deleted_at is null
          and public.company_user_can_see(t.organisation_id, t.company_id)
      )
    )
    or employee_id = public.current_employee_id(organisation_id)
  );

drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select on public.attendance_events
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor',
        'driver'
      ]
    )
    or (
      public.is_company_manager(organisation_id)
      and exists (
        select 1
        from public.employees e
        where e.id = attendance_events.employee_id
          and e.deleted_at is null
          and public.company_user_can_see(e.organisation_id, e.company_id)
      )
    )
    or employee_id = public.current_employee_id(organisation_id)
  );

drop policy if exists qr_tokens_select on public.qr_tokens;
create policy qr_tokens_select on public.qr_tokens
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array[
        'organisation_admin',
        'manager',
        'dispatcher',
        'supervisor',
        'driver'
      ]
    )
    or employee_id = public.current_employee_id(organisation_id)
  );

drop policy if exists trip_assignments_select on public.trip_assignments;
create policy trip_assignments_select on public.trip_assignments
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or driver_id = public.current_driver_id(organisation_id)
      or (
        case
          when public.is_company_manager(organisation_id) then
            exists (
              select 1
              from public.trips t
              where t.id = trip_assignments.trip_id
                and t.deleted_at is null
                and public.company_user_can_see(t.organisation_id, t.company_id)
            )
          else
            organisation_id in (select public.user_organisation_ids())
        end
      )
    )
  );

drop policy if exists trip_events_select on public.trip_events;
create policy trip_events_select on public.trip_events
  for select
  using (
    public.is_platform_owner()
    or (
      case
        when public.is_company_manager(organisation_id) then
          exists (
            select 1
            from public.trips t
            where t.id = trip_events.trip_id
              and t.deleted_at is null
              and public.company_user_can_see(t.organisation_id, t.company_id)
          )
        else
          organisation_id in (select public.user_organisation_ids())
      end
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Billing RPCs — same body for ops; company_manager branch removed
-- ---------------------------------------------------------------------------

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

grant execute on function public.set_invoice_status(uuid, public.invoice_status) to authenticated;

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

grant execute on function public.generate_period_invoice(uuid, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) member_scopes — refuse bill-to scope and a second company login scope
-- ---------------------------------------------------------------------------
-- Does not update or delete existing rows. session_replication_role = replica
-- skips this origin trigger (used only to simulate a pre-existing bad row).

create or replace function public.guard_company_manager_member_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_bill_to uuid;
begin
  select m.role::text
    into v_role
  from public.organisation_members m
  where m.id = new.membership_id
    and m.deleted_at is null;

  if v_role is distinct from 'company_manager' then
    return new;
  end if;

  v_bill_to := public.resolve_invoice_bill_to_company_id(new.organisation_id);

  if v_bill_to is not null and new.company_id = v_bill_to then
    raise exception 'The bill-to company cannot be a company login scope.';
  end if;

  if exists (
    select 1
    from public.member_scopes s
    where s.membership_id = new.membership_id
      and s.id is distinct from new.id
  ) then
    raise exception 'A company login can be linked to one company only.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_company_manager_member_scope() from public, anon, authenticated;

drop trigger if exists member_scopes_guard_company_manager on public.member_scopes;
create trigger member_scopes_guard_company_manager
  before insert or update on public.member_scopes
  for each row
  execute function public.guard_company_manager_member_scope();
