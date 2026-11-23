#!/usr/bin/env node
/**
 * Fleet maintenance Drop 1 (U2) — audited write RPCs from 00074:
 * save_supplier, save_maintenance_category, save_workshop_bill,
 * approve_workshop_bill.
 *
 * Covers: VAT inclusive/exclusive (per line, half-up 2dp, default rate 15),
 * approved bills locked, audit rows written, cross-org ids rejected,
 * non-permitted roles and non-entitled orgs rejected, service_role-only grants,
 * odometer_km stored only as typed.
 *
 * Local Postgres only (workops_audit). Never points at a hosted project.
 * Run: npm run test:maintenance-rpc
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = join(root, "supabase/migrations/00074_maintenance_rpcs.sql");
const sql = readFileSync(MIGRATION, "utf8");

let failures = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failures += 1;
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------

const RPCS = {
  save_supplier: "uuid, uuid, uuid, jsonb",
  save_maintenance_category: "uuid, uuid, uuid, jsonb",
  save_workshop_bill: "uuid, uuid, uuid, jsonb",
  approve_workshop_bill: "uuid, uuid, uuid",
};
for (const [fn, sig] of Object.entries(RPCS)) {
  const esc = sig.replace(/[()]/g, "\\$&");
  check(
    `static ${fn} revoked from public, anon, authenticated`,
    new RegExp(`revoke all on function public\\.${fn}\\(${esc}\\) from public, anon, authenticated;`).test(sql)
  );
  check(
    `static ${fn} granted to service_role`,
    new RegExp(`grant execute on function public\\.${fn}\\(${esc}\\) to service_role;`).test(sql)
  );
}
check(
  "static every definer fn pins search_path",
  (sql.match(/security definer/g) ?? []).length ===
    (sql.match(/security definer\s+set search_path = pg_catalog, public/g) ?? []).length
);
const sqlCode = sql.replace(/--.*$/gm, "");
check("static no invoice / rate card references", !/\b(invoices|invoice_lines|rate_cards)\b/.test(sqlCode));
check("static no policy changes", !/\b(create|drop|alter) policy\b/i.test(sqlCode));

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
/** Run as the service role (how the API calls these RPCs). */
function asService(body) {
  return psqlRaw(`BEGIN;\nSET LOCAL ROLE service_role;\n${body}\nCOMMIT;`);
}
function expectError(name, res, code) {
  check(name, !res.ok && res.err.includes(code), res.ok ? `succeeded: ${res.out}` : res.err.trim().split("\n")[0]);
}

// bootstrap-native.sh grants EXECUTE on all public functions to authenticated
// after the migrations run. Re-apply 00074 so its revokes are what we test.
{
  const r = spawnSync("sudo", ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", MIGRATION], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error("FAIL re-apply 00074", r.stderr);
    process.exit(1);
  }
}

// Seeded by scripts/local-db/seed-audit-fixtures.sql
const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const platformOwner = "f0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000012";
const adminB = "b0000000-0000-4000-8000-000000000011";

// Added here
const managerA = "e7400000-0000-4000-8000-000000000001";
const dispatcherA = "e7400000-0000-4000-8000-000000000002";
const VEH_A = "e7400000-0000-4000-8000-000000000101";
const VEH_B = "e7400000-0000-4000-8000-000000000102";
const PLAN = "e7400000-0000-4000-8000-000000000901";

psqlAdmin(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${managerA}', 'authenticated', 'authenticated',
   'manager.mrpc@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Manager A"}'),
  ('00000000-0000-0000-0000-000000000000', '${dispatcherA}', 'authenticated', 'authenticated',
   'dispatcher.mrpc@audit.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Dispatcher A"}')
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status)
values ('${ORG_A}', '${managerA}', 'manager', 'active'), ('${ORG_A}', '${dispatcherA}', 'dispatcher', 'active')
on conflict do nothing;

insert into public.vehicles (id, organisation_id, name, registration_number, vehicle_type, status)
values
  ('${VEH_A}', '${ORG_A}', 'MRPC A', 'MRPC 001 GP', 'minibus', 'active'),
  ('${VEH_B}', '${ORG_B}', 'MRPC B', 'MRPC 002 GP', 'minibus', 'active')
on conflict (id) do nothing;

