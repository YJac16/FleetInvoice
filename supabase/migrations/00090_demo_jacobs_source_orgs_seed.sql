-- =============================================================================
-- 00090: DEMO ONLY — fake "Demo Yaseen Org" + "Demo Fadia Org" source orgs
--   for the Jacobs Org copy-and-verify rehearsal (00091 / 00092).
--
--   Every person, company, plate, bank and account here is FAKE
--   (@example.com logins, CA-DEMO-* plates, DEMO-* banks / accounts).
--
--   Guard: runs only where the Cape Shuttle Ops demo org exists (goops-demo)
--   or on the local throwaway test DB (workops_audit). Anywhere else it is a
--   no-op with a NOTICE, so it can never seed a production project.
--   Cape Shuttle Ops (a1000000-0000-4000-8000-000000000001) is never read or
--   written here.
--
--   Logins are created WITHOUT a password. Engineering sets demo passwords
--   with the Auth admin API after applying (same as the Cape Shuttle setup).
--
--   Contents
--     users      demo-jacobs-yaseen@ (admin both orgs), -faadiah@ (admin Fadia),
--                -clerk@ (manager both), -driver-yaseen@ (driver Yaseen org),
--                -driver-zain@ (driver Fadia org)
--     orgs       Demo Yaseen Org (starter plan), Demo Fadia Org (NO subscription)
--     drivers    Yaseen Demo, Paulin Demo (yaseen); Shaheed Demo, Freddy Demo,
--                Zain Demo (fadia); 3 per-driver invoice issuer overrides
--     vehicles   CA-DEMO-Y1/Y2 (yaseen), CA-DEMO-F1/F2 (fadia); 1 standing
--                driver_vehicle_assignments row
--     companies  WCL / Acme / Bay Hotel / Metro Tech in both orgs,
--                Mountain Co (Yaseen only), Coastline (Fadia only)
--     history    weeks 2026-11-09..15 and 2026-11-16..22: completed trips,
--                assignments, events, audit, draft / issued / void /
--                void+deleted(0 lines) invoices, overridden lines,
--                workshop bills (one final, one draft)
--     Gate F     week 2026-11-23..29: 7 unbilled staff trips + 2 unbilled
--                Demo Mountain Co route trips, NO invoices / lines.
--                Expected Monday run (inside Jacobs Org):
--                  Yaseen Demo 1230.00 = 300 + 410 (route price) + 520 (manual)
--                  Shaheed Demo 1380.00 = 300 + 640 (Executive transfer) + 440
--                  Freddy Demo 300.00
--                  Demo Mountain Co 900.00 = 2 x 450
--                  Combined 3810.00
-- =============================================================================

