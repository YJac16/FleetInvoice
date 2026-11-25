-- =============================================================================
-- 00091: org copy (merge several source orgs into one new org) +
--        generate_driver_weekly_invoice sweeps unbilled staff trips
--
--   public.org_copy_map           source row -> new row, per copy batch
--   public.org_copy_remap()       strict id lookup (raises when unmapped)
--   public.org_copy_table()       generic FK-aware copy of one org table
--   public.org_copy_dedupe()      maps duplicate source rows onto one survivor
--   public.copy_orgs_to_jacobs_org(p_source_org_ids, p_target_name,
--                                  p_target_slug, p_batch_id) returns uuid
--
--   The copy:
--     * runs inside the caller's transaction with
--       app.preserve_audit_actor = 'true' (SET LOCAL), so created_by /
--       generated_by / updated_by / approved_by are kept as they were;
--     * creates the target org AND an active 'growth' subscription;
--     * gives every copied row a new UUID and records it in org_copy_map
--       (also one 'organisations' row per source: source org -> target);
--     * dedupes companies (lower(btrim(name))), drivers (profile_id, then
--       license_number, then full_name when neither is set), vehicles
--       (normalised registration), suppliers / maintenance_categories /
--       org locations (name) and employees (profile_id / employee_number);
--       the first source org in p_source_org_ids wins;
--     * route_prices: after company dedupe an identical template (same
--       label, rule and amount) collapses onto the survivor; a different
--       template with the same label is kept but renamed
--       "<label> (from <source org>)" and set inactive, so the active-label
--       unique index never fails and historical lines keep their snapshot;
--     * copies prices exactly (trips.manual_unit_price, invoice_lines unit
--       prices, overrides). Nothing is re-priced: no generate_*, no
--       suggest_trip_unit_price, no sync_staff_trip_invoice_line. No insert
--       trigger on trips / invoice_lines touches prices;
--     * remaps settings.invoice_bill_to_company_id, audit_logs.entity_id,
--       admin_inbox_notifications.subject_id and storage paths
--       (driver/vehicle documents, workshop bill attachments). Storage
--       OBJECTS are not copied by SQL: copy them at the remapped paths
--       before archiving the source orgs;
--     * memberships: one organisation_members row per user across the
--       source orgs, with the highest role; source memberships untouched;
--     * never copies notification_outbox, invitations, qr_tokens, GPS /
--       geofence / compliance scan rows or global locations;
--     * checks before returning that trip / invoice / line counts and money
--       totals match the sources exactly (raises otherwise, rolling back).
--
--   Only postgres / service_role can run it (EXECUTE revoked from
--   authenticated, and the function refuses any caller with auth.uid()). Nothing here runs a copy:
--   00092 does, for the demo orgs only.
-- Rollback: supabase/rollback-00091.sql (after rollback-jacobs-org-copy.sql)
-- =============================================================================

create table if not exists public.org_copy_map (
  batch_id uuid not null,
  source_org_id uuid not null,
  source_table text not null,
  source_id uuid not null,
  new_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (batch_id, source_table, source_id)
);

create index if not exists org_copy_map_new_idx
  on public.org_copy_map (batch_id, source_table, new_id);

alter table public.org_copy_map enable row level security;
revoke all on table public.org_copy_map from public, anon, authenticated;
grant select, insert, update, delete on table public.org_copy_map to service_role;

-- ---------------------------------------------------------------------------
create or replace function public.org_copy_remap(p_batch uuid, p_table text, p_id uuid)
returns uuid
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v uuid;
begin
  if p_id is null then
    return null;
  end if;
  select m.new_id into v
  from public.org_copy_map m
  where m.batch_id = p_batch and m.source_table = p_table and m.source_id = p_id;
  if v is null then
    raise exception 'org_copy: % row % is not mapped in batch %', p_table, p_id, p_batch;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Maps duplicate source rows (same key, not deleted) onto the survivor's