-- Org A is entitled to maintenance; org B is not.
insert into public.plans (id, code, name) values ('${PLAN}', 'mrpc-maint', 'Maintenance test plan')
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

const saveSupplier = (actor, org, id, payload) =>
  asService(`select public.save_supplier(${u(actor)}, ${u(org)}, ${u(id)}, ${j(payload)})::text;`);
const saveCategory = (actor, org, id, payload) =>
  asService(`select public.save_maintenance_category(${u(actor)}, ${u(org)}, ${u(id)}, ${j(payload)})::text;`);
const saveBill = (actor, org, id, payload) =>
  asService(`select public.save_workshop_bill(${u(actor)}, ${u(org)}, ${u(id)}, ${j(payload)})::text;`);
const approveBill = (actor, org, id) =>
  asService(`select public.approve_workshop_bill(${u(actor)}, ${u(org)}, ${u(id)})::text;`);

const billRow = (id) =>
  psqlAdmin(
    `select concat_ws('|', status, vat_mode, vat_rate::text, subtotal_excl::text, vat_amount::text, total_incl::text, coalesce(odometer_km::text, 'null'))
     from public.workshop_bills where id = '${id}'`
  );
const lineRows = (id) =>
  psqlAdmin(
    `select string_agg(concat_ws('/', line_excl::text, line_vat::text, line_incl::text), ',' order by sort_order)
     from public.workshop_bill_lines where bill_id = '${id}'`
  );
const auditCount = (entityId, action, actor) =>
  Number(
    psqlAdmin(
      `select count(*)::text from public.audit_logs where entity_id = '${entityId}' and action = '${action}'` +
        (actor ? ` and actor_id = '${actor}'` : "")
    )
  );

// ---------------------------------------------------------------------------
// Grants: service_role only
// ---------------------------------------------------------------------------

for (const [fn, sig] of Object.entries(RPCS)) {
  const p = (role) => psqlAdmin(`select has_function_privilege('${role}', 'public.${fn}(${sig})', 'execute')::text`);
  check(`G1 ${fn} not executable by anon`, p("anon") === "false");
  check(`G1 ${fn} not executable by authenticated`, p("authenticated") === "false");
  check(`G1 ${fn} executable by service_role`, p("service_role") === "true");
}
check(
  "G2 internal guard not executable by authenticated or service_role",
  psqlAdmin(`select has_function_privilege('authenticated', 'public.maintenance_assert_writer(uuid, uuid)', 'execute')::text`) === "false" &&
    psqlAdmin(`select has_function_privilege('service_role', 'public.maintenance_assert_writer(uuid, uuid)', 'execute')::text`) === "false"
);
{
  const r = psqlRaw(
    `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${adminA}';
     select public.save_supplier('${adminA}'::uuid, '${ORG_A}'::uuid, null, '{"name":"Direct"}'::jsonb); COMMIT;`
  );
  expectError("G3 authenticated cannot call save_supplier directly", r, "permission denied");
}

// ---------------------------------------------------------------------------
// Suppliers + categories (and their audit rows)
// ---------------------------------------------------------------------------

const supA = saveSupplier(adminA, ORG_A, null, { name: "MRPC Workshop A", vat_number: "4000000001" });
check("S1 admin creates supplier", supA.ok, supA.err);
check("S1 supplier.created audit row", auditCount(supA.out, "supplier.created", adminA) === 1);

const supAUpd = saveSupplier(managerA, ORG_A, supA.out, { name: "MRPC Workshop A (Pty) Ltd" });
check("S2 manager updates supplier", supAUpd.ok && supAUpd.out === supA.out, supAUpd.err);
check("S2 supplier.updated audit row", auditCount(supA.out, "supplier.updated", managerA) === 1);

const catA = saveCategory(adminA, ORG_A, null, { name: "MRPC Tyres" });
check("S3 admin creates category", catA.ok, catA.err);
check("S3 maintenance_category.created audit row", auditCount(catA.out, "maintenance_category.created", adminA) === 1);
const catAUpd = saveCategory(adminA, ORG_A, catA.out, { name: "MRPC Tyres & wheels" });
check("S3 maintenance_category.updated audit row", catAUpd.ok && auditCount(catA.out, "maintenance_category.updated", adminA) === 1);

