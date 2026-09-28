-- Read-only snapshot for migration 00052 rollback verification.
-- Usage: psql -tA -c "SELECT json_build_object(...)" or run full file (outputs one JSON line).

\set ON_ERROR_STOP on

SELECT json_build_object(
  'captured_at', now(),
  'security_definer_functions', (
    SELECT coalesce(json_agg(row_to_json(f) ORDER BY f.regprocedure), '[]'::json)
    FROM (
      SELECT
        p.oid::regprocedure::text AS regprocedure,
        pg_get_userbyid(p.proowner)::text AS owner,
        coalesce(p.proconfig, ARRAY[]::text[]) AS proconfig,
        EXISTS (
          SELECT 1
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0
        ) AS public_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
    ) f
  ),
  'invoker_search_path_helpers', (
    SELECT coalesce(json_agg(row_to_json(h) ORDER BY h.regprocedure), '[]'::json)
    FROM (
      SELECT
        p.oid::regprocedure::text AS regprocedure,
        coalesce(p.proconfig, ARRAY[]::text[]) AS proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT p.prosecdef
        AND p.proname = ANY (
          ARRAY[
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
          ]
        )
    ) h
  ),
  'compliance_scan_quota', (
    SELECT json_build_object(
      'relrowsecurity', c.relrowsecurity
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'compliance_scan_quota'
  )
)::text;
