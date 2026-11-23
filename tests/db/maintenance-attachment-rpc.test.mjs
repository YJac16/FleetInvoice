#!/usr/bin/env node
/**
 * Fleet maintenance Drop 1 (U3) — 00075: workshop-bills bucket and
 * set_workshop_bill_attachment.
 *
 * Covers: private bucket shape (10 MB, pdf/jpeg/png/webp), no client storage
 * policies for the bucket, service_role-only grants, set/replace/clear with
 * audit rows, approved bills refused, cross-org bill refused, path must sit
 * under {org}/{bill}/ with the right extension, bad mime/size refused,
 * non-permitted roles and non-entitled orgs refused.
 *
 * Local Postgres only (workops_audit). Never points at a hosted project.
 * Run: npm run test:maintenance-attachment-rpc
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIG_74 = join(root, "supabase/migrations/00074_maintenance_rpcs.sql");
const MIGRATION = join(root, "supabase/migrations/00075_maintenance_storage.sql");
const sql = readFileSync(MIGRATION, "utf8");
const SIG = "uuid, uuid, uuid, text, text, integer";

let failures = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failures += 1;
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

const sqlCode = sql.replace(/--.*$/gm, "");
check(
  "static revoked from public, anon, authenticated",
  sqlCode.includes(`revoke all on function public.set_workshop_bill_attachment(${SIG})\n  from public, anon, authenticated;`)
);
check("static granted to service_role", sqlCode.includes(`grant execute on function public.set_workshop_bill_attachment(${SIG})\n  to service_role;`));
check(
  "static definer fn pins search_path",
  (sqlCode.match(/security definer/g) ?? []).length ===
    (sqlCode.match(/security definer\s+set search_path = pg_catalog, public/g) ?? []).length
);
check("static no storage policies (service role only)", !/\b(create|drop|alter) policy\b/i.test(sqlCode));
check("static no invoice / rate card references", !/\b(invoices|invoice_lines|rate_cards)\b/.test(sqlCode));
check("static writes audit log", /write_audit_log\(/.test(sqlCode));

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Local DB
// ---------------------------------------------------------------------------

const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
  const b = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], { encoding: "utf8" });
  if (b.status !== 0) {
    console.error("FAIL integration — bootstrap-native.sh failed");
    console.error(b.stderr || b.stdout);
    process.exit(1);
  }
}

function psqlRaw(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    err: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}
function psqlAdmin(body) {
  const r = psqlRaw(body);
  if (!r.ok) throw new Error(r.err);
  return r.out;
}
function asService(body) {
  return psqlRaw(`BEGIN;\nSET LOCAL ROLE service_role;\n${body}\nCOMMIT;`);
}
function expectError(name, res, code) {
  check(name, !res.ok && res.err.includes(code), res.ok ? `succeeded: ${res.out}` : res.err.trim().split("\n")[0]);
}

// bootstrap-native.sh grants EXECUTE on all public functions to authenticated
// after the migrations run. Re-apply 00074 and 00075 so their revokes are what
// we test.
for (const f of [MIG_74, MIGRATION]) {
  const r = spawnSync("sudo", ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", f], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(`FAIL re-apply ${f}`, r.stderr);
    process.exit(1);
  }
}

// Seeded by scripts/local-db/seed-audit-fixtures.sql
const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const platformOwner = "f0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000012";
const companyManagerA = "a0000000-0000-4000-8000-000000000014";
const adminB = "b0000000-0000-4000-8000-000000000011";

// Added here
const managerA = "e7500000-0000-4000-8000-000000000001";
const dispatcherA = "e7500000-0000-4000-8000-000000000002";
const PLAN = "e7500000-0000-4000-8000-000000000901";

psqlAdmin(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${managerA}', 'authenticated', 'authenticated',
   'manager.matt@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Manager A"}'),
  ('00000000-0000-0000-0000-000000000000', '${dispatcherA}', 'authenticated', 'authenticated',
   'dispatcher.matt@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Dispatcher A"}')
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status)
values ('${ORG_A}', '${managerA}', 'manager', 'active'), ('${ORG_A}', '${dispatcherA}', 'dispatcher', 'active')
on conflict do nothing;

insert into public.plans (id, code, name) values ('${PLAN}', 'matt-maint', 'Maintenance attachment test plan')
on conflict (id) do nothing;
insert into public.module_entitlements (plan_id, module_key) values ('${PLAN}', 'maintenance'), ('${PLAN}', 'core')
on conflict do nothing;
insert into public.subscriptions (organisation_id, plan_id, status) values ('${ORG_A}', '${PLAN}', 'active')
on conflict (organisation_id) do update set plan_id = excluded.plan_id, status = excluded.status;
delete from public.subscriptions s
using public.module_entitlements e
where s.organisation_id = '${ORG_B}' and e.plan_id = s.plan_id and e.module_key = 'maintenance';
`);

const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const u = (id) => (id ? `'${id}'::uuid` : "null::uuid");
const t = (s) => (s === null ? "null::text" : `'${String(s).replace(/'/g, "''")}'`);
const i = (n) => (n === null ? "null::integer" : String(n));

const svc = (fn, ...args) => asService(`select public.${fn}(${args.join(", ")})::text;`);
const setAtt = (actor, org, bill, path, mime, size) =>
  asService(`select coalesce(public.set_workshop_bill_attachment(${u(actor)}, ${u(org)}, ${u(bill)}, ${t(path)}, ${t(mime)}, ${i(size)}), '<null>');`);

const attRow = (bill) =>
  psqlAdmin(
    `select concat_ws('|', coalesce(attachment_path, 'null'), coalesce(attachment_mime, 'null'), coalesce(attachment_size::text, 'null'))
     from public.workshop_bills where id = '${bill}'`
  );
const auditCount = (bill, action, actor) =>
  Number(
    psqlAdmin(
      `select count(*)::text from public.audit_logs where entity_id = '${bill}' and action = '${action}'` +
        (actor ? ` and actor_id = '${actor}'` : "")
    )
  );

// Fixtures: supplier + draft bills in A, a bill in B.
const supA = svc("save_supplier", u(adminA), u(ORG_A), "null::uuid", j({ name: "MATT Workshop A" })).out;
const supB = svc("save_supplier", u(platformOwner), u(ORG_B), "null::uuid", j({ name: "MATT Workshop B" })).out;
const lines = [{ description: "Service", unit_amount: 100 }];
const billA = svc("save_workshop_bill", u(adminA), u(ORG_A), "null::uuid", j({ supplier_id: supA, bill_date: "2026-11-20", invoice_ref: "MATT-1", lines })).out;
const billA2 = svc("save_workshop_bill", u(adminA), u(ORG_A), "null::uuid", j({ supplier_id: supA, bill_date: "2026-11-20", invoice_ref: "MATT-2", lines })).out;
const billB = svc("save_workshop_bill", u(platformOwner), u(ORG_B), "null::uuid", j({ supplier_id: supB, bill_date: "2026-11-20", invoice_ref: "MATT-B", lines })).out;
check("F1 fixture bills created", [supA, supB, billA, billA2, billB].every((x) => /^[0-9a-f-]{36}$/.test(x)));

const P = (org, bill, ext, id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301") => `${org}/${bill}/${id}.${ext}`;

// ---------------------------------------------------------------------------
// Bucket
// ---------------------------------------------------------------------------

check(
  "B1 workshop-bills bucket private, 10 MB, pdf/jpeg/png/webp",
  psqlAdmin(
    `select concat_ws('|', public::text, file_size_limit::text, array_to_string(array(select unnest(allowed_mime_types) order by 1), ','))
     from storage.buckets where id = 'workshop-bills'`
  ) === "false|10485760|application/pdf,image/jpeg,image/png,image/webp"
);
check(
  "B2 no storage.objects policy mentions workshop-bills",
  psqlAdmin(
    `select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and (coalesce(qual, '') ilike '%workshop-bills%' or coalesce(with_check, '') ilike '%workshop-bills%')`
  ) === "0"
);

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

const priv = (role) =>
  psqlAdmin(`select has_function_privilege('${role}', 'public.set_workshop_bill_attachment(${SIG})', 'execute')::text`);
check("G1 not executable by anon", priv("anon") === "false");
check("G1 not executable by authenticated", priv("authenticated") === "false");
check("G1 executable by service_role", priv("service_role") === "true");
expectError(
  "G2 authenticated cannot call it directly",
  psqlRaw(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${adminA}';
     select public.set_workshop_bill_attachment('${adminA}'::uuid, '${ORG_A}'::uuid, '${billA}'::uuid, '${P(ORG_A, billA, "pdf")}', 'application/pdf', 100); COMMIT;`
  ),
  "permission denied"
);

// ---------------------------------------------------------------------------
// Set, replace, clear
// ---------------------------------------------------------------------------

const p1 = P(ORG_A, billA, "pdf");
const s1 = setAtt(adminA, ORG_A, billA, p1, "application/pdf", 2048);
check("S1 admin sets attachment, returns no previous path", s1.ok && s1.out === "<null>", s1.err);
check("S1 bill columns set", attRow(billA) === `${p1}|application/pdf|2048`, attRow(billA));
check("S1 attachment_set audit row", auditCount(billA, "workshop_bill.attachment_set", adminA) === 1);

const p2 = P(ORG_A, billA, "png", "9b2d6b8e-0a43-4f1e-8d7a-5c2b1e0f9a11");
const s2 = setAtt(managerA, ORG_A, billA, p2, "image/png", 4096);
check("S2 manager replaces attachment, returns previous path", s2.ok && s2.out === p1, s2.ok ? s2.out : s2.err);
check("S2 bill columns replaced", attRow(billA) === `${p2}|image/png|4096`);
check("S2 second attachment_set audit row (manager)", auditCount(billA, "workshop_bill.attachment_set", managerA) === 1);
check(
  "S2 audit metadata has previous_path",
  psqlAdmin(
    `select (metadata->>'previous_path') from public.audit_logs where entity_id = '${billA}' and action = 'workshop_bill.attachment_set' and actor_id = '${managerA}'`
  ) === p1
);

const s3 = setAtt(adminA, ORG_A, billA, null, null, null);
check("S3 clear with null returns previous path", s3.ok && s3.out === p2, s3.ok ? s3.out : s3.err);
check("S3 bill columns cleared", attRow(billA) === "null|null|null");
check("S3 attachment_cleared audit row", auditCount(billA, "workshop_bill.attachment_cleared", adminA) === 1);
expectError("S4 clear with stray mime refused", setAtt(adminA, ORG_A, billA, null, "application/pdf", null), "invalid_attachment");

const s5 = setAtt(platformOwner, ORG_B, billB, P(ORG_B, billB, "webp"), "image/webp", 10485760);
check("S5 platform owner sets for non-entitled org at exactly 10 MB", s5.ok, s5.err);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

expectError("V1 size over 10 MB refused", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA2, "pdf"), "application/pdf", 10485761), "invalid_attachment_size");
expectError("V1 zero size refused", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA2, "pdf"), "application/pdf", 0), "invalid_attachment_size");
expectError("V2 gif refused", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA2, "gif"), "image/gif", 100), "invalid_attachment_mime");
expectError("V2 missing mime refused", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA2, "pdf"), null, 100), "invalid_attachment_mime");
expectError("V3 path in another bill's folder refused", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA, "pdf"), "application/pdf", 100), "invalid_attachment_path");
expectError("V3 path in another org's folder refused", setAtt(adminA, ORG_A, billA2, P(ORG_B, billA2, "pdf"), "application/pdf", 100), "invalid_attachment_path");
expectError("V3 extension must match mime", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA2, "pdf"), "image/png", 100), "invalid_attachment_path");
expectError("V3 traversal refused", setAtt(adminA, ORG_A, billA2, `${ORG_A}/${billA2}/../x.pdf`, "application/pdf", 100), "invalid_attachment_path");
expectError("V3 nested path refused", setAtt(adminA, ORG_A, billA2, `${ORG_A}/${billA2}/a/3f2504e0-4f89-41d3-9a0c-0305e82c3301.pdf`, "application/pdf", 100), "invalid_attachment_path");
check("V4 refused calls left the bill untouched", attRow(billA2) === "null|null|null");

// ---------------------------------------------------------------------------
// Approved bills, cross-org, roles, entitlement
// ---------------------------------------------------------------------------

const pA2 = P(ORG_A, billA2, "pdf");
check("A0 draft attach before approval", setAtt(adminA, ORG_A, billA2, pA2, "application/pdf", 500).ok);
check("A0 approve", svc("approve_workshop_bill", u(adminA), u(ORG_A), u(billA2)).ok);
expectError("A1 approved bill: set refused", setAtt(adminA, ORG_A, billA2, P(ORG_A, billA2, "png"), "image/png", 100), "bill_approved_locked");
expectError("A1 approved bill: clear refused", setAtt(adminA, ORG_A, billA2, null, null, null), "bill_approved_locked");
expectError("A1 approved bill: platform owner refused too", setAtt(platformOwner, ORG_A, billA2, null, null, null), "bill_approved_locked");
check("A2 approved bill attachment unchanged", attRow(billA2) === `${pA2}|application/pdf|500`);

expectError("X1 org B bill not reachable via org A", setAtt(adminA, ORG_A, billB, P(ORG_A, billB, "pdf"), "application/pdf", 100), "not_found");
expectError("X2 org A admin cannot act on org B", setAtt(adminA, ORG_B, billB, P(ORG_B, billB, "pdf"), "application/pdf", 100), "not_authorised");
expectError("X3 unknown bill", setAtt(adminA, ORG_A, "e7500000-0000-4000-8000-0000000000ff", P(ORG_A, "e7500000-0000-4000-8000-0000000000ff", "pdf"), "application/pdf", 100), "not_found");

const pR = P(ORG_A, billA, "pdf");
expectError("R1 driver refused", setAtt(driverA, ORG_A, billA, pR, "application/pdf", 100), "not_authorised");
expectError("R1 dispatcher refused", setAtt(dispatcherA, ORG_A, billA, pR, "application/pdf", 100), "not_authorised");
expectError("R1 company_manager refused", setAtt(companyManagerA, ORG_A, billA, pR, "application/pdf", 100), "not_authorised");
expectError("R2 null actor refused", setAtt(null, ORG_A, billA, pR, "application/pdf", 100), "not_authorised");
expectError("R3 org B admin refused: not entitled", setAtt(adminB, ORG_B, billB, null, null, null), "module_not_entitled");
check("R4 refused calls left bills untouched", attRow(billA) === "null|null|null" && attRow(billB) === `${P(ORG_B, billB, "webp")}|image/webp|10485760`);
check(
  "R4 no audit rows from refused callers",
  Number(
    psqlAdmin(
      `select count(*)::text from public.audit_logs where action like 'workshop_bill.attachment_%'
         and actor_id in ('${driverA}', '${dispatcherA}', '${companyManagerA}', '${adminB}')`
    )
  ) === 0
);

console.log(failures === 0 ? "\nAll maintenance attachment RPC checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
