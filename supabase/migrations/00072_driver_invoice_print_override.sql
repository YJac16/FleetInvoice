-- =============================================================================
-- 00072: per-driver invoice print override (additive; new table + RPCs only)
--   A driver-week invoice can be issued FROM someone other than the org's
--   default letterhead (e.g. Fadia Org's Freddy invoices are issued by
--   Mansur Jacobs with Mansur's banking, while Shaheed and Zain keep the
--   org's settings.invoice_print).
--
--   driver_invoice_print_overrides.settings mirrors the org block shape:
--     { "supplier": {name, address_lines[], phone, email},
--       "contact":  {name, phone, email},
--       "banking":  {bank, account_name, account_number, branch_code,
--                    account_type} }
--   Print uses the override block-by-block and falls back to the org block
--   for any block the override leaves out (see invoice-print-settings.ts).
--
--   Kept OFF public.drivers on purpose: drivers_select lets supervisors and
--   the driver himself read the row; banking must only be readable by the
--   roles that can already read that driver's invoices.
--   Writes go only through set_driver_invoice_print_override (org admins).
--   Drivers, employees and company managers get no row access.
--
-- Ordering: independent of 00070_self_serve_invoice_bill_to (PR #69) and
-- both 00071_* branches; touches no table or function they change.
-- =============================================================================

create table if not exists public.driver_invoice_print_overrides (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null
);

create index if not exists driver_invoice_print_overrides_org_idx
  on public.driver_invoice_print_overrides (organisation_id);
create index if not exists driver_invoice_print_overrides_updated_by_idx
  on public.driver_invoice_print_overrides (updated_by);

alter table public.driver_invoice_print_overrides enable row level security;

revoke all on table public.driver_invoice_print_overrides from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.driver_invoice_print_overrides from authenticated;
grant select on table public.driver_invoice_print_overrides to authenticated;

drop policy if exists driver_invoice_print_overrides_select
  on public.driver_invoice_print_overrides;
create policy driver_invoice_print_overrides_select
  on public.driver_invoice_print_overrides
  for select
  to authenticated
  using (
    public.is_platform_owner()
    or public.has_org_role_names(
      organisation_id,
      array['organisation_admin', 'manager', 'dispatcher']
    )
    -- Anyone who can already see one of this driver's invoices (invoices RLS
    -- applies inside this subquery) sees the override, so a print never
    -- silently falls back to the org banking. invoices_select already hides
    -- driver-week invoices from drivers, employees and company managers.
    or exists (
      select 1
      from public.invoices i
      where i.organisation_id = driver_invoice_print_overrides.organisation_id
        and i.driver_id = driver_invoice_print_overrides.driver_id
    )
  );
-- No insert/update/delete policies: writes only via the definer RPC below.

create or replace function public.set_driver_invoice_print_override(
  p_driver_id uuid,
  p_settings jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org uuid;
  v_key text;
  v_block text;
  v_had boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select d.organisation_id into v_org
  from public.drivers d
  where d.id = p_driver_id
    and d.deleted_at is null;

  if v_org is null then
    raise exception 'Driver not found';
  end if;

  if not public.has_org_role_names(v_org, array['organisation_admin']) then
    raise exception 'Only organisation admins can set a driver invoice override';
  end if;

  select exists (
    select 1 from public.driver_invoice_print_overrides o
    where o.driver_id = p_driver_id
  ) into v_had;

  -- null or {} clears the override (print falls back to the org settings).
  if p_settings is null or p_settings = '{}'::jsonb then
    delete from public.driver_invoice_print_overrides
    where driver_id = p_driver_id;

    perform public.write_audit_log(
      v_org,
      'driver.invoice_print_override.cleared',
      'driver',
      p_driver_id,
      jsonb_build_object('had_override', v_had)
    );
    return;
  end if;

  if jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Override settings must be a JSON object';
  end if;

  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('supplier', 'contact', 'banking') then
      raise exception 'Unsupported override block: %', v_key;
    end if;
    if jsonb_typeof(p_settings -> v_key) <> 'object' then
      raise exception 'Override block % must be a JSON object', v_key;
    end if;
  end loop;

  insert into public.driver_invoice_print_overrides as o
    (driver_id, organisation_id, settings, updated_by)
  values (p_driver_id, v_org, p_settings, auth.uid())
  on conflict (driver_id) do update
    set settings = excluded.settings,
        organisation_id = excluded.organisation_id,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now());

  -- Audit records which blocks changed, never the banking values themselves.
  select string_agg(k, ',' order by k) into v_block
  from jsonb_object_keys(p_settings) as k;

  perform public.write_audit_log(
    v_org,
    'driver.invoice_print_override.set',
    'driver',
    p_driver_id,
    jsonb_build_object('had_override', v_had, 'blocks', v_block)
  );
end;
$$;

revoke all on function public.set_driver_invoice_print_override(uuid, jsonb) from public, anon;
grant execute on function public.set_driver_invoice_print_override(uuid, jsonb) to authenticated;
