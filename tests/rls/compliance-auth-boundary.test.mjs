#!/usr/bin/env node
/**
 * Auth boundary: drivers:manage / vehicles:manage vs compliance document image access.
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
const supervisorA = "a0000000-0000-4000-8000-000000000018";
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

function psqlServiceExpectFail(sql) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-c", `BEGIN; SET ROLE service_role; ${sql}; COMMIT;`],
    { encoding: "utf8" }
  );
  return res.status !== 0;
}

for (const f of [
  "00044_admin_capture_fields.sql",
  "00045_mandatory_audit_auth_retention.sql",
]) {
  const idem = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(ROOT, "supabase/migrations", f)],
    { encoding: "utf8" }
  );
  record(`MIG-${f}`, idem.status === 0, `re-apply ${f}`);
}

const supervisorCaptureId = psqlService(`
  select public.save_driver_capture(
    '${supervisorA}', '${ORG_A}', null,
    '{"full_name":"Supervisor Captured Driver 2","status":"active"}'::jsonb
  )::text;
`);
record(
  "AUTH-supervisor-capture",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(supervisorCaptureId),
  `id=${supervisorCaptureId}`
);

const docPath = `${ORG_A}/drivers/${driverAId}/supervisor-boundary.jpg`;
psqlAdmin(`
  insert into storage.objects (bucket_id, name) values ('vehicle-docs', '${docPath}')
  on conflict do nothing;
`);
psqlService(`
  select public.register_compliance_document(
    '${adminA}', '${ORG_A}', 'driver', '${driverAId}', 'driver_licence', 'single',
    '${docPath}', 'x.jpg', 'image/jpeg', 100, 'bound', 'admin', 'accepted'
  );
`);

const supervisorDocRows = psqlAs(
  supervisorA,
  `select count(*)::text from public.driver_documents where driver_id = '${driverAId}' and deleted_at is null;`
);
record(
  "AUTH-supervisor-no-doc-select",
  supervisorDocRows === "0",
  `supervisor document rows visible=${supervisorDocRows}`
);

record(
  "AUTH-cross-org-capture",
  psqlServiceExpectFail(`
    select public.save_driver_capture(
      '${supervisorA}', '${ORG_B}', null,
      '{"full_name":"Cross Org Driver","status":"active"}'::jsonb
    );
  `),
  "supervisor cannot capture into org B"
);

psqlAdmin(`
  update public.drivers set deleted_at = timezone('utc', now()) where id = '${driverAId}';
`);
const deletedPath = `${ORG_A}/drivers/${driverAId}/deleted-subject.jpg`;
psqlAdmin(`
  insert into storage.objects (bucket_id, name) values ('vehicle-docs', '${deletedPath}')
  on conflict do nothing;
`);
record(
  "AUTH-deleted-driver-no-upload",
  psqlServiceExpectFail(`
    select public.register_compliance_document(
      '${adminA}', '${ORG_A}', 'driver', '${driverAId}', 'driver_licence', 'single',
      '${deletedPath}', 'x.jpg', 'image/jpeg', 100, 'del', 'admin', 'accepted'
    );
  `),
  "soft-deleted driver rejects register"
);
psqlAdmin(`
  update public.drivers set deleted_at = null where id = '${driverAId}';
`);

psqlAdmin(`
  update public.vehicles set deleted_at = timezone('utc', now()) where id = '${V1}';
`);
const vDeletedPath = `${ORG_A}/vehicles/${V1}/deleted-vehicle.jpg`;
psqlAdmin(`
  insert into storage.objects (bucket_id, name) values ('vehicle-docs', '${vDeletedPath}')
  on conflict do nothing;
`);
record(
  "AUTH-deleted-vehicle-no-upload",
  psqlServiceExpectFail(`
    select public.register_compliance_document(
      '${adminA}', '${ORG_A}', 'vehicle', '${V1}', 'license_disk', 'single',
      '${vDeletedPath}', 'x.jpg', 'image/jpeg', 100, 'vdel', 'admin', 'accepted'
    );
  `),
  "soft-deleted vehicle rejects register"
);
psqlAdmin(`
  update public.vehicles set deleted_at = null where id = '${V1}';
`);

console.log("\n--- Auth boundary summary ---");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.id}\t${r.evidence}`);
}
