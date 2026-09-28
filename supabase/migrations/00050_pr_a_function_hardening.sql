-- =============================================================================
-- PR A follow-up: drop stale RPC overload, lock down rate resolver, pin search_path
-- (Production already has 00049; this migration is safe to apply idempotently.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drop stale update_staff_trip overload (00049 added p_company_id signature)
-- App calls: update_staff_trip(uuid, timestamptz, uuid, staff_transport_company, text, int)
-- ---------------------------------------------------------------------------

drop function if exists public.update_staff_trip(
  uuid,
  timestamptz,
  public.staff_transport_company,
  text,
  int
);

-- ---------------------------------------------------------------------------
-- resolve_trip_line_rate — internal pricing; not a public RPC
-- ---------------------------------------------------------------------------

create or replace function public.resolve_trip_line_rate(
  p_organisation_id uuid,
  p_company_id uuid,
  p_trip_date date
)
returns table (
  unit_amount numeric,
  rate_card_id uuid,
  rate_effective_on date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not (
      public.is_platform_owner()
      or public.is_org_member(p_organisation_id)
    ) then
      raise exception 'Not authorised';
    end if;
  end if;

  if p_company_id is null then
    return;
  end if;

  return query
  select rc.unit_amount, rc.id, rc.effective_from
  from public.rate_cards rc
  where rc.organisation_id = p_organisation_id
    and rc.deleted_at is null
    and rc.line_type = 'trip'
    and rc.unit::text in ('trip', 'fixed')
    and rc.company_id = p_company_id
    and rc.effective_from <= p_trip_date
    and (rc.effective_to is null or rc.effective_to >= p_trip_date)
  order by rc.effective_from desc
  limit 1;
end;
$$;

revoke all on function public.resolve_trip_line_rate(uuid, uuid, date) from public;
revoke all on function public.resolve_trip_line_rate(uuid, uuid, date) from anon;
revoke all on function public.resolve_trip_line_rate(uuid, uuid, date) from authenticated;

-- ---------------------------------------------------------------------------
-- PR A SECURITY DEFINER / RPC surface — authenticated clients only
-- ---------------------------------------------------------------------------

revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from public;
revoke all on function public.sync_staff_trip_invoice_line(uuid, boolean) from anon;
grant execute on function public.sync_staff_trip_invoice_line(uuid, boolean) to authenticated;

revoke all on function public.update_staff_trip(
  uuid,
  timestamptz,
  uuid,
  public.staff_transport_company,
  text,
  int
) from public;
revoke all on function public.update_staff_trip(
  uuid,
  timestamptz,
  uuid,
  public.staff_transport_company,
  text,
  int
) from anon;
grant execute on function public.update_staff_trip(
  uuid,
  timestamptz,
  uuid,
  public.staff_transport_company,
  text,
  int
) to authenticated;

revoke all on function public.assign_staff_trip(
  uuid,
  uuid,
  timestamptz,
  text,
  int,
  uuid,
  public.staff_transport_company
) from public;
revoke all on function public.assign_staff_trip(
  uuid,
  uuid,
  timestamptz,
  text,
  int,
  uuid,
  public.staff_transport_company
) from anon;
grant execute on function public.assign_staff_trip(
  uuid,
  uuid,
  timestamptz,
  text,
  int,
  uuid,
  public.staff_transport_company
) to authenticated;

revoke all on function public.backfill_staff_waybill(
  uuid,
  uuid,
  timestamptz,
  text,
  int,
  uuid,
  public.staff_transport_company,
  numeric,
  numeric
) from public;
revoke all on function public.backfill_staff_waybill(
  uuid,
  uuid,
  timestamptz,
  text,
  int,
  uuid,
  public.staff_transport_company,
  numeric,
  numeric
) from anon;
grant execute on function public.backfill_staff_waybill(
  uuid,
  uuid,
  timestamptz,
  text,
  int,
  uuid,
  public.staff_transport_company,
  numeric,
  numeric
) to authenticated;

revoke all on function public.upsert_company_with_trip_rate(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  public.entity_status,
  numeric,
  date,
  text,
  text
) from public;
revoke all on function public.upsert_company_with_trip_rate(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  public.entity_status,
  numeric,
  date,
  text,
  text
) from anon;
grant execute on function public.upsert_company_with_trip_rate(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  public.entity_status,
  numeric,
  date,
  text,
  text
) to authenticated;

-- ---------------------------------------------------------------------------
-- staff_trip_invoice_line_description — pin search_path (00049 body unchanged)
-- ---------------------------------------------------------------------------

alter function public.staff_trip_invoice_line_description(public.trips) set search_path = public;
