-- =============================================================================
-- WorkOps Phase 8 — Payroll runs (drivers trips + employee boardings)
-- =============================================================================
-- Requires 00008 (attendance_events) and Phase 4 trip assignments.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'pay_subject_role'
  ) then
    create type public.pay_subject_role as enum ('driver', 'employee');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'payroll_run_status'
  ) then
    create type public.payroll_run_status as enum ('draft', 'finalized', 'void');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'payroll_line_type'
  ) then
    create type public.payroll_line_type as enum ('trip', 'boarding', 'fixed', 'adjustment');
  end if;
end $$;

-- Reuse rate_card_unit for pay_rates.unit when present; else create pay_rate_unit
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'pay_rate_unit'
  ) then
    create type public.pay_rate_unit as enum ('trip', 'boarding', 'fixed');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- pay_rates
-- ---------------------------------------------------------------------------

create table if not exists public.pay_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  name text not null,
  subject_role public.pay_subject_role not null,
  unit public.pay_rate_unit not null,
  unit_amount numeric(14, 4) not null,
  currency text not null default 'ZAR',
  effective_from date not null default (timezone('utc', now()))::date,
  effective_to date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint pay_rates_amount_nonneg check (unit_amount >= 0),
  constraint pay_rates_effective_check
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists pay_rates_org_role_idx
  on public.pay_rates (organisation_id, subject_role)
  where deleted_at is null;

create index if not exists pay_rates_effective_idx
  on public.pay_rates (organisation_id, effective_from, effective_to)
  where deleted_at is null;

drop trigger if exists pay_rates_set_updated_at on public.pay_rates;
create trigger pay_rates_set_updated_at
before update on public.pay_rates
for each row execute function public.set_updated_at();

alter table public.pay_rates enable row level security;

drop policy if exists pay_rates_select on public.pay_rates;
create policy pay_rates_select on public.pay_rates
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
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

drop policy if exists pay_rates_delete on public.pay_rates;
create policy pay_rates_delete on public.pay_rates
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

-- ---------------------------------------------------------------------------
-- payroll_runs
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.payroll_run_status not null default 'draft',
  currency text not null default 'ZAR',
  total numeric(14, 2) not null default 0,
  notes text,
  generated_by uuid references auth.users (id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint payroll_runs_period_check check (period_end > period_start)
);

create index if not exists payroll_runs_org_period_idx
  on public.payroll_runs (organisation_id, period_start, period_end);

create unique index if not exists payroll_runs_org_period_active_uidx
  on public.payroll_runs (organisation_id, period_start, period_end)
  where deleted_at is null and status <> 'void';

drop trigger if exists payroll_runs_set_updated_at on public.payroll_runs;
create trigger payroll_runs_set_updated_at
before update on public.payroll_runs
for each row execute function public.set_updated_at();

alter table public.payroll_runs enable row level security;

drop policy if exists payroll_runs_select on public.payroll_runs;
create policy payroll_runs_select on public.payroll_runs
  for select
  using (
    deleted_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
  );

-- Mutations via RPCs only
drop policy if exists payroll_runs_insert on public.payroll_runs;
drop policy if exists payroll_runs_update on public.payroll_runs;
drop policy if exists payroll_runs_delete on public.payroll_runs;

-- ---------------------------------------------------------------------------
-- payroll_lines
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  line_type public.payroll_line_type not null,
  driver_id uuid references public.drivers (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  pay_rate_id uuid references public.pay_rates (id) on delete set null,
  trip_id uuid references public.trips (id) on delete set null,
  attendance_event_id uuid references public.attendance_events (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_amount numeric(14, 4) not null default 0,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint payroll_lines_subject_check check (
    (driver_id is not null and employee_id is null)
    or (employee_id is not null and driver_id is null)
    or (driver_id is null and employee_id is null and line_type in ('fixed', 'adjustment'))
  )
);

create index if not exists payroll_lines_run_idx
  on public.payroll_lines (payroll_run_id);
create index if not exists payroll_lines_driver_idx
  on public.payroll_lines (driver_id)
  where driver_id is not null;
create index if not exists payroll_lines_employee_idx
  on public.payroll_lines (employee_id)
  where employee_id is not null;

alter table public.payroll_lines enable row level security;

drop policy if exists payroll_lines_select on public.payroll_lines;
create policy payroll_lines_select on public.payroll_lines
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  );

drop policy if exists payroll_lines_insert on public.payroll_lines;
drop policy if exists payroll_lines_update on public.payroll_lines;
drop policy if exists payroll_lines_delete on public.payroll_lines;

-- ---------------------------------------------------------------------------
-- Helper: resolve pay rate
-- ---------------------------------------------------------------------------

create or replace function public.resolve_pay_rate(
  p_organisation_id uuid,
  p_subject_role public.pay_subject_role,
  p_unit public.pay_rate_unit,
  p_company_id uuid,
  p_as_of date
)
returns public.pay_rates
language sql
stable
security definer
set search_path = public
as $$
  select rc.*
  from public.pay_rates rc
  where rc.organisation_id = p_organisation_id
    and rc.deleted_at is null
    and rc.subject_role = p_subject_role
    and rc.unit = p_unit
    and (rc.company_id = p_company_id or rc.company_id is null)
    and rc.effective_from <= p_as_of
    and (rc.effective_to is null or rc.effective_to >= p_as_of)
  order by rc.company_id nulls last, rc.effective_from desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RPC: generate_payroll_run
-- ---------------------------------------------------------------------------

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

grant execute on function public.resolve_pay_rate(
  uuid, public.pay_subject_role, public.pay_rate_unit, uuid, date
) to authenticated;
grant execute on function public.generate_payroll_run(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: finalize_payroll_run
-- ---------------------------------------------------------------------------

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

grant execute on function public.finalize_payroll_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: void_payroll_run
-- ---------------------------------------------------------------------------

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

grant execute on function public.void_payroll_run(uuid) to authenticated;
