#!/usr/bin/env node
/**
 * 00083 — Final (status 'approved') workshop bills are locked at the table
 * level. Static text checks + a throwaway local Postgres (workops_audit).
 * Never points at a hosted project.
 * Run: npm run test:maintenance-final-lock
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(join(root, "supabase/migrations/00083_workshop_bill_final_lock.sql"), "utf8");

let failures = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failures += 1;
}

check("static before update or delete on bills", /before update or delete on public\.workshop_bills/.test(sql));
check("static before update or delete on lines", /before update or delete on public\.workshop_bill_lines/.test(sql));
check("static raises bill_approved_locked", /raise exception 'bill_approved_locked'/.test(sql));
check("static no enum / reopen", !/alter type|reopen/i.test(sql.replace(/--.*$/gm, "")));

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";
if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
  const b = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], { encoding: "utf8" });
  if (b.status !== 0) {
    console.error("FAIL integration — bootstrap-native.sh failed");
    console.error(b.stderr || b.stdout);
    process.exit(1);
  }
}
function psql(body) {
  const res = spawnSync("sudo", ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body], {
    encoding: "utf8",
  });
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    err: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}
const admin = (b) => {
  const r = psql(b);
  if (!r.ok) throw new Error(r.err);
  return r.out;
};
const asService = (b) => psql(`BEGIN;\nSET LOCAL ROLE service_role;\n${b}\nCOMMIT;`);
const expectLocked = (name, r) =>
  check(name, !r.ok && r.err.includes("bill_approved_locked"), r.ok ? "succeeded" : r.err.trim().split("\n")[0]);

// Re-apply 00074/00078 so their service_role-only grants are what we test, then 00083 (idempotent).
for (const f of ["00074_maintenance_rpcs.sql", "00078_delete_workshop_bill.sql", "00083_workshop_bill_final_lock.sql"]) {
  const r = spawnSync("sudo", ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", join(root, "supabase/migrations", f)], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`FAIL re-apply ${f}`, r.stderr);
    process.exit(1);
  }
}

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const PLAN = "e8300000-0000-4000-8000-000000000901";
admin(`
insert into public.plans (id, code, name) values ('${PLAN}', 'fl-maint', 'Final lock test plan') on conflict (id) do nothing;
insert into public.module_entitlements (plan_id, module_key) values ('${PLAN}', 'maintenance'), ('${PLAN}', 'core') on conflict do nothing;
insert into public.subscriptions (organisation_id, plan_id, status) values ('${ORG_A}', '${PLAN}', 'active')
on conflict (organisation_id) do update set plan_id = excluded.plan_id, status = excluded.status;
`);

const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const sup = asService(`select public.save_supplier('${adminA}', '${ORG_A}', null, ${j({ name: "FL Workshop" })})::text;`);
check("setup supplier", sup.ok, sup.err);
const mk = (ref) =>
  asService(
    `select public.save_workshop_bill('${adminA}', '${ORG_A}', null, ${j({
      supplier_id: sup.out,
      bill_date: "2026-11-24",
      invoice_ref: ref,
      lines: [{ description: "Part", unit_amount: 100 }],
    })})::text;`
  );
const finalBill = mk("FL-1");
const draftBill = mk("FL-2");
check("setup bills", finalBill.ok && draftBill.ok, finalBill.err + draftBill.err);
const F = finalBill.out;
const D = draftBill.out;

// Draft: everything still works.
const draftEdit = asService(
  `select public.save_workshop_bill('${adminA}', '${ORG_A}', '${D}', ${j({
    supplier_id: sup.out, bill_date: "2026-11-24", invoice_ref: "FL-2", notes: "x",
    lines: [{ description: "Part 2", unit_amount: 50 }],
  })})::text;`
);
check("draft save (replaces lines) still works", draftEdit.ok, draftEdit.err);

// Approve transition itself is allowed.
const approve = asService(`select public.approve_workshop_bill('${adminA}', '${ORG_A}', '${F}');`);
check("approve transition allowed", approve.ok && admin(`select status from public.workshop_bills where id='${F}'`) === "approved", approve.err);
check("approve audited", admin(`select count(*)::text from public.audit_logs where entity_id='${F}' and action='workshop_bill.approved'`) === "1");

// Final bill: direct writes blocked.
expectLocked("final bill UPDATE blocked", psql(`update public.workshop_bills set notes = 'x' where id = '${F}'`));
expectLocked("final bill soft delete blocked", psql(`update public.workshop_bills set deleted_at = now() where id = '${F}'`));
expectLocked("final bill DELETE blocked", psql(`delete from public.workshop_bills where id = '${F}'`));
expectLocked("final line UPDATE blocked", psql(`update public.workshop_bill_lines set description = 'x' where bill_id = '${F}'`));
expectLocked("final line DELETE blocked", psql(`delete from public.workshop_bill_lines where bill_id = '${F}'`));
expectLocked(
  "save_workshop_bill on final still locked",
  asService(`select public.save_workshop_bill('${adminA}', '${ORG_A}', '${F}', ${j({ supplier_id: sup.out, bill_date: "2026-11-24", invoice_ref: "FL-1" })})::text;`)
);
check(
  "delete_workshop_bill on final refused (bill_not_draft)",
  (() => {
    const r = asService(`select public.delete_workshop_bill('${adminA}', '${ORG_A}', '${F}');`);
    return !r.ok && r.err.includes("bill_not_draft");
  })()
);
check("final bill unchanged", admin(`select status || '/' || (select count(*) from public.workshop_bill_lines where bill_id='${F}') from public.workshop_bills where id='${F}'`) === "approved/1");

// Drafts: delete RPC and cascade still work.
const del = asService(`select public.delete_workshop_bill('${adminA}', '${ORG_A}', '${D}');`);
check("delete_workshop_bill on draft allowed", del.ok, del.err);
const casc = psql(`delete from public.workshop_bills where id = '${D}'`);
check(
  "hard delete of a draft cascades to its lines",
  casc.ok && admin(`select count(*)::text from public.workshop_bill_lines where bill_id='${D}'`) === "0",
  casc.err
);

console.log(failures === 0 ? "\nAll 00083 checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
