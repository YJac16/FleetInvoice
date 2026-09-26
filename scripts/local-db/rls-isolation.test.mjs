#!/usr/bin/env node
/**
 * RLS isolation checks against local audit Postgres (see bootstrap.sh).
 * Run: WORKOPS_AUDIT_PG_PORT=54322 node scripts/local-db/rls-isolation.test.mjs
 */
import { spawnSync } from "node:child_process";

const PORT = process.env.WORKOPS_AUDIT_PG_PORT ?? "54322";
const PG = {
  host: "127.0.0.1",
  port: PORT,
  user: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  password: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
  database: "postgres",
};

function psql(sql, { asRole = "authenticated", userId, commit = false } = {}) {
  const jwt = userId
    ? `SET LOCAL request.jwt.claim.sub = '${userId}';`
    : "";
  const tail = commit ? "COMMIT;" : "ROLLBACK;";
  const body = `
BEGIN;
SET LOCAL ROLE ${asRole};
${jwt}
${sql}
${tail}
`;
  const res = spawnSync(
    "psql",
    [
      "-q",
      "-h",
      PG.host,
      "-p",
      PG.port,
      "-U",
      PG.user,
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-c",
      body,
    ],
    {
      env: { ...process.env, PGPASSWORD: PG.password },
      encoding: "utf8",
    }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  const lines = (res.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function assert(name, condition) {
  if (!condition) {
    console.error("FAIL:", name);
    process.exitCode = 1;
    return false;
  }
  console.log("PASS:", name);
  return true;
}

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const INV_A1 = "a0000000-0000-4000-8000-000000000401";
const INV_A2 = "a0000000-0000-4000-8000-000000000402";
const INV_B1 = "b0000000-0000-4000-8000-000000000401";

const adminA = "a0000000-0000-4000-8000-000000000011";
const adminB = "b0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000012";
const employeeA = "a0000000-0000-4000-8000-000000000013";
const cmA = "a0000000-0000-4000-8000-000000000014";
const CO_A1 = "a0000000-0000-4000-8000-000000000101";
const signupA = "c0000000-0000-4000-8000-000000000011";
const signupB = "c0000000-0000-4000-8000-000000000012";
const platform = "f0000000-0000-4000-8000-000000000001";

try {
  spawnSync(
    "psql",
    [
      "-q",
      "-h",
      PG.host,
      "-p",
      PG.port,
      "-U",
      "supabase_admin",
      "-d",
      PG.database,
      "-tA",
      "-c",
      "select 1;",
    ],
    { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }
  ).status;
} catch {
  console.error(
    `Local Postgres not reachable on ${PG.host}:${PORT}. Run: bash scripts/local-db/bootstrap.sh`
  );
  process.exit(1);
}

// Org A admin sees own invoices only
const aInvoices = psql(
  `select count(*)::text from public.invoices where deleted_at is null;`,
  { userId: adminA }
);
assert(
  "Org A admin sees seeded + audit invoices in org A",
  Number(aInvoices) >= 2
);

const aCross = psql(
  `select count(*)::text from public.invoices where id = '${INV_B1}';`,
  { userId: adminA }
);
assert("Org A admin cannot read Org B invoice by UUID", aCross === "0");

// Org B admin isolation
const bCross = psql(
  `select count(*)::text from public.invoices where id = '${INV_A1}';`,
  { userId: adminB }
);
assert("Org B admin cannot read Org A invoice by UUID", bCross === "0");

// Company manager A scoped to company A1 only
const cmInvoices = psql(
  `select count(*)::text from public.invoices where deleted_at is null;`,
  { userId: cmA }
);
assert(
  "Company manager A sees only scoped company invoices",
  psql(
    `select count(*)::text from public.invoices where company_id <> 'a0000000-0000-4000-8000-000000000101';`,
    { userId: cmA }
  ) === "0" && Number(cmInvoices) >= 1
);

const cmOtherCo = psql(
  `select count(*)::text from public.invoices where id = '${INV_A2}';`,
  { userId: cmA }
);
assert("Company manager A cannot read other company invoice in same org", cmOtherCo === "0");

// Invoice lines follow invoice scope (00029)
const cmLinesOtherCo = psql(
  `select count(*)::text from public.invoice_lines il
   join public.invoices i on i.id = il.invoice_id
   where il.organisation_id = '${ORG_A}' and i.company_id = 'a0000000-0000-4000-8000-000000000102';`,
  { userId: cmA }
);
assert(
  "Company manager A cannot read invoice_lines for unscoped company",
  cmLinesOtherCo === "0"
);

const cmLinesScoped = psql(
  `select count(*)::text from public.invoice_lines il
   join public.invoices i on i.id = il.invoice_id
   where il.organisation_id = '${ORG_A}' and i.company_id = '${CO_A1}';`,
  { userId: cmA }
);
assert(
  "Company manager A sees invoice_lines for scoped company",
  Number(cmLinesScoped) >= 1
);

const cmLineCross = psql(
  `select count(*)::text from public.invoice_lines il join public.invoices i on i.id = il.invoice_id where i.id = '${INV_B1}';`,
  { userId: cmA }
);
assert("Company manager A cannot read Org B invoice_lines", cmLineCross === "0");

// Driver must not read invoices (00030)
const driverInv = psql(
  `select count(*)::text from public.invoices where deleted_at is null;`,
  { userId: driverA }
);
assert("Driver A cannot read invoices", driverInv === "0");

const employeeInv = psql(
  `select count(*)::text from public.invoices where deleted_at is null;`,
  { userId: employeeA }
);
assert("Employee A cannot read invoices (00030)", employeeInv === "0");

// generate_period_invoice idempotency (00031)
const idemStart = "2030-06-03";
const idemEnd = "2030-06-10";
const idemCountBefore = psql(
  `select count(*)::text from public.invoices
   where organisation_id = '${ORG_A}'
     and company_id = '${CO_A1}'
     and period_start = '${idemStart}'::date
     and period_end = '${idemEnd}'::date
     and deleted_at is null
     and status <> 'void'
     and driver_id is null;`,
  { userId: adminA }
);
const idemFirst = psql(
  `select (public.generate_period_invoice(
     '${ORG_A}'::uuid, '${CO_A1}'::uuid, '${idemStart}'::date, '${idemEnd}'::date
   )).id::text;`,
  { userId: adminA, commit: true }
);
const idemSecond = psql(
  `select (public.generate_period_invoice(
     '${ORG_A}'::uuid, '${CO_A1}'::uuid, '${idemStart}'::date, '${idemEnd}'::date
   )).id::text;`,
  { userId: adminA, commit: true }
);
const idemCountAfter = psql(
  `select count(*)::text from public.invoices
   where organisation_id = '${ORG_A}'
     and company_id = '${CO_A1}'
     and period_start = '${idemStart}'::date
     and period_end = '${idemEnd}'::date
     and deleted_at is null
     and status <> 'void'
     and driver_id is null;`,
  { userId: adminA }
);
assert(
  "generate_period_invoice is idempotent for org/company/period",
  idemFirst.length === 36 &&
    idemFirst === idemSecond &&
    idemCountAfter === "1" &&
    (idemCountBefore === "0" || idemCountBefore === "1")
);

// Drivers list isolated
const driverListA = psql(
  `select count(*)::text from public.drivers where deleted_at is null;`,
  { userId: adminA }
);
assert("Org A admin sees drivers in org A", Number(driverListA) >= 1);

const driverCross = psql(
  `select count(*)::text from public.drivers where organisation_id = '${ORG_B}';`,
  { userId: adminA }
);
assert("Org A admin cannot list Org B drivers", driverCross === "0");

// Org settings: admin can read own org row
const orgSettings = psql(
  `select name from public.organisations where id = '${ORG_A}';`,
  { userId: adminA }
);
assert("Org A admin reads own organisation", orgSettings === "Audit Org A");

const orgSettingsCross = psql(
  `select count(*)::text from public.organisations where id = '${ORG_B}';`,
  { userId: adminA }
);
assert("Org A admin cannot read Org B organisation row", orgSettingsCross === "0");

// create_own_organisation (00028): prefer signup user with zero memberships (fresh bootstrap)
function adminPsql(sql) {
  const res = spawnSync(
    "psql",
    [
      "-q",
      "-h",
      PG.host,
      "-p",
      PG.port,
      "-U",
      "supabase_admin",
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-c",
      sql,
    ],
    { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return (res.stdout ?? "").trim();
}

let bootstrapUserId = adminPsql(
  `select u.id::text from auth.users u
   left join public.organisation_members m on m.user_id = u.id and m.status = 'active'
   where u.email like 'signup.%@audit.test' and m.id is null
   order by u.email limit 1;`
);

if (!bootstrapUserId) {
  bootstrapUserId = adminPsql(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       created_at, updated_at, raw_app_meta_data, raw_user_meta_data
     )
     select
       '00000000-0000-0000-0000-000000000000',
       gen_random_uuid(),
       'authenticated', 'authenticated',
       'rls.bootstrap.' || replace(gen_random_uuid()::text, '-', '') || '@audit.test',
       encrypted_password,
       now(), now(), '{}', '{}'
     from auth.users where email = 'signup.a@audit.test'
     returning id::text;`
  );
}

let createdOrg;
try {
  createdOrg = psql(
    `select public.create_own_organisation('Signup Org', 'signup-org-${Date.now()}', '{"invoice_print":{"contact":{"name":"Signup"}}}'::jsonb)::text;`,
    { userId: bootstrapUserId, commit: true }
  );
  assert("Signup user creates own org via RPC", createdOrg.length === 36);
} catch (e) {
  assert("Signup user creates own org via RPC", false);
  console.error(e.message);
}

if (createdOrg) {
  const signupInvoices = psql(
    `select count(*)::text from public.invoices where organisation_id = '${ORG_A}';`,
    { userId: bootstrapUserId }
  );
  assert("New signup org admin cannot see Org A invoices", signupInvoices === "0");

  try {
    psql(
      `select public.create_own_organisation('Second Org Ltd', 'signup-org-2-${Date.now()}', '{}'::jsonb)::text;`,
      { userId: bootstrapUserId, commit: true }
    );
    assert("Signup user cannot create second org", false);
  } catch {
    assert("Signup user cannot create second org (RPC blocks)", true);
  }
}

// Platform owner sees all (by design)
const poCount = psql(
  `select count(*)::text from public.invoices where deleted_at is null;`,
  { userId: platform }
);
assert("Platform owner can read all invoices", Number(poCount) >= 3);

if (process.exitCode) {
  console.error("\nRLS isolation tests failed.");
  process.exit(process.exitCode);
}
console.log("\nAll RLS isolation checks passed.");