do $seed$
declare
  -- users
  u_yaseen  constant uuid := '5eed0000-0000-4000-8000-000000000101';
  u_faadiah constant uuid := '5eed0000-0000-4000-8000-000000000102';
  u_clerk   constant uuid := '5eed0000-0000-4000-8000-000000000103';
  u_dy      constant uuid := '5eed0000-0000-4000-8000-000000000104';
  u_dz      constant uuid := '5eed0000-0000-4000-8000-000000000105';
  -- orgs
  o_y constant uuid := '5eed0000-0000-4000-8000-000000000001';
  o_f constant uuid := '5eed0000-0000-4000-8000-000000000002';
  -- companies (Yaseen org 1xxx, Fadia org 2xxx)
  c_y_wcl   constant uuid := '5eed0000-0000-4000-8000-000000001001';
  c_y_acme  constant uuid := '5eed0000-0000-4000-8000-000000001002';
  c_y_bay   constant uuid := '5eed0000-0000-4000-8000-000000001003';
  c_y_metro constant uuid := '5eed0000-0000-4000-8000-000000001004';
  c_y_mount constant uuid := '5eed0000-0000-4000-8000-000000001005';
  c_f_wcl   constant uuid := '5eed0000-0000-4000-8000-000000002001';
  c_f_acme  constant uuid := '5eed0000-0000-4000-8000-000000002002';
  c_f_bay   constant uuid := '5eed0000-0000-4000-8000-000000002003';
  c_f_metro constant uuid := '5eed0000-0000-4000-8000-000000002004';
  c_f_coast constant uuid := '5eed0000-0000-4000-8000-000000002006';
  -- drivers
  d_yaseen  constant uuid := '5eed0000-0000-4000-8000-000000001101';
  d_paulin  constant uuid := '5eed0000-0000-4000-8000-000000001102';
  d_shaheed constant uuid := '5eed0000-0000-4000-8000-000000002101';
  d_freddy  constant uuid := '5eed0000-0000-4000-8000-000000002102';
  d_zain    constant uuid := '5eed0000-0000-4000-8000-000000002103';
  -- vehicles
  v_y1 constant uuid := '5eed0000-0000-4000-8000-000000001201';
  v_y2 constant uuid := '5eed0000-0000-4000-8000-000000001202';
  v_f1 constant uuid := '5eed0000-0000-4000-8000-000000002201';
  v_f2 constant uuid := '5eed0000-0000-4000-8000-000000002202';
  -- rate cards / route prices / routes
  rc_y_acme  constant uuid := '5eed0000-0000-4000-8000-000000001301';
  rc_y_bay   constant uuid := '5eed0000-0000-4000-8000-000000001302';
  rc_y_metro constant uuid := '5eed0000-0000-4000-8000-000000001303';
  rc_y_mount constant uuid := '5eed0000-0000-4000-8000-000000001304';
  rc_f_acme  constant uuid := '5eed0000-0000-4000-8000-000000002301';
  rc_f_bay   constant uuid := '5eed0000-0000-4000-8000-000000002302';
  rc_f_metro constant uuid := '5eed0000-0000-4000-8000-000000002303';
  rc_f_coast constant uuid := '5eed0000-0000-4000-8000-000000002304';
  rp_y_bay   constant uuid := '5eed0000-0000-4000-8000-000000001401';
  rp_f_bay   constant uuid := '5eed0000-0000-4000-8000-000000002401';
  r_y_mount  constant uuid := '5eed0000-0000-4000-8000-000000001501';
  -- invoices
  i_y1  constant uuid := '5eed0000-0000-4000-8000-000000001701';
  i_m1  constant uuid := '5eed0000-0000-4000-8000-000000001702';
  i_y2  constant uuid := '5eed0000-0000-4000-8000-000000001703';
  i_s1  constant uuid := '5eed0000-0000-4000-8000-000000002701';
  i_fr1 constant uuid := '5eed0000-0000-4000-8000-000000002702';
  i_z2  constant uuid := '5eed0000-0000-4000-8000-000000002703';
  i_fr2v constant uuid := '5eed0000-0000-4000-8000-000000002704';
  i_fr2 constant uuid := '5eed0000-0000-4000-8000-000000002705';
  i_s2  constant uuid := '5eed0000-0000-4000-8000-000000002706';
  -- maintenance
  sup_y constant uuid := '5eed0000-0000-4000-8000-000000001801';
  cat_y constant uuid := '5eed0000-0000-4000-8000-000000001802';
  wb_final constant uuid := '5eed0000-0000-4000-8000-000000001803';
  wb_draft constant uuid := '5eed0000-0000-4000-8000-000000001804';
  v_starter uuid;
  v_has_col boolean;