// Org B rows, made by the platform owner (bypasses entitlement; org B has none).
const supB = saveSupplier(platformOwner, ORG_B, null, { name: "MRPC Workshop B" });
check("S4 platform owner can write for non-entitled org", supB.ok, supB.err);
const catB = saveCategory(platformOwner, ORG_B, null, { name: "MRPC Tyres B" });
check("S4 platform owner creates org B category", catB.ok, catB.err);

// ---------------------------------------------------------------------------
// VAT: exclusive
// ---------------------------------------------------------------------------

const exclBill = saveBill(adminA, ORG_A, null, {
  supplier_id: supA.out,
  vehicle_id: VEH_A,
  bill_date: "2026-11-20",
  invoice_ref: "MRPC-EX-1",
  vat_mode: "exclusive",
  // client totals are ignored
  subtotal_excl: 1,
  vat_amount: 1,
  total_incl: 2,
  lines: [
    { category_id: catA.out, description: "Tyre", quantity: 1, unit_amount: 100.1 }, // vat 15.015 -> 15.02
    { description: "Labour", quantity: 3, unit_amount: 33.33 }, // 99.99, vat 14.9985 -> 15.00
    { description: "Disposal fee", quantity: 1, unit_amount: 50, vat_applicable: false },
  ],
});
check("V1 exclusive bill saved", exclBill.ok, exclBill.err);
check(
  "V1 exclusive lines (per line, half-up)",
  lineRows(exclBill.out) === "100.10/15.02/115.12,99.99/15.00/114.99,50.00/0.00/50.00",
  lineRows(exclBill.out)
);
check(
  "V1 exclusive totals recomputed, default rate 15, odometer null when not typed",
  billRow(exclBill.out) === "draft|exclusive|15.00|250.09|30.02|280.11|null",
  billRow(exclBill.out)
);

// Per-line rounding, not bill-level: 3 x 0.10 at 15% -> 0.02 each = 0.06 (bill-level would be 0.05)
const perLine = saveBill(adminA, ORG_A, null, {
  supplier_id: supA.out,
  bill_date: "2026-11-20",
  invoice_ref: "MRPC-EX-2",
  lines: [
    { description: "Washer", unit_amount: 0.1 },
    { description: "Washer", unit_amount: 0.1 },
    { description: "Washer", unit_amount: 0.1 },
  ],
});
check("V2 VAT rounded per line", perLine.ok && billRow(perLine.out) === "draft|exclusive|15.00|0.30|0.06|0.36|null", perLine.ok ? billRow(perLine.out) : perLine.err);

// Half-up, not banker's: 0.05 at 10% = 0.005 -> 0.01
const halfUp = saveBill(adminA, ORG_A, null, {
  supplier_id: supA.out,
  bill_date: "2026-11-20",
  invoice_ref: "MRPC-EX-3",
  vat_rate: 10,
  lines: [{ description: "Clip", unit_amount: 0.05 }],
});
check("V3 half-up at custom rate", halfUp.ok && lineRows(halfUp.out) === "0.05/0.01/0.06", halfUp.ok ? lineRows(halfUp.out) : halfUp.err);

// ---------------------------------------------------------------------------
// VAT: inclusive
// ---------------------------------------------------------------------------

const inclBill = saveBill(managerA, ORG_A, null, {
  supplier_id: supA.out,
  vehicle_id: VEH_A,
  bill_date: "2026-11-21",
  invoice_ref: "MRPC-IN-1",
  vat_mode: "inclusive",
  odometer_km: 123456,
  lines: [
    { category_id: catA.out, description: "Service", unit_amount: 115 }, // vat 15.00, excl 100.00
    { description: "Oil", quantity: 1, unit_amount: 10 }, // vat 1.3043 -> 1.30, excl 8.70
    { description: "Licence fee", unit_amount: 20, vat_applicable: false },
  ],
});
check("V4 inclusive bill saved", inclBill.ok, inclBill.err);
check(
  "V4 inclusive lines",
  lineRows(inclBill.out) === "100.00/15.00/115.00,8.70/1.30/10.00,20.00/0.00/20.00",
  lineRows(inclBill.out)
);
check(
  "V4 inclusive totals and odometer as typed",
  billRow(inclBill.out) === "draft|inclusive|15.00|128.70|16.30|145.00|123456",
  billRow(inclBill.out)
);

