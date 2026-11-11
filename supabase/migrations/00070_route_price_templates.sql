-- =============================================================================
-- 00070 — Route price templates (optional prefill on top of rate cards)
-- =============================================================================
-- Admins keep default prices per organisation + company + route. When a trip
-- invoice line is created, or its route changes, the matching template pre-fills
-- the price. If nothing matches, pricing stays on the company rate card.
--
-- Seed does not update rate_cards or invoice lines. Existing draft and issued
-- totals are left as they are. Apply this file only after review. Do not run it
-- against the live project from the repo commit itself.
--
-- Matching (highest score wins; priority, then label, breaks ties):
--   exact   300 + stop count * 10   ordered stops; bidirectional also tries the reverse
--   anchor  200                      one end is anchor_place, the other is in places
--   within  100                      every stop is in places (short runs inside an area)
--   either   50                      either end is in places
--   company  10                      any route; used only when no route rule matches
-- A template is applied only when its amount differs from the rate card. An equal
-- amount stays on the rate card so effective-dating is unchanged.
-- Place aliases live in normalize_route_place and must match
-- features/billing/lib/route-price-match.ts (ROUTE_PLACE_ALIASES).

-- ---------------------------------------------------------------------------
-- route_prices
-- ---------------------------------------------------------------------------

create table if not exists public.route_prices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  label text not null,
  match_kind text not null,
  stops text[] not null default '{}',
  anchor_place text,
  places text[] not null default '{}',
  bidirectional boolean not null default true,
  unit_amount numeric(14, 2) not null,
  currency text not null default 'ZAR',
  notes text,
  priority int not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  constraint route_prices_label_nonempty check (char_length(trim(label)) > 0),
  constraint route_prices_amount_nonneg check (unit_amount >= 0),
  constraint route_prices_match_kind_check check (
    match_kind = any (array['exact', 'anchor', 'within', 'either', 'company'])
  ),
  constraint route_prices_exact_check check (
    match_kind <> 'exact' or cardinality(stops) >= 2
  ),
  constraint route_prices_anchor_check check (
    match_kind <> 'anchor'
    or (
      anchor_place is not null
      and char_length(trim(anchor_place)) > 0
      and cardinality(places) >= 1
    )
  ),
  constraint route_prices_list_check check (
    match_kind not in ('within', 'either') or cardinality(places) >= 1
  )
);

comment on table public.route_prices is
  'Optional route defaults that pre-fill a trip price. They do not replace rate cards.';

create index if not exists route_prices_org_company_idx
  on public.route_prices (organisation_id, company_id)
  where deleted_at is null;

create unique index if not exists route_prices_active_label_uidx
  on public.route_prices (organisation_id, company_id, lower(label))
  where deleted_at is null;

drop trigger if exists route_prices_set_updated_at on public.route_prices;
create trigger route_prices_set_updated_at
before update on public.route_prices
for each row execute function public.set_updated_at();

alter table public.route_prices enable row level security;

revoke all on table public.route_prices from public, anon;
grant select, insert, update, delete on table public.route_prices to authenticated;

drop policy if exists route_prices_select on public.route_prices;
create policy route_prices_select on public.route_prices
  for select
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  );

drop policy if exists route_prices_insert on public.route_prices;
create policy route_prices_insert on public.route_prices
  for insert
  with check (
    (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
    and exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.organisation_id = route_prices.organisation_id
        and c.deleted_at is null
    )
  );

drop policy if exists route_prices_update on public.route_prices;
create policy route_prices_update on public.route_prices
  for update
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
  )
  with check (
    (
      public.is_platform_owner()
      or public.has_org_role_names(
        organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
    and exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.organisation_id = route_prices.organisation_id
        and c.deleted_at is null
    )
  );

drop policy if exists route_prices_delete on public.route_prices;
create policy route_prices_delete on public.route_prices
  for delete
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager']
    )
  );

-- ---------------------------------------------------------------------------
-- Trip / line columns. Defaults leave every existing row unchanged.
-- ---------------------------------------------------------------------------

alter table public.trips
  add column if not exists manual_unit_price numeric,
  add column if not exists manual_price_area_key text,
  add column if not exists reprice_on_next_sync boolean not null default false;

alter table public.trips drop constraint if exists trips_manual_unit_price_nonneg;
alter table public.trips
  add constraint trips_manual_unit_price_nonneg
  check (manual_unit_price is null or manual_unit_price >= 0);

comment on column public.trips.manual_unit_price is
  'Per-trip price typed by staff or a driver. Empty means use the route template or rate card. Not an invoice override reason.';
comment on column public.trips.manual_price_area_key is
  'Normalized route key the typed price belongs to. A route change clears it.';
comment on column public.trips.reprice_on_next_sync is
  'Set when the route changes so the next invoice sync may pre-fill. Cleared by sync. Existing rows stay false.';

alter table public.invoice_lines
  add column if not exists route_price_id uuid references public.route_prices (id) on delete set null,
  add column if not exists priced_area_key text;

comment on column public.invoice_lines.route_price_id is
  'Route template used when this line was priced. Null when the line uses the rate card or a typed price.';
comment on column public.invoice_lines.priced_area_key is
  'Normalized route at the time the line was priced. Null on rows written before route templates existed.';
comment on column public.invoice_lines.price_overridden is
  'True when unit_price is not the plain company rate card (route template or a per-line change).';
comment on column public.invoice_lines.override_reason is
  'Set only from trip_billing_overrides. A route template or a typed price leaves this empty. It is not printed.';

-- ---------------------------------------------------------------------------
-- Place normalization and route splitting
-- ---------------------------------------------------------------------------

