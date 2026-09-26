#!/usr/bin/env node
/**
 * GoTrue signup + SQL membership links for local portal browser audits.
 */
import { execSync } from "node:child_process";

const AUTH_URL = process.env.AUTH_URL ?? "http://127.0.0.1:54321/auth/v1";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const PASS = "TestPassword123!";
const PG_PORT = process.env.WORKOPS_AUDIT_PG_PORT ?? "54322";

const USERS = [
  { email: "playwright.admin@audit.test", role: "organisation_admin", org: "a0000000-0000-4000-8000-000000000001" },
  { email: "playwright.admin.b@audit.test", role: "organisation_admin", org: "b0000000-0000-4000-8000-000000000001" },
  { email: "playwright.driver@audit.test", role: "driver", org: "a0000000-0000-4000-8000-000000000001", linkDriver: true },
  { email: "playwright.employee@audit.test", role: "employee", org: "a0000000-0000-4000-8000-000000000001" },
  { email: "playwright.company@audit.test", role: "company_manager", org: "a0000000-0000-4000-8000-000000000001", scopeCompany: "a0000000-0000-4000-8000-000000000101" },
  { email: "playwright.platform@audit.test", role: null, org: null, platformOwner: true },
];

async function signup(email) {
  const res = await fetch(`${AUTH_URL}/signup`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: PASS }),
  });
  const body = await res.text();
  if (res.ok || body.includes("already registered") || res.status === 422) {
    return;
  }
  throw new Error(`signup ${email}: ${res.status} ${body}`);
}

function psql(sql) {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  execSync(
    `PGPASSWORD=postgres psql -h 127.0.0.1 -p ${PG_PORT} -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c ${JSON.stringify(oneLine)}`,
    { stdio: "pipe" }
  );
}

for (const u of USERS) {
  await signup(u.email);
}

psql(`update auth.users set role = 'authenticated' where email like '%@audit.test';`);

for (const u of USERS) {
  if (u.platformOwner) {
    psql(`
      update public.profiles p
      set is_platform_owner = true,
          full_name = 'Playwright Platform',
          email = '${u.email}'
      from auth.users au
      where au.email = '${u.email}' and p.id = au.id;
    `);
    continue;
  }
  if (!u.org) continue;
  psql(`
    insert into public.organisation_members (organisation_id, user_id, role, status)
    select '${u.org}', au.id, '${u.role}', 'active'
    from auth.users au where au.email = '${u.email}'
    on conflict do nothing;
  `);
  if (u.linkDriver) {
    psql(`
      update public.drivers d
      set profile_id = au.id
      from auth.users au
      where au.email = '${u.email}'
        and d.organisation_id = '${u.org}';
    `);
  }
  if (u.scopeCompany) {
    psql(`
      insert into public.member_scopes (organisation_id, membership_id, company_id)
      select m.organisation_id, m.id, '${u.scopeCompany}'::uuid
      from public.organisation_members m
      join auth.users au on au.id = m.user_id
      where au.email = '${u.email}' and m.organisation_id = '${u.org}'
      on conflict do nothing;
    `);
  }
}

console.log("Portal audit users provisioned.");
