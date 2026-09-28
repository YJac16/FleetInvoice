-- =============================================================================
-- WorkOps — Fuel slip capture (tables, RLS, audited RPCs, retention)
-- Requires 00051_fuel_slip_enums.sql (driver notification types).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_entry_method'
  ) then
    create type public.fuel_entry_method as enum (
      'legacy_manual',
      'driver_photo',
      'admin_manual'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_review_status'
  ) then
    create type public.fuel_review_status as enum (
      'pending_review',
      'approved',
      'rejected',
      'queried',
      'void'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_slip_vrn_status'
  ) then
    create type public.fuel_slip_vrn_status as enum (
      'legacy',
      'match',
      'mismatch',
      'missing',
      'not_checked'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_product_type'
  ) then
    create type public.fuel_product_type as enum (
      'diesel',
      'petrol',
      'lp_gas',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_flag_code'
  ) then
    create type public.fuel_flag_code as enum (
      'vrn_mismatch',
      'dup_auth',
      'litres_exceeds_tank',
      'odometer_jump',
      'calculated_total_mismatch',
      'slip_total_mismatch',
      'fuel_type_mismatch',
      'missing_authorisation',
      'missing_slip_photo',
      'unit_price_high',
      'unit_price_low',
      'high_fill_frequency',
      'future_filled_at',
      'stale_filled_at'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_flag_status'
  ) then
    create type public.fuel_flag_status as enum (
      'open',
      'cleared_by_edit',
      'cleared_by_review',
      'dismissed'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'fuel_post_retention_action'
  ) then
    create type public.fuel_post_retention_action as enum (
      'purge_photo',
      'redact_metadata'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- vehicles: tank + default fuel type
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists tank_capacity_litres numeric(12, 2),
  add column if not exists default_fuel_type public.fuel_product_type;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_tank_capacity_litres_positive
    check (tank_capacity_litres is null or tank_capacity_litres > 0);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- fuel_fillups extensions + legacy backfill
-- ---------------------------------------------------------------------------

alter table public.fuel_fillups
  add column if not exists entry_method public.fuel_entry_method not null default 'legacy_manual',
  add column if not exists review_status public.fuel_review_status not null default 'approved',
  add column if not exists authorisation_no text,
  add column if not exists slip_vrn text,
  add column if not exists slip_vrn_status public.fuel_slip_vrn_status not null default 'not_checked',
  add column if not exists slip_fuel_type public.fuel_product_type,
  add column if not exists slip_station_name text,
  add column if not exists slip_litres numeric(12, 2),
  add column if not exists slip_unit_price numeric(12, 4),
  add column if not exists slip_total_amount numeric(14, 2),
  add column if not exists fuel_type public.fuel_product_type,
  add column if not exists calculated_total numeric(14, 2),
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text,
  add column if not exists query_notes text,
  add column if not exists voided_by uuid references auth.users (id) on delete set null,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists submitted_at timestamptz,
  add column if not exists client_entry_id uuid,
  add column if not exists field_sources jsonb not null default '{}'::jsonb,
  add column if not exists is_full_tank boolean not null default true,
  add column if not exists order_no text,
  add column if not exists pump_no smallint,
  add column if not exists station_vat_no text,
  add column if not exists slip_number text,
  add column if not exists open_flag_count smallint not null default 0,
  add column if not exists max_open_severity text,
  add column if not exists retain_until date,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists photo_purged_at timestamptz,
  add column if not exists retention_processed_at timestamptz;

update public.fuel_fillups f
set
  entry_method = 'legacy_manual',
  review_status = 'approved',
  slip_vrn_status = 'legacy',
  calculated_total = case
    when f.unit_price is not null then round(f.litres * f.unit_price, 2)
    else f.calculated_total
  end
where f.entry_method = 'legacy_manual'
  and f.review_status = 'approved'
  and f.slip_vrn_status = 'not_checked';

create index if not exists fuel_fillups_org_review_idx
  on public.fuel_fillups (organisation_id, review_status)
  where deleted_at is null;

create index if not exists fuel_fillups_authorisation_idx
  on public.fuel_fillups (organisation_id, authorisation_no)
  where deleted_at is null and authorisation_no is not null;

create unique index if not exists fuel_fillups_client_entry_uidx
  on public.fuel_fillups (organisation_id, client_entry_id)
  where client_entry_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- fuel_slip_photos
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_slip_photos (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  fuel_fillup_id uuid not null references public.fuel_fillups (id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  privacy_redacted_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists fuel_slip_photos_fillup_active_uidx
  on public.fuel_slip_photos (fuel_fillup_id)
  where purged_at is null;

create index if not exists fuel_slip_photos_org_idx
  on public.fuel_slip_photos (organisation_id);

drop trigger if exists fuel_slip_photos_set_updated_at on public.fuel_slip_photos;
create trigger fuel_slip_photos_set_updated_at
before update on public.fuel_slip_photos
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- fuel_entry_flags
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_entry_flags (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  fuel_fillup_id uuid not null references public.fuel_fillups (id) on delete cascade,
  flag_code public.fuel_flag_code not null,
  status public.fuel_flag_status not null default 'open',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  cleared_at timestamptz
);

create unique index if not exists fuel_entry_flags_open_uniq
  on public.fuel_entry_flags (fuel_fillup_id, flag_code)
  where status = 'open';

create index if not exists fuel_entry_flags_org_idx
  on public.fuel_entry_flags (organisation_id);

drop trigger if exists fuel_entry_flags_set_updated_at on public.fuel_entry_flags;
create trigger fuel_entry_flags_set_updated_at
before update on public.fuel_entry_flags
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- fuel_settings (per org; retention NULL = disabled)
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  retention_months integer,
  post_retention_action public.fuel_post_retention_action,
  dup_auth_lookback_days integer not null default 90,
  tank_overfill_tolerance_pct numeric(5, 2) not null default 5,
  unit_price_high numeric(12, 4) not null default 35,
  unit_price_low numeric(12, 4) not null default 5,
  odometer_jump_km numeric(12, 1) not null default 500,
  fill_frequency_daily_max integer not null default 3,
  stale_fill_days integer not null default 14,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fuel_settings_retention_months_check
    check (retention_months is null or retention_months >= 1)
);

drop trigger if exists fuel_settings_set_updated_at on public.fuel_settings;
create trigger fuel_settings_set_updated_at
before update on public.fuel_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage bucket (metadata only — no storage.objects policies)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fuel-slips',
  'fuel-slips',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.fuel_setting(p_org uuid, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.fuel_settings%rowtype;
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_found boolean := false;
begin
  select * into s
  from public.fuel_settings fs
  where fs.organisation_id = p_org;
  v_found := found;

  return case v_key
    when 'retention_months' then
      case when v_found then to_jsonb(s.retention_months) else 'null'::jsonb end
    when 'post_retention_action' then
      case when v_found then to_jsonb(s.post_retention_action) else 'null'::jsonb end
    when 'dup_auth_lookback_days' then
      to_jsonb(case when v_found then s.dup_auth_lookback_days else 90 end)
    when 'tank_overfill_tolerance_pct' then
      to_jsonb(case when v_found then s.tank_overfill_tolerance_pct else 5 end)
    when 'unit_price_high' then
      to_jsonb(case when v_found then s.unit_price_high else 35 end)
    when 'unit_price_low' then
      to_jsonb(case when v_found then s.unit_price_low else 5 end)
    when 'odometer_jump_km' then
      to_jsonb(case when v_found then s.odometer_jump_km else 500 end)
    when 'fill_frequency_daily_max' then
      to_jsonb(case when v_found then s.fill_frequency_daily_max else 3 end)
    when 'stale_fill_days' then
      to_jsonb(case when v_found then s.stale_fill_days else 14 end)
    else null
  end;
end;
$$;

create or replace function public.fuel_slip_actor_ok(
  p_actor uuid,
  p_org uuid,
  p_driver_id uuid,
  p_allow_driver boolean default true
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_actor is null or p_org is null then
    return false;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.is_platform_owner
  ) then
    return true;
  end if;

  if not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.deleted_at is null
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.deleted_at is null
      and om.role::text = any (
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
  ) then
    return true;
  end if;

  if p_allow_driver and p_driver_id is not null then
    return exists (
      select 1 from public.drivers d
      where d.id = p_driver_id
        and d.organisation_id = p_org
        and d.profile_id = p_actor
        and d.deleted_at is null
    );
  end if;

  return false;
end;
$$;

create or replace function public.fuel_slip_path_ok(p_org uuid, p_fillup_id uuid, p_path text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_prefix text;
begin
  if p_path is null or position('..' in p_path) > 0 then
    return false;
  end if;
  v_prefix := p_org::text || '/fuel-slips/' || p_fillup_id::text || '/';
  return p_path like v_prefix || '%';
end;
$$;

create or replace function public.fuel_storage_path_hash(p_storage_path text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(convert_to(coalesce(p_storage_path, ''), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- Flag evaluation (§4.2)
-- ---------------------------------------------------------------------------

create or replace function public.fuel_upsert_flag(
  p_org uuid,
  p_fillup_id uuid,
  p_code public.fuel_flag_code,
  p_raise boolean,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open_id uuid;
begin
  if p_raise then
    select f.id into v_open_id
    from public.fuel_entry_flags f
    where f.fuel_fillup_id = p_fillup_id
      and f.flag_code = p_code
      and f.status = 'open'
    limit 1;

    if v_open_id is null then
      insert into public.fuel_entry_flags (
        organisation_id, fuel_fillup_id, flag_code, status, details
      )
      values (
        p_org, p_fillup_id, p_code, 'open', coalesce(p_details, '{}'::jsonb)
      );
    else
      update public.fuel_entry_flags f
      set
        details = coalesce(p_details, '{}'::jsonb),
        updated_at = timezone('utc', now())
      where f.id = v_open_id;
    end if;
  else
    update public.fuel_entry_flags f
    set
      status = 'cleared_by_edit',
      cleared_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where f.fuel_fillup_id = p_fillup_id
      and f.flag_code = p_code
      and f.status = 'open';
  end if;
end;
$$;

create or replace function public.evaluate_fuel_entry_flags(p_fillup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.fuel_fillups%rowtype;
  v public.vehicles%rowtype;
  v_prev_odometer numeric;
  v_tank_max numeric;
  v_tol_pct numeric;
  v_dup_days integer;
  v_high_price numeric;
  v_low_price numeric;
  v_jump_km numeric;
  v_daily_max integer;
  v_stale_days integer;
  v_norm_vrn text;
  v_slip_vrn text;
  v_has_photo boolean;
  v_same_day_count integer;
  v_dup_count integer;
begin
  select * into f
  from public.fuel_fillups ff
  where ff.id = p_fillup_id and ff.deleted_at is null;
  if not found then
    raise exception 'not_found';
  end if;

  select * into v
  from public.vehicles veh
  where veh.id = f.vehicle_id and veh.deleted_at is null;

  v_tol_pct := (public.fuel_setting(f.organisation_id, 'tank_overfill_tolerance_pct'))::numeric;
  v_dup_days := (public.fuel_setting(f.organisation_id, 'dup_auth_lookback_days'))::integer;
  v_high_price := (public.fuel_setting(f.organisation_id, 'unit_price_high'))::numeric;
  v_low_price := (public.fuel_setting(f.organisation_id, 'unit_price_low'))::numeric;
  v_jump_km := (public.fuel_setting(f.organisation_id, 'odometer_jump_km'))::numeric;
  v_daily_max := (public.fuel_setting(f.organisation_id, 'fill_frequency_daily_max'))::integer;
  v_stale_days := (public.fuel_setting(f.organisation_id, 'stale_fill_days'))::integer;

  select ff.odometer_km into v_prev_odometer
  from public.fuel_fillups ff
  where ff.vehicle_id = f.vehicle_id
    and ff.deleted_at is null
    and ff.id <> f.id
  order by ff.filled_at desc, ff.created_at desc
  limit 1;

  v_tank_max := coalesce(v.tank_capacity_litres, v.capacity::numeric);
  v_norm_vrn := upper(regexp_replace(coalesce(v.registration_number, ''), '[^A-Z0-9]', '', 'g'));
  v_slip_vrn := upper(regexp_replace(coalesce(f.slip_vrn, ''), '[^A-Z0-9]', '', 'g'));

  select exists (
    select 1 from public.fuel_slip_photos p
    where p.fuel_fillup_id = f.id and p.purged_at is null
  ) into v_has_photo;

  -- vrn_mismatch
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'vrn_mismatch',
    f.slip_vrn_status = 'mismatch'
      or (
        v_slip_vrn <> ''
        and v_norm_vrn <> ''
        and v_slip_vrn <> v_norm_vrn
      ),
    jsonb_build_object('vehicle_vrn', v.registration_number, 'slip_vrn', f.slip_vrn)
  );

  -- dup_auth (no unique constraint — flag only)
  select count(*) into v_dup_count
  from public.fuel_fillups ff
  where ff.organisation_id = f.organisation_id
    and ff.deleted_at is null
    and ff.id <> f.id
    and ff.authorisation_no is not null
    and ff.authorisation_no = f.authorisation_no
    and ff.filled_at >= f.filled_at - make_interval(days => v_dup_days);

  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'dup_auth',
    f.authorisation_no is not null and btrim(f.authorisation_no) <> '' and v_dup_count > 0,
    jsonb_build_object('authorisation_no', f.authorisation_no, 'matches', v_dup_count)
  );

  -- litres_exceeds_tank
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'litres_exceeds_tank',
    v_tank_max is not null
      and f.litres > v_tank_max * (1 + v_tol_pct / 100.0),
    jsonb_build_object(
      'litres', f.litres,
      'tank_capacity_litres', v_tank_max,
      'tolerance_pct', v_tol_pct
    )
  );

  -- odometer_jump
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'odometer_jump',
    v_prev_odometer is not null and (f.odometer_km - v_prev_odometer) > v_jump_km,
    jsonb_build_object(
      'odometer_km', f.odometer_km,
      'previous_odometer_km', v_prev_odometer,
      'threshold_km', v_jump_km
    )
  );

  -- calculated_total_mismatch
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'calculated_total_mismatch',
    f.calculated_total is not null
      and f.total_amount is not null
      and abs(f.calculated_total - f.total_amount) > 0.01,
    jsonb_build_object(
      'calculated_total', f.calculated_total,
      'total_amount', f.total_amount
    )
  );

  -- slip_total_mismatch
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'slip_total_mismatch',
    f.slip_total_amount is not null
      and f.calculated_total is not null
      and abs(f.slip_total_amount - f.calculated_total) > 0.05,
    jsonb_build_object(
      'slip_total_amount', f.slip_total_amount,
      'calculated_total', f.calculated_total
    )
  );

  -- fuel_type_mismatch
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'fuel_type_mismatch',
    f.fuel_type is not null
      and f.slip_fuel_type is not null
      and f.fuel_type <> f.slip_fuel_type,
    jsonb_build_object('fuel_type', f.fuel_type, 'slip_fuel_type', f.slip_fuel_type)
  );

  -- missing_authorisation
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'missing_authorisation',
    f.entry_method <> 'legacy_manual'
      and (f.authorisation_no is null or btrim(f.authorisation_no) = ''),
    jsonb_build_object('entry_method', f.entry_method)
  );

  -- missing_slip_photo
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'missing_slip_photo',
    f.entry_method = 'driver_photo' and not v_has_photo,
    jsonb_build_object('entry_method', f.entry_method)
  );

  -- unit_price_high / low
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'unit_price_high',
    f.unit_price is not null and f.unit_price > v_high_price,
    jsonb_build_object('unit_price', f.unit_price, 'threshold', v_high_price)
  );

  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'unit_price_low',
    f.unit_price is not null and f.unit_price < v_low_price,
    jsonb_build_object('unit_price', f.unit_price, 'threshold', v_low_price)
  );

  -- high_fill_frequency
  select count(*) into v_same_day_count
  from public.fuel_fillups ff
  where ff.vehicle_id = f.vehicle_id
    and ff.deleted_at is null
    and ff.id <> f.id
    and ff.filled_at::date = f.filled_at::date;

  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'high_fill_frequency',
    v_same_day_count >= v_daily_max,
    jsonb_build_object('same_day_count', v_same_day_count, 'threshold', v_daily_max)
  );

  -- future_filled_at
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'future_filled_at',
    f.filled_at > timezone('utc', now()) + interval '1 hour',
    jsonb_build_object('filled_at', f.filled_at)
  );

  -- stale_filled_at
  perform public.fuel_upsert_flag(
    f.organisation_id,
    f.id,
    'stale_filled_at',
    f.filled_at < timezone('utc', now()) - make_interval(days => v_stale_days),
    jsonb_build_object('filled_at', f.filled_at, 'stale_days', v_stale_days)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- log_fuel_fillup — populate slip columns for legacy RPC path
-- ---------------------------------------------------------------------------

create or replace function public.log_fuel_fillup(
  p_organisation_id uuid,
  p_vehicle_id uuid,
  p_odometer_km numeric,
  p_litres numeric,
  p_company_id uuid default null,
  p_driver_id uuid default null,
  p_filled_at timestamptz default null,
  p_unit_price numeric default null,
  p_station_name text default null,
  p_notes text default null
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.vehicles%rowtype;
  last_km numeric;
  driver uuid;
  company uuid;
  is_ops boolean;
  is_self_driver boolean;
  total numeric;
  row public.fuel_fillups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v
  from public.vehicles
  where id = p_vehicle_id
    and organisation_id = p_organisation_id
    and deleted_at is null;
  if not found then
    raise exception 'Vehicle not found';
  end if;

  is_ops := public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    );

  driver := coalesce(p_driver_id, public.current_driver_id(p_organisation_id));
  is_self_driver := driver is not null
    and driver = public.current_driver_id(p_organisation_id);

  if not (is_ops or is_self_driver) then
    raise exception 'Not authorised to log fuel';
  end if;

  if p_litres is null or p_litres <= 0 then
    raise exception 'Litres must be positive';
  end if;
  if p_odometer_km is null or p_odometer_km < 0 then
    raise exception 'Odometer must be non-negative';
  end if;

  select f.odometer_km into last_km
  from public.fuel_fillups f
  where f.vehicle_id = p_vehicle_id
    and f.deleted_at is null
  order by f.filled_at desc, f.created_at desc
  limit 1;

  if last_km is not null and p_odometer_km < last_km then
    raise exception 'Odometer % km is less than last fill-up % km', p_odometer_km, last_km;
  end if;

  company := coalesce(p_company_id, v.company_id);

  if company is not null and not exists (
    select 1 from public.companies c
    where c.id = company
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
  ) then
    raise exception 'Company not found';
  end if;

  total := case
    when p_unit_price is not null then round(p_litres * p_unit_price, 2)
    else null
  end;

  insert into public.fuel_fillups (
    organisation_id,
    vehicle_id,
    driver_id,
    company_id,
    filled_at,
    odometer_km,
    litres,
    unit_price,
    total_amount,
    station_name,
    notes,
    created_by,
    entry_method,
    review_status,
    slip_vrn_status,
    calculated_total,
    submitted_at
  )
  values (
    p_organisation_id,
    p_vehicle_id,
    driver,
    company,
    coalesce(p_filled_at, timezone('utc', now())),
    p_odometer_km,
    p_litres,
    p_unit_price,
    total,
    nullif(trim(p_station_name), ''),
    nullif(trim(p_notes), ''),
    auth.uid(),
    'legacy_manual',
    'approved',
    'legacy',
    total,
    timezone('utc', now())
  )
  returning * into row;

  perform public.evaluate_fuel_entry_flags(row.id);

  return row;
end;
$$;

revoke all on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Audited fuel slip RPCs (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.submit_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_vehicle_id uuid,
  p_odometer_km numeric,
  p_litres numeric,
  p_entry_method public.fuel_entry_method default 'driver_photo',
  p_filled_at timestamptz default null,
  p_company_id uuid default null,
  p_driver_id uuid default null,
  p_unit_price numeric default null,
  p_total_amount numeric default null,
  p_station_name text default null,
  p_notes text default null,
  p_authorisation_no text default null,
  p_slip_vrn text default null,
  p_slip_fuel_type public.fuel_product_type default null,
  p_fuel_type public.fuel_product_type default null,
  p_slip_station_name text default null,
  p_slip_litres numeric default null,
  p_slip_unit_price numeric default null,
  p_slip_total_amount numeric default null,
  p_photo jsonb default null
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.vehicles%rowtype;
  driver uuid;
  company uuid;
  last_km numeric;
  total numeric;
  calc numeric;
  row public.fuel_fillups%rowtype;
  v_review public.fuel_review_status;
  v_vrn_status public.fuel_slip_vrn_status;
  v_norm_vrn text;
  v_slip_vrn text;
  v_photo_id uuid;
  v_fillup_id uuid;
begin
  v_fillup_id := coalesce(nullif(p_photo->>'fillup_id', '')::uuid, gen_random_uuid());
  driver := p_driver_id;
  if driver is null then
    select d.id into driver
    from public.drivers d
    where d.organisation_id = p_org
      and d.profile_id = p_actor
      and d.deleted_at is null
    limit 1;
  end if;

  if not public.fuel_slip_actor_ok(p_actor, p_org, driver, true) then
    raise exception 'not_authorised';
  end if;

  if p_entry_method = 'driver_photo' and (
    p_photo is null
    or nullif(btrim(p_photo->>'storage_path'), '') is null
  ) then
    raise exception 'photo_required';
  end if;

  select * into v
  from public.vehicles veh
  where veh.id = p_vehicle_id and veh.organisation_id = p_org and veh.deleted_at is null;
  if not found then
    raise exception 'vehicle_not_found';
  end if;

  if p_litres is null or p_litres <= 0 then
    raise exception 'invalid_litres';
  end if;

  select f.odometer_km into last_km
  from public.fuel_fillups f
  where f.vehicle_id = p_vehicle_id and f.deleted_at is null
  order by f.filled_at desc, f.created_at desc
  limit 1;

  company := coalesce(p_company_id, v.company_id);
  calc := case
    when p_unit_price is not null then round(p_litres * p_unit_price, 2)
    else null
  end;
  total := coalesce(p_total_amount, calc);

  v_review := 'pending_review'::public.fuel_review_status;

  v_norm_vrn := upper(regexp_replace(coalesce(v.registration_number, ''), '[^A-Z0-9]', '', 'g'));
  v_slip_vrn := upper(regexp_replace(coalesce(p_slip_vrn, ''), '[^A-Z0-9]', '', 'g'));
  v_vrn_status := case
    when v_slip_vrn = '' then 'missing'::public.fuel_slip_vrn_status
    when v_norm_vrn = '' then 'not_checked'::public.fuel_slip_vrn_status
    when v_slip_vrn = v_norm_vrn then 'match'::public.fuel_slip_vrn_status
    else 'mismatch'::public.fuel_slip_vrn_status
  end;

  insert into public.fuel_fillups (
    id,
    organisation_id, vehicle_id, driver_id, company_id,
    filled_at, odometer_km, litres, unit_price, total_amount,
    station_name, notes, created_by,
    entry_method, review_status, authorisation_no,
    slip_vrn, slip_vrn_status, slip_fuel_type, fuel_type,
    slip_station_name, slip_litres, slip_unit_price, slip_total_amount,
    calculated_total, submitted_at,
    reviewed_by, reviewed_at
  )
  values (
    v_fillup_id,
    p_org, p_vehicle_id, driver, company,
    coalesce(p_filled_at, timezone('utc', now())), p_odometer_km, p_litres,
    p_unit_price, total,
    nullif(btrim(p_station_name), ''), nullif(btrim(p_notes), ''), p_actor,
    p_entry_method, v_review, nullif(btrim(p_authorisation_no), ''),
    nullif(btrim(p_slip_vrn), ''), v_vrn_status, p_slip_fuel_type, coalesce(p_fuel_type, v.default_fuel_type),
    nullif(btrim(p_slip_station_name), ''), p_slip_litres, p_slip_unit_price, p_slip_total_amount,
    calc, timezone('utc', now()),
    case when v_review = 'approved' then p_actor else null end,
    case when v_review = 'approved' then timezone('utc', now()) else null end
  )
  returning * into row;

  if p_photo is not null then
    if not public.fuel_slip_path_ok(p_org, row.id, p_photo->>'storage_path') then
      raise exception 'invalid_photo_path';
    end if;

    insert into public.fuel_slip_photos (
      organisation_id, fuel_fillup_id, storage_path, file_name,
      mime_type, size_bytes, sha256, uploaded_by
    )
    values (
      p_org,
      row.id,
      p_photo->>'storage_path',
      nullif(p_photo->>'file_name', ''),
      coalesce(p_photo->>'mime_type', 'image/jpeg'),
      coalesce((p_photo->>'size_bytes')::integer, 1),
      nullif(p_photo->>'sha256', ''),
      p_actor
    )
    returning id into v_photo_id;
  end if;

  perform public.evaluate_fuel_entry_flags(row.id);

  perform public.write_audit_log(
    p_org,
    'fuel_slip.submitted',
    'fuel_fillup',
    row.id,
    jsonb_build_object(
      'entry_method', row.entry_method,
      'review_status', row.review_status,
      'photo_id', v_photo_id
    ),
    p_actor
  );

  return row;
end;
$$;

create or replace function public.submit_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_client_entry_id uuid,
  p_vehicle_id uuid,
  p_fields jsonb,
  p_photo jsonb
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.fuel_fillups%rowtype;
  mapped_fuel public.fuel_product_type;
  mapped_vrn public.fuel_slip_vrn_status;
  entry public.fuel_entry_method;
  is_admin boolean;
  row public.fuel_fillups%rowtype;
begin
  if p_client_entry_id is not null then
    select * into existing
    from public.fuel_fillups f
    where f.organisation_id = p_org
      and f.client_entry_id = p_client_entry_id
      and f.deleted_at is null
    limit 1;
    if found then
      return existing;
    end if;
  end if;

  is_admin := public.is_platform_owner()
    or public.has_org_role_names(p_org, array['organisation_admin']);

  entry := case when is_admin then 'admin_manual'::public.fuel_entry_method else 'driver_photo'::public.fuel_entry_method end;

  mapped_fuel := case coalesce(p_fields->>'fuel_type', 'other')
    when 'diesel50' then 'diesel'::public.fuel_product_type
    when 'diesel500' then 'diesel'::public.fuel_product_type
    when 'ulp93' then 'petrol'::public.fuel_product_type
    when 'ulp95' then 'petrol'::public.fuel_product_type
    else 'other'::public.fuel_product_type
  end;

  mapped_vrn := case coalesce(p_fields->>'slip_vrn_status', '')
    when 'confirmed_prefill' then 'match'::public.fuel_slip_vrn_status
    when 'edited' then 'mismatch'::public.fuel_slip_vrn_status
    when 'not_shown' then 'missing'::public.fuel_slip_vrn_status
    else 'not_checked'::public.fuel_slip_vrn_status
  end;

  row := public.submit_fuel_slip(
    p_actor,
    p_org,
    p_vehicle_id,
    (p_fields->>'odometer_km')::numeric,
    (p_fields->>'litres')::numeric,
    entry,
    (p_fields->>'filled_at')::timestamptz,
    null,
    null,
    (p_fields->>'unit_price')::numeric,
    (p_fields->>'total_amount')::numeric,
    p_fields->>'station_name',
    p_fields->>'notes',
    p_fields->>'authorisation_no',
    p_fields->>'slip_vrn',
    mapped_fuel,
    mapped_fuel,
    p_fields->>'station_name',
    (p_fields->>'litres')::numeric,
    (p_fields->>'unit_price')::numeric,
    (p_fields->>'total_amount')::numeric,
    p_photo
  );

  update public.fuel_fillups
  set
    client_entry_id = p_client_entry_id,
    is_full_tank = coalesce((p_fields->>'is_full_tank')::boolean, true),
    order_no = nullif(btrim(p_fields->>'order_no'), ''),
    pump_no = nullif(p_fields->>'pump_no', '')::smallint,
    station_vat_no = nullif(btrim(p_fields->>'station_vat_no'), ''),
    slip_number = nullif(btrim(p_fields->>'slip_number'), ''),
    slip_vrn_status = mapped_vrn
  where id = row.id
  returning * into row;

  perform public.evaluate_fuel_entry_flags(row.id);
  return row;
end;
$$;

create or replace function public.update_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_fillup_id uuid,
  p_fields jsonb
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.fuel_fillups%rowtype;
  v public.vehicles%rowtype;
  v_norm_vrn text;
  v_slip_vrn text;
begin
  select * into row
  from public.fuel_fillups f
  where f.id = p_fillup_id and f.organisation_id = p_org and f.deleted_at is null
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if row.review_status in ('void', 'rejected') then
    raise exception 'not_editable';
  end if;

  if not public.fuel_slip_actor_ok(p_actor, p_org, row.driver_id, row.review_status in ('pending_review', 'queried')) then
    raise exception 'not_authorised';
  end if;

  select * into v from public.vehicles veh where veh.id = row.vehicle_id;

  update public.fuel_fillups f
  set
    odometer_km = coalesce((p_fields->>'odometer_km')::numeric, f.odometer_km),
    litres = coalesce((p_fields->>'litres')::numeric, f.litres),
    unit_price = coalesce((p_fields->>'unit_price')::numeric, f.unit_price),
    total_amount = coalesce((p_fields->>'total_amount')::numeric, f.total_amount),
    station_name = coalesce(nullif(p_fields->>'station_name', ''), f.station_name),
    notes = coalesce(nullif(p_fields->>'notes', ''), f.notes),
    authorisation_no = coalesce(nullif(p_fields->>'authorisation_no', ''), f.authorisation_no),
    slip_vrn = coalesce(nullif(p_fields->>'slip_vrn', ''), f.slip_vrn),
    slip_fuel_type = coalesce((p_fields->>'slip_fuel_type')::public.fuel_product_type, f.slip_fuel_type),
    fuel_type = coalesce((p_fields->>'fuel_type')::public.fuel_product_type, f.fuel_type),
    slip_station_name = coalesce(nullif(p_fields->>'slip_station_name', ''), f.slip_station_name),
    slip_litres = coalesce((p_fields->>'slip_litres')::numeric, f.slip_litres),
    slip_unit_price = coalesce((p_fields->>'slip_unit_price')::numeric, f.slip_unit_price),
    slip_total_amount = coalesce((p_fields->>'slip_total_amount')::numeric, f.slip_total_amount),
    calculated_total = case
      when coalesce((p_fields->>'unit_price')::numeric, f.unit_price) is not null then
        round(
          coalesce((p_fields->>'litres')::numeric, f.litres)
          * coalesce((p_fields->>'unit_price')::numeric, f.unit_price),
          2
        )
      else f.calculated_total
    end,
    updated_at = timezone('utc', now())
  where f.id = p_fillup_id
  returning * into row;

  v_norm_vrn := upper(regexp_replace(coalesce(v.registration_number, ''), '[^A-Z0-9]', '', 'g'));
  v_slip_vrn := upper(regexp_replace(coalesce(row.slip_vrn, ''), '[^A-Z0-9]', '', 'g'));

  update public.fuel_fillups f
  set slip_vrn_status = case
    when v_slip_vrn = '' then 'missing'::public.fuel_slip_vrn_status
    when v_norm_vrn = '' then 'not_checked'::public.fuel_slip_vrn_status
    when v_slip_vrn = v_norm_vrn then 'match'::public.fuel_slip_vrn_status
    else 'mismatch'::public.fuel_slip_vrn_status
  end
  where f.id = row.id
  returning * into row;

  perform public.evaluate_fuel_entry_flags(row.id);

  perform public.write_audit_log(
    p_org,
    'fuel.slip.updated',
    'fuel_fillup',
    row.id,
    jsonb_build_object('fields', coalesce(p_fields, '{}'::jsonb)),
    p_actor
  );

  return row;
end;
$$;

create or replace function public.replace_fuel_slip_photo(
  p_actor uuid,
  p_org uuid,
  p_fillup_id uuid,
  p_photo jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.fuel_fillups%rowtype;
  old_path text;
  new_id uuid;
begin
  select * into row
  from public.fuel_fillups f
  where f.id = p_fillup_id and f.organisation_id = p_org and f.deleted_at is null;

  if not found then
    raise exception 'not_found';
  end if;

  if not public.fuel_slip_actor_ok(p_actor, p_org, row.driver_id, true) then
    raise exception 'not_authorised';
  end if;

  if p_photo is null or nullif(btrim(p_photo->>'storage_path'), '') is null then
    raise exception 'photo_required';
  end if;

  if not public.fuel_slip_path_ok(p_org, p_fillup_id, p_photo->>'storage_path') then
    raise exception 'invalid_photo_path';
  end if;

  select p.storage_path into old_path
  from public.fuel_slip_photos p
  where p.fuel_fillup_id = p_fillup_id and p.purged_at is null
  for update;

  if old_path is not null then
    perform public.enqueue_compliance_storage_purge(
      'fuel-slips', old_path, p_org, p_fillup_id, 'photo_replaced'
    );
    update public.fuel_slip_photos
    set purged_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where fuel_fillup_id = p_fillup_id and purged_at is null;
  end if;

  insert into public.fuel_slip_photos (
    organisation_id, fuel_fillup_id, storage_path, file_name,
    mime_type, size_bytes, sha256, uploaded_by
  )
  values (
    p_org,
    p_fillup_id,
    p_photo->>'storage_path',
    nullif(p_photo->>'file_name', ''),
    coalesce(p_photo->>'mime_type', 'image/jpeg'),
    coalesce((p_photo->>'size_bytes')::integer, 1),
    nullif(p_photo->>'sha256', ''),
    p_actor
  )
  returning id into new_id;

  perform public.evaluate_fuel_entry_flags(p_fillup_id);

  perform public.write_audit_log(
    p_org,
    'fuel.photo.replaced',
    'fuel_slip_photo',
    new_id,
    jsonb_build_object(
      'object_ref', public.fuel_storage_path_hash(p_photo->>'storage_path'),
      'previous_object_ref', public.fuel_storage_path_hash(old_path)
    ),
    p_actor
  );

  return new_id;
end;
$$;

create or replace function public.review_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_fillup_id uuid,
  p_decision text,
  p_notes text default null
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.fuel_fillups%rowtype;
  v_title text;
  v_body text;
begin
  if not public.fuel_slip_actor_ok(p_actor, p_org, null, false) then
    raise exception 'not_authorised';
  end if;

  select * into row
  from public.fuel_fillups f
  where f.id = p_fillup_id and f.organisation_id = p_org and f.deleted_at is null
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if p_decision not in ('approve', 'reject', 'query') then
    raise exception 'invalid_decision';
  end if;

  update public.fuel_fillups f
  set
    review_status = case p_decision
      when 'approve' then 'approved'::public.fuel_review_status
      when 'reject' then 'rejected'::public.fuel_review_status
      else 'queried'::public.fuel_review_status
    end,
    review_notes = nullif(btrim(p_notes), ''),
    query_notes = case when p_decision = 'query' then nullif(btrim(p_notes), '') else f.query_notes end,
    reviewed_by = p_actor,
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where f.id = p_fillup_id
  returning * into row;

  if p_decision in ('reject', 'query') and row.driver_id is not null then
    v_title := case p_decision
      when 'reject' then 'Fuel slip rejected'
      else 'Fuel slip query'
    end;
    v_body := coalesce(nullif(btrim(p_notes), ''), 'Please review your fuel slip submission.');

    perform public.enqueue_driver_notification(
      p_org,
      row.driver_id,
      case p_decision
        when 'reject' then 'fuel_slip_rejected'::public.driver_notification_type
        else 'fuel_slip_queried'::public.driver_notification_type
      end,
      v_title,
      v_body,
      null
    );
  end if;

  if p_decision = 'approve' then
    update public.fuel_entry_flags fl
    set status = 'cleared_by_review',
        cleared_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where fl.fuel_fillup_id = p_fillup_id and fl.status = 'open';
  end if;

  perform public.write_audit_log(
    p_org,
    case p_decision
      when 'approve' then 'fuel.slip.approved'
      when 'reject' then 'fuel.slip.rejected'
      else 'fuel.slip.queried'
    end,
    'fuel_fillup',
    row.id,
    jsonb_build_object('notes', p_notes),
    p_actor
  );

  return row;
end;
$$;

create or replace function public.void_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_fillup_id uuid,
  p_reason text default null
)
returns public.fuel_fillups
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.fuel_fillups%rowtype;
begin
  if not public.fuel_slip_actor_ok(p_actor, p_org, null, false) then
    raise exception 'not_authorised';
  end if;

  update public.fuel_fillups f
  set
    review_status = 'void',
    voided_by = p_actor,
    voided_at = timezone('utc', now()),
    void_reason = nullif(btrim(p_reason), ''),
    updated_at = timezone('utc', now())
  where f.id = p_fillup_id
    and f.organisation_id = p_org
    and f.deleted_at is null
  returning * into row;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'fuel.slip.voided',
    'fuel_fillup',
    row.id,
    jsonb_build_object('reason', p_reason),
    p_actor
  );

  return row;
end;
$$;

create or replace function public.privacy_purge_fuel_slip_photo(
  p_actor uuid,
  p_org uuid,
  p_photo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fuel_slip_photos%rowtype;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_actor and p.is_platform_owner
  ) and not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.deleted_at is null
      and om.role::text = 'organisation_admin'
  ) then
    raise exception 'not_authorised';
  end if;

  select * into rec
  from public.fuel_slip_photos p
  where p.id = p_photo_id and p.organisation_id = p_org and p.purged_at is null
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.enqueue_compliance_storage_purge(
    'fuel-slips', rec.storage_path, p_org, rec.fuel_fillup_id, 'privacy_purge'
  );

  update public.fuel_slip_photos
  set
    purged_at = timezone('utc', now()),
    privacy_redacted_at = timezone('utc', now()),
    storage_path = '',
    file_name = null,
    sha256 = null,
    updated_at = timezone('utc', now())
  where id = p_photo_id;

  perform public.write_audit_log(
    p_org,
    'fuel.photo.purged',
    'fuel_slip_photo',
    p_photo_id,
    jsonb_build_object('object_ref', public.fuel_storage_path_hash(rec.storage_path)),
    p_actor
  );
