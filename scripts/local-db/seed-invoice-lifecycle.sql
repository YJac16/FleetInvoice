-- Rich invoice lifecycle fixtures for Org A (browser audit).
-- Service week: 2026-09-22 (Mon) – period_end 2026-09-29 (exclusive).

insert into public.companies (id, organisation_id, name, status)
values (
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000001',
  'Very Long Client Company Name (Pty) Ltd — Northern Region Shuttle Contract 2026',
  'active'
)
on conflict (id) do update set name = excluded.name;

insert into public.areas (id, organisation_id, name, status)
values
  ('a0000000-0000-4000-8000-000000000801', 'a0000000-0000-4000-8000-000000000001', 'Central / WEX William St', 'active'),
  ('a0000000-0000-4000-8000-000000000802', 'a0000000-0000-4000-8000-000000000001', 'Airport & Long-Haul Description With Special Chars «§»', 'active')
on conflict (id) do nothing;

insert into public.vehicles (id, organisation_id, company_id, name, registration_number, vehicle_type, status)
values (
  'a0000000-0000-4000-8000-000000000701',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000103',
  'Toyota Quantum',
  'CA 123 GP',
  'minibus',
  'active'
)
on conflict (id) do update set company_id = excluded.company_id;

insert into public.routes (id, organisation_id, company_id, area_id, name, status)
values (
  'a0000000-0000-4000-8000-000000000601',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000801',
  'Audit shuttle route',
  'active'
)
on conflict (id) do nothing;

insert into public.rate_cards (
  id, organisation_id, company_id, name, line_type, unit, unit_amount, effective_from
)
values
  (
    'a0000000-0000-4000-8000-000000000901',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000103',
    'Trip rate',
    'trip',
    'trip',
    1250.00,
    '2026-01-01'
  ),
  (
    'a0000000-0000-4000-8000-000000000902',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000103',
    'Zero promo trip',
    'trip',
    'trip',
    0.00,
    '2026-01-01'
  )
on conflict (id) do nothing;

-- 12 completed trips in service week (multi-line / multi-page invoice)
do $$
declare
  i int;
  trip_id uuid;
  start_ts timestamptz;
begin
  for i in 0..11 loop
    trip_id := gen_random_uuid();
    start_ts := timestamptz '2026-09-22 06:00:00+00' + (i || ' hours')::interval;
    insert into public.trips (
      id, organisation_id, route_id, company_id, planned_start, planned_end, status
    )
    values (
      trip_id,
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000601',
      'a0000000-0000-4000-8000-000000000103',
      start_ts,
      start_ts + interval '2 hours',
      'completed'
    );
    insert into public.trip_assignments (
      organisation_id, trip_id, driver_id, vehicle_id, assigned_at
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      trip_id,
      'a0000000-0000-4000-8000-000000000201',
      'a0000000-0000-4000-8000-000000000701',
      start_ts
    );
    insert into public.trip_passengers (
      organisation_id, trip_id, employee_id, direction, status, confirmed_at, boarded_at
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      trip_id,
      'a0000000-0000-4000-8000-000000000301',
      'to_work',
      'boarded',
      start_ts,
      start_ts
    );
  end loop;
end $$;

-- Large amount fuel line in same week
insert into public.fuel_fillups (
  id, organisation_id, company_id, driver_id, vehicle_id,
  filled_at, litres, unit_price, total_amount, odometer_km
)
values (
  'a0000000-0000-4000-8000-000000000951',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000201',
  'a0000000-0000-4000-8000-000000000701',
  '2026-09-24 12:00:00+00',
  80,
  999.99,
  79999.20,
  150000
)
on conflict (id) do nothing;
