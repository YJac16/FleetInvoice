#!/usr/bin/env node
/**
 * Fleet maintenance Drop 1 (U1) — RLS isolation for suppliers,
 * maintenance_categories, workshop_bills and workshop_bill_lines (00073).
 * Local Postgres only (workops_audit). Never points at a hosted project.
 *
 * Run: npm run test:maintenance-rls
 */
import { spawnSync } from "node:child_process";

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const COMPANY_A = "a0000000-0000-4000-8000-000000000101";
const COMPANY_B = "b0000000-0000-4000-8000-000000000101";

// Seeded by scripts/local-db/seed-audit-fixtures.sql
const platformOwner = "f0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000012";
const employeeA = "a0000000-0000-4000-8000-000000000013";
const companyMgrA = "a0000000-0000-4000-8000-000000000014";
const adminB = "b0000000-0000-4000-8000-000000000011";

// Added here
const managerA = "e7300000-0000-4000-8000-000000000001";
const dispatcherA = "e7300000-0000-4000-8000-000000000002";
const supervisorA = "e7300000-0000-4000-8000-000000000003";

const VEH_A = "e7300000-0000-4000-8000-000000000101";
const VEH_B = "e7300000-0000-4000-8000-000000000102";
const SUP_A = "e7300000-0000-4000-8000-000000000201";
const SUP_B = "e7300000-0000-4000-8000-000000000202";
const CAT_A = "e7300000-0000-4000-8000-000000000301";
const CAT_B = "e7300000-0000-4000-8000-000000000302";
const BILL_A = "e7300000-0000-4000-8000-000000000401";
const BILL_B = "e7300000-0000-4000-8000-000000000402";
const LINE_A = "e7300000-0000-4000-8000-000000000501";
const LINE_B = "e7300000-0000-4000-8000-000000000502";

const TABLES = ["suppliers", "maintenance_categories", "workshop_bills", "workshop_bill_lines"];

let failures = 0;
function record(id, pass, evidence) {
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence ?? "");
  if (!pass) failures += 1;
}

function run(args, env) {
  return spawnSync(args[0], args.slice(1), { env, encoding: "utf8" });
}

