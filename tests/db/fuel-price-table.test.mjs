#!/usr/bin/env node
/**
 * Postgres check for 00093 (fuel_prices), 00094 (fill-up price lock) and
 * 00095 (opt-in backfill), plus their rollbacks.
 *
 * All prices below are FAKE fixtures labelled DEMO (source 'DEMO' or the
 * manual RPC) — never real DMPR rates.
 *
 *   - RLS: driver / dispatcher / supervisor / company_manager / employee see 0
 *     fuel_prices rows and cannot write; admin / manager see global + own org
 *     only; list_fuel_prices refuses non-finance.
 *   - Pending global rows never price a fill (needs_price, money NULL — not 0).
 *   - confirm_fuel_prices copies to the caller's org only; idempotent; another
 *     org's admin cannot confirm for it.
 *   - resolve + lock: confirmed org rate in force on the Africa/Johannesburg
 *     slip date; later rates do not re-price; locked money cannot change;
 *     a used rate cannot be edited; p_unit_price is ignored.
 *   - list_fuel_fillup_amounts / log_fuel_fillup: no amounts for driver,
 *     dispatcher, supervisor.
 *   - generate_weekly_fuel_invoice raises on a needs_price week and creates no
 *     invoice; succeeds after backfill with real (non-zero) amounts.
 *   - backfill_unpriced_fuel_fillups: finance only, prices needs_price rows,
 *     never overwrites a locked / legacy price.
 *   - ingest_global_fuel_prices / notify_fuel_price_ingest_failure:
 *     service_role only; idempotent; notify changes no price.
 *   - rollback-00095 / 00094 / 00093 then re-apply.
 *
 * Run: npm run test:fuel-prices-00093   (bootstraps a throwaway local DB;
 *      SKIP_BOOTSTRAP=1 reuses the current one)
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

const id = (n) => `f9300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id(1);
const ORG_B = id(2);
const U = {
  admin: id(11),
  manager: id(12),
  dispatcher: id(13),
  supervisor: id(14),
  cm: id(15),
  driver: id(16),
  employee: id(17),
  adminB: id(18),
};
const DRIVER_ROW = id(201);
const COMPANY = id(301);
const COMPANY_B = id(302);
const VEHICLE = id(401);
const VEHICLE2 = id(402);
const VEHICLE_B = id(403);

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = 1;
};

function psqlAdmin(body, { allowError = false } = {}) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return allowError
    ? { ok: res.status === 0, out: (res.stdout ?? "").trim(), text: `${res.stderr ?? ""}${res.stdout ?? ""}` }
    : (res.stdout ?? "").trim();
}

function psqlAs(userId, body, { allowError = true } = {}) {
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

/** Run as service_role (what the cron's service client uses). */
function psqlService(body) {
  return psqlAdmin(`begin; set local role service_role; ${body} commit;`, { allowError: true });
}

function applyFile(rel) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-f", join(root, rel)],
    { encoding: "utf8" }
  );
  check(`apply ${rel}`, res.status === 0, (res.stderr || res.stdout || "").slice(0, 300));
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

// Local harness only: bootstrap's broad GRANT ... ON ALL TABLES / FUNCTIONS
// re-opens what 00093/00094 revoke; re-apply to reach the hosted end state.
applyFile("supabase/migrations/00093_fuel_prices.sql");
applyFile("supabase/migrations/00094_fuel_fillup_price_lock.sql");
applyFile("supabase/migrations/00095_fuel_price_backfill.sql");
psqlAdmin(`grant usage on schema auth to authenticated;`);

// ---------------------------------------------------------------------------
// Seed (fake data)
// ---------------------------------------------------------------------------
const users = Object.entries(U)
  .map(
    ([k, uid]) =>
      `('00000000-0000-0000-0000-000000000000', '${uid}', 'authenticated', 'authenticated', 'f93-${k}@fuel.test', 'x', now(), now(), now(), '{}', '{}')`
  )
  .join(",\n");