create or replace function public.normalize_route_place(p_raw text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  s text;
begin
  s := lower(trim(coalesce(p_raw, '')));
  s := replace(s, '&', ' and ');
  s := regexp_replace(s, '[''’]', '', 'g');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  if s like 'the %' then
    s := substr(s, 5);
  end if;
  s := regexp_replace(s, '\mrd\M', 'road', 'g');
  s := regexp_replace(s, '\mst\M', 'street', 'g');
  s := case s
    when 'ctia' then 'airport'
    when 'cape town international' then 'airport'
    when 'cape town international airport' then 'airport'
    when 'cpt airport' then 'airport'
    when 'ss waterfront' then 'southern sun waterfront'
    when 's s waterfront' then 'southern sun waterfront'
    when 'cloud 9' then 'cloud nine'
    when 'garden court vj' then 'garden court victoria junction'
    when 'gcvj' then 'garden court victoria junction'
    when 'waterside va' then 'waterside v and a'
    when 'waterside v a' then 'waterside v and a'
    when 'commodore hotel' then 'commodore'
    when 'harbour house' then 'harbour house camps bay'
    else s
  end;
  return s;
end;
$$;

revoke all on function public.normalize_route_place(text) from public, anon, authenticated;

create or replace function public.split_route_stops(p_area text)
returns text[]
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  s text := coalesce(p_area, '');
begin
  if s ~ '→|->|-->|—>|–>' then
    return regexp_split_to_array(s, '\s*(→|->|-->|—>|–>)\s*');
  elsif position(' / ' in s) > 0 then
    return regexp_split_to_array(s, '\s*/\s*');
  elsif s ~* '\sto\s' then
    return regexp_split_to_array(s, '\s+[Tt][Oo]\s+');
  else
    return array[s];
  end if;
end;
$$;

revoke all on function public.split_route_stops(text) from public, anon, authenticated;

create or replace function public.route_area_key(p_area text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(string_agg(public.normalize_route_place(stop), '|' order by ord), '')
  from unnest(public.split_route_stops(coalesce(p_area, ''))) with ordinality as u(stop, ord)
  where public.normalize_route_place(stop) <> '';
$$;

revoke all on function public.route_area_key(text) from public, anon, authenticated;

create or replace function public.resolve_route_price(
  p_organisation_id uuid,
  p_company_id uuid,
  p_area_text text
)
returns table (
  route_price_id uuid,
  unit_amount numeric,
  label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_stops text[];
  v_first text;
  v_last text;
  r record;
  v_score int;
  v_best_score int;
  v_best_priority int;
  v_best_label text;
  v_best_id uuid;
  v_best_amount numeric;
  v_want text[];
  v_rev text[];
  v_anchor text;
  v_members text[];
  v_stop text;
  v_ok boolean;
begin
  if p_company_id is null then
    return;
  end if;

  select coalesce(array_agg(n.s order by n.ord), '{}'::text[])
  into v_stops
  from (
    select public.normalize_route_place(u.stop) as s, u.ord
    from unnest(public.split_route_stops(coalesce(p_area_text, ''))) with ordinality as u(stop, ord)
  ) n
  where n.s <> '';

  if v_stops is null then
    v_stops := '{}'::text[];
  end if;

  v_first := v_stops[1];
  v_last := v_stops[cardinality(v_stops)];

  for r in
    select rp.*
    from public.route_prices rp
    where rp.organisation_id = p_organisation_id
      and rp.company_id = p_company_id
      and rp.deleted_at is null
      and rp.active
  loop
    v_score := null;

    if r.match_kind = 'company' then
      v_score := 10;
    elsif coalesce(cardinality(v_stops), 0) >= 2 and r.match_kind = 'exact' then
      select coalesce(array_agg(public.normalize_route_place(x) order by ord), '{}'::text[])
      into v_want
      from unnest(r.stops) with ordinality as u(x, ord)
      where public.normalize_route_place(x) <> '';

      if coalesce(cardinality(v_want), 0) >= 2 and v_stops = v_want then
        v_score := 300 + cardinality(v_want) * 10;
      elsif r.bidirectional and coalesce(cardinality(v_want), 0) >= 2 then
        select coalesce(array_agg(x order by ord desc), '{}'::text[])
        into v_rev
        from unnest(v_want) with ordinality as u(x, ord);
        if v_stops = v_rev then
          v_score := 300 + cardinality(v_want) * 10;
        end if;
      end if;
    elsif coalesce(cardinality(v_stops), 0) >= 2 and r.match_kind = 'anchor' then
      v_anchor := public.normalize_route_place(coalesce(r.anchor_place, ''));
      select coalesce(array_agg(distinct public.normalize_route_place(x)), '{}'::text[])
      into v_members
      from unnest(r.places) as u(x)
      where public.normalize_route_place(x) <> '';
      if v_anchor <> '' and coalesce(cardinality(v_members), 0) >= 1 then
        if v_first = v_anchor and v_last = any (v_members) then
          v_score := 200;
        elsif r.bidirectional and v_last = v_anchor and v_first = any (v_members) then
          v_score := 200;
        end if;
      end if;
    elsif coalesce(cardinality(v_stops), 0) >= 2 and r.match_kind = 'within' then
      select coalesce(array_agg(distinct public.normalize_route_place(x)), '{}'::text[])
      into v_members
      from unnest(r.places) as u(x)
      where public.normalize_route_place(x) <> '';
      v_ok := coalesce(cardinality(v_members), 0) >= 1;
      if v_ok then
        foreach v_stop in array v_stops loop
          if not (v_stop = any (v_members)) then
            v_ok := false;
          end if;
        end loop;
      end if;
      if v_ok then
        v_score := 100;
      end if;
    elsif coalesce(cardinality(v_stops), 0) >= 2 and r.match_kind = 'either' then
      select coalesce(array_agg(distinct public.normalize_route_place(x)), '{}'::text[])
      into v_members
      from unnest(r.places) as u(x)
      where public.normalize_route_place(x) <> '';
      if coalesce(cardinality(v_members), 0) >= 1
         and (v_first = any (v_members) or v_last = any (v_members)) then
        v_score := 50;
      end if;
    end if;

    if v_score is not null and (
      v_best_score is null
      or v_score > v_best_score
      or (
        v_score = v_best_score
        and r.priority > v_best_priority
      )
      or (
        v_score = v_best_score
        and r.priority = v_best_priority
        and r.label < v_best_label
      )
    ) then
      v_best_score := v_score;
      v_best_priority := r.priority;
      v_best_label := r.label;
      v_best_id := r.id;
      v_best_amount := r.unit_amount;
    end if;
  end loop;

  if v_best_id is null then
    return;
  end if;

  route_price_id := v_best_id;
  unit_amount := v_best_amount;
  label := v_best_label;
  return next;
end;
$$;

revoke all on function public.resolve_route_price(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.suggest_trip_unit_price(
  p_organisation_id uuid,
  p_company_id uuid,
  p_area_text text,
  p_trip_date date default null
)
returns table (
  unit_amount numeric,
  price_source text,
  route_price_id uuid,
  rate_card_id uuid,
  label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_trip_date date;
  v_route_id uuid;
  v_route_amount numeric;
  v_route_label text;
  v_card_amount numeric;
  v_card_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.staff_can_manage_trips(p_organisation_id)
    or public.has_org_role_names(p_organisation_id, array['driver'])
  ) then
    raise exception 'Not authorised';
  end if;

  v_trip_date := coalesce(
    p_trip_date,
    (timezone('utc', now()) at time zone 'Africa/Johannesburg')::date
  );

  select rp.route_price_id, rp.unit_amount, rp.label
  into v_route_id, v_route_amount, v_route_label
  from public.resolve_route_price(p_organisation_id, p_company_id, p_area_text) rp;

  select x.unit_amount, x.rate_card_id
  into v_card_amount, v_card_id
  from public.resolve_trip_line_rate(p_organisation_id, p_company_id, v_trip_date) x;

  if v_route_id is not null
     and v_card_amount is not null
     and round(v_route_amount, 2) is distinct from round(v_card_amount, 2) then
    unit_amount := v_route_amount;
    price_source := 'route_price';
    route_price_id := v_route_id;
    rate_card_id := v_card_id;
    label := v_route_label;
  elsif v_card_amount is not null then
    unit_amount := v_card_amount;
    price_source := 'rate_card';
    route_price_id := null;
    rate_card_id := v_card_id;
    label := 'Company rate';
  elsif v_route_id is not null then
    unit_amount := v_route_amount;
    price_source := 'route_price';
    route_price_id := v_route_id;
    rate_card_id := null;
    label := v_route_label;
  else
    unit_amount := null;
    price_source := 'none';
    route_price_id := null;
    rate_card_id := null;
    label := null;
  end if;

  return next;
end;
$$;

revoke all on function public.suggest_trip_unit_price(uuid, uuid, text, date) from public, anon;
grant execute on function public.suggest_trip_unit_price(uuid, uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- sync_staff_trip_invoice_line — template prefill, without rewriting snapshots
-- ---------------------------------------------------------------------------

create or replace function public.sync_staff_trip_invoice_line(
  p_trip_id uuid,
  p_remove boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_driver_id uuid;
  v_bounds record;
  v_bill_to uuid;
  inv public.invoices%rowtype;
  v_rate numeric;
  v_rate_card_id uuid;
  v_rate_effective_on date;
  v_line_amount numeric;
  v_description text;
  v_line_id uuid;
  v_old_invoice_id uuid;
  v_trip_date date;
  v_existing_trip_company_id uuid;
  v_existing_rate_card_id uuid;
  v_existing_unit_price numeric;
  v_existing_rate_effective_on date;
  v_existing_price_overridden boolean;
  v_existing_override_reason text;
  v_existing_route_price_id uuid;
  v_existing_priced_area_key text;
  v_preserve_rate boolean := false;
  v_override numeric;
  v_override_reason text;
  v_price_overridden boolean := false;
  v_area_key text;
  v_route_price_id uuid := null;
  v_matched_route_id uuid;
  v_matched_route_amount numeric;
  v_card_amount numeric;
  v_card_id uuid;
  v_card_effective date;
  v_route_changed boolean := false;
  v_use_route boolean := false;
  v_can_preserve boolean := false;
begin
  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    return null;
  end if;

  select il.id, il.invoice_id
  into v_line_id, v_old_invoice_id
  from public.invoice_lines il
  where il.trip_id = p_trip_id
  limit 1;

  if p_remove or t.status = 'cancelled' then
    if v_line_id is not null then
      select * into inv
      from public.invoices i
      where i.id = v_old_invoice_id
        and i.deleted_at is null;

      if found and inv.status <> 'draft' then
        raise exception 'Cannot remove line: invoice is % (only draft invoices can be synced)', inv.status;
      end if;

      delete from public.invoice_lines where id = v_line_id;
      if v_old_invoice_id is not null then
        perform public.recalculate_invoice_totals(v_old_invoice_id);
      end if;
    end if;
    update public.trips
    set reprice_on_next_sync = false
    where id = p_trip_id
      and reprice_on_next_sync;
    return null;
  end if;

  if t.status <> 'completed' then
    return null;
  end if;

  if public.driver_submission_pending(t) then
    return null;
  end if;

  select ta.driver_id into v_driver_id
  from public.trip_assignments ta
  where ta.trip_id = p_trip_id
    and ta.organisation_id = t.organisation_id
    and ta.deleted_at is null
    and ta.released_at is null
  limit 1;

  if v_driver_id is null then
    raise exception 'Trip has no active driver assignment';
  end if;

  if t.company_id is null then
    raise exception 'Trip company is not set';
  end if;

  v_trip_date := (t.planned_start at time zone 'Africa/Johannesburg')::date;
  select * into v_bounds from public.service_week_bounds_sast(t.planned_start);
  v_area_key := public.route_area_key(coalesce(t.area_text, ''));

  select bo.override_unit_price, bo.reason
  into v_override, v_override_reason
  from public.trip_billing_overrides bo
  where bo.trip_id = p_trip_id;

  -- A price typed for this route wins, with an empty invoice reason.
  -- A saved billing override still wins when nothing was typed for this route,
  -- so existing overrides keep their amount and reason.
  if t.manual_unit_price is not null
     and t.manual_price_area_key is not distinct from v_area_key then
    v_rate := t.manual_unit_price;
    v_price_overridden := true;
    v_override_reason := null;
    v_route_price_id := null;
    select x.rate_card_id, x.rate_effective_on
    into v_rate_card_id, v_rate_effective_on
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date) x;
    v_rate_effective_on := coalesce(v_rate_effective_on, v_trip_date);
  elsif v_override is not null then
    v_rate := v_override;
    v_rate_card_id := null;
    v_rate_effective_on := v_trip_date;
    v_price_overridden := true;
  else
    v_override_reason := null;
    v_price_overridden := false;

    if v_line_id is not null then
      select
        il.trip_company_id,
        il.rate_card_id,
        il.unit_price,
        il.rate_effective_on,
        il.price_overridden,
        il.override_reason,
        il.route_price_id,
        il.priced_area_key
      into
        v_existing_trip_company_id,
        v_existing_rate_card_id,
        v_existing_unit_price,
        v_existing_rate_effective_on,
        v_existing_price_overridden,
        v_existing_override_reason,
        v_existing_route_price_id,
        v_existing_priced_area_key
      from public.invoice_lines il
      where il.id = v_line_id;
    end if;

    select rp.route_price_id, rp.unit_amount
    into v_matched_route_id, v_matched_route_amount
    from public.resolve_route_price(t.organisation_id, t.company_id, t.area_text) rp;

    select x.unit_amount, x.rate_card_id, x.rate_effective_on
    into v_card_amount, v_card_id, v_card_effective
    from public.resolve_trip_line_rate(t.organisation_id, t.company_id, v_trip_date) x;

    v_route_changed := t.reprice_on_next_sync
      or (
        v_existing_priced_area_key is not null
        and v_existing_priced_area_key is distinct from v_area_key
      );

    v_use_route := v_matched_route_id is not null
      and v_card_amount is not null
      and round(v_matched_route_amount, 2) is distinct from round(v_card_amount, 2);

    v_can_preserve := v_line_id is not null
      and v_existing_trip_company_id = t.company_id
      and v_existing_rate_card_id is not null
      and v_existing_unit_price is not null;

    if v_can_preserve and not v_route_changed then
      -- Unchanged route: keep the snapshotted amount, including lines written
      -- before templates existed (priced_area_key is null).
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
      v_price_overridden := coalesce(v_existing_price_overridden, false);
      v_override_reason := v_existing_override_reason;
      v_route_price_id := v_existing_route_price_id;
    elsif v_can_preserve
      and v_route_changed
      and not v_use_route
      and v_existing_route_price_id is null
      and coalesce(v_existing_price_overridden, false) = false then
      -- Route changed but no template applies, and the line was a plain rate-card
      -- price. Leave that snapshot alone (same as before templates existed).
      v_preserve_rate := true;
      v_rate := v_existing_unit_price;
      v_rate_card_id := v_existing_rate_card_id;
      v_rate_effective_on := v_existing_rate_effective_on;
      v_price_overridden := false;
      v_override_reason := null;
      v_route_price_id := null;
    elsif v_use_route then
      v_rate := v_matched_route_amount;
      v_rate_card_id := v_card_id;
      v_rate_effective_on := coalesce(v_card_effective, v_trip_date);
      v_price_overridden := true;
      v_override_reason := null;
      v_route_price_id := v_matched_route_id;
    else
      if v_card_amount is null then
        raise exception 'No trip rate configured for this company. Add a rate before saving this waybill.';
      end if;
      v_rate := v_card_amount;
      v_rate_card_id := v_card_id;
      v_rate_effective_on := v_card_effective;
      v_price_overridden := false;
      v_override_reason := null;
      v_route_price_id := null;
    end if;
  end if;

  v_bill_to := public.resolve_invoice_bill_to_company_id(t.organisation_id);
  if v_bill_to is null then
    raise exception 'Bill-to company not configured (set organisations.settings.invoice_bill_to_company_id or add WCL Trading CC)';
  end if;

  select * into inv
  from public.invoices i
  where i.organisation_id = t.organisation_id
    and i.driver_id = v_driver_id
    and i.period_start = v_bounds.period_start
    and (
      i.period_end = v_bounds.period_end
      or i.period_end = v_bounds.period_end + 1
    )
    and coalesce(i.trip_company, '') = ''
    and i.deleted_at is null
  limit 1;

  if found and inv.status <> 'draft' then
    raise exception 'Cannot add trip line: weekly invoice is % (must be draft)', inv.status;
  end if;

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
      t.organisation_id,
      v_bill_to,
      v_driver_id,
      v_bounds.period_start,
      v_bounds.period_end,
      'draft',
      auth.uid(),
      format(
        'Invoice date %s (Monday after Sunday %s)',
        to_char(v_bounds.period_end + 1, 'DD/MM/YYYY'),
        to_char(v_bounds.period_end, 'DD/MM/YYYY')
      )
    )
    returning * into inv;
  end if;

  v_line_amount := round(v_rate, 2);
  v_description := public.staff_trip_invoice_line_description(t);

  if v_line_id is not null and v_old_invoice_id is distinct from inv.id then
    delete from public.invoice_lines where id = v_line_id;
    perform public.recalculate_invoice_totals(v_old_invoice_id);
    v_line_id := null;
  end if;

  if v_line_id is null then
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
      amount,
      price_overridden,
      override_reason,
      route_price_id,
      priced_area_key
    )
    values (
      t.organisation_id,
      inv.id,
      'trip',
      v_rate_card_id,
      p_trip_id,
      t.company_id,
      v_rate_effective_on,
      v_description,
      1,
      v_rate,
      v_line_amount,
      v_price_overridden,
      v_override_reason,
      v_route_price_id,
      v_area_key
    )
    returning id into v_line_id;
  else
    update public.invoice_lines
    set invoice_id = inv.id,
        rate_card_id = v_rate_card_id,
        trip_company_id = t.company_id,
        rate_effective_on = v_rate_effective_on,
        description = v_description,
        quantity = 1,
        unit_price = v_rate,
        amount = v_line_amount,
        price_overridden = v_price_overridden,
        override_reason = v_override_reason,
        route_price_id = v_route_price_id,
        priced_area_key = v_area_key
    where id = v_line_id;
  end if;

  perform public.recalculate_invoice_totals(inv.id);

  update public.trips
  set reprice_on_next_sync = false
  where id = p_trip_id
    and reprice_on_next_sync;

  return v_line_id;
end;
$$;

revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public, anon;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Draft line edit: a changed price is overridden with an empty reason
-- ---------------------------------------------------------------------------

create or replace function public.update_draft_invoice_line(
  p_line_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric
)
returns public.invoice_lines
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  line public.invoice_lines%rowtype;
  inv public.invoices%rowtype;
  can_manage boolean;
  trimmed_description text;
  line_amount numeric;
  invoice_total numeric;
  v_price_changed boolean;
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
  v_price_changed := round(p_unit_price, 2) is distinct from round(line.unit_price, 2);

  update public.invoice_lines
  set description = trimmed_description,
      quantity = p_quantity,
      unit_price = p_unit_price,
      amount = line_amount,
      price_overridden = case when v_price_changed then true else line.price_overridden end,
      override_reason = case when v_price_changed then null else line.override_reason end,
      route_price_id = case when v_price_changed then null else line.route_price_id end
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

revoke all on function public.update_draft_invoice_line(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.update_draft_invoice_line(uuid, text, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- update_staff_trip — route change flags a prefill; typed price has no invoice reason
-- ---------------------------------------------------------------------------

drop function if exists public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text
);

create or replace function public.update_staff_trip(
  p_trip_id uuid,
  p_planned_start timestamptz default null,
  p_company_id uuid default null,
  p_staff_company public.staff_transport_company default null,
  p_area_text text default null,
  p_pax_count int default null,
  p_total_km numeric default null,
  p_notes text default null,
  p_vehicle_id uuid default null,
  p_edit_reason text default null,
  p_unit_price numeric default null,
  p_apply_unit_price boolean default false
)
returns public.trips
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t public.trips%rowtype;
  v_company_id uuid;
  v_driver_id uuid;
  v_reason text;
  v_old_vehicle uuid;
  v_new_area text;
  v_old_key text;
  v_new_key text;
  v_route_changed boolean;
  v_manual_price numeric;
  v_manual_key text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trips where id = p_trip_id and deleted_at is null;
  if not found then
    raise exception 'Trip not found';
  end if;

  if not t.is_staff_transport then
    raise exception 'Not a staff transport trip';
  end if;

  if not public.staff_can_manage_trips(t.organisation_id) then
    raise exception 'Not authorised';
  end if;

  if t.status = 'cancelled' then
    raise exception 'Cannot update cancelled trip';
  end if;

  if t.status::text not in ('assigned', 'planned', 'completed') then
    raise exception 'Cannot update trip in status %', t.status;
  end if;

  v_reason := trim(coalesce(p_edit_reason, ''));
  if v_reason = '' then
    raise exception 'Edit reason is required';
  end if;

  if t.status = 'completed' or exists (
    select 1 from public.invoice_lines il where il.trip_id = p_trip_id
  ) then
    perform public.assert_staff_trip_invoice_editable(p_trip_id);
  end if;

  if p_company_id is not null then
    if not exists (
      select 1 from public.companies c
      where c.id = p_company_id
        and c.organisation_id = t.organisation_id
        and c.deleted_at is null
        and c.status = 'active'
    ) then
      raise exception 'Company not found or inactive';
    end if;
    v_company_id := p_company_id;
  elsif p_staff_company is not null then
    v_company_id := public.resolve_staff_company_id(t.organisation_id, p_staff_company);
  else
    v_company_id := t.company_id;
  end if;

  if p_vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id
        and v.organisation_id = t.organisation_id
        and v.deleted_at is null
        and v.status = 'active'
    ) then
      raise exception 'Vehicle not found or inactive';
    end if;
  end if;

  if p_apply_unit_price and p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  v_new_area := case
    when p_area_text is null then t.area_text
    else coalesce(nullif(trim(p_area_text), ''), t.area_text)
  end;
  v_old_key := public.route_area_key(coalesce(t.area_text, ''));
  v_new_key := public.route_area_key(coalesce(v_new_area, ''));
  v_route_changed := v_old_key is distinct from v_new_key;

  if p_apply_unit_price then
    v_manual_price := p_unit_price;
    v_manual_key := case when p_unit_price is null then null else v_new_key end;
  elsif v_route_changed or v_company_id is distinct from t.company_id then
    -- A typed price belonged to the previous route or company.
    v_manual_price := null;
    v_manual_key := null;
  else
    v_manual_price := t.manual_unit_price;
    v_manual_key := t.manual_price_area_key;
  end if;

  if p_planned_start is not null and p_planned_start is distinct from t.planned_start then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'planned_start',
      t.planned_start::text, p_planned_start::text, v_reason
    );
  end if;

  if v_company_id is distinct from t.company_id then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'company_id',
      t.company_id::text, v_company_id::text, v_reason
    );
  end if;

  if p_staff_company is not null and p_staff_company is distinct from t.staff_company then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'staff_company',
      t.staff_company::text, p_staff_company::text, v_reason
    );
  end if;

  if p_area_text is not null and nullif(trim(p_area_text), '') is distinct from t.area_text then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'area_text',
      t.area_text, nullif(trim(p_area_text), ''), v_reason
    );
  end if;

  if p_pax_count is not null and p_pax_count is distinct from t.pax_count then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'pax_count',
      t.pax_count::text, p_pax_count::text, v_reason
    );
  end if;

  if p_total_km is not null and p_total_km is distinct from t.total_km then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'total_km',
      t.total_km::text, p_total_km::text, v_reason
    );
  end if;

  if p_notes is not null and nullif(trim(p_notes), '') is distinct from coalesce(t.notes, '') then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'notes',
      t.notes, nullif(trim(p_notes), ''), v_reason
    );
  elsif p_notes is not null and trim(p_notes) = '' and coalesce(t.notes, '') <> '' then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'notes', t.notes, null, v_reason
    );
  end if;

  if p_apply_unit_price and p_unit_price is distinct from t.manual_unit_price then
    perform public.log_trip_audit(
      t.organisation_id, p_trip_id, 'manual_unit_price',
      t.manual_unit_price::text, p_unit_price::text, v_reason
    );
  end if;

  update public.trips
  set
    staff_company = coalesce(p_staff_company, staff_company),
    company_id = v_company_id,
    planned_start = coalesce(p_planned_start, planned_start),
    area_text = case
      when p_area_text is null then area_text
      else coalesce(nullif(trim(p_area_text), ''), area_text)
    end,
    pax_count = coalesce(p_pax_count, pax_count),
    total_km = coalesce(p_total_km, total_km),
    notes = case
      when p_notes is null then notes
      else nullif(trim(p_notes), '')
    end,
    closing_km = case
      when t.status = 'completed' and p_total_km is not null then p_total_km
      else closing_km
    end,
    manual_unit_price = v_manual_price,
    manual_price_area_key = v_manual_key,
    reprice_on_next_sync = v_route_changed or reprice_on_next_sync
  where id = p_trip_id
  returning * into t;

  if p_vehicle_id is not null then
    select ta.vehicle_id into v_old_vehicle
    from public.trip_assignments ta
    where ta.trip_id = p_trip_id
      and ta.deleted_at is null
      and ta.released_at is null
    limit 1;

    if v_old_vehicle is distinct from p_vehicle_id then
      perform public.log_trip_audit(
        t.organisation_id, p_trip_id, 'vehicle_id',
        v_old_vehicle::text, p_vehicle_id::text, v_reason
      );
      update public.trip_assignments
      set vehicle_id = p_vehicle_id
      where trip_id = p_trip_id
        and deleted_at is null
        and released_at is null;
    end if;
  end if;

  if t.status = 'completed' then
    perform public.sync_staff_trip_invoice_line(p_trip_id, false);
  else
    select ta.driver_id into v_driver_id
    from public.trip_assignments ta
    where ta.trip_id = p_trip_id
      and ta.released_at is null
      and ta.deleted_at is null
    limit 1;

    if v_driver_id is not null then
      perform public.enqueue_driver_notification(
        t.organisation_id,
        v_driver_id,
        'trip_updated',
        'Trip updated',
        format(
          'Waybill updated: %s at %s, %s',
          coalesce(
            (select c.name from public.companies c where c.id = t.company_id),
            public.staff_company_display_name(t.staff_company)
          ),
          to_char(t.planned_start at time zone 'Africa/Johannesburg', 'HH24:MI'),
          t.area_text
        ),
        p_trip_id
      );
    end if;
  end if;

  return t;
