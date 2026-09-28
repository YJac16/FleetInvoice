-- =============================================================================
-- GoOps — Fuel slip capture (spec v2, 27 Sep 2026)
-- Requires 00048 (service-role-only write_audit_log), 00041 (purge queue) and
-- 00051_fuel_slip_enums.sql (driver_notification_type fuel_slip_queried/_rejected).
--
-- * fuel_fillups stays the single canonical fuel transaction (spec §6.1).
-- * Every value list is TEXT + CHECK (no new enums in this migration).
-- * All writes go through SECURITY DEFINER RPCs, EXECUTE service_role only (§6.6).
-- * No storage.objects policies and no ALTER on storage.objects (§6.5, §11).
-- * Thresholds are fuel_settings defaults; flags never block saving (§4).
-- * Retention period / end-of-life action stay NULL until the legal decision (§8).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- vehicles: tank capacity + default fuel type (§6.2)
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists tank_capacity_litres numeric(6, 1),
  add column if not exists default_fuel_type text;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_tank_capacity_litres_range
    check (tank_capacity_litres is null or (tank_capacity_litres >= 5 and tank_capacity_litres <= 1500));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vehicles
    add constraint vehicles_default_fuel_type_check
    check (default_fuel_type is null or default_fuel_type in ('ulp93', 'ulp95', 'diesel50', 'diesel500', 'other'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- fuel_fillups: new columns (§6.2)
-- ---------------------------------------------------------------------------

alter table public.fuel_fillups
  add column if not exists field_sources jsonb not null default '{}'::jsonb,
  add column if not exists client_entry_id uuid,
  add column if not exists fuel_type text,
  add column if not exists slip_vrn text,
  add column if not exists slip_vrn_normalised text
    generated always as (nullif(regexp_replace(upper(slip_vrn), '[[:space:]-]+', '', 'g'), '')) stored,
  add column if not exists vehicle_vrn_snapshot text,
  add column if not exists calculated_total numeric(12, 2),
  add column if not exists authorisation_no text,
  add column if not exists order_no text,
  add column if not exists pump_no smallint,
  add column if not exists station_vat_no text,
  add column if not exists slip_number text,
  add column if not exists is_full_tank boolean not null default true,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists review_reason_code text,
  add column if not exists review_note text,
  add column if not exists open_flag_count smallint not null default 0,
  add column if not exists max_open_severity text,
  add column if not exists retain_until date,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists photo_purged_at timestamptz,
  add column if not exists retention_processed_at timestamptz;

-- Legacy back-fill (§6.1): existing rows become legacy_manual / approved / legacy.
-- Runs once: only when the status columns are being introduced.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_fillups' and column_name = 'slip_vrn_status'
  ) then
    alter table public.fuel_fillups
      add column entry_method text not null default 'legacy_manual',
      add column review_status text not null default 'approved',
      add column slip_vrn_status text not null default 'legacy';

    alter table public.fuel_fillups disable trigger fuel_fillups_set_updated_at;
    update public.fuel_fillups
    set calculated_total = round(litres * unit_price, 2)
    where unit_price is not null;
    alter table public.fuel_fillups enable trigger fuel_fillups_set_updated_at;

    alter table public.fuel_fillups
      alter column entry_method set default 'driver_photo',
      alter column review_status set default 'pending_review',
      alter column slip_vrn_status drop default;
  end if;
end $$;

-- Check constraints. Added NOT VALID then validated, so a legacy row outside the
-- new ranges cannot fail the deploy; new/edited rows are always checked.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('fuel_fillups_entry_method_check',
       $c$entry_method in ('driver_photo', 'admin_manual', 'legacy_manual')$c$),
      ('fuel_fillups_review_status_check',
       $c$review_status in ('pending_review', 'queried', 'approved', 'rejected', 'voided')$c$),
      ('fuel_fillups_fuel_type_check',
       $c$fuel_type is null or fuel_type in ('ulp93', 'ulp95', 'diesel50', 'diesel500', 'other')$c$),
      ('fuel_fillups_slip_vrn_status_check',
       $c$slip_vrn_status in ('confirmed_prefill', 'edited', 'not_shown', 'legacy')$c$),
      ('fuel_fillups_slip_vrn_format_check',
       $c$slip_vrn is null or (slip_vrn = upper(slip_vrn) and char_length(slip_vrn) between 1 and 12)$c$),
      ('fuel_fillups_slip_vrn_required_check',
       $c$slip_vrn is not null or slip_vrn_status in ('not_shown', 'legacy') or retention_processed_at is not null$c$),
      ('fuel_fillups_authorisation_no_check',
       $c$authorisation_no is null or (authorisation_no = upper(authorisation_no) and char_length(authorisation_no) between 1 and 32)$c$),
      ('fuel_fillups_order_no_check',
       $c$order_no is null or char_length(order_no) between 1 and 32$c$),
      ('fuel_fillups_pump_no_check',
       $c$pump_no is null or pump_no between 0 and 99$c$),
      ('fuel_fillups_station_vat_no_check',
       $c$station_vat_no is null or station_vat_no ~ '^[0-9]{10}$'$c$),
      ('fuel_fillups_slip_number_check',
       $c$slip_number is null or char_length(slip_number) between 1 and 32$c$),
      ('fuel_fillups_max_open_severity_check',
       $c$max_open_severity is null or max_open_severity in ('info', 'low', 'medium', 'high')$c$),
      ('fuel_fillups_odometer_max_check',
       $c$odometer_km <= 2000000$c$),
      ('fuel_fillups_litres_max_check',
       $c$litres <= 1000$c$),
      ('fuel_fillups_unit_price_range_check',
       $c$unit_price is null or (unit_price > 0 and unit_price < 100)$c$),
      ('fuel_fillups_total_amount_range_check',
       $c$total_amount is null or (total_amount >= 0 and total_amount < 100000)$c$),
      ('fuel_fillups_amounts_required_check',
       $c$entry_method = 'legacy_manual' or (unit_price is not null and total_amount is not null)$c$),
      ('fuel_fillups_notes_length_check',
       $c$notes is null or char_length(notes) <= 280 or entry_method = 'legacy_manual'$c$)
    ) as t(name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.fuel_fillups'::regclass and conname = c.name
    ) then
      execute format('alter table public.fuel_fillups add constraint %I check (%s) not valid', c.name, c.expr);
      begin
        execute format('alter table public.fuel_fillups validate constraint %I', c.name);
      exception when check_violation then
        raise notice 'fuel_fillups: constraint % left NOT VALID (existing legacy rows violate it)', c.name;
      end;
    end if;
  end loop;
end $$;

comment on column public.fuel_fillups.total_amount is
  'Typed slip total. Never recalculated or overwritten by the system.';
comment on column public.fuel_fillups.calculated_total is
  'round(litres x unit_price, 2); set by the RPC on insert and on every edit of litres or price.';
comment on column public.fuel_fillups.authorisation_no is
  'Upper-case, <= 32 chars. Deliberately NOT unique (DUP_AUTH is an informational flag).';
comment on column public.fuel_fillups.retain_until is
  'Set from fuel_settings.retention_months (LEGAL/FOUNDER DECISION); NULL while the policy is undecided.';

-- ---------------------------------------------------------------------------
-- fuel_fillups indexes (§6.3)
-- ---------------------------------------------------------------------------

create index if not exists fuel_fillups_review_queue_idx
  on public.fuel_fillups (organisation_id, review_status, max_open_severity, submitted_at)
  where deleted_at is null;

create index if not exists fuel_fillups_driver_filled_live_idx
  on public.fuel_fillups (driver_id, filled_at desc)
  where deleted_at is null;

create unique index if not exists fuel_fillups_org_client_entry_uidx
  on public.fuel_fillups (organisation_id, client_entry_id)
  where client_entry_id is not null;

create index if not exists fuel_fillups_org_vat_slip_idx
  on public.fuel_fillups (organisation_id, station_vat_no, slip_number)
  where slip_number is not null and deleted_at is null;

create index if not exists fuel_fillups_org_auth_filled_idx
  on public.fuel_fillups (organisation_id, authorisation_no, filled_at)
  where authorisation_no is not null and deleted_at is null;

create index if not exists fuel_fillups_org_retain_until_idx
  on public.fuel_fillups (organisation_id, retain_until)
  where legal_hold = false and retention_processed_at is null;

-- ---------------------------------------------------------------------------
-- fuel_slip_photos (§6.2)
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_slip_photos (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  fillup_id uuid not null references public.fuel_fillups (id) on delete cascade,
  bucket_id text not null default 'fuel-slips',
  storage_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  width_px integer,
  height_px integer,
  sha256 text not null,
  is_current boolean not null default true,
  superseded_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  purged_at timestamptz,
  purge_reason text,
  constraint fuel_slip_photos_storage_path_key unique (storage_path),
  constraint fuel_slip_photos_bucket_check check (bucket_id = 'fuel-slips'),
  constraint fuel_slip_photos_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint fuel_slip_photos_size_check check (size_bytes > 0 and size_bytes <= 5242880),
  constraint fuel_slip_photos_dims_check check (
    (width_px is null or width_px > 0) and (height_px is null or height_px > 0)
  ),
  constraint fuel_slip_photos_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint fuel_slip_photos_superseded_check check (is_current or superseded_at is not null)
);

create unique index if not exists fuel_slip_photos_one_current_uidx
  on public.fuel_slip_photos (fillup_id)
  where is_current;

create index if not exists fuel_slip_photos_org_sha256_idx
  on public.fuel_slip_photos (organisation_id, sha256);

create index if not exists fuel_slip_photos_fillup_idx
  on public.fuel_slip_photos (fillup_id);

comment on table public.fuel_slip_photos is
  'Fuel slip photo metadata. Bytes live in private bucket fuel-slips and are served only by the audited view route.';

-- ---------------------------------------------------------------------------
-- fuel_entry_flags (§6.2, §4.2)
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_entry_flags (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  fillup_id uuid not null references public.fuel_fillups (id) on delete cascade,
  code text not null,
  severity text not null,
  message text not null,
  details jsonb not null,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  constraint fuel_entry_flags_code_check check (code in (
    'AMOUNT_MISMATCH', 'ODO_REGRESSION', 'ODO_JUMP', 'CONSUMPTION_OUTLIER',
    'VRN_MISMATCH', 'VRN_NOT_SHOWN', 'DUP_SLIP', 'DUP_AUTH', 'DUP_PHOTO',
    'OVER_TANK', 'TANK_UNKNOWN', 'PRICE_RANGE', 'TOO_SOON', 'FUEL_TYPE_MISMATCH',
    'VEHICLE_NOT_ASSIGNED', 'DATE_FUTURE', 'DATE_OLD', 'DATE_BEFORE_PREVIOUS',
    'STATION_VAT_FORMAT', 'NO_PHOTO_ADMIN', 'EDITED_AFTER_QUERY'
  )),
  constraint fuel_entry_flags_severity_check check (severity in ('info', 'low', 'medium', 'high')),
  constraint fuel_entry_flags_status_check check (status in ('open', 'accepted', 'dismissed', 'cleared_by_edit')),
  constraint fuel_entry_flags_details_check check (jsonb_typeof(details) = 'object' and details <> '{}'::jsonb),
  constraint fuel_entry_flags_resolved_check check (status = 'open' or resolved_at is not null)
);

create unique index if not exists fuel_entry_flags_one_open_uidx
  on public.fuel_entry_flags (fillup_id, code)
  where status = 'open';

create index if not exists fuel_entry_flags_org_open_idx
  on public.fuel_entry_flags (organisation_id, status, severity)
  where status = 'open';

create index if not exists fuel_entry_flags_fillup_idx
  on public.fuel_entry_flags (fillup_id);

comment on column public.fuel_entry_flags.details is
  'All inputs and thresholds used, so the flag can be explained after settings change.';

-- ---------------------------------------------------------------------------
-- fuel_settings (§6.2): one row per organisation; defaults apply when missing.
-- Keep in sync with public.fuel_setting().
-- ---------------------------------------------------------------------------

