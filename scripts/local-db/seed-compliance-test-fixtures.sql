-- Extra fixtures for PR #36 compliance RLS / alert tests (Org A focus).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000015',
    'authenticated',
    'authenticated',
    'driver.a2@audit.test',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}',
    '{"full_name":"Org A Driver Two"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000016',
    'authenticated',
    'authenticated',
    'manager.a@audit.test',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}',
    '{"full_name":"Org A Manager"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000017',
    'authenticated',
    'authenticated',
    'admin.a2@audit.test',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}',
    '{"full_name":"Org A Admin Two"}'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000018',
    'authenticated',
    'authenticated',
    'supervisor.a@audit.test',
    crypt('TestPassword123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}',
    '{"full_name":"Org A Supervisor"}'
  )
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status)
values
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000015', 'driver', 'active'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000016', 'manager', 'active'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000017', 'organisation_admin', 'active'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000018', 'supervisor', 'active')
on conflict do nothing;

insert into public.drivers (
  id, organisation_id, full_name, email, profile_id, status,
  license_number, license_code, license_expires_on, pdp_number, pdp_expires_on
)
values
  (
    'a0000000-0000-4000-8000-000000000202',
    'a0000000-0000-4000-8000-000000000001',
    'Org A Driver Two',
    'driver.a2@audit.test',
    'a0000000-0000-4000-8000-000000000015',
    'active',
    'LIC-A2-SECRET',
    'B',
    '2030-01-01',
    'PRDP-A2-SECRET',
    '2030-01-01'
  )
on conflict (id) do update set
  license_number = excluded.license_number,
  license_code = excluded.license_code,
  license_expires_on = excluded.license_expires_on,
  pdp_number = excluded.pdp_number,
  pdp_expires_on = excluded.pdp_expires_on;

update public.drivers
set
  license_number = 'LIC-A1-SECRET',
  license_code = 'C1',
  license_expires_on = '2030-06-01',
  pdp_number = 'PRDP-A1-SECRET',
  pdp_expires_on = '2030-06-01'
where id = 'a0000000-0000-4000-8000-000000000201';

insert into public.vehicles (
  id, organisation_id, company_id, name, registration_number, vehicle_type, status,
  operating_permit_expires_on, license_disc_expires_on, model_year, make, model
)
values
  (
    'a0000000-0000-4000-8000-000000000601',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000101',
    'Compliance Van 1',
    'CA CMP-601',
    'van',
    'active',
    '2030-01-01',
    '2030-01-01',
    2020,
    'Toyota',
    'Quantum'
  ),
  (
    'a0000000-0000-4000-8000-000000000602',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000101',
    'Compliance Van 2',
    'CA CMP-602',
    'van',
    'active',
    '2030-01-01',
    '2030-01-01',
    2019,
    'VW',
    'Caddy'
  ),
  (
    'a0000000-0000-4000-8000-000000000603',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000102',
    'Other Co Van',
    'CA CMP-603',
    'van',
    'active',
    '2030-01-01',
    '2030-01-01',
    2018,
    'Ford',
    'Transit'
  )
on conflict (id) do nothing;
