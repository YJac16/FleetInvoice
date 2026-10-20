#!/usr/bin/env node
/**
 * Driver trip + passenger RLS privacy (00061).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000012";
const driverBUser = "a0000000-0000-4000-8000-000000000019";
const dispatcher = "d1000000-0000-4000-8000-000000000024";
const supervisorA = "a0000000-0000-4000-8000-000000000018";
const driverRowA = "a0000000-0000-4000-8000-000000000201";
const driverRowB = "a0000000-0000-4000-8000-000000000202";
const C1 = "a0000000-0000-4000-8000-000000000101";
const C2 = "a0000000-0000-4000-8000-000000000102";
const T_A = "f1000000-0000-4000-8000-000000000401";
const T_B = "f1000000-0000-4000-8000-000000000402";
const P_A = "f1000000-0000-4000-8000-000000000501";
const P_B = "f1000000-0000-4000-8000-000000000502";
const TA_A = "f1000000-0000-4000-8000-000000000601";
const TA_B = "f1000000-0000-4000-8000-000000000602";
const MEM_DRV_B = "f1000000-0000-4000-8000-000000000701";
const MEM_DISP = "f1000000-0000-4000-8000-000000000702";
const TE_A = "f1000000-0000-4000-8000-000000000801";
const TE_B = "f1000000-0000-4000-8000-000000000802";

const results = [];

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psqlRaw(sql, { userId } = {}) {
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
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return (res.stdout ?? "").trim();
}

function psqlAs(userId, sql) {
  return psqlRaw(sql, { userId }).split("\n").filter(Boolean).at(-1) ?? "";
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
  return (res.stdout ?? "").trim();
}

psqlAdmin(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${dispatcher}', 'authenticated', 'authenticated',
   'dispatcher.privacy@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Dispatcher Privacy"}')
on conflict (id) do nothing;

insert into public.organisation_members (id, organisation_id, user_id, role, status)
values ('${MEM_DISP}', '${ORG_A}', '${dispatcher}', 'dispatcher', 'active')
on conflict (id) do nothing;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${driverBUser}', 'authenticated', 'authenticated',
   'driverb.privacy@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Driver B"}')
on conflict (id) do nothing;

insert into public.organisation_members (id, organisation_id, user_id, role, status)
values ('${MEM_DRV_B}', '${ORG_A}', '${driverBUser}', 'driver', 'active')
on conflict (id) do nothing;

insert into public.drivers (id, organisation_id, profile_id, full_name, status)
values ('${driverRowB}', '${ORG_A}', '${driverBUser}', 'Driver B Privacy', 'active')
on conflict (id) do nothing;

insert into public.trips (
  id, organisation_id, company_id, route_id, is_staff_transport, area_text, planned_start, status
)
values
  ('${T_A}', '${ORG_A}', '${C1}', null, true, 'Route A', '2026-11-01T08:00:00Z', 'completed'),
  ('${T_B}', '${ORG_A}', '${C2}', null, true, 'Route B', '2026-11-01T09:00:00Z', 'completed')
on conflict (id) do nothing;

insert into public.trip_passengers (id, organisation_id, trip_id, employee_id, status)
values
  ('${P_A}', '${ORG_A}', '${T_A}', (select id from public.employees where organisation_id = '${ORG_A}' limit 1), 'confirmed'),
  ('${P_B}', '${ORG_A}', '${T_B}', (select id from public.employees where organisation_id = '${ORG_A}' limit 1), 'confirmed')
on conflict (id) do nothing;

insert into public.trip_assignments (id, organisation_id, trip_id, driver_id, vehicle_id)
values
  ('${TA_A}', '${ORG_A}', '${T_A}', '${driverRowA}', (select id from public.vehicles where organisation_id = '${ORG_A}' limit 1)),
  ('${TA_B}', '${ORG_A}', '${T_B}', '${driverRowB}', (select id from public.vehicles where organisation_id = '${ORG_A}' offset 1 limit 1))
on conflict (id) do nothing;

insert into public.trip_events (id, organisation_id, trip_id, event_type, notes)
values
  ('${TE_A}', '${ORG_A}', '${T_A}', 'completed', 'Trip A event'),
  ('${TE_B}', '${ORG_A}', '${T_B}', 'completed', 'Trip B event')
on conflict (id) do nothing;
`);

function expectCount(id, userId, table, where, expected) {
  const actual = count(userId, table, where);
  record(id, actual === expected, `${table} ${actual} expected ${expected}`);
}

expectCount("DRV-A-trips", driverA, "trips", `organisation_id = '${ORG_A}'`, 1);
record(
  "DRV-A-sees-TA",
  psqlAs(driverA, `select id::text from public.trips where id = '${T_A}';`) === T_A,
  "assigned trip visible"
);
record(
  "DRV-A-not-TB",
  psqlAs(driverA, `select count(*)::text from public.trips where id = '${T_B}';`) === "0",
  "other driver trip hidden"
);

expectCount("DRV-B-trips", driverBUser, "trips", `organisation_id = '${ORG_A}'`, 1);
record(
  "DRV-B-sees-TB",
  psqlAs(driverBUser, `select id::text from public.trips where id = '${T_B}';`) === T_B,
  "assigned trip visible"
);

expectCount("DRV-A-passengers", driverA, "trip_passengers", `organisation_id = '${ORG_A}'`, 1);
expectCount("DRV-B-passengers", driverBUser, "trip_passengers", `organisation_id = '${ORG_A}'`, 1);

expectCount("ADMIN-trips", adminA, "trips", `organisation_id = '${ORG_A}'`, 2);
expectCount("DISP-trips", dispatcher, "trips", `organisation_id = '${ORG_A}'`, 2);
expectCount("SUP-trips", supervisorA, "trips", `organisation_id = '${ORG_A}'`, 2);

expectCount("ADMIN-passengers", adminA, "trip_passengers", `organisation_id = '${ORG_A}'`, 2);

expectCount("DRV-A-assignments", driverA, "trip_assignments", `organisation_id = '${ORG_A}'`, 1);
expectCount("DRV-B-assignments", driverBUser, "trip_assignments", `organisation_id = '${ORG_A}'`, 1);
record(
  "DRV-A-not-TA-B",
  psqlAs(driverA, `select count(*)::text from public.trip_assignments where id = '${TA_B}';`) === "0",
  "other driver assignment hidden"
);

expectCount("DRV-A-events", driverA, "trip_events", `organisation_id = '${ORG_A}'`, 1);
expectCount("DRV-B-events", driverBUser, "trip_events", `organisation_id = '${ORG_A}'`, 1);
record(
  "DRV-A-not-TE-B",
  psqlAs(driverA, `select count(*)::text from public.trip_events where id = '${TE_B}';`) === "0",
  "other driver trip event hidden"
);

console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed`);