create table if not exists public.fuel_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  amount_tol_abs numeric(10, 2) not null default 1.00,
  amount_tol_pct numeric(6, 3) not null default 0.25,
  price_min numeric(8, 3) not null default 15.00,
  price_max numeric(8, 3) not null default 35.00,
  max_age_days integer not null default 7,
  future_tol_minutes integer not null default 10,
  min_hours_between_fills numeric(6, 2) not null default 6,
  max_km_between_fills integer not null default 1500,
  tank_tol_pct numeric(6, 2) not null default 5,
  consumption_min numeric(6, 2) not null default 4,
  consumption_max numeric(6, 2) not null default 40,
  dup_auth_window_days integer not null default 1,
  dup_auth_severity text not null default 'medium',
  default_order_no text,
  retention_months integer,
  post_retention_action text,
  scan_enabled boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fuel_settings_amount_tol_check check (amount_tol_abs >= 0 and amount_tol_pct >= 0 and amount_tol_pct <= 100),
  constraint fuel_settings_price_check check (price_min > 0 and price_max > price_min and price_max < 100),
  constraint fuel_settings_age_check check (max_age_days >= 1 and future_tol_minutes >= 0),
  constraint fuel_settings_interval_check check (min_hours_between_fills >= 0 and max_km_between_fills > 0),
  constraint fuel_settings_tank_tol_check check (tank_tol_pct >= 0 and tank_tol_pct <= 100),
  constraint fuel_settings_consumption_check check (consumption_min > 0 and consumption_max > consumption_min),
  constraint fuel_settings_dup_auth_check check (
    dup_auth_window_days between 0 and 30
    and dup_auth_severity in ('info', 'low', 'medium', 'high')
  ),
  constraint fuel_settings_default_order_no_check check (
    default_order_no is null or char_length(default_order_no) between 1 and 32
  ),
  constraint fuel_settings_retention_months_check check (retention_months is null or retention_months >= 1),
  constraint fuel_settings_post_retention_action_check check (
    post_retention_action is null or post_retention_action in ('anonymise', 'delete')
  )
);

comment on column public.fuel_settings.retention_months is
  'LEGAL/FOUNDER DECISION. NULL = no retain_until and no retention purge.';
comment on column public.fuel_settings.post_retention_action is
  'LEGAL/FOUNDER DECISION. NULL = no retention purge. anonymise | delete.';
comment on column public.fuel_settings.scan_enabled is
  'Scan-assist DB switch (also requires env FUEL_SCAN_ENABLED). Off in v1.';

-- ---------------------------------------------------------------------------
-- Storage bucket (§6.5). No storage.objects policies: clients are denied by default.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fuel-slips', 'fuel-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.fuel_setting(p_org uuid)
returns public.fuel_settings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.fuel_settings%rowtype;
begin
  select * into s from public.fuel_settings fs where fs.organisation_id = p_org;
  if not found then
    s.organisation_id := p_org;
    s.amount_tol_abs := 1.00;
    s.amount_tol_pct := 0.25;
    s.price_min := 15.00;
    s.price_max := 35.00;
    s.max_age_days := 7;
    s.future_tol_minutes := 10;
    s.min_hours_between_fills := 6;
    s.max_km_between_fills := 1500;
    s.tank_tol_pct := 5;
    s.consumption_min := 4;
    s.consumption_max := 40;
    s.dup_auth_window_days := 1;
    s.dup_auth_severity := 'medium';
    s.default_order_no := null;
    s.retention_months := null;
    s.post_retention_action := null;
    s.scan_enabled := false;
  end if;
  return s;
end;
$$;

comment on function public.fuel_setting(uuid) is
  'Effective fuel settings for an org: the fuel_settings row, or the locked v1 defaults when missing.';