psqlAdmin(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ${users} on conflict (id) do nothing;
insert into public.organisations (id, name, slug, status) values
  ('${ORG}', 'DEMO Fuel Org A', 'demo-fuel-a', 'active'),
  ('${ORG_B}', 'DEMO Fuel Org B', 'demo-fuel-b', 'active')
on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, user_id, role, status) values
  ('${ORG}', '${U.admin}', 'organisation_admin', 'active'),
  ('${ORG}', '${U.manager}', 'manager', 'active'),
  ('${ORG}', '${U.dispatcher}', 'dispatcher', 'active'),
  ('${ORG}', '${U.supervisor}', 'supervisor', 'active'),
  ('${ORG}', '${U.cm}', 'company_manager', 'active'),
  ('${ORG}', '${U.driver}', 'driver', 'active'),
  ('${ORG}', '${U.employee}', 'employee', 'active'),
  ('${ORG_B}', '${U.adminB}', 'organisation_admin', 'active')
on conflict do nothing;
insert into public.companies (id, organisation_id, name, status) values
  ('${COMPANY}', '${ORG}', 'DEMO Fuel Co', 'active'),
  ('${COMPANY_B}', '${ORG_B}', 'DEMO Fuel Co B', 'active')
on conflict (id) do nothing;
insert into public.member_scopes (organisation_id, membership_id, company_id)
select '${ORG}', m.id, '${COMPANY}' from public.organisation_members m
where m.organisation_id = '${ORG}' and m.user_id = '${U.cm}'
on conflict do nothing;
insert into public.drivers (id, organisation_id, profile_id, full_name, status)
values ('${DRIVER_ROW}', '${ORG}', '${U.driver}', 'DEMO Fuel Driver', 'active') on conflict (id) do nothing;
insert into public.vehicles (id, organisation_id, name, registration_number, status, vehicle_type, company_id) values
  ('${VEHICLE}', '${ORG}', 'DEMO Van', 'DEMO-001', 'active', 'other', '${COMPANY}'),
  ('${VEHICLE2}', '${ORG}', 'DEMO Van 2', 'DEMO-002', 'active', 'other', '${COMPANY}'),
  ('${VEHICLE_B}', '${ORG_B}', 'DEMO Van B', 'DEMO-B01', 'active', 'other', '${COMPANY_B}')
on conflict (id) do nothing;
`);

// Global PENDING reference rows (fake DEMO prices; real ones come from the cron).
psqlAdmin(`
insert into public.fuel_prices (organisation_id, fuel_type, region, effective_from, price_per_litre, source, status) values
  (null, 'diesel_50ppm', 'coastal', date '2027-01-06', 11.1111, 'DEMO', 'pending'),
  (null, 'diesel_50ppm', 'coastal', date '2027-02-03', 12.2222, 'DEMO', 'pending'),
  (null, 'petrol_95',    'coastal', date '2027-02-03', 13.3333, 'DEMO', 'pending'),
  (null, 'diesel_50ppm', 'inland',  date '2027-02-03', 14.4444, 'DEMO', 'pending')
