-- Idempotent backfill: set trip_assignments.vehicle_id on staff trips with NULL vehicle.
-- Admin / service_role only. Do NOT run against production without review.
-- Apply migration 00059_staff_waybill_vehicle.sql (after 00058 from PR #58) before relying on new waybill RPCs.
--
-- Alternative: edit each trip's vehicle in the admin UI if trip assignment editing is enabled.
--
-- Usage (psql):
--   psql ... -v org_id='<uuid>' -v driver_match='Paulin' -v date_from='2026-10-05' \
--     -v date_to_exclusive='2026-10-11' -v registration='CAA 484892' -v expected_count=16
--   Add -v commit=1 to COMMIT instead of ROLLBACK (only after dry-run count matches).
--
-- Optional defaults below apply only when a variable was not passed with -v.

\if :{?org_id}
\else
\set org_id 'REPLACE_WITH_ORG_UUID'
\endif
\if :{?driver_match}
\else
\set driver_match 'REPLACE_WITH_DRIVER_EMAIL_OR_FULL_NAME'
\endif
\if :{?date_from}
\else
\set date_from '2026-10-05'
\endif
\if :{?date_to_exclusive}
\else
\set date_to_exclusive '2026-10-11'
\endif
\if :{?registration}
\else
\set registration 'REPLACE_WITH_REGISTRATION'
\endif
\if :{?expected_count}
\else
\set expected_count 0
\endif
\if :{?dry_run}
\else
\set dry_run true
\endif

-- ---------------------------------------------------------------------------
-- Ready-to-run: Paulin — 16 trips 5–10 Oct 2026 → CAA 484892
-- ---------------------------------------------------------------------------
-- psql ... -v org_id='<cape-shuttle-org-uuid>' -v driver_match='Paulin' \
--   -v date_from='2026-10-05' -v date_to_exclusive='2026-10-11' \
--   -v registration='CAA 484892' -v expected_count=16

-- ---------------------------------------------------------------------------
-- Ready-to-run: Yaseen Jacobs — 9 trips 5–11 Oct 2026 → GR11-WP
-- ---------------------------------------------------------------------------
-- psql ... -v org_id='<cape-shuttle-org-uuid>' -v driver_match='Yaseen Jacobs' \
--   -v date_from='2026-10-05' -v date_to_exclusive='2026-10-12' \
--   -v registration='GR11-WP' -v expected_count=9

SELECT set_config('backfill.org_id', :'org_id', false);
SELECT set_config('backfill.driver_match', :'driver_match', false);
SELECT set_config('backfill.date_from', :'date_from', false);
SELECT set_config('backfill.date_to_exclusive', :'date_to_exclusive', false);
SELECT set_config('backfill.registration', :'registration', false);
SELECT set_config('backfill.expected_count', :'expected_count', false);
SELECT set_config('backfill.dry_run', :'dry_run', false);

BEGIN;

DO $$
DECLARE
  v_org_id uuid := current_setting('backfill.org_id')::uuid;
  v_driver_match text := current_setting('backfill.driver_match');
  v_date_from date := current_setting('backfill.date_from')::date;
  v_date_to_exclusive date := current_setting('backfill.date_to_exclusive')::date;
  v_registration text := trim(current_setting('backfill.registration'));
  v_expected int := current_setting('backfill.expected_count')::int;
  v_dry_run boolean := current_setting('backfill.dry_run')::boolean;
  v_driver_id uuid;
  v_vehicle_id uuid;
  v_count int;
  v_match_count int;
  v_exact_email_count int;
BEGIN
  IF v_registration IS NULL OR v_registration = '' THEN
    RAISE EXCEPTION 'registration is required';
  END IF;

  SELECT count(*)::int INTO v_exact_email_count
  FROM public.drivers d
  JOIN public.profiles p ON p.id = d.profile_id
  WHERE d.organisation_id = v_org_id
    AND d.deleted_at IS NULL
    AND lower(trim(p.email)) = lower(trim(v_driver_match));

  IF v_exact_email_count = 1 THEN
    SELECT d.id INTO v_driver_id
    FROM public.drivers d
    JOIN public.profiles p ON p.id = d.profile_id
    WHERE d.organisation_id = v_org_id
      AND d.deleted_at IS NULL
      AND lower(trim(p.email)) = lower(trim(v_driver_match));
  ELSE
    SELECT count(*)::int INTO v_match_count
    FROM public.drivers d
    LEFT JOIN public.profiles p ON p.id = d.profile_id
    WHERE d.organisation_id = v_org_id
      AND d.deleted_at IS NULL
      AND (
        lower(d.full_name) = lower(v_driver_match)
        OR d.full_name ILIKE '%' || v_driver_match || '%'
      );

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'Driver not found for match: %', v_driver_match;
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'Multiple drivers (%) match % — use exact email', v_match_count, v_driver_match;
    END IF;

    SELECT d.id INTO v_driver_id
    FROM public.drivers d
    WHERE d.organisation_id = v_org_id
      AND d.deleted_at IS NULL
      AND lower(d.full_name) = lower(v_driver_match)
    LIMIT 1;

    IF v_driver_id IS NULL THEN
      SELECT d.id INTO v_driver_id
      FROM public.drivers d
      WHERE d.organisation_id = v_org_id
        AND d.deleted_at IS NULL
        AND d.full_name ILIKE '%' || v_driver_match || '%'
      LIMIT 1;
    END IF;
  END IF;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver not found for match: %', v_driver_match;
  END IF;

  SELECT v.id INTO v_vehicle_id
  FROM public.vehicles v
  WHERE v.organisation_id = v_org_id
    AND v.deleted_at IS NULL
    AND (
      upper(replace(trim(v.registration_number), ' ', '')) =
        upper(replace(v_registration, ' ', ''))
      OR trim(v.registration_number) = v_registration
    )
  LIMIT 1;

  IF v_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'No vehicle with registration % in org — create it in Fleet first', v_registration;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.trip_assignments ta
  JOIN public.trips t ON t.id = ta.trip_id
  WHERE ta.organisation_id = v_org_id
    AND ta.driver_id = v_driver_id
    AND ta.deleted_at IS NULL
    AND ta.released_at IS NULL
    AND ta.vehicle_id IS NULL
    AND t.deleted_at IS NULL
    AND t.is_staff_transport IS TRUE
    AND (t.planned_start AT TIME ZONE 'Africa/Johannesburg')::date >= v_date_from
    AND (t.planned_start AT TIME ZONE 'Africa/Johannesburg')::date < v_date_to_exclusive;

  RAISE NOTICE 'DRY RUN: % trip assignment(s) would be updated (driver %, reg %)',
    v_count, v_driver_id, v_registration;

  IF v_count <> v_expected THEN
    RAISE EXCEPTION 'Expected % rows, found % — aborting', v_expected, v_count;
  END IF;

  IF v_dry_run THEN
    RAISE NOTICE 'dry_run=true — no updates applied';
  ELSE
    UPDATE public.trip_assignments ta
    SET vehicle_id = v_vehicle_id,
        updated_at = timezone('utc', now())
    FROM public.trips t
    WHERE t.id = ta.trip_id
      AND ta.organisation_id = v_org_id
      AND ta.driver_id = v_driver_id
      AND ta.deleted_at IS NULL
      AND ta.released_at IS NULL
      AND ta.vehicle_id IS NULL
      AND t.deleted_at IS NULL
      AND t.is_staff_transport IS TRUE
      AND (t.planned_start AT TIME ZONE 'Africa/Johannesburg')::date >= v_date_from
      AND (t.planned_start AT TIME ZONE 'Africa/Johannesburg')::date < v_date_to_exclusive;

    RAISE NOTICE 'Updated % assignment(s)', v_count;
  END IF;
END $$;

\if :{?commit}
COMMIT;
\else
ROLLBACK;
\endif