-- new id. Survivor: first source org in p_sources, then created_at, then id.
-- p_key is an SQL expression over alias s; rows where it is null are skipped.
-- ---------------------------------------------------------------------------
create or replace function public.org_copy_dedupe(
  p_batch uuid,
  p_sources uuid[],
  p_table text,
  p_key text,
  p_extra_where text default 'true'
)
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_n integer;
begin
  if to_regclass('public.' || p_table) is null then
    return 0;
  end if;

  execute format(
    'insert into public.org_copy_map (batch_id, source_org_id, source_table, source_id, new_id)
     select $1, s.organisation_id, %L, s.id, gen_random_uuid()
     from public.%I s where s.organisation_id = any ($2)
     on conflict do nothing',
    p_table, p_table
  ) using p_batch, p_sources;

  execute format(
    'with k as (
       select s.id,
              row_number() over w as rn,
              first_value(s.id) over w as first_id
       from public.%1$I s
       where s.organisation_id = any ($2)
         and s.deleted_at is null
         and (%2$s) is not null
         and (%3$s)
       window w as (
         partition by (%2$s)
         order by array_position($2, s.organisation_id), s.created_at, s.id
       )
     )
     update public.org_copy_map m
     set new_id = f.new_id
     from k
     join public.org_copy_map f
       on f.batch_id = $1 and f.source_table = %4$L and f.source_id = k.first_id
     where k.rn > 1
       and m.batch_id = $1 and m.source_table = %4$L and m.source_id = k.id',
    p_table, p_key, p_extra_where, p_table
  ) using p_batch, p_sources;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generic copy of one org-scoped table.
--   id (single-column uuid PK)   -> new id from org_copy_map
--   organisation_id              -> target org
--   FK to another public table   -> org_copy_remap (strict)
--   p_overrides {col: sql expr}  -> expression over alias s (and m for id)
--   everything else              -> copied as is
-- Rows that share a new id (or remapped PK) collapse onto the survivor.
-- ---------------------------------------------------------------------------
create or replace function public.org_copy_table(
  p_batch uuid,
  p_sources uuid[],
  p_target uuid,
  p_table text,
  p_overrides jsonb default '{}'::jsonb
)
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_rel regclass;
  v_has_id boolean;
  v_has_created boolean;
  v_pk text[];
  v_cols text := '';
  v_exprs text := '';
  v_outer text := '';
  v_pk_list text := '';
  r record;
  v_ref text;
  v_expr text;
  v_n integer;