end;
$$;

revoke all on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, numeric, boolean
) from public, anon;
grant execute on function public.update_staff_trip(
  uuid, timestamptz, uuid, public.staff_transport_company, text, int, numeric, text, uuid, text, numeric, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_staff_trip — optional typed price before the invoice sync
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean
);

create or replace function public.admin_create_staff_trip(
  p_organisation_id uuid,
  p_driver_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_vehicle_id uuid,
  p_total_km numeric,
  p_notes text default null,
  p_mark_completed boolean default false,
  p_unit_price numeric default null,
  p_apply_unit_price boolean default false
)
returns table (trip_id uuid, duplicate_warning boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pickup text;
  v_dropoff text;
  v_area text;
  v_locations text;
  v_trip_id uuid;
  v_warn boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.staff_can_manage_trips(p_organisation_id) then
    raise exception 'Not authorised';
  end if;

  v_pickup := trim(coalesce(p_pickup, ''));
  v_dropoff := trim(coalesce(p_dropoff, ''));
  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if p_apply_unit_price and p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  if not exists (
    select 1 from public.drivers d
    where d.id = p_driver_id
      and d.organisation_id = p_organisation_id
      and d.deleted_at is null
  ) then
    raise exception 'Driver not found';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
      and c.status = 'active'
  ) then
    raise exception 'Company not found or inactive';
  end if;

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id
      and v.organisation_id = p_organisation_id
      and v.deleted_at is null
      and v.status = 'active'
  ) then
    raise exception 'Vehicle not found or inactive';
  end if;

  v_area := v_pickup || ' → ' || v_dropoff;
  v_locations := v_pickup || ' / ' || v_dropoff;

  v_warn := public.driver_trip_duplicate_warning(
    p_organisation_id,
    p_driver_id,
    p_company_id,
    p_planned_start,
    v_area
  );

  if p_mark_completed then
    perform public.assert_staff_waybill_billing_ready(
      p_organisation_id,
      p_company_id,
      p_planned_start
    );
  end if;

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    area_text,
    service_locations,
    pax_count,
    total_km,
    notes,
    submitted_by_driver,
    created_by,
    manual_unit_price,
    manual_price_area_key
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    (case when p_mark_completed then 'completed' else 'planned' end)::public.trip_status,
    true,
    v_area,
    v_locations,
    p_pax_count,
    p_total_km,
    nullif(trim(coalesce(p_notes, '')), ''),
    false,
    auth.uid(),
    case when p_apply_unit_price then p_unit_price else null end,
    case
      when p_apply_unit_price and p_unit_price is not null then public.route_area_key(v_area)
      else null
    end
  )
  returning id into v_trip_id;

  insert into public.trip_assignments (
    organisation_id,
    trip_id,
    driver_id,
    vehicle_id,
    assigned_by
  )
  values (
    p_organisation_id,
    v_trip_id,
    p_driver_id,
    p_vehicle_id,
    auth.uid()
  );

  perform public.log_trip_audit(
    p_organisation_id,
    v_trip_id,
    'created',
    null,
    'admin_manual',
    'Admin manual trip'
  );

  if p_mark_completed then
    update public.trips
    set
      staff_completed_at = timezone('utc', now()),
      opening_km = 0,
      closing_km = coalesce(p_total_km, 0),
      total_km = coalesce(p_total_km, 0)
    where id = v_trip_id;

    perform public.sync_staff_trip_invoice_line(v_trip_id, false);
  end if;

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean, numeric, boolean
) from public, anon;
grant execute on function public.admin_create_staff_trip(
  uuid, uuid, timestamptz, text, text, uuid, int, uuid, numeric, text, boolean, numeric, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_driver_trip — same optional typed price; invoice sync stays on approval
-- ---------------------------------------------------------------------------

drop function if exists public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text
);