on conflict do nothing;
`);

const q1 = (user, sql) => psqlAs(user, sql).out;
const pricesVisible = (user) => q1(user, `select count(*)::text from public.fuel_prices;`);

// ---------------------------------------------------------------------------
// RLS on fuel_prices
// ---------------------------------------------------------------------------
for (const who of ["driver", "dispatcher", "supervisor", "cm", "employee"]) {
  check(`RLS: ${who} sees 0 fuel_prices rows`, pricesVisible(U[who]) === "0", pricesVisible(U[who]));
  const ins = psqlAs(
    U[who],
    `insert into public.fuel_prices (organisation_id, fuel_type, region, effective_from, price_per_litre, source, status, confirmed_at)
     values ('${ORG}', 'diesel_50ppm', 'coastal', date '2026-01-01', 1, 'DEMO', 'confirmed', now());`
  );
  check(`RLS: ${who} cannot INSERT fuel_prices`, !ins.ok && /permission denied/i.test(ins.text), ins.text.slice(0, 120));
  const list = psqlAs(U[who], `select count(*) from public.list_fuel_prices('${ORG}'::uuid);`);
  check(`list_fuel_prices refuses ${who}`, !list.ok && /not authori/i.test(list.text), list.text.slice(0, 120));
  const conf = psqlAs(U[who], `select public.confirm_fuel_prices('${ORG}'::uuid);`);
  check(`confirm_fuel_prices refuses ${who}`, !conf.ok && /not authori/i.test(conf.text), conf.text.slice(0, 120));
  const up = psqlAs(U[who], `select public.upsert_org_fuel_price('${ORG}'::uuid, 'diesel_50ppm', date '2027-01-01', 5);`);
  check(`upsert_org_fuel_price refuses ${who}`, !up.ok && /not authori/i.test(up.text), up.text.slice(0, 120));
}
check("RLS: admin sees the 4 global rows", pricesVisible(U.admin) === "4", pricesVisible(U.admin));
check("RLS: manager sees the 4 global rows", pricesVisible(U.manager) === "4", pricesVisible(U.manager));
const adminUpdate = psqlAs(U.admin, `update public.fuel_prices set price_per_litre = 1;`);
check("RLS: even admin cannot UPDATE fuel_prices directly (RPC only)", !adminUpdate.ok && /permission denied/i.test(adminUpdate.text), adminUpdate.text.slice(0, 120));
const resolveAsAdmin = psqlAs(U.admin, `select * from public.resolve_fuel_unit_price('${ORG}'::uuid, 'diesel_50ppm', 'coastal', date '2027-02-10');`);
check("resolve_fuel_unit_price is not client-callable (even admin)", !resolveAsAdmin.ok && /permission denied/i.test(resolveAsAdmin.text), resolveAsAdmin.text.slice(0, 120));
const resolveAsDriver = psqlAs(U.driver, `select * from public.resolve_fuel_unit_price('${ORG}'::uuid, 'diesel_50ppm', 'coastal', date '2027-02-10');`);
check("resolve_fuel_unit_price is not callable by driver", !resolveAsDriver.ok && /permission denied/i.test(resolveAsDriver.text));

// ---------------------------------------------------------------------------
// Pending global rows never price a fill; needs_price is NULL money, not R0
// ---------------------------------------------------------------------------
const log = (user, { vehicle = VEHICLE, odo, litres = 10, at, type = "'diesel_50ppm'", region = "null", unit = 99 }) =>
  psqlAs(
    user,
    `select (to_jsonb(public.log_fuel_fillup(
       p_organisation_id => '${ORG}'::uuid, p_vehicle_id => '${vehicle}'::uuid,
       p_odometer_km => ${odo}, p_litres => ${litres}, p_filled_at => timestamptz '${at}',
       p_unit_price => ${unit}, p_fuel_type => ${type}, p_region => ${region})))::text;`
  );
const stored = (odo) =>
  psqlAdmin(`select coalesce(unit_price::text, 'null') || '|' || coalesce(total_amount::text, 'null') || '|' || price_status || '|' || coalesce(fuel_type, 'null') || '|' || region
             from public.fuel_fillups where organisation_id = '${ORG}' and odometer_km = ${odo}`);

const noType = log(U.driver, { odo: 100, at: "2027-02-10 08:00:00+02", type: "null" });
check("log_fuel_fillup requires fuel_type", !noType.ok && /fuel type is required/i.test(noType.text), noType.text.slice(0, 120));

const pre = log(U.driver, { odo: 100, at: "2027-02-10 08:00:00+02" });
check("driver logs before any confirmed rate", pre.ok, pre.text.slice(0, 160));
check("pending global rate is NOT used: needs_price with null money (not 0), p_unit_price ignored", stored(100) === "null|null|needs_price|diesel_50ppm|coastal", stored(100));
const preDisp = log(U.dispatcher, { vehicle: VEHICLE2, odo: 500, at: "2027-02-11 08:00:00+02" });
const preDispJ = preDisp.ok ? JSON.parse(preDisp.out) : {};
check("dispatcher logs: money + status masked on return", preDisp.ok && preDispJ.total_amount === null && preDispJ.price_status === null, preDisp.text.slice(0, 160));
check("dispatcher-supplied unit price ignored", stored(500).startsWith("null|null|needs_price"), stored(500));

const amounts = (user) =>
  q1(user, `select count(*)::text || '|' || count(total_amount)::text || '|' || count(*) filter (where price_status = 'needs_price')::text from public.list_fuel_fillup_amounts('${ORG}'::uuid);`);
check("list_fuel_fillup_amounts: manager sees the 2 rows, 0 with money, 2 needs_price", amounts(U.manager) === "2|0|2", amounts(U.manager));
for (const who of ["driver", "dispatcher", "supervisor", "cm", "employee"]) {
  check(`list_fuel_fillup_amounts: ${who} gets 0 rows`, amounts(U[who]) === "0|0|0", amounts(U[who]));
}
for (const who of ["driver", "dispatcher", "supervisor", "manager"]) {
  for (const col of ["price_status", "priced_from_id", "priced_at", "unit_price", "total_amount"]) {
    const r = psqlAs(U[who], `select ${col} from public.fuel_fillups limit 1;`);
    check(`${who} cannot SELECT fuel_fillups.${col}`, !r.ok && /permission denied/i.test(r.text), r.text.slice(0, 100));
  }
}
check("driver can SELECT fuel_type, region on own row", q1(U.driver, `select fuel_type || '|' || region from public.fuel_fillups where odometer_km = 100;`) === "diesel_50ppm|coastal");

// Invoice for a week with a needs_price fill: raises, no invoice row.
const weekly = (user, week) =>
  psqlAs(user, `select (to_jsonb(public.generate_weekly_fuel_invoice('${ORG}'::uuid, '${COMPANY}'::uuid, date '${week}')))::text;`);
const invoicesFor = (week) =>
  psqlAdmin(`select count(*) from public.invoices where organisation_id = '${ORG}' and company_id = '${COMPANY}' and period_start = date '${week}'`);
const raised = weekly(U.admin, "2027-02-08");
check("generate_weekly_fuel_invoice raises when the week has needs_price fills", !raised.ok && /need a price/i.test(raised.text), raised.text.slice(0, 200));
check("...and creates no invoice", invoicesFor("2027-02-08") === "0");

// ---------------------------------------------------------------------------
// confirm_fuel_prices: org only, idempotent
// ---------------------------------------------------------------------------
const confirmA = psqlAs(U.admin, `select public.confirm_fuel_prices('${ORG}'::uuid, date '2027-01-06')::text;`);
check("confirm (specific date 2027-01-06) copies 1 row", confirmA.ok && confirmA.out === "1", confirmA.text.slice(0, 160));
const confirmA2 = psqlAs(U.manager, `select public.confirm_fuel_prices('${ORG}'::uuid, date '2027-02-03')::text;`);
check("manager confirm 2027-02-03 copies 3 rows", confirmA2.ok && confirmA2.out === "3", confirmA2.text.slice(0, 160));
const again = psqlAs(U.admin, `select public.confirm_fuel_prices('${ORG}'::uuid, date '2027-02-03')::text;`);
check("confirm is idempotent (0 new rows)", again.ok && again.out === "0", again.text.slice(0, 160));
const current = psqlAs(U.admin, `select public.confirm_fuel_prices('${ORG}'::uuid)::text;`);
check("confirm current (no date) is idempotent too (future-dated already copied)", current.ok && current.out === "0", current.text.slice(0, 160));
check(
  "org A has 4 confirmed copies with source DEMO, confirmed_by set",
  psqlAdmin(`select count(*) from public.fuel_prices where organisation_id = '${ORG}' and status = 'confirmed' and source = 'DEMO' and confirmed_by is not null`) === "4"
);
check("confirm did not touch org B", psqlAdmin(`select count(*) from public.fuel_prices where organisation_id = '${ORG_B}'`) === "0");
check("global rows are still pending and unchanged", psqlAdmin(`select count(*) from public.fuel_prices where organisation_id is null and status = 'pending'`) === "4");
const crossOrg = psqlAs(U.adminB, `select public.confirm_fuel_prices('${ORG}'::uuid);`);
check("org B admin cannot confirm for org A", !crossOrg.ok && /not authori/i.test(crossOrg.text), crossOrg.text.slice(0, 120));
check("org B admin sees global rows but not org A rows", pricesVisible(U.adminB) === "4", pricesVisible(U.adminB));
check("org A admin sees global + own rows", pricesVisible(U.admin) === "8", pricesVisible(U.admin));
const listB = psqlAs(U.adminB, `select count(*)::text from public.list_fuel_prices('${ORG}'::uuid);`);
check("list_fuel_prices for another org refused", !listB.ok && /not authori/i.test(listB.text));

// Org B fill: still needs_price (its admin never confirmed).
const bLog = psqlAs(
  U.adminB,
  `select (to_jsonb(public.log_fuel_fillup(p_organisation_id => '${ORG_B}'::uuid, p_vehicle_id => '${VEHICLE_B}'::uuid,
     p_odometer_km => 10, p_litres => 10, p_filled_at => timestamptz '2027-02-10 08:00:00+02', p_fuel_type => 'diesel_50ppm')))::text;`
);
const bj = bLog.ok ? JSON.parse(bLog.out) : {};
check("org B fill stays needs_price (A's confirmation does not leak)", bLog.ok && bj.price_status === "needs_price" && bj.total_amount === null, bLog.text.slice(0, 160));

// ---------------------------------------------------------------------------
// resolve + lock
// ---------------------------------------------------------------------------
const mgr = log(U.manager, { odo: 1000, litres: 20, at: "2027-02-10 08:00:00+02" });
const mj = mgr.ok ? JSON.parse(mgr.out) : {};
check("manager log priced at rate in force (2027-02-03 rate, p_unit_price ignored)", mgr.ok && Number(mj.unit_price) === 12.2222 && Number(mj.total_amount) === 244.44 && mj.price_status === "priced" && mj.priced_from_id, mgr.text.slice(0, 200));
// Slip date is the Africa/Johannesburg date: 2027-02-02 23:30 SAST = 21:30 UTC
const boundary = log(U.driver, { odo: 1100, litres: 10, at: "2027-02-02 23:30:00+02" });
check("driver log works", boundary.ok, boundary.text.slice(0, 160));
check("slip date 2027-02-02 (SAST) uses the 2027-01-06 rate, not 2027-02-03", stored(1100) === "11.1111|111.11|priced|diesel_50ppm|coastal", stored(1100));
const bj2 = boundary.ok ? JSON.parse(boundary.out) : {};
check("driver log_fuel_fillup return has no amounts / status", bj2.unit_price === null && bj2.total_amount === null && bj2.currency === null && bj2.price_status === null && bj2.priced_from_id === null);
const sastNext = log(U.driver, { odo: 1150, litres: 10, at: "2027-02-02 22:30:00+00" }); // 00:30 SAST on 2027-02-03
check("22:30 UTC on 2 Feb = 3 Feb SAST uses the new 2027-02-03 rate", sastNext.ok && stored(1150) === "12.2222|122.22|priced|diesel_50ppm|coastal", stored(1150));
const inland = log(U.dispatcher, { vehicle: VEHICLE2, odo: 600, litres: 10, at: "2027-02-12 08:00:00+02", region: "'inland'" });
check("region honoured (inland rate)", inland.ok && stored(600) === "14.4444|144.44|priced|diesel_50ppm|inland", stored(600));
const unknown = log(U.manager, { odo: 1200, litres: 10, at: "2027-02-10 09:00:00+02", type: "'petrol_93'" });
check("type without a confirmed rate => needs_price", unknown.ok && stored(1200) === "null|null|needs_price|petrol_93|coastal", stored(1200));

// New, later rate does not re-price an already priced fill
const later = psqlAs(U.admin, `select (public.upsert_org_fuel_price('${ORG}'::uuid, 'diesel_50ppm', date '2027-02-09', 19.9999)).status;`);
check("admin manual rate (effective 2027-02-09) accepted as confirmed", later.ok && later.out === "confirmed", later.text.slice(0, 160));
check("priced fill keeps its locked price after a new rate", stored(1000) === "12.2222|244.44|priced|diesel_50ppm|coastal", stored(1000));
const after = log(U.driver, { odo: 1300, litres: 10, at: "2027-02-10 10:00:00+02" });
check("new fill after 2027-02-09 uses the new manual rate", after.ok && stored(1300) === "19.9999|200.00|priced|diesel_50ppm|coastal", stored(1300));

// Lock guard
const lockAdmin = psqlAdmin(`update public.fuel_fillups set total_amount = 1 where organisation_id = '${ORG}' and odometer_km = 1000;`, { allowError: true });
check("lock: even the table owner cannot change a priced fill's money", !lockAdmin.ok && /price is locked/i.test(lockAdmin.text), lockAdmin.text.slice(0, 160));
const lockFrom = psqlAdmin(`update public.fuel_fillups set priced_from_id = null where organisation_id = '${ORG}' and odometer_km = 1000;`, { allowError: true });
check("lock: priced_from_id cannot change", !lockFrom.ok && /price is locked/i.test(lockFrom.text));
const lockStatus = psqlAdmin(`update public.fuel_fillups set price_status = 'needs_price', unit_price = null, total_amount = null, priced_from_id = null where organisation_id = '${ORG}' and odometer_km = 1000;`, { allowError: true });
check("lock: cannot flip a priced fill back to needs_price", !lockStatus.ok && /price is locked/i.test(lockStatus.text));
const opsEdit = psqlAs(U.dispatcher, `update public.fuel_fillups set notes = 'DEMO note' where organisation_id = '${ORG}' and odometer_km = 1000;`);
check("dispatcher can still edit ops columns on a priced fill", opsEdit.ok, opsEdit.text.slice(0, 160));
for (const who of ["dispatcher", "manager", "driver"]) {
  const r = psqlAs(U[who], `update public.fuel_fillups set unit_price = 1 where organisation_id = '${ORG}';`);
  check(`${who} cannot UPDATE unit_price directly`, !r.ok && /permission denied/i.test(r.text), r.text.slice(0, 120));
}
const directIns = psqlAs(
  U.driver,
  `insert into public.fuel_fillups (organisation_id, vehicle_id, driver_id, odometer_km, litres, unit_price, total_amount, price_status)
   values ('${ORG}', '${VEHICLE}', '${DRIVER_ROW}', 5000, 10, 1, 10, 'priced');`
);
check("driver cannot INSERT a fill with its own price", !directIns.ok && /permission denied/i.test(directIns.text), directIns.text.slice(0, 120));
const rateUsed = psqlAs(U.admin, `select public.upsert_org_fuel_price('${ORG}'::uuid, 'diesel_50ppm', date '2027-02-03', 1.2345);`);
check("a rate that priced fills cannot be edited", !rateUsed.ok && /locked/i.test(rateUsed.text), rateUsed.text.slice(0, 160));
const rateUnused = psqlAs(U.admin, `select (public.upsert_org_fuel_price('${ORG}'::uuid, 'petrol_95', date '2027-02-03', 13.5)).price_per_litre::text;`);
check("an unused org rate can be corrected (manual)", rateUnused.ok && Number(rateUnused.out) === 13.5, rateUnused.text.slice(0, 160));

// ---------------------------------------------------------------------------
// Backfill (opt-in, finance only, never overwrites)
// ---------------------------------------------------------------------------
psqlAdmin(`insert into public.fuel_fillups (organisation_id, vehicle_id, driver_id, company_id, odometer_km, litres, unit_price, total_amount, filled_at, price_status, fuel_type)
  values ('${ORG}', '${VEHICLE2}', null, '${COMPANY}', 700, 10, 7.7777, 77.78, timestamptz '2027-02-12 09:00:00+02', 'priced', 'diesel_50ppm');`);
for (const who of ["driver", "dispatcher", "supervisor", "cm"]) {
  const r = psqlAs(U[who], `select * from public.backfill_unpriced_fuel_fillups('${ORG}'::uuid);`);
  check(`backfill refuses ${who}`, !r.ok && /not authori/i.test(r.text), r.text.slice(0, 120));
}
check("still needs_price before the admin opts in (nothing automatic)", stored(100).startsWith("null|null|needs_price") && stored(500).startsWith("null|null|needs_price"));
const bf = psqlAs(U.admin, `select priced::text || '|' || still_needs_price::text || '|' || skipped_no_fuel_type::text from public.backfill_unpriced_fuel_fillups('${ORG}'::uuid);`);
check("backfill prices the 2 needs_price diesel fills, petrol_93 (no rate) stays", bf.ok && bf.out === "2|1|0", bf.text.slice(0, 160));
check("backfill priced odo 100 at the slip-date rate (2027-02-09 manual)", stored(100) === "19.9999|200.00|priced|diesel_50ppm|coastal", stored(100));
check("backfill priced odo 500 at the slip-date rate (2027-02-09 manual)", stored(500) === "19.9999|200.00|priced|diesel_50ppm|coastal", stored(500));
check("backfill did not overwrite the legacy locked price", stored(700) === "7.7777|77.78|priced|diesel_50ppm|coastal", stored(700));
check("backfill did not overwrite an existing priced fill", stored(1000) === "12.2222|244.44|priced|diesel_50ppm|coastal", stored(1000));
check("backfill did not invent a rate for petrol_93", stored(1200) === "null|null|needs_price|petrol_93|coastal", stored(1200));
const bf2 = psqlAs(U.manager, `select priced::text from public.backfill_unpriced_fuel_fillups('${ORG}'::uuid);`);
check("second backfill prices nothing", bf2.ok && bf2.out === "0", bf2.text.slice(0, 120));
check("backfill did not touch org B", psqlAdmin(`select price_status from public.fuel_fillups where organisation_id = '${ORG_B}'`) === "needs_price");

// Invoice: still blocked by petrol_93 (needs_price), then OK once removed.
const raised2 = weekly(U.manager, "2027-02-08");
check("invoice still raises while one fill needs a price", !raised2.ok && /1 fill-up\(s\) need a price/i.test(raised2.text), raised2.text.slice(0, 200));
psqlAdmin(`update public.fuel_fillups set deleted_at = now() where organisation_id = '${ORG}' and odometer_km = 1200;`);
const inv = weekly(U.admin, "2027-02-08");
const ij = inv.ok ? JSON.parse(inv.out) : {};
// Week 2027-02-08..14 (SAST): odo 100 (200.00), 500 (200.00), 600 (144.44), 700 (77.78), 1000 (244.44), 1200 deleted, 1300 (200.00)
check("invoice generated once every fill is priced; total is the sum of locked amounts", inv.ok && Number(ij.total) === 1066.66, inv.text.slice(0, 200));
check(
  "no R0 fuel lines on the invoice",
  psqlAdmin(`select count(*) from public.invoice_lines where invoice_id = '${ij.id}' and (amount is null or amount = 0)`) === "0" &&
    psqlAdmin(`select count(*) from public.invoice_lines where invoice_id = '${ij.id}' and line_type = 'fuel'`) === "6"
);
const invAgain = weekly(U.admin, "2027-02-08");
check("existing-invoice short-circuit unchanged", invAgain.ok && JSON.parse(invAgain.out).id === ij.id);
check("weekly invoice still refuses dispatcher", !weekly(U.dispatcher, "2027-02-15").ok);

// ---------------------------------------------------------------------------
// Cron RPCs: service_role only
// ---------------------------------------------------------------------------
const ROWS = JSON.stringify([
  { fuel_type: "diesel_50ppm", region: "coastal", effective_from: "2027-03-03", price_per_litre: 10.5 },
  { fuel_type: "petrol_95", region: "inland", effective_from: "2027-03-03", price_per_litre: 10.6 },
]);
for (const who of ["admin", "driver"]) {
  const r = psqlAs(U[who], `select public.ingest_global_fuel_prices('${ROWS}'::jsonb, 'dmpr_official');`);
  check(`ingest_global_fuel_prices not callable by ${who}`, !r.ok && /permission denied/i.test(r.text), r.text.slice(0, 120));
  const n = psqlAs(U[who], `select public.notify_fuel_price_ingest_failure('x');`);
  check(`notify_fuel_price_ingest_failure not callable by ${who}`, !n.ok && /permission denied/i.test(n.text));
}
const ing = psqlService(`select public.ingest_global_fuel_prices('${ROWS}'::jsonb, 'dmpr_official');`);
check("service_role ingest inserts 2 global pending rows", ing.ok && ing.out === "2", ing.text.slice(0, 160));
const ing2 = psqlService(`select public.ingest_global_fuel_prices('${ROWS}'::jsonb, 'dmpr_official');`);
check("ingest is idempotent (0 on re-run)", ing2.ok && ing2.out === "0", ing2.text.slice(0, 160));
const ingDemo = psqlService(`select public.ingest_global_fuel_prices('${ROWS}'::jsonb, 'DEMO');`);
check("ingest refuses a DEMO source for global rows", !ingDemo.ok && /invalid source/i.test(ingDemo.text));
check("ingested rows are global + pending", psqlAdmin(`select count(*) from public.fuel_prices where organisation_id is null and source = 'dmpr_official' and status = 'pending'`) === "2");
const before = psqlAdmin(`select count(*)::text || '|' || coalesce(sum(price_per_litre), 0)::text from public.fuel_prices`);
const notified = psqlService(`select public.notify_fuel_price_ingest_failure('DEMO: release page not found');`);
check("notify creates in-app notices", notified.ok && Number(notified.out) >= 3, notified.text.slice(0, 160));
check(
  "notify reached admin, manager and org B admin once each",
  psqlAdmin(`select count(*) from public.admin_inbox_notifications where notification_type = 'fuel_price_ingest_failed' and recipient_user_id in ('${U.admin}', '${U.manager}', '${U.adminB}')`) === "3"
);
check("notify changed no price", psqlAdmin(`select count(*)::text || '|' || coalesce(sum(price_per_litre), 0)::text from public.fuel_prices`) === before);
check(
  "notify did not reach dispatcher / driver",
  psqlAdmin(`select count(*) from public.admin_inbox_notifications where notification_type = 'fuel_price_ingest_failed' and recipient_user_id in ('${U.dispatcher}', '${U.driver}', '${U.supervisor}')`) === "0"
);
const anon = spawnSync(
  "psql",
  ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-tA", "-c",
   `begin; set local role anon; select count(*) from public.list_fuel_prices('${ORG}'::uuid); commit;`],
  { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
);
check("anon cannot execute list_fuel_prices", anon.status !== 0 && /permission denied/i.test(anon.stderr ?? ""), anon.stderr);

// ---------------------------------------------------------------------------
// Rollback rehearsal, then re-apply
// ---------------------------------------------------------------------------
applyFile("supabase/rollback-00095.sql");
check("rollback-00095: backfill RPC gone", psqlAdmin(`select count(*) from pg_proc where proname = 'backfill_unpriced_fuel_fillups'`) === "0");
check("rollback-00095: priced fills stay priced", stored(100).endsWith("|priced|diesel_50ppm|coastal"));
applyFile("supabase/rollback-00094.sql");
check("rollback-00094: price columns gone", psqlAdmin(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fuel_fillups' and column_name in ('fuel_type','region','price_status','priced_from_id','priced_at')`) === "0");
check("rollback-00094: locked money kept in unit_price / total_amount", psqlAdmin(`select total_amount::text from public.fuel_fillups where organisation_id = '${ORG}' and odometer_km = 1000`) === "244.44");
check("rollback-00094: 10-arg log_fuel_fillup (00086) is back", psqlAdmin(`select count(*) from pg_proc where proname = 'log_fuel_fillup' and pronargs = 10`) === "1" && psqlAdmin(`select count(*) from pg_proc where proname = 'log_fuel_fillup'`) === "1");
check("rollback-00094: driver gets own amounts again (00086)", Number(q1(U.driver, `select count(*) from public.list_fuel_fillup_amounts('${ORG}'::uuid);`)) > 0);
check("rollback-00094: weekly fuel invoice has the 00087 body", /coalesce\(\s*fill\.total_amount/.test(psqlAdmin(`select prosrc from pg_proc where proname = 'generate_weekly_fuel_invoice'`)));
applyFile("supabase/rollback-00093.sql");
check("rollback-00093: fuel_prices gone", psqlAdmin(`select (to_regclass('public.fuel_prices') is null)::text`) === "true");
check("rollback-00093: fuel price RPCs gone", psqlAdmin(`select count(*) from pg_proc where proname in ('list_fuel_prices','confirm_fuel_prices','upsert_org_fuel_price','resolve_fuel_unit_price','ingest_global_fuel_prices','notify_fuel_price_ingest_failure')`) === "0");

applyFile("supabase/migrations/00093_fuel_prices.sql");
applyFile("supabase/migrations/00094_fuel_fillup_price_lock.sql");
applyFile("supabase/migrations/00095_fuel_price_backfill.sql");
check("re-applied 00094: existing fills with money are legacy-locked 'priced'", psqlAdmin(`select price_status from public.fuel_fillups where organisation_id = '${ORG}' and odometer_km = 1000`) === "priced");
check("re-applied 00094: driver list_fuel_fillup_amounts back to 0 rows", amounts(U.driver) === "0|0|0", amounts(U.driver));
check("re-applied 00093: driver sees 0 fuel_prices rows", pricesVisible(U.driver) === "0");
const relog = log(U.driver, { odo: 9000, at: "2027-04-01 08:00:00+02" });
check("re-applied: fill with no confirmed rate (rates dropped by rollback) => needs_price", relog.ok && stored(9000) === "null|null|needs_price|diesel_50ppm|coastal", stored(9000));

process.exit(failed);
