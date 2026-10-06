#!/usr/bin/env node
/**
 * Company portal Phase 1 RLS. Local Postgres only (workops_audit).
 * Never points at a hosted Supabase project.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/00057_company_portal_phase1_isolation.sql"
);

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000012";
const employeeA = "a0000000-0000-4000-8000-000000000013";
const cm1 = "a0000000-0000-4000-8000-000000000014";
const supervisorA = "a0000000-0000-4000-8000-000000000018";
const cmB = "b0000000-0000-4000-8000-000000000014";
const driverRow = "a0000000-0000-4000-8000-000000000201";
const C1 = "a0000000-0000-4000-8000-000000000101";
const C2 = "a0000000-0000-4000-8000-000000000102";
const B1 = "b0000000-0000-4000-8000-000000000101";
const employeeRow = "a0000000-0000-4000-8000-000000000301";

const dispatcher = "d1000000-0000-4000-8000-000000000024";
const cm2 = "d1000000-0000-4000-8000-000000000022";
const cmWcl = "d1000000-0000-4000-8000-000000000023";
const cmFresh = "d1000000-0000-4000-8000-000000000026";
const WCL = "d1000000-0000-4000-8000-000000000103";
const E_C1 = "d1000000-0000-4000-8000-000000000303";
const E_C2 = "d1000000-0000-4000-8000-000000000301";
const E_BLANK = "d1000000-0000-4000-8000-000000000302";
const ROUTE_A = "d1000000-0000-4000-8000-000000000501";
const ROUTE_B = "d1000000-0000-4000-8000-000000000502";
const T_C1 = "d1000000-0000-4000-8000-000000000401";
const T_C2 = "d1000000-0000-4000-8000-000000000402";
const T_BLANK = "d1000000-0000-4000-8000-000000000403";
const T_B = "d1000000-0000-4000-8000-000000000404";
const V_C1 = "d1000000-0000-4000-8000-000000000611";
const V_C2 = "d1000000-0000-4000-8000-000000000612";
const V_BLANK = "d1000000-0000-4000-8000-000000000613";
const V_B = "d1000000-0000-4000-8000-000000000614";
const F_C1 = "d1000000-0000-4000-8000-000000000621";
const F_C2 = "d1000000-0000-4000-8000-000000000622";
const F_BLANK = "d1000000-0000-4000-8000-000000000623";
const INV_DRIVER = "d1000000-0000-4000-8000-000000000701";
const INV_DRAFT = "d1000000-0000-4000-8000-000000000702";
const LINE_DRIVER = "d1000000-0000-4000-8000-000000000711";
const LINE_FUEL = "d1000000-0000-4000-8000-000000000712";
const RC_ORG = "d1000000-0000-4000-8000-000000000801";
const RC_C1 = "d1000000-0000-4000-8000-000000000802";
const RC_C2 = "d1000000-0000-4000-8000-000000000803";
const P_C1 = "d1000000-0000-4000-8000-000000000901";
const P_MIX = "d1000000-0000-4000-8000-000000000902";
const P_C2 = "d1000000-0000-4000-8000-000000000903";
const AE_C1 = "d1000000-0000-4000-8000-000000000911";
const AE_C2 = "d1000000-0000-4000-8000-000000000912";
const QR_C1 = "d1000000-0000-4000-8000-000000000921";
const QR_C2 = "d1000000-0000-4000-8000-000000000922";
const TA_C1 = "d1000000-0000-4000-8000-000000000931";
const TA_C2 = "d1000000-0000-4000-8000-000000000932";
const TA_BLANK = "d1000000-0000-4000-8000-000000000933";
const TE_C1 = "d1000000-0000-4000-8000-000000000941";
const TE_C2 = "d1000000-0000-4000-8000-000000000942";
const TE_BLANK = "d1000000-0000-4000-8000-000000000943";
const MEM_CM2 = "d1000000-0000-4000-8000-0000000000c2";
const MEM_WCL = "d1000000-0000-4000-8000-0000000000c3";
const MEM_FRESH = "d1000000-0000-4000-8000-0000000000c6";
const MEM_DISP = "d1000000-0000-4000-8000-0000000000d4";

const results = [];

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psqlRaw(sql, { userId, allowError = false } = {}) {
  const body = userId
    ? `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${sql}\nCOMMIT;`
    : sql;
  const res = spawnSync(
    "psql",
    [
      "-q",
      "-h",
      "127.0.0.1",
      "-U",
      PG.auditUser,
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-c",
      body,
    ],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout);
  }
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim(),
    err: `${res.stderr ?? ""}\n${res.stdout ?? ""}`,
  };
}

function psqlAs(userId, sql) {
  return psqlRaw(sql, { userId }).out.split("\n").filter(Boolean).at(-1) ?? "";
}

function count(userId, table, where = "true") {
  return Number(psqlAs(userId, `select count(*)::text from public.${table} where ${where};`));
}

function psqlAdmin(sql) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAdminFile(file) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-q", "-f", file],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
}

psqlAdmin(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${cm2}', 'authenticated', 'authenticated',
   'cm2.phase1@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"CM2"}'),
  ('00000000-0000-0000-0000-000000000000', '${cmWcl}', 'authenticated', 'authenticated',
   'cmwcl.phase1@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"CM WCL"}'),
  ('00000000-0000-0000-0000-000000000000', '${cmFresh}', 'authenticated', 'authenticated',
   'cmfresh.phase1@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"CM Fresh"}'),
  ('00000000-0000-0000-0000-000000000000', '${dispatcher}', 'authenticated', 'authenticated',
   'dispatcher.phase1@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Dispatcher"}')
on conflict (id) do nothing;

insert into public.companies (id, organisation_id, name, status)
values ('${WCL}', '${ORG_A}', 'WCL Trading CC', 'active')
on conflict (id) do nothing;

insert into public.organisation_members (id, organisation_id, user_id, role, status)
values
  ('${MEM_CM2}', '${ORG_A}', '${cm2}', 'company_manager', 'active'),
  ('${MEM_WCL}', '${ORG_A}', '${cmWcl}', 'company_manager', 'active'),
  ('${MEM_FRESH}', '${ORG_A}', '${cmFresh}', 'company_manager', 'active'),
  ('${MEM_DISP}', '${ORG_A}', '${dispatcher}', 'dispatcher', 'active')
on conflict (id) do nothing;

insert into public.member_scopes (organisation_id, membership_id, company_id)
values ('${ORG_A}', '${MEM_CM2}', '${C2}')
on conflict do nothing;

insert into public.employees (id, organisation_id, company_id, full_name, status)
values
  ('${E_C1}', '${ORG_A}', '${C1}', 'Phase1 C1', 'active'),
  ('${E_C2}', '${ORG_A}', '${C2}', 'Phase1 C2', 'active'),
  ('${E_BLANK}', '${ORG_A}', null, 'Phase1 Blank', 'active')
on conflict (id) do nothing;

insert into public.routes (id, organisation_id, name, status)
values
  ('${ROUTE_A}', '${ORG_A}', 'Phase1 route A', 'active'),
  ('${ROUTE_B}', '${ORG_B}', 'Phase1 route B', 'active')
on conflict (id) do nothing;

insert into public.trips (
  id, organisation_id, company_id, route_id, is_staff_transport, area_text, planned_start, status
)
values
  ('${T_C1}', '${ORG_A}', '${C1}', null, true, 'Cape Town', '2026-10-06T08:00:00Z', 'completed'),
  ('${T_C2}', '${ORG_A}', '${C2}', null, true, 'Cape Town', '2026-10-06T09:00:00Z', 'completed'),
  ('${T_BLANK}', '${ORG_A}', null, '${ROUTE_A}', false, null, '2026-10-06T10:00:00Z', 'planned'),
  ('${T_B}', '${ORG_B}', '${B1}', null, true, 'Cape Town', '2026-10-06T11:00:00Z', 'completed')
on conflict (id) do nothing;

insert into public.trip_passengers (id, organisation_id, trip_id, employee_id, status)
values
  ('${P_C1}', '${ORG_A}', '${T_C1}', '${E_C1}', 'confirmed'),
  ('${P_MIX}', '${ORG_A}', '${T_C1}', '${E_C2}', 'confirmed'),
  ('${P_C2}', '${ORG_A}', '${T_C2}', '${E_C2}', 'confirmed')
on conflict (id) do nothing;

insert into public.vehicles (id, organisation_id, company_id, name, registration_number, vehicle_type, status)
values
  ('${V_C1}', '${ORG_A}', '${C1}', 'Phase1 C1', 'CA P1-C1', 'van', 'active'),
  ('${V_C2}', '${ORG_A}', '${C2}', 'Phase1 C2', 'CA P1-C2', 'van', 'active'),
  ('${V_BLANK}', '${ORG_A}', null, 'Phase1 Blank', 'CA P1-BL', 'van', 'active'),
  ('${V_B}', '${ORG_B}', '${B1}', 'Phase1 B', 'CA P1-B', 'van', 'active')
on conflict (id) do nothing;

insert into public.fuel_fillups (
  id, organisation_id, vehicle_id, driver_id, company_id, odometer_km, litres, total_amount
)
values
  ('${F_C1}', '${ORG_A}', '${V_C1}', '${driverRow}', '${C1}', 1000, 10, 200),
  ('${F_C2}', '${ORG_A}', '${V_C2}', null, '${C2}', 1100, 12, 240),
  ('${F_BLANK}', '${ORG_A}', '${V_BLANK}', null, null, 1200, 8, 160)
on conflict (id) do nothing;

insert into public.rate_cards (
  id, organisation_id, company_id, name, line_type, unit, unit_amount, effective_from
)
values
  ('${RC_ORG}', '${ORG_A}', null, 'Org wide trip', 'trip', 'trip', 300, '2026-01-01'),
  ('${RC_C1}', '${ORG_A}', '${C1}', 'C1 trip', 'trip', 'trip', 400, '2026-01-01'),
  ('${RC_C2}', '${ORG_A}', '${C2}', 'C2 trip', 'trip', 'trip', 500, '2026-01-01')
on conflict (id) do nothing;

insert into public.invoices (
  id, organisation_id, company_id, driver_id, status, period_start, period_end, subtotal, total, currency
)
values
  ('${INV_DRIVER}', '${ORG_A}', '${WCL}', '${driverRow}', 'issued', '2026-10-05', '2026-10-12', 400, 400, 'ZAR'),
  ('${INV_DRAFT}', '${ORG_A}', '${C1}', null, 'draft', '2026-10-05', '2026-10-12', 80, 80, 'ZAR')
on conflict (id) do nothing;

insert into public.invoice_lines (
  id, organisation_id, invoice_id, line_type, description, quantity, unit_price, amount
)
values
  ('${LINE_DRIVER}', '${ORG_A}', '${INV_DRIVER}', 'trip', 'Driver week line', 1, 400, 400),
  ('${LINE_FUEL}', '${ORG_A}', '${INV_DRAFT}', 'fuel', 'Fuel line', 10, 8, 80)
on conflict (id) do nothing;

insert into public.attendance_events (
  id, organisation_id, trip_id, employee_id, event_type
)
values
  ('${AE_C1}', '${ORG_A}', '${T_C1}', '${E_C1}', 'boarded'),
  ('${AE_C2}', '${ORG_A}', '${T_C2}', '${E_C2}', 'boarded')
on conflict (id) do nothing;

insert into public.qr_tokens (
  id, organisation_id, trip_id, employee_id, token_hash, expires_at
)
values
  ('${QR_C1}', '${ORG_A}', '${T_C1}', '${E_C1}', 'phase1-qr-c1', '2026-12-01T00:00:00Z'),
  ('${QR_C2}', '${ORG_A}', '${T_C2}', '${E_C2}', 'phase1-qr-c2', '2026-12-01T00:00:00Z')
on conflict (id) do nothing;

insert into public.trip_assignments (
  id, organisation_id, trip_id, driver_id, vehicle_id
)
values
  ('${TA_C1}', '${ORG_A}', '${T_C1}', '${driverRow}', '${V_C1}'),
  ('${TA_C2}', '${ORG_A}', '${T_C2}', '${driverRow}', '${V_C2}'),
  ('${TA_BLANK}', '${ORG_A}', '${T_BLANK}', '${driverRow}', '${V_BLANK}')
on conflict (id) do nothing;

insert into public.trip_events (id, organisation_id, trip_id, event_type)
values
  ('${TE_C1}', '${ORG_A}', '${T_C1}', 'completed'),
  ('${TE_C2}', '${ORG_A}', '${T_C2}', 'completed'),
  ('${TE_BLANK}', '${ORG_A}', '${T_BLANK}', 'assigned')
on conflict (id) do nothing;
`);

psqlAdmin(`
begin;
set session_replication_role = replica;
insert into public.member_scopes (organisation_id, membership_id, company_id)
values ('${ORG_A}', '${MEM_WCL}', '${WCL}')
on conflict do nothing;
commit;
`);

function expectCount(id, userId, table, where, expected) {
  const actual = count(userId, table, where);
  record(id, actual === expected, `${table} ${actual} expected ${expected}`);
}

expectCount("CM1-companies", cm1, "companies", "true", 1);
record(
  "CM1-company-is-c1",
  psqlAs(cm1, `select id::text from public.companies;`) === C1,
  "only C1"
);
expectCount("CM1-employees", cm1, "employees", "true", 2);
record(
  "CM1-no-blank-employee",
  count(cm1, "employees", "company_id is null") === 0,
  "blank employees hidden"
);
expectCount("CM1-trips", cm1, "trips", "true", 1);
record(
  "CM1-trip-is-c1",
  psqlAs(cm1, `select id::text from public.trips;`) === T_C1,
  "only C1 trip"
);
expectCount("CM1-passengers", cm1, "trip_passengers", "true", 1);
record(
  "CM1-passenger-is-c1",
  psqlAs(cm1, `select id::text from public.trip_passengers;`) === P_C1,
  "mixed C2 passenger hidden"
);
expectCount("CM1-rate-cards", cm1, "rate_cards", "true", 1);
expectCount("CM1-org-wide-rates", cm1, "rate_cards", "company_id is null", 0);
expectCount("CM1-invoices", cm1, "invoices", "true", 2);
expectCount("CM1-driver-invoices", cm1, "invoices", "driver_id is not null", 0);
expectCount(
  "CM1-wcl-invoices",
  cm1,
  "invoices",
  `company_id = '${WCL}'`,
  0
);
expectCount("CM1-invoice-lines", cm1, "invoice_lines", "true", 2);
expectCount(
  "CM1-driver-lines",
  cm1,
  "invoice_lines",
  `invoice_id = '${INV_DRIVER}'`,
  0
);
expectCount("CM1-vehicles", cm1, "vehicles", "true", 0);
expectCount("CM1-fuel", cm1, "fuel_fillups", "true", 0);
expectCount("CM1-drivers", cm1, "drivers", "true", 0);
expectCount("CM1-qr", cm1, "qr_tokens", "true", 0);
expectCount("CM1-attendance", cm1, "attendance_events", "true", 1);
record(
  "CM1-attendance-is-c1",
  psqlAs(cm1, `select id::text from public.attendance_events;`) === AE_C1,
  "only C1 attendance"
);
expectCount("CM1-assignments", cm1, "trip_assignments", "true", 1);
expectCount("CM1-events", cm1, "trip_events", "true", 1);
expectCount("CM1-org-b-companies", cm1, "companies", `organisation_id = '${ORG_B}'`, 0);

expectCount("CM2-companies", cm2, "companies", "true", 1);
record(
  "CM2-company-is-c2",
  psqlAs(cm2, `select id::text from public.companies;`) === C2,
  "only C2"
);
expectCount("CM2-trips", cm2, "trips", "true", 1);
expectCount("CM2-passengers", cm2, "trip_passengers", "true", 1);
expectCount("CM2-invoices", cm2, "invoices", "true", 1);

expectCount("CMWCL-invoices", cmWcl, "invoices", "true", 0);
expectCount("CMWCL-lines", cmWcl, "invoice_lines", "true", 0);
expectCount("CMWCL-companies", cmWcl, "companies", "true", 0);
expectCount("CMWCL-trips", cmWcl, "trips", "true", 0);

expectCount("CMB-companies", cmB, "companies", "true", 1);
record(
  "CMB-company-is-b1",
  psqlAs(cmB, `select id::text from public.companies;`) === B1,
  "org B only"
);
expectCount("CMB-no-org-a-trips", cmB, "trips", `organisation_id = '${ORG_A}'`, 0);

expectCount("ADMIN-companies", adminA, "companies", "true", 3);
expectCount("ADMIN-employees", adminA, "employees", "true", 4);
expectCount("ADMIN-trips", adminA, "trips", "true", 3);
expectCount("ADMIN-invoices", adminA, "invoices", "true", 4);
expectCount("ADMIN-lines", adminA, "invoice_lines", "true", 4);
expectCount("ADMIN-vehicles", adminA, "vehicles", "true", 6);
expectCount("ADMIN-fuel", adminA, "fuel_fillups", "true", 3);
expectCount("ADMIN-drivers", adminA, "drivers", "true", 2);
expectCount("ADMIN-rates", adminA, "rate_cards", "true", 3);
expectCount("ADMIN-passengers", adminA, "trip_passengers", "true", 3);
expectCount("ADMIN-attendance", adminA, "attendance_events", "true", 2);
expectCount("ADMIN-qr", adminA, "qr_tokens", "true", 2);

expectCount("DRIVER-invoices", driverA, "invoices", "true", 0);
expectCount("DRIVER-lines", driverA, "invoice_lines", "true", 0);
expectCount("DRIVER-drivers", driverA, "drivers", "true", 1);
expectCount("DRIVER-vehicles", driverA, "vehicles", "true", 3);
expectCount("DRIVER-fuel", driverA, "fuel_fillups", "true", 2);
expectCount("DRIVER-trips", driverA, "trips", "true", 3);
expectCount("DRIVER-rates-org", driverA, "rate_cards", "company_id is null", 0);
expectCount("DRIVER-rates-company", driverA, "rate_cards", "company_id is not null", 2);
expectCount("DRIVER-passengers", driverA, "trip_passengers", "true", 3);
expectCount("DRIVER-qr", driverA, "qr_tokens", "true", 2);

expectCount("EMP-invoices", employeeA, "invoices", "true", 0);
expectCount("EMP-trips", employeeA, "trips", "true", 3);
expectCount("EMP-own-employee", employeeA, "employees", `id = '${employeeRow}'`, 1);
expectCount("EMP-vehicles", employeeA, "vehicles", "true", 6);

expectCount("DISP-invoices", dispatcher, "invoices", "true", 4);
expectCount("DISP-trips", dispatcher, "trips", "true", 3);
expectCount("DISP-vehicles", dispatcher, "vehicles", "true", 6);
expectCount("SUP-invoices", supervisorA, "invoices", "true", 4);
expectCount("SUP-rates-org", supervisorA, "rate_cards", "company_id is null", 0);
expectCount("SUP-vehicles", supervisorA, "vehicles", "true", 6);
expectCount("SUP-passengers", supervisorA, "trip_passengers", "true", 3);

const billTo = psqlRaw(
  `insert into public.member_scopes (organisation_id, membership_id, company_id)
   values ('${ORG_A}', '${MEM_FRESH}', '${WCL}');`,
  { userId: adminA, allowError: true }
);
record(
  "SCOPE-bill-to-denied",
  !billTo.ok && billTo.err.includes("The bill-to company cannot be a company login scope."),
  billTo.err.split("\n").find((line) => line.includes("bill-to") || line.includes("ERROR")) ?? "no error"
);

const second = psqlRaw(
  `insert into public.member_scopes (organisation_id, membership_id, company_id)
   select m.organisation_id, m.id, '${C2}'::uuid
   from public.organisation_members m
   where m.user_id = '${cm1}' and m.organisation_id = '${ORG_A}';`,
  { userId: adminA, allowError: true }
);
record(
  "SCOPE-second-denied",
  !second.ok && second.err.includes("A company login can be linked to one company only."),
  second.err.split("\n").find((line) => line.includes("one company") || line.includes("ERROR")) ?? "no error"
);

function rpcFails(id, sql, needle) {
  const res = psqlRaw(sql, { userId: cm1, allowError: true });
  record(id, !res.ok && res.err.includes(needle), res.err.split("\n").find((line) => line.includes("ERROR")) ?? "no error");
}

rpcFails(
  "RPC-driver-weekly",
  `select public.generate_driver_weekly_invoice('${ORG_A}', '${driverRow}', '2026-10-05'::date, '2026-10-11'::date);`,
  "Not authorised"
);
rpcFails(
  "RPC-period",
  `select public.generate_period_invoice('${ORG_A}', '${C1}', '2026-11-02'::date, '2026-11-09'::date);`,
  "Not authorised"
);
rpcFails(
  "RPC-void",
  `select public.set_invoice_status('${INV_DRAFT}', 'void');`,
  "Not authorised"
);
rpcFails(
  "RPC-paid",
  `select public.set_invoice_status('a0000000-0000-4000-8000-000000000401', 'paid');`,
  "Not authorised"
);
rpcFails(
  "RPC-line-edit",
  `select public.update_draft_invoice_line('${LINE_FUEL}', 'Edited', 1, 9);`,
  "Not authorised"
);

const adminPaid = psqlRaw(
  `select public.set_invoice_status('${INV_DRAFT}', 'issued');`,
  { userId: adminA, allowError: true }
);
record("RPC-admin-issue-still-works", adminPaid.ok, adminPaid.err.split("\n").slice(-3).join(" "));

psqlAdminFile(MIGRATION);
expectCount("IDEMPOTENT-cm1-companies", cm1, "companies", "true", 1);
expectCount("IDEMPOTENT-cm1-invoices", cm1, "invoices", "true", 2);
const triggerCount = psqlAdmin(
  `select count(*)::text from pg_trigger where tgname = 'member_scopes_guard_company_manager' and not tgisinternal;`
);
record("IDEMPOTENT-trigger", triggerCount === "1", `triggers=${triggerCount}`);

const failed = results.filter((row) => !row.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