create or replace function public.submit_driver_trip(
  p_organisation_id uuid,
  p_planned_start timestamptz,
  p_pickup text,
  p_dropoff text,
  p_company_id uuid,
  p_pax_count int,
  p_total_km numeric,
  p_notes text default null,
  p_unit_price numeric default null,
  p_apply_unit_price boolean default false
)
returns table (trip_id uuid, duplicate_warning boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_driver_id uuid;
  v_pickup text;
  v_dropoff text;
  v_area text;
  v_locations text;
  v_trip_id uuid;
  v_warn boolean;
  v_trip public.trips%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_driver_id := public.current_driver_id(p_organisation_id);
  if v_driver_id is null then
    raise exception 'Driver profile not found for this organisation';
  end if;

  if not public.has_org_role_names(p_organisation_id, array['driver']) then
    raise exception 'Only drivers can submit trips';
  end if;

  v_pickup := trim(coalesce(p_pickup, ''));
  v_dropoff := trim(coalesce(p_dropoff, ''));
  if v_pickup = '' or v_dropoff = '' then
    raise exception 'Pickup and drop-off are required';
  end if;

  if p_apply_unit_price and p_unit_price is not null and p_unit_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  if p_pax_count is null or p_pax_count < 0 then
    raise exception 'Pax count must be non-negative';
  end if;

  if p_total_km is null or p_total_km < 0 then
    raise exception 'Km must be non-negative';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.organisation_id = p_organisation_id
      and c.deleted_at is null
      and c.status = 'active'
  ) then
    raise exception 'Company not found or inactive';
  end if;

  v_area := v_pickup || ' → ' || v_dropoff;
  v_locations := v_pickup || ' / ' || v_dropoff;

  v_warn := public.driver_trip_duplicate_warning(
    p_organisation_id,
    v_driver_id,
    p_company_id,
    p_planned_start,
    v_area
  );

  insert into public.trips (
    organisation_id,
    route_id,
    company_id,
    planned_start,
    status,
    is_staff_transport,
    area_text,
    service_locations,
    pax_count,
    total_km,
    notes,
    submitted_by_driver,
    approved_by,
    approved_at,
    rejected_reason,
    created_by,
    manual_unit_price,
    manual_price_area_key
  )
  values (
    p_organisation_id,
    null,
    p_company_id,
    p_planned_start,
    'planned'::public.trip_status,
    true,
    v_area,
    v_locations,
    p_pax_count,
    p_total_km,
    nullif(trim(coalesce(p_notes, '')), ''),
    true,
    null,
    null,
    null,
    auth.uid(),
    case when p_apply_unit_price then p_unit_price else null end,
    case
      when p_apply_unit_price and p_unit_price is not null then public.route_area_key(v_area)
      else null
    end
  )
  returning id into v_trip_id;

  insert into public.trip_assignments (
    organisation_id,
    trip_id,
    driver_id,
    vehicle_id,
    assigned_by
  )
  values (
    p_organisation_id,
    v_trip_id,
    v_driver_id,
    null,
    auth.uid()
  );

  select * into v_trip from public.trips where id = v_trip_id;

  insert into public.trip_driver_submission_snapshots (trip_id, organisation_id, payload)
  values (
    v_trip_id,
    p_organisation_id,
    jsonb_build_object(
      'trip', to_jsonb(v_trip),
      'assignment', jsonb_build_object(
        'driver_id', v_driver_id,
        'vehicle_id', null
      ),
      'submitted_at', timezone('utc', now())
    )
  );

  trip_id := v_trip_id;
  duplicate_warning := v_warn;
  return next;
