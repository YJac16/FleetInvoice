-- =============================================================================
-- WorkOps demo seed — Cape Shuttle Ops (Cape Town staff transport)
-- =============================================================================
-- For screenshots / display. Run in Supabase SQL editor (bypasses RLS as admin).
--
-- Prerequisites:
--   1. Migrations applied
--   2. Auth user exists with email below (create in Supabase Auth first)
--
-- Usage:
--   1. Optionally edit v_admin_email
--   2. Run this entire script once
--   3. Sign in → /dashboard, /areas, /vehicles, /trips, /fuel, /invoices
--
-- Idempotent: skips if organisation slug 'cape-shuttle-ops' already exists.
-- =============================================================================

do $$
declare
  v_admin_email text := 'admin@cape-shuttle.example';
  v_admin_id uuid;
  v_org_id uuid := 'a1000000-0000-4000-8000-000000000001';
  v_member_id uuid := 'a1000000-0000-4000-8000-000000000002';

  v_acm uuid := 'a2000000-0000-4000-8000-000000000001';
  v_hbr uuid := 'a2000000-0000-4000-8000-000000000002';

  v_area_parklands uuid := 'a3000000-0000-4000-8000-000000000001';
  v_area_milnerton uuid := 'a3000000-0000-4000-8000-000000000002';
  v_area_woodstock uuid := 'a3000000-0000-4000-8000-000000000003';
  v_area_kensington uuid := 'a3000000-0000-4000-8000-000000000004';
  v_area_dunoon uuid := 'a3000000-0000-4000-8000-000000000005';
  v_area_houtbay uuid := 'a3000000-0000-4000-8000-000000000006';
  v_area_district6 uuid := 'a3000000-0000-4000-8000-000000000007';

  v_site_foreshore uuid := 'a4000000-0000-4000-8000-000000000001';
  v_site_century uuid := 'a4000000-0000-4000-8000-000000000002';
  v_site_paarden uuid := 'a4000000-0000-4000-8000-000000000003';

  v_pu_parklands uuid := 'a5000000-0000-4000-8000-000000000001';
  v_pu_milnerton uuid := 'a5000000-0000-4000-8000-000000000002';
  v_pu_woodstock uuid := 'a5000000-0000-4000-8000-000000000003';
  v_pu_kensington uuid := 'a5000000-0000-4000-8000-000000000004';
  v_pu_dunoon uuid := 'a5000000-0000-4000-8000-000000000005';
  v_pu_houtbay uuid := 'a5000000-0000-4000-8000-000000000006';
  v_pu_district6 uuid := 'a5000000-0000-4000-8000-000000000007';

  v_drv_thabo uuid := 'a6000000-0000-4000-8000-000000000001';
  v_drv_ayesha uuid := 'a6000000-0000-4000-8000-000000000002';
  v_drv_johan uuid := 'a6000000-0000-4000-8000-000000000003';
  v_drv_lindiwe uuid := 'a6000000-0000-4000-8000-000000000004';
  v_drv_farouk uuid := 'a6000000-0000-4000-8000-000000000005';
  v_drv_chantal uuid := 'a6000000-0000-4000-8000-000000000006';

  v_veh_q1 uuid := 'a7000000-0000-4000-8000-000000000001';
  v_veh_q2 uuid := 'a7000000-0000-4000-8000-000000000002';
  v_veh_q3 uuid := 'a7000000-0000-4000-8000-000000000003';
  v_veh_e1 uuid := 'a7000000-0000-4000-8000-000000000004';
  v_veh_e2 uuid := 'a7000000-0000-4000-8000-000000000005';

  v_route_north uuid := 'a8000000-0000-4000-8000-000000000001';
  v_route_city uuid := 'a8000000-0000-4000-8000-000000000002';
  v_route_atlantic uuid := 'a8000000-0000-4000-8000-000000000003';
  v_sched_north uuid := 'a8000000-0000-4000-8000-000000000011';
  v_sched_city uuid := 'a8000000-0000-4000-8000-000000000012';
  v_sched_atlantic uuid := 'a8000000-0000-4000-8000-000000000013';

  v_trip_n1 uuid := 'a9000000-0000-4000-8000-000000000001';
  v_trip_n2 uuid := 'a9000000-0000-4000-8000-000000000002';
  v_trip_c1 uuid := 'a9000000-0000-4000-8000-000000000003';
  v_trip_c2 uuid := 'a9000000-0000-4000-8000-000000000004';
  v_trip_a1 uuid := 'a9000000-0000-4000-8000-000000000005';
  v_trip_a2 uuid := 'a9000000-0000-4000-8000-000000000006';

  v_asg_1 uuid := 'aa000000-0000-4000-8000-000000000001';
  v_asg_2 uuid := 'aa000000-0000-4000-8000-000000000002';
  v_asg_3 uuid := 'aa000000-0000-4000-8000-000000000003';
  v_asg_4 uuid := 'aa000000-0000-4000-8000-000000000004';
  v_asg_5 uuid := 'aa000000-0000-4000-8000-000000000005';

  v_fuel_1 uuid := 'ab000000-0000-4000-8000-000000000001';
  v_fuel_2 uuid := 'ab000000-0000-4000-8000-000000000002';
  v_fuel_3 uuid := 'ab000000-0000-4000-8000-000000000003';
  v_fuel_4 uuid := 'ab000000-0000-4000-8000-000000000004';
  v_inv uuid := 'ac000000-0000-4000-8000-000000000001';
  v_inv_l1 uuid := 'ac000000-0000-4000-8000-000000000011';
  v_inv_l2 uuid := 'ac000000-0000-4000-8000-000000000012';
  v_inv_l3 uuid := 'ac000000-0000-4000-8000-000000000013';
  v_inv_l4 uuid := 'ac000000-0000-4000-8000-000000000014';

  v_period_start date;
  v_period_end date;
  v_week_mon date;
  v_ts timestamptz;
