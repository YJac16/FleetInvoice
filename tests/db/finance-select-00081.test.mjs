#!/usr/bin/env node
/**
 * Postgres check for 00081 + 00084 (finance SELECT for admin/manager only),
 * 00085 (finance write policies + finance RPC role checks admin/manager only),
 * 00082 (supplier_name in workshop_bill.deleted audit metadata) and the four
 * rollbacks.
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
 *   - delete_workshop_bill writes supplier_name.
 *
 *   - 00085: dispatcher/supervisor can't insert/update rate cards, pay rates,
 *     route prices or invoices, and every finance RPC refuses them (or returns
 *     nothing); manager can. Dispatcher's own trip flows (assign_staff_trip,
 *     backfill_staff_waybill, cancel_staff_trip, upsert company without a
 *     rate) still work, and the waybill still gets its invoice line.
 *   - Rollbacks: rollback-00085 restores dispatcher writes / RPC access;
 *     rollback-00084 brings dispatcher back on rate cards / pay
 *     tables (supervisor stays off rate cards), rollback-00081 brings
 *     dispatcher + supervisor back on invoices / route prices, rollback-00082
 *     drops supplier_name. Re-applying 00081/00082/00084 restores the lock-down.
 *
 *   - 00086: fuel_fillups unit_price / total_amount / currency are column-revoked
 *     (42501 on direct SELECT, any caller); list_fuel_fillup_amounts returns
 *     org rows to admin/manager, own rows to the driver, 0 rows to dispatcher
 *     and supervisor; log_fuel_fillup masks money for dispatcher/supervisor but
 *     not for manager or the self driver; rollback-00086 restores it all.
 *     Since 00094 (fuel price table) drivers get NO amounts either: 0 rows
 *     from list_fuel_fillup_amounts and a masked log_fuel_fillup return; the
 *     price comes from a confirmed (fake, DEMO) org rate, p_unit_price is
 *     ignored. The 00093-00095 rollbacks run before the 00086 rollback below
 *     and the three are re-applied at the end.
 *
 *   - 00087: generate_weekly_fuel_invoice is CALLED as admin and manager with
 *     seeded fuel fills and succeeds (it raised 42702 period_end ambiguous);
 *     dispatcher/supervisor still refused; rollback-00087 restores the 00085
 *     definition.
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
const PLAN = "f8100000-0000-4000-8000-000000000501";
const SUPPLIER = "f8100000-0000-4000-8000-000000000601";
const BILL = "f8100000-0000-4000-8000-000000000701";
const BILL2 = "f8100000-0000-4000-8000-000000000702";
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

// Local harness only: bootstrap-native.sh runs `GRANT SELECT ... ON ALL TABLES`
// after the migrations, which re-opens the table-level SELECT that 00086's
// column grants replace (and the fuel_prices / fuel_fillups write grants of
// 00093/00094). Hosted Supabase applies migrations after its default grants,
// so re-apply them here to get the hosted end state (idempotent). 00086 itself
// cannot be re-applied on top of 00094 (list_fuel_fillup_amounts return type);
// 00094 re-asserts its column grants.
applyFile("supabase/migrations/00093_fuel_prices.sql");
applyFile("supabase/migrations/00094_fuel_fillup_price_lock.sql");
applyFile("supabase/migrations/00095_fuel_price_backfill.sql");

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

// 00082: supplier_name in workshop_bill.deleted
psqlAdmin(`
insert into public.plans (id, code, name) values ('${PLAN}', 'f81-maint', 'Finance maint plan') on conflict (id) do nothing;
insert into public.module_entitlements (plan_id, module_key) values ('${PLAN}', 'maintenance'), ('${PLAN}', 'core') on conflict do nothing;
insert into public.subscriptions (organisation_id, plan_id, status) values ('${ORG}', '${PLAN}', 'active')
on conflict (organisation_id) do update set plan_id = excluded.plan_id, status = excluded.status;
insert into public.suppliers (id, organisation_id, name) values ('${SUPPLIER}', '${ORG}', 'Acme Tyres') on conflict (id) do nothing;
insert into public.workshop_bills (id, organisation_id, supplier_id, bill_date, invoice_ref, subtotal_excl, vat_amount, total_incl)
values ('${BILL}', '${ORG}', '${SUPPLIER}', date '2026-10-01', 'INV-81', 100, 15, 115) on conflict (id) do nothing;
`);
psqlAdmin(`select public.delete_workshop_bill('${U.admin}'::uuid, '${ORG}'::uuid, '${BILL}'::uuid);`);
const meta = psqlAdmin(
  `select metadata::text from public.audit_logs where action = 'workshop_bill.deleted' and entity_id = '${BILL}' order by created_at desc limit 1;`
);
let parsed = {};
try {
  parsed = JSON.parse(meta);
} catch {
  /* reported below */
}
check("00082: audit metadata has supplier_name", parsed.supplier_name === "Acme Tyres", meta);
check("00082: audit metadata keeps invoice_ref and total_incl", parsed.invoice_ref === "INV-81" && Number(parsed.total_incl) === 115, meta);
check("00082: bill soft-deleted", psqlAdmin(`select (deleted_at is not null)::text from public.workshop_bills where id = '${BILL}'`) === "true");


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
// 00086: fuel cost is finance (column revoke + role-gated amounts RPC)
// ---------------------------------------------------------------------------
const OTHER_DRIVER = "f8100000-0000-4000-8000-000000000202";
psqlAdmin(`
insert into public.drivers (id, organisation_id, full_name, status)
values ('${OTHER_DRIVER}', '${ORG}', 'Other Fuel Driver', 'active') on conflict (id) do nothing;
insert into public.fuel_fillups (organisation_id, vehicle_id, driver_id, company_id, odometer_km, litres, unit_price, total_amount, currency, price_status)
values
  ('${ORG}', '${VEHICLE}', '${DRIVER_ROW}', '${COMPANY}', 1000, 40, 25, 1000, 'ZAR', 'priced'),
  ('${ORG}', '${VEHICLE2}', '${OTHER_DRIVER}', '${COMPANY}', 2000, 20, 25, 500, 'ZAR', 'priced');
-- Fake DEMO rate (not a real price) so log_fuel_fillup prices from the table (00094).
insert into public.fuel_prices (organisation_id, fuel_type, region, effective_from, price_per_litre, source, status, confirmed_at)
values ('${ORG}', 'diesel_50ppm', 'coastal', date '2020-01-01', 30, 'DEMO', 'confirmed', now())
on conflict do nothing;
`);
const hasPriceLock = () =>
  psqlAdmin(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fuel_fillups' and column_name = 'price_status'`) === "1";
const fuelDirect = (user, cols) =>
  psqlAs(user, `select ${cols} from public.fuel_fillups where organisation_id = '${ORG}';`, { allowError: true });
const permDenied = (r) => !r.ok && /permission denied/i.test(r.text);
const fuelAmounts = (user) =>
  psqlAs(user, `select count(*)::text || '|' || coalesce(sum(total_amount), 0)::text from public.list_fuel_fillup_amounts('${ORG}'::uuid);`).out;
const ALL_USERS = Object.entries(U);
for (const [who, id] of ALL_USERS) {
  for (const cols of ["*", "unit_price", "total_amount", "currency"]) {
    check(`00086: ${who} cannot SELECT ${cols} from fuel_fillups (permission denied)`, permDenied(fuelDirect(id, cols)), fuelDirect(id, cols).text.slice(0, 120));
  }
}
const SAFE = "id, organisation_id, vehicle_id, driver_id, company_id, filled_at, odometer_km, litres, station_name, notes, created_by, created_at, updated_at, deleted_at";
const fuelSafeCount = (user) => psqlAs(user, `select count(*)::text from (select ${SAFE} from public.fuel_fillups where organisation_id = '${ORG}') t;`).out;
check("00086: dispatcher still lists ops columns on all org fill-ups", fuelSafeCount(U.dispatcher) === "2", fuelSafeCount(U.dispatcher));
check("00086: supervisor still lists ops columns on all org fill-ups", fuelSafeCount(U.supervisor) === "2", fuelSafeCount(U.supervisor));
check("00086: admin lists ops columns on all org fill-ups", fuelSafeCount(U.admin) === "2");
check("00086: driver sees only own row (ops columns)", fuelSafeCount(U.driver) === "1", fuelSafeCount(U.driver));
check("00086: company_manager sees 0 fuel_fillups rows", fuelSafeCount(U.cm) === "0", fuelSafeCount(U.cm));
check("00086: dispatcher list_fuel_fillup_amounts returns 0 rows", fuelAmounts(U.dispatcher) === "0|0", fuelAmounts(U.dispatcher));
check("00086: supervisor list_fuel_fillup_amounts returns 0 rows", fuelAmounts(U.supervisor) === "0|0", fuelAmounts(U.supervisor));
check("00086: manager list_fuel_fillup_amounts returns org rows", fuelAmounts(U.manager) === "2|1500.00", fuelAmounts(U.manager));
check("00086: admin list_fuel_fillup_amounts returns org rows", fuelAmounts(U.admin) === "2|1500.00", fuelAmounts(U.admin));
check("00094: driver list_fuel_fillup_amounts returns 0 rows (tightened from 00086 own rows)", fuelAmounts(U.driver) === "0|0", fuelAmounts(U.driver));
check("00086: company_manager list_fuel_fillup_amounts returns 0 rows", fuelAmounts(U.cm) === "0|0", fuelAmounts(U.cm));
const anonAmounts = spawnSync(
  "psql",
  ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-tA", "-c",
   `begin; set local role anon; select * from public.list_fuel_fillup_amounts('${ORG}'::uuid); commit;`],
  { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
);
check("00086: anon cannot execute list_fuel_fillup_amounts", anonAmounts.status !== 0 && /permission denied/i.test(anonAmounts.stderr ?? ""), anonAmounts.stderr);

const logFuel = (user, odo) =>
  psqlAs(
    user,
    `select (to_jsonb(public.log_fuel_fillup('${ORG}'::uuid, '${VEHICLE}'::uuid, ${odo}, 10, null, null, null, 30, null, null${hasPriceLock() ? ", 'diesel_50ppm'" : ""})))::text;`,
    { allowError: true }
  );
for (const [who, user, odo] of [["dispatcher", U.dispatcher, 1100], ["supervisor", U.supervisor, 1200]]) {
  const r = logFuel(user, odo);
  const j = r.ok ? JSON.parse(r.out) : {};
  check(`00086: ${who} log_fuel_fillup works, money masked`, r.ok && j.unit_price === null && j.total_amount === null && j.currency === null && Number(j.litres) === 10, r.text.slice(0, 160));
}
const mgrLog = logFuel(U.manager, 1300);
const mj = mgrLog.ok ? JSON.parse(mgrLog.out) : {};
check("00086: manager log_fuel_fillup keeps money", mgrLog.ok && Number(mj.unit_price) === 30 && Number(mj.total_amount) === 300 && mj.currency === "ZAR", mgrLog.text.slice(0, 160));
const drvLog = logFuel(U.driver, 1400);
const dj = drvLog.ok ? JSON.parse(drvLog.out) : {};
check("00094: self driver log_fuel_fillup works, money and price status masked (tightened)", drvLog.ok && dj.total_amount === null && dj.unit_price === null && dj.price_status === null && Number(dj.litres) === 10, drvLog.text.slice(0, 160));
check("00094: driver-logged row is stored priced from the table", psqlAdmin(`select total_amount::text || '|' || price_status from public.fuel_fillups where odometer_km = 1400 and organisation_id = '${ORG}'`) === "300.00|priced");
check("00086: dispatcher-logged row still stored with its money", psqlAdmin(`select total_amount::text from public.fuel_fillups where odometer_km = 1100 and organisation_id = '${ORG}'`) === "300.00");
const weekly = psqlAs(U.manager, `select count(*)::text from (select 1 from public.invoices where organisation_id = '${ORG}') t;`, { allowError: true });
check("00086: invoices still readable by manager", weekly.ok);

// ---------------------------------------------------------------------------
// 00087: generate_weekly_fuel_invoice must actually run (was 42702 "period_end
// is ambiguous" for every authorised caller) and stay admin/manager only.
// ---------------------------------------------------------------------------
const weeklyFuel = (week) =>
  `select (to_jsonb(public.generate_weekly_fuel_invoice('${ORG}'::uuid, '${COMPANY}'::uuid, date '${week}')))::text;`;
const fuelSeed = () => {
  const lock = hasPriceLock();
  const st = lock ? ", 'priced'" : "";
  return `insert into public.fuel_fillups (organisation_id, vehicle_id, driver_id, company_id, odometer_km, litres, unit_price, total_amount, currency, filled_at${lock ? ", price_status" : ""})
values
  ('${ORG}', '${VEHICLE}', '${DRIVER_ROW}', '${COMPANY}', 3000, 10, 20, 200, 'ZAR', timestamptz '2027-03-09 08:00:00+00'${st}),
  ('${ORG}', '${VEHICLE}', '${DRIVER_ROW}', '${COMPANY}', 3100, 5, 20, 100, 'ZAR', timestamptz '2027-03-10 08:00:00+00'${st}),
  ('${ORG}', '${VEHICLE2}', '${OTHER_DRIVER}', '${COMPANY}', 4000, 10, 30, 300, 'ZAR', timestamptz '2027-03-16 08:00:00+00'${st});`;
};
function checkWeeklyFuel(label) {
  psqlAdmin(fuelSeed()); // temporary fills, removed below so 00086 counts are unaffected
  const a = psqlAs(U.admin, weeklyFuel("2027-03-08"), { allowError: true });
  const aj = a.ok ? JSON.parse(a.out) : {};
  check(`${label}: admin generate_weekly_fuel_invoice succeeds (no 42702)`, a.ok && !/ambiguous/i.test(a.text), a.text.slice(0, 200));
  check(`${label}: admin invoice covers the week and totals the two fills`, aj.period_end === "2027-03-15" && Number(aj.total) === 300 && aj.status === "issued", a.out.slice(0, 200));
  const again = psqlAs(U.admin, weeklyFuel("2027-03-08"), { allowError: true });
  check(`${label}: second call returns the same invoice (existing-invoice lookup)`, again.ok && JSON.parse(again.out).id === aj.id, again.text.slice(0, 200));
  const m = psqlAs(U.manager, weeklyFuel("2027-03-15"), { allowError: true });
  const mj = m.ok ? JSON.parse(m.out) : {};
  check(`${label}: manager generate_weekly_fuel_invoice succeeds (no 42702)`, m.ok && !/ambiguous/i.test(m.text) && Number(mj.total) === 300, m.text.slice(0, 200));
  check(
    `${label}: one fuel line per fill`,
    psqlAdmin(`select count(*) from public.invoice_lines where invoice_id in ('${aj.id}'::uuid, '${mj.id}'::uuid) and line_type = 'fuel'`) === "3"
  );
  for (const [who, id] of [["dispatcher", U.dispatcher], ["supervisor", U.supervisor]]) {
    const r = refused(id, weeklyFuel("2027-03-22"));
    check(`${label}: ${who} still refused (not authorised)`, r.refused, r.text.slice(0, 160));
  }
  check(
    `${label}: refused calls created no invoice`,
    psqlAdmin(`select count(*) from public.invoices where organisation_id = '${ORG}' and company_id = '${COMPANY}' and period_start = date '2027-03-22'`) === "0"
  );
  // reset so the next phase starts clean
  psqlAdmin(`delete from public.invoice_lines where invoice_id in ('${aj.id}'::uuid, '${mj.id}'::uuid);
    delete from public.invoices where id in ('${aj.id}'::uuid, '${mj.id}'::uuid);
    delete from public.fuel_fillups where organisation_id = '${ORG}' and odometer_km in (3000, 3100, 4000);`);
}
checkWeeklyFuel("00087");

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

// 00093-00095 sit on top of 00086/00087: roll them back first.
applyFile("supabase/rollback-00095.sql");
applyFile("supabase/rollback-00094.sql");
applyFile("supabase/rollback-00093.sql");
check("rollback-00094: driver list_fuel_fillup_amounts returns own rows again (00086)", fuelAmounts(U.driver).startsWith("1|") || Number(fuelAmounts(U.driver).split("|")[0]) >= 1, fuelAmounts(U.driver));
check("rollback-00093: fuel_prices is gone", psqlAdmin(`select (to_regclass('public.fuel_prices') is null)::text`) === "true");

applyFile("supabase/rollback-00086.sql");
check("rollback-00086: dispatcher can SELECT total_amount again", fuelDirect(U.dispatcher, "total_amount").ok);
check("rollback-00086: manager can SELECT * again", fuelDirect(U.manager, "*").ok);
check("rollback-00086: list_fuel_fillup_amounts is gone", psqlAdmin(`select count(*) from pg_proc where proname = 'list_fuel_fillup_amounts'`) === "0");
const unmasked = logFuel(U.dispatcher, 1500);
check("rollback-00086: dispatcher log_fuel_fillup returns money again (00007)", unmasked.ok && Number(JSON.parse(unmasked.out).total_amount) === 300, unmasked.text.slice(0, 160));
check("rollback-00086: driver sees only own fill-ups (policy untouched)", fuelSafeCount(U.driver) === "2" || fuelSafeCount(U.driver) === "3", fuelSafeCount(U.driver));

applyFile("supabase/rollback-00087.sql");
{
  const r = psqlAs(U.admin, weeklyFuel("2027-03-08"), { allowError: true });
  check("rollback-00087: restores the 00085 definition (admin hits 42702 again)", !r.ok && /ambiguous/i.test(r.text), r.text.slice(0, 160));
  check("rollback-00087: dispatcher still refused", refused(U.dispatcher, weeklyFuel("2027-03-22")).refused);
}
applyFile("supabase/migrations/00087_fix_weekly_fuel_invoice_ambiguity.sql");

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

applyFile("supabase/rollback-00082.sql");
psqlAdmin(`insert into public.workshop_bills (id, organisation_id, supplier_id, bill_date, invoice_ref, subtotal_excl, vat_amount, total_incl)
  values ('${BILL2}', '${ORG}', '${SUPPLIER}', date '2026-10-02', 'INV-82', 10, 1.5, 11.5) on conflict (id) do nothing;`);
psqlAdmin(`select public.delete_workshop_bill('${U.admin}'::uuid, '${ORG}'::uuid, '${BILL2}'::uuid);`);
const meta2 = JSON.parse(
  psqlAdmin(`select metadata::text from public.audit_logs where action = 'workshop_bill.deleted' and entity_id = '${BILL2}' limit 1;`) || "{}"
);
check("rollback-00082: audit metadata back to invoice_ref + total_incl only", !("supplier_name" in meta2) && meta2.invoice_ref === "INV-82", JSON.stringify(meta2));

applyFile("supabase/migrations/00081_finance_select_exclude_supervisor.sql");
applyFile("supabase/migrations/00082_delete_workshop_bill_supplier_audit.sql");
applyFile("supabase/migrations/00084_finance_rate_cards_payrates_admin_only.sql");
applyFile("supabase/migrations/00085_finance_writes_admin_only.sql");
applyFile("supabase/migrations/00087_fix_weekly_fuel_invoice_ambiguity.sql");
check("re-applied 00085: dispatcher cannot insert rate_cards", refused(U.dispatcher, WRITES["insert rate_cards"]).refused);
check("re-applied 00085: list_archived_rate_cards empty for dispatcher", listArchived(U.dispatcher) === "0");
check("re-applied 00085: generate_payroll_run refuses dispatcher", refused(U.dispatcher, RPCS.generate_payroll_run).refused);
for (const t of [...FINANCE_00081, ...FINANCE_00084]) {
  check(`re-applied: dispatcher sees no ${t}`, count(U.dispatcher, t) === "0", count(U.dispatcher, t));
  check(`re-applied: supervisor sees no ${t}`, count(U.supervisor, t) === "0", count(U.supervisor, t));
  check(`re-applied: manager sees ${t}`, Number(count(U.manager, t)) > 0);
}

applyFile("supabase/migrations/00086_fuel_cost_finance_only.sql");
check("re-applied 00086: dispatcher cannot SELECT total_amount", permDenied(fuelDirect(U.dispatcher, "total_amount")));
check("re-applied 00086: supervisor list_fuel_fillup_amounts empty", fuelAmounts(U.supervisor).startsWith("0|"));
check("re-applied 00086: manager list_fuel_fillup_amounts returns rows", Number(fuelAmounts(U.manager).split("|")[0]) >= 2);

checkWeeklyFuel("re-applied 00087");

applyFile("supabase/migrations/00093_fuel_prices.sql");
applyFile("supabase/migrations/00094_fuel_fillup_price_lock.sql");
applyFile("supabase/migrations/00095_fuel_price_backfill.sql");
check("re-applied 00094: driver list_fuel_fillup_amounts returns 0 rows", fuelAmounts(U.driver) === "0|0", fuelAmounts(U.driver));
check("re-applied 00094: dispatcher cannot SELECT total_amount", permDenied(fuelDirect(U.dispatcher, "total_amount")));
checkWeeklyFuel("re-applied 00094");

process.exit(failed);
