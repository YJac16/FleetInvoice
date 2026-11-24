#!/usr/bin/env node
/**
 * Postgres check for 00081 (finance SELECT for admin/manager only) and 00082
 * (supplier_name in workshop_bill.deleted audit metadata).
 *
 *   - invoices / invoice_lines / route_prices: manager sees rows; dispatcher
 *     and supervisor see none; company_manager keeps its own company's invoice.
 *   - Driver-trip approval with the pre-filled price still works with no
 *     caller SELECT on those tables (approve_driver_trip, suggest_trip_unit_price
 *     and their helpers are SECURITY DEFINER). Approval is admin/manager
 *     (staff_can_manage_trips, 00064); dispatcher is refused by the RPC, as
 *     before 00081.
 *   - delete_workshop_bill writes supplier_name.
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

// Company manager scoped to COMPANY (member_scopes, read by company_user_can_see).
psqlAdmin(`
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
values ('${ORG}', '${COMPANY}', 'Finance rate', 'trip', 'fixed', 300, date '2026-01-01');

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

for (const table of ["invoices", "invoice_lines", "route_prices"]) {
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

process.exit(failed);
