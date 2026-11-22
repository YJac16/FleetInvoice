#!/usr/bin/env node
/**
 * 00072: per-driver invoice print override.
 *  - only organisation admins write (via the definer RPC); no direct writes
 *  - read: admin / manager / dispatcher, or anyone who can see that driver's
 *    invoices; drivers (own or other), roles without a visible invoice for
 *    that driver and other orgs see nothing
 *  - audit log never carries banking values
 * Requires: scripts/local-db/bootstrap-native.sh (run by this test).
 * Fixture account numbers are fake.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(
  join(root, "supabase/migrations/00072_driver_invoice_print_override.sql"),
  "utf8"
);

let failed = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failed = 1;
}

// Static checks
check(
  "set RPC anon revoked",
  /revoke all on function public\.set_driver_invoice_print_override\(uuid, jsonb\) from public, anon/.test(sql)
);
check(
  "definer fn pins search_path",
  /security definer\s+set search_path = pg_catalog, public/.test(sql)
);
check("table revoked from anon", /revoke all on table public\.driver_invoice_print_overrides from public, anon/.test(sql));
check("RLS enabled", /alter table public\.driver_invoice_print_overrides enable row level security/.test(sql));
check("no write policies", !/for (insert|update|delete|all)/i.test(sql));
check("single RPC definition (no overloads)", (sql.match(/create or replace function public\.set_driver_invoice_print_override\(/g) ?? []).length === 1);

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG = "d7200000-0000-4000-8000-000000000001";
const OTHER_ORG = "d7200000-0000-4000-8000-000000000002";
const u = (n) => `d7200000-0000-4000-8000-0000000000${n}`;
const users = {
  admin: u(11),
  manager: u(12),
  dispatcher: u(13),
  supervisor: u(14),
  freddyLogin: u(15),
  zainLogin: u(16),
  otherAdmin: u(17),
};
const freddy = "d7200000-0000-4000-8000-000000000201";
const zain = "d7200000-0000-4000-8000-000000000202";
const companyId = "d7200000-0000-4000-8000-000000000301";

function psqlAdmin(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAs(userId, body) {
  const sqlBody = `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${userId}';
${body}
COMMIT;
`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sqlBody],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}

if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
  const bootstrap = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], { encoding: "utf8" });
  if (bootstrap.status !== 0) {
    console.error("FAIL integration — bootstrap-native.sh failed");
    console.error(bootstrap.stderr || bootstrap.stdout);
    process.exit(1);
  }
}

psqlAdmin(`grant usage on schema auth to authenticated, anon;`);

const authRows = Object.entries(users)
  .map(
    ([k, id]) =>
      `('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${k}@override.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')`
  )
  .join(",\n");

psqlAdmin(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ${authRows}
on conflict (id) do nothing;
insert into public.organisations (id, name, slug, status) values
  ('${ORG}', 'Override Org', 'override-org', 'active'),
  ('${OTHER_ORG}', 'Other Org', 'override-other-org', 'active')
on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, user_id, role, status) values
  ('${ORG}', '${users.admin}', 'organisation_admin', 'active'),
  ('${ORG}', '${users.manager}', 'manager', 'active'),
  ('${ORG}', '${users.dispatcher}', 'dispatcher', 'active'),
  ('${ORG}', '${users.supervisor}', 'supervisor', 'active'),
  ('${ORG}', '${users.freddyLogin}', 'driver', 'active'),
  ('${ORG}', '${users.zainLogin}', 'driver', 'active'),
  ('${OTHER_ORG}', '${users.otherAdmin}', 'organisation_admin', 'active')
on conflict do nothing;
insert into public.drivers (id, organisation_id, profile_id, full_name, status) values
  ('${freddy}', '${ORG}', '${users.freddyLogin}', 'Freddy', 'active'),
  ('${zain}', '${ORG}', '${users.zainLogin}', 'Zain', 'active')
on conflict (id) do nothing;
insert into public.companies (id, organisation_id, name, status)
values ('${companyId}', '${ORG}', 'WCL Trading CC', 'active') on conflict (id) do nothing;
insert into public.invoices (organisation_id, company_id, driver_id, period_start, period_end)
values ('${ORG}', '${companyId}', '${freddy}', date '2026-11-16', date '2026-11-22');
`);

const override = JSON.stringify({
  contact: { name: "Mansur Jacobs" },
  banking: {
    bank: "ABSA",
    account_name: "Mansur Jacobs",
    account_number: "9999990332",
    branch_code: "632005",
    account_type: "Current Account",
  },
});
const setOverride = (userId, driverId, settings) =>
  psqlAs(
    userId,
    `select public.set_driver_invoice_print_override('${driverId}'::uuid, ${
      settings === null ? "null" : `'${settings}'::jsonb`
    });`
  );
const visibleCount = (userId) =>
  psqlAs(userId, `select count(*)::text from public.driver_invoice_print_overrides;`).out;
const stored = () =>
  psqlAdmin(`select coalesce(settings #>> '{banking,account_name}', '') from public.driver_invoice_print_overrides where driver_id = '${freddy}'`);

// Writes
for (const who of ["manager", "dispatcher", "supervisor", "freddyLogin", "zainLogin", "otherAdmin"]) {
  const r = setOverride(users[who], freddy, override);
  check(`${who} cannot set override`, !r.ok && /Only organisation admins|Driver not found/.test(r.text), r.text);
}
check("nothing written by non-admins", stored() === "");

const set = setOverride(users.admin, freddy, override);
check("org admin sets override", set.ok, set.text);
check("override stored", stored() === "Mansur Jacobs", stored());

const bad = setOverride(users.admin, freddy, JSON.stringify({ driver_label: "X" }));
check("rejects unsupported block", !bad.ok && /Unsupported override block/.test(bad.text), bad.text);
const badShape = setOverride(users.admin, freddy, JSON.stringify({ banking: "x" }));
check("rejects non-object block", !badShape.ok && /must be a JSON object/.test(badShape.text), badShape.text);
check("override unchanged after rejected writes", stored() === "Mansur Jacobs");

const direct = psqlAs(
  users.admin,
  `update public.driver_invoice_print_overrides set settings = '{}'::jsonb where driver_id = '${freddy}' returning 1;`
);
check("no direct update even for admin (RLS)", direct.ok && direct.out === "" && stored() === "Mansur Jacobs", direct.text);
const directInsert = psqlAs(
  users.freddyLogin,
  `insert into public.driver_invoice_print_overrides (driver_id, organisation_id, settings) values ('${zain}', '${ORG}', '{}'::jsonb);`
);
check("driver cannot insert directly", !directInsert.ok, directInsert.text);

// Reads
check("admin reads override", visibleCount(users.admin) === "1");
check("manager reads override", visibleCount(users.manager) === "1");
check("dispatcher reads override", visibleCount(users.dispatcher) === "1");
// Supervisor reads only because invoices RLS lets them see Freddy's invoice
// (same data the print already shows); without a visible invoice, nothing.
const supervisorInvoices = psqlAs(users.supervisor, `select count(*)::text from public.invoices where driver_id = '${freddy}';`).out;
check("supervisor sees override iff they see the driver's invoice", visibleCount(users.supervisor) === supervisorInvoices, `${visibleCount(users.supervisor)} vs ${supervisorInvoices}`);
psqlAdmin(`update public.invoices set deleted_at = now() where driver_id = '${freddy}'`);
check("supervisor without a visible invoice cannot read", visibleCount(users.supervisor) === "0", visibleCount(users.supervisor));
check("admin still reads with no invoice", visibleCount(users.admin) === "1");
psqlAdmin(`update public.invoices set deleted_at = null where driver_id = '${freddy}'`);
check("Freddy's own driver login cannot read", visibleCount(users.freddyLogin) === "0");
check("other driver (Zain) cannot read", visibleCount(users.zainLogin) === "0");
check("other org admin cannot read", visibleCount(users.otherAdmin) === "0");

// Audit carries no banking values
const audit = psqlAdmin(
  `select coalesce(string_agg(metadata::text, '|'), '') from public.audit_logs where entity_id = '${freddy}' and action like 'driver.invoice_print_override.%'`
);
check("audit row written", /blocks/.test(audit), audit);
check("audit has no account number", !/9999990332|632005/.test(audit), audit);

// Clear
const cleared = setOverride(users.admin, freddy, null);
check("admin clears override", cleared.ok && stored() === "", cleared.text);

if (failed) {
  console.error("driver-invoice-print-override: FAILED");
  process.exit(1);
}
console.log("driver-invoice-print-override: all checks passed");
