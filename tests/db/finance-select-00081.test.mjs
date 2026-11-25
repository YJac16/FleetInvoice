#!/usr/bin/env node
/**
 * Postgres check for 00081 + 00084 (finance SELECT for admin/manager only),
 * 00085 (finance write policies + finance RPC role checks admin/manager only),
 * and the three rollbacks.
 *
 *   - invoices / invoice_lines / route_prices (00081) and rate_cards /
 *     pay_rates / payroll_runs / payroll_lines (00084): manager sees rows;
 *     dispatcher, supervisor, driver see none; company_manager keeps its own
 *     company's invoice and rate card.
 *   - Supervisor is scoped to the company that has the rate card, and still
 *     sees 0 rate cards after rollback-00084: that is 00079's policy, not data
 *     scope.
 *   - Driver-trip approval with the pre-filled price still works with no
 *     caller SELECT on those tables (approve_driver_trip, suggest_trip_unit_price
 *     and their helpers are SECURITY DEFINER). Approval is admin/manager
 *     (staff_can_manage_trips, 00064); dispatcher is refused by the RPC, as
 *     before 00081.
 *
 *   - 00085: dispatcher/supervisor can't insert/update rate cards, pay rates,
 *     route prices or invoices, and every finance RPC refuses them (or returns
 *     nothing); manager can. Dispatcher's own trip flows (assign_staff_trip,
 *     backfill_staff_waybill, cancel_staff_trip, upsert company without a
 *     rate) still work, and the waybill still gets its invoice line.
 *   - Rollbacks: rollback-00085 restores dispatcher writes / RPC access;
 *     rollback-00084 brings dispatcher back on rate cards / pay
 *     tables (supervisor stays off rate cards), rollback-00081 brings
 *     dispatcher + supervisor back on invoices / route prices. Re-applying
 *     00081/00084/00085 restores the lock-down.
 *
 * Run: npm run test:finance-00081   (bootstraps a throwaway local DB)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG = "f8100000-0000-4000-8000-000000000001";
const U = {
  admin: "f8100000-0000-4000-8000-000000000011",
  manager: "f8100000-0000-4000-8000-000000000012",
  dispatcher: "f8100000-0000-4000-8000-000000000013",
  supervisor: "f8100000-0000-4000-8000-000000000014",
  cm: "f8100000-0000-4000-8000-000000000015",
  driver: "f8100000-0000-4000-8000-000000000016",
};
const DRIVER_ROW = "f8100000-0000-4000-8000-000000000201";
const COMPANY = "f8100000-0000-4000-8000-000000000301";
const BILL_TO = "f8100000-0000-4000-8000-000000000302";
const VEHICLE = "f8100000-0000-4000-8000-000000000401";
const VEHICLE2 = "f8100000-0000-4000-8000-000000000402";
const COMPANY_RC = "f8100000-0000-4000-8000-000000000303"; // rate card, no route price
const RUN = "f8100000-0000-4000-8000-000000000801";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = 1;
};

function psqlAdmin(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim();
}

function psqlAs(userId, body, { allowError = false } = {}) {
  const sqlBody = `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${body}\nCOMMIT;`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sqlBody],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  const text = `${res.stderr ?? ""}${res.stdout ?? ""}`;
  if (res.status !== 0 && !allowError) throw new Error(text || "psqlAs failed");
  return { ok: res.status === 0, out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "", text };
}

if (!process.env.SKIP_BOOTSTRAP) {
  const boot = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], {
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, WORKOPS_AUDIT_PG_PORT: "5432" },
  });
  if (boot.status !== 0) {
    console.error("FAIL bootstrap-native.sh");
    console.error(boot.stderr || boot.stdout);
    process.exit(1);
  }
}

// Local harness only (same as tests/db/run-pr-a-waybill-rate.sh): invoker RPCs
// such as upsert_company_with_trip_rate call auth.uid(); hosted Supabase
// already grants this.
psqlAdmin(`grant usage on schema auth to authenticated;`);

const users = Object.entries(U)
  .map(
    ([k, id]) =>
      `('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', 'f81-${k}@finance.test', 'x', now(), now(), now(), '{}', '{}')`
  )
  .join(",\n");

psqlAdmin(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ${users} on conflict (id) do nothing;

insert into public.organisations (id, name, slug, status) values ('${ORG}', 'Finance 00081 Org', 'finance-00081', 'active')
on conflict (id) do nothing;

insert into public.organisation_members (organisation_id, user_id, role, status) values
  ('${ORG}', '${U.admin}', 'organisation_admin', 'active'),
  ('${ORG}', '${U.manager}', 'manager', 'active'),
  ('${ORG}', '${U.dispatcher}', 'dispatcher', 'active'),
  ('${ORG}', '${U.supervisor}', 'supervisor', 'active'),
  ('${ORG}', '${U.cm}', 'company_manager', 'active'),
  ('${ORG}', '${U.driver}', 'driver', 'active')
on conflict do nothing;

insert into public.companies (id, organisation_id, name, status) values
  ('${COMPANY}', '${ORG}', 'Finance Co', 'active'),
  ('${BILL_TO}', '${ORG}', 'Finance Bill-To', 'active')
on conflict (id) do nothing;
update public.organisations
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('invoice_bill_to_company_id', '${BILL_TO}')
where id = '${ORG}';
`);

// Company manager and supervisor scoped to COMPANY (member_scopes). The
// supervisor scope rules out "no rate cards in the supervisor's companies".
psqlAdmin(`
insert into public.companies (id, organisation_id, name, status)
values ('${COMPANY_RC}', '${ORG}', 'Rate Card Only Co', 'active') on conflict (id) do nothing;
insert into public.member_scopes (organisation_id, membership_id, company_id)
select '${ORG}', m.id, c.company_id from public.organisation_members m
cross join (values ('${COMPANY}'::uuid), ('${COMPANY_RC}'::uuid)) as c(company_id)
where m.organisation_id = '${ORG}' and m.user_id = '${U.supervisor}'
on conflict do nothing;
-- A company login is limited to one company (guard_company_manager_member_scope).
insert into public.member_scopes (organisation_id, membership_id, company_id)
select '${ORG}', m.id, '${COMPANY}' from public.organisation_members m
where m.organisation_id = '${ORG}' and m.user_id = '${U.cm}'
on conflict do nothing;
`);

psqlAdmin(`
insert into public.drivers (id, organisation_id, profile_id, full_name, status)
values ('${DRIVER_ROW}', '${ORG}', '${U.driver}', 'Finance Driver', 'active') on conflict (id) do nothing;

insert into public.vehicles (id, organisation_id, name, registration_number, status, vehicle_type) values
  ('${VEHICLE}', '${ORG}', 'Finance Van', 'FIN-001', 'active', 'other'),
  ('${VEHICLE2}', '${ORG}', 'Finance Van 2', 'FIN-002', 'active', 'other')
on conflict (id) do nothing;

insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
values
  ('${ORG}', '${COMPANY}', 'Finance rate', 'trip', 'fixed', 300, date '2026-01-01'),
  ('${ORG}', '${COMPANY_RC}', 'Rate card only', 'trip', 'fixed', 410, date '2026-01-01');

insert into public.pay_rates (organisation_id, company_id, name, subject_role, unit, unit_amount, effective_from)
values ('${ORG}', '${COMPANY}', 'Driver per trip', 'driver', 'trip', 120, date '2026-01-01');
insert into public.payroll_runs (id, organisation_id, period_start, period_end, total)
values ('${RUN}', '${ORG}', date '2026-09-01', date '2026-09-30', 120) on conflict (id) do nothing;
insert into public.payroll_lines (organisation_id, payroll_run_id, line_type, driver_id, description, quantity, unit_amount, amount)
values ('${ORG}', '${RUN}', 'trip', '${DRIVER_ROW}', 'Trip pay', 1, 120, 120);

insert into public.route_prices (organisation_id, company_id, label, match_kind, unit_amount, priority)
values ('${ORG}', '${COMPANY}', 'Company default', 'company', 555, 0);
`);

// A completed waybill gives an invoice + invoice line (admin, SECURITY DEFINER path).
const waybill = psqlAs(
  U.admin,
  `select (public.backfill_staff_waybill('${ORG}'::uuid, '${DRIVER_ROW}'::uuid, timestamptz '2026-10-05 10:00:00+02',
     'Finance route', 1, '${COMPANY}'::uuid, null, null, null, '${VEHICLE}'::uuid))::text;`
).out;
check("seed: waybill created an invoice line", psqlAdmin(`select count(*) from public.invoice_lines where trip_id = '${waybill}'`) === "1");

const count = (user, table) => psqlAs(user, `select count(*) from public.${table} where organisation_id = '${ORG}';`).out;

const FINANCE_00081 = ["invoices", "invoice_lines", "route_prices"];
const FINANCE_00084 = ["rate_cards", "pay_rates", "payroll_runs", "payroll_lines"];
for (const table of [...FINANCE_00081, ...FINANCE_00084]) {
  check(`${table}: manager can SELECT`, Number(count(U.manager, table)) > 0);
  check(`${table}: admin can SELECT`, Number(count(U.admin, table)) > 0);
  check(`${table}: dispatcher sees nothing`, count(U.dispatcher, table) === "0", count(U.dispatcher, table));
  check(`${table}: supervisor sees nothing`, count(U.supervisor, table) === "0", count(U.supervisor, table));
  check(`${table}: driver sees nothing`, count(U.driver, table) === "0");
}
// A company (non-driver) invoice for COMPANY: the company_manager branch is unchanged.
psqlAdmin(`insert into public.invoices (organisation_id, company_id, period_start, period_end)
  values ('${ORG}', '${COMPANY}', date '2026-09-28', date '2026-10-04');`);
check("invoices: company_manager still sees its company's invoice", count(U.cm, "invoices") === "1", count(U.cm, "invoices"));
check("invoices: company_manager does not see the driver invoice", Number(count(U.manager, "invoices")) === 2);
check("invoices: dispatcher still sees nothing (with a company invoice present)", count(U.dispatcher, "invoices") === "0");
check("invoices: supervisor still sees nothing (with a company invoice present)", count(U.supervisor, "invoices") === "0");
check("route_prices: company_manager sees nothing", count(U.cm, "route_prices") === "0");
check("rate_cards: company_manager still sees its company's card only (branch unchanged)", count(U.cm, "rate_cards") === "1", count(U.cm, "rate_cards"));
for (const t of ["pay_rates", "payroll_runs", "payroll_lines"]) {
  check(`${t}: company_manager sees nothing`, count(U.cm, t) === "0");
}
check(
  "has_company_scope is true for the supervisor on the rate-card company (data scope is not the reason)",
  psqlAs(U.supervisor, `select public.has_company_scope('${ORG}'::uuid, '${COMPANY_RC}'::uuid)::text;`).out === "true"
);

// Driver submits, manager approves with the suggested (pre-filled) price.
const submitted = psqlAs(
  U.driver,
  `select trip_id::text from public.submit_driver_trip('${ORG}'::uuid, timestamptz '2026-10-06 08:00:00+02',
     'Depot', 'Site', '${COMPANY}'::uuid, 3, 12, null);`
).out;
check("seed: driver submitted a pending trip", /^[0-9a-f-]{36}$/.test(submitted), submitted);

const suggestAsDispatcher = psqlAs(
  U.dispatcher,
  `select unit_amount::text from public.suggest_trip_unit_price('${ORG}'::uuid, '${COMPANY}'::uuid, 'Depot - Site', date '2026-10-06');`,
  { allowError: true }
);
check(
  "suggest_trip_unit_price: dispatcher refused by staff_can_manage_trips (unchanged by 00081)",
  !suggestAsDispatcher.ok && /not authori[sz]ed/i.test(suggestAsDispatcher.text),
  suggestAsDispatcher.text.slice(0, 160)
);
const approveAsDispatcher = psqlAs(
  U.dispatcher,
  `select public.approve_driver_trip('${submitted}'::uuid, '${VEHICLE2}'::uuid, 555, true);`,
  { allowError: true }
);
check(
  "approve_driver_trip: dispatcher refused by staff_can_manage_trips (unchanged by 00081)",
  !approveAsDispatcher.ok && /not authori[sz]ed/i.test(approveAsDispatcher.text),
  approveAsDispatcher.text.slice(0, 160)
);

const suggested = psqlAs(
  U.manager,
  `select unit_amount::text || '|' || price_source from public.suggest_trip_unit_price('${ORG}'::uuid, '${COMPANY}'::uuid, 'Depot - Site', date '2026-10-06');`
).out;
check("suggest_trip_unit_price: manager gets the route price", suggested === "555.00|route_price", suggested);

const fallback = psqlAs(
  U.manager,
  `select unit_amount::text || '|' || price_source from public.suggest_trip_unit_price('${ORG}'::uuid, '${COMPANY_RC}'::uuid, 'Depot - Site', date '2026-10-06');`
).out;
check("suggest_trip_unit_price: manager falls back to the rate card (00084 in place)", fallback.startsWith("410") && fallback.endsWith("|rate_card"), fallback);
const adminSuggest = psqlAs(
  U.admin,
  `select unit_amount::text from public.suggest_trip_unit_price('${ORG}'::uuid, '${COMPANY}'::uuid, 'Depot - Site', date '2026-10-06');`
).out;
check("suggest_trip_unit_price: admin gets the route price", Number(adminSuggest) === 555, adminSuggest);

const approved = psqlAs(
  U.manager,
  `select public.approve_driver_trip('${submitted}'::uuid, '${VEHICLE2}'::uuid, 555, true);`,
  { allowError: true }
);
check("approve_driver_trip: manager approves with the pre-filled price", approved.ok, approved.text.slice(0, 200));
const linePrice = psqlAdmin(`select coalesce(max(unit_price)::text, 'none') from public.invoice_lines where trip_id = '${submitted}'`);
check("approve_driver_trip: invoice line carries the price", Number(linePrice) === 555, linePrice);



// ---------------------------------------------------------------------------
// 00085: finance writes and finance RPCs, admin/manager only
// ---------------------------------------------------------------------------
const ARCHIVED_RC = "f8100000-0000-4000-8000-000000000901";
psqlAdmin(`insert into public.rate_cards (id, organisation_id, company_id, name, line_type, unit, unit_amount, effective_from, deleted_at)
  values ('${ARCHIVED_RC}', '${ORG}', '${COMPANY}', 'Archived rate', 'trip', 'fixed', 250, date '2025-01-01', now())
  on conflict (id) do nothing;`);
const companyInvoice = psqlAdmin(
  `select id::text from public.invoices where organisation_id = '${ORG}' and driver_id is null and deleted_at is null limit 1;`
);
const anyLine = psqlAdmin(`select id::text from public.invoice_lines where organisation_id = '${ORG}' limit 1;`);

const refused = (user, sqlText) => {
  const r = psqlAs(user, sqlText, { allowError: true });
  return { refused: !r.ok && /not authori[sz]ed|row-level security/i.test(r.text), text: r.text, ok: r.ok, out: r.out };
};
const WRITES = {
  "insert rate_cards": `insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
     values ('${ORG}', '${COMPANY_RC}', 'W', 'trip', 'fixed', 1, date '2027-06-01');`,
  "insert pay_rates": `insert into public.pay_rates (organisation_id, company_id, name, subject_role, unit, unit_amount, effective_from)
     values ('${ORG}', '${COMPANY_RC}', 'W', 'driver', 'trip', 1, date '2027-06-01');`,
  "insert route_prices": `insert into public.route_prices (organisation_id, company_id, label, match_kind, unit_amount, priority)
     values ('${ORG}', '${COMPANY_RC}', 'W', 'company', 1, -5);`,
};
const RPCS = {
  apply_company_trip_rate: `select public.apply_company_trip_rate('${ORG}'::uuid, '${COMPANY_RC}'::uuid, 999, date '2027-07-01', null, null);`,
  generate_period_invoice: `select public.generate_period_invoice('${ORG}'::uuid, '${COMPANY}'::uuid, date '2026-12-07', date '2026-12-13');`,
  generate_driver_weekly_invoice: `select public.generate_driver_weekly_invoice('${ORG}'::uuid, '${DRIVER_ROW}'::uuid, date '2026-12-07', date '2026-12-13');`,
  generate_weekly_fuel_invoice: `select public.generate_weekly_fuel_invoice('${ORG}'::uuid, '${COMPANY}'::uuid, date '2026-12-07');`,
  set_invoice_status: `select public.set_invoice_status('${companyInvoice}'::uuid, 'issued');`,
  update_draft_invoice_line: `select public.update_draft_invoice_line('${anyLine}'::uuid, 'Edited', 1, 1);`,
  update_invoice_line_area: `select public.update_invoice_line_area('${anyLine}'::uuid, 'Edited area');`,
  generate_payroll_run: `select public.generate_payroll_run('${ORG}'::uuid, date '2026-12-01', date '2026-12-31');`,
  finalize_payroll_run: `select public.finalize_payroll_run('${RUN}'::uuid);`,
  void_payroll_run: `select public.void_payroll_run('${RUN}'::uuid);`,
};
const listArchived = (user) => psqlAs(user, `select count(*)::text from public.list_archived_rate_cards('${ORG}'::uuid);`).out;
const earliest = (user) =>
  psqlAs(user, `select coalesce(public.earliest_unbilled_trip_date('${ORG}'::uuid, '${COMPANY}'::uuid)::text, 'null');`).out;
const updatedInvoices = (user) =>
  psqlAs(user, `with u as (update public.invoices set notes = coalesce(notes, '') where organisation_id = '${ORG}' returning 1) select count(*)::text from u;`).out;

for (const [who, user] of [["dispatcher", U.dispatcher], ["supervisor", U.supervisor]]) {
  for (const [name, q] of Object.entries(WRITES)) {
    const r = refused(user, q);
    check(`00085: ${who} cannot ${name}`, r.refused, r.text.slice(0, 160));
  }
  check(`00085: ${who} updates 0 invoices`, updatedInvoices(user) === "0");
  for (const [name, q] of Object.entries(RPCS)) {
    const r = refused(user, q);
    check(`00085: ${name} refuses ${who}`, r.refused, r.text.slice(0, 160));
  }
  check(`00085: list_archived_rate_cards returns nothing to ${who}`, listArchived(user) === "0", listArchived(user));
  check(`00085: earliest_unbilled_trip_date returns null to ${who}`, earliest(user) === "null", earliest(user));
}
check("00085: no payroll run or invoice status changed by refused calls",
  psqlAdmin(`select status::text from public.payroll_runs where id = '${RUN}'`) === "draft" &&
  psqlAdmin(`select status::text from public.invoices where id = '${companyInvoice}'`) === "draft");

// Manager still can.
check("00085: manager lists archived rate cards", listArchived(U.manager) === "1", listArchived(U.manager));
const managerEarliest = earliest(U.manager);
check("00085: manager earliest_unbilled_trip_date runs", managerEarliest !== "");
for (const name of Object.keys(WRITES)) {
  const r = psqlAs(U.manager, WRITES[name], { allowError: true });
  check(`00085: manager can ${name}`, r.ok, r.text.slice(0, 160));
}
check("00085: manager can update invoices", Number(updatedInvoices(U.manager)) > 0);
for (const name of ["apply_company_trip_rate", "generate_payroll_run", "set_invoice_status", "void_payroll_run"]) {
  const r = psqlAs(U.manager, RPCS[name], { allowError: true });
  check(`00085: manager can ${name}`, r.ok, r.text.slice(0, 160));
}
check("00085: admin can generate_period_invoice", psqlAs(U.admin, RPCS.generate_period_invoice, { allowError: true }).ok);

// Dispatcher's own trip flows are untouched.
const assigned = psqlAs(
  U.dispatcher,
  `select public.assign_staff_trip('${ORG}'::uuid, '${DRIVER_ROW}'::uuid, timestamptz '2026-12-08 07:00:00+02', 'Dispatch area', 2, '${COMPANY}'::uuid, null, '${VEHICLE}'::uuid)::text;`,
  { allowError: true }
);
check("dispatcher flow: assign_staff_trip works", assigned.ok && /^[0-9a-f-]{36}$/.test(assigned.out), assigned.text.slice(0, 200));
if (assigned.ok) {
  const cancelled = psqlAs(U.dispatcher, `select public.cancel_staff_trip('${assigned.out}'::uuid);`, { allowError: true });
  check("dispatcher flow: cancel_staff_trip works", cancelled.ok, cancelled.text.slice(0, 200));
}
const dispWaybill = psqlAs(
  U.dispatcher,
  `select (public.backfill_staff_waybill('${ORG}'::uuid, '${DRIVER_ROW}'::uuid, timestamptz '2026-12-09 10:00:00+02',
     'Dispatcher waybill', 1, '${COMPANY}'::uuid, null, null, null, '${VEHICLE}'::uuid))::text;`,
  { allowError: true }
);
check("dispatcher flow: backfill_staff_waybill works", dispWaybill.ok && /^[0-9a-f-]{36}$/.test(dispWaybill.out), dispWaybill.text.slice(0, 200));
check(
  "dispatcher flow: the waybill still gets its invoice line (SECURITY DEFINER sync)",
  psqlAdmin(`select count(*) from public.invoice_lines where trip_id = '${dispWaybill.out}'`) === "1"
);
const upsertNoRate = psqlAs(
  U.dispatcher,
  `select (public.upsert_company_with_trip_rate('${ORG}'::uuid, 'Finance Co', '${COMPANY}'::uuid, null, 'Ops contact', null, null, null, 'active', null, null, null, null)).id::text;`,
  { allowError: true }
);
check("dispatcher flow: edit company without a trip rate works", upsertNoRate.ok, upsertNoRate.text.slice(0, 200));
const upsertWithRate = refused(
  U.dispatcher,
  `select (public.upsert_company_with_trip_rate('${ORG}'::uuid, 'Renamed by dispatcher', '${COMPANY}'::uuid, null, null, null, null, null, 'active', 777, date '2027-08-01', null, null)).id::text;`
);
check("00085: dispatcher editing a company WITH a trip rate is refused", upsertWithRate.refused, upsertWithRate.text.slice(0, 160));
check("00085: ...and the whole call rolls back (company not renamed)", psqlAdmin(`select name from public.companies where id = '${COMPANY}'`) === "Finance Co");

// ---------------------------------------------------------------------------
// Rollbacks, then re-apply
// ---------------------------------------------------------------------------
function applyFile(rel) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-f", join(root, rel)],
    { encoding: "utf8" }
  );
  check(`apply ${rel}`, res.status === 0, (res.stderr || res.stdout || "").slice(0, 200));
}

applyFile("supabase/rollback-00085.sql");
{
  const r = psqlAs(U.dispatcher, WRITES["insert rate_cards"], { allowError: true });
  check("rollback-00085: dispatcher can insert rate_cards again (00011 policy)", r.ok, r.text.slice(0, 160));
  check("rollback-00085: supervisor still cannot insert rate_cards (00011 never had supervisor)", refused(U.supervisor, WRITES["insert rate_cards"]).refused);
  check("rollback-00085: list_archived_rate_cards admits dispatcher again", listArchived(U.dispatcher) === "1", listArchived(U.dispatcher));
  check("rollback-00085: earliest_unbilled_trip_date admits supervisor again", earliest(U.supervisor) === earliest(U.manager));
  check("rollback-00085: generate_payroll_run admits dispatcher again", psqlAs(U.dispatcher, `select public.generate_payroll_run('${ORG}'::uuid, date '2027-01-01', date '2027-01-31');`, { allowError: true }).ok);
}

applyFile("supabase/rollback-00084.sql");
for (const t of FINANCE_00084) {
  check(`rollback-00084: dispatcher sees ${t} again (00012/00079 quals)`, Number(count(U.dispatcher, t)) > 0, count(U.dispatcher, t));
}
check("rollback-00084: supervisor still sees 0 rate_cards (00079 removed supervisor)", count(U.supervisor, "rate_cards") === "0", count(U.supervisor, "rate_cards"));
check("rollback-00084: invoices still hidden from dispatcher (00081 in place)", count(U.dispatcher, "invoices") === "0");

applyFile("supabase/rollback-00081.sql");
for (const t of FINANCE_00081) {
  check(`rollback-00081: dispatcher sees ${t} again`, Number(count(U.dispatcher, t)) > 0, count(U.dispatcher, t));
  check(`rollback-00081: supervisor sees ${t} again`, Number(count(U.supervisor, t)) > 0, count(U.supervisor, t));
}
{
  const own = psqlAdmin(
    `select count(*) from public.invoices where organisation_id = '${ORG}' and company_id = '${COMPANY}' and driver_id is null and deleted_at is null`
  );
  check("rollback-00081: company_manager branch still scoped (own company, non-driver invoices only)", count(U.cm, "invoices") === own, `${count(U.cm, "invoices")} vs ${own}`);
}


applyFile("supabase/migrations/00081_finance_select_exclude_supervisor.sql");
applyFile("supabase/migrations/00084_finance_rate_cards_payrates_admin_only.sql");
applyFile("supabase/migrations/00085_finance_writes_admin_only.sql");
check("re-applied 00085: dispatcher cannot insert rate_cards", refused(U.dispatcher, WRITES["insert rate_cards"]).refused);
check("re-applied 00085: list_archived_rate_cards empty for dispatcher", listArchived(U.dispatcher) === "0");
check("re-applied 00085: generate_payroll_run refuses dispatcher", refused(U.dispatcher, RPCS.generate_payroll_run).refused);
for (const t of [...FINANCE_00081, ...FINANCE_00084]) {
  check(`re-applied: dispatcher sees no ${t}`, count(U.dispatcher, t) === "0", count(U.dispatcher, t));
  check(`re-applied: supervisor sees no ${t}`, count(U.supervisor, t) === "0", count(U.supervisor, t));
  check(`re-applied: manager sees ${t}`, Number(count(U.manager, t)) > 0);
}

process.exit(failed);
