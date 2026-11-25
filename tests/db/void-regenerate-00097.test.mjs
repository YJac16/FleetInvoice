#!/usr/bin/env node
/**
 * 00097 (demo only): void then regenerate.
 *  - voiding moves line trip_id into voided_trip_id (trip_id null), totals unchanged
 *  - generate_period_invoice and generate_driver_weekly_invoice then bill the
 *    same trips again
 *  - sync_staff_trip_invoice_line files a staff trip on a new draft when the
 *    week's invoice is void
 *  - invoice_lines_trip_id_uidx still blocks one trip on two non-void invoices
 *  - existing void invoices are backfilled
 * Requires: scripts/local-db/bootstrap-native.sh (run by this test unless
 * WORKOPS_SKIP_BOOTSTRAP is set).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(
  join(root, "supabase/migrations/00097_void_release_trip_ids.sql"),
  "utf8"
);

let failed = 0;
function check(name, pass, detail = "") {
  console.log(pass ? `PASS ${name}` : `FAIL ${name} ${detail}`);
  if (!pass) failed = 1;
}

if (spawnSync("which", ["psql"]).status !== 0) {
  console.error("FAIL integration — psql not available (required)");
  process.exit(1);
}

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const id = (n) => `d9700000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const admin = id(11);
const driverLogin = id(12);
const driver = id(201);
const wcl = id(301);
const client = id(302);
const vehicle = id(401);
const route = id(501);
const area = id(601);

// Monday-start SAST week
const WEEK_START = "2026-10-05";
const WEEK_END = "2026-10-11";

function psqlAdmin(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAdminTry(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  return { ok: res.status === 0, text: `${res.stderr ?? ""}${res.stdout ?? ""}` };
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

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------
const code = migration.replace(/--[^\n]*/g, "");
check("wrapped in begin/commit", /^\s*begin;/.test(code) && /commit;\s*$/.test(code));
check("keeps invoice_lines_trip_id_uidx", !/drop index[^;]*invoice_lines_trip_id_uidx/i.test(code));
check("voided_trip_id not unique", !/unique[^;]*voided_trip_id/i.test(code));
check("does not redefine set_invoice_status", !/function public\.set_invoice_status/.test(code));
check(
  "definer fns pin search_path",
  (code.match(/security definer\s+set search_path = pg_catalog, public/g) ?? []).length === 2
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
if (!process.env.WORKOPS_SKIP_BOOTSTRAP) {
  const bootstrap = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], {
    encoding: "utf8",
    env: { ...process.env, WORKOPS_AUDIT_PG_PORT: "5432" },
  });
  if (bootstrap.status !== 0) {
    console.error("FAIL integration — bootstrap-native.sh failed");
    console.error(bootstrap.stderr || bootstrap.stdout);
    process.exit(1);
  }
}

psqlAdmin(`grant usage on schema auth to authenticated, anon;`);

psqlAdmin(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '${admin}', 'authenticated', 'authenticated', 'admin@void97.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${driverLogin}', 'authenticated', 'authenticated', 'driver@void97.test', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;
insert into public.organisations (id, name, slug, status)
values ('${ORG}', 'Void97 Org', 'void97-org', 'active') on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, user_id, role, status) values
  ('${ORG}', '${admin}', 'organisation_admin', 'active'),
  ('${ORG}', '${driverLogin}', 'driver', 'active')
on conflict do nothing;
insert into public.drivers (id, organisation_id, profile_id, full_name, status)
values ('${driver}', '${ORG}', '${driverLogin}', 'Void Driver', 'active') on conflict (id) do nothing;
insert into public.companies (id, organisation_id, name, status) values
  ('${wcl}', '${ORG}', 'WCL Trading CC', 'active'),
  ('${client}', '${ORG}', 'Void Client Co', 'active')
on conflict (id) do nothing;
insert into public.vehicles (id, organisation_id, company_id, name, registration_number, status, vehicle_type)
values ('${vehicle}', '${ORG}', '${client}', 'Void Van', 'VOID-001', 'active', 'other')
on conflict (id) do nothing;
insert into public.areas (id, organisation_id, name, status)
values ('${area}', '${ORG}', 'Void area', 'active') on conflict (id) do nothing;
insert into public.routes (id, organisation_id, company_id, area_id, name, status)
values ('${route}', '${ORG}', '${client}', '${area}', 'Void route', 'active') on conflict (id) do nothing;
insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from) values
  ('${ORG}', '${client}', 'Void per trip', 'trip', 'trip', 350, date '2026-01-01'),
  ('${ORG}', '${client}', 'Void fixed trip', 'trip', 'fixed', 350, date '2026-01-01');
