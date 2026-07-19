-- FleetInvoice Phase 3 — Pricing Engine
-- Expands pricing_rules, trip price fields, pricing_history, match RPC, triggers, RLS

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.pricing_status AS ENUM (
  'calculated',
  'needs_pricing',
  'manual_override'
);

-- ---------------------------------------------------------------------------
-- Expand pricing_rules
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_rules
  ADD COLUMN IF NOT EXISTS pickup_area_id UUID REFERENCES public.areas (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS destination_area_id UUID REFERENCES public.areas (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS areas_visited UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS minimum_passengers INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS maximum_passengers INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.vehicles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill area FKs for any legacy stub rows (point at first active area if present)
DO $$
DECLARE
  fallback_area UUID;
BEGIN
  SELECT id INTO fallback_area FROM public.areas WHERE active = TRUE ORDER BY name LIMIT 1;
  IF fallback_area IS NOT NULL THEN
    UPDATE public.pricing_rules
    SET
      pickup_area_id = COALESCE(pickup_area_id, fallback_area),
      destination_area_id = COALESCE(destination_area_id, fallback_area)
    WHERE pickup_area_id IS NULL OR destination_area_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.pricing_rules
  ALTER COLUMN pickup_area_id SET NOT NULL,
  ALTER COLUMN destination_area_id SET NOT NULL;

ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_passenger_range_check;

ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_passenger_range_check
  CHECK (
    minimum_passengers >= 1
    AND maximum_passengers >= minimum_passengers
    AND maximum_passengers <= 60
  );

ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_price_non_negative;

ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_rules_price_non_negative
  CHECK (price >= 0);

-- rule_name kept for optional admin labels; default empty for new rows
ALTER TABLE public.pricing_rules
  ALTER COLUMN rule_name SET DEFAULT '';

-- Soft-delete helper: never hard-delete pricing rules from the app
COMMENT ON COLUMN public.pricing_rules.active IS
  'Soft-delete flag. false = retired rule; never permanently remove pricing history.';

-- ---------------------------------------------------------------------------
-- Trip pricing columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS calculated_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS pricing_rule_id UUID REFERENCES public.pricing_rules (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS price_calculated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pricing_status public.pricing_status NOT NULL DEFAULT 'needs_pricing';

-- ---------------------------------------------------------------------------
-- pricing_history (admin overrides)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  old_price NUMERIC(12, 2),
  new_price NUMERIC(12, 2) NOT NULL,
  changed_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL
);

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Indexes (lookup + scale)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup
  ON public.pricing_rules (
    company_id,
    pickup_area_id,
    destination_area_id,
    active,
    priority DESC
  );

CREATE INDEX IF NOT EXISTS idx_pricing_rules_vehicle_id
  ON public.pricing_rules (vehicle_id)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_active_priority
  ON public.pricing_rules (active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_areas_visited
  ON public.pricing_rules USING GIN (areas_visited);

CREATE INDEX IF NOT EXISTS idx_trips_pricing_rule_id ON public.trips (pricing_rule_id);
CREATE INDEX IF NOT EXISTS idx_trips_pricing_status ON public.trips (pricing_status);
CREATE INDEX IF NOT EXISTS idx_trips_price_locked ON public.trips (price_locked);
CREATE INDEX IF NOT EXISTS idx_trips_calculated_price ON public.trips (calculated_price);

CREATE INDEX IF NOT EXISTS idx_pricing_history_trip_id ON public.pricing_history (trip_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_changed_at ON public.pricing_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_areas_name_lower ON public.areas (lower(name));

-- ---------------------------------------------------------------------------
-- Match pricing rule (SECURITY DEFINER — server/admin use)
-- Match order: company → pickup → destination → areas visited → passengers → vehicle → highest priority
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_pricing_rule(
  p_company_id UUID,
  p_pickup_area_id UUID,
  p_destination_area_id UUID,
  p_areas_visited UUID[],
  p_passengers INTEGER,
  p_vehicle_id UUID
)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  pickup_area_id UUID,
  destination_area_id UUID,
  areas_visited UUID[],
  minimum_passengers INTEGER,
  maximum_passengers INTEGER,
  vehicle_id UUID,
  price NUMERIC,
  priority INTEGER,
  active BOOLEAN,
  rule_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  visited UUID[] := COALESCE(p_areas_visited, '{}');
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.company_id,
    r.pickup_area_id,
    r.destination_area_id,
    r.areas_visited,
    r.minimum_passengers,
    r.maximum_passengers,
    r.vehicle_id,
    r.price,
    r.priority,
    r.active,
    r.rule_name,
    r.created_at,
    r.updated_at,
    (
      'Matched company, pickup, destination, passenger range'
      || CASE
           WHEN cardinality(r.areas_visited) = 0 THEN ', any areas visited'
           ELSE ', areas visited set'
         END
      || CASE
           WHEN r.vehicle_id IS NULL THEN ', any vehicle'
           ELSE ', specific vehicle'
         END
      || ', priority ' || r.priority::TEXT
    )::TEXT AS reason
  FROM public.pricing_rules r
  WHERE r.active = TRUE
    AND r.company_id = p_company_id
    AND r.pickup_area_id = p_pickup_area_id
    AND r.destination_area_id = p_destination_area_id
    AND p_passengers BETWEEN r.minimum_passengers AND r.maximum_passengers
    AND (r.vehicle_id IS NULL OR r.vehicle_id = p_vehicle_id)
    AND (
      cardinality(r.areas_visited) = 0
      OR (
        cardinality(r.areas_visited) = cardinality(visited)
        AND r.areas_visited @> visited
        AND visited @> r.areas_visited
      )
    )
  ORDER BY
    CASE WHEN r.vehicle_id IS NOT NULL THEN 1 ELSE 0 END DESC,
    CASE WHEN cardinality(r.areas_visited) > 0 THEN 1 ELSE 0 END DESC,
    r.priority DESC,
    r.updated_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.match_pricing_rule(UUID, UUID, UUID, UUID[], INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_pricing_rule(UUID, UUID, UUID, UUID[], INTEGER, UUID) TO authenticated;

-- Resolve area name → id (case-insensitive)
CREATE OR REPLACE FUNCTION public.resolve_area_id(p_name TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM public.areas a
  WHERE lower(a.name) = lower(trim(p_name))
    AND a.active = TRUE
  ORDER BY a.name
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_area_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_area_id(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_area_ids(p_names TEXT[])
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT public.resolve_area_id(n)
      FROM unnest(COALESCE(p_names, '{}')) AS n
      WHERE public.resolve_area_id(n) IS NOT NULL
    ),
    '{}'::UUID[]
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_area_ids(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_area_ids(TEXT[]) TO authenticated;

-- Apply pricing to a trip row (used by trigger + RPC)
CREATE OR REPLACE FUNCTION public.apply_pricing_to_trip_row(trip_row public.trips)
RETURNS public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pickup_id UUID;
  dest_id UUID;
  visited_ids UUID[];
  matched RECORD;
BEGIN
  IF trip_row.price_locked THEN
    RETURN trip_row;
  END IF;

  -- Approved / invoiced trips never recalculate
  IF trip_row.status IN ('approved', 'invoiced') THEN
    RETURN trip_row;
  END IF;

  pickup_id := public.resolve_area_id(trip_row.pickup_area);
  dest_id := public.resolve_area_id(trip_row.destination_area);
  visited_ids := public.resolve_area_ids(trip_row.areas_visited);

  IF pickup_id IS NULL OR dest_id IS NULL THEN
    trip_row.calculated_price := NULL;
    trip_row.pricing_rule_id := NULL;
    trip_row.pricing_status := 'needs_pricing';
    trip_row.price_calculated_at := NOW();
    RETURN trip_row;
  END IF;

  SELECT * INTO matched
  FROM public.match_pricing_rule(
    trip_row.company_id,
    pickup_id,
    dest_id,
    visited_ids,
    trip_row.passengers,
    trip_row.vehicle_id
  );

  IF matched.id IS NULL THEN
    trip_row.calculated_price := NULL;
    trip_row.pricing_rule_id := NULL;
    trip_row.pricing_status := 'needs_pricing';
    trip_row.price_calculated_at := NOW();
  ELSE
    trip_row.calculated_price := matched.price;
    trip_row.pricing_rule_id := matched.id;
    trip_row.pricing_status := 'calculated';
    trip_row.price_calculated_at := NOW();
  END IF;

  RETURN trip_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.trips_pricing_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  action_name TEXT;
BEGIN
  -- Lock price when transitioning to approved
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.price_locked := TRUE;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      actor,
      'Price Locked',
      'trip',
      NEW.id,
      jsonb_build_object(
        'calculated_price', NEW.calculated_price,
        'pricing_rule_id', NEW.pricing_rule_id
      )
    );
  END IF;

  -- Pending trips always recalculate on change.
  -- Locked / approved / invoiced trips never recalculate.
  IF NEW.price_locked
     OR NEW.status IN ('approved', 'invoiced') THEN
    RETURN NEW;
  END IF;

  NEW := public.apply_pricing_to_trip_row(NEW);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      actor,
      'Trip Created',
      'trip',
      NEW.id,
      jsonb_build_object('status', NEW.status)
    );

    action_name := CASE
      WHEN NEW.pricing_status = 'calculated' THEN 'Price Calculated'
      ELSE 'Price Calculated'
    END;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      actor,
      action_name,
      'trip',
      NEW.id,
      jsonb_build_object(
        'pricing_status', NEW.pricing_status,
        'calculated_price', NEW.calculated_price,
        'pricing_rule_id', NEW.pricing_rule_id
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF (
      NEW.company_id,
      NEW.vehicle_id,
      NEW.pickup_area,
      NEW.destination_area,
      NEW.areas_visited,
      NEW.passengers
    ) IS DISTINCT FROM (
      OLD.company_id,
      OLD.vehicle_id,
      OLD.pickup_area,
      OLD.destination_area,
      OLD.areas_visited,
      OLD.passengers
    ) THEN
      INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
      VALUES (
        actor,
        'Price Recalculated',
        'trip',
        NEW.id,
        jsonb_build_object(
          'pricing_status', NEW.pricing_status,
          'old_price', OLD.calculated_price,
          'new_price', NEW.calculated_price,
          'pricing_rule_id', NEW.pricing_rule_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_pricing_trigger ON public.trips;
CREATE TRIGGER trips_pricing_trigger
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_pricing_trigger_fn();

-- Prevent non-admins from writing pricing columns
CREATE OR REPLACE FUNCTION public.trips_protect_pricing_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Drivers may insert trips; pricing is applied by the pricing trigger.
    -- Strip any client-supplied pricing payload.
    NEW.calculated_price := NULL;
    NEW.pricing_rule_id := NULL;
    NEW.price_locked := FALSE;
    NEW.price_calculated_at := NULL;
    NEW.pricing_status := 'needs_pricing';
    RETURN NEW;
  END IF;

  IF (
    NEW.calculated_price IS DISTINCT FROM OLD.calculated_price
    OR NEW.pricing_rule_id IS DISTINCT FROM OLD.pricing_rule_id
    OR NEW.price_locked IS DISTINCT FROM OLD.price_locked
    OR NEW.price_calculated_at IS DISTINCT FROM OLD.price_calculated_at
    OR NEW.pricing_status IS DISTINCT FROM OLD.pricing_status
  ) THEN
    -- Restore pricing fields; allow route edits to flow to pricing trigger
    NEW.calculated_price := OLD.calculated_price;
    NEW.pricing_rule_id := OLD.pricing_rule_id;
    NEW.price_locked := OLD.price_locked;
    NEW.price_calculated_at := OLD.price_calculated_at;
    NEW.pricing_status := OLD.pricing_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_protect_pricing_columns ON public.trips;
CREATE TRIGGER trips_protect_pricing_columns
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_protect_pricing_columns();

-- Ensure protect runs before pricing apply
DROP TRIGGER IF EXISTS trips_protect_pricing_columns ON public.trips;
DROP TRIGGER IF EXISTS trips_pricing_trigger ON public.trips;

CREATE TRIGGER trips_protect_pricing_columns
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_protect_pricing_columns();

CREATE TRIGGER trips_pricing_trigger
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_pricing_trigger_fn();

-- Soft-delete only for pricing_rules (block hard deletes for non-service roles)
CREATE OR REPLACE FUNCTION public.pricing_rules_block_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Pricing rules cannot be permanently deleted. Set active = false instead.';
END;
$$;

DROP TRIGGER IF EXISTS pricing_rules_block_hard_delete ON public.pricing_rules;
CREATE TRIGGER pricing_rules_block_hard_delete
  BEFORE DELETE ON public.pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.pricing_rules_block_hard_delete();

-- Admin preview RPC
CREATE OR REPLACE FUNCTION public.preview_trip_price(
  p_company_id UUID,
  p_pickup_area_name TEXT,
  p_destination_area_name TEXT,
  p_areas_visited TEXT[],
  p_passengers INTEGER,
  p_vehicle_id UUID
)
RETURNS TABLE (
  matched_rule_id UUID,
  calculated_price NUMERIC,
  reason TEXT,
  pricing_status public.pricing_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pickup_id UUID;
  dest_id UUID;
  visited_ids UUID[];
  matched RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can preview pricing';
  END IF;

  pickup_id := public.resolve_area_id(p_pickup_area_name);
  dest_id := public.resolve_area_id(p_destination_area_name);
  visited_ids := public.resolve_area_ids(p_areas_visited);

  IF pickup_id IS NULL OR dest_id IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID,
      NULL::NUMERIC,
      'Pickup or destination area could not be resolved'::TEXT,
      'needs_pricing'::public.pricing_status;
    RETURN;
  END IF;

  SELECT * INTO matched
  FROM public.match_pricing_rule(
    p_company_id,
    pickup_id,
    dest_id,
    visited_ids,
    p_passengers,
    p_vehicle_id
  );

  IF matched.id IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID,
      NULL::NUMERIC,
      'No matching pricing rule'::TEXT,
      'needs_pricing'::public.pricing_status;
  ELSE
    RETURN QUERY SELECT
      matched.id,
      matched.price,
      matched.reason,
      'calculated'::public.pricing_status;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_trip_price(UUID, TEXT, TEXT, TEXT[], INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_trip_price(UUID, TEXT, TEXT, TEXT[], INTEGER, UUID) TO authenticated;

-- Admin trip list with pricing (drivers cannot call usefully — checks is_admin)
CREATE OR REPLACE FUNCTION public.list_admin_trips()
RETURNS TABLE (
  id UUID,
  driver_id UUID,
  company_id UUID,
  vehicle_id UUID,
  trip_date DATE,
  trip_time TIME,
  pickup_area TEXT,
  destination_area TEXT,
  areas_visited TEXT[],
  passengers INTEGER,
  notes TEXT,
  status public.trip_status,
  calculated_price NUMERIC,
  pricing_rule_id UUID,
  price_locked BOOLEAN,
  price_calculated_at TIMESTAMPTZ,
  pricing_status public.pricing_status,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  company_name TEXT,
  vehicle_label TEXT,
  driver_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list all trips with pricing';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.driver_id,
    t.company_id,
    t.vehicle_id,
    t.trip_date,
    t.trip_time,
    t.pickup_area,
    t.destination_area,
    t.areas_visited,
    t.passengers,
    t.notes,
    t.status,
    t.calculated_price,
    t.pricing_rule_id,
    t.price_locked,
    t.price_calculated_at,
    t.pricing_status,
    t.created_at,
    t.updated_at,
    c.company_name,
    (v.registration || ' · ' || v.make || ' ' || v.model) AS vehicle_label,
    COALESCE(p.full_name, p.email, 'Driver') AS driver_name
  FROM public.trips t
  INNER JOIN public.companies c ON c.id = t.company_id
  INNER JOIN public.vehicles v ON v.id = t.vehicle_id
  INNER JOIN public.drivers d ON d.id = t.driver_id
  INNER JOIN public.profiles p ON p.id = d.profile_id
  ORDER BY t.trip_date DESC, t.trip_time DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_trips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_trips() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_trip(p_trip_id UUID)
RETURNS TABLE (
  id UUID,
  driver_id UUID,
  company_id UUID,
  vehicle_id UUID,
  trip_date DATE,
  trip_time TIME,
  pickup_area TEXT,
  destination_area TEXT,
  areas_visited TEXT[],
  passengers INTEGER,
  notes TEXT,
  status public.trip_status,
  calculated_price NUMERIC,
  pricing_rule_id UUID,
  price_locked BOOLEAN,
  price_calculated_at TIMESTAMPTZ,
  pricing_status public.pricing_status,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  company_name TEXT,
  vehicle_label TEXT,
  driver_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view trip pricing';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.list_admin_trips() t
  WHERE t.id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_trip(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_trip(UUID) TO authenticated;

-- Manual override (admin only)
CREATE OR REPLACE FUNCTION public.override_trip_price(
  p_trip_id UUID,
  p_new_price NUMERIC,
  p_reason TEXT
)
RETURNS public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.trips;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can override trip prices';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required for price overrides';
  END IF;

  IF p_new_price IS NULL OR p_new_price < 0 THEN
    RAISE EXCEPTION 'Override price must be zero or greater';
  END IF;

  SELECT * INTO current_row FROM public.trips WHERE id = p_trip_id FOR UPDATE;
  IF current_row.id IS NULL THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  INSERT INTO public.pricing_history (trip_id, old_price, new_price, changed_by, reason)
  VALUES (p_trip_id, current_row.calculated_price, p_new_price, auth.uid(), trim(p_reason));

  UPDATE public.trips
  SET
    calculated_price = p_new_price,
    pricing_status = 'manual_override',
    price_calculated_at = NOW()
  WHERE id = p_trip_id
  RETURNING * INTO current_row;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'Manual Override',
    'trip',
    p_trip_id,
    jsonb_build_object(
      'new_price', p_new_price,
      'reason', trim(p_reason)
    )
  );

  RETURN current_row;
END;
$$;

REVOKE ALL ON FUNCTION public.override_trip_price(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.override_trip_price(UUID, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: pricing_history admin-only; tighten pricing_rules (already admin-only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pricing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pricing history" ON public.pricing_history;
CREATE POLICY "Admins manage pricing history"
  ON public.pricing_history FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Drivers must not read pricing columns via direct table select of *.
-- PostgREST cannot hide columns per-role easily; driver-facing RPCs omit them.
-- Block drivers from selecting pricing_history / pricing_rules (already blocked).

GRANT SELECT, INSERT ON public.pricing_history TO authenticated;

-- ---------------------------------------------------------------------------
-- Keep driver RPCs free of pricing columns (reaffirm Phase 2 signatures)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_trips()
RETURNS TABLE (
  id UUID,
  driver_id UUID,
  company_id UUID,
  vehicle_id UUID,
  trip_date DATE,
  trip_time TIME,
  pickup_area TEXT,
  destination_area TEXT,
  areas_visited TEXT[],
  passengers INTEGER,
  notes TEXT,
  status public.trip_status,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  company_name TEXT,
  vehicle_label TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.driver_id,
    t.company_id,
    t.vehicle_id,
    t.trip_date,
    t.trip_time,
    t.pickup_area,
    t.destination_area,
    t.areas_visited,
    t.passengers,
    t.notes,
    t.status,
    t.created_at,
    t.updated_at,
    c.company_name,
    (v.registration || ' · ' || v.make || ' ' || v.model) AS vehicle_label
  FROM public.trips t
  INNER JOIN public.companies c ON c.id = t.company_id
  INNER JOIN public.vehicles v ON v.id = t.vehicle_id
  WHERE t.driver_id = public.current_driver_id()
  ORDER BY t.trip_date DESC, t.trip_time DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_my_trip(p_trip_id UUID)
RETURNS TABLE (
  id UUID,
  driver_id UUID,
  company_id UUID,
  vehicle_id UUID,
  trip_date DATE,
  trip_time TIME,
  pickup_area TEXT,
  destination_area TEXT,
  areas_visited TEXT[],
  passengers INTEGER,
  notes TEXT,
  status public.trip_status,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  company_name TEXT,
  vehicle_label TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.list_my_trips() t
  WHERE t.id = p_trip_id;
$$;