begin
  v_rel := to_regclass('public.' || p_table);
  if v_rel is null then
    return 0;
  end if;

  select array_agg(a.attname::text order by k.ord)
  into v_pk
  from pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = v_rel and i.indisprimary;

  v_has_id := v_pk = array['id'];
  select exists (
    select 1 from pg_attribute a
    where a.attrelid = v_rel and a.attname = 'created_at' and not a.attisdropped
  ) into v_has_created;

  if v_has_id then
    execute format(
      'insert into public.org_copy_map (batch_id, source_org_id, source_table, source_id, new_id)
       select $1, s.organisation_id, %L, s.id, gen_random_uuid()
       from public.%I s where s.organisation_id = any ($2)
       on conflict do nothing',
      p_table, p_table
    ) using p_batch, p_sources;
  end if;

  for r in
    select a.attname::text as attname, a.attnum
    from pg_attribute a
    where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    order by a.attnum
  loop
    v_ref := null;
    if p_overrides ? r.attname then
      v_expr := p_overrides ->> r.attname;
    elsif r.attname = 'id' and v_has_id then
      v_expr := 'm.new_id';
    elsif r.attname = 'organisation_id' then
      v_expr := quote_literal(p_target) || '::uuid';
    else
      select cf.relname::text into v_ref
      from pg_constraint c
      join pg_class cf on cf.oid = c.confrelid
      join pg_namespace n on n.oid = cf.relnamespace
      where c.conrelid = v_rel
        and c.contype = 'f'
        and c.conkey = array[r.attnum]::smallint[]
        and n.nspname = 'public'
        and cf.relname not in ('organisations', 'profiles', 'plans')
      limit 1;
      if v_ref is not null then
        v_expr := format('public.org_copy_remap(%L::uuid, %L, s.%I)', p_batch, v_ref, r.attname);
      else
        v_expr := format('s.%I', r.attname);
      end if;
    end if;

    v_cols := v_cols || case when v_cols = '' then '' else ', ' end || quote_ident(r.attname);
    v_outer := v_outer || case when v_outer = '' then '' else ', ' end || 'x.' || quote_ident(r.attname);
    v_exprs := v_exprs || case when v_exprs = '' then '' else ', ' end
      || v_expr || ' as ' || quote_ident(r.attname);
  end loop;

  select string_agg('x.' || quote_ident(c), ', ') into v_pk_list from unnest(v_pk) as c;

  execute format(
    'insert into public.%1$I (%2$s)
     select distinct on (%3$s) %4$s
     from (
       select %5$s,
              array_position($2, s.organisation_id) as _org_ord,
              %6$s as _created,
              s.%7$s as _src_key
       from public.%1$I s
       %8$s
       where s.organisation_id = any ($2)
     ) x
     order by %3$s, x._org_ord, x._created, x._src_key',
    p_table,
    v_cols,
    v_pk_list,
    v_outer,
    v_exprs,
    case when v_has_created then 's.created_at' else 'null::timestamptz' end,
    quote_ident(v_pk[1]),
    case when v_has_id
      then format('join public.org_copy_map m on m.batch_id = %L::uuid and m.source_table = %L and m.source_id = s.id', p_batch, p_table)
      else '' end
  ) using p_batch, p_sources;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.copy_orgs_to_jacobs_org(
  p_source_org_ids uuid[],
  p_target_name text default 'Jacobs Org',
  p_target_slug text default 'jacobs-org',
  p_batch_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target uuid := gen_random_uuid();
  v_first uuid;
  v_growth uuid;
  v_settings jsonb;
  v_bill_to text;
  v_tbl text;
  v_src_n numeric;
  v_dst_n numeric;
  v_check record;
begin
  -- Service role / postgres only. Defence in depth on top of the REVOKE:
  -- any end-user JWT (even a platform owner) is refused.
  if auth.uid() is not null then
    raise exception 'org_copy: service role only';
  end if;
  if p_source_org_ids is null or cardinality(p_source_org_ids) = 0 then
    raise exception 'org_copy: no source orgs';
  end if;
  if (select count(distinct x) from unnest(p_source_org_ids) x) <> cardinality(p_source_org_ids) then
    raise exception 'org_copy: duplicate source org ids';
  end if;
  if (
    select count(*) from public.organisations o
    where o.id = any (p_source_org_ids) and o.deleted_at is null
  ) <> cardinality(p_source_org_ids) then
    raise exception 'org_copy: a source org is missing or archived';
  end if;
  if exists (select 1 from public.organisations o where o.slug = p_target_slug) then
    raise exception 'org_copy: target slug % already exists', p_target_slug;
  end if;
  if exists (select 1 from public.org_copy_map m where m.batch_id = p_batch_id) then
    raise exception 'org_copy: batch % already used', p_batch_id;
  end if;

  select id into v_growth from public.plans where code = 'growth';
  if v_growth is null then
    raise exception 'org_copy: growth plan missing';
  end if;

  perform set_config('app.preserve_audit_actor', 'true', true);

  v_first := p_source_org_ids[1];
  select o.settings into v_settings from public.organisations o where o.id = v_first;

  insert into public.organisations (
    id, name, slug, logo_url, settings, status, created_by,
    compliance_scan_enabled, compliance_driver_uploads_enabled
  )
  select v_target, p_target_name, p_target_slug, o.logo_url,
         coalesce(o.settings, '{}'::jsonb) - 'invoice_bill_to_company_id',
         'active', o.created_by,
         o.compliance_scan_enabled, o.compliance_driver_uploads_enabled
  from public.organisations o where o.id = v_first;

  insert into public.subscriptions (organisation_id, plan_id, status, current_period_start)
  values (v_target, v_growth, 'active', timezone('utc', now()));

  insert into public.org_copy_map (batch_id, source_org_id, source_table, source_id, new_id)
  select p_batch_id, s, 'organisations', s, v_target from unnest(p_source_org_ids) s;

  -- Memberships: one per user, highest role, active if any source is active.
  insert into public.organisation_members (organisation_id, user_id, role, status, created_by, created_at)
  select distinct on (m.user_id)
    v_target, m.user_id, m.role, m.status, m.created_by, m.created_at
  from public.organisation_members m
  where m.organisation_id = any (p_source_org_ids)
    and m.deleted_at is null
  order by m.user_id,
           (m.status = 'active') desc,
           case m.role::text
             when 'platform_owner' then 0
             when 'organisation_admin' then 1
             when 'manager' then 2
             when 'dispatcher' then 3
             when 'supervisor' then 4
             when 'company_manager' then 5
             when 'driver' then 6
             else 7
           end,
           array_position(p_source_org_ids, m.organisation_id);

  insert into public.org_copy_map (batch_id, source_org_id, source_table, source_id, new_id)
  select p_batch_id, m.organisation_id, 'organisation_members', m.id, t.id
  from public.organisation_members m
  join public.organisation_members t
    on t.organisation_id = v_target and t.user_id = m.user_id
  where m.organisation_id = any (p_source_org_ids)
    and m.deleted_at is null;

  -- Dedupe maps (before any copy).
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'companies', 'lower(btrim(s.name))');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'drivers', 's.profile_id::text');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'drivers',
    'nullif(lower(btrim(s.license_number)), '''')');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'drivers', 'lower(btrim(s.full_name))',
    's.profile_id is null and nullif(btrim(s.license_number), '''') is null');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'vehicles',
    'nullif(lower(regexp_replace(s.registration_number, ''\s'', '''', ''g'')), '''')');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'suppliers', 'lower(btrim(s.name))');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'maintenance_categories', 'lower(btrim(s.name))');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'locations', 'lower(btrim(s.name))');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'employees', 's.profile_id::text');
  perform public.org_copy_dedupe(p_batch_id, p_source_org_ids, 'employees',
    'nullif(lower(btrim(s.employee_number)), '''')');

  -- Master data
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'companies');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'areas');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'sites');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'pickup_points');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'locations');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'routes');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'route_stops');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'schedules');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'employees');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'drivers');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'vehicles');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'driver_vehicle_assignments');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'driver_invoice_print_overrides');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'driver_presence');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'driver_no_trip_days');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'driver_documents',
    jsonb_build_object('storage_path', format(
      'replace(replace(s.storage_path, s.organisation_id::text, %L), s.driver_id::text, public.org_copy_remap(%L::uuid, ''drivers'', s.driver_id)::text)',
      v_target, p_batch_id)));
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'vehicle_documents',
    jsonb_build_object('storage_path', format(
      'replace(replace(s.storage_path, s.organisation_id::text, %L), s.vehicle_id::text, public.org_copy_remap(%L::uuid, ''vehicles'', s.vehicle_id)::text)',
      v_target, p_batch_id)));
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'member_scopes');

  -- settings.invoice_bill_to_company_id -> surviving company in the target
  v_bill_to := v_settings ->> 'invoice_bill_to_company_id';
  if v_bill_to is not null and v_bill_to <> '' then
    update public.organisations
    set settings = settings || jsonb_build_object(
      'invoice_bill_to_company_id',
      public.org_copy_remap(p_batch_id, 'companies', v_bill_to::uuid)::text
    )
    where id = v_target;
  end if;

  -- Pricing
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'rate_cards');

  if to_regclass('public.route_prices') is not null then
    insert into public.org_copy_map (batch_id, source_org_id, source_table, source_id, new_id)
    select p_batch_id, rp.organisation_id, 'route_prices', rp.id, gen_random_uuid()
    from public.route_prices rp where rp.organisation_id = any (p_source_org_ids)
    on conflict do nothing;

    create temp table if not exists _org_copy_rp (id uuid primary key, label text, active boolean) on commit drop;
    truncate _org_copy_rp;

    with ranked as (
      select rp.*,
             first_value(rp.id) over w as first_id,
             row_number() over w as rn
      from public.route_prices rp
      where rp.organisation_id = any (p_source_org_ids)
        and rp.deleted_at is null
      window w as (
        partition by public.org_copy_remap(p_batch_id, 'companies', rp.company_id), lower(rp.label)
        order by array_position(p_source_org_ids, rp.organisation_id), rp.created_at, rp.id
      )
    ),
    cmp as (
      select r.id, r.label, r.organisation_id,
             (f.match_kind, f.stops, f.anchor_place, f.places, f.bidirectional, f.unit_amount, f.currency, f.priority, f.active)
               is not distinct from
             (r.match_kind, r.stops, r.anchor_place, r.places, r.bidirectional, r.unit_amount, r.currency, r.priority, r.active)
               as identical,
             r.first_id
      from ranked r
      join public.route_prices f on f.id = r.first_id
      where r.rn > 1
    ),
    merged as (
      update public.org_copy_map m
      set new_id = fm.new_id
      from cmp
      join public.org_copy_map fm
        on fm.batch_id = p_batch_id and fm.source_table = 'route_prices' and fm.source_id = cmp.first_id
      where cmp.identical
        and m.batch_id = p_batch_id and m.source_table = 'route_prices' and m.source_id = cmp.id
      returning m.source_id
    )
    insert into _org_copy_rp (id, label, active)
    select cmp.id, cmp.label || ' (from ' || o.name || ')', false
    from cmp
    join public.organisations o on o.id = cmp.organisation_id
    where not cmp.identical;

    perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'route_prices',
      jsonb_build_object(
        'label', 'coalesce((select c.label from _org_copy_rp c where c.id = s.id), s.label)',
        'active', 'coalesce((select c.active from _org_copy_rp c where c.id = s.id), s.active)'
      ));
  end if;

  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'pay_rates');

  -- Operations
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trips',
    jsonb_build_object('generation_key', format(
      'case when s.generation_key is not null and exists (
         select 1 from public.trips t2
         where t2.organisation_id = any (%L::uuid[])
           and t2.organisation_id <> s.organisation_id
           and t2.generation_key = s.generation_key
           and t2.deleted_at is null
       ) then s.generation_key || '':'' || left(s.organisation_id::text, 8)
       else s.generation_key end',
      p_source_org_ids)));
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trip_assignments');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trip_events');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trip_passengers');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trip_audit');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trip_billing_overrides');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'trip_driver_submission_snapshots');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'attendance_events',
    jsonb_build_object('qr_token_id', 'null::uuid'));
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'fuel_fillups');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'payroll_runs');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'payroll_lines');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'driver_inbox_notifications');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'admin_inbox_notifications',
    jsonb_build_object('subject_id', format(
      'coalesce((select x.new_id from public.org_copy_map x where x.batch_id = %L::uuid and x.source_id = s.subject_id and x.source_table <> ''organisation_members'' limit 1), s.subject_id)',
      p_batch_id)));

  -- Billing
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'invoices');
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'invoice_lines');

  -- Maintenance (Drop 1) when present
  if to_regclass('public.workshop_bills') is not null then
    perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'maintenance_categories');
    perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'suppliers');
    perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'workshop_bills',
      jsonb_build_object('attachment_path',
        format('replace(replace(s.attachment_path, s.organisation_id::text, %L), s.id::text, m.new_id::text)', v_target)));
    perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'workshop_bill_lines');
  end if;

  -- Audit log last (entity ids remapped where the entity was copied)
  perform public.org_copy_table(p_batch_id, p_source_org_ids, v_target, 'audit_logs',
    jsonb_build_object('entity_id', format(
      'coalesce((select x.new_id from public.org_copy_map x where x.batch_id = %L::uuid and x.source_id = s.entity_id and x.source_table <> ''organisation_members'' limit 1), s.entity_id)',
      p_batch_id)));

  -- Self-check: no-dedupe tables copy 1:1 and money matches to the cent.
  for v_check in
    select * from (values
      ('trips', 'count(*)'),
      ('trip_assignments', 'count(*)'),
      ('invoices', 'count(*)'),
      ('invoices', 'coalesce(sum(total), 0)'),
      ('invoices', 'coalesce(sum(subtotal), 0)'),
      ('invoice_lines', 'count(*)'),
      ('invoice_lines', 'coalesce(sum(amount), 0)'),
      ('invoice_lines', 'coalesce(sum(unit_price * quantity), 0)'),
      ('invoice_lines', 'count(*) filter (where price_overridden)'),
      ('trip_billing_overrides', 'coalesce(sum(override_unit_price), 0)'),
      ('trips', 'coalesce(sum(manual_unit_price), 0)')
    ) as c(tbl, agg)
  loop
    execute format('select %s from public.%I where organisation_id = any ($1)', v_check.agg, v_check.tbl)
      into v_src_n using p_source_org_ids;
    execute format('select %s from public.%I where organisation_id = $1', v_check.agg, v_check.tbl)
      into v_dst_n using v_target;
    if v_src_n is distinct from v_dst_n then
      raise exception 'org_copy: % % mismatch (source %, target %)', v_check.tbl, v_check.agg, v_src_n, v_dst_n;
    end if;
  end loop;

  perform set_config('app.preserve_audit_actor', 'false', true);
  return v_target;
end;
$$;

revoke all on function public.org_copy_remap(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.org_copy_dedupe(uuid, uuid[], text, text, text) from public, anon, authenticated;
revoke all on function public.org_copy_table(uuid, uuid[], uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.copy_orgs_to_jacobs_org(uuid[], text, text, uuid) from public, anon, authenticated;
grant execute on function public.copy_orgs_to_jacobs_org(uuid[], text, text, uuid) to service_role;

-- =============================================================================
-- generate_driver_weekly_invoice (00051 / 00085 body) + staff-trip sweep.
--   An existing non-void invoice for the driver-week is still returned
--   untouched. Otherwise, completed staff-transport trips for that driver
--   and week that have no invoice line yet go through
--   sync_staff_trip_invoice_line first (manual price, billing override,
--   route price template, then rate card — the same pricing as saving a
--   waybill), and route trips are then added as before.
-- =============================================================================
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
  staff_trip record;
  line_amount numeric;
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

  -- Sweep unbilled completed staff trips (Monday-start weeks only, the same
  -- week sync_staff_trip_invoice_line files them under; skipped when a
  -- non-deleted void invoice holds the week, which sync would refuse).
  if extract(isodow from p_period_start) = 1
     and not exists (
       select 1 from public.invoices i
       where i.organisation_id = p_organisation_id
         and i.driver_id = p_driver_id
         and i.period_start = p_period_start
         and coalesce(i.trip_company, '') = ''
         and i.deleted_at is null
         and i.status = 'void'
     ) then
    for staff_trip in
      select t.id
      from public.trips t
      join public.trip_assignments ta
        on ta.trip_id = t.id
       and ta.organisation_id = t.organisation_id
       and ta.deleted_at is null
       and ta.released_at is null
       and ta.driver_id = p_driver_id
      where t.organisation_id = p_organisation_id
        and t.deleted_at is null
        and t.is_staff_transport
        and t.status = 'completed'
        and not public.driver_submission_pending(t)
        and t.planned_start >= week_start_ts
        and t.planned_start < week_end_ts
        and not exists (select 1 from public.invoice_lines il where il.trip_id = t.id)
      order by t.planned_start, t.id
    loop
      perform public.sync_staff_trip_invoice_line(staff_trip.id, false);
    end loop;
  end if;

  select * into inv
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
  end if;

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
      and not exists (select 1 from public.invoice_lines il where il.trip_id = t.id)
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

  perform public.recalculate_invoice_totals(inv.id);

  select * into inv from public.invoices i where i.id = inv.id;
  return inv;
end;
$$;

revoke all on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) from public, anon;
grant execute on function public.generate_driver_weekly_invoice(uuid, uuid, date, date) to authenticated;
