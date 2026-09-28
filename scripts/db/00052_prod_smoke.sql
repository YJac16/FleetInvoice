-- Post-apply read-only smoke checks (no durable changes).
-- Run against production with a read-only role; entire script rolls back.

BEGIN;

-- 1) Anon must not execute representative privileged RPCs
DO $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  BEGIN
    PERFORM public.create_invitation(
      '00000000-0000-0000-0000-000000000001'::uuid,
      'smoke@example.com',
      'manager'::public.app_role,
      now() + interval '1 day'
    );
    RAISE EXCEPTION 'SMOKE FAIL: anon create_invitation succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM NOT LIKE '%permission denied%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.generate_period_invoice(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid,
      current_date - 7,
      current_date
    );
    RAISE EXCEPTION 'SMOKE FAIL: anon generate_period_invoice succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM NOT LIKE '%permission denied%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.ingest_gps_points(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'SMOKE FAIL: anon ingest_gps_points succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM NOT LIKE '%permission denied%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

-- 2) Anon table reads: no ERROR; no tenant rows (plans may return active catalog rows only)
DO $$
DECLARE
  v_count bigint;
  v_bad bigint;
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT count(*) INTO v_count FROM public.companies;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL: anon companies rows=%', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.trips;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL: anon trips rows=%', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.invoices;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL: anon invoices rows=%', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.subscriptions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL: anon subscriptions rows=%', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.white_label_configs;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL: anon white_label_configs rows=%', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.plans;
  SELECT count(*) INTO v_bad FROM public.plans WHERE NOT is_active;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'SMOKE FAIL: anon plans includes inactive rows=%', v_bad;
  END IF;

  SELECT count(*) INTO v_count FROM public.module_entitlements me
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plans p WHERE p.id = me.plan_id AND p.is_active
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.plan_id = me.plan_id
  );
  -- module_entitlements_select allows active-plan rows without org membership
END;
$$;

-- 3) Service-only compliance RPC privileges
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.enqueue_compliance_expiry_alerts()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: authenticated can execute enqueue_compliance_expiry_alerts';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.enqueue_compliance_expiry_alerts()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: service_role missing enqueue_compliance_expiry_alerts';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.enqueue_compliance_renewals_digests(integer)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: authenticated can execute enqueue_compliance_renewals_digests';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.enqueue_compliance_renewals_digests(integer)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: service_role missing enqueue_compliance_renewals_digests';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.consume_compliance_scan_quota(uuid, integer)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: authenticated can execute consume_compliance_scan_quota';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.consume_compliance_scan_quota(uuid, integer)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: service_role missing consume_compliance_scan_quota';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.run_compliance_document_retention(timestamp with time zone)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: authenticated can execute run_compliance_document_retention';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.run_compliance_document_retention(timestamp with time zone)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: service_role missing run_compliance_document_retention';
  END IF;
END;
$$;

-- 4) compliance_scan_quota RLS enabled
DO $$
DECLARE
  v_on boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_on
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'compliance_scan_quota';

  IF coalesce(v_on, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'SMOKE FAIL: compliance_scan_quota RLS disabled';
  END IF;
END;
$$;

DO $$ BEGIN RAISE NOTICE '00052 prod smoke: OK (rolled back)'; END; $$;

ROLLBACK;
