-- =============================================================================
-- 00095: opt-in backfill of unpriced fuel fill-ups
-- =============================================================================
-- backfill_unpriced_fuel_fillups(p_organisation_id): finance only (platform
-- owner, organisation_admin, manager). Never runs automatically: the admin
-- presses "Price unpriced fill-ups" (confirm dialog) on /fuel.
--
-- Prices ONLY rows of that org that are price_status 'needs_price' (money
-- null) and have a fuel_type, using the confirmed org rate in force on the
-- row's Africa/Johannesburg slip date (resolve_fuel_unit_price, 00093). Rows
-- already 'priced' (locked, incl. legacy manual prices) are never touched; no
-- rate is invented. Rows still without a rate stay 'needs_price'.
--
-- Returns one row: priced, still_needs_price, skipped_no_fuel_type.
-- Not applied to any remote database from the PR.
-- Rollback: supabase/rollback-00095.sql
-- =============================================================================

begin;

create or replace function public.backfill_unpriced_fuel_fillups(
  p_organisation_id uuid
)
returns table (
  priced integer,
  still_needs_price integer,
  skipped_no_fuel_type integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_priced integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_platform_owner()
    or public.has_org_role_names(p_organisation_id, array['organisation_admin', 'manager'])
  ) then
    raise exception 'Not authorised to price fuel fill-ups';
  end if;

  with todo as (
    select f.id, f.litres, r.id as price_id, r.price_per_litre
    from public.fuel_fillups f
    cross join lateral public.resolve_fuel_unit_price(
      f.organisation_id,
      f.fuel_type,
      f.region,
      (timezone('Africa/Johannesburg', f.filled_at))::date
    ) r
    where f.organisation_id = p_organisation_id
      and f.deleted_at is null
      and f.price_status = 'needs_price'
      and f.total_amount is null
      and f.unit_price is null
      and f.fuel_type is not null
    for update of f
  ),
  upd as (
    update public.fuel_fillups f
    set unit_price = t.price_per_litre,
        total_amount = round(t.litres * t.price_per_litre, 2),
        priced_from_id = t.price_id,
        priced_at = timezone('utc', now()),
        price_status = 'priced'
    from todo t
    where f.id = t.id
      and f.price_status = 'needs_price'
    returning 1
  )
  select count(*)::integer into v_priced from upd;

  return query
  select
    v_priced,
    (select count(*)::integer from public.fuel_fillups f
      where f.organisation_id = p_organisation_id and f.deleted_at is null
        and f.price_status = 'needs_price' and f.fuel_type is not null),
    (select count(*)::integer from public.fuel_fillups f
      where f.organisation_id = p_organisation_id and f.deleted_at is null
        and f.price_status = 'needs_price' and f.fuel_type is null);
end;
$$;

revoke all on function public.backfill_unpriced_fuel_fillups(uuid) from public, anon;
grant execute on function public.backfill_unpriced_fuel_fillups(uuid) to authenticated;

commit;
