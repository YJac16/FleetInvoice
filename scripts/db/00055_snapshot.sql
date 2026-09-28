-- Read-only snapshot for migration 00055 rollback verification.

\set ON_ERROR_STOP on

SELECT json_build_object(
  'captured_at', now(),
  'internal_security_definer_functions', (
    SELECT coalesce(json_agg(row_to_json(f) ORDER BY f.regprocedure), '[]'::json)
    FROM (
      SELECT
        p.oid::regprocedure::text AS regprocedure,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND p.proname = ANY (
          ARRAY[
            'assert_staff_trip_driver',
            'enqueue_driver_notification',
            'recalculate_invoice_totals',
            'resolve_invoice_bill_to_company_id',
            'resolve_pay_rate',
            'resolve_staff_company_id',
            'set_staff_trip_status',
            'sync_staff_trip_invoice_line'
          ]
        )
    ) f
  ),
  'advisor_rls_policies', (
    SELECT coalesce(json_agg(row_to_json(p) ORDER BY p.tablename, p.policyname), '[]'::json)
    FROM (
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles::text[] AS roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (tablename = 'profiles' AND policyname IN ('profiles_select', 'profiles_update'))
          OR (tablename = 'employees' AND policyname = 'employees_select')
          OR (tablename = 'admin_inbox_notifications' AND policyname IN ('admin_inbox_select', 'admin_inbox_update'))
          OR (tablename = 'driver_presence' AND policyname LIKE 'driver_presence%')
        )
    ) p
  ),
  'fkey_covering_indexes', (
    SELECT coalesce(json_agg(indexname ORDER BY indexname), '[]'::json)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE '%\_fkey\_idx' ESCAPE '\'
  ),
  'handle_new_user_grants', (
    SELECT json_build_object(
      'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'),
      'supabase_auth_admin',
        CASE
          WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
          THEN has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
          ELSE null
        END
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_user'
    LIMIT 1
  )
)::text;