end;
$$;

revoke all on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text, numeric, boolean
) from public, anon;
grant execute on function public.submit_driver_trip(
  uuid, timestamptz, text, text, uuid, int, numeric, text, numeric, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed defaults from the 11 Nov 2026 pricing reference.
-- Inserts route_prices only. Skips a row when the org or company name is missing.
-- Seed does not update rate_cards or invoice lines.
-- ---------------------------------------------------------------------------

create or replace function public._seed_route_price(
  p_org_key text,
  p_company_names text[],
  p_label text,
  p_match_kind text,
  p_stops text[],
  p_anchor text,
  p_places text[],
  p_bidirectional boolean,
  p_amount numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
  v_company uuid;
  v_orgs int;
begin
  select count(*) into v_orgs
  from public.organisations o
  where o.deleted_at is null
    and (
      lower(btrim(o.name)) in (
        p_org_key,
        p_org_key || ' org',
        p_org_key || ' organisation'
      )
      or lower(btrim(o.slug)) in (p_org_key, p_org_key || '-org')
    );

  if v_orgs = 0 then
    raise notice 'route price seed: no organisation named % org', p_org_key;
    return;
  end if;

  for v_org in
    select o.id
    from public.organisations o
    where o.deleted_at is null
      and (
        lower(btrim(o.name)) in (
          p_org_key,
          p_org_key || ' org',
          p_org_key || ' organisation'
        )
        or lower(btrim(o.slug)) in (p_org_key, p_org_key || '-org')
      )
  loop
    select c.id into v_company
    from public.companies c
    where c.organisation_id = v_org
      and c.deleted_at is null
      and lower(btrim(c.name)) in (
        select lower(btrim(x)) from unnest(p_company_names) as x
      )
    order by c.created_at
    limit 1;

    if v_company is null then
      raise notice 'route price seed skipped (%): company % not found', p_label, p_company_names;
      continue;
    end if;

    if exists (
      select 1
      from public.route_prices rp
      where rp.organisation_id = v_org
        and rp.company_id = v_company
        and lower(rp.label) = lower(p_label)
        and rp.deleted_at is null
    ) then
      continue;
    end if;

    insert into public.route_prices (
      organisation_id,
      company_id,
      label,
      match_kind,
      stops,
      anchor_place,
      places,
      bidirectional,
      unit_amount,
      currency,
      notes,
      priority,
      active
    )
    values (
      v_org,
      v_company,
      p_label,
      p_match_kind,
      coalesce(p_stops, '{}'::text[]),
      nullif(btrim(coalesce(p_anchor, '')), ''),
      coalesce(p_places, '{}'::text[]),
      coalesce(p_bidirectional, false),
      p_amount,
      'ZAR',
      p_notes,
      0,
      true
    );
  end loop;
end;
$$;

revoke all on function public._seed_route_price(
  text, text[], text, text, text[], text, text[], boolean, numeric, text
) from public, anon, authenticated;

-- Fadia Org — WNS (rate card stays R450)
select public._seed_route_price(
  'fadia', array['wns'],
  'Airport ↔ listed hotels',
  'anchor', array[]::text[], 'Airport',
  array['Cullinan', 'Protea Fire & Ice', 'Protea Sea Point', 'Queen Victoria', 'Southern Sun Waterfront', 'Rockefeller', 'Onomo', 'Radisson Red', 'Waterfront Village'],
  true, 410,
  '11 Nov 2026 reference. Airport and one of these hotels, either direction. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Short runs among Crystal Towers, Coral Grove, Claremont, Bridge Park, Heron Crescent',
  'within', array[]::text[], null,
  array['Crystal Towers', 'Coral Grove', 'Claremont', 'Bridge Park', 'Heron Crescent'],
  true, 430,
  '11 Nov 2026 reference. Every stop is one of these places. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Crystal Towers ↔ Airport',
  'exact', array['Crystal Towers', 'Airport'], null, array[]::text[],
  true, 430,
  '11 Nov 2026 reference. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Restaurant run (Tang or Waterside V&A)',
  'either', array[]::text[], null,
  array['Tang', 'Waterside V&A'],
  true, 500,
  '11 Nov 2026 reference. Either end is Tang or Waterside V&A. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Radisson Blu → Black River Park',
  'exact', array['Radisson Blu', 'Black River Park'], null, array[]::text[],
  false, 500,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'AC Marriott Waterfront ↔ Airport or Black River Park',
  'anchor', array[]::text[], 'AC Marriott Waterfront',
  array['Airport', 'Black River Park'],
  true, 590,
  '11 Nov 2026 reference. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Bridge Park → Crystal Towers',
  'exact', array['Bridge Park', 'Crystal Towers'], null, array[]::text[],
  false, 590,
  '11 Nov 2026 reference. This direction only; the reverse stays on the short-run price. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Harbour House Camps Bay → Southern Sun Waterfront → Crystal Towers',
  'exact', array['Harbour House Camps Bay', 'Southern Sun Waterfront', 'Crystal Towers'], null, array[]::text[],
  false, 640,
  '11 Nov 2026 reference. All three stops, this order. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Bridge Park → Protea North Wharf',
  'exact', array['Bridge Park', 'Protea North Wharf'], null, array[]::text[],
  false, 660,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Waterside V&A → 29 Queens Road Sea Point',
  'exact', array['Waterside V&A', '29 Queens Rd Sea Point'], null, array[]::text[],
  false, 660,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'Black River Park → Radisson Blu',
  'exact', array['Black River Park', 'Radisson Blu'], null, array[]::text[],
  false, 1180,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['wns'],
  'WNS Claremont → 29 Queens Road Sea Point',
  'exact', array['WNS Claremont', '29 Queens Rd Sea Point'], null, array[]::text[],
  false, 1500,
  '11 Nov 2026 reference. WNS Claremont is not the Claremont short-run place. Founder to confirm.'
);

-- Fadia Org — Springbok Atlas (rate card stays R440)
select public._seed_route_price(
  'fadia', array['springbok atlas'],
  'CTIA → Garden Court Victoria Junction',
  'exact', array['CTIA', 'Garden Court Victoria Junction'], null, array[]::text[],
  false, 390,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['springbok atlas'],
  'Cloud 9 → River Manor Stellenbosch',
  'exact', array['Cloud 9', 'River Manor Stellenbosch'], null, array[]::text[],
  false, 390,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'fadia', array['springbok atlas'],
  'CTIA → De Wijnlanden',
  'exact', array['CTIA', 'De Wijnlanden'], null, array[]::text[],
  false, 715,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);

-- Yaseen Org — route prices
select public._seed_route_price(
  'yaseen', array['springbok atlas'],
  'Airport → The Commodore',
  'exact', array['Airport', 'The Commodore'], null, array[]::text[],
  false, 390,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['springbok atlas'],
  'Airport → Protea Sea Point',
  'exact', array['Airport', 'Protea Sea Point'], null, array[]::text[],
  false, 410,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['thompsons'],
  'Cloud Nine → Cape Town Station',
  'exact', array['Cloud Nine', 'Cape Town Station'], null, array[]::text[],
  false, 410,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['garden court vj'],
  'Airport → Garden Court Victoria Junction',
  'exact', array['Airport', 'GCVJ'], null, array[]::text[],
  false, 390,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['vivo energy'],
  'Observatory → Airport',
  'exact', array['Observatory', 'Airport'], null, array[]::text[],
  false, 605,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['wns'],
  'Claremont ↔ Crystal Towers',
  'exact', array['Claremont', 'Crystal Towers'], null, array[]::text[],
  true, 430,
  '11 Nov 2026 reference. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['wns'],
  'Century City ↔ Protea North Wharf',
  'exact', array['Century City', 'Protea North Wharf'], null, array[]::text[],
  true, 430,
  '11 Nov 2026 reference. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['wns'],
  'Southern Sun Waterfront → Claremont',
  'exact', array['Southern Sun Waterfront', 'Claremont'], null, array[]::text[],
  false, 430,
  '11 Nov 2026 reference. This direction only. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['wns'],
  'Century City ↔ Teleperformance Woodstock',
  'exact', array['Century City', 'Teleperformance Woodstock'], null, array[]::text[],
  true, 300,
  '11 Nov 2026 reference. Note on the source lines: 8 pax, lines 14/15. Not filtered by passenger count. Founder to confirm.'
);
select public._seed_route_price(
  'yaseen', array['wns'],
  'Century City ↔ Protea',
  'exact', array['Century City', 'Protea'], null, array[]::text[],
  true, 300,
  '11 Nov 2026 reference. The place "Protea" does not match Protea North Wharf or Protea Sea Point. 8 pax note is not a passenger filter. Founder to confirm.'
);

-- Yaseen Org — companies the reference lists as one flat price.
-- Applied only when no route rule matches, and only when the amount differs from the rate card.
select public._seed_route_price(
  'yaseen', array['lewis compliance'],
  'Any route (flat template)',
  'company', array[]::text[], null, array[]::text[],
  true, 300,
  '11 Nov 2026 reference. Flat template. If the rate card is already R300, new lines stay on the rate card.'
);
select public._seed_route_price(
  'yaseen', array['lewis head office', 'head office'],
  'Any route (flat template)',
  'company', array[]::text[], null, array[]::text[],
  true, 300,
  '11 Nov 2026 reference (Head Office). Flat template. If the rate card is already R300, new lines stay on the rate card.'
);
select public._seed_route_price(
  'yaseen', array['inspire'],
  'Any route (flat template)',
  'company', array[]::text[], null, array[]::text[],
  true, 300,
  '11 Nov 2026 reference. Flat template. If the rate card is already R300, new lines stay on the rate card.'
);
select public._seed_route_price(
  'yaseen', array['teleperformance'],
  'Any route (flat template)',
  'company', array[]::text[], null, array[]::text[],
  true, 300,
  '11 Nov 2026 reference. Flat template. If the rate card is already R300, new lines stay on the rate card.'
);

drop function if exists public._seed_route_price(
  text, text[], text, text, text[], text, text[], boolean, numeric, text
);
