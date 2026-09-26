-- Synthetic Org A / Org B + all roles for local RLS and journey tests.
-- Password for all seeded auth users: TestPassword123!

create extension if not exists pgcrypto;

-- Fixed IDs (deterministic)
-- Orgs
-- Org A: a0000000-0000-4000-8000-000000000001
-- Org B: b0000000-0000-4000-8000-000000000001

do $$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  pwd text := crypt('TestPassword123!', gen_salt('bf'));
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    (inst, 'f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
     'platform.owner@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Platform Owner"}'),
    (inst, 'a0000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
     'admin.a@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org A Admin"}'),
    (inst, 'a0000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
     'driver.a@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org A Driver"}'),
    (inst, 'a0000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated',
     'employee.a@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org A Employee"}'),
    (inst, 'a0000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated',
     'company.a@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org A Company Mgr"}'),
    (inst, 'b0000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
     'admin.b@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org B Admin"}'),
    (inst, 'b0000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
     'driver.b@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org B Driver"}'),
    (inst, 'b0000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated',
     'employee.b@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org B Employee"}'),
    (inst, 'b0000000-0000-4000-8000-000000000014', 'authenticated', 'authenticated',
     'company.b@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Org B Company Mgr"}'),
    (inst, 'c0000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated',
     'signup.a@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Signup User A"}'),
    (inst, 'c0000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated',
     'signup.b@audit.test', pwd, now(), now(), now(), '{}', '{"full_name":"Signup User B"}')
  on conflict (id) do nothing;

  update auth.users set role = 'authenticated' where role is null or role = '';
end $$;

update public.profiles
set is_platform_owner = true,
    full_name = 'Platform Owner',
    email = 'platform.owner@audit.test'
where id = 'f0000000-0000-4000-8000-000000000001';

insert into public.organisations (id, name, slug, status, settings)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'Audit Org A',
    'audit-org-a',
    'active',
    '{"invoice_print":{"banking":{"bank":"Bank A"},"contact":{"name":"Org A Billing","email":"billing-a@audit.test"}}}'::jsonb
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'Audit Org B',
    'audit-org-b',
    'active',
    '{"invoice_print":{"banking":{"bank":"Bank B"},"contact":{"name":"Org B Billing","email":"billing-b@audit.test"}}}'::jsonb
  )
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status)
values
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011', 'organisation_admin', 'active'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012', 'driver', 'active'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000013', 'employee', 'active'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', 'company_manager', 'active'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000011', 'organisation_admin', 'active'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000012', 'driver', 'active'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000013', 'employee', 'active'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000014', 'company_manager', 'active')
on conflict do nothing;

insert into public.companies (id, organisation_id, name, status)
values
  ('a0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001', 'Company A1', 'active'),
  ('a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001', 'Company A2', 'active'),
  ('b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', 'Company B1', 'active')
on conflict (id) do nothing;

insert into public.member_scopes (organisation_id, membership_id, company_id)
select m.organisation_id, m.id, 'a0000000-0000-4000-8000-000000000101'::uuid
from public.organisation_members m
where m.user_id = 'a0000000-0000-4000-8000-000000000014'
  and m.organisation_id = 'a0000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into public.member_scopes (organisation_id, membership_id, company_id)
select m.organisation_id, m.id, 'b0000000-0000-4000-8000-000000000101'::uuid
from public.organisation_members m
where m.user_id = 'b0000000-0000-4000-8000-000000000014'
  and m.organisation_id = 'b0000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into public.drivers (id, organisation_id, full_name, email, profile_id, status)
values
  ('a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000001', 'Org A Driver', 'driver.a@audit.test',
   'a0000000-0000-4000-8000-000000000012', 'active'),
  ('b0000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000001', 'Org B Driver', 'driver.b@audit.test',
   'b0000000-0000-4000-8000-000000000012', 'active')
on conflict (id) do nothing;

insert into public.employees (id, organisation_id, company_id, full_name, email, profile_id, status)
values
  ('a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000101',
   'Org A Employee', 'employee.a@audit.test', 'a0000000-0000-4000-8000-000000000013', 'active'),
  ('b0000000-0000-4000-8000-000000000301', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000101',
   'Org B Employee', 'employee.b@audit.test', 'b0000000-0000-4000-8000-000000000013', 'active')
on conflict (id) do nothing;

insert into public.invoices (
  id, organisation_id, company_id, status, period_start, period_end, subtotal, total, currency, issued_at
)
values
  (
    'a0000000-0000-4000-8000-000000000401',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000101',
    'issued',
    '2026-09-01',
    '2026-09-08',
    1500.00,
    1500.00,
    'ZAR',
    now()
  ),
  (
    'a0000000-0000-4000-8000-000000000402',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000102',
    'issued',
    '2026-09-01',
    '2026-09-08',
    99.00,
    99.00,
    'ZAR',
    now()
  ),
  (
    'b0000000-0000-4000-8000-000000000401',
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000101',
    'issued',
    '2026-09-01',
    '2026-09-08',
    2200.00,
    2200.00,
    'ZAR',
    now()
  )
on conflict (id) do nothing;

insert into public.invoice_lines (
  id, organisation_id, invoice_id, line_type, description, quantity, unit_price, amount
)
values
  (
    'a0000000-0000-4000-8000-000000000501',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000401',
    'trip',
    'Trips week 1',
    1,
    1500.00,
    1500.00
  ),
  (
    'a0000000-0000-4000-8000-000000000502',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000402',
    'trip',
    'Other company',
    1,
    99.00,
    99.00
  ),
  (
    'b0000000-0000-4000-8000-000000000501',
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000401',
    'trip',
    'Trips week 1',
    1,
    2200.00,
    2200.00
  )
on conflict (id) do nothing;
