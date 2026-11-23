#!/usr/bin/env node
/**
 * LOCAL ONLY — fixture for e2e/goops-entitlements.spec.ts (GoOps refocus step 7).
 *
 * Applies seed-e2e-goops-entitlements.sql (org "GoOps E2E Lite" on a core+gps
 * plan: no billing, portal or passengers), signs up four users through the
 * local GoTrue and links their memberships:
 *
 *   e2e.lite.admin@audit.test     organisation_admin
 *   e2e.lite.company@audit.test   company_manager
 *   e2e.lite.employee@audit.test  employee
 *   e2e.lite.driver@audit.test    driver (linked to the seeded drivers row)
 *
 * Refuses to run unless AUTH_URL and the Postgres host are 127.0.0.1 /
 * localhost. There is no override: this must never touch a hosted database.
 *
 * Prereqs (see scripts/local-db): bootstrap.sh, start-minimal-api.sh,
 * supabase-proxy.mjs.
 * Run: node scripts/local-db/provision-e2e-goops-entitlements.mjs
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const AUTH_URL = process.env.AUTH_URL ?? "http://127.0.0.1:54321/auth/v1";
const PG_HOST = process.env.WORKOPS_AUDIT_PG_HOST ?? "127.0.0.1";
const PG_PORT = process.env.WORKOPS_AUDIT_PG_PORT ?? "54322";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const PASS = "TestPassword123!";
const ORG_ID = "c0000000-0000-4000-8000-000000000001";
const DRIVER_ID = "c0000000-0000-4000-8000-000000000201";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
function assertLocal(label, host) {
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`Refusing to run: ${label} host "${host}" is not local.`);
    process.exit(1);
  }
}
assertLocal("AUTH_URL", new URL(AUTH_URL).hostname);
assertLocal("Postgres", PG_HOST);

const USERS = [
  { key: "ADMIN", email: "e2e.lite.admin@audit.test", role: "organisation_admin" },
  { key: "COMPANY", email: "e2e.lite.company@audit.test", role: "company_manager" },
  { key: "EMPLOYEE", email: "e2e.lite.employee@audit.test", role: "employee" },
  { key: "DRIVER", email: "e2e.lite.driver@audit.test", role: "driver", linkDriver: true },
];

function psql(args) {
  execFileSync(
    "psql",
    ["-h", PG_HOST, "-p", PG_PORT, "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...args],
    { stdio: "pipe", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" } }
  );
}

async function signup(email) {
  const res = await fetch(`${AUTH_URL}/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASS }),
  });
  const body = await res.text();
  if (res.ok || body.includes("already registered") || res.status === 422) return;
  throw new Error(`signup ${email}: ${res.status} ${body}`);
}

psql(["-f", join(here, "seed-e2e-goops-entitlements.sql")]);

for (const u of USERS) await signup(u.email);

psql(["-c", "update auth.users set role = 'authenticated' where email like 'e2e.lite.%@audit.test';"]);

for (const u of USERS) {
  psql([
    "-c",
    `insert into public.organisation_members (organisation_id, user_id, role, status)
     select '${ORG_ID}', au.id, '${u.role}', 'active'
     from auth.users au where au.email = '${u.email}'
     on conflict (organisation_id, user_id) do update set role = excluded.role, status = 'active';`,
  ]);
  if (u.linkDriver) {
    psql([
      "-c",
      `update public.drivers d set profile_id = au.id
       from auth.users au
       where au.email = '${u.email}' and d.id = '${DRIVER_ID}';`,
    ]);
  }
}

const supabaseUrl = new URL(AUTH_URL).origin;
console.log("GoOps E2E Lite provisioned. Export these for npm run test:e2e:entitlements:\n");
console.log(`export E2E_SUPABASE_URL=${supabaseUrl}`);
console.log(`export E2E_ENT_ORG_ID=${ORG_ID}`);
console.log(`export E2E_ENT_PASSWORD='${PASS}'`);
for (const u of USERS) console.log(`export E2E_ENT_${u.key}_EMAIL=${u.email}`);
