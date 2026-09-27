#!/usr/bin/env node
/**
 * Admin capture RLS: drivers & vehicles create/update by role.
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
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverAUser = "a0000000-0000-4000-8000-000000000012";
const employeeA = "a0000000-0000-4000-8000-000000000013";
const adminB = "b0000000-0000-4000-8000-000000000011";
const driverAId = "a0000000-0000-4000-8000-000000000201";
const V1 = "a0000000-0000-4000-8000-000000000601";

const results = [];

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psqlRaw(sql, { userId, allowError = false } = {}) {
  const body = `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${sql}\nCOMMIT;`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout);
  }
  return { ok: res.status === 0, out: (res.stdout ?? "").trim() };
}

function psqlAs(userId, sql) {
  return psqlRaw(sql, { userId }).out.split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAsExpectFail(userId, sql) {
  return psqlRaw(sql, { userId, allowError: true }).ok === false;
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

function psqlService(sql) {
  const body = `BEGIN;\nSET LOCAL ROLE service_role;\n${sql}\nCOMMIT;`;
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}

for (const f of ["00044_admin_capture_fields.sql", "00046_fleet_audited_writes.sql"]) {
  const mig = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(ROOT, "supabase/migrations", f)],
    { encoding: "utf8" }
  );
  record(`MIG-${f}`, mig.status === 0, `re-apply ${f}`);
}

const newDriverId = "a0000000-0000-4000-8000-000000000210";
psqlAdmin(`delete from public.drivers where id = '${newDriverId}';`);

record(
  "CAP-driver-direct-insert-denied",
  psqlAsExpectFail(
    adminA,
    `insert into public.drivers (id, organisation_id, full_name, status)
     values ('${newDriverId}', '${ORG_A}', 'Capture Test Driver', 'active');`
  ),
  "direct insert blocked"
);

const rpcDriverId = psqlService(`
  select public.save_driver_capture(
    '${adminA}', '${ORG_A}', null,
    '{"full_name":"Capture Test Driver","status":"active"}'::jsonb
  )::text;
`);
record(
  "CAP-driver-admin-create-rpc",
  /^[0-9a-f-]{36}$/.test(rpcDriverId),
  `id=${rpcDriverId}`
);

record(
  "CAP-driver-direct-update-denied",
  psqlAs(
    adminA,
    `update public.drivers set phone = '0820000000' where id = '${driverAId}' and organisation_id = '${ORG_A}' returning id;`
  ) === "",
  "direct update affects 0 rows"
);

record(
  "CAP-driver-admin-update-rpc",
  psqlService(`
    select public.save_driver_capture(
      '${adminA}', '${ORG_A}', '${driverAId}',
      '{"full_name":"Org A Driver","phone":"0820000000","status":"active"}'::jsonb
    )::text;
  `) === driverAId,
  "RPC update driver in org A"
);

record(
  "CAP-driver-role-create-denied",
  psqlAsExpectFail(
    driverAUser,
    `insert into public.drivers (organisation_id, full_name, status)
     values ('${ORG_A}', 'Hack Driver', 'active');`
  ),
  "driver role cannot insert drivers"
);

record(
  "CAP-employee-create-denied",
  psqlAsExpectFail(
    employeeA,
    `insert into public.drivers (organisation_id, full_name, status)
     values ('${ORG_A}', 'Hack Driver 2', 'active');`
  ),
  "employee cannot insert drivers"
);

const crossDriverUpdate = psqlAs(
  adminB,
  `update public.drivers set phone = '999' where id = '${driverAId}' returning id;`
);
const driverPhone = psqlAdmin(
  `select coalesce(phone, '') from public.drivers where id = '${driverAId}';`
);
record(
  "CAP-driver-cross-org-update-denied",
  crossDriverUpdate === "" && driverPhone !== "999",
  `returned=${crossDriverUpdate || "none"} phone=${driverPhone}`
);

const newVehicleId = "a0000000-0000-4000-8000-000000000610";
psqlAdmin(`delete from public.vehicles where id = '${newVehicleId}';`);

record(
  "CAP-vehicle-direct-insert-denied",
  psqlAsExpectFail(
    adminA,
    `insert into public.vehicles (id, organisation_id, name, vehicle_type, status, vin, engine_number)
     values ('${newVehicleId}', '${ORG_A}', 'Capture Van', 'other', 'active', 'VIN123', 'ENG456');`
  ),
  "direct vehicle insert blocked"
);

const rpcVehicleId = psqlService(`
  select public.save_vehicle_capture(
    '${adminA}', '${ORG_A}', null,
    '{"name":"Capture Van","vehicle_type":"other","status":"active","vin":"VIN123","engine_number":"ENG456"}'::jsonb
  )::text;
`);
record(
  "CAP-vehicle-admin-create-rpc",
  /^[0-9a-f-]{36}$/.test(rpcVehicleId),
  `id=${rpcVehicleId}`
);

record(
  "CAP-vehicle-direct-update-denied",
  psqlAs(
    adminA,
    `update public.vehicles set make = 'Toyota' where id = '${V1}' and organisation_id = '${ORG_A}' returning id;`
  ) === "",
  "direct vehicle update affects 0 rows"
);

record(
  "CAP-vehicle-admin-update-rpc",
  psqlService(`
    select public.save_vehicle_capture(
      '${adminA}', '${ORG_A}', '${V1}',
      '{"name":"Compliance Van 1","make":"Toyota","vehicle_type":"van","status":"active"}'::jsonb
    )::text;
  `) === V1,
  "RPC update vehicle in org A"
);

record(
  "CAP-vehicle-driver-create-denied",
  psqlAsExpectFail(
    driverAUser,
    `insert into public.vehicles (organisation_id, name, vehicle_type, status)
     values ('${ORG_A}', 'Hack Van', 'other', 'active');`
  ),
  "driver cannot insert vehicles"
);

const crossVehicleUpdate = psqlAs(
  adminB,
  `update public.vehicles set make = 'Hacked' where id = '${V1}' returning id;`
);
const vehicleMake = psqlAdmin(
  `select coalesce(make, '') from public.vehicles where id = '${V1}';`
);
record(
  "CAP-vehicle-cross-org-denied",
  crossVehicleUpdate === "" && vehicleMake !== "Hacked",
  `returned=${crossVehicleUpdate || "none"} make=${vehicleMake}`
);

console.log("\n--- Admin capture RLS summary ---");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.id}\t${r.evidence}`);
}