// Inclusive, 2 x 57.50 = 115.00 -> vat 15.00
const inclQty = saveBill(adminA, ORG_A, null, {
  supplier_id: supA.out,
  bill_date: "2026-11-21",
  invoice_ref: "MRPC-IN-2",
  vat_mode: "inclusive",
  lines: [{ description: "Brake pads", quantity: 2, unit_amount: 57.5 }],
});
check("V5 inclusive with quantity", inclQty.ok && lineRows(inclQty.out) === "100.00/15.00/115.00", inclQty.ok ? lineRows(inclQty.out) : inclQty.err);

// Odometer never prefilled: a later bill for the same vehicle with no reading stays null.
const noOdo = saveBill(adminA, ORG_A, null, {
  supplier_id: supA.out,
  vehicle_id: VEH_A,
  bill_date: "2026-11-22",
  invoice_ref: "MRPC-ODO-1",
  lines: [{ description: "Bulb", unit_amount: 20 }],
});
check("O1 odometer not prefilled from earlier bill", noOdo.ok && billRow(noOdo.out).endsWith("|null"), noOdo.ok ? billRow(noOdo.out) : noOdo.err);
expectError(
  "O2 negative odometer rejected",
  saveBill(adminA, ORG_A, null, { supplier_id: supA.out, bill_date: "2026-11-22", invoice_ref: "MRPC-ODO-2", odometer_km: -5 }),
  "invalid_odometer"
);
expectError(
  "O3 invalid vat_mode rejected",
  saveBill(adminA, ORG_A, null, { supplier_id: supA.out, bill_date: "2026-11-22", invoice_ref: "MRPC-ODO-3", vat_mode: "mixed" }),
  "invalid_vat_mode"
);

// ---------------------------------------------------------------------------
// Edit draft, then approve, then locked
// ---------------------------------------------------------------------------

const edit = saveBill(adminA, ORG_A, exclBill.out, {
  supplier_id: supA.out,
  vehicle_id: VEH_A,
  bill_date: "2026-11-20",
  invoice_ref: "MRPC-EX-1",
  vat_mode: "inclusive",
  odometer_km: 200000,
  lines: [{ description: "Tyre", unit_amount: 230 }],
});
check("E1 draft bill can be edited (lines replaced)", edit.ok && edit.out === exclBill.out, edit.err);
check("E1 edited totals recomputed", billRow(exclBill.out) === "draft|inclusive|15.00|200.00|30.00|230.00|200000", billRow(exclBill.out));
check("E1 workshop_bill.created + updated audit rows", auditCount(exclBill.out, "workshop_bill.created", adminA) === 1 && auditCount(exclBill.out, "workshop_bill.updated", adminA) === 1);

const appr = approveBill(managerA, ORG_A, exclBill.out);
check("A1 manager approves draft", appr.ok, appr.err);
check(
  "A1 approved_by / approved_at set",
  psqlAdmin(`select (status = 'approved' and approved_by = '${managerA}' and approved_at is not null)::text from public.workshop_bills where id = '${exclBill.out}'`) === "true"
);
check("A1 workshop_bill.approved audit row", auditCount(exclBill.out, "workshop_bill.approved", managerA) === 1);

const before = billRow(exclBill.out) + "#" + lineRows(exclBill.out);
expectError(
  "A2 approved bill cannot be edited",
  saveBill(adminA, ORG_A, exclBill.out, {
    supplier_id: supA.out,
    bill_date: "2026-11-20",
    invoice_ref: "MRPC-EX-1",
    lines: [{ description: "Tyre", unit_amount: 1 }],
  }),
  "bill_approved_locked"
);
expectError(
  "A2 platform owner cannot edit approved bill either",
  saveBill(platformOwner, ORG_A, exclBill.out, { supplier_id: supA.out, bill_date: "2026-11-20", invoice_ref: "X", lines: [] }),
  "bill_approved_locked"
);
expectError("A3 approved bill cannot be re-approved", approveBill(adminA, ORG_A, exclBill.out), "bill_already_approved");
check("A4 approved bill unchanged after rejected edits", billRow(exclBill.out) + "#" + lineRows(exclBill.out) === before);
check("A4 no extra audit rows from rejected edits", auditCount(exclBill.out, "workshop_bill.updated") === 1 && auditCount(exclBill.out, "workshop_bill.approved") === 1);

