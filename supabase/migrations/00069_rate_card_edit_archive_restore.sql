-- =============================================================================
-- 00069: rate-card fixes (additive; no table or column changes)
--   1. A company trip-rate edit with the SAME effective_from corrects the
--      card in place, with no new row. A different date inserts a new card
--      and chains effective_to on the neighbouring cards.
--   2. A backdated or new rate re-prices DRAFT invoice lines only. Issued,
--      paid and void invoices are never touched, and neither are lines with
--      a manual price override.
--   3. archive_rate_card / restore_rate_card: SECURITY DEFINER, pinned
--      search_path, anon revoked, one signature each. They replace the
--      client soft-delete, which sent a non-existent `status` column and was
--      blocked by the select policy (deleted_at is null).
--   4. list_archived_rate_cards: the select policy hides archived rows, so
--      this definer read backs the "Archived" tab.
--   5. earliest_unbilled_trip_date: the default effective-from in the UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal: re-price draft trip lines for one company from a date onwards.
-- ---------------------------------------------------------------------------
create or replace function public.reprice_draft_trip_lines(
  p_organisation_id uuid,
  p_company_id uuid,
  p_from date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r record;
  v_rate numeric;
  v_card uuid;
  v_eff date;
  v_count integer := 0;
  v_invoices uuid[] := '{}';
begin
  for r in
    select il.id, il.invoice_id, il.unit_price, il.rate_card_id,
           (t.planned_start at time zone 'Africa/Johannesburg')::date as trip_date
    from public.invoice_lines il
    join public.invoices i on i.id = il.invoice_id
    join public.trips t on t.id = il.trip_id
    where il.organisation_id = p_organisation_id
      and il.trip_company_id = p_company_id
      and il.line_type = 'trip'
      and coalesce(il.price_overridden, false) = false
      and i.status = 'draft'
      and i.deleted_at is null
      and (t.planned_start at time zone 'Africa/Johannesburg')::date >= p_from
  loop
    v_rate := null; v_card := null; v_eff := null;
    select x.unit_amount, x.rate_card_id, x.rate_effective_on
    into v_rate, v_card, v_eff
    from public.resolve_trip_line_rate(p_organisation_id, p_company_id, r.trip_date) x;

    -- No rate resolves (e.g. the only card was archived): leave the line as is.
    continue when v_rate is null;
    continue when r.rate_card_id is not distinct from v_card and r.unit_price = v_rate;

    update public.invoice_lines
    set unit_price = v_rate,
        amount = round(v_rate * coalesce(quantity, 1), 2),
        rate_card_id = v_card,
        rate_effective_on = v_eff
    where id = r.id;

    v_count := v_count + 1;
    if not (r.invoice_id = any (v_invoices)) then
      v_invoices := v_invoices || r.invoice_id;
    end if;
  end loop;

  if array_length(v_invoices, 1) is not null then
    perform public.recalculate_invoice_totals(x) from unnest(v_invoices) as x;
  end if;

  return v_count;
end;
$$;

revoke all on function public.reprice_draft_trip_lines(uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Apply a company trip rate (edit in place, or insert with chaining).
-- ---------------------------------------------------------------------------
create or replace function public.apply_company_trip_rate(
  p_organisation_id uuid,
  p_company_id uuid,
  p_amount numeric,
  p_effective_from date,
  p_name text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company public.companies%rowtype;
  v_card_id uuid;
  v_next_from date;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised to manage rate cards';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Trip rate must be zero or more';
  end if;
  if p_effective_from is null then
    raise exception 'Trip rate effective from is required when setting a trip rate';
  end if;

  select * into v_company from public.companies
  where id = p_company_id and organisation_id = p_organisation_id and deleted_at is null;
  if not found then
    raise exception 'Company not found';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_company.name || ' trip rate');

  -- Same effective_from: correct the existing card in place.
  select rc.id into v_card_id
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.company_id = p_company_id
    and rc.line_type = 'trip'
    and rc.deleted_at is null
    and rc.effective_from = p_effective_from
  order by rc.created_at desc
  limit 1;

  if v_card_id is not null then
    update public.rate_cards
    set unit_amount = p_amount,
        name = v_name,
        notes = coalesce(nullif(trim(p_notes), ''), notes),
        updated_at = timezone('utc', now())
    where id = v_card_id;
  else
    -- Next card after the new date (if any) bounds the new card.
    select min(rc.effective_from) into v_next_from
    from public.rate_cards rc
    where rc.organisation_id = p_organisation_id
      and rc.company_id = p_company_id
      and rc.line_type = 'trip'
      and rc.deleted_at is null
      and rc.effective_from > p_effective_from;

    -- Close the card that was open on the new date.
    update public.rate_cards rc
    set effective_to = p_effective_from - 1,
        updated_at = timezone('utc', now())
    where rc.organisation_id = p_organisation_id
      and rc.company_id = p_company_id
      and rc.line_type = 'trip'
      and rc.deleted_at is null
      and rc.effective_from < p_effective_from
      and (rc.effective_to is null or rc.effective_to >= p_effective_from);

    insert into public.rate_cards (
      organisation_id, company_id, name, line_type, unit, unit_amount,
      currency, effective_from, effective_to, notes, created_by
    )
    values (
      p_organisation_id, p_company_id, v_name, 'trip', 'fixed', p_amount,
      'ZAR', p_effective_from,
      case when v_next_from is not null then v_next_from - 1 end,
      nullif(trim(p_notes), ''), auth.uid()
    )
    returning id into v_card_id;
  end if;

  perform public.reprice_draft_trip_lines(p_organisation_id, p_company_id, p_effective_from);
  return v_card_id;
end;
$$;

revoke all on function public.apply_company_trip_rate(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.apply_company_trip_rate(uuid, uuid, numeric, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- upsert_company_with_trip_rate: same signature (no overload). The rate
-- branch now delegates to apply_company_trip_rate.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_company_with_trip_rate(
  p_organisation_id uuid,
  p_name text,
  p_company_id uuid default null,
  p_code text default null,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_address text default null,
  p_status public.entity_status default 'active',
  p_trip_rate_amount numeric default null,
  p_trip_rate_effective_from date default null,
  p_trip_rate_name text default null,
  p_trip_rate_notes text default null
)
returns public.companies
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company public.companies%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(
      p_organisation_id,
      array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
    )
  ) then
    raise exception 'Not authorised to manage companies';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Company name is required';
  end if;

  if p_company_id is null then
    insert into public.companies (
      organisation_id, name, code, contact_name, contact_email,
      contact_phone, address, status, created_by
    )
    values (
      p_organisation_id,
      trim(p_name),
      nullif(trim(p_code), ''),
      nullif(trim(p_contact_name), ''),
      nullif(trim(p_contact_email), ''),
      nullif(trim(p_contact_phone), ''),
      nullif(trim(p_address), ''),
      coalesce(p_status, 'active'),
      auth.uid()
    )
    returning * into v_company;
  else
    update public.companies
    set
      name = trim(p_name),
      code = nullif(trim(p_code), ''),
      contact_name = nullif(trim(p_contact_name), ''),
      contact_email = nullif(trim(p_contact_email), ''),
      contact_phone = nullif(trim(p_contact_phone), ''),
      address = nullif(trim(p_address), ''),
      status = coalesce(p_status, status),
      updated_at = timezone('utc', now())
    where id = p_company_id
      and organisation_id = p_organisation_id
      and deleted_at is null
    returning * into v_company;

    if not found then
      raise exception 'Company not found';
    end if;
  end if;

  if p_trip_rate_amount is not null then
    perform public.apply_company_trip_rate(
      p_organisation_id,
      v_company.id,
      p_trip_rate_amount,
      p_trip_rate_effective_from,
      p_trip_rate_name,
      p_trip_rate_notes
    );
  end if;

  return v_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- Archive / restore
-- ---------------------------------------------------------------------------
create or replace function public.archive_rate_card(p_rate_card_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rc public.rate_cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into rc from public.rate_cards where id = p_rate_card_id;
  if not found then
    raise exception 'Rate card not found';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(rc.organisation_id, array['organisation_admin', 'manager'])
  ) then
    raise exception 'Not authorised to archive rate cards';
  end if;

  if rc.deleted_at is not null then
    return; -- already archived (idempotent)
  end if;

  update public.rate_cards
  set deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = rc.id;

  -- Re-open the previous card it had closed, so trip dates keep a rate.
  if rc.company_id is not null and rc.line_type = 'trip' then
    update public.rate_cards p
    set effective_to = rc.effective_to, updated_at = timezone('utc', now())
    where p.organisation_id = rc.organisation_id
      and p.company_id = rc.company_id
      and p.line_type = 'trip'
      and p.deleted_at is null
      and p.effective_to = rc.effective_from - 1;

    perform public.reprice_draft_trip_lines(rc.organisation_id, rc.company_id, rc.effective_from);
  end if;
end;
$$;

create or replace function public.restore_rate_card(p_rate_card_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rc public.rate_cards%rowtype;
  v_next_from date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into rc from public.rate_cards where id = p_rate_card_id;
  if not found then
    raise exception 'Rate card not found';
  end if;

  if not (
    public.is_platform_owner()
    or public.has_org_role_names(rc.organisation_id, array['organisation_admin', 'manager'])
  ) then
    raise exception 'Not authorised to restore rate cards';
  end if;

  if rc.deleted_at is null then
    return; -- already active (idempotent)
  end if;

  if rc.company_id is not null and rc.line_type = 'trip' then
    if exists (
      select 1 from public.rate_cards o
      where o.organisation_id = rc.organisation_id
        and o.company_id = rc.company_id
        and o.line_type = 'trip'
        and o.deleted_at is null
        and o.effective_from = rc.effective_from
    ) then
      raise exception 'An active trip rate already starts on %; edit that card instead', rc.effective_from;
    end if;

    select min(o.effective_from) into v_next_from
    from public.rate_cards o
    where o.organisation_id = rc.organisation_id
      and o.company_id = rc.company_id
      and o.line_type = 'trip'
      and o.deleted_at is null
      and o.effective_from > rc.effective_from;

    update public.rate_cards p
    set effective_to = rc.effective_from - 1, updated_at = timezone('utc', now())
    where p.organisation_id = rc.organisation_id
      and p.company_id = rc.company_id
      and p.line_type = 'trip'
      and p.deleted_at is null
      and p.effective_from < rc.effective_from
      and (p.effective_to is null or p.effective_to >= rc.effective_from);

    update public.rate_cards
    set deleted_at = null,
        effective_to = case
          when v_next_from is not null and (effective_to is null or effective_to >= v_next_from)
            then v_next_from - 1
          else effective_to
        end,
        updated_at = timezone('utc', now())
    where id = rc.id;

    perform public.reprice_draft_trip_lines(rc.organisation_id, rc.company_id, rc.effective_from);
  else
    update public.rate_cards
    set deleted_at = null, updated_at = timezone('utc', now())
    where id = rc.id;
  end if;
end;
$$;

revoke all on function public.archive_rate_card(uuid) from public, anon;
grant execute on function public.archive_rate_card(uuid) to authenticated;
revoke all on function public.restore_rate_card(uuid) from public, anon;
grant execute on function public.restore_rate_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Archived list (the select policy hides deleted rows)
-- ---------------------------------------------------------------------------
create or replace function public.list_archived_rate_cards(p_organisation_id uuid)
returns setof public.rate_cards
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select rc.*
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.deleted_at is not null
    and auth.uid() is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        p_organisation_id,
        array['organisation_admin', 'manager', 'dispatcher']
      )
    )
  order by rc.name, rc.effective_from desc;
$$;

revoke all on function public.list_archived_rate_cards(uuid) from public, anon;
grant execute on function public.list_archived_rate_cards(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Earliest unbilled trip date (default effective-from in the UI)
-- "Unbilled" = completed staff trip not on any non-draft, non-deleted invoice.
-- ---------------------------------------------------------------------------
create or replace function public.earliest_unbilled_trip_date(
  p_organisation_id uuid,
  p_company_id uuid
)
returns date
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select min((t.planned_start at time zone 'Africa/Johannesburg')::date)
  from public.trips t
  where t.organisation_id = p_organisation_id
    and t.company_id = p_company_id
    and t.deleted_at is null
    and t.status = 'completed'
    and auth.uid() is not null
    and (
      public.is_platform_owner()
      or public.has_org_role_names(
        p_organisation_id,
        array['organisation_admin', 'manager', 'dispatcher', 'supervisor']
      )
    )
    and not exists (
      select 1
      from public.invoice_lines il
      join public.invoices i on i.id = il.invoice_id
      where il.trip_id = t.id
        and i.deleted_at is null
        and i.status <> 'draft'
    );
$$;

revoke all on function public.earliest_unbilled_trip_date(uuid, uuid) from public, anon;
grant execute on function public.earliest_unbilled_trip_date(uuid, uuid) to authenticated;