create or replace function public.fuel_path_sha256(p_path text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_path is null then null
    else encode(extensions.digest(convert_to(p_path, 'UTF8'), 'sha256'), 'hex')
  end;
$$;

create or replace function public.fuel_normalise_vrn(p_vrn text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(upper(p_vrn), '[[:space:]-]+', '', 'g'), '');
$$;

create or replace function public.fuel_fuel_family(p_fuel_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_fuel_type in ('ulp93', 'ulp95') then 'petrol'
    when p_fuel_type in ('diesel50', 'diesel500') then 'diesel'
    when p_fuel_type is null then null
    else 'other'
  end;
$$;

create or replace function public.fuel_severity_rank(p_severity text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_severity when 'high' then 4 when 'medium' then 3 when 'low' then 2 when 'info' then 1 else 0 end;
$$;

create or replace function public.fuel_parse_numeric(p_value jsonb, p_field text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) not in ('number', 'string') then
    raise exception 'invalid_number:%', p_field;
  end if;
  v := btrim(replace(p_value #>> '{}', ',', '.'));
  if v = '' then
    return null;
  end if;
  if v !~ '^-?[0-9]+(\.[0-9]+)?$' then
    raise exception 'invalid_number:%', p_field;
  end if;
  return v::numeric;
end;
$$;

-- 'platform_owner' | app_role text | null. Platform owner is a profile flag.
create or replace function public.fuel_actor_role(p_actor uuid, p_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_actor is null or p_org is null then null
    when not exists (select 1 from public.organisations o where o.id = p_org and o.deleted_at is null) then null
    when exists (select 1 from public.profiles p where p.id = p_actor and p.is_platform_owner) then 'platform_owner'
    else (
      select om.role::text
      from public.organisation_members om
      where om.organisation_id = p_org
        and om.user_id = p_actor
        and om.status = 'active'
        and om.deleted_at is null
      order by case om.role::text when 'organisation_admin' then 1 when 'driver' then 2 else 3 end
      limit 1
    )
  end;
$$;

create or replace function public.fuel_actor_driver_id(p_actor uuid, p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.drivers d
  where d.organisation_id = p_org
    and d.profile_id = p_actor
    and d.deleted_at is null
  limit 1;
$$;

-- Input validation (§4.1). Blocks saving; returns canonical values.
-- Date/time come from native pickers as YYYY-MM-DD + HH:MM[:SS] local SAST (§3).
create or replace function public.fuel_slip_normalise_fields(p_fields jsonb, p_entry_method text)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_legacy boolean := p_entry_method = 'legacy_manual';
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_date_text text;
  v_time_text text;
  v_date date;
  v_filled_at timestamptz;
  v_litres numeric;
  v_price numeric;
  v_total numeric;
  v_odo numeric;
  v_fuel_type text;
  v_vrn_status text;
  v_vrn text;
  v_auth text;
  v_order text;
  v_pump numeric;
  v_station text;
  v_vat text;
  v_slip text;
  v_full boolean := true;
  v_notes text;
begin
  p_fields := coalesce(p_fields, '{}'::jsonb);
  if jsonb_typeof(p_fields) <> 'object' then
    raise exception 'invalid_fields';
  end if;

  v_date_text := nullif(btrim(p_fields->>'filled_date'), '');
  v_time_text := nullif(btrim(p_fields->>'filled_time'), '');
  if v_date_text is null or v_time_text is null then
    raise exception 'filled_at_required';
  end if;
  if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_time_text !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$' then
    raise exception 'invalid_filled_at';
  end if;
  begin
    v_date := v_date_text::date;
    v_filled_at := (v_date + v_time_text::time) at time zone 'Africa/Johannesburg';
  exception when others then
    raise exception 'invalid_filled_at';
  end;
  if v_date < date '2020-01-01' or v_date > v_today + 1 then
    raise exception 'filled_at_out_of_range';
  end if;

  v_litres := public.fuel_parse_numeric(p_fields->'litres', 'litres');
  if v_litres is null then
    raise exception 'litres_required';
  end if;
  if v_litres <= 0 or v_litres > 1000 then
    raise exception 'litres_out_of_range';
  end if;

  v_price := public.fuel_parse_numeric(p_fields->'unit_price', 'unit_price');
  if v_price is null and not v_legacy then
    raise exception 'unit_price_required';
  end if;
  if v_price is not null and (v_price <= 0 or v_price >= 100) then
    raise exception 'unit_price_out_of_range';
  end if;

  v_total := public.fuel_parse_numeric(p_fields->'total_amount', 'total_amount');
  if v_total is null and not v_legacy then
    raise exception 'total_amount_required';
  end if;
  if v_total is not null and (v_total < 0 or v_total >= 100000) then
    raise exception 'total_amount_out_of_range';
  end if;

  v_odo := public.fuel_parse_numeric(p_fields->'odometer_km', 'odometer_km');
  if v_odo is null then
    raise exception 'odometer_required';
  end if;
  if v_odo < 0 or v_odo > 2000000 then
    raise exception 'odometer_out_of_range';
  end if;

  v_fuel_type := lower(nullif(btrim(p_fields->>'fuel_type'), ''));
  if v_fuel_type is null and not v_legacy then
    raise exception 'fuel_type_required';
  end if;
  if v_fuel_type is not null and v_fuel_type not in ('ulp93', 'ulp95', 'diesel50', 'diesel500', 'other') then
    raise exception 'invalid_fuel_type';
  end if;

  v_vrn_status := lower(nullif(btrim(p_fields->>'slip_vrn_status'), ''));
  if v_vrn_status is null then
    if v_legacy then
      v_vrn_status := 'legacy';
    else
      raise exception 'vrn_action_required';
    end if;
  end if;
  if v_vrn_status not in ('confirmed_prefill', 'edited', 'not_shown', 'legacy')
     or (v_vrn_status = 'legacy' and not v_legacy) then
    raise exception 'vrn_action_required';
  end if;
  v_vrn := upper(nullif(btrim(p_fields->>'slip_vrn'), ''));
  if v_vrn_status in ('confirmed_prefill', 'edited') and v_vrn is null then
    raise exception 'slip_vrn_required';
  end if;
  if v_vrn_status = 'not_shown' then
    v_vrn := null;
  end if;
  if v_vrn is not null and char_length(v_vrn) > 12 then
    raise exception 'invalid_slip_vrn';
  end if;

  v_auth := upper(nullif(btrim(p_fields->>'authorisation_no'), ''));
  if v_auth is not null and char_length(v_auth) > 32 then
    raise exception 'invalid_authorisation_no';
  end if;

  v_order := upper(nullif(btrim(p_fields->>'order_no'), ''));
  if v_order is not null and char_length(v_order) > 32 then
    raise exception 'invalid_order_no';
  end if;

  v_pump := public.fuel_parse_numeric(p_fields->'pump_no', 'pump_no');
  if v_pump is not null and (v_pump <> trunc(v_pump) or v_pump < 0 or v_pump > 99) then
    raise exception 'invalid_pump_no';
  end if;

  v_station := nullif(btrim(p_fields->>'station_name'), '');
  if v_station is null and not v_legacy then
    raise exception 'station_name_required';
  end if;
  if v_station is not null and char_length(v_station) > 120 then
    raise exception 'invalid_station_name';
  end if;

  v_vat := nullif(regexp_replace(coalesce(p_fields->>'station_vat_no', ''), '[[:space:]]', '', 'g'), '');
  if v_vat is not null and v_vat !~ '^[0-9]{10}$' then
    raise exception 'invalid_station_vat_no';
  end if;

  v_slip := nullif(btrim(p_fields->>'slip_number'), '');
  if v_slip is not null and char_length(v_slip) > 32 then
    raise exception 'invalid_slip_number';
  end if;

  if p_fields ? 'is_full_tank' and jsonb_typeof(p_fields->'is_full_tank') <> 'null' then
    if jsonb_typeof(p_fields->'is_full_tank') = 'boolean' then
      v_full := (p_fields->'is_full_tank')::boolean;
    elsif lower(p_fields->>'is_full_tank') in ('true', 'false') then
      v_full := lower(p_fields->>'is_full_tank')::boolean;
    else
      raise exception 'invalid_is_full_tank';
    end if;
  end if;

  v_notes := nullif(btrim(p_fields->>'notes'), '');
  if v_notes is not null and char_length(v_notes) > 280 and not v_legacy then
    raise exception 'notes_too_long';
  end if;

  return jsonb_build_object(
    'filled_at', v_filled_at,
    'litres', round(v_litres, 2),
    'unit_price', round(v_price, 4),
    'total_amount', round(v_total, 2),
    'odometer_km', round(v_odo, 1),
    'fuel_type', v_fuel_type,
    'slip_vrn_status', v_vrn_status,
    'slip_vrn', v_vrn,
    'authorisation_no', v_auth,
    'order_no', v_order,
    'pump_no', v_pump::integer,
    'station_name', v_station,
    'station_vat_no', v_vat,
    'slip_number', v_slip,
    'is_full_tank', v_full,
    'notes', v_notes
  );
end;
$$;

-- Photo metadata from the upload route. Path is server generated (§6.5):
-- {organisation_id}/fillups/{yyyy}/{mm}/{fillup_id}/{photo_id}.{jpg|png|webp}
create or replace function public.fuel_slip_photo_input(p_org uuid, p_photo jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_path text;
  v_fillup uuid;
  v_photo uuid;
  v_ext text;
  v_mime text;
  v_size numeric;
  v_sha text;
  v_w numeric;
  v_h numeric;
begin
  if p_photo is null or jsonb_typeof(p_photo) <> 'object' then
    raise exception 'invalid_photo';
  end if;
  if coalesce(nullif(btrim(p_photo->>'bucket_id'), ''), 'fuel-slips') <> 'fuel-slips' then
    raise exception 'invalid_photo_bucket';
  end if;

  v_path := btrim(coalesce(p_photo->>'storage_path', ''));
  if v_path !~ ('^' || p_org::text
      || '/fillups/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'invalid_photo_path';
  end if;
  begin
    v_fillup := split_part(v_path, '/', 5)::uuid;
    v_photo := split_part(split_part(v_path, '/', 6), '.', 1)::uuid;
  exception when others then
    raise exception 'invalid_photo_path';
  end;
  if (p_photo ? 'fillup_id' and (p_photo->>'fillup_id')::uuid is distinct from v_fillup)
     or (p_photo ? 'photo_id' and (p_photo->>'photo_id')::uuid is distinct from v_photo) then
    raise exception 'invalid_photo_path';
  end if;

  v_mime := lower(btrim(coalesce(p_photo->>'mime_type', '')));
  v_ext := split_part(split_part(v_path, '/', 6), '.', 2);
  if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
     or (v_mime = 'image/jpeg' and v_ext <> 'jpg')
     or (v_mime = 'image/png' and v_ext <> 'png')
     or (v_mime = 'image/webp' and v_ext <> 'webp') then
    raise exception 'invalid_photo_mime';
  end if;

  v_size := public.fuel_parse_numeric(p_photo->'size_bytes', 'size_bytes');
  if v_size is null or v_size <= 0 or v_size <> trunc(v_size) then
    raise exception 'invalid_photo_size';
  end if;
  if v_size > 5242880 then
    raise exception 'photo_too_large';
  end if;

  v_sha := lower(btrim(coalesce(p_photo->>'sha256', '')));
  if v_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_photo_sha256';
  end if;

  v_w := public.fuel_parse_numeric(p_photo->'width_px', 'width_px');
  v_h := public.fuel_parse_numeric(p_photo->'height_px', 'height_px');
  if (v_w is not null and (v_w <= 0 or v_w <> trunc(v_w) or v_w > 20000))
     or (v_h is not null and (v_h <= 0 or v_h <> trunc(v_h) or v_h > 20000)) then
    raise exception 'invalid_photo_dimensions';
  end if;

  return jsonb_build_object(
    'fillup_id', v_fillup,
    'photo_id', v_photo,
    'storage_path', v_path,
    'mime_type', v_mime,
    'size_bytes', v_size::bigint,
    'sha256', v_sha,
    'width_px', v_w::integer,
    'height_px', v_h::integer
  );
end;
$$;

create or replace function public.fuel_refresh_flag_counts(p_fillup_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.fuel_fillups f
  set open_flag_count = coalesce(x.cnt, 0),
      max_open_severity = x.max_sev
  from (
    select
      count(*)::smallint as cnt,
      (array_agg(fl.severity order by public.fuel_severity_rank(fl.severity) desc))[1] as max_sev
    from public.fuel_entry_flags fl
    where fl.fillup_id = p_fillup_id and fl.status = 'open'
  ) x
  where f.id = p_fillup_id
    and (f.open_flag_count is distinct from coalesce(x.cnt, 0) or f.max_open_severity is distinct from x.max_sev);
$$;

create or replace function public.fuel_slip_result(p_fillup_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', f.id,
    'organisation_id', f.organisation_id,
    'entry_method', f.entry_method,
    'review_status', f.review_status,
    'client_entry_id', f.client_entry_id,
    'filled_at', f.filled_at,
    'litres', f.litres,
    'unit_price', f.unit_price,
    'total_amount', f.total_amount,
    'calculated_total', f.calculated_total,
    'open_flag_count', f.open_flag_count,
    'max_open_severity', f.max_open_severity,
    'updated_at', f.updated_at
  )
  from public.fuel_fillups f
  where f.id = p_fillup_id;
$$;

-- ---------------------------------------------------------------------------
-- evaluate_fuel_entry_flags (§4). Non-blocking; runs on submit, edit and photo replace.
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_fuel_entry_flags(
  p_fillup_id uuid,
  p_actor uuid default null,
  p_trigger text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.fuel_fillups%rowtype;
  v public.vehicles%rowtype;
  s public.fuel_settings%rowtype;
  v_flags jsonb := '[]'::jsonb;
  v_codes text[] := '{}';
  v_raised text[] := '{}';
  v_cleared text[] := '{}';
  v_new_high boolean := false;
  v_date date;
  v_ref timestamptz;
  v_calc numeric;
  v_diff numeric;
  v_tol numeric;
  v_km numeric;
  v_threshold numeric;
  v_seg_litres numeric;
  v_seg_count integer;
  v_l100 numeric;
  v_max_litres numeric;
  v_ids jsonb;
  v_hours numeric;
  v_near_id uuid;
  v_sha text;
  v_has_photo boolean;
  v_assigned boolean;
  prev record;
  latest record;
  prev_full record;
  d jsonb;
  r record;
  v_flag_id uuid;
  v_open_count integer;
  v_max_sev text;
begin
  select * into f from public.fuel_fillups where id = p_fillup_id;
  if not found then
    raise exception 'not_found';
  end if;

  select * into v from public.vehicles where id = f.vehicle_id;
  s := public.fuel_setting(f.organisation_id);
  v_date := (f.filled_at at time zone 'Africa/Johannesburg')::date;
  v_ref := coalesce(f.submitted_at, f.created_at);

  -- AMOUNT_MISMATCH
  if f.unit_price is not null and f.total_amount is not null then
    v_calc := round(f.litres * f.unit_price, 2);
    v_diff := abs(v_calc - f.total_amount);
    v_tol := greatest(s.amount_tol_abs, round(f.total_amount * s.amount_tol_pct / 100, 2));
    if v_diff > v_tol then
      v_flags := v_flags || jsonb_build_object(
        'code', 'AMOUNT_MISMATCH',
        'severity', case when f.total_amount > 0 and v_diff / f.total_amount * 100 > 5 then 'high' else 'medium' end,
        'message', 'Litres x price does not match the typed slip total.',
        'details', jsonb_build_object(
          'litres', f.litres, 'unit_price', f.unit_price,
          'calculated_total', v_calc, 'typed_total', f.total_amount, 'diff', v_diff,
          'tol_abs', s.amount_tol_abs, 'tol_pct', s.amount_tol_pct, 'tol_applied', v_tol,
          'high_above_pct', 5
        )
      );
    end if;
  end if;

  -- Previous live fill for the vehicle (by filled_at, ignoring rejected/voided).
  select o.id, o.filled_at, o.odometer_km into prev
  from public.fuel_fillups o
  where o.vehicle_id = f.vehicle_id
    and o.id <> f.id
    and o.deleted_at is null
    and o.review_status not in ('rejected', 'voided')
    and (o.filled_at < f.filled_at or (o.filled_at = f.filled_at and o.created_at < f.created_at))
  order by o.filled_at desc, o.created_at desc
  limit 1;

  if prev.id is not null then
    -- ODO_REGRESSION
    if f.odometer_km < prev.odometer_km then
      v_flags := v_flags || jsonb_build_object(
        'code', 'ODO_REGRESSION', 'severity', 'high',
        'message', 'Odometer is lower than the previous reading for this vehicle.',
        'details', jsonb_build_object(
          'odometer_km', f.odometer_km, 'previous_odometer_km', prev.odometer_km,
          'previous_fillup_id', prev.id, 'previous_filled_at', prev.filled_at
        )
      );
    end if;

    -- ODO_JUMP
    v_km := f.odometer_km - prev.odometer_km;
    v_threshold := case
      when v.tank_capacity_litres is not null then round(v.tank_capacity_litres / 5 * 100 * 1.2, 1)
      else s.max_km_between_fills
    end;
    if v_km > v_threshold then
      v_flags := v_flags || jsonb_build_object(
        'code', 'ODO_JUMP', 'severity', 'medium',
        'message', 'Distance since the last fill is unusually high.',
        'details', jsonb_build_object(
          'km_since_last_fill', v_km, 'threshold_km', v_threshold,
          'tank_capacity_litres', v.tank_capacity_litres,
          'assumed_l_per_100km', 5, 'factor', 1.2,
          'max_km_between_fills', s.max_km_between_fills,
          'odometer_km', f.odometer_km, 'previous_odometer_km', prev.odometer_km,
          'previous_fillup_id', prev.id
        )
      );
    end if;
  end if;

  -- CONSUMPTION_OUTLIER (full tank -> full tank; partial fills roll into the segment)
  if f.is_full_tank then
    select o.id, o.filled_at, o.odometer_km into prev_full
    from public.fuel_fillups o
    where o.vehicle_id = f.vehicle_id
      and o.id <> f.id
      and o.deleted_at is null
      and o.review_status not in ('rejected', 'voided')
      and o.is_full_tank
      and (o.filled_at < f.filled_at or (o.filled_at = f.filled_at and o.created_at < f.created_at))
    order by o.filled_at desc, o.created_at desc
    limit 1;

    if prev_full.id is not null and f.odometer_km > prev_full.odometer_km then
      select coalesce(sum(o.litres), 0), count(*) into v_seg_litres, v_seg_count
      from public.fuel_fillups o
      where o.vehicle_id = f.vehicle_id
        and o.deleted_at is null
        and o.review_status not in ('rejected', 'voided')
        and o.filled_at > prev_full.filled_at
        and (o.filled_at < f.filled_at or o.id = f.id);
      v_km := f.odometer_km - prev_full.odometer_km;
      v_l100 := round(v_seg_litres / v_km * 100, 2);
      if v_l100 < s.consumption_min or v_l100 > s.consumption_max then
        v_flags := v_flags || jsonb_build_object(
          'code', 'CONSUMPTION_OUTLIER', 'severity', 'medium',
          'message', 'Fuel consumption (L/100km) is outside the expected range.',
          'details', jsonb_build_object(
            'l_per_100km', v_l100, 'segment_litres', v_seg_litres, 'segment_km', v_km,
            'fills_in_segment', v_seg_count, 'previous_full_fillup_id', prev_full.id,
            'consumption_min', s.consumption_min, 'consumption_max', s.consumption_max
          )
        );
      end if;
    end if;
  end if;

  -- VRN_MISMATCH / VRN_NOT_SHOWN
  if f.slip_vrn_status in ('confirmed_prefill', 'edited')
     and f.slip_vrn_normalised is distinct from f.vehicle_vrn_snapshot then
    v_flags := v_flags || jsonb_build_object(
      'code', 'VRN_MISMATCH', 'severity', 'high',
      'message', 'VRN on the slip does not match the selected vehicle.',
      'details', jsonb_build_object(
        'slip_vrn', f.slip_vrn, 'slip_vrn_normalised', f.slip_vrn_normalised,
        'vehicle_vrn_snapshot', f.vehicle_vrn_snapshot, 'slip_vrn_status', f.slip_vrn_status,
        'vehicle_id', f.vehicle_id
      )
    );
  elsif f.slip_vrn_status = 'not_shown' then
    v_flags := v_flags || jsonb_build_object(
      'code', 'VRN_NOT_SHOWN', 'severity', 'low',
      'message', 'Driver reported that the VRN is not shown on the slip.',
      'details', jsonb_build_object(
        'slip_vrn_status', f.slip_vrn_status, 'vehicle_vrn_snapshot', f.vehicle_vrn_snapshot,
        'vehicle_id', f.vehicle_id
      )
    );
  end if;

  -- DUP_SLIP
  if f.station_vat_no is not null and f.slip_number is not null then
    select jsonb_agg(o.id order by o.filled_at) into v_ids
    from public.fuel_fillups o
    where o.organisation_id = f.organisation_id
      and o.id <> f.id
      and o.deleted_at is null
      and o.review_status not in ('rejected', 'voided')
      and o.station_vat_no = f.station_vat_no
      and o.slip_number = f.slip_number
      and (o.filled_at at time zone 'Africa/Johannesburg')::date = v_date;
    if v_ids is not null then
      v_flags := v_flags || jsonb_build_object(
        'code', 'DUP_SLIP', 'severity', 'high',
        'message', 'Another entry has the same station VAT no., slip no. and date.',
        'details', jsonb_build_object(
          'station_vat_no', f.station_vat_no, 'slip_number', f.slip_number,
          'date', v_date, 'matching_fillup_ids', v_ids
        )
      );
    end if;
  end if;

  -- DUP_AUTH (informational; no uniqueness constraint on authorisation_no)
  if f.authorisation_no is not null then
    select jsonb_agg(o.id order by o.filled_at) into v_ids
    from public.fuel_fillups o
    where o.organisation_id = f.organisation_id
      and o.id <> f.id
      and o.deleted_at is null
      and o.review_status not in ('rejected', 'voided')
      and o.authorisation_no = f.authorisation_no
      and o.filled_at between f.filled_at - make_interval(days => s.dup_auth_window_days)
                          and f.filled_at + make_interval(days => s.dup_auth_window_days);
    if v_ids is not null then
      v_flags := v_flags || jsonb_build_object(
        'code', 'DUP_AUTH', 'severity', s.dup_auth_severity,
        'message', 'Possible duplicate authorisation reference; may be reusable depending on station/card system.',
        'details', jsonb_build_object(
          'authorisation_no', f.authorisation_no, 'window_days', s.dup_auth_window_days,
          'severity_setting', s.dup_auth_severity, 'filled_at', f.filled_at,
          'matching_fillup_ids', v_ids
        )
      );
    end if;
  end if;

  -- Current photo
  select p.sha256 into v_sha
  from public.fuel_slip_photos p
  where p.fillup_id = f.id and p.is_current
  limit 1;
  v_has_photo := found;

  -- DUP_PHOTO
  if v_sha is not null then
    select jsonb_agg(distinct p.fillup_id) into v_ids
    from public.fuel_slip_photos p
    where p.organisation_id = f.organisation_id
      and p.sha256 = v_sha
      and p.fillup_id <> f.id;
    if v_ids is not null then
      v_flags := v_flags || jsonb_build_object(
        'code', 'DUP_PHOTO', 'severity', 'high',
        'message', 'The same photo is attached to another entry.',
        'details', jsonb_build_object('sha256', v_sha, 'matching_fillup_ids', v_ids)
      );
    end if;
  end if;

  -- OVER_TANK / TANK_UNKNOWN
  if v.tank_capacity_litres is null then
    v_flags := v_flags || jsonb_build_object(
      'code', 'TANK_UNKNOWN', 'severity', 'low',
      'message', 'Vehicle tank capacity is not set.',
      'details', jsonb_build_object('vehicle_id', f.vehicle_id, 'tank_capacity_litres', null, 'litres', f.litres)
    );
  else
    v_max_litres := round(v.tank_capacity_litres * (1 + s.tank_tol_pct / 100), 2);
    if f.litres > v_max_litres then
      v_flags := v_flags || jsonb_build_object(
        'code', 'OVER_TANK', 'severity', 'high',
        'message', 'Litres exceed the vehicle tank capacity.',
        'details', jsonb_build_object(
          'litres', f.litres, 'tank_capacity_litres', v.tank_capacity_litres,
          'tank_tol_pct', s.tank_tol_pct, 'max_litres', v_max_litres
        )
      );
    end if;
  end if;

  -- PRICE_RANGE
  if f.unit_price is not null and (f.unit_price < s.price_min or f.unit_price > s.price_max) then
    v_flags := v_flags || jsonb_build_object(
      'code', 'PRICE_RANGE', 'severity', 'medium',
      'message', 'Price per litre is outside the expected range.',
      'details', jsonb_build_object('unit_price', f.unit_price, 'price_min', s.price_min, 'price_max', s.price_max)
    );
  end if;

  -- TOO_SOON
  select o.id, abs(extract(epoch from (o.filled_at - f.filled_at))) / 3600.0
    into v_near_id, v_hours
  from public.fuel_fillups o
  where o.vehicle_id = f.vehicle_id
    and o.id <> f.id
    and o.deleted_at is null
    and o.review_status not in ('rejected', 'voided')
  order by abs(extract(epoch from (o.filled_at - f.filled_at)))
  limit 1;
  if v_near_id is not null and v_hours < s.min_hours_between_fills then
    v_flags := v_flags || jsonb_build_object(
      'code', 'TOO_SOON', 'severity', 'medium',
      'message', 'Another fill for this vehicle is recorded within a short time.',
      'details', jsonb_build_object(
        'hours_apart', round(v_hours, 2), 'min_hours_between_fills', s.min_hours_between_fills,
        'nearest_fillup_id', v_near_id
      )
    );
  end if;

  -- FUEL_TYPE_MISMATCH (petrol/diesel family)
  if public.fuel_fuel_family(f.fuel_type) in ('petrol', 'diesel')
     and public.fuel_fuel_family(v.default_fuel_type) in ('petrol', 'diesel')
     and public.fuel_fuel_family(f.fuel_type) <> public.fuel_fuel_family(v.default_fuel_type) then
    v_flags := v_flags || jsonb_build_object(
      'code', 'FUEL_TYPE_MISMATCH', 'severity', 'medium',
      'message', 'Fuel type does not match the vehicle default fuel type.',
      'details', jsonb_build_object(
        'fuel_type', f.fuel_type, 'fuel_family', public.fuel_fuel_family(f.fuel_type),
        'vehicle_default_fuel_type', v.default_fuel_type,
        'vehicle_fuel_family', public.fuel_fuel_family(v.default_fuel_type)
      )
    );
  end if;

  -- VEHICLE_NOT_ASSIGNED (driver entries only)
  if f.entry_method = 'driver_photo' and f.driver_id is not null then
    v_assigned := exists (
      select 1 from public.driver_vehicle_assignments a
      where a.driver_id = f.driver_id
        and a.vehicle_id = f.vehicle_id
        and a.deleted_at is null
        and a.starts_on <= v_date
        and (a.ends_on is null or a.ends_on >= v_date)
    ) or exists (
      select 1
      from public.trip_assignments ta
      join public.trips t on t.id = ta.trip_id and t.deleted_at is null
      where ta.driver_id = f.driver_id
        and ta.vehicle_id = f.vehicle_id
        and ta.deleted_at is null
        and (t.planned_start at time zone 'Africa/Johannesburg')::date = v_date
    );
    if not v_assigned then
      v_flags := v_flags || jsonb_build_object(
        'code', 'VEHICLE_NOT_ASSIGNED', 'severity', 'medium',
        'message', 'Driver has no assignment or trip for this vehicle on this date.',
        'details', jsonb_build_object(
          'driver_id', f.driver_id, 'vehicle_id', f.vehicle_id, 'date', v_date,
          'checked', jsonb_build_array('driver_vehicle_assignments', 'trip_assignments')
        )
      );
    end if;
  end if;

  -- DATE_FUTURE / DATE_OLD (relative to submission time)
  if f.filled_at > v_ref + make_interval(mins => s.future_tol_minutes) then
    v_flags := v_flags || jsonb_build_object(
      'code', 'DATE_FUTURE', 'severity', 'high',
      'message', 'Fill date is in the future.',
      'details', jsonb_build_object(
        'filled_at', f.filled_at, 'reference_at', v_ref, 'future_tol_minutes', s.future_tol_minutes
      )
    );
  elsif f.filled_at < v_ref - make_interval(days => s.max_age_days) then
    v_flags := v_flags || jsonb_build_object(
      'code', 'DATE_OLD', 'severity', 'medium',
      'message', 'Fill date is older than the allowed age. Check the slip date format (YY/MM/DD).',
      'details', jsonb_build_object(
        'filled_at', f.filled_at, 'reference_at', v_ref, 'max_age_days', s.max_age_days
      )
    );
  end if;

  -- DATE_BEFORE_PREVIOUS: dated before the vehicle's latest fill but odometer is higher.
  select o.id, o.filled_at, o.odometer_km into latest
  from public.fuel_fillups o
  where o.vehicle_id = f.vehicle_id
    and o.id <> f.id
    and o.deleted_at is null
    and o.review_status not in ('rejected', 'voided')
  order by o.filled_at desc, o.created_at desc
  limit 1;
  if latest.id is not null and f.filled_at < latest.filled_at and f.odometer_km > latest.odometer_km then
    v_flags := v_flags || jsonb_build_object(
      'code', 'DATE_BEFORE_PREVIOUS', 'severity', 'low',
      'message', 'Entry is dated before the latest fill but has a higher odometer.',
      'details', jsonb_build_object(
        'filled_at', f.filled_at, 'odometer_km', f.odometer_km,
        'latest_fillup_id', latest.id, 'latest_filled_at', latest.filled_at,
        'latest_odometer_km', latest.odometer_km
      )
    );
  end if;

  -- STATION_VAT_FORMAT
  if f.station_vat_no is not null and f.station_vat_no !~ '^4[0-9]{9}$' then
    v_flags := v_flags || jsonb_build_object(
      'code', 'STATION_VAT_FORMAT', 'severity', 'low',
      'message', 'Station VAT no. does not look like a South African VAT number.',
      'details', jsonb_build_object('station_vat_no', f.station_vat_no, 'pattern', '^4\d{9}$')
    );
  end if;

  -- NO_PHOTO_ADMIN
  if f.entry_method = 'admin_manual' and not v_has_photo then
    v_flags := v_flags || jsonb_build_object(
      'code', 'NO_PHOTO_ADMIN', 'severity', 'info',
      'message', 'Admin manual entry without a slip photo.',
      'details', jsonb_build_object('entry_method', f.entry_method, 'has_photo', false)
    );
  end if;

  select coalesce(array_agg(x->>'code'), '{}') into v_codes from jsonb_array_elements(v_flags) x;

  -- Close flags that no longer apply. EDITED_AFTER_QUERY is raised by update_fuel_slip only.
  for r in
    select fl.id, fl.code
    from public.fuel_entry_flags fl
    where fl.fillup_id = f.id
      and fl.status = 'open'
      and fl.code <> 'EDITED_AFTER_QUERY'
      and not (fl.code = any (v_codes))
  loop
    update public.fuel_entry_flags
    set status = 'cleared_by_edit',
        resolved_at = timezone('utc', now()),
        resolved_by = p_actor,
        resolution_note = 'No longer applies after re-evaluation'
    where id = r.id;
    v_cleared := v_cleared || r.code;
  end loop;

  for d in select value from jsonb_array_elements(v_flags)
  loop
    update public.fuel_entry_flags
    set severity = d->>'severity', message = d->>'message', details = d->'details'
    where fillup_id = f.id and code = d->>'code' and status = 'open'
    returning id into v_flag_id;

    if v_flag_id is null then
      -- An admin already accepted/dismissed this exact finding: do not re-raise it.
      if not exists (
        select 1 from public.fuel_entry_flags fl
        where fl.fillup_id = f.id
          and fl.code = d->>'code'
          and fl.status in ('accepted', 'dismissed')
          and fl.details = d->'details'
      ) then
        insert into public.fuel_entry_flags (organisation_id, fillup_id, code, severity, message, details)
        values (f.organisation_id, f.id, d->>'code', d->>'severity', d->>'message', d->'details');
        v_raised := v_raised || (d->>'code');
        if d->>'severity' = 'high' then
          v_new_high := true;
        end if;
      end if;
    end if;
    v_flag_id := null;
  end loop;

  perform public.fuel_refresh_flag_counts(f.id);
  select open_flag_count, max_open_severity into v_open_count, v_max_sev
  from public.fuel_fillups where id = f.id;

  if v_new_high then
    insert into public.admin_inbox_notifications (
      organisation_id, recipient_user_id, notification_type, title, body, link_path, subject_kind, subject_id
    )
    select
      f.organisation_id, om.user_id, 'fuel_slip_high_flag',
      'Fuel slip needs review',
      'A fuel slip has a high-severity flag and is waiting for review.',
      '/fuel/review/' || f.id::text, 'fuel_fillup', f.id
    from public.organisation_members om
    where om.organisation_id = f.organisation_id
      and om.role::text = 'organisation_admin'
      and om.status = 'active'
      and om.deleted_at is null
      and not exists (
        select 1 from public.admin_inbox_notifications n
        where n.recipient_user_id = om.user_id
          and n.subject_id = f.id
          and n.notification_type = 'fuel_slip_high_flag'
          and n.read_at is null
      );
  end if;

  perform public.write_audit_log(
    f.organisation_id,
    'fuel_slip.flags_evaluated',
    'fuel_fillup',
    f.id,
    jsonb_build_object(
      'trigger', p_trigger,
      'raised', to_jsonb(v_raised),
      'cleared_by_edit', to_jsonb(v_cleared),
      'open_flag_count', v_open_count,
      'max_open_severity', v_max_sev
    ),
    p_actor
  );

  return jsonb_build_object(
    'raised', to_jsonb(v_raised),
    'cleared_by_edit', to_jsonb(v_cleared),
    'open_flag_count', v_open_count,
    'max_open_severity', v_max_sev
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_fuel_slip (§6.6). entry_method is set from the actor role, never by the client.
-- ---------------------------------------------------------------------------

create or replace function public.submit_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_client_entry_id uuid,
  p_vehicle_id uuid,
  p_fields jsonb,
  p_photo jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_entry_method text;
  v_driver_id uuid;
  v_existing public.fuel_fillups%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_settings public.fuel_settings%rowtype;
  v_fields jsonb;
  v_n jsonb;
  v_photo jsonb;
  v_id uuid;
  v_key text;
  v_filled_at timestamptz;
  v_allowed text[] := array[
    'filled_date', 'filled_time', 'litres', 'unit_price', 'total_amount', 'fuel_type',
    'slip_vrn', 'slip_vrn_status', 'odometer_km', 'authorisation_no', 'order_no', 'pump_no',
    'station_name', 'station_vat_no', 'slip_number', 'is_full_tank', 'notes', 'driver_id'
  ];
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role in ('platform_owner', 'organisation_admin') then
    v_entry_method := 'admin_manual';
  elsif v_role = 'driver' then
    v_driver_id := public.fuel_actor_driver_id(p_actor, p_org);
    if v_driver_id is null then
      raise exception 'not_authorised';
    end if;
    v_entry_method := 'driver_photo';
  else
    raise exception 'not_authorised';
  end if;

  v_fields := coalesce(p_fields, '{}'::jsonb);
  if jsonb_typeof(v_fields) <> 'object' then
    raise exception 'invalid_fields';
  end if;
  if v_fields ? 'entry_method' then
    raise exception 'entry_method_forbidden';
  end if;
  for v_key in select jsonb_object_keys(v_fields)
  loop
    if not (v_key = any (v_allowed)) or (v_key = 'driver_id' and v_entry_method <> 'admin_manual') then
      raise exception 'field_not_allowed:%', v_key;
    end if;
  end loop;

  -- Idempotent retry (§2.6)
  if p_client_entry_id is not null then
    perform pg_advisory_xact_lock(hashtext('fuel_slip:' || p_org::text), hashtext(p_client_entry_id::text));
    select * into v_existing
    from public.fuel_fillups
    where organisation_id = p_org and client_entry_id = p_client_entry_id;
    if found then
      if v_existing.created_by is distinct from p_actor then
        raise exception 'client_entry_conflict';
      end if;
      -- A retried upload may have produced a second object; queue it if unused.
      if p_photo is not null and jsonb_typeof(p_photo) = 'object'
         and btrim(coalesce(p_photo->>'storage_path', '')) like p_org::text || '/fillups/%'
         and not exists (
           select 1 from public.fuel_slip_photos ph where ph.storage_path = btrim(p_photo->>'storage_path')
         ) then
        perform public.enqueue_compliance_storage_purge(
          'fuel-slips', btrim(p_photo->>'storage_path'), p_org, null, 'fuel_orphan'
        );
      end if;
      return public.fuel_slip_result(v_existing.id) || jsonb_build_object('replayed', true);
    end if;
  end if;

  if v_entry_method = 'driver_photo' and (p_photo is null or jsonb_typeof(p_photo) = 'null') then
    raise exception 'photo_required';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and organisation_id = p_org and deleted_at is null;
  if not found then
    raise exception 'vehicle_not_found';
  end if;

  if v_entry_method = 'admin_manual' and nullif(btrim(v_fields->>'driver_id'), '') is not null then
    select d.id into v_driver_id
    from public.drivers d
    where d.id = (v_fields->>'driver_id')::uuid and d.organisation_id = p_org and d.deleted_at is null;
    if v_driver_id is null then
      raise exception 'driver_not_found';
    end if;
  end if;

  v_n := public.fuel_slip_normalise_fields(v_fields - 'driver_id', v_entry_method);
  v_filled_at := (v_n->>'filled_at')::timestamptz;

  if p_photo is not null and jsonb_typeof(p_photo) <> 'null' then
    v_photo := public.fuel_slip_photo_input(p_org, p_photo);
    v_id := (v_photo->>'fillup_id')::uuid;
  else
    v_id := gen_random_uuid();
  end if;

  v_settings := public.fuel_setting(p_org);

  insert into public.fuel_fillups (
    id, organisation_id, vehicle_id, driver_id, company_id, filled_at, odometer_km, litres,
    unit_price, total_amount, calculated_total, currency, station_name, notes, created_by,
    entry_method, field_sources, client_entry_id, review_status, fuel_type,
    slip_vrn, slip_vrn_status, vehicle_vrn_snapshot, authorisation_no, order_no, pump_no,
    station_vat_no, slip_number, is_full_tank, submitted_at, retain_until
  ) values (
    v_id, p_org, v_vehicle.id, v_driver_id, v_vehicle.company_id, v_filled_at,
    (v_n->>'odometer_km')::numeric, (v_n->>'litres')::numeric,
    (v_n->>'unit_price')::numeric, (v_n->>'total_amount')::numeric,
    round((v_n->>'litres')::numeric * (v_n->>'unit_price')::numeric, 2),
    'ZAR', v_n->>'station_name', v_n->>'notes', p_actor,
    v_entry_method, '{}'::jsonb, p_client_entry_id, 'pending_review', v_n->>'fuel_type',
    v_n->>'slip_vrn', v_n->>'slip_vrn_status', public.fuel_normalise_vrn(v_vehicle.registration_number),
    v_n->>'authorisation_no', v_n->>'order_no', (v_n->>'pump_no')::smallint,
    v_n->>'station_vat_no', v_n->>'slip_number', (v_n->>'is_full_tank')::boolean,
    timezone('utc', now()),
    case when v_settings.retention_months is not null
      then ((v_filled_at at time zone 'Africa/Johannesburg')::date
            + make_interval(months => v_settings.retention_months))::date
    end
  );

  if v_photo is not null then
    insert into public.fuel_slip_photos (
      id, organisation_id, fillup_id, bucket_id, storage_path, mime_type, size_bytes,
      width_px, height_px, sha256, is_current, uploaded_by
    ) values (
      (v_photo->>'photo_id')::uuid, p_org, v_id, 'fuel-slips', v_photo->>'storage_path',
      v_photo->>'mime_type', (v_photo->>'size_bytes')::integer,
      (v_photo->>'width_px')::integer, (v_photo->>'height_px')::integer,
      v_photo->>'sha256', true, p_actor
    );

    perform public.write_audit_log(
      p_org, 'fuel_slip.photo_uploaded', 'fuel_fillup', v_id,
      jsonb_build_object(
        'photo_id', v_photo->>'photo_id',
        'path_sha256', public.fuel_path_sha256(v_photo->>'storage_path'),
        'sha256', v_photo->>'sha256',
        'size_bytes', (v_photo->>'size_bytes')::integer,
        'mime_type', v_photo->>'mime_type'
      ),
      p_actor
    );
  end if;

  perform public.write_audit_log(
    p_org, 'fuel_slip.submitted', 'fuel_fillup', v_id,
    jsonb_build_object(
      'entry_method', v_entry_method,
      'actor_role', v_role,
      'client_entry_id', p_client_entry_id,
      'vehicle_id', v_vehicle.id,
      'driver_id', v_driver_id,
      'has_photo', v_photo is not null
    ),
    p_actor
  );

  if v_entry_method = 'admin_manual' then
    perform public.write_audit_log(
      p_org, 'fuel_slip.admin_backcaptured', 'fuel_fillup', v_id,
      jsonb_build_object(
        'entry_method', v_entry_method,
        'actor_role', v_role,
        'driver_id', v_driver_id,
        'has_photo', v_photo is not null
      ),
      p_actor
    );
  end if;

  perform public.evaluate_fuel_entry_flags(v_id, p_actor, 'submit');

  return public.fuel_slip_result(v_id) || jsonb_build_object('replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_fuel_slip (§6.6). Recomputes calculated_total, never total_amount.
-- ---------------------------------------------------------------------------

create or replace function public.update_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_fields jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_admin boolean;
  v_actor_driver uuid;
  f public.fuel_fillups%rowtype;
  n public.fuel_fillups%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_fields jsonb;
  v_base jsonb;
  v_n jsonb;
  v_key text;
  v_changes jsonb := '{}'::jsonb;
  v_query_changes jsonb := '{}'::jsonb;
  v_col text;
  v_old jsonb;
  v_new jsonb;
  v_allowed text[] := array[
    'filled_date', 'filled_time', 'litres', 'unit_price', 'total_amount', 'fuel_type',
    'slip_vrn', 'slip_vrn_status', 'odometer_km', 'authorisation_no', 'order_no', 'pump_no',
    'station_name', 'station_vat_no', 'slip_number', 'is_full_tank', 'notes', 'vehicle_id', 'driver_id'
  ];
  v_resubmit boolean := false;
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  v_is_admin := v_role in ('platform_owner', 'organisation_admin');
  if not v_is_admin then
    if v_role <> 'driver' then
      raise exception 'not_authorised';
    end if;
    v_actor_driver := public.fuel_actor_driver_id(p_actor, p_org);
    if v_actor_driver is null then
      raise exception 'not_authorised';
    end if;
  end if;

  select * into f
  from public.fuel_fillups
  where id = p_id and organisation_id = p_org and deleted_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;

  if not v_is_admin and f.driver_id is distinct from v_actor_driver then
    raise exception 'not_authorised';
  end if;
  if v_is_admin and f.review_status in ('approved', 'voided') then
    raise exception 'not_editable';
  end if;
  if not v_is_admin and f.review_status not in ('pending_review', 'queried') then
    raise exception 'not_editable';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected_updated_at_required';
  end if;
  if f.updated_at <> p_expected_updated_at then
    raise exception 'stale_update';
  end if;

  v_fields := coalesce(p_fields, '{}'::jsonb);
  if jsonb_typeof(v_fields) <> 'object' then
    raise exception 'invalid_fields';
  end if;
  if v_fields ? 'entry_method' then
    raise exception 'entry_method_forbidden';
  end if;
  for v_key in select jsonb_object_keys(v_fields)
  loop
    if not (v_key = any (v_allowed)) or (v_key = 'driver_id' and not v_is_admin) then
      raise exception 'field_not_allowed:%', v_key;
    end if;
  end loop;

  v_base := jsonb_build_object(
    'filled_date', to_char(f.filled_at at time zone 'Africa/Johannesburg', 'YYYY-MM-DD'),
    'filled_time', to_char(f.filled_at at time zone 'Africa/Johannesburg', 'HH24:MI:SS'),
    'litres', f.litres,
    'unit_price', f.unit_price,
    'total_amount', f.total_amount,
    'odometer_km', f.odometer_km,
    'fuel_type', f.fuel_type,
    'slip_vrn_status', f.slip_vrn_status,
    'slip_vrn', f.slip_vrn,
    'authorisation_no', f.authorisation_no,
    'order_no', f.order_no,
    'pump_no', f.pump_no,
    'station_name', f.station_name,
    'station_vat_no', f.station_vat_no,
    'slip_number', f.slip_number,
    'is_full_tank', f.is_full_tank,
    'notes', f.notes
  );
  if v_fields ? 'slip_vrn' and not v_fields ? 'slip_vrn_status' then
    v_fields := v_fields || jsonb_build_object('slip_vrn_status', 'edited');
  end if;

  v_n := public.fuel_slip_normalise_fields(
    v_base || (v_fields - 'vehicle_id' - 'driver_id'), f.entry_method
  );

  n := f;
  if v_fields ? 'vehicle_id' and (v_fields->>'vehicle_id')::uuid is distinct from f.vehicle_id then
    select * into v_vehicle
    from public.vehicles
    where id = (v_fields->>'vehicle_id')::uuid and organisation_id = p_org and deleted_at is null;
    if not found then
      raise exception 'vehicle_not_found';
    end if;
    n.vehicle_id := v_vehicle.id;
    n.company_id := v_vehicle.company_id;
    n.vehicle_vrn_snapshot := public.fuel_normalise_vrn(v_vehicle.registration_number);
  end if;
  if v_fields ? 'driver_id' then
    if nullif(btrim(v_fields->>'driver_id'), '') is null then
      n.driver_id := null;
    else
      select d.id into n.driver_id
      from public.drivers d
      where d.id = (v_fields->>'driver_id')::uuid and d.organisation_id = p_org and d.deleted_at is null;
      if n.driver_id is null then
        raise exception 'driver_not_found';
      end if;
    end if;
  end if;

  n.filled_at := (v_n->>'filled_at')::timestamptz;
  n.litres := (v_n->>'litres')::numeric;
  n.unit_price := (v_n->>'unit_price')::numeric;
  n.total_amount := (v_n->>'total_amount')::numeric;
  n.odometer_km := (v_n->>'odometer_km')::numeric;
  n.fuel_type := v_n->>'fuel_type';
  n.slip_vrn_status := v_n->>'slip_vrn_status';
  n.slip_vrn := v_n->>'slip_vrn';
  n.authorisation_no := v_n->>'authorisation_no';
  n.order_no := v_n->>'order_no';
  n.pump_no := (v_n->>'pump_no')::smallint;
  n.station_name := v_n->>'station_name';
  n.station_vat_no := v_n->>'station_vat_no';
  n.slip_number := v_n->>'slip_number';
  n.is_full_tank := (v_n->>'is_full_tank')::boolean;
  n.notes := v_n->>'notes';
  n.calculated_total := case
    when n.unit_price is not null then round(n.litres * n.unit_price, 2)
    else null
  end;

  foreach v_col in array array[
    'vehicle_id', 'driver_id', 'company_id', 'filled_at', 'litres', 'unit_price', 'total_amount',
    'calculated_total', 'odometer_km', 'fuel_type', 'slip_vrn_status', 'slip_vrn', 'vehicle_vrn_snapshot',
    'authorisation_no', 'order_no', 'pump_no', 'station_name', 'station_vat_no', 'slip_number',
    'is_full_tank', 'notes'
  ]
  loop
    v_old := to_jsonb(f) -> v_col;
    v_new := to_jsonb(n) -> v_col;
    if v_old is distinct from v_new then
      v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('before', v_old, 'after', v_new));
      if v_col in ('litres', 'unit_price', 'total_amount', 'odometer_km', 'slip_vrn', 'slip_vrn_status') then
        v_query_changes := v_query_changes
          || jsonb_build_object(v_col, jsonb_build_object('before', v_old, 'after', v_new));
      end if;
    end if;
  end loop;

  v_resubmit := not v_is_admin and f.review_status = 'queried';

  update public.fuel_fillups
  set vehicle_id = n.vehicle_id,
      driver_id = n.driver_id,
      company_id = n.company_id,
      vehicle_vrn_snapshot = n.vehicle_vrn_snapshot,
      filled_at = n.filled_at,
      litres = n.litres,
      unit_price = n.unit_price,
      total_amount = n.total_amount,
      calculated_total = n.calculated_total,
      odometer_km = n.odometer_km,
      fuel_type = n.fuel_type,
      slip_vrn_status = n.slip_vrn_status,
      slip_vrn = n.slip_vrn,
      authorisation_no = n.authorisation_no,
      order_no = n.order_no,
      pump_no = n.pump_no,
      station_name = n.station_name,
      station_vat_no = n.station_vat_no,
      slip_number = n.slip_number,
      is_full_tank = n.is_full_tank,
      notes = n.notes,
      review_status = case when v_resubmit then 'pending_review' else review_status end,
      retain_until = case
        when n.filled_at is distinct from f.filled_at and retain_until is not null
          then ((n.filled_at at time zone 'Africa/Johannesburg')::date
                + make_interval(months => (public.fuel_setting(p_org)).retention_months))::date
        else retain_until
      end
  where id = f.id;

  perform public.write_audit_log(
    p_org, 'fuel_slip.updated', 'fuel_fillup', f.id,
    jsonb_build_object('actor_role', v_role, 'review_status', f.review_status, 'changes', v_changes),
    p_actor
  );

  if v_resubmit then
    if v_query_changes <> '{}'::jsonb then
      update public.fuel_entry_flags
      set details = jsonb_build_object('changes', coalesce(details->'changes', '{}'::jsonb) || v_query_changes)
      where fillup_id = f.id and code = 'EDITED_AFTER_QUERY' and status = 'open';
      if not found then
        insert into public.fuel_entry_flags (organisation_id, fillup_id, code, severity, message, details)
        values (
          p_org, f.id, 'EDITED_AFTER_QUERY', 'info',
          'Driver changed amounts, odometer or VRN after an admin query.',
          jsonb_build_object('changes', v_query_changes)
        );
      end if;
    end if;

    perform public.write_audit_log(
      p_org, 'fuel_slip.resubmitted', 'fuel_fillup', f.id,
      jsonb_build_object('via', 'update', 'changed_fields', to_jsonb(array(select jsonb_object_keys(v_changes)))),
      p_actor
    );
  end if;

  perform public.evaluate_fuel_entry_flags(f.id, p_actor, 'update');

  return public.fuel_slip_result(f.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- replace_fuel_slip_photo (§6.6). Old photo is kept with is_current = false.
-- ---------------------------------------------------------------------------

create or replace function public.replace_fuel_slip_photo(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_photo jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_admin boolean;
  v_actor_driver uuid;
  f public.fuel_fillups%rowtype;
  v_photo jsonb;
  v_old public.fuel_slip_photos%rowtype;
  v_resubmit boolean;
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  v_is_admin := v_role in ('platform_owner', 'organisation_admin');
  if not v_is_admin then
    if v_role <> 'driver' then
      raise exception 'not_authorised';
    end if;
    v_actor_driver := public.fuel_actor_driver_id(p_actor, p_org);
    if v_actor_driver is null then
      raise exception 'not_authorised';
    end if;
  end if;

  select * into f
  from public.fuel_fillups
  where id = p_id and organisation_id = p_org and deleted_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if not v_is_admin and f.driver_id is distinct from v_actor_driver then
    raise exception 'not_authorised';
  end if;
  if (v_is_admin and f.review_status in ('approved', 'voided'))
     or (not v_is_admin and f.review_status not in ('pending_review', 'queried')) then
    raise exception 'not_editable';
  end if;
  if p_expected_updated_at is not null and f.updated_at <> p_expected_updated_at then
    raise exception 'stale_update';
  end if;

  v_photo := public.fuel_slip_photo_input(p_org, p_photo);
  if (v_photo->>'fillup_id')::uuid <> f.id then
    raise exception 'invalid_photo_path';
  end if;

  update public.fuel_slip_photos
  set is_current = false, superseded_at = timezone('utc', now())
  where fillup_id = f.id and is_current
  returning * into v_old;

  insert into public.fuel_slip_photos (
    id, organisation_id, fillup_id, bucket_id, storage_path, mime_type, size_bytes,
    width_px, height_px, sha256, is_current, uploaded_by
  ) values (
    (v_photo->>'photo_id')::uuid, p_org, f.id, 'fuel-slips', v_photo->>'storage_path',
    v_photo->>'mime_type', (v_photo->>'size_bytes')::integer,
    (v_photo->>'width_px')::integer, (v_photo->>'height_px')::integer,
    v_photo->>'sha256', true, p_actor
  );

  if v_old.id is not null then
    perform public.write_audit_log(
      p_org, 'fuel_slip.photo_replaced', 'fuel_fillup', f.id,
      jsonb_build_object(
        'actor_role', v_role,
        'old_photo_id', v_old.id,
        'old_path_sha256', public.fuel_path_sha256(v_old.storage_path),
        'new_photo_id', v_photo->>'photo_id',
        'new_path_sha256', public.fuel_path_sha256(v_photo->>'storage_path'),
        'sha256', v_photo->>'sha256'
      ),
      p_actor
    );
  else
    perform public.write_audit_log(
      p_org, 'fuel_slip.photo_uploaded', 'fuel_fillup', f.id,
      jsonb_build_object(
        'actor_role', v_role,
        'photo_id', v_photo->>'photo_id',
        'path_sha256', public.fuel_path_sha256(v_photo->>'storage_path'),
        'sha256', v_photo->>'sha256'
      ),
      p_actor
    );
  end if;

  v_resubmit := not v_is_admin and f.review_status = 'queried';
  update public.fuel_fillups
  set review_status = case when v_resubmit then 'pending_review' else review_status end,
      photo_purged_at = null
  where id = f.id;

  if v_resubmit then
    perform public.write_audit_log(
      p_org, 'fuel_slip.resubmitted', 'fuel_fillup', f.id,
      jsonb_build_object('via', 'photo_replace'),
      p_actor
    );
  end if;

  perform public.evaluate_fuel_entry_flags(f.id, p_actor, 'photo_replace');

  return public.fuel_slip_result(f.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- review_fuel_slip (§5.1, §5.3): approve | query | reject | reopen | resolve_flags
-- ---------------------------------------------------------------------------

create or replace function public.review_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_action text,
  p_reason_code text,
  p_note text,
  p_flag_resolutions jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  f public.fuel_fillups%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_note text := nullif(btrim(p_note), '');
  v_reason text := lower(nullif(btrim(p_reason_code), ''));
  v_res jsonb;
  v_flag public.fuel_entry_flags%rowtype;
  v_status text;
  v_res_note text;
  v_self boolean := false;
  v_has_high boolean;
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role not in ('platform_owner', 'organisation_admin') or v_role is null then
    raise exception 'not_authorised';
  end if;

  if v_action not in ('approve', 'query', 'reject', 'reopen', 'resolve_flags') then
    raise exception 'invalid_action';
  end if;

  select * into f
  from public.fuel_fillups
  where id = p_id and organisation_id = p_org and deleted_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;

  if p_expected_updated_at is null then
    raise exception 'expected_updated_at_required';
  end if;
  if f.updated_at <> p_expected_updated_at then
    raise exception 'stale_update';
  end if;

  if p_flag_resolutions is not null and jsonb_typeof(p_flag_resolutions) <> 'null' then
    if jsonb_typeof(p_flag_resolutions) <> 'array' then
      raise exception 'invalid_flag_resolutions';
    end if;
    for v_res in select value from jsonb_array_elements(p_flag_resolutions)
    loop
      v_status := lower(btrim(coalesce(v_res->>'status', '')));
      v_res_note := nullif(btrim(v_res->>'note'), '');
      if v_status not in ('accepted', 'dismissed') then
        raise exception 'invalid_flag_resolution_status';
      end if;
      if v_res_note is null then
        raise exception 'resolution_note_required';
      end if;
      update public.fuel_entry_flags
      set status = v_status,
          resolved_by = p_actor,
          resolved_at = timezone('utc', now()),
          resolution_note = v_res_note
      where id = (v_res->>'flag_id')::uuid and fillup_id = f.id and status = 'open'
      returning * into v_flag;
      if v_flag.id is null then
        raise exception 'flag_not_open';
      end if;
      perform public.write_audit_log(
        p_org, 'fuel_slip.flag_resolved', 'fuel_fillup', f.id,
        jsonb_build_object(
          'flag_id', v_flag.id, 'code', v_flag.code, 'severity', v_flag.severity,
          'status', v_status, 'note', v_res_note
        ),
        p_actor
      );
      v_flag := null;
    end loop;
    perform public.fuel_refresh_flag_counts(f.id);
  end if;

  if v_action = 'approve' then
    if f.review_status <> 'pending_review' then
      raise exception 'invalid_transition';
    end if;
    v_has_high := exists (
      select 1 from public.fuel_entry_flags fl
      where fl.fillup_id = f.id and fl.status = 'open' and fl.severity = 'high'
    );
    if v_has_high and v_note is null then
      raise exception 'note_required';
    end if;
    v_self := f.entry_method = 'admin_manual' and f.created_by = p_actor;
    if v_self and v_note is null then
      raise exception 'note_required';
    end if;
    update public.fuel_fillups
    set review_status = 'approved', reviewed_at = timezone('utc', now()), reviewed_by = p_actor,
        review_reason_code = null, review_note = v_note
    where id = f.id;
    perform public.write_audit_log(
      p_org, 'fuel_slip.approved', 'fuel_fillup', f.id,
      jsonb_build_object(
        'previous_status', f.review_status, 'note', v_note, 'self_approved', v_self,
        'open_high_flags', v_has_high, 'entry_method', f.entry_method
      ),
      p_actor
    );

  elsif v_action = 'query' then
    if f.review_status <> 'pending_review' then
      raise exception 'invalid_transition';
    end if;
    if v_note is null then
      raise exception 'note_required';
    end if;
    update public.fuel_fillups
    set review_status = 'queried', reviewed_at = timezone('utc', now()), reviewed_by = p_actor,
        review_reason_code = null, review_note = v_note
    where id = f.id;
    if f.driver_id is not null then
      insert into public.driver_inbox_notifications (
        organisation_id, driver_id, notification_type, title, body, created_by
      ) values (
        p_org, f.driver_id, 'fuel_slip_queried', 'Fuel slip query',
        'An admin has a question about your fuel slip: ' || v_note, p_actor
      );
    end if;
    perform public.write_audit_log(
      p_org, 'fuel_slip.queried', 'fuel_fillup', f.id,
      jsonb_build_object('previous_status', f.review_status, 'note', v_note),
      p_actor
    );

  elsif v_action = 'reject' then
    if f.review_status not in ('pending_review', 'queried') then
      raise exception 'invalid_transition';
    end if;
    if v_reason is null
       or v_reason not in ('duplicate', 'not_our_vehicle', 'illegible', 'personal_use', 'wrong_amounts', 'other') then
      raise exception 'reason_code_required';
    end if;
    if v_note is null then
      raise exception 'note_required';
    end if;
    update public.fuel_fillups
    set review_status = 'rejected', reviewed_at = timezone('utc', now()), reviewed_by = p_actor,
        review_reason_code = v_reason, review_note = v_note
    where id = f.id;
    if f.driver_id is not null then
      insert into public.driver_inbox_notifications (
        organisation_id, driver_id, notification_type, title, body, created_by
      ) values (
        p_org, f.driver_id, 'fuel_slip_rejected', 'Fuel slip rejected',
        'Your fuel slip was rejected: ' || v_note, p_actor
      );
    end if;
    perform public.write_audit_log(
      p_org, 'fuel_slip.rejected', 'fuel_fillup', f.id,
      jsonb_build_object('previous_status', f.review_status, 'reason_code', v_reason, 'note', v_note),
      p_actor
    );

  elsif v_action = 'reopen' then
    if f.review_status <> 'approved' then
      raise exception 'invalid_transition';
    end if;
    if v_note is null then
      raise exception 'note_required';
    end if;
    update public.fuel_fillups
    set review_status = 'pending_review', reviewed_at = timezone('utc', now()), reviewed_by = p_actor,
        review_reason_code = null, review_note = v_note
    where id = f.id;
    perform public.write_audit_log(
      p_org, 'fuel_slip.reopened', 'fuel_fillup', f.id,
      jsonb_build_object('previous_status', f.review_status, 'note', v_note),
      p_actor
    );
  end if;

  return public.fuel_slip_result(f.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- void_fuel_slip (§5.1): any status except approved -> voided (soft-deleted, kept for retention)
-- ---------------------------------------------------------------------------

create or replace function public.void_fuel_slip(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  f public.fuel_fillups%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role not in ('platform_owner', 'organisation_admin') or v_role is null then
    raise exception 'not_authorised';
  end if;
  if v_reason is null then
    raise exception 'reason_required';
  end if;

  select * into f
  from public.fuel_fillups
  where id = p_id and organisation_id = p_org and deleted_at is null
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if f.review_status in ('approved', 'voided') then
    raise exception 'not_voidable';
  end if;
  if p_expected_updated_at is not null and f.updated_at <> p_expected_updated_at then
    raise exception 'stale_update';
  end if;

  update public.fuel_fillups
  set review_status = 'voided',
      deleted_at = timezone('utc', now()),
      reviewed_at = timezone('utc', now()),
      reviewed_by = p_actor,
      review_reason_code = null,
      review_note = v_reason
  where id = f.id;

  perform public.write_audit_log(
    p_org, 'fuel_slip.voided', 'fuel_fillup', f.id,
    jsonb_build_object('previous_status', f.review_status, 'reason', v_reason),
    p_actor
  );

  return public.fuel_slip_result(f.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- privacy_purge_fuel_slip_photo (§5.3): immediate purge via the Storage API queue.
-- Keeps the data row. Blocked by legal_hold.
-- ---------------------------------------------------------------------------

create or replace function public.privacy_purge_fuel_slip_photo(
  p_actor uuid,
  p_org uuid,
  p_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  f public.fuel_fillups%rowtype;
  ph record;
  v_reason text := nullif(btrim(p_reason), '');
  v_photo_ids jsonb := '[]'::jsonb;
  v_hashes jsonb := '[]'::jsonb;
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role not in ('platform_owner', 'organisation_admin') or v_role is null then
    raise exception 'not_authorised';
  end if;
  if v_reason is null then
    raise exception 'reason_required';
  end if;

  select * into f
  from public.fuel_fillups
  where id = p_id and organisation_id = p_org
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if f.legal_hold then
    raise exception 'legal_hold';
  end if;

  for ph in
    select p.id, p.storage_path
    from public.fuel_slip_photos p
    where p.fillup_id = f.id and p.purged_at is null
    for update
  loop
    perform public.enqueue_compliance_storage_purge('fuel-slips', ph.storage_path, p_org, ph.id, 'fuel_privacy_purge');
    update public.fuel_slip_photos
    set purged_at = timezone('utc', now()), purge_reason = 'privacy_purge'
    where id = ph.id;
    v_photo_ids := v_photo_ids || to_jsonb(ph.id);
    v_hashes := v_hashes || to_jsonb(public.fuel_path_sha256(ph.storage_path));
  end loop;

  if jsonb_array_length(v_photo_ids) = 0 then
    raise exception 'no_photo';
  end if;

  update public.fuel_fillups
  set photo_purged_at = timezone('utc', now())
  where id = f.id;

  perform public.write_audit_log(
    p_org, 'fuel_slip.photo_privacy_purged', 'fuel_fillup', f.id,
    jsonb_build_object(
      'reason', v_reason, 'photo_ids', v_photo_ids, 'path_sha256', v_hashes, 'storage_via', 'queue'
    ),
    p_actor
  );

  return jsonb_build_object('fillup_id', f.id, 'photos_queued', jsonb_array_length(v_photo_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- audit_fuel_slip_photo_view (§6.6): access check + audit before any signed URL.
-- ---------------------------------------------------------------------------

create or replace function public.audit_fuel_slip_photo_view(
  p_actor uuid,
  p_org uuid,
  p_photo_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  ph public.fuel_slip_photos%rowtype;
  f public.fuel_fillups%rowtype;
  v_driver uuid;
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role is null or v_role not in ('platform_owner', 'organisation_admin', 'driver') then
    raise exception 'not_authorised';
  end if;

  select * into ph from public.fuel_slip_photos where id = p_photo_id and organisation_id = p_org;
  if not found then
    raise exception 'not_found';
  end if;
  select * into f from public.fuel_fillups where id = ph.fillup_id;

  if v_role = 'driver' then
    v_driver := public.fuel_actor_driver_id(p_actor, p_org);
    if v_driver is null or f.driver_id is distinct from v_driver or f.deleted_at is not null then
      raise exception 'not_authorised';
    end if;
  end if;

  if ph.purged_at is not null then
    raise exception 'photo_purged';
  end if;

  perform public.write_audit_log(
    p_org, 'fuel_slip.photo_viewed', 'fuel_slip_photo', ph.id,
    jsonb_build_object(
      'fillup_id', ph.fillup_id, 'viewer_role', v_role, 'is_current', ph.is_current,
      'path_sha256', public.fuel_path_sha256(ph.storage_path)
    ),
    p_actor
  );

  return jsonb_build_object(
    'photo_id', ph.id, 'fillup_id', ph.fillup_id, 'bucket_id', ph.bucket_id,
    'storage_path', ph.storage_path, 'mime_type', ph.mime_type
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- audit_fuel_report_export (§7): company_manager may export approved rows only.
-- ---------------------------------------------------------------------------

create or replace function public.audit_fuel_report_export(
  p_actor uuid,
  p_org uuid,
  p_report text,
  p_filters jsonb,
  p_row_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role is null or v_role not in ('platform_owner', 'organisation_admin', 'company_manager') then
    raise exception 'not_authorised';
  end if;
  if v_role = 'company_manager' and coalesce((v_filters->>'include_pending')::boolean, false) then
    raise exception 'not_authorised';
  end if;
  if nullif(btrim(p_report), '') is null then
    raise exception 'report_required';
  end if;

  return public.write_audit_log(
    p_org, 'fuel_report.exported', 'fuel_report', null,
    jsonb_build_object(
      'report', btrim(p_report), 'filters', v_filters, 'row_count', p_row_count, 'actor_role', v_role
    ),
    p_actor
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- save_fuel_settings (§6.6). Changing retention_months back-fills retain_until.
-- ---------------------------------------------------------------------------

create or replace function public.save_fuel_settings(
  p_actor uuid,
  p_org uuid,
  p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  s_old public.fuel_settings%rowtype;
  s public.fuel_settings%rowtype;
  v_key text;
  v_val jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_col text;
  v_backfilled integer := 0;
begin
  v_role := public.fuel_actor_role(p_actor, p_org);
  if v_role not in ('platform_owner', 'organisation_admin') or v_role is null then
    raise exception 'not_authorised';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_settings';
  end if;

  perform 1 from public.fuel_settings where organisation_id = p_org for update;
  s_old := public.fuel_setting(p_org);
  s := s_old;

  for v_key in select jsonb_object_keys(p_settings)
  loop
    v_val := p_settings -> v_key;
    case v_key
      when 'amount_tol_abs' then s.amount_tol_abs := public.fuel_parse_numeric(v_val, v_key);
      when 'amount_tol_pct' then s.amount_tol_pct := public.fuel_parse_numeric(v_val, v_key);
      when 'price_min' then s.price_min := public.fuel_parse_numeric(v_val, v_key);
      when 'price_max' then s.price_max := public.fuel_parse_numeric(v_val, v_key);
      when 'max_age_days' then s.max_age_days := public.fuel_parse_numeric(v_val, v_key)::integer;
      when 'future_tol_minutes' then s.future_tol_minutes := public.fuel_parse_numeric(v_val, v_key)::integer;
      when 'min_hours_between_fills' then s.min_hours_between_fills := public.fuel_parse_numeric(v_val, v_key);
      when 'max_km_between_fills' then s.max_km_between_fills := public.fuel_parse_numeric(v_val, v_key)::integer;
      when 'tank_tol_pct' then s.tank_tol_pct := public.fuel_parse_numeric(v_val, v_key);
      when 'consumption_min' then s.consumption_min := public.fuel_parse_numeric(v_val, v_key);
      when 'consumption_max' then s.consumption_max := public.fuel_parse_numeric(v_val, v_key);
      when 'dup_auth_window_days' then s.dup_auth_window_days := public.fuel_parse_numeric(v_val, v_key)::integer;
      when 'dup_auth_severity' then s.dup_auth_severity := lower(nullif(btrim(v_val #>> '{}'), ''));
      when 'default_order_no' then s.default_order_no := upper(nullif(btrim(v_val #>> '{}'), ''));
      when 'retention_months' then s.retention_months := public.fuel_parse_numeric(v_val, v_key)::integer;
      when 'post_retention_action' then s.post_retention_action := lower(nullif(btrim(v_val #>> '{}'), ''));
      when 'scan_enabled' then s.scan_enabled := coalesce((v_val #>> '{}')::boolean, false);
      else raise exception 'unknown_setting:%', v_key;
    end case;
  end loop;

  s.organisation_id := p_org;
  s.updated_by := p_actor;
  s.updated_at := timezone('utc', now());

  insert into public.fuel_settings (
    organisation_id, amount_tol_abs, amount_tol_pct, price_min, price_max, max_age_days,
    future_tol_minutes, min_hours_between_fills, max_km_between_fills, tank_tol_pct,
    consumption_min, consumption_max, dup_auth_window_days, dup_auth_severity, default_order_no,
    retention_months, post_retention_action, scan_enabled, updated_by, updated_at
  ) values (
    s.organisation_id, s.amount_tol_abs, s.amount_tol_pct, s.price_min, s.price_max, s.max_age_days,
    s.future_tol_minutes, s.min_hours_between_fills, s.max_km_between_fills, s.tank_tol_pct,
    s.consumption_min, s.consumption_max, s.dup_auth_window_days, s.dup_auth_severity, s.default_order_no,
    s.retention_months, s.post_retention_action, s.scan_enabled, s.updated_by, s.updated_at
  )
  on conflict (organisation_id) do update set
    amount_tol_abs = excluded.amount_tol_abs,
    amount_tol_pct = excluded.amount_tol_pct,
    price_min = excluded.price_min,
    price_max = excluded.price_max,
    max_age_days = excluded.max_age_days,
    future_tol_minutes = excluded.future_tol_minutes,
    min_hours_between_fills = excluded.min_hours_between_fills,
    max_km_between_fills = excluded.max_km_between_fills,
    tank_tol_pct = excluded.tank_tol_pct,
    consumption_min = excluded.consumption_min,
    consumption_max = excluded.consumption_max,
    dup_auth_window_days = excluded.dup_auth_window_days,
    dup_auth_severity = excluded.dup_auth_severity,
    default_order_no = excluded.default_order_no,
    retention_months = excluded.retention_months,
    post_retention_action = excluded.post_retention_action,
    scan_enabled = excluded.scan_enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  foreach v_col in array array[
    'amount_tol_abs', 'amount_tol_pct', 'price_min', 'price_max', 'max_age_days', 'future_tol_minutes',
    'min_hours_between_fills', 'max_km_between_fills', 'tank_tol_pct', 'consumption_min',
    'consumption_max', 'dup_auth_window_days', 'dup_auth_severity', 'default_order_no',
    'retention_months', 'post_retention_action', 'scan_enabled'
  ]
  loop
    if (to_jsonb(s_old) -> v_col) is distinct from (to_jsonb(s) -> v_col) then
      v_changes := v_changes || jsonb_build_object(
        v_col, jsonb_build_object('before', to_jsonb(s_old) -> v_col, 'after', to_jsonb(s) -> v_col)
      );
    end if;
  end loop;

  if s_old.retention_months is distinct from s.retention_months then
    update public.fuel_fillups f
    set retain_until = case
      when s.retention_months is null then null
      else ((f.filled_at at time zone 'Africa/Johannesburg')::date
            + make_interval(months => s.retention_months))::date
    end
    where f.organisation_id = p_org and f.retention_processed_at is null;
    get diagnostics v_backfilled = row_count;
  end if;

  perform public.write_audit_log(
    p_org, 'fuel_settings.updated', 'fuel_settings', null,
    jsonb_build_object('changes', v_changes, 'retain_until_backfilled', v_backfilled),
    p_actor
  );

  return to_jsonb(s);
end;
$$;

-- ---------------------------------------------------------------------------
-- run_fuel_slip_retention (§8). NULL policy => nothing purged on retention grounds.
-- Photos only via the Storage API purge queue. Orphan sweep reads storage.objects only.
-- ---------------------------------------------------------------------------

create or replace function public.run_fuel_slip_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (p_now at time zone 'Africa/Johannesburg')::date;
  s record;
  r record;
  ph record;
  v_policy_orgs integer := 0;
  v_rows integer := 0;
  v_anonymised integer := 0;
  v_deleted integer := 0;
  v_photos integer := 0;
  v_held integer := 0;
  v_orphans integer := 0;
  v_org_rows integer;
  v_org_photos integer;
  v_org_held integer;
begin
  for s in
    select fs.organisation_id, fs.retention_months, fs.post_retention_action
    from public.fuel_settings fs
    where fs.retention_months is not null and fs.post_retention_action is not null
  loop
    v_policy_orgs := v_policy_orgs + 1;
    v_org_rows := 0;
    v_org_photos := 0;

    select count(*) into v_org_held
    from public.fuel_fillups f
    where f.organisation_id = s.organisation_id
      and f.legal_hold
      and f.retention_processed_at is null
      and f.retain_until is not null
      and f.retain_until < v_today;
    v_held := v_held + v_org_held;

    for r in
      select f.id
      from public.fuel_fillups f
      where f.organisation_id = s.organisation_id
        and f.legal_hold = false
        and f.retention_processed_at is null
        and f.retain_until is not null
        and f.retain_until < v_today
      for update skip locked
    loop
      for ph in
        select p.id, p.storage_path
        from public.fuel_slip_photos p
        where p.fillup_id = r.id and p.purged_at is null
      loop
        perform public.enqueue_compliance_storage_purge(
          'fuel-slips', ph.storage_path, s.organisation_id, ph.id, 'fuel_retention'
        );
        update public.fuel_slip_photos
        set purged_at = p_now, purge_reason = 'fuel_retention'
        where id = ph.id;
        v_org_photos := v_org_photos + 1;
      end loop;

      if s.post_retention_action = 'anonymise' then
        update public.fuel_fillups
        set photo_purged_at = coalesce(photo_purged_at, p_now),
            driver_id = null,
            created_by = null,
            authorisation_no = null,
            order_no = null,
            slip_number = null,
            notes = null,
            slip_vrn = null,
            retention_processed_at = p_now
        where id = r.id;
        update public.fuel_entry_flags
        set details = jsonb_build_object('anonymised', true), resolution_note = null
        where fillup_id = r.id;
        v_anonymised := v_anonymised + 1;
      else
        delete from public.fuel_fillups where id = r.id;
        v_deleted := v_deleted + 1;
      end if;
      v_org_rows := v_org_rows + 1;
    end loop;

    v_rows := v_rows + v_org_rows;
    v_photos := v_photos + v_org_photos;

    if v_org_rows > 0 or v_org_held > 0 then
      perform public.write_audit_log(
        s.organisation_id, 'fuel_slip.retention_processed', 'fuel_fillup', null,
        jsonb_build_object(
          'action', s.post_retention_action, 'retention_months', s.retention_months,
          'rows_processed', v_org_rows, 'photos_queued', v_org_photos,
          'skipped_legal_hold', v_org_held, 'as_of', v_today, 'storage_via', 'queue'
        )
      );
    end if;
  end loop;

  for r in
    select so.name,
           (select o.id from public.organisations o where o.id::text = split_part(so.name, '/', 1)) as org_id
    from storage.objects so
    where so.bucket_id = 'fuel-slips'
      and so.created_at < p_now - interval '24 hours'
      and not exists (select 1 from public.fuel_slip_photos p where p.storage_path = so.name)
      and not exists (
        select 1 from public.compliance_storage_purge_queue q
        where q.bucket_id = 'fuel-slips' and q.storage_path = so.name and q.purged_at is null
      )
  loop
    perform public.enqueue_compliance_storage_purge('fuel-slips', r.name, r.org_id, null, 'fuel_orphan');
    v_orphans := v_orphans + 1;
  end loop;

  perform public.write_audit_log(
    null, 'fuel_slip.retention_processed', 'fuel_fillup', null,
    jsonb_build_object(
      'policy_orgs', v_policy_orgs, 'rows_processed', v_rows, 'anonymised', v_anonymised,
      'deleted', v_deleted, 'photos_queued', v_photos, 'skipped_legal_hold', v_held,
      'orphans_queued', v_orphans, 'as_of', v_today, 'storage_via', 'queue'
    )
  );

  return jsonb_build_object(
    'policy_orgs', v_policy_orgs,
    'rows_processed', v_rows,
    'anonymised', v_anonymised,
    'deleted', v_deleted,
    'photos_queued', v_photos,
    'skipped_legal_hold', v_held,
    'orphans_queued', v_orphans
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Vehicles: fuel profile via the audited save_vehicle_capture (and bulk import, §6.2)
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
  v_old_tank numeric;
  v_old_fuel text;
  v_new_tank numeric;
  v_new_fuel text;
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
      license_disc_expires_on, vehicle_type, capacity, company_id, status, created_by,
      tank_capacity_litres, default_fuel_type
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
      p_actor,
      nullif(p_fields->>'tank_capacity_litres','')::numeric,
      lower(nullif(btrim(p_fields->>'default_fuel_type'),''))
    ) returning id, tank_capacity_litres, default_fuel_type into v_id, v_new_tank, v_new_fuel;
    v_action := 'vehicle.created';
  else
    select tank_capacity_litres, default_fuel_type into v_old_tank, v_old_fuel
    from public.vehicles
    where id = p_vehicle_id and organisation_id = p_org and deleted_at is null;

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
      tank_capacity_litres = case
        when p_fields ? 'tank_capacity_litres' then nullif(p_fields->>'tank_capacity_litres','')::numeric
        else tank_capacity_litres
      end,
      default_fuel_type = case
        when p_fields ? 'default_fuel_type' then lower(nullif(btrim(p_fields->>'default_fuel_type'),''))
        else default_fuel_type
      end,
      updated_at = timezone('utc', now())
    where id = p_vehicle_id and organisation_id = p_org and deleted_at is null
    returning id, tank_capacity_litres, default_fuel_type into v_id, v_new_tank, v_new_fuel;
    if v_id is null then raise exception 'not_found'; end if;
    v_action := 'vehicle.updated';
  end if;

  perform public.write_audit_log(p_org, v_action, 'vehicle', v_id, jsonb_build_object('name', p_fields->>'name'), p_actor);

  if v_old_tank is distinct from v_new_tank or v_old_fuel is distinct from v_new_fuel then
    perform public.write_audit_log(
      p_org, 'vehicle.fuel_profile_updated', 'vehicle', v_id,
      jsonb_build_object(
        'tank_capacity_litres', jsonb_build_object('before', v_old_tank, 'after', v_new_tank),
        'default_fuel_type', jsonb_build_object('before', v_old_fuel, 'after', v_new_fuel)
      ),
      p_actor
    );
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoice guard (§6.7): only approved fill-ups enter newly generated invoices.
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
  v_period_end date;
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

  v_period_end := p_week_start + 7;

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
    and i.period_end = v_period_end
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
    v_period_end,
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
      and f.filled_at < v_period_end::timestamptz
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
-- RLS (§5.5, §6.4). No direct client writes; reads follow the role table.
-- ---------------------------------------------------------------------------

alter table public.fuel_fillups enable row level security;
alter table public.fuel_slip_photos enable row level security;
alter table public.fuel_entry_flags enable row level security;
alter table public.fuel_settings enable row level security;

drop policy if exists fuel_fillups_insert on public.fuel_fillups;
drop policy if exists fuel_fillups_update on public.fuel_fillups;
drop policy if exists fuel_fillups_delete on public.fuel_fillups;

drop policy if exists fuel_fillups_select on public.fuel_fillups;
create policy fuel_fillups_select on public.fuel_fillups
  for select
  using (
    -- platform_owner / organisation_admin: all rows in org (voided rows stay visible for review)
    (
      (deleted_at is null or review_status = 'voided')
      and public.has_org_role_names(organisation_id, array['organisation_admin'])
    )
    -- manager / dispatcher / supervisor: rows only
    or (
      deleted_at is null
      and public.has_org_role_names(organisation_id, array['manager', 'dispatcher', 'supervisor'])
    )
    -- driver: own rows only
    or (
      deleted_at is null
      and public.has_org_role_names(organisation_id, array['driver'])
      and driver_id = public.current_driver_id(organisation_id)
    )
    -- company_manager: approved rows for companies in member_scopes only
    or (
      deleted_at is null
      and review_status = 'approved'
      and company_id is not null
      and public.has_org_role_names(organisation_id, array['company_manager'])
      and public.has_company_scope(organisation_id, company_id)
    )
  );

drop policy if exists fuel_slip_photos_select on public.fuel_slip_photos;
create policy fuel_slip_photos_select on public.fuel_slip_photos
  for select
  using (
    public.has_org_role_names(organisation_id, array['organisation_admin'])
    or exists (
      select 1
      from public.fuel_fillups f
      where f.id = fuel_slip_photos.fillup_id
        and f.deleted_at is null
        and public.has_org_role_names(f.organisation_id, array['driver'])
        and f.driver_id = public.current_driver_id(f.organisation_id)
    )
  );

drop policy if exists fuel_entry_flags_select on public.fuel_entry_flags;
create policy fuel_entry_flags_select on public.fuel_entry_flags
  for select
  using (public.has_org_role_names(organisation_id, array['organisation_admin']));

drop policy if exists fuel_settings_select on public.fuel_settings;
create policy fuel_settings_select on public.fuel_settings
  for select
  using (public.has_org_role_names(organisation_id, array['organisation_admin']));

revoke all on public.fuel_fillups from anon;
revoke all on public.fuel_slip_photos from anon;
revoke all on public.fuel_entry_flags from anon;
revoke all on public.fuel_settings from anon;

revoke insert, update, delete, truncate on public.fuel_fillups from authenticated;
revoke insert, update, delete, truncate on public.fuel_slip_photos from authenticated;
revoke insert, update, delete, truncate on public.fuel_entry_flags from authenticated;
revoke insert, update, delete, truncate on public.fuel_settings from authenticated;

grant select on public.fuel_fillups to authenticated;
grant select on public.fuel_slip_photos to authenticated;
grant select on public.fuel_entry_flags to authenticated;
grant select on public.fuel_settings to authenticated;

grant select, insert, update, delete on public.fuel_fillups to service_role;
grant select, insert, update, delete on public.fuel_slip_photos to service_role;
grant select, insert, update, delete on public.fuel_entry_flags to service_role;
grant select, insert, update, delete on public.fuel_settings to service_role;

-- ---------------------------------------------------------------------------
-- Function privileges: service_role only (§6.4). Legacy log_fuel_fillup kept for rollback.
-- ---------------------------------------------------------------------------

revoke all on function public.log_fuel_fillup(
  uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text
) from public, anon, authenticated;

revoke all on function public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_fuel_slip(uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.review_fuel_slip(uuid, uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.void_fuel_slip(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.audit_fuel_slip_photo_view(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.audit_fuel_report_export(uuid, uuid, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.save_fuel_settings(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.run_fuel_slip_retention(timestamptz) from public, anon, authenticated;
revoke all on function public.evaluate_fuel_entry_flags(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fuel_setting(uuid) from public, anon, authenticated;
revoke all on function public.fuel_path_sha256(text) from public, anon, authenticated;
revoke all on function public.fuel_normalise_vrn(text) from public, anon, authenticated;
revoke all on function public.fuel_fuel_family(text) from public, anon, authenticated;
revoke all on function public.fuel_severity_rank(text) from public, anon, authenticated;
revoke all on function public.fuel_parse_numeric(jsonb, text) from public, anon, authenticated;
revoke all on function public.fuel_actor_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fuel_actor_driver_id(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fuel_slip_normalise_fields(jsonb, text) from public, anon, authenticated;
revoke all on function public.fuel_slip_photo_input(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fuel_refresh_flag_counts(uuid) from public, anon, authenticated;
revoke all on function public.fuel_slip_result(uuid) from public, anon, authenticated;
revoke all on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

grant execute on function public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.update_fuel_slip(uuid, uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb, timestamptz) to service_role;
grant execute on function public.review_fuel_slip(uuid, uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.void_fuel_slip(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid, text) to service_role;
grant execute on function public.audit_fuel_slip_photo_view(uuid, uuid, uuid) to service_role;
grant execute on function public.audit_fuel_report_export(uuid, uuid, text, jsonb, integer) to service_role;
grant execute on function public.save_fuel_settings(uuid, uuid, jsonb) to service_role;
grant execute on function public.run_fuel_slip_retention(timestamptz) to service_role;
grant execute on function public.evaluate_fuel_entry_flags(uuid, uuid, text) to service_role;
grant execute on function public.fuel_setting(uuid) to service_role;
grant execute on function public.fuel_path_sha256(text) to service_role;
grant execute on function public.fuel_normalise_vrn(text) to service_role;
grant execute on function public.fuel_fuel_family(text) to service_role;
grant execute on function public.fuel_severity_rank(text) to service_role;
grant execute on function public.fuel_parse_numeric(jsonb, text) to service_role;
grant execute on function public.fuel_actor_role(uuid, uuid) to service_role;
grant execute on function public.fuel_actor_driver_id(uuid, uuid) to service_role;
grant execute on function public.fuel_slip_normalise_fields(jsonb, text) to service_role;
grant execute on function public.fuel_slip_photo_input(uuid, jsonb) to service_role;
grant execute on function public.fuel_refresh_flag_counts(uuid) to service_role;
grant execute on function public.fuel_slip_result(uuid) to service_role;
grant execute on function public.save_vehicle_capture(uuid, uuid, uuid, jsonb) to service_role;

comment on function public.log_fuel_fillup(uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text) is
  'RETIRED (fuel slip spec v2). No client EXECUTE; kept for rollback only, drop in a later clean-up.';
comment on function public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb) is
  'Driver slip (photo required) or admin back-capture (photo optional). entry_method set from role. Idempotent on client_entry_id.';
comment on function public.run_fuel_slip_retention(timestamptz) is
  'Daily fuel retention: purges only when retention_months and post_retention_action are set; orphan sweep always.';
