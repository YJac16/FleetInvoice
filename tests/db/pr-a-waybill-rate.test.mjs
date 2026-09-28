#!/usr/bin/env node
/**
 * PR A — waybill company_id + rate resolution (plain Postgres).
 * Requires: bash scripts/local-db/bootstrap-native.sh
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const adminB = "b0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000201";

const WCL = "e5000000-0000-4000-8000-000000000001";
const SPRINGBOK = "e5000000-0000-4000-8000-000000000002";
const WNS = "e5000000-0000-4000-8000-000000000003";
const LEWIS_C = "e5000000-0000-4000-8000-000000000004";
const LEWIS_HO = "e5000000-0000-4000-8000-000000000005";
const TELE = "e5000000-0000-4000-8000-000000000006";
const INSPIRE = "e5000000-0000-4000-8000-000000000007";
const PROTEA = "e5000000-0000-4000-8000-000000000008";
const NO_RATE = "e5000000-0000-4000-8000-000000000009";
const RATE_CHANGE = "e5000000-0000-4000-8000-000000000010";

const RATE_ERR =
  "No trip rate configured for this company. Add a rate before saving this waybill.";

const results = [];

function moneyEq(actual, expected) {
  return Number.parseFloat(actual).toFixed(2) === Number.parseFloat(expected).toFixed(2);
}

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psqlAdmin(sql) {
  const res = spawnSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-q",
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-c",
      sql,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
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
    [
      "-q",
      "-h",
      "127.0.0.1",
      "-U",
      PG.auditUser,
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-c",
      body,
    ],
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

function seedFixtures() {
  psqlAdmin(`
    insert into public.companies (id, organisation_id, name, status)
    values
      ('${WCL}', '${ORG_A}', 'WCL Trading CC', 'active'),
      ('${SPRINGBOK}', '${ORG_A}', 'Springbok Atlas', 'active'),
      ('${WNS}', '${ORG_A}', 'WNS Global Services SA (Pty) Ltd', 'active'),
      ('${LEWIS_C}', '${ORG_A}', 'Lewis Compliance', 'active'),
      ('${LEWIS_HO}', '${ORG_A}', 'Lewis Head Office', 'active'),
      ('${TELE}', '${ORG_A}', 'Teleperformance', 'active'),
      ('${INSPIRE}', '${ORG_A}', 'Lewis Inspire', 'active'),
      ('${PROTEA}', '${ORG_A}', 'Protea Chemical', 'active'),
      ('${NO_RATE}', '${ORG_A}', 'No Rate Co', 'active'),
      ('${RATE_CHANGE}', '${ORG_A}', 'Rate Change Co', 'active'),
      ('e5000000-0000-4000-8000-000000000099', '${ORG_B}', 'Org B Secret Co', 'active')
    on conflict (id) do update set name = excluded.name, status = excluded.status;

    insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
    select '${ORG_A}', c.id, c.name || ' trip rate', 'trip', 'fixed', v.amount, date '2026-08-01'
    from (values
      ('${SPRINGBOK}', 440),
      ('${WNS}', 440),
      ('${LEWIS_C}', 300),
      ('${LEWIS_HO}', 300),
      ('${TELE}', 300),
      ('${INSPIRE}', 300),
      ('${PROTEA}', 300),
      ('${RATE_CHANGE}', 300)
    ) as v(id, amount)
    join public.companies c on c.id = v.id::uuid
    where not exists (
      select 1 from public.rate_cards rc
      where rc.organisation_id = '${ORG_A}' and rc.company_id = c.id and rc.line_type = 'trip' and rc.deleted_at is null
    );
  `);
}

function backfill(userId, companyId, plannedStart, area = "Test area") {
  return psqlAs(
    userId,
    `select public.backfill_staff_waybill(
      '${ORG_A}'::uuid,
      '${driverA}'::uuid,
      timestamptz '${plannedStart}',
      '${area}',
      1,
      '${companyId}'::uuid,
      null,
      null,
      null
    )::text;`
  );
}

seedFixtures();

for (const [label, companyId, expected] of [
  ["springbok-440", SPRINGBOK, "440.00"],
  ["wns-440", WNS, "440.00"],
  ["lewis-compliance-300", LEWIS_C, "300.00"],
  ["lewis-head-office-300", LEWIS_HO, "300.00"],
  ["teleperformance-300", TELE, "300.00"],
  ["inspire-300", INSPIRE, "300.00"],
  ["protea-300", PROTEA, "300.00"],
]) {
  const trip = backfill(adminA, companyId, "2026-09-24 10:00:00+02");
  const amount = psqlAdmin(
    `select il.unit_price::text from public.invoice_lines il where il.trip_id = '${trip.out}'::uuid;`
  );
  record(`RATE-${label}`, moneyEq(amount, expected), `unit_price=${amount}`);
}

const blocked = psqlAs(
  adminA,
  `select public.backfill_staff_waybill(
    '${ORG_A}'::uuid,
    '${driverA}'::uuid,
    timestamptz '2026-09-24 11:00:00+02',
    'Blocked area',
    1,
    '${NO_RATE}'::uuid,
    null,
    null,
    null
  );`,
  { allowError: true }
);
record(
  "BLOCK-no-rate",
  !blocked.ok && blocked.text.includes(RATE_ERR),
  blocked.ok ? "unexpected success" : "error matched"
);

const legacy = psqlAs(
  adminA,
  `select public.backfill_staff_waybill(
    '${ORG_A}'::uuid,
    '${driverA}'::uuid,
    timestamptz '2026-09-24 12:00:00+02',
    'Legacy enum path',
    1,
    null,
    'lewis_compliance'::public.staff_transport_company,
    null,
    null
  )::text;`
);
const legacyAmount = psqlAdmin(
  `select il.unit_price::text from public.invoice_lines il where il.trip_id = '${legacy.out}'::uuid;`
);
record("LEGACY-enum", moneyEq(legacyAmount, "300.00"), `unit_price=${legacyAmount}`);

const tripA = backfill(adminA, RATE_CHANGE, "2026-09-20 08:00:00+02", "Rate change A");
psqlAdmin(`
  insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
  values ('${ORG_A}', '${RATE_CHANGE}', 'Rate Change Co trip rate v2', 'trip', 'fixed', 450, date '2026-09-22');
`);
const tripB = backfill(adminA, RATE_CHANGE, "2026-09-21 08:00:00+02", "Rate change B");
const tripC = backfill(adminA, RATE_CHANGE, "2026-09-23 08:00:00+02", "Rate change C");
const amtA = psqlAdmin(
  `select unit_price::text from public.invoice_lines where trip_id = '${tripA.out}'::uuid;`
);
const amtB = psqlAdmin(
  `select unit_price::text from public.invoice_lines where trip_id = '${tripB.out}'::uuid;`
);
const amtC = psqlAdmin(
  `select unit_price::text from public.invoice_lines where trip_id = '${tripC.out}'::uuid;`
);
record(
  "EFFECTIVE-date",
  moneyEq(amtA, "300.00") && moneyEq(amtB, "300.00") && moneyEq(amtC, "450.00"),
  `A=${amtA} B=${amtB} C=${amtC}`
);

const dupTrip = backfill(adminA, LEWIS_C, "2026-09-25 08:00:00+02", "Idempotent");
psqlAs(adminA, `select public.sync_staff_trip_invoice_line('${dupTrip.out}'::uuid, false)::text;`);
const lineCount = psqlAdmin(
  `select count(*)::text from public.invoice_lines where trip_id = '${dupTrip.out}'::uuid;`
);
record("IDEMPOTENT-lines", lineCount === "1", `lines=${lineCount}`);

const prov = psqlAdmin(`
  select (il.trip_company_id is not null and il.rate_card_id is not null and il.rate_effective_on is not null)::text
  from public.invoice_lines il
  where il.trip_id = '${dupTrip.out}'::uuid;
`);
record("PROVENANCE", prov === "t" || prov === "true", `provenance=${prov}`);

const orgBCompanies = psqlAs(adminA, `select count(*)::text from public.companies where organisation_id = '${ORG_B}';`);
record(
  "RLS-companies-isolation",
  orgBCompanies.out === "0",
  `orgA admin sees orgB companies=${orgBCompanies.out}`
);

const orgBRateCards = psqlAs(
  adminA,
  `select count(*)::text from public.rate_cards where organisation_id = '${ORG_B}';`
);
record(
  "RLS-rate-cards-isolation",
  orgBRateCards.out === "0",
  `orgA admin sees orgB rate cards=${orgBRateCards.out}`
);

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`\nPR A DB tests: ${passed} passed, ${failed} failed (${results.length} total)`);