const empty = saveBill(adminA, ORG_A, null, { supplier_id: supA.out, bill_date: "2026-11-22", invoice_ref: "MRPC-EMPTY", lines: [] });
check("A5 empty draft can be saved", empty.ok, empty.err);
expectError("A5 bill with no lines cannot be approved", approveBill(adminA, ORG_A, empty.out), "bill_has_no_lines");

// ---------------------------------------------------------------------------
// Cross-org ids
// ---------------------------------------------------------------------------

const base = { bill_date: "2026-11-22", invoice_ref: "MRPC-XORG", lines: [{ description: "x", unit_amount: 1 }] };
expectError("X1 org B supplier rejected on org A bill", saveBill(adminA, ORG_A, null, { ...base, supplier_id: supB.out }), "supplier_org_mismatch");
expectError("X2 org B vehicle rejected on org A bill", saveBill(adminA, ORG_A, null, { ...base, supplier_id: supA.out, vehicle_id: VEH_B }), "vehicle_org_mismatch");
expectError(
  "X3 org B category rejected on org A bill line",
  saveBill(adminA, ORG_A, null, { ...base, supplier_id: supA.out, lines: [{ category_id: catB.out, description: "x", unit_amount: 1 }] }),
  "category_org_mismatch"
);
expectError(
  "X4 org B category rejected when editing org A draft",
  saveBill(adminA, ORG_A, inclBill.out, { ...base, supplier_id: supA.out, lines: [{ category_id: catB.out, description: "x", unit_amount: 1 }] }),
  "category_org_mismatch"
);
check("X4 draft unchanged after rejected cross-org edit", lineRows(inclBill.out) === "100.00/15.00/115.00,8.70/1.30/10.00,20.00/0.00/20.00");

const billB = saveBill(platformOwner, ORG_B, null, { ...base, supplier_id: supB.out });
check("X5 platform owner creates org B bill", billB.ok, billB.err);
expectError("X5 org B bill id not reachable via org A", saveBill(adminA, ORG_A, billB.out, { ...base, supplier_id: supA.out }), "not_found");
expectError("X5 org B bill not approvable via org A", approveBill(adminA, ORG_A, billB.out), "not_found");
expectError("X6 org B supplier id not updatable via org A", saveSupplier(adminA, ORG_A, supB.out, { name: "Hijack" }), "not_found");
expectError("X6 org B category id not updatable via org A", saveCategory(adminA, ORG_A, catB.out, { name: "Hijack" }), "not_found");
expectError("X7 org A admin cannot act on org B", saveSupplier(adminA, ORG_B, null, { name: "Nope" }), "not_authorised");

// ---------------------------------------------------------------------------
// Roles and entitlement
// ---------------------------------------------------------------------------

expectError("R1 dispatcher rejected (supplier)", saveSupplier(dispatcherA, ORG_A, null, { name: "Disp" }), "not_authorised");
expectError("R1 dispatcher rejected (category)", saveCategory(dispatcherA, ORG_A, null, { name: "Disp" }), "not_authorised");
expectError("R1 dispatcher rejected (bill)", saveBill(dispatcherA, ORG_A, null, { ...base, supplier_id: supA.out }), "not_authorised");
expectError("R1 dispatcher rejected (approve)", approveBill(dispatcherA, ORG_A, inclBill.out), "not_authorised");
expectError("R2 driver rejected (bill)", saveBill(driverA, ORG_A, null, { ...base, supplier_id: supA.out }), "not_authorised");
expectError("R2 driver rejected (approve)", approveBill(driverA, ORG_A, inclBill.out), "not_authorised");
expectError("R3 null actor rejected", saveSupplier(null, ORG_A, null, { name: "Anon" }), "not_authorised");
expectError("R4 org B admin rejected: org not entitled to maintenance", saveSupplier(adminB, ORG_B, null, { name: "B" }), "module_not_entitled");
check(
  "R5 rejected calls wrote no rows",
  psqlAdmin(`select count(*)::text from public.suppliers where name in ('Disp', 'Anon', 'B', 'Nope', 'Hijack')`) === "0" &&
    psqlAdmin(`select count(*)::text from public.workshop_bills where invoice_ref = 'MRPC-XORG'`) === "1"
);

console.log(failures === 0 ? "\nAll maintenance RPC checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
