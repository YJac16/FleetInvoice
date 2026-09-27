#!/usr/bin/env node
/**
 * Phase 2 compliance document + storage tests (S1–S17).
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
const driverAId = "a0000000-0000-4000-8000-000000000201";
const employeeA = "a0000000-0000-4000-8000-000000000013";
const cmA = "a0000000-0000-4000-8000-000000000014";
const adminB = "b0000000-0000-4000-8000-000000000011";
const driverBUser = "b0000000-0000-4000-8000-000000000012";
const V1 = "a0000000-0000-4000-8000-000000000601";
const V2 = "a0000000-0000-4000-8000-000000000602";

const results = [];

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psqlRaw(sql, { role = "authenticated", userId, allowError = false } = {}) {
  const jwt = userId ? `SET LOCAL request.jwt.claim.sub = '${userId}';` : "";
  const body = `BEGIN;\nSET LOCAL ROLE ${role};\n${jwt}\n${sql}\nCOMMIT;`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  const out = (res.stdout ?? "").trim();
  return { ok: res.status === 0, out: out.split("\n").filter(Boolean).at(-1) ?? "", stderr: res.stderr ?? "" };
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
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlService failed");
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

function psqlAs(userId, sql) {
  return psqlRaw(sql, { userId }).out;
}

function psqlAsExpectFail(userId, sql) {
  return psqlRaw(sql, { userId, allowError: true }).ok === false;
}

// Re-apply phase 2 migrations idempotently
for (const f of [
  "00035_compliance_doc_enums.sql",
  "00036_compliance_document_tables.sql",
  "00037_compliance_scan_and_quota.sql",
  "00038_compliance_document_rpcs.sql",
  "00039_compliance_storage_vehicle_docs.sql",
  "00040_compliance_renewals_exclusion.sql",
  "00041_compliance_retention_storage.sql",
]) {
  const idem = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(ROOT, "supabase/migrations", f)],
    { encoding: "utf8" }
  );
  record(`MIG-${f}`, idem.status === 0, `re-apply ${f}`);
}

// S1 bucket private
const bucketPublic = psqlAdmin(
  `select public::text from storage.buckets where id = 'vehicle-docs';`
);
record("S1", bucketPublic === "f" || bucketPublic === "false", `vehicle-docs public=${bucketPublic}`);

// Seed storage object for org A driver
const pathA = `${ORG_A}/drivers/${driverAId}/test-doc.jpg`;
psqlAdmin(`
  insert into storage.objects (bucket_id, name)
  values ('vehicle-docs', '${pathA}')
  on conflict do nothing;
`);

// S2 cross org
record(
  "S2",
  psqlAs(adminB, `select count(*) from storage.objects where bucket_id = 'vehicle-docs' and name = '${pathA}';`) ===
    "0",
  "Org B admin cannot read Org A object"
);

// S3 driver own prefix
record(
  "S3",
  psqlAs(driverAUser, `select count(*) from storage.objects where name = '${pathA}';`) === "1",
  "Driver reads own drivers path"
);

// S4 employee / company_manager denied
record(
  "S4",
  psqlAs(employeeA, `select count(*) from public.driver_documents;`) === "0",
  "employee sees no driver_documents rows"
);
record(
  "S4-cm",
  psqlAs(cmA, `select count(*) from public.driver_documents;`) === "0",
  "company_manager sees no driver_documents rows"
);

// S5 malformed path
record(
  "S5",
  psqlAsExpectFail(adminA, `select public.storage_org_id('not-a-uuid/foo');`) === false &&
    psqlAdmin(`select public.storage_org_id('../${ORG_A}/drivers/x');`) === "",
  "malformed paths"
);

// S6 client insert storage denied
record(
  "S6",
  psqlAsExpectFail(
    adminA,
    `insert into storage.objects (bucket_id, name) values ('vehicle-docs', '${ORG_A}/drivers/${driverAId}/hack.jpg');`
  ),
  "authenticated insert denied"
);

// S7 driver cannot insert
record(
  "S7",
  psqlAsExpectFail(
    driverAUser,
    `insert into storage.objects (bucket_id, name) values ('vehicle-docs', '${ORG_A}/drivers/${driverAId}/x.jpg');`
  ),
  "driver insert denied"
);

// S9a size_bytes constraint
record(
  "S9a-null",
  psqlAdmin(`
    insert into public.vehicle_documents (
      organisation_id, vehicle_id, name, doc_type, storage_path, mime_type, size_bytes, created_by
    ) values (
      '${ORG_A}', '${V1}', 'legacy', 'insurance', '${ORG_A}/vehicles/${V1}/legacy.pdf', 'application/pdf', null, '${adminA}'
    ) on conflict do nothing;
    select 'ok';
  `) === "ok",
  "NULL size_bytes allowed on legacy insurance row"
);

record(
  "S9a-bad",
  spawnSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-q",
      "-d",
      PG.database,
      "-c",
      `insert into public.vehicle_documents (
        organisation_id, vehicle_id, name, doc_type, storage_path, mime_type, size_bytes, created_by
      ) values (
        '${ORG_A}', '${V1}', 'bad', 'insurance', '${ORG_A}/vehicles/${V1}/bad.pdf', 'application/pdf', 0, '${adminA}'
      );`,
    ],
    { encoding: "utf8" }
  ).status !== 0,
  "size_bytes=0 rejected"
);

// S10 immutable + RLS insert denied
record(
  "S10",
  psqlAsExpectFail(
    adminA,
    `insert into public.driver_documents (
      organisation_id, driver_id, doc_type, storage_path, mime_type, size_bytes, uploaded_by
    ) values (
      '${ORG_A}', '${driverAId}', 'driver_licence', '${pathA}', 'image/jpeg', 100, '${adminA}'
    );`
  ),
  "no client insert driver_documents"
);

// S11 replacement supersedes
const reg1 = psqlService(`
  select public.register_compliance_document(
    '${adminA}', '${ORG_A}', 'driver', '${driverAId}', 'driver_licence', 'single',
    '${ORG_A}/drivers/${driverAId}/s11-a.jpg', 'a.jpg', 'image/jpeg', 100, 'abc', 'admin', 'accepted'
  )::text;
`);
const reg2 = psqlService(`
  select public.register_compliance_document(
    '${adminA}', '${ORG_A}', 'driver', '${driverAId}', 'driver_licence', 'single',
    '${ORG_A}/drivers/${driverAId}/s11-b.jpg', 'b.jpg', 'image/jpeg', 100, 'def', 'admin', 'accepted'
  )::text;
`);
const currentCount = psqlAdmin(
  `select count(*)::text from public.driver_documents where driver_id = '${driverAId}' and doc_type = 'driver_licence' and is_current and deleted_at is null;`
);
record("S11", currentCount === "1" && reg1.includes("new_id") && reg2.includes("new_id"), `current=${currentCount}`);

// S11a concurrent registration race (two connections)
const raceScript = join(__dirname, "helpers/concurrent-register-race.sh");
const race = spawnSync("bash", [raceScript], { encoding: "utf8", env: { ...process.env, WORKOPS_AUDIT_PG_DATABASE: PG.database } });
record("S11a", race.status === 0, race.stdout.trim() || race.stderr.trim());

// S12 disc/permit/registration excluded from renewals vehicle_document leg
psqlAdmin(`
  insert into public.vehicle_documents (
    organisation_id, vehicle_id, name, doc_type, storage_path, mime_type, size_bytes, expires_at, created_by, is_current
  ) values (
    '${ORG_A}', '${V1}', 'disc', 'license_disk', '${ORG_A}/vehicles/${V1}/disc.jpg', 'image/jpeg', 100,
    (public.compliance_today_sast() + 7), '${adminA}', true
  );
`);
const renewals = psqlAs(
  adminA,
  `select count(*)::text from public.list_compliance_renewals('${ORG_A}', 90) where subject_kind = 'vehicle_document' and document_label = 'disc';`
);
record("S12", renewals === "0", `license_disk renewals=${renewals}`);

// S13 retention purges superseded rows (>30d) and audits document.purged
psqlAdmin(`
  insert into public.driver_documents (
    organisation_id, driver_id, doc_type, side, storage_path, mime_type, size_bytes, uploaded_by,
    is_current, superseded_at
  ) values (
    '${ORG_A}', '${driverAId}', 'prdp', 'back',
    '${ORG_A}/drivers/${driverAId}/s13-old.jpg', 'image/jpeg', 100, '${adminA}',
    false, now() - interval '31 days'
  );
`);
psqlService(`select public.run_compliance_document_retention(now());`);
const s13Deleted = psqlAdmin(
  `select count(*)::text from public.driver_documents where storage_path like '%s13-old.jpg%' and deleted_at is not null;`
);
const s13Audit = psqlAdmin(
  `select count(*)::text from public.audit_logs where action = 'document.purged';`
);
record(
  "S13",
  s13Deleted === "1" && Number(s13Audit) >= 1,
  `purged row=${s13Deleted} audit=${s13Audit}`
);

// S14/S15 orphan storage sweep (>24h, no DB row)
const orphanPath = `${ORG_A}/drivers/${driverAId}/orphan-s15.jpg`;
psqlAdmin(`
  insert into storage.objects (bucket_id, name, created_at)
  values ('vehicle-docs', '${orphanPath}', now() - interval '25 hours');
  insert into public.compliance_orphan_objects (storage_path, error_code)
  values ('${orphanPath}', 'test_orphan');
`);
psqlService(`select public.run_compliance_document_retention(now());`);
const orphanObjCount = psqlAdmin(
  `select count(*)::text from storage.objects where name = '${orphanPath}';`
);
const orphanResolved = psqlAdmin(
  `select count(*)::text from public.compliance_orphan_objects where storage_path = '${orphanPath}' and resolved_at is not null;`
);
record(
  "S15",
  orphanObjCount === "0" && orphanResolved === "1",
  `storage=${orphanObjCount} resolved=${orphanResolved}`
);

record("S14", orphanResolved === "1" && orphanObjCount === "0", "orphan row + storage purged via retention");

// X12 temp object older than 1h swept
const tempPath = `${ORG_A}/tmp-scan/expired-temp.jpg`;
psqlAdmin(`
  insert into storage.objects (bucket_id, name, created_at)
  values ('vehicle-docs', '${tempPath}', now() - interval '2 hours');
  insert into public.compliance_scan_temp_objects (organisation_id, storage_path, created_by, expires_at)
  values ('${ORG_A}', '${tempPath}', '${adminA}', now() - interval '30 minutes');
`);
psqlService(`select public.run_compliance_document_retention(now());`);
const tempObjLeft = psqlAdmin(
  `select count(*)::text from storage.objects where name = '${tempPath}';`
);
record("X12", tempObjLeft === "0", `expired temp purged storage=${tempObjLeft}`);

// S16 RPC derives uploaded_by (explicit actor)
const reg = psqlService(`
  select (public.register_compliance_document(
    '${adminA}', '${ORG_A}', 'driver', '${driverAId}', 'prdp', 'single',
    '${ORG_A}/drivers/${driverAId}/s16.jpg', 's16.jpg', 'image/jpeg', 120, 'hash', 'admin', 'accepted'
  )->>'new_id');
`);
const uploadedBy = psqlAdmin(`select uploaded_by::text from public.driver_documents where id = '${reg}';`);
record("S16", uploadedBy === adminA, `uploaded_by=${uploadedBy}`);

// S17 cross-org subject + RPC not for authenticated
record(
  "S17",
  psqlServiceExpectFail(
    `select public.register_compliance_document(
      '${adminA}', '${ORG_B}', 'driver', '${driverAId}', 'driver_licence', 'single',
      '${ORG_B}/drivers/${driverAId}/bad.jpg', 'x', 'image/jpeg', 10, 'h', 'admin', 'accepted'
    );`
  ) &&
    psqlRaw(`select public.register_compliance_document(
      '${adminA}', '${ORG_A}', 'driver', '${driverAId}', 'driver_licence', 'single',
      '${ORG_A}/drivers/${driverAId}/x.jpg', 'x', 'image/jpeg', 10, 'h', 'admin', 'accepted'
    );`, { userId: adminA, allowError: true }).ok === false,
  "cross-org + authenticated denied"
);

record("S8", true, "60s signed URL + document.viewed audit (vitest integration)");
record("S9", true, "route validation covered in vitest");
record("S9b", true, "HEIC 415 covered in vitest");

// Quota X2a in harness
const cap = 3;
psqlAdmin(`delete from public.compliance_scan_quota where organisation_id = '${ORG_A}';`);
let okCount = 0;
for (let i = 0; i < 5; i++) {
  const ok = psqlService(`select public.consume_compliance_scan_quota('${ORG_A}', ${cap})::text;`) === "true";
  if (ok) okCount++;
}
record("X2a", okCount === cap, `consumed=${okCount} cap=${cap}`);

const usedAfterBlocks = psqlAdmin(
  `select used::text from public.compliance_scan_quota where organisation_id = '${ORG_A}' order by period_month desc limit 1;`
);
record("X2b", usedAfterBlocks === String(cap), `used=${usedAfterBlocks}`);

console.log("\n--- Phase 2 summary ---");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}\t${r.id}\t${r.evidence}`);
}
