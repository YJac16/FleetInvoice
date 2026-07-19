-- FleetInvoice Phase 2 — Driver trip capture fields, status model, RLS updates

-- ---------------------------------------------------------------------------
-- Status enum: pending | approved | rejected | invoiced
-- ---------------------------------------------------------------------------
ALTER TABLE public.trips
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.trips
  ALTER COLUMN status TYPE TEXT
  USING (
    CASE status::TEXT
      WHEN 'draft' THEN 'pending'
      WHEN 'submitted' THEN 'pending'
      WHEN 'cancelled' THEN 'rejected'
      ELSE status::TEXT
    END
  );

DROP TYPE public.trip_status;

CREATE TYPE public.trip_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'invoiced'
);

ALTER TABLE public.trips
  ALTER COLUMN status TYPE public.trip_status
  USING status::public.trip_status;

ALTER TABLE public.trips
  ALTER COLUMN status SET DEFAULT 'pending'::public.trip_status;

-- ---------------------------------------------------------------------------
-- Trip capture columns (no pricing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS pickup_area TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS destination_area TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS areas_visited TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS passengers INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.trips
  ALTER COLUMN pickup_area DROP DEFAULT,
  ALTER COLUMN destination_area DROP DEFAULT;

ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_passengers_range_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_passengers_range_check
  CHECK (passengers >= 1 AND passengers <= 60);

ALTER TABLE public.trips
  ALTER COLUMN vehicle_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_pickup_area ON public.trips (pickup_area);
CREATE INDEX IF NOT EXISTS idx_trips_destination_area ON public.trips (destination_area);
CREATE INDEX IF NOT EXISTS idx_trips_driver_date_time
  ON public.trips (driver_id, trip_date, trip_time);

-- ---------------------------------------------------------------------------
-- RLS: replace update policy; allow delete of pending own trips
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Drivers can update own draft/submitted trips" ON public.trips;

CREATE POLICY "Drivers can update own pending or rejected trips"
  ON public.trips FOR UPDATE
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    AND status IN ('pending', 'rejected')
  )
  WITH CHECK (
    driver_id = public.current_driver_id()
    AND status IN ('pending', 'rejected')
  );

DROP POLICY IF EXISTS "Drivers can delete own pending trips" ON public.trips;

CREATE POLICY "Drivers can delete own pending trips"
  ON public.trips FOR DELETE
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    AND status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- Seed Cape Town service areas (idempotent by name)
-- ---------------------------------------------------------------------------
INSERT INTO public.areas (name, zone, active)
SELECT name, zone, TRUE
FROM (
  VALUES
    ('Town', 'Central'),
    ('Woodstock', 'Central'),
    ('Green Point', 'Atlantic'),
    ('Sea Point', 'Atlantic'),
    ('Airport', 'East'),
    ('Bellville', 'Northern'),
    ('Parow', 'Northern'),
    ('Milnerton', 'West Coast'),
    ('Observatory', 'Central'),
    ('Other', 'Other')
) AS seed(name, zone)
WHERE NOT EXISTS (
  SELECT 1 FROM public.areas a WHERE a.name = seed.name
);

-- ---------------------------------------------------------------------------
-- Drivers must not read company billing fields.
-- Remove broad company SELECT for drivers; expose a safe directory RPC.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Drivers can view active companies" ON public.companies;

CREATE OR REPLACE FUNCTION public.list_active_companies()
RETURNS TABLE (id UUID, company_name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.company_name
  FROM public.companies c
  WHERE c.active = TRUE
  ORDER BY c.company_name;
$$;

REVOKE ALL ON FUNCTION public.list_active_companies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_companies() TO authenticated;

-- Enriched trip list for the signed-in driver (no company billing fields).
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

REVOKE ALL ON FUNCTION public.list_my_trips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_trips() TO authenticated;

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

REVOKE ALL ON FUNCTION public.get_my_trip(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_trip(UUID) TO authenticated;