begin
  if exists (
    select 1 from public.organisations
    where slug = 'cape-shuttle-ops' and deleted_at is null
  ) then
    raise notice 'Demo org cape-shuttle-ops already exists — skipping seed.';
    return;
  end if;

  select id into v_admin_id
  from public.profiles
  where lower(email) = lower(v_admin_email)
  limit 1;

  if v_admin_id is null then
    raise exception
      'No profile for %. Create the Auth user first, then re-run this seed.',
      v_admin_email;
  end if;

  -- Last completed Mon–Sun week (Postgres date_trunc('week') starts Monday)
  v_week_mon := date_trunc('week', current_date)::date;
  v_period_start := v_week_mon - 7;
  v_period_end := v_week_mon - 1;

  -- -------------------------------------------------------------------------
  -- Organisation + membership
  -- -------------------------------------------------------------------------
  insert into public.organisations (id, name, slug, status, created_by)
  values (v_org_id, 'Cape Shuttle Ops', 'cape-shuttle-ops', 'active', v_admin_id);

  insert into public.organisation_members (
    id, organisation_id, user_id, role, status, created_by
  ) values (
    v_member_id, v_org_id, v_admin_id, 'organisation_admin', 'active', v_admin_id
  );

  -- -------------------------------------------------------------------------
  -- Companies
  -- -------------------------------------------------------------------------
  insert into public.companies (
    id, organisation_id, name, code, contact_name, contact_email,
    contact_phone, address, status, created_by
  ) values
    (
      v_acm, v_org_id, 'Acme Staffing', 'ACM', 'Nomsa Dlamini',
      'billing@acmestaffing.example', '+27 21 555 0101',
      '12 Long Street, Cape Town CBD, 8001', 'active', v_admin_id
    ),
    (
      v_hbr, v_org_id, 'Harbor Logistics', 'HBR', 'Pieter Botha',
      'ops@harborlog.example', '+27 21 555 0202',
      'Dock Road, V&A Waterfront, 8002', 'active', v_admin_id
    );

  -- -------------------------------------------------------------------------
  -- Areas
  -- -------------------------------------------------------------------------
  insert into public.areas (
    id, organisation_id, name, code, description, status, created_by
  ) values
    (v_area_parklands, v_org_id, 'Parklands', 'PKL', 'Northern suburbs staff pickups', 'active', v_admin_id),
    (v_area_milnerton, v_org_id, 'Milnerton', 'MIL', 'Blaauwberg corridor', 'active', v_admin_id),
    (v_area_woodstock, v_org_id, 'Woodstock', 'WDS', 'City fringe / industrial', 'active', v_admin_id),
    (v_area_kensington, v_org_id, 'Kensington', 'KEN', 'Northern city bowl approach', 'active', v_admin_id),
    (v_area_dunoon, v_org_id, 'Dunoon', 'DUN', 'Northern residential pickups', 'active', v_admin_id),
    (v_area_houtbay, v_org_id, 'Hout Bay', 'HTB', 'Atlantic seaboard', 'active', v_admin_id),
    (v_area_district6, v_org_id, 'District Six', 'DSX', 'CBD east / heritage precinct', 'active', v_admin_id);

  -- -------------------------------------------------------------------------
  -- Workplace sites (made-up names)
  -- -------------------------------------------------------------------------
  insert into public.sites (
    id, organisation_id, company_id, area_id, name, code, address,
    latitude, longitude, status, created_by
  ) values
    (
      v_site_foreshore, v_org_id, v_acm, v_area_district6,
      'Acme Foreshore Tower', 'ACM-FSH',
      '1 Hertzog Boulevard, Foreshore, Cape Town, 8001',
      -33.9198000, 18.4294000, 'active', v_admin_id
    ),
    (
      v_site_century, v_org_id, v_acm, v_area_milnerton,
      'Acme Century City Hub', 'ACM-CC',
      'Ratanga Road, Century City, 7441',
      -33.8912000, 18.5118000, 'active', v_admin_id
    ),
    (
      v_site_paarden, v_org_id, v_hbr, v_area_woodstock,
      'Harbor Logistics Paarden Eiland Yard', 'HBR-PE',
      'Marine Drive, Paarden Eiland, 7405',
      -33.9124000, 18.4689000, 'active', v_admin_id
    );

  -- -------------------------------------------------------------------------
  -- Pickup points (one per area)
  -- -------------------------------------------------------------------------
  insert into public.pickup_points (
    id, organisation_id, site_id, area_id, name, code, address,
    latitude, longitude, status, created_by
  ) values
    (v_pu_parklands, v_org_id, null, v_area_parklands, 'Parklands Circle', 'PKL-01', 'Parklands Main Road, Parklands', -33.8125000, 18.4912000, 'active', v_admin_id),
    (v_pu_milnerton, v_org_id, null, v_area_milnerton, 'Milnerton Racecourse Rd', 'MIL-01', 'Racecourse Road, Milnerton', -33.8688000, 18.4965000, 'active', v_admin_id),
    (v_pu_woodstock, v_org_id, v_site_paarden, v_area_woodstock, 'Woodstock Station', 'WDS-01', 'Albert Road, Woodstock', -33.9258000, 18.4461000, 'active', v_admin_id),
    (v_pu_kensington, v_org_id, null, v_area_kensington, 'Kensington Civic', 'KEN-01', '11th Avenue, Kensington', -33.9102000, 18.5058000, 'active', v_admin_id),
    (v_pu_dunoon, v_org_id, null, v_area_dunoon, 'Dunoon Main Rd', 'DUN-01', 'Potsdam Road, Dunoon', -33.8261000, 18.5419000, 'active', v_admin_id),
    (v_pu_houtbay, v_org_id, null, v_area_houtbay, 'Hout Bay Harbour', 'HTB-01', 'Harbour Road, Hout Bay', -34.0489000, 18.3478000, 'active', v_admin_id),
    (v_pu_district6, v_org_id, v_site_foreshore, v_area_district6, 'District Six Museum stop', 'DSX-01', 'Buitenkant Street, District Six', -33.9281000, 18.4328000, 'active', v_admin_id);

  -- -------------------------------------------------------------------------
  -- Drivers (made-up names)
  -- -------------------------------------------------------------------------
  insert into public.drivers (
    id, organisation_id, full_name, email, phone, license_number, status, created_by
  ) values
    (v_drv_thabo, v_org_id, 'Thabo Nkosi', 'thabo.nkosi@cape-shuttle.example', '+27 82 555 1001', 'CA-PDP-1001', 'active', v_admin_id),
    (v_drv_ayesha, v_org_id, 'Ayesha Petersen', 'ayesha.petersen@cape-shuttle.example', '+27 82 555 1002', 'CA-PDP-1002', 'active', v_admin_id),
    (v_drv_johan, v_org_id, 'Johan van Wyk', 'johan.vanwyk@cape-shuttle.example', '+27 82 555 1003', 'CA-PDP-1003', 'active', v_admin_id),
    (v_drv_lindiwe, v_org_id, 'Lindiwe Mokoena', 'lindiwe.mokoena@cape-shuttle.example', '+27 82 555 1004', 'CA-PDP-1004', 'active', v_admin_id),
    (v_drv_farouk, v_org_id, 'Farouk Ismail', 'farouk.ismail@cape-shuttle.example', '+27 82 555 1005', 'CA-PDP-1005', 'active', v_admin_id),
    (v_drv_chantal, v_org_id, 'Chantal September', 'chantal.september@cape-shuttle.example', '+27 82 555 1006', 'CA-PDP-1006', 'active', v_admin_id);

  -- -------------------------------------------------------------------------
  -- Employees (made-up names across workplace sites)
  -- -------------------------------------------------------------------------
  insert into public.employees (
    id, organisation_id, company_id, site_id, full_name, email, phone,
    employee_number, status, created_by
  ) values
    ('a6100000-0000-4000-8000-000000000001', v_org_id, v_acm, v_site_foreshore, 'Sipho Mabena', 'sipho.mabena@acmestaffing.example', '+27 71 555 2001', 'ACM-1001', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000002', v_org_id, v_acm, v_site_foreshore, 'Fatima Abrahams', 'fatima.abrahams@acmestaffing.example', '+27 71 555 2002', 'ACM-1002', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000003', v_org_id, v_acm, v_site_foreshore, 'Craig October', 'craig.october@acmestaffing.example', '+27 71 555 2003', 'ACM-1003', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000004', v_org_id, v_acm, v_site_century, 'Naledi Khumalo', 'naledi.khumalo@acmestaffing.example', '+27 71 555 2004', 'ACM-1004', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000005', v_org_id, v_acm, v_site_century, 'Devon Jacobs', 'devon.jacobs@acmestaffing.example', '+27 71 555 2005', 'ACM-1005', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000006', v_org_id, v_acm, v_site_century, 'Zanele Dube', 'zanele.dube@acmestaffing.example', '+27 71 555 2006', 'ACM-1006', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000007', v_org_id, v_acm, v_site_foreshore, 'Ryan Cupido', 'ryan.cupido@acmestaffing.example', '+27 71 555 2007', 'ACM-1007', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000008', v_org_id, v_acm, v_site_foreshore, 'Thandiwe Sithole', 'thandiwe.sithole@acmestaffing.example', '+27 71 555 2008', 'ACM-1008', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000009', v_org_id, v_acm, v_site_century, 'Mark Solomons', 'mark.solomons@acmestaffing.example', '+27 71 555 2009', 'ACM-1009', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000010', v_org_id, v_acm, v_site_foreshore, 'Leah Naidoo', 'leah.naidoo@acmestaffing.example', '+27 71 555 2010', 'ACM-1010', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000011', v_org_id, v_acm, v_site_century, 'Bongani Molefe', 'bongani.molefe@acmestaffing.example', '+27 71 555 2011', 'ACM-1011', 'active', v_admin_id),
    ('a6100000-0000-4000-8000-000000000012', v_org_id, v_hbr, v_site_paarden, 'Wendy Fortuin', 'wendy.fortuin@harborlog.example', '+27 71 555 2012', 'HBR-2001', 'active', v_admin_id);

  -- -------------------------------------------------------------------------
  -- Vehicles — Quantams (minibus) + Ertigas (van)
  -- -------------------------------------------------------------------------
  insert into public.vehicles (
    id, organisation_id, company_id, name, registration_number,
    vehicle_type, capacity, status, created_by
  ) values
    (v_veh_q1, v_org_id, v_acm, 'Quantam 1', 'CA 123-456', 'minibus', 16, 'active', v_admin_id),
    (v_veh_q2, v_org_id, v_acm, 'Quantam 2', 'CA 789-012', 'minibus', 16, 'active', v_admin_id),
    (v_veh_q3, v_org_id, v_acm, 'Quantam 3', 'CY 234-567', 'minibus', 14, 'active', v_admin_id),
    (v_veh_e1, v_org_id, v_acm, 'Ertiga 1', 'CA 345-678', 'van', 7, 'active', v_admin_id),
    (v_veh_e2, v_org_id, v_hbr, 'Ertiga 2', 'CY 901-234', 'van', 7, 'active', v_admin_id);

  -- -------------------------------------------------------------------------
  -- Staff morning routes
  -- -------------------------------------------------------------------------
  insert into public.routes (
    id, organisation_id, company_id, area_id, name, code, description, status, created_by
  ) values
    (
      v_route_north, v_org_id, v_acm, v_area_parklands,
      'Northern Corridor Staff Run', 'STAFF-N',
      'Parklands → Milnerton → Dunoon → Acme Century City Hub', 'active', v_admin_id
    ),
    (
      v_route_city, v_org_id, v_acm, v_area_kensington,
      'City Bowl Staff Run', 'STAFF-C',
      'Kensington → Woodstock → District Six → Acme Foreshore Tower', 'active', v_admin_id
    ),
    (
      v_route_atlantic, v_org_id, v_acm, v_area_houtbay,
      'Atlantic Staff Run', 'STAFF-A',
      'Hout Bay Harbour → Acme Foreshore Tower', 'active', v_admin_id
    );

  insert into public.route_stops (
    id, organisation_id, route_id, sequence, site_id, pickup_point_id,
    label, dwell_minutes
  ) values
    ('a8100000-0000-4000-8000-000000000001', v_org_id, v_route_north, 1, null, v_pu_parklands, 'Parklands Circle', 3),
    ('a8100000-0000-4000-8000-000000000002', v_org_id, v_route_north, 2, null, v_pu_milnerton, 'Milnerton Racecourse Rd', 3),
    ('a8100000-0000-4000-8000-000000000003', v_org_id, v_route_north, 3, null, v_pu_dunoon, 'Dunoon Main Rd', 3),
    ('a8100000-0000-4000-8000-000000000004', v_org_id, v_route_north, 4, v_site_century, null, 'Acme Century City Hub', 5),
    ('a8100000-0000-4000-8000-000000000005', v_org_id, v_route_city, 1, null, v_pu_kensington, 'Kensington Civic', 3),
    ('a8100000-0000-4000-8000-000000000006', v_org_id, v_route_city, 2, null, v_pu_woodstock, 'Woodstock Station', 3),
    ('a8100000-0000-4000-8000-000000000007', v_org_id, v_route_city, 3, null, v_pu_district6, 'District Six Museum stop', 2),
    ('a8100000-0000-4000-8000-000000000008', v_org_id, v_route_city, 4, v_site_foreshore, null, 'Acme Foreshore Tower', 5),
    ('a8100000-0000-4000-8000-000000000009', v_org_id, v_route_atlantic, 1, null, v_pu_houtbay, 'Hout Bay Harbour', 4),
    ('a8100000-0000-4000-8000-000000000010', v_org_id, v_route_atlantic, 2, v_site_foreshore, null, 'Acme Foreshore Tower', 5);

  -- days_of_week: Postgres extract(dow) — 0=Sun … 6=Sat; Mon–Fri = 1..5
  insert into public.schedules (
    id, organisation_id, route_id, name, days_of_week, depart_time,
    effective_from, timezone, status, created_by
  ) values
    (v_sched_north, v_org_id, v_route_north, 'Weekday 06:15 North', array[1,2,3,4,5]::smallint[], '06:15', v_period_start, 'Africa/Johannesburg', 'active', v_admin_id),
    (v_sched_city, v_org_id, v_route_city, 'Weekday 06:30 City', array[1,2,3,4,5]::smallint[], '06:30', v_period_start, 'Africa/Johannesburg', 'active', v_admin_id),
    (v_sched_atlantic, v_org_id, v_route_atlantic, 'Weekday 06:00 Atlantic', array[1,2,3,4,5]::smallint[], '06:00', v_period_start, 'Africa/Johannesburg', 'active', v_admin_id);

  -- -------------------------------------------------------------------------
  -- Trips + assignments
  -- -------------------------------------------------------------------------
  v_ts := (v_period_start::text || ' 06:15:00')::timestamp at time zone 'Africa/Johannesburg';
  insert into public.trips (
    id, organisation_id, route_id, schedule_id, company_id,
    planned_start, planned_end, status, generation_key, created_by
  ) values
    (v_trip_n1, v_org_id, v_route_north, v_sched_north, v_acm, v_ts, v_ts + interval '75 minutes', 'completed', 'demo-north-' || v_period_start::text, v_admin_id);

  v_ts := ((v_period_start + 2)::text || ' 06:15:00')::timestamp at time zone 'Africa/Johannesburg';
  insert into public.trips (
    id, organisation_id, route_id, schedule_id, company_id,
    planned_start, planned_end, status, generation_key, created_by
  ) values
    (v_trip_n2, v_org_id, v_route_north, v_sched_north, v_acm, v_ts, v_ts + interval '75 minutes', 'completed', 'demo-north-' || (v_period_start + 2)::text, v_admin_id);

  v_ts := (v_period_start::text || ' 06:30:00')::timestamp at time zone 'Africa/Johannesburg';
  insert into public.trips (
    id, organisation_id, route_id, schedule_id, company_id,
    planned_start, planned_end, status, generation_key, created_by
  ) values
    (v_trip_c1, v_org_id, v_route_city, v_sched_city, v_acm, v_ts, v_ts + interval '60 minutes', 'completed', 'demo-city-' || v_period_start::text, v_admin_id);

  v_ts := ((v_period_start + 2)::text || ' 06:30:00')::timestamp at time zone 'Africa/Johannesburg';
  insert into public.trips (
    id, organisation_id, route_id, schedule_id, company_id,
    planned_start, planned_end, status, generation_key, created_by
  ) values
    (v_trip_c2, v_org_id, v_route_city, v_sched_city, v_acm, v_ts, v_ts + interval '60 minutes', 'assigned', 'demo-city-' || (v_period_start + 2)::text, v_admin_id);

  v_ts := (v_period_start::text || ' 06:00:00')::timestamp at time zone 'Africa/Johannesburg';
  insert into public.trips (
    id, organisation_id, route_id, schedule_id, company_id,
    planned_start, planned_end, status, generation_key, created_by
  ) values
    (v_trip_a1, v_org_id, v_route_atlantic, v_sched_atlantic, v_acm, v_ts, v_ts + interval '90 minutes', 'completed', 'demo-atl-' || v_period_start::text, v_admin_id);

  v_ts := (v_week_mon::text || ' 06:15:00')::timestamp at time zone 'Africa/Johannesburg';
  insert into public.trips (
    id, organisation_id, route_id, schedule_id, company_id,
    planned_start, planned_end, status, generation_key, created_by
  ) values
    (v_trip_a2, v_org_id, v_route_north, v_sched_north, v_acm, v_ts, v_ts + interval '75 minutes', 'planned', 'demo-north-' || v_week_mon::text, v_admin_id);

  insert into public.trip_assignments (
    id, organisation_id, trip_id, driver_id, vehicle_id, assigned_by, assigned_at
  ) values
    (v_asg_1, v_org_id, v_trip_n1, v_drv_thabo, v_veh_q1, v_admin_id, timezone('utc', now())),
    (v_asg_2, v_org_id, v_trip_n2, v_drv_farouk, v_veh_q1, v_admin_id, timezone('utc', now())),
    (v_asg_3, v_org_id, v_trip_c1, v_drv_ayesha, v_veh_q2, v_admin_id, timezone('utc', now())),
    (v_asg_4, v_org_id, v_trip_c2, v_drv_johan, v_veh_e1, v_admin_id, timezone('utc', now())),
    (v_asg_5, v_org_id, v_trip_a1, v_drv_lindiwe, v_veh_q3, v_admin_id, timezone('utc', now()));

  -- -------------------------------------------------------------------------
  -- Fuel fill-ups (ZAR)
  -- -------------------------------------------------------------------------
  insert into public.fuel_fillups (
    id, organisation_id, vehicle_id, driver_id, company_id, filled_at,
    odometer_km, litres, unit_price, total_amount, currency, station_name, created_by
  ) values
    (
      v_fuel_1, v_org_id, v_veh_q1, v_drv_thabo, v_acm,
      (v_period_start::text || ' 17:40:00')::timestamp at time zone 'Africa/Johannesburg',
      84210.0, 55.00, 23.4500, 1289.75, 'ZAR', 'Engen Milnerton', v_admin_id
    ),
    (
      v_fuel_2, v_org_id, v_veh_q2, v_drv_ayesha, v_acm,
      ((v_period_start + 1)::text || ' 18:10:00')::timestamp at time zone 'Africa/Johannesburg',
      76102.0, 48.50, 23.4500, 1137.33, 'ZAR', 'Shell Woodstock', v_admin_id
    ),
    (
      v_fuel_3, v_org_id, v_veh_e1, v_drv_johan, v_acm,
      ((v_period_start + 2)::text || ' 17:55:00')::timestamp at time zone 'Africa/Johannesburg',
      51240.0, 32.00, 23.8900, 764.48, 'ZAR', 'Caltex Kensington', v_admin_id
    ),
    (
      v_fuel_4, v_org_id, v_veh_q3, v_drv_chantal, v_acm,
      ((v_period_start + 3)::text || ' 18:25:00')::timestamp at time zone 'Africa/Johannesburg',
      69880.0, 52.00, 23.4500, 1219.40, 'ZAR', 'Engen Hout Bay', v_admin_id
    );

  -- -------------------------------------------------------------------------
  -- Issued weekly invoice (Acme Staffing — fuel lines)
  -- -------------------------------------------------------------------------
  insert into public.invoices (
    id, organisation_id, company_id, period_start, period_end, status,
    currency, subtotal, total, notes, generated_by, issued_at
  ) values (
    v_inv, v_org_id, v_acm, v_period_start, v_period_end, 'issued',
    'ZAR', 4410.96, 4410.96,
    'Weekly staff transport fuel recovery — Cape Shuttle Ops',
    v_admin_id,
    (v_period_end::text || ' 09:00:00')::timestamp at time zone 'Africa/Johannesburg'
  );

  insert into public.invoice_lines (
    id, organisation_id, invoice_id, line_type, fuel_fillup_id,
    description, quantity, unit_price, amount
  ) values
    (v_inv_l1, v_org_id, v_inv, 'fuel', v_fuel_1, 'Fuel — Quantam 1 (Engen Milnerton)', 55.00, 23.4500, 1289.75),
    (v_inv_l2, v_org_id, v_inv, 'fuel', v_fuel_2, 'Fuel — Quantam 2 (Shell Woodstock)', 48.50, 23.4500, 1137.33),
    (v_inv_l3, v_org_id, v_inv, 'fuel', v_fuel_3, 'Fuel — Ertiga 1 (Caltex Kensington)', 32.00, 23.8900, 764.48),
    (v_inv_l4, v_org_id, v_inv, 'fuel', v_fuel_4, 'Fuel — Quantam 3 (Engen Hout Bay)', 52.00, 23.4500, 1219.40);

  raise notice 'Cape Shuttle Ops demo seeded for % (org %).', v_admin_email, v_org_id;
end $$;
