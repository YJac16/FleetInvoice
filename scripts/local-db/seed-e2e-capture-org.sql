-- Local E2E capture: friendly org label (Org A fixture id unchanged).
update public.organisations
set name = 'E2E Test Org'
where id = 'a0000000-0000-4000-8000-000000000001';
