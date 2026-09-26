-- Link GoTrue signup user to Org A admin for local UI journeys.
-- Email: playwright.admin@audit.test / TestPassword123!

insert into public.organisation_members (organisation_id, user_id, role, status)
select
  'a0000000-0000-4000-8000-000000000001',
  u.id,
  'organisation_admin',
  'active'
from auth.users u
where u.email = 'playwright.admin@audit.test'
on conflict do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status)
select
  'a0000000-0000-4000-8000-000000000001',
  u.id,
  'driver',
  'active'
from auth.users u
where u.email = 'playwright.driver@audit.test'
on conflict do nothing;

update public.drivers d
set profile_id = u.id
from auth.users u
where u.email = 'playwright.driver@audit.test'
  and d.organisation_id = 'a0000000-0000-4000-8000-000000000001';
