-- =============================================================================
-- 00052 — Security hardening: anon RPC surface, compliance_scan_quota RLS,
--          invoker search_path pins, default function privileges
-- =============================================================================
-- Idempotent on production shape (tggxnvombexvxblsntsm). Revokes EXECUTE from
-- PUBLIC and anon on SECURITY DEFINER public RPCs; re-grants authenticated and
-- service_role per intended surface. Keeps anon EXECUTE on public RPCs
-- (get_invitation_by_token, lookup_white_label) and read-only RLS helpers used
-- when anon evaluates policies on Supabase-SELECTable public tables.

-- ---------------------------------------------------------------------------
-- 1) SECURITY DEFINER RPC grants — revoke PUBLIC/anon; restore role grants
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_args text;
  v_anon_ok text[] := array['get_invitation_by_token', 'lookup_white_label'];
  v_service_only text[] := array[
    'audit_compliance_document_view',
    'compliance_register_actor_ok',
    'consume_compliance_scan_quota',
    'enqueue_compliance_expiry_alerts',
    'enqueue_compliance_renewals_digests',
    'enqueue_compliance_storage_purge',
    'import_drivers_capture',
    'import_vehicles_capture',
    'purge_compliance_document_storage',
    'register_compliance_document',
    'resolve_trip_line_rate',
    'restore_driver',
    'restore_vehicle',
    'run_compliance_document_retention',
    'save_driver_capture',
    'save_vehicle_capture',
    'soft_delete_compliance_document',
    'soft_delete_driver',
    'soft_delete_vehicle',
    'trim_superseded_compliance_versions',
    'write_audit_log'
  ];
begin
  for r in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    v_args := r.args;
    execute format('revoke all on function public.%I(%s) from public', r.proname, v_args);
    execute format('revoke all on function public.%I(%s) from anon', r.proname, v_args);

    if r.proname = any (v_anon_ok) then
      execute format('grant execute on function public.%I(%s) to anon', r.proname, v_args);
    end if;

    if r.proname = 'handle_new_user' then
      -- Auth trigger only; not a PostgREST RPC.
      continue;
    end if;

    if r.proname = any (v_service_only) then
      execute format(
        'revoke all on function public.%I(%s) from authenticated',
        r.proname,
        v_args
      );
      execute format('grant execute on function public.%I(%s) to service_role', r.proname, v_args);
    else
      execute format('grant execute on function public.%I(%s) to authenticated', r.proname, v_args);
      execute format('grant execute on function public.%I(%s) to service_role', r.proname, v_args);
    end if;
  end loop;
end;
$$;

-- Documented anon SECURITY DEFINER exception (10 signatures):
--   get_invitation_by_token(text), lookup_white_label(text),
--   is_platform_owner(), is_org_member(uuid), has_org_role(uuid, app_role[]),
--   has_org_role_names(uuid, text[]), has_company_scope(uuid, uuid),
--   user_organisation_ids(), current_driver_id(uuid), current_employee_id(uuid)
-- RLS policy helpers (read-only; auth.uid() is null for anon).
do $$
declare
  r record;
  v_anon_rls_helpers text[] := array[
    'is_platform_owner',
    'is_org_member',
    'has_org_role',
    'has_org_role_names',
    'has_company_scope',
    'user_organisation_ids',
    'current_driver_id',
    'current_employee_id'
  ];
begin
  for r in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname = any (v_anon_rls_helpers)
  loop
    execute format('grant execute on function public.%I(%s) to anon', r.proname, r.args);
  end loop;
end;
$$;

-- Auth signup trigger (SECURITY DEFINER); not a PostgREST RPC.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
      and p.prosecdef
  ) then
    revoke all on function public.handle_new_user() from public, anon, authenticated;
    grant execute on function public.handle_new_user() to postgres;
    if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
      grant execute on function public.handle_new_user() to supabase_auth_admin;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) compliance_scan_quota — backend-only (written by service_role RPC)
-- ---------------------------------------------------------------------------

alter table if exists public.compliance_scan_quota enable row level security;

-- No policies: direct PostgREST access denied; service_role bypasses RLS;
-- consume_compliance_scan_quota (SECURITY DEFINER, service_role) writes rows.

-- ---------------------------------------------------------------------------
-- 3) SECURITY INVOKER helpers — pin search_path (advisor function_search_path_mutable)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_invoker_pins text[] := array[
    'set_updated_at',
    'haversine_m',
    'staff_company_display_name',
    'calc_total_km',
    'service_week_bounds_sast',
    'compliance_immutable_driver_document',
    'compliance_immutable_vehicle_document',
    'storage_org_id',
    'storage_path_segment',
    'normalize_invoice_period_end',
    'invoice_period_lower_bound_sast',
    'invoice_period_upper_bound_sast'
  ];
begin
  for r in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not p.prosecdef
      and p.proname = any (v_invoker_pins)
  loop
    execute format(
      'alter function public.%I(%s) set search_path = pg_catalog, public',
      r.proname,
      r.args
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Default privileges — new functions not executable via PUBLIC/anon
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function; per-schema
-- ALTER DEFAULT PRIVILEGES can only add privileges, not remove PUBLIC. Use a
-- global (no IN SCHEMA) REVOKE FROM PUBLIC. Supabase also sets per-schema
-- defaults on public (anon=X on functions) — revoke those explicitly.

do $$
declare
  v_role name;
begin
  foreach v_role in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      continue;
    end if;

    -- Global: strip built-in PUBLIC execute on objects created by v_role.
    execute format(
      'alter default privileges for role %I revoke execute on functions from public',
      v_role
    );
    execute format(
      'alter default privileges for role %I revoke execute on functions from anon',
      v_role
    );

    -- Supabase per-schema public defaults (see pg_default_acl); drop anon/PUBLIC
    -- execute and grant only app roles for new public functions.
    execute format(
      'alter default privileges for role %I in schema public revoke execute on functions from public, anon',
      v_role
    );
    execute format(
      'alter default privileges for role %I in schema public grant execute on functions to authenticated, service_role',
      v_role
    );
  end loop;
end;
$$;