end;
$$;

create or replace function public.audit_fuel_slip_photo_view(
  p_actor uuid,
  p_org uuid,
  p_photo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fuel_slip_photos%rowtype;
begin
  select * into rec
  from public.fuel_slip_photos p
  where p.id = p_photo_id and p.organisation_id = p_org and p.purged_at is null;

  if not found then
    raise exception 'not_found';
  end if;

  perform public.write_audit_log(
    p_org,
    'fuel.photo.viewed',
    'fuel_slip_photo',
    p_photo_id,
    jsonb_build_object('object_ref', public.fuel_storage_path_hash(rec.storage_path)),
    p_actor
  );
end;
$$;

create or replace function public.audit_fuel_report_export(
  p_actor uuid,
  p_org uuid,
  p_report_kind text,
  p_period_start date,
  p_period_end date,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_audit_log(
    p_org,
    'fuel.report.exported',
    'fuel_report',
    null,
    jsonb_build_object(
      'report_kind', p_report_kind,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    ),
    p_actor
  );
end;
$$;

create or replace function public.save_fuel_settings(
  p_actor uuid,
  p_org uuid,
  p_settings jsonb
)
returns public.fuel_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.fuel_settings%rowtype;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_actor and p.is_platform_owner
  ) and not exists (
    select 1 from public.organisation_members om
    where om.organisation_id = p_org
      and om.user_id = p_actor
      and om.status = 'active'
      and om.deleted_at is null
      and om.role::text = 'organisation_admin'
  ) then
    raise exception 'not_authorised';
  end if;

  insert into public.fuel_settings (
    organisation_id,
    retention_months,
    post_retention_action,
    dup_auth_lookback_days,
    tank_overfill_tolerance_pct,
    unit_price_high,
    unit_price_low,
    odometer_jump_km,
    fill_frequency_daily_max,
    stale_fill_days
  )
  values (
    p_org,
    (p_settings->>'retention_months')::integer,
    (p_settings->>'post_retention_action')::public.fuel_post_retention_action,
    coalesce((p_settings->>'dup_auth_lookback_days')::integer, 90),
    coalesce((p_settings->>'tank_overfill_tolerance_pct')::numeric, 5),
    coalesce((p_settings->>'unit_price_high')::numeric, 35),
    coalesce((p_settings->>'unit_price_low')::numeric, 5),
    coalesce((p_settings->>'odometer_jump_km')::numeric, 500),
    coalesce((p_settings->>'fill_frequency_daily_max')::integer, 3),
    coalesce((p_settings->>'stale_fill_days')::integer, 14)
  )
  on conflict (organisation_id) do update set
    retention_months = excluded.retention_months,
    post_retention_action = excluded.post_retention_action,
    dup_auth_lookback_days = excluded.dup_auth_lookback_days,
    tank_overfill_tolerance_pct = excluded.tank_overfill_tolerance_pct,
    unit_price_high = excluded.unit_price_high,
    unit_price_low = excluded.unit_price_low,
    odometer_jump_km = excluded.odometer_jump_km,
    fill_frequency_daily_max = excluded.fill_frequency_daily_max,
    stale_fill_days = excluded.stale_fill_days,
    updated_at = timezone('utc', now())
  returning * into row;

  perform public.write_audit_log(
    p_org,
    'fuel.settings.saved',
    'fuel_settings',
    p_org,
    coalesce(p_settings, '{}'::jsonb),
    p_actor
  );

  return row;
end;
$$;

create or replace function public.run_fuel_slip_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention_purged integer := 0;
  v_orphan_storage integer := 0;
  org_rec record;
  photo_rec record;
  orphan_rec record;
  v_months integer;
  v_action public.fuel_post_retention_action;
begin
  for org_rec in
    select fs.organisation_id, fs.retention_months, fs.post_retention_action
    from public.fuel_settings fs
    where fs.retention_months is not null
  loop
    v_months := org_rec.retention_months;
    v_action := org_rec.post_retention_action;

    for photo_rec in
      select p.id as photo_id, p.storage_path, p.fuel_fillup_id, p.organisation_id
      from public.fuel_slip_photos p
      join public.fuel_fillups f on f.id = p.fuel_fillup_id
      where p.organisation_id = org_rec.organisation_id
        and p.purged_at is null
        and btrim(p.storage_path) <> ''
        and f.filled_at < p_now - make_interval(months => v_months)
    loop
      perform public.enqueue_compliance_storage_purge(
        'fuel-slips',
        photo_rec.storage_path,
        photo_rec.organisation_id,
        photo_rec.fuel_fillup_id,
        'retention'
      );

      if v_action = 'redact_metadata' then
        update public.fuel_slip_photos
        set
          privacy_redacted_at = p_now,
          storage_path = '',
          file_name = null,
          sha256 = null,
          updated_at = p_now
        where id = photo_rec.photo_id;
      else
        update public.fuel_slip_photos
        set purged_at = p_now, updated_at = p_now
        where id = photo_rec.photo_id;
      end if;

      perform public.write_audit_log(
        photo_rec.organisation_id,
        'fuel.photo.purged',
        'fuel_slip_photo',
        photo_rec.photo_id,
        jsonb_build_object(
          'object_ref', public.fuel_storage_path_hash(photo_rec.storage_path),
          'reason', 'retention'
        )
      );

      v_retention_purged := v_retention_purged + 1;
    end loop;
  end loop;

  for orphan_rec in
    select so.name as storage_path
    from storage.objects so
    where so.bucket_id = 'fuel-slips'
      and so.created_at < p_now - interval '24 hours'
      and not exists (
        select 1 from public.fuel_slip_photos p
        where p.storage_path = so.name and p.purged_at is null
      )
  loop
    perform public.enqueue_compliance_storage_purge(
      'fuel-slips', orphan_rec.storage_path, null, null, 'orphan_storage'
    );
    v_orphan_storage := v_orphan_storage + 1;
  end loop;

  perform public.write_audit_log(
    null,
    'fuel.retention.run',
    'fuel_retention',
    null,
    jsonb_build_object(
      'retention_purged', v_retention_purged,
      'orphan_storage_queued', v_orphan_storage
    )
  );

  return jsonb_build_object(
    'retention_purged', v_retention_purged,
    'orphan_storage_queued', v_orphan_storage
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoice generation — approved fill-ups only
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
      and f.review_status = 'approved'
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
      and f.review_status = 'approved'
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.fuel_fillups enable row level security;

drop policy if exists fuel_fillups_insert on public.fuel_fillups;
drop policy if exists fuel_fillups_update on public.fuel_fillups;

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
            array['organisation_admin']
          )
          or public.has_org_role_names(
            organisation_id,
            array['manager', 'dispatcher', 'supervisor']
          )
          or driver_id = public.current_driver_id(organisation_id)
          or (
            review_status = 'approved'
            and company_id is not null
            and public.has_org_role_names(organisation_id, array['company_manager'])
            and public.has_company_scope(organisation_id, company_id)
          )
        )
      )
    )
  );

