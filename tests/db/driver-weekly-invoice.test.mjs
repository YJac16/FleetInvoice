#!/usr/bin/env node
/**
 * generate_driver_weekly_invoice — SAST week bounds + per-trip rate resolution.
 * Requires: bash scripts/local-db/bootstrap-native.sh
 */
import { spawnSync } from "node:child_process";

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000201";

const WCL = "e5000000-0000-4000-8000-000000000001";
const RATE_CHANGE = "e5000000-0000-4000-8000-000000000010";
const NO_RATE = "e5000000-0000-4000-8000-000000000009";

const ROUTE = "f5000000-0000-4000-8000-000000000601";
const AREA = "f5000000-0000-4000-8000-000000000801";

const RATE_ERR =
  "No trip rate configured for this company. Add a rate before saving this waybill.";

const WEEK_START = "2026-09-21";
const WEEK_END_SUN = "2026-09-27";
const WEEK_END_MON_LEGACY = "2026-09-28";

function moneyEq(actual, expected) {
  return Number.parseFloat(actual).toFixed(2) === Number.parseFloat(expected).toFixed(2);
}

function record(id, pass, evidence) {
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psqlAdmin(sql) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim();
}

function psqlAs(userId, sql, { allowError = false } = {}) {
  const body = `
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${userId}';
${sql}
COMMIT;
`;
  const res = spawnSync(
    "psql",
    ["-q", "-h", "127.0.0.1", "-U", PG.auditUser, "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { env: { ...process.env, PGPASSWORD: PG.auditPassword }, encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psqlAs failed");
  }
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}

function seedRouteWeekFixtures() {
  psqlAdmin(`
    insert into public.companies (id, organisation_id, name, status)
    values
      ('${WCL}', '${ORG_A}', 'WCL Trading CC', 'active'),
      ('${RATE_CHANGE}', '${ORG_A}', 'Rate Change Co', 'active'),
      ('${NO_RATE}', '${ORG_A}', 'No Rate Co', 'active')
    on conflict (id) do update set name = excluded.name;

    insert into public.areas (id, organisation_id, name, status)
    values ('${AREA}', '${ORG_A}', 'Generator test area', 'active')
    on conflict (id) do nothing;

    insert into public.routes (id, organisation_id, company_id, area_id, name, status)
    values ('${ROUTE}', '${ORG_A}', '${RATE_CHANGE}', '${AREA}', 'Weekly gen route', 'active')
    on conflict (id) do nothing;

    update public.rate_cards
    set deleted_at = timezone('utc', now())
    where organisation_id = '${ORG_A}'
      and company_id = '${RATE_CHANGE}'
      and line_type = 'trip'
      and deleted_at is null;

    insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
    values
      ('${ORG_A}', '${RATE_CHANGE}', 'Gen v440', 'trip', 'fixed', 440, date '2026-09-21'),
      ('${ORG_A}', '${RATE_CHANGE}', 'Gen v500', 'trip', 'fixed', 500, date '2026-09-24');
  `);
}

function insertRouteTrip(plannedStart, companyId = RATE_CHANGE) {
  return psqlAdmin(`
    with t as (
      insert into public.trips (
        organisation_id, route_id, company_id, planned_start, planned_end, status, is_staff_transport
      )
      values (
        '${ORG_A}',
        '${ROUTE}',
        '${companyId}',
        timestamptz '${plannedStart}',
        timestamptz '${plannedStart}' + interval '1 hour',
        'completed',
        false
      )
      returning id
    )
    insert into public.trip_assignments (organisation_id, trip_id, driver_id, assigned_at)
    select '${ORG_A}', t.id, '${driverA}', timestamptz '${plannedStart}' from t
    returning trip_id;
  `);
}

function generateWeekly(periodEnd) {
  return psqlAs(
    adminA,
    `select (public.generate_driver_weekly_invoice(
      '${ORG_A}'::uuid,
      '${driverA}'::uuid,
      date '${WEEK_START}',
      date '${periodEnd}'
    )).period_end::text;`
  );
}

seedRouteWeekFixtures();

const legacyInvoiceId = psqlAdmin(`
  insert into public.invoices (
    organisation_id, company_id, driver_id,
    period_start, period_end, status, subtotal, total, currency
  )
  values (
    '${ORG_A}', '${WCL}', '${driverA}',
    date '${WEEK_START}', date '${WEEK_END_MON_LEGACY}', 'draft', 0, 0, 'ZAR'
  )
  returning id::text;
`);

const legacyLookup = generateWeekly(WEEK_END_MON_LEGACY);
const legacyCount = psqlAdmin(`
  select count(*)::text from public.invoices
  where organisation_id = '${ORG_A}'
    and driver_id = '${driverA}'
    and period_start = date '${WEEK_START}'
    and coalesce(trip_company, '') = ''
    and deleted_at is null
    and status <> 'void';
`);
record(
  "GEN-legacy-monday-period_end-lookup",
  legacyLookup.ok && legacyCount === "1" && legacyLookup.out === WEEK_END_MON_LEGACY,
  `invoices=${legacyCount} returned_period_end=${legacyLookup.out}`
);

psqlAdmin(`delete from public.invoices where id = '${legacyInvoiceId}'::uuid;`);

const badTrip = insertRouteTrip("2026-09-22 09:00:00+02", NO_RATE);
const blocked = psqlAs(
  adminA,
  `select public.generate_driver_weekly_invoice(
    '${ORG_A}'::uuid,
    '${driverA}'::uuid,
    date '${WEEK_START}',
    date '${WEEK_END_SUN}'
  );`,
  { allowError: true }
);
record(
  "GEN-blocks-missing-company-rate",
  !blocked.ok && blocked.text.includes(RATE_ERR),
  blocked.ok ? "unexpected success" : "error matched"
);
psqlAdmin(`delete from public.trip_assignments where trip_id = '${badTrip}'::uuid;`);
psqlAdmin(`delete from public.trips where id = '${badTrip}'::uuid;`);

const tripEarly = insertRouteTrip("2026-09-21 08:00:00+02");
const tripLate = insertRouteTrip("2026-09-24 08:00:00+02");

const gen = generateWeekly(WEEK_END_SUN);
record(
  "GEN-rpc-succeeds",
  gen.ok && gen.out === WEEK_END_SUN,
  `period_end=${gen.out}`
);

const priceRows = psqlAdmin(`
  select il.unit_price::text
  from public.invoice_lines il
  join public.trips t on t.id = il.trip_id
  join public.invoices i on i.id = il.invoice_id
  where i.organisation_id = '${ORG_A}'
    and i.driver_id = '${driverA}'
    and i.period_start = date '${WEEK_START}'
    and il.trip_id in ('${tripEarly}'::uuid, '${tripLate}'::uuid)
  order by t.planned_start;
`).split("\n");
record(
  "GEN-mid-week-rate-by-trip-date",
  moneyEq(priceRows[0], "440") && moneyEq(priceRows[1], "500"),
  `unit_prices=${priceRows.join(",")}`
);

const provenance = psqlAdmin(`
  select count(*)::text
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  where i.organisation_id = '${ORG_A}'
    and i.driver_id = '${driverA}'
    and i.period_start = date '${WEEK_START}'
    and il.trip_id in ('${tripEarly}'::uuid, '${tripLate}'::uuid)
    and il.trip_company_id = '${RATE_CHANGE}'
    and il.rate_card_id is not null
    and il.rate_effective_on is not null
    and il.unit_price is not null
    and il.amount is not null;
`);
record("GEN-line-provenance", provenance === "2", `lines=${provenance}`);
