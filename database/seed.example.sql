-- After creating Auth user in dashboard:
update public.profiles
set is_platform_owner = true
where email = 'you@example.com';

-- Optional: Cape Town staff-transport demo for screenshots
-- 1. Create Auth user admin@cape-shuttle.example (or edit email in the script)
-- 2. Run database/seed.demo.cape-shuttle.sql in the SQL editor
-- See also tests/fixtures/cape-shuttle-ops.ts