alter table public.fuel_slip_photos enable row level security;

drop policy if exists fuel_slip_photos_select on public.fuel_slip_photos;
create policy fuel_slip_photos_select on public.fuel_slip_photos
  for select
  using (
    purged_at is null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin']
      )
      or exists (
        select 1 from public.fuel_fillups f
        where f.id = fuel_fillup_id
          and f.deleted_at is null
          and f.driver_id = public.current_driver_id(organisation_id)
      )
    )
  );

alter table public.fuel_entry_flags enable row level security;

drop policy if exists fuel_entry_flags_select on public.fuel_entry_flags;
create policy fuel_entry_flags_select on public.fuel_entry_flags
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin']
    )
  );

alter table public.fuel_settings enable row level security;

drop policy if exists fuel_settings_select on public.fuel_settings;
create policy fuel_settings_select on public.fuel_settings
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin']
    )
  );

-- ---------------------------------------------------------------------------
-- Table privileges — SELECT via RLS; writes via service_role RPCs only
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.fuel_fillups from anon, authenticated;
revoke insert, update, delete on public.fuel_slip_photos from anon, authenticated;
revoke insert, update, delete on public.fuel_entry_flags from anon, authenticated;
revoke insert, update, delete on public.fuel_settings from anon, authenticated;

grant select on public.fuel_fillups to authenticated;
grant select on public.fuel_slip_photos to authenticated;
grant select on public.fuel_entry_flags to authenticated;
grant select on public.fuel_settings to authenticated;