function psqlAdmin(sql, { allowError = false } = {}) {
  const res = run(
    ["sudo", "-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    process.env
  );
  if (res.status !== 0 && !allowError) throw new Error(res.stderr || res.stdout);
  return { ok: res.status === 0, out: (res.stdout ?? "").trim(), err: res.stderr ?? "" };
}

function psqlAs(userId, sql) {
  const body = `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${sql}\nCOMMIT;`;
  const res = run(
    ["psql", "-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { ...process.env, PGPASSWORD: PG.auditPassword }
  );
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    err: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}

function count(userId, table, where = "true") {
  const r = psqlAs(userId, `select count(*)::text from public.${table} where ${where};`);
  if (!r.ok) throw new Error(`count ${table} as ${userId}: ${r.err}`);
  return Number(r.out);
}

// ---------------------------------------------------------------------------
// Fixtures (as postgres; bypasses RLS)
// ---------------------------------------------------------------------------

psqlAdmin(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${managerA}', 'authenticated', 'authenticated',
   'manager.maint@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Manager A"}'),
  ('00000000-0000-0000-0000-000000000000', '${dispatcherA}', 'authenticated', 'authenticated',
   'dispatcher.maint@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Dispatcher A"}'),
  ('00000000-0000-0000-0000-000000000000', '${supervisorA}', 'authenticated', 'authenticated',
   'supervisor.maint@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Supervisor A"}')
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status)
values
  ('${ORG_A}', '${managerA}', 'manager', 'active'),
  ('${ORG_A}', '${dispatcherA}', 'dispatcher', 'active'),
  ('${ORG_A}', '${supervisorA}', 'supervisor', 'active')
on conflict do nothing;

insert into public.vehicles (id, organisation_id, company_id, name, registration_number, vehicle_type, status)
values
  ('${VEH_A}', '${ORG_A}', '${COMPANY_A}', 'Maint A', 'MNT 001 GP', 'minibus', 'active'),
  ('${VEH_B}', '${ORG_B}', '${COMPANY_B}', 'Maint B', 'MNT 002 GP', 'minibus', 'active')
on conflict (id) do nothing;

insert into public.suppliers (id, organisation_id, name)
values ('${SUP_A}', '${ORG_A}', 'Workshop A'), ('${SUP_B}', '${ORG_B}', 'Workshop B')
on conflict (id) do nothing;

insert into public.maintenance_categories (id, organisation_id, name)
values ('${CAT_A}', '${ORG_A}', 'Tyres'), ('${CAT_B}', '${ORG_B}', 'Tyres')
on conflict (id) do nothing;

insert into public.workshop_bills (
  id, organisation_id, supplier_id, vehicle_id, bill_date, invoice_ref,
  subtotal_excl, vat_amount, total_incl
)
values
  ('${BILL_A}', '${ORG_A}', '${SUP_A}', '${VEH_A}', '2026-11-01', 'INV-A-1', 100.00, 15.00, 115.00),
  ('${BILL_B}', '${ORG_B}', '${SUP_B}', '${VEH_B}', '2026-11-01', 'INV-B-1', 200.00, 30.00, 230.00)
on conflict (id) do nothing;

insert into public.workshop_bill_lines (
  id, bill_id, organisation_id, category_id, description, quantity, unit_amount,
  line_excl, line_vat, line_incl
)
values
  ('${LINE_A}', '${BILL_A}', '${ORG_A}', '${CAT_A}', 'Tyre', 1, 100.00, 100.00, 15.00, 115.00),
  ('${LINE_B}', '${BILL_B}', '${ORG_B}', '${CAT_B}', 'Tyre', 1, 200.00, 200.00, 30.00, 230.00)
on conflict (id) do nothing;
`);

// ---------------------------------------------------------------------------
// M1–M3: who can read
// ---------------------------------------------------------------------------

for (const t of TABLES) {
  const a = count(adminA, t);
  record(`M1 org A admin sees only org A ${t}`, a === 1 && count(adminA, t, `organisation_id = '${ORG_B}'`) === 0, `rows=${a}`);

  const m = count(managerA, t);
  record(`M1 org A manager sees only org A ${t}`, m === 1 && count(managerA, t, `organisation_id = '${ORG_B}'`) === 0, `rows=${m}`);

  const b = count(adminB, t);
  record(`M2 org B admin sees only org B ${t}`, b === 1 && count(adminB, t, `organisation_id = '${ORG_A}'`) === 0, `rows=${b}`);

  const po = count(platformOwner, t, `organisation_id in ('${ORG_A}', '${ORG_B}')`);
  record(`M3 platform owner sees both orgs ${t}`, po === 2, `rows=${po}`);
}

// ---------------------------------------------------------------------------
// M4: driver, employee, company_manager, dispatcher, supervisor see nothing
// ---------------------------------------------------------------------------

const denied = {
  driver: driverA,
  employee: employeeA,
  company_manager: companyMgrA,
  dispatcher: dispatcherA,
  supervisor: supervisorA,
};
for (const [role, uid] of Object.entries(denied)) {
  for (const t of TABLES) {
    const n = count(uid, t);
    record(`M4 ${role} sees 0 ${t}`, n === 0, `rows=${n}`);
  }
}

// ---------------------------------------------------------------------------
// M5: no direct client writes, even for org admin of the same org
// ---------------------------------------------------------------------------

const writes = [
  ["insert supplier", `insert into public.suppliers (organisation_id, name) values ('${ORG_A}', 'Direct');`],
  ["insert category", `insert into public.maintenance_categories (organisation_id, name) values ('${ORG_A}', 'Direct');`],
  [
    "insert bill",
    `insert into public.workshop_bills (organisation_id, supplier_id, bill_date, invoice_ref) values ('${ORG_A}', '${SUP_A}', '2026-11-02', 'DIRECT');`,
  ],
  [
    "insert line",
    `insert into public.workshop_bill_lines (bill_id, organisation_id, description) values ('${BILL_A}', '${ORG_A}', 'Direct');`,
  ],
  ["update bill status", `with w as (update public.workshop_bills set notes = 'x' where id = '${BILL_A}' returning 1) select count(*) from w;`],
  ["update line amount", `with w as (update public.workshop_bill_lines set unit_amount = 1 where id = '${LINE_A}' returning 1) select count(*) from w;`],
  ["update supplier", `with w as (update public.suppliers set name = 'Hacked' where id = '${SUP_A}' returning 1) select count(*) from w;`],
  ["delete line", `with w as (delete from public.workshop_bill_lines where id = '${LINE_A}' returning 1) select count(*) from w;`],
  ["delete bill", `with w as (delete from public.workshop_bills where id = '${BILL_A}' returning 1) select count(*) from w;`],
];

for (const uid of [adminA, managerA, driverA, companyMgrA]) {
  for (const [label, sql] of writes) {
    const r = psqlAs(uid, sql);
    // Denied = error (privilege / RLS check), or 0 rows affected for update/delete.
    const pass = !r.ok || r.out === "0";
    record(`M5 ${uid.slice(0, 8)}.. ${label} denied`, pass, r.ok ? `rows affected=${r.out}` : r.err.split("\n")[0]);
  }
}

const unchanged = psqlAdmin(
  `select concat_ws('|', (select coalesce(notes, 'notes-null') from public.workshop_bills where id = '${BILL_A}'),
     (select unit_amount from public.workshop_bill_lines where id = '${LINE_A}'),
     (select name from public.suppliers where id = '${SUP_A}'),
     (select count(*) from public.suppliers where name = 'Direct'));`
).out;
record("M5 data unchanged after write attempts", unchanged === "notes-null|100.00|Workshop A|0", unchanged);

// ---------------------------------------------------------------------------
// M6: same-org guards (even service writes can't cross orgs)
// ---------------------------------------------------------------------------

const crossSupplier = psqlAdmin(
  `insert into public.workshop_bills (organisation_id, supplier_id, bill_date, invoice_ref)
   values ('${ORG_A}', '${SUP_B}', '2026-11-03', 'X-SUP');`,
  { allowError: true }
);
record("M6 bill with other org's supplier rejected", !crossSupplier.ok && /supplier_org_mismatch/.test(crossSupplier.err), crossSupplier.err.split("\n")[0]);

const crossVehicle = psqlAdmin(
  `insert into public.workshop_bills (organisation_id, supplier_id, vehicle_id, bill_date, invoice_ref)
   values ('${ORG_A}', '${SUP_A}', '${VEH_B}', '2026-11-03', 'X-VEH');`,
  { allowError: true }
);
record("M6 bill with other org's vehicle rejected", !crossVehicle.ok && /vehicle_org_mismatch/.test(crossVehicle.err), crossVehicle.err.split("\n")[0]);

const crossLine = psqlAdmin(
  `insert into public.workshop_bill_lines (bill_id, organisation_id, description)
   values ('${BILL_B}', '${ORG_A}', 'X');`,
  { allowError: true }
);
record("M6 line with mismatched bill org rejected", !crossLine.ok && /bill_org_mismatch/.test(crossLine.err), crossLine.err.split("\n")[0]);

const crossCat = psqlAdmin(
  `insert into public.workshop_bill_lines (bill_id, organisation_id, category_id, description)
   values ('${BILL_A}', '${ORG_A}', '${CAT_B}', 'X');`,
  { allowError: true }
);
record("M6 line with other org's category rejected", !crossCat.ok && /category_org_mismatch/.test(crossCat.err), crossCat.err.split("\n")[0]);

// ---------------------------------------------------------------------------
// M7: constraints
// ---------------------------------------------------------------------------

const bigFile = psqlAdmin(
  `update public.workshop_bills set attachment_path = 'x', attachment_mime = 'application/pdf',
   attachment_size = 10485761 where id = '${BILL_A}';`,
  { allowError: true }
);
record("M7 attachment over 10 MB rejected", !bigFile.ok, bigFile.err.split("\n")[0]);

const badMime = psqlAdmin(
  `update public.workshop_bills set attachment_path = 'x', attachment_mime = 'text/html',
   attachment_size = 10 where id = '${BILL_A}';`,
  { allowError: true }
);
record("M7 attachment non-PDF/image rejected", !badMime.ok, badMime.err.split("\n")[0]);

const badTotal = psqlAdmin(
  `update public.workshop_bills set total_incl = 999 where id = '${BILL_A}';`,
  { allowError: true }
);
record("M7 total != subtotal + VAT rejected", !badTotal.ok, badTotal.err.split("\n")[0]);

const dupRef = psqlAdmin(
  `insert into public.workshop_bills (organisation_id, supplier_id, bill_date, invoice_ref)
   values ('${ORG_A}', '${SUP_A}', '2026-11-04', ' inv-a-1 ');`,
  { allowError: true }
);
record("M7 duplicate supplier invoice ref rejected", !dupRef.ok, dupRef.err.split("\n")[0]);

const approvedNoDate = psqlAdmin(
  `update public.workshop_bills set status = 'approved' where id = '${BILL_A}';`,
  { allowError: true }
);
record("M7 approved without approved_at rejected", !approvedNoDate.ok, approvedNoDate.err.split("\n")[0]);

const entitlement = psqlAdmin(
  `begin;
   insert into public.module_entitlements (plan_id, module_key)
   select id, 'maintenance' from public.plans limit 1;
   rollback;`,
  { allowError: true }
);
record("M7 module_key 'maintenance' accepted by check constraint", entitlement.ok, entitlement.err.split("\n")[0]);

// ---------------------------------------------------------------------------
// M8: anon has no access
// ---------------------------------------------------------------------------

const anon = psqlAdmin(
  `begin; set local role anon; select count(*) from public.workshop_bills; rollback;`,
  { allowError: true }
);
record("M8 anon cannot read workshop_bills", !anon.ok && /permission denied/.test(anon.err), anon.err.split("\n")[0]);

console.log(failures === 0 ? "\nAll maintenance RLS checks passed." : `\n${failures} maintenance RLS check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
