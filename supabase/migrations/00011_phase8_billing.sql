-- =============================================================================
-- WorkOps Phase 8 — Rate cards, period invoices, paid lifecycle
-- =============================================================================
-- Requires 00010_phase8_invoice_enums.sql already committed (paid / trip / fixed /
-- adjustment enum labels available).

-- ---------------------------------------------------------------------------
-- rate_card_unit enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'rate_card_unit'
  ) then
    create type public.rate_card_unit as enum ('trip', 'boarding', 'fixed');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- invoices.paid_at
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists paid_at timestamptz;

comment on column public.invoices.paid_at is
  'Set when status transitions to paid via set_invoice_status.';

-- ---------------------------------------------------------------------------
-- invoice_lines traceability
-- ---------------------------------------------------------------------------

alter table public.invoice_lines
  add column if not exists rate_card_id uuid,
  add column if not exists trip_id uuid;

-- ---------------------------------------------------------------------------
-- rate_cards
-- ---------------------------------------------------------------------------

create table if not exists public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  name text not null,
  line_type public.invoice_line_type not null,
  unit public.rate_card_unit not null default 'fixed',
  unit_amount numeric(14, 4) not null,
  currency text not null default 'ZAR',
  effective_from date not null default (timezone('utc', now()))::date,
  effective_to date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint rate_cards_amount_nonneg check (unit_amount >= 0),
  constraint rate_cards_effective_check
    check (effective_to is null or effective_to >= effective_from),
  constraint rate_cards_line_type_check
    check (line_type = any (array['trip','fixed','adjustment']::public.invoice_line_type[]))
);

create index if not exists rate_cards_org_company_idx
  on public.rate_cards (organisation_id, company_id)
  where deleted_at is null;

create index if not exists rate_cards_effective_idx
  on public.rate_cards (organisation_id, effective_from, effective_to)
  where deleted_at is null;

drop trigger if exists rate_cards_set_updated_at on public.rate_cards;
create trigger rate_cards_set_updated_at
before update on public.rate_cards
for each row execute function public.set_updated_at();

alter table public.rate_cards enable row level security;

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
        company_id is not null
        and public.has_company_scope(organisation_id, company_id)
      )
      or (
        company_id is null
        and organisation_id in (select public.user_organisation_ids())
        and public.has_org_role_names(
          organisation_id,
          array['company_manager']
        )
      )
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

drop policy if exists rate_cards_delete on public.rate_cards;
create policy rate_cards_delete on public.rate_cards
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

-- FK after rate_cards exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_lines_rate_card_id_fkey'
  ) then
    alter table public.invoice_lines
      add constraint invoice_lines_rate_card_id_fkey
      foreign key (rate_card_id) references public.rate_cards (id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'invoice_lines_trip_id_fkey'
  ) then
    alter table public.invoice_lines
      add constraint invoice_lines_trip_id_fkey
      foreign key (trip_id) references public.trips (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: set_invoice_status
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
    )
    or (
      public.has_org_role_names(inv.organisation_id, array['company_manager'])
      and public.has_company_scope(inv.organisation_id, inv.company_id)
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

-- ---------------------------------------------------------------------------
-- RPC: generate_period_invoice
-- Fuel + trip (completed, vehicle company) + fixed rate cards for period.
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

  select * into existing
  from public.invoices i
  where i.organisation_id = p_organisation_id
    and i.company_id = p_company_id
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

  -- Fuel lines
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

  -- Trip rate: company-specific then org-wide
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

  -- Fixed rate cards (company or org-wide) active in period
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