grant all on public.fuel_fillups to service_role;
grant all on public.fuel_slip_photos to service_role;
grant all on public.fuel_entry_flags to service_role;
grant all on public.fuel_settings to service_role;

-- ---------------------------------------------------------------------------
-- RPC grants
-- ---------------------------------------------------------------------------

revoke all on function public.fuel_setting(uuid, text) from public, anon, authenticated;
grant execute on function public.fuel_setting(uuid, text) to service_role;

revoke all on function public.fuel_slip_actor_ok(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.fuel_slip_actor_ok(uuid, uuid, uuid, boolean) to service_role;

revoke all on function public.fuel_slip_path_ok(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fuel_slip_path_ok(uuid, uuid, text) to service_role;

revoke all on function public.fuel_storage_path_hash(text) from public, anon, authenticated;
grant execute on function public.fuel_storage_path_hash(text) to service_role;

revoke all on function public.fuel_upsert_flag(uuid, uuid, public.fuel_flag_code, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.fuel_upsert_flag(uuid, uuid, public.fuel_flag_code, boolean, jsonb) to service_role;

revoke all on function public.evaluate_fuel_entry_flags(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_fuel_entry_flags(uuid) to service_role;

revoke all on function public.submit_fuel_slip(
  uuid, uuid, uuid, numeric, numeric, public.fuel_entry_method, timestamptz, uuid, uuid,
  numeric, numeric, text, text, text, text, public.fuel_product_type, public.fuel_product_type,
  text, numeric, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_fuel_slip(
  uuid, uuid, uuid, numeric, numeric, public.fuel_entry_method, timestamptz, uuid, uuid,
  numeric, numeric, text, text, text, text, public.fuel_product_type, public.fuel_product_type,
  text, numeric, numeric, numeric, jsonb
) to service_role;

revoke all on function public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb)
  to service_role;

revoke all on function public.update_fuel_slip(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_fuel_slip(uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.review_fuel_slip(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_fuel_slip(uuid, uuid, uuid, text, text) to service_role;

revoke all on function public.void_fuel_slip(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.void_fuel_slip(uuid, uuid, uuid, text) to service_role;

revoke all on function public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid) to service_role;

revoke all on function public.audit_fuel_slip_photo_view(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.audit_fuel_slip_photo_view(uuid, uuid, uuid) to service_role;

revoke all on function public.audit_fuel_report_export(uuid, uuid, text, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.audit_fuel_report_export(uuid, uuid, text, date, date, jsonb) to service_role;

revoke all on function public.save_fuel_settings(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_fuel_settings(uuid, uuid, jsonb) to service_role;

revoke all on function public.run_fuel_slip_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.run_fuel_slip_retention(timestamptz) to service_role;

alter function public.submit_fuel_slip(
  uuid, uuid, uuid, numeric, numeric, public.fuel_entry_method, timestamptz, uuid, uuid,
  numeric, numeric, text, text, text, text, public.fuel_product_type, public.fuel_product_type,
  text, numeric, numeric, numeric, jsonb
) owner to postgres;
alter function public.run_fuel_slip_retention(timestamptz) owner to postgres;

comment on table public.fuel_slip_photos is 'Fuel slip image metadata; bytes in storage bucket fuel-slips.';
comment on table public.fuel_entry_flags is 'Anomaly flags raised by evaluate_fuel_entry_flags.';
comment on table public.fuel_settings is 'Per-org fuel slip thresholds and retention (NULL retention = disabled).';
comment on function public.evaluate_fuel_entry_flags(uuid) is 'Recompute open/cleared flags for one fill-up.';
comment on function public.run_fuel_slip_retention(timestamptz) is 'Retention purge when configured; always orphan sweep.';
