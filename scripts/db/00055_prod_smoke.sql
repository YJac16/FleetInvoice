-- Post-00055 read-only smoke checks (BEGIN … ROLLBACK). Run with a read-only DB role.

BEGIN;

-- Internal invoice helpers must not be callable as authenticated
DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.sync_staff_trip_invoice_line(uuid, boolean)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: authenticated can execute sync_staff_trip_invoice_line';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.set_staff_trip_status(uuid, public.trip_status, public.trip_event_type, text, jsonb)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: authenticated can execute set_staff_trip_status';
  END IF;
END;
$$;

-- FK covering index sample (00055)
DO $$
BEGIN
  IF to_regclass('public.trips_company_id_fkey_idx') IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: missing trips_company_id_fkey_idx';
  END IF;
END;
$$;

-- auth_rls_initplan: profiles_select should use subselect form
DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname = 'profiles_select';
  IF v_qual IS NULL OR v_qual NOT LIKE '%( SELECT auth.uid() AS uid)%'
     AND v_qual NOT LIKE '%(select auth.uid())%' THEN
    IF v_qual NOT ILIKE '%select auth.uid()%' THEN
      RAISE EXCEPTION 'SMOKE FAIL: profiles_select missing initplan-safe auth.uid(), qual=%', v_qual;
    END IF;
  END IF;
END;
$$;

-- driver_presence: no duplicate permissive SELECT policy named upsert
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'driver_presence'
      AND policyname = 'driver_presence_upsert'
  ) THEN
    RAISE EXCEPTION 'SMOKE FAIL: driver_presence_upsert still present';
  END IF;
END;
$$;

ROLLBACK;