update public.organisations
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('invoice_bill_to_company_id', '${wcl}')
where id = '${ORG}';
`);

function insertTrip(plannedStart, { staff = false } = {}) {
  return psqlAdmin(`
    with t as (
      insert into public.trips (
        organisation_id, route_id, company_id, planned_start, planned_end, status,
        is_staff_transport, area_text
      )
      values (
        '${ORG}', '${route}', '${client}',
        timestamptz '${plannedStart}', timestamptz '${plannedStart}' + interval '1 hour',
        'completed', ${staff}, 'Void area'
      )
      returning id
    )
    insert into public.trip_assignments (organisation_id, trip_id, driver_id, vehicle_id, assigned_at)
    select '${ORG}', t.id, '${driver}', '${vehicle}', timestamptz '${plannedStart}' from t
    returning trip_id;
  `);
}

const voidInvoice = (invoiceId) =>
  psqlAs(admin, `select (public.set_invoice_status('${invoiceId}'::uuid, 'void')).status::text;`);
const lineState = (invoiceId) =>
  psqlAdmin(`
    select count(*) filter (where trip_id is not null)::text || '/' ||
           count(*) filter (where voided_trip_id is not null)::text
    from public.invoice_lines where invoice_id = '${invoiceId}' and line_type = 'trip';`);
const total = (invoiceId) => psqlAdmin(`select total::text from public.invoices where id = '${invoiceId}'`);
const tripIdsOf = (invoiceId, col = "trip_id") =>
  psqlAdmin(`
    select coalesce(string_agg(${col}::text, ',' order by ${col}), '')
    from public.invoice_lines where invoice_id = '${invoiceId}' and line_type = 'trip';`);

// ---------------------------------------------------------------------------
// Period invoice: generate, void, generate again
// ---------------------------------------------------------------------------
const pTrip1 = insertTrip("2026-08-04 08:00:00+02");
const pTrip2 = insertTrip("2026-08-05 08:00:00+02");
const periodGen = () =>
  psqlAs(
    admin,
    `select (public.generate_period_invoice('${ORG}'::uuid, '${client}'::uuid, date '2026-08-01', date '2026-08-31')).id::text;`
  );

const p1 = periodGen();
check("period generate #1", p1.ok, p1.text);
const p1Id = p1.out;
const p1Total = total(p1Id);
check("period #1 bills 2 trips", lineState(p1Id) === "2/0", lineState(p1Id));

const v1 = voidInvoice(p1Id);
check("void period invoice", v1.ok && v1.out === "void", v1.text);
check("period void: trip_id null, voided_trip_id set", lineState(p1Id) === "0/2", lineState(p1Id));
check("period void: total unchanged", total(p1Id) === p1Total, `${total(p1Id)} vs ${p1Total}`);
check(
  "period void: voided_trip_id keeps the trips",
  tripIdsOf(p1Id, "voided_trip_id") === [pTrip1, pTrip2].sort().join(","),
  tripIdsOf(p1Id, "voided_trip_id")
);

const p2 = periodGen();
check("period generate after void succeeds", p2.ok, p2.text);
check("period regenerate is a new invoice", p2.ok && p2.out !== p1Id);
check("period regenerate bills the same trips", tripIdsOf(p2.out) === [pTrip1, pTrip2].sort().join(","), tripIdsOf(p2.out));
check("period regenerate total matches", total(p2.out) === p1Total, `${total(p2.out)} vs ${p1Total}`);
check("voided period total still unchanged", total(p1Id) === p1Total);

// Unique index still blocks the same trip on a second non-void invoice
const dup = psqlAdminTry(`
  insert into public.invoice_lines (organisation_id, invoice_id, line_type, trip_id, description, amount)
  select '${ORG}', i.id, 'trip', '${pTrip1}', 'dup', 1
  from public.invoices i where i.id = '${p2.out}';`);
check("unique index blocks trip on two non-void invoices", !dup.ok && /invoice_lines_trip_id_uidx/.test(dup.text), dup.text);

// Void is final, set_invoice_status auth unchanged
const unvoid = psqlAs(admin, `select public.set_invoice_status('${p1Id}'::uuid, 'issued');`);
check("void invoice cannot be unvoided", !unvoid.ok && /Void invoices cannot change status/.test(unvoid.text), unvoid.text);
const driverVoid = psqlAs(driverLogin, `select public.set_invoice_status('${p2.out}'::uuid, 'void');`);
check("driver cannot void", !driverVoid.ok && /Not authorised/.test(driverVoid.text), driverVoid.text);
check("driver void attempt leaves lines", lineState(p2.out) === "2/0");

// ---------------------------------------------------------------------------
// Driver week invoice: generate, void, generate again
// ---------------------------------------------------------------------------
const wTrip1 = insertTrip("2026-10-06 08:00:00+02");
const wTrip2 = insertTrip("2026-10-08 08:00:00+02");
const weekGen = () =>
  psqlAs(
    admin,
    `select (public.generate_driver_weekly_invoice('${ORG}'::uuid, '${driver}'::uuid, date '${WEEK_START}', date '${WEEK_END}')).id::text;`
  );

const w1 = weekGen();
check("driver-week generate #1", w1.ok, w1.text);
const w1Id = w1.out;
const w1Total = total(w1Id);
check("driver-week #1 bills 2 trips", lineState(w1Id) === "2/0", lineState(w1Id));

const vw = voidInvoice(w1Id);
check("void driver-week invoice", vw.ok && vw.out === "void", vw.text);
check("driver-week void: trip_id null, voided_trip_id set", lineState(w1Id) === "0/2", lineState(w1Id));
check("driver-week void: total unchanged", total(w1Id) === w1Total);

const w2 = weekGen();
check("driver-week generate after void succeeds", w2.ok, w2.text);
check("driver-week regenerate is a new invoice", w2.ok && w2.out !== w1Id);
check("driver-week regenerate bills the same trips", tripIdsOf(w2.out) === [wTrip1, wTrip2].sort().join(","), tripIdsOf(w2.out));
check("driver-week regenerate total matches", total(w2.out) === w1Total, `${total(w2.out)} vs ${w1Total}`);

// ---------------------------------------------------------------------------
// Staff trip sync into a week whose only invoice is void
// ---------------------------------------------------------------------------
const voidW2 = voidInvoice(w2.out);
check("void regenerated driver-week invoice", voidW2.ok, voidW2.text);
const staffTrip = insertTrip("2026-10-07 09:00:00+02", { staff: true });
const sync = psqlAdminTry(`
  begin;
  set local request.jwt.claim.sub = '${admin}';
  select public.sync_staff_trip_invoice_line('${staffTrip}'::uuid, false);
  commit;`);
check("sync staff trip with void week invoice succeeds", sync.ok && !/weekly invoice is void/.test(sync.text), sync.text);
const staffInvoice = psqlAdmin(`
  select coalesce(string_agg(i.status::text, ','), '') from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id where il.trip_id = '${staffTrip}'`);
check("staff trip filed on a new draft", staffInvoice === "draft", staffInvoice);

// ---------------------------------------------------------------------------
// Backfill: re-run the migration's backfill statement on a pre-00097 style void
// ---------------------------------------------------------------------------
const legacyTrip = insertTrip("2026-07-07 08:00:00+02");
const legacyInv = psqlAdmin(`
  insert into public.invoices (organisation_id, company_id, period_start, period_end, status)
  values ('${ORG}', '${client}', date '2026-07-01', date '2026-07-31', 'issued') returning id::text;`);
psqlAdmin(`
  insert into public.invoice_lines (organisation_id, invoice_id, line_type, trip_id, description, amount)
  values ('${ORG}', '${legacyInv}', 'trip', '${legacyTrip}', 'legacy', 350);
  alter table public.invoices disable trigger invoices_release_trip_ids_on_void;
  update public.invoices set status = 'void' where id = '${legacyInv}';
  alter table public.invoices enable trigger invoices_release_trip_ids_on_void;`);
check("legacy void still holds trip_id (pre-backfill)", lineState(legacyInv) === "1/0");
const backfill = code.match(/update public\.invoice_lines il\s+set voided_trip_id[^;]*from public\.invoices i[^;]*;/);
check("migration has backfill statement", Boolean(backfill));
if (backfill) psqlAdmin(backfill[0]);
check("backfill releases legacy void", lineState(legacyInv) === "0/1", lineState(legacyInv));

if (failed) {
  console.error("void-regenerate-00097: FAILED");
  process.exit(1);
}
console.log("void-regenerate-00097: all checks passed");