begin
  if not (
    exists (select 1 from public.organisations where id = 'a1000000-0000-4000-8000-000000000001')
    or current_database() = 'workops_audit'
  ) then
    raise notice '00090: not the goops-demo / local test database; demo seed skipped';
    return;
  end if;

  if exists (select 1 from public.organisations where id in (o_y, o_f) or slug in ('demo-yaseen-org', 'demo-fadia-org')) then
    raise notice '00090: Demo Yaseen / Fadia orgs already present; seed skipped';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Auth users (fake, no password) + profiles
  -- -------------------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', u_yaseen,  'authenticated', 'authenticated', 'demo-jacobs-yaseen@example.com',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Yaseen Jacobs"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_faadiah, 'authenticated', 'authenticated', 'demo-jacobs-faadiah@example.com',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Faadiah Jacobs"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_clerk,   'authenticated', 'authenticated', 'demo-jacobs-clerk@example.com',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Ops Clerk"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_dy,      'authenticated', 'authenticated', 'demo-jacobs-driver-yaseen@example.com',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Yaseen Demo"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', u_dz,      'authenticated', 'authenticated', 'demo-jacobs-driver-zain@example.com',
      '{"provider":"email","providers":["email"]}', '{"full_name":"Zain Demo"}', now(), now())
  on conflict (id) do nothing;

  -- Hosted GoTrue expects confirmed email + empty-string token columns.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at'
  ) into v_has_col;
  if v_has_col then
    execute $q$
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmation_token = coalesce(confirmation_token, ''),
          recovery_token = coalesce(recovery_token, ''),
          email_change_token_new = coalesce(email_change_token_new, ''),
          email_change = coalesce(email_change, '')
      where id = any ($1)
    $q$ using array[u_yaseen, u_faadiah, u_clerk, u_dy, u_dz];
  end if;
  if to_regclass('auth.identities') is not null then
    execute $q$
      insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
      select u.id::text, u.id,
             jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
             'email', now(), now()
      from auth.users u
      where u.id = any ($1)
      on conflict do nothing
    $q$ using array[u_yaseen, u_faadiah, u_clerk, u_dy, u_dz];
  end if;

  insert into public.profiles (id, email, full_name) values
    (u_yaseen,  'demo-jacobs-yaseen@example.com',        'Demo Yaseen Jacobs'),
    (u_faadiah, 'demo-jacobs-faadiah@example.com',       'Demo Faadiah Jacobs'),
    (u_clerk,   'demo-jacobs-clerk@example.com',         'Demo Ops Clerk'),
    (u_dy,      'demo-jacobs-driver-yaseen@example.com', 'Yaseen Demo'),
    (u_dz,      'demo-jacobs-driver-zain@example.com',   'Zain Demo')
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;

  -- -------------------------------------------------------------------------
  -- Orgs, subscription (Yaseen only), memberships
  -- -------------------------------------------------------------------------
  insert into public.organisations (id, name, slug, status, created_by, settings) values
    (o_y, 'Demo Yaseen Org', 'demo-yaseen-org', 'active', u_yaseen, '{}'::jsonb),
    (o_f, 'Demo Fadia Org',  'demo-fadia-org',  'active', u_faadiah, '{}'::jsonb);

  select id into v_starter from public.plans where code = 'starter';
  if v_starter is null then
    raise exception '00090: starter plan missing';
  end if;
  insert into public.subscriptions (organisation_id, plan_id, status, current_period_start)
  values (o_y, v_starter, 'active', timestamptz '2026-11-01 00:00+00');
  -- Demo Fadia Org intentionally has NO subscription row.

  insert into public.organisation_members (organisation_id, user_id, role, status, created_by) values
    (o_y, u_yaseen,  'organisation_admin', 'active', u_yaseen),
    (o_f, u_yaseen,  'organisation_admin', 'active', u_faadiah),
    (o_f, u_faadiah, 'organisation_admin', 'active', u_faadiah),
    (o_y, u_clerk,   'manager',            'active', u_yaseen),
    (o_f, u_clerk,   'manager',            'active', u_faadiah),
    (o_y, u_dy,      'driver',             'active', u_yaseen),
    (o_f, u_dz,      'driver',             'active', u_faadiah);

  -- -------------------------------------------------------------------------
  -- Companies
  -- -------------------------------------------------------------------------
  insert into public.companies (id, organisation_id, name, code, contact_email, status, created_by) values
    (c_y_wcl,   o_y, 'Demo WCL Trading CC', 'DEMO-WCL',   'accounts@wcl.example.com',     'active', u_yaseen),
    (c_y_acme,  o_y, 'Demo Acme Logistics', 'DEMO-ACME',  'ops@acme.example.com',         'active', u_yaseen),
    (c_y_bay,   o_y, 'Demo Bay Hotel',      'DEMO-BAY',   'frontdesk@bayhotel.example.com','active', u_yaseen),
    (c_y_metro, o_y, 'Demo Metro Tech',     'DEMO-METRO', 'travel@metro.example.com',     'active', u_clerk),
    (c_y_mount, o_y, 'Demo Mountain Co',    'DEMO-MTN',   'admin@mountain.example.com',   'active', u_clerk),
    (c_f_wcl,   o_f, 'Demo WCL Trading CC', 'DEMO-WCL',   'accounts@wcl.example.com',     'active', u_faadiah),
    (c_f_acme,  o_f, 'Demo Acme Logistics', 'DEMO-ACME',  'ops@acme.example.com',         'active', u_faadiah),
    (c_f_bay,   o_f, ' demo bay hotel ',    'DEMO-BAY',   'frontdesk@bayhotel.example.com','active', u_faadiah),
    (c_f_metro, o_f, 'Demo Metro Tech',     'DEMO-METRO', 'travel@metro.example.com',     'active', u_clerk),
    (c_f_coast, o_f, 'Demo Coastline',      'DEMO-COAST', 'bookings@coastline.example.com','active', u_clerk);

  update public.organisations set settings = jsonb_build_object(
    'invoice_bill_to_company_id', c_y_wcl::text,
    'invoice_print', jsonb_build_object(
      'contact', jsonb_build_object('name', 'Demo Yaseen Org Accounts', 'phone', '+27 00 000 0101', 'email', 'accounts@demo-yaseen.example.com'),
      'banking', jsonb_build_object('bank', 'DEMO-BANK', 'account_name', 'Demo Yaseen Org', 'account_number', 'DEMO-ACC-0001', 'branch_code', 'DEMO-BR-0', 'account_type', 'Current')
    )
  ) where id = o_y;
  update public.organisations set settings = jsonb_build_object(
    'invoice_bill_to_company_id', c_f_wcl::text,
    'invoice_print', jsonb_build_object(
      'contact', jsonb_build_object('name', 'Demo Fadia Org Accounts', 'phone', '+27 00 000 0202', 'email', 'accounts@demo-fadia.example.com'),
      'banking', jsonb_build_object('bank', 'DEMO-BANK', 'account_name', 'Demo Fadia Org', 'account_number', 'DEMO-ACC-0002', 'branch_code', 'DEMO-BR-0', 'account_type', 'Current')
    )
  ) where id = o_f;

  -- -------------------------------------------------------------------------
  -- Drivers, vehicles, standing assignment, issuer overrides
  -- -------------------------------------------------------------------------
  insert into public.drivers (id, organisation_id, full_name, email, phone, license_number, profile_id, owner_tag, status, created_by) values
    (d_yaseen,  o_y, 'Yaseen Demo',  'demo-jacobs-driver-yaseen@example.com', '+27 00 000 1101', 'DEMO-LIC-1101', u_dy, 'yaseen', 'active', u_yaseen),
    (d_paulin,  o_y, 'Paulin Demo',  null, '+27 00 000 1102', 'DEMO-LIC-1102', null, 'yaseen', 'active', u_clerk),
    (d_shaheed, o_f, 'Shaheed Demo', null, '+27 00 000 2101', 'DEMO-LIC-2101', null, 'fadia',  'active', u_faadiah),
    (d_freddy,  o_f, 'Freddy Demo',  null, '+27 00 000 2102', 'DEMO-LIC-2102', null, 'fadia',  'active', u_faadiah),
    (d_zain,    o_f, 'Zain Demo',    'demo-jacobs-driver-zain@example.com', '+27 00 000 2103', 'DEMO-LIC-2103', u_dz, 'fadia', 'active', u_clerk);

  insert into public.vehicles (id, organisation_id, name, registration_number, vehicle_type, capacity, company_id, owner_tag, status, created_by) values
    (v_y1, o_y, 'Demo Quantum Y1', 'CA-DEMO-Y1', 'minibus', 14, null,      'yaseen', 'active', u_yaseen),
    (v_y2, o_y, 'Demo Quantum Y2', 'CA-DEMO-Y2', 'minibus', 14, c_y_mount, 'yaseen', 'active', u_clerk),
    (v_f1, o_f, 'Demo Hiace F1',   'CA-DEMO-F1', 'van',     10, null,      'fadia',  'active', u_faadiah),
    (v_f2, o_f, 'Demo Hiace F2',   'CA-DEMO-F2', 'van',     10, null,      'fadia',  'active', u_clerk);

  insert into public.driver_vehicle_assignments (organisation_id, driver_id, vehicle_id, starts_on, created_by)
  values (o_y, d_yaseen, v_y1, date '2026-11-01', u_yaseen);

  if to_regclass('public.driver_invoice_print_overrides') is not null then
    insert into public.driver_invoice_print_overrides (driver_id, organisation_id, settings, updated_by) values
      (d_yaseen, o_y, jsonb_build_object(
        'supplier', jsonb_build_object('name', 'Demo Yaseen Transport', 'address_lines', jsonb_build_array('1 Demo Street', 'Demo City'), 'email', 'billing@yaseen-transport.example.com'),
        'banking', jsonb_build_object('bank', 'DEMO-FNB', 'account_name', 'Demo Yaseen Transport', 'account_number', 'DEMO-ACC-1001', 'branch_code', 'DEMO-BR-1', 'account_type', 'Current')
      ), u_yaseen),
      (d_shaheed, o_f, jsonb_build_object(
        'supplier', jsonb_build_object('name', 'Demo Shaheed Transport', 'address_lines', jsonb_build_array('2 Demo Avenue', 'Demo Town'), 'email', 'billing@shaheed-transport.example.com'),
        'banking', jsonb_build_object('bank', 'DEMO-ABSA', 'account_name', 'Demo Shaheed Transport', 'account_number', 'DEMO-ACC-2002', 'branch_code', 'DEMO-BR-2', 'account_type', 'Current')
      ), u_faadiah),
      (d_freddy, o_f, jsonb_build_object(
        'contact', jsonb_build_object('name', 'Demo Mansur Logistics', 'phone', '+27 00 000 3003', 'email', 'billing@mansur-logistics.example.com'),
        'banking', jsonb_build_object('bank', 'DEMO-NEDBANK', 'account_name', 'Demo Mansur Logistics', 'account_number', 'DEMO-ACC-3003', 'branch_code', 'DEMO-BR-3', 'account_type', 'Current')
      ), u_faadiah);
  end if;

  -- -------------------------------------------------------------------------
  -- Rates, route price templates, pay rate, route
  -- -------------------------------------------------------------------------
  insert into public.rate_cards (id, organisation_id, company_id, name, line_type, unit, unit_amount, effective_from, created_by) values
    (rc_y_acme,  o_y, c_y_acme,  'Demo Acme trip',      'trip', 'trip', 300, date '2026-01-01', u_yaseen),
    (rc_y_bay,   o_y, c_y_bay,   'Demo Bay Hotel trip', 'trip', 'trip', 450, date '2026-01-01', u_yaseen),
    (rc_y_metro, o_y, c_y_metro, 'Demo Metro trip',     'trip', 'trip', 440, date '2026-01-01', u_clerk),
    (rc_y_mount, o_y, c_y_mount, 'Demo Mountain trip',  'trip', 'trip', 450, date '2026-01-01', u_clerk),
    (rc_f_acme,  o_f, c_f_acme,  'Demo Acme trip',      'trip', 'trip', 300, date '2026-01-01', u_faadiah),
    (rc_f_bay,   o_f, c_f_bay,   'Demo Bay Hotel trip', 'trip', 'trip', 450, date '2026-01-01', u_faadiah),
    (rc_f_metro, o_f, c_f_metro, 'Demo Metro trip',     'trip', 'trip', 450, date '2026-01-01', u_clerk),
    (rc_f_coast, o_f, c_f_coast, 'Demo Coastline trip', 'trip', 'trip', 440, date '2026-01-01', u_clerk);

  insert into public.route_prices (id, organisation_id, company_id, label, match_kind, stops, bidirectional, unit_amount, created_by) values
    (rp_y_bay, o_y, c_y_bay, 'Airport -> Demo Bay Hotel', 'exact', array['Airport', 'Demo Bay Hotel'], true, 410.00, u_yaseen),
    (rp_f_bay, o_f, c_f_bay, 'Airport -> Demo Bay Hotel', 'exact', array['Airport', 'Demo Bay Hotel'], true, 410.00, u_faadiah);

  insert into public.pay_rates (organisation_id, company_id, name, subject_role, unit, unit_amount, effective_from, created_by)
  values (o_y, null, 'Demo driver per trip', 'driver', 'trip', 150, date '2026-01-01', u_yaseen);

  insert into public.routes (id, organisation_id, company_id, name, code, status, created_by)
  values (r_y_mount, o_y, c_y_mount, 'Demo Mountain Shuttle', 'DEMO-MTN-1', 'active', u_clerk);

  -- -------------------------------------------------------------------------
  -- Trips (all completed). t01..t11 history, t21..t29 Gate F week (unbilled)
  -- -------------------------------------------------------------------------
  create temp table _seed_trips (
    n int primary key,
    org uuid, driver uuid, vehicle uuid, company uuid, route uuid,
    area text, starts timestamptz, actor uuid, manual numeric
  ) on commit drop;

  insert into _seed_trips values
    ( 1, o_y, d_yaseen,  v_y1, c_y_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-10 07:00+02', u_yaseen,  null),
    ( 2, o_y, d_yaseen,  v_y1, c_y_bay,   null,      'Airport -> Demo Bay Hotel',                    '2026-11-11 09:00+02', u_clerk,   null),
    ( 3, o_y, d_paulin,  v_y2, c_y_mount, r_y_mount, null,                                           '2026-11-12 08:00+02', u_clerk,   null),
    ( 4, o_f, d_shaheed, v_f1, c_f_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-10 07:30+02', u_faadiah, null),
    ( 5, o_f, d_shaheed, v_f1, c_f_coast, null,      'Demo Coastline Office -> Demo Beach Road',     '2026-11-12 17:00+02', u_clerk,   null),
    ( 6, o_f, d_freddy,  v_f2, c_f_metro, null,      'Demo Metro Office -> Demo Night Shift',        '2026-11-13 22:00+02', u_faadiah, null),
    ( 7, o_y, d_yaseen,  v_y1, c_y_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-17 07:00+02', u_clerk,   null),
    ( 8, o_y, d_yaseen,  v_y1, c_y_metro, null,      'Demo Metro Office -> Demo Conference Centre',  '2026-11-18 08:00+02', u_yaseen,  null),
    ( 9, o_f, d_zain,    v_f1, c_f_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-17 07:00+02', u_faadiah, null),
    (10, o_f, d_freddy,  v_f2, c_f_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-18 07:00+02', u_clerk,   null),
    (11, o_f, d_shaheed, v_f1, c_f_coast, null,      'Demo Coastline Office -> Demo Beach Road',     '2026-11-19 17:00+02', u_faadiah, null),
    -- Gate F: Monday run week 2026-11-23 .. 2026-11-29
    (21, o_y, d_yaseen,  v_y1, c_y_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-23 07:00+02', u_yaseen,  null),
    (22, o_y, d_yaseen,  v_y1, c_y_bay,   null,      'Airport -> Demo Bay Hotel',                    '2026-11-24 09:00+02', u_clerk,   null),
    (23, o_y, d_yaseen,  v_y1, c_y_metro, null,      'Demo Metro Office -> Demo Conference Centre',  '2026-11-25 08:00+02', u_yaseen,  520.00),
    (24, o_f, d_shaheed, v_f1, c_f_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-23 07:30+02', u_faadiah, null),
    (25, o_f, d_shaheed, v_f1, c_f_metro, null,      'Demo Metro Office -> Airport',                 '2026-11-26 06:00+02', u_faadiah, null),
    (26, o_f, d_shaheed, v_f1, c_f_coast, null,      'Demo Coastline Office -> Demo Beach Road',     '2026-11-27 17:00+02', u_clerk,   null),
    (27, o_f, d_freddy,  v_f2, c_f_acme,  null,      'Demo Acme Depot -> Demo Acme Office',          '2026-11-24 07:00+02', u_clerk,   null),
    (28, o_y, d_paulin,  v_y2, c_y_mount, r_y_mount, null,                                           '2026-11-25 08:00+02', u_yaseen,  null),
    (29, o_y, d_paulin,  v_y2, c_y_mount, r_y_mount, null,                                           '2026-11-26 08:00+02', u_clerk,   null);

  insert into public.trips (
    id, organisation_id, route_id, company_id, planned_start, planned_end, status,
    is_staff_transport, area_text, pax_count, staff_started_at, staff_completed_at,
    waybill_confirmed_at, manual_unit_price, manual_price_area_key, created_by, updated_by,
    created_at, updated_at
  )
  select
    ('5eed0000-0000-4000-8000-00000000' || lpad((3000 + s.n)::text, 4, '0'))::uuid,
    s.org, s.route, s.company, s.starts, s.starts + interval '1 hour', 'completed',
    s.route is null, s.area, 4,
    case when s.route is null then s.starts end,
    case when s.route is null then s.starts + interval '1 hour' end,
    case when s.route is null then s.starts + interval '1 hour' end,
    s.manual,
    case when s.manual is not null then public.route_area_key(s.area) end,
    s.actor, s.actor, s.starts - interval '1 day', s.starts + interval '2 hours'
  from _seed_trips s;

  insert into public.trip_assignments (organisation_id, trip_id, driver_id, vehicle_id, assigned_by, assigned_at)
  select s.org, ('5eed0000-0000-4000-8000-00000000' || lpad((3000 + s.n)::text, 4, '0'))::uuid,
         s.driver, s.vehicle, s.actor, s.starts - interval '1 day'
  from _seed_trips s;

  insert into public.trip_events (organisation_id, trip_id, event_type, actor_id, notes, created_at)
  select s.org, ('5eed0000-0000-4000-8000-00000000' || lpad((3000 + s.n)::text, 4, '0'))::uuid,
         'completed', s.actor, 'Demo seed', s.starts + interval '1 hour'
  from _seed_trips s;

  insert into public.trip_audit (organisation_id, trip_id, field_name, old_value, new_value, actor_id, reason, created_at) values
    (o_y, '5eed0000-0000-4000-8000-000000003008', 'area_text', 'Demo Metro Office', 'Demo Metro Office -> Demo Conference Centre', u_clerk, 'Demo: route corrected', '2026-11-18 12:00+02'),
    (o_f, '5eed0000-0000-4000-8000-000000003006', 'pax_count', '3', '4', u_faadiah, 'Demo: extra passenger', '2026-11-14 08:00+02');

  insert into public.trip_billing_overrides (trip_id, organisation_id, override_unit_price, reason, created_by, updated_by) values
    ('5eed0000-0000-4000-8000-000000003006', o_f, 480.00, 'Late night surcharge', u_faadiah, u_faadiah),
    ('5eed0000-0000-4000-8000-000000003025', o_f, 640.00, 'Executive transfer',   u_faadiah, u_faadiah);

  drop table _seed_trips;

  -- -------------------------------------------------------------------------
  -- Historical invoices + lines (Gate F week has none)
  -- -------------------------------------------------------------------------
  insert into public.invoices (
    id, organisation_id, company_id, driver_id, period_start, period_end, status,
    subtotal, total, notes, generated_by, updated_by, issued_at, deleted_at, owner_tag, created_at
  ) values
    (i_y1,   o_y, c_y_wcl,   d_yaseen,  '2026-11-09', '2026-11-15', 'draft',  710, 710, 'Demo week 1', u_yaseen,  u_yaseen,  '2026-11-16 08:00+02', null, null, '2026-11-16 07:00+02'),
    (i_m1,   o_y, c_y_mount, null,      '2026-11-09', '2026-11-15', 'issued', 450, 450, 'Demo Mountain week 1', u_clerk, u_clerk, '2026-11-16 09:00+02', null, 'yaseen', '2026-11-16 07:30+02'),
    (i_y2,   o_y, c_y_wcl,   d_yaseen,  '2026-11-16', '2026-11-22', 'draft',  740, 740, 'Demo week 2', u_clerk,   u_clerk,   null, null, null, '2026-11-23 07:00+02'),
    (i_s1,   o_f, c_f_wcl,   d_shaheed, '2026-11-09', '2026-11-15', 'draft',  740, 740, 'Demo week 1', u_faadiah, u_faadiah, null, null, null, '2026-11-16 07:00+02'),
    (i_fr1,  o_f, c_f_wcl,   d_freddy,  '2026-11-09', '2026-11-15', 'draft',  480, 480, 'Demo week 1', u_faadiah, u_faadiah, '2026-11-16 08:30+02', null, null, '2026-11-16 07:10+02'),
    (i_z2,   o_f, c_f_wcl,   d_zain,    '2026-11-16', '2026-11-22', 'void',   300, 300, 'Demo week 2 (voided)', u_faadiah, u_faadiah, '2026-11-23 08:00+02', null, null, '2026-11-23 07:00+02'),
    (i_fr2v, o_f, c_f_wcl,   d_freddy,  '2026-11-16', '2026-11-22', 'void',   300, 300, 'Demo week 2 (voided + deleted, no lines)', u_clerk, u_clerk, null, '2026-11-23 09:00+02', null, '2026-11-23 07:05+02'),
    (i_fr2,  o_f, c_f_wcl,   d_freddy,  '2026-11-16', '2026-11-22', 'draft',  300, 300, 'Demo week 2', u_clerk,   u_clerk,   null, null, null, '2026-11-23 09:10+02'),
    (i_s2,   o_f, c_f_wcl,   d_shaheed, '2026-11-16', '2026-11-22', 'draft',  440, 440, 'Demo week 2', u_faadiah, u_faadiah, '2026-11-23 10:00+02', null, null, '2026-11-23 07:20+02');

  insert into public.invoice_lines (
    organisation_id, invoice_id, line_type, rate_card_id, route_price_id, trip_id, trip_company_id,
    rate_effective_on, description, quantity, unit_price, amount, price_overridden, override_reason, priced_area_key
  ) values
    (o_y, i_y1,  'trip', rc_y_acme,  null,     '5eed0000-0000-4000-8000-000000003001', c_y_acme,  '2026-01-01', '10/11/2026 07:00 | Demo Acme Logistics | 4 pax', 1, 300, 300, false, null, public.route_area_key('Demo Acme Depot -> Demo Acme Office')),
    (o_y, i_y1,  'trip', rc_y_bay,   rp_y_bay, '5eed0000-0000-4000-8000-000000003002', c_y_bay,   '2026-01-01', '11/11/2026 09:00 | Demo Bay Hotel | 4 pax',      1, 410, 410, true,  null, public.route_area_key('Airport -> Demo Bay Hotel')),
    (o_y, i_m1,  'trip', rc_y_mount, null,     '5eed0000-0000-4000-8000-000000003003', null,      null,         'Completed trip 2026-11-12 06:00',                1, 450, 450, false, null, null),
    (o_y, i_y2,  'trip', rc_y_acme,  null,     '5eed0000-0000-4000-8000-000000003007', c_y_acme,  '2026-01-01', '17/11/2026 07:00 | Demo Acme Logistics | 4 pax', 1, 300, 300, false, null, public.route_area_key('Demo Acme Depot -> Demo Acme Office')),
    (o_y, i_y2,  'trip', rc_y_metro, null,     '5eed0000-0000-4000-8000-000000003008', c_y_metro, '2026-01-01', '18/11/2026 08:00 | Demo Metro Tech | 4 pax',     1, 440, 440, false, null, public.route_area_key('Demo Metro Office -> Demo Conference Centre')),
    (o_f, i_s1,  'trip', rc_f_acme,  null,     '5eed0000-0000-4000-8000-000000003004', c_f_acme,  '2026-01-01', '10/11/2026 07:30 | Demo Acme Logistics | 4 pax', 1, 300, 300, false, null, public.route_area_key('Demo Acme Depot -> Demo Acme Office')),
    (o_f, i_s1,  'trip', rc_f_coast, null,     '5eed0000-0000-4000-8000-000000003005', c_f_coast, '2026-01-01', '12/11/2026 17:00 | Demo Coastline | 4 pax',      1, 440, 440, false, null, public.route_area_key('Demo Coastline Office -> Demo Beach Road')),
    (o_f, i_fr1, 'trip', null,       null,     '5eed0000-0000-4000-8000-000000003006', c_f_metro, '2026-11-13', '13/11/2026 22:00 | Demo Metro Tech | 4 pax',     1, 480, 480, true,  'Late night surcharge', public.route_area_key('Demo Metro Office -> Demo Night Shift')),
    (o_f, i_z2,  'trip', rc_f_acme,  null,     '5eed0000-0000-4000-8000-000000003009', c_f_acme,  '2026-01-01', '17/11/2026 07:00 | Demo Acme Logistics | 4 pax', 1, 300, 300, false, null, public.route_area_key('Demo Acme Depot -> Demo Acme Office')),
    (o_f, i_fr2, 'trip', rc_f_acme,  null,     '5eed0000-0000-4000-8000-000000003010', c_f_acme,  '2026-01-01', '18/11/2026 07:00 | Demo Acme Logistics | 4 pax', 1, 300, 300, false, null, public.route_area_key('Demo Acme Depot -> Demo Acme Office')),
    (o_f, i_s2,  'trip', rc_f_coast, null,     '5eed0000-0000-4000-8000-000000003011', c_f_coast, '2026-01-01', '19/11/2026 17:00 | Demo Coastline | 4 pax',      1, 440, 440, false, null, public.route_area_key('Demo Coastline Office -> Demo Beach Road'));

  insert into public.audit_logs (organisation_id, actor_id, action, entity_type, entity_id, metadata, created_at) values
    (o_y, u_yaseen,  'invoice.generated', 'invoice', i_y1,  '{"source":"demo-seed"}', '2026-11-16 07:00+02'),
    (o_y, u_clerk,   'invoice.issued',    'invoice', i_m1,  '{"source":"demo-seed"}', '2026-11-16 09:00+02'),
    (o_f, u_faadiah, 'invoice.voided',    'invoice', i_z2,  '{"source":"demo-seed"}', '2026-11-23 08:00+02'),
    (o_f, u_faadiah, 'driver.created',    'driver',  d_shaheed, '{"full_name":"Shaheed Demo"}', '2026-11-01 08:00+02'),
    (o_y, u_clerk,   'trip.updated',      'trip',    '5eed0000-0000-4000-8000-000000003008', '{"field":"area_text"}', '2026-11-18 12:00+02');

  -- -------------------------------------------------------------------------
  -- Maintenance (only if Drop 1 schema exists): 1 supplier, 1 category,
  -- 1 final (status 'approved', locked) bill, 1 draft bill
  -- -------------------------------------------------------------------------
  if to_regclass('public.workshop_bills') is not null then
    insert into public.suppliers (id, organisation_id, name, contact_phone, email, created_by)
    values (sup_y, o_y, 'Demo Workshop Supplies', '+27 00 000 1801', 'workshop@supplies.example.com', u_yaseen);
    insert into public.maintenance_categories (id, organisation_id, name, created_by)
    values (cat_y, o_y, 'Demo Brakes', u_yaseen);
    insert into public.workshop_bills (
      id, organisation_id, supplier_id, vehicle_id, bill_date, invoice_ref, vat_mode, vat_rate,
      subtotal_excl, vat_amount, total_incl, status, approved_by, approved_at, notes, created_by, updated_by
    ) values
      (wb_final, o_y, sup_y, v_y1, '2026-11-12', 'DEMO-WS-001', 'exclusive', 15, 1000.00, 150.00, 1150.00, 'approved', u_yaseen, '2026-11-13 10:00+02', 'Demo final bill', u_clerk, u_yaseen),
      (wb_draft, o_y, sup_y, v_y2, '2026-11-19', 'DEMO-WS-002', 'exclusive', 15,  500.00,  75.00,  575.00, 'draft',    null,     null,                  'Demo draft bill', u_clerk, u_clerk);
    insert into public.workshop_bill_lines (bill_id, organisation_id, category_id, description, quantity, unit_amount, vat_applicable, line_excl, line_vat, line_incl, sort_order) values
      (wb_final, o_y, cat_y, 'Demo brake pads', 1, 1000.00, true, 1000.00, 150.00, 1150.00, 0),
      (wb_draft, o_y, cat_y, 'Demo brake check', 1, 500.00, true, 500.00, 75.00, 575.00, 0);
  end if;
end;
$seed$;
