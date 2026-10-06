#!/usr/bin/env node
/**
 * 00058 — staff waybill creation-time billing checks (plain Postgres).
 * Requires: bash scripts/local-db/bootstrap-native.sh (applies all migrations incl. 00058)
 *
 * Covers: Send to driver (assign_staff_trip) + Backfill blocked when the company
 * has no trip rate or the org has no bill-to company; readiness RPC booleans;
 * RPC surface (anon / cross-org / internal helper not callable).
 */
import { spawnSync } from "node:child_process";

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const adminB = "b0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000201";

const WCL = "e5800000-0000-4000-8000-000000000001";
const RATED = "e5800000-0000-4000-8000-000000000002";
const NO_RATE = "e5800000-0000-4000-8000-000000000003";

const RATE_ERR =
  "No trip rate configured for this company. Add a rate before saving this waybill.";
const BILL_TO_ERR = "No invoice bill-to company is configured for this organisation";
const PLANNED = "2026-10-07 08:00:00+02";

const results = [];

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

function psqlAsAnon(sql, { allowError = false } = {}) {
  const body = `
BEGIN;
SET LOCAL ROLE anon;
${sql}
COMMIT;
`;
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
      body,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psqlAsAnon failed");
  }
  return {
    ok: res.status === 0,
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
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


psqlAdmin(`
  insert into public.companies (id, organisation_id, name, status)
  values
    ('${WCL}', '${ORG_A}', 'WCL Trading CC', 'active'),
    ('${RATED}', '${ORG_A}', 'Rated Co 00058', 'active'),
    ('${NO_RATE}', '${ORG_A}', 'No Rate Co 00058', 'active')
  on conflict (id) do update set name = excluded.name, status = excluded.status, deleted_at = null;

  insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
  select '${ORG_A}', '${RATED}', 'Rated Co trip rate', 'trip', 'fixed', 350, date '2026-08-01'
  where not exists (
    select 1 from public.rate_cards rc
    where rc.company_id = '${RATED}' and rc.line_type = 'trip' and rc.deleted_at is null
  );
`);

function readiness(userId, companyId) {
  return psqlAs(
    userId,
    `select has_trip_rate::text || ',' || has_bill_to::text
     from public.staff_waybill_billing_readiness('${ORG_A}'::uuid, '${companyId}'::uuid, timestamptz '${PLANNED}');`,
    { allowError: true }
  );
}

function send(companyId, area) {
  return psqlAs(
    adminA,
    `select public.assign_staff_trip(
      '${ORG_A}'::uuid, '${driverA}'::uuid, timestamptz '${PLANNED}', '${area}', 2, '${companyId}'::uuid, null
    )::text;`,
    { allowError: true }
  );
}

function backfill(companyId, area) {
  return psqlAs(
    adminA,
    `select public.backfill_staff_waybill(
      '${ORG_A}'::uuid, '${driverA}'::uuid, timestamptz '${PLANNED}', '${area}', 1, '${companyId}'::uuid, null, null, null
    )::text;`,
    { allowError: true }
  );
}

function tripCount(area) {
  return Number(psqlAdmin(`select count(*) from public.trips where area_text = '${area}';`));
}

// Readiness booleans
let r = readiness(adminA, RATED);
record("READINESS-rated", r.ok && r.out === "true,true", r.out || r.text.slice(0, 160));
r = readiness(adminA, NO_RATE);
record("READINESS-no-rate", r.ok && r.out === "false,true", r.out || r.text.slice(0, 160));

// Send to driver: blocked without rate, nothing inserted
let res = send(NO_RATE, "00058 send no rate");
record(
  "SEND-blocked-no-rate",
  !res.ok && res.text.includes(RATE_ERR) && tripCount("00058 send no rate") === 0,
  res.text.split("\n")[0].slice(0, 160)
);

// Send to driver: allowed with rate + bill-to
res = send(RATED, "00058 send ok");
record(
  "SEND-ok-with-rate",
  res.ok && /^[0-9a-f-]{36}$/.test(res.out) && tripCount("00058 send ok") === 1,
  res.out || res.text.slice(0, 160)
);

// Backfill: rate message unchanged
res = backfill(NO_RATE, "00058 backfill no rate");
record(
  "BACKFILL-blocked-no-rate-same-message",
  !res.ok && res.text.includes(RATE_ERR) && tripCount("00058 backfill no rate") === 0,
  res.text.split("\n")[0].slice(0, 160)
);

// Remove bill-to (no setting + soft-delete WCL), then both paths are blocked up front
psqlAdmin(`
  update public.organisations set settings = coalesce(settings, '{}'::jsonb) - 'invoice_bill_to_company_id' where id = '${ORG_A}';
  update public.companies set deleted_at = timezone('utc', now())
  where organisation_id = '${ORG_A}' and lower(trim(name)) = 'wcl trading cc' and deleted_at is null;
`);
try {
  r = readiness(adminA, RATED);
  record("READINESS-no-bill-to", r.ok && r.out === "true,false", r.out || r.text.slice(0, 160));
  res = send(RATED, "00058 send no bill-to");
  record(
    "SEND-blocked-no-bill-to",
    !res.ok && res.text.includes(BILL_TO_ERR) && tripCount("00058 send no bill-to") === 0,
    res.text.split("\n")[0].slice(0, 200)
  );
  res = backfill(RATED, "00058 backfill no bill-to");
  record(
    "BACKFILL-blocked-no-bill-to",
    !res.ok && res.text.includes(BILL_TO_ERR) && tripCount("00058 backfill no bill-to") === 0,
    res.text.split("\n")[0].slice(0, 200)
  );
} finally {
  psqlAdmin(`
    update public.companies set deleted_at = null
    where id = '${WCL}' or (organisation_id = '${ORG_A}' and lower(trim(name)) = 'wcl trading cc');
  `);
}

// Backfill happy path still works (completed + invoice line)
res = backfill(RATED, "00058 backfill ok");
const lines = Number(
  psqlAdmin(
    `select count(*) from public.invoice_lines il join public.trips t on t.id = il.trip_id where t.area_text = '00058 backfill ok';`
  )
);
record("BACKFILL-ok-with-rate", res.ok && lines === 1, `ok=${res.ok} lines=${lines} ${res.ok ? "" : res.text.slice(0, 160)}`);

// RPC surface
const anon = psqlAsAnon(
  `select * from public.staff_waybill_billing_readiness('${ORG_A}'::uuid, '${RATED}'::uuid, timezone('utc', now()));`,
  { allowError: true }
);
record("SECURITY-anon-readiness", !anon.ok && /permission denied|42501/i.test(anon.text), anon.text.slice(0, 120));

r = readiness(adminB, RATED);
record("SECURITY-cross-org-readiness", !r.ok && /Not authorised|permission denied/i.test(r.text), r.text.split("\n")[0].slice(0, 120));

const helper = psqlAs(
  adminA,
  `select public.assert_staff_waybill_billing_ready('${ORG_A}'::uuid, '${RATED}'::uuid, timezone('utc', now()));`,
  { allowError: true }
);
record("SECURITY-helper-not-callable", !helper.ok && /permission denied|42501/i.test(helper.text), helper.text.split("\n")[0].slice(0, 120));

const passed = results.filter((x) => x.pass).length;
const failed = results.filter((x) => !x.pass).length;
console.log(`\n00058 staff waybill billing DB tests: ${passed} passed, ${failed} failed (${results.length} total)`);
