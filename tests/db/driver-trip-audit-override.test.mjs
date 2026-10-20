#!/usr/bin/env node
/**
 * Driver trip admin audit + billing override (00063).
 * Static checks always run; integration checks need local Postgres bootstrap.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(
  join(root, "supabase/migrations/00063_driver_trip_admin_audit_override.sql"),
  "utf8"
);

const staticChecks = [
  ["trip_audit table", /create table if not exists public\.trip_audit/],
  ["override in sync", /from public\.trip_billing_overrides bo/],
  ["snapshot on submit", /insert into public\.trip_driver_submission_snapshots/],
  ["set_trip_billing_override", /function public\.set_trip_billing_override/],
];

let failed = 0;
for (const [name, pattern] of staticChecks) {
  const pass = pattern.test(sql);
  console.log(pass ? `PASS ${name}` : `FAIL ${name}`);
  if (!pass) failed = 1;
}

const pgCheck = spawnSync("which", ["psql"], { encoding: "utf8" });
const hasPg = pgCheck.status === 0;

if (!hasPg) {
  console.log("SKIP integration (psql not available)");
  process.exit(failed);
}

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const driverA = "a0000000-0000-4000-8000-000000000201";
const SPRINGBOK = "e5000000-0000-4000-8000-000000000002";
const VEHICLE_A = "f5000000-0000-4000-8000-000000000001";

function psqlAdmin(body) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  return (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "";
}

function psqlAs(userId, body, { allowError = false } = {}) {
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
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psqlAs failed");
  }
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`,
  };
}

const bootstrap = spawnSync("bash", [join(root, "scripts/local-db/bootstrap-native.sh")], {
  encoding: "utf8",
  stdio: "pipe",
});
if (bootstrap.status !== 0) {
  console.log("SKIP integration (bootstrap failed)");
  process.exit(failed);
}

const tripId = psqlAs(
  adminA,
  `select public.backfill_staff_waybill(
    '${ORG_A}'::uuid,
    '${driverA}'::uuid,
    timestamptz '2026-09-24 10:00:00+02',
    'Audit test route',
    2,
    '${SPRINGBOK}'::uuid,
    null,
    null,
    null,
    '${VEHICLE_A}'::uuid
  );`
).out;

const rateBefore = psqlAdmin(
  `select unit_price::text from public.invoice_lines where trip_id = '${tripId}'::uuid;`
);

psqlAs(
  adminA,
  `select public.set_trip_billing_override(
    '${tripId}'::uuid,
    123.45,
    'Founder test override'
  );`
);

const rateAfter = psqlAdmin(
  `select unit_price::text from public.invoice_lines where trip_id = '${tripId}'::uuid;`
);

const overrideWins = rateAfter === "123.45";
console.log(overrideWins ? "PASS override-beats-rate-card" : "FAIL override-beats-rate-card", {
  rateBefore,
  rateAfter,
});
if (!overrideWins) failed = 1;

psqlAs(
  adminA,
  `select public.update_staff_trip(
    '${tripId}'::uuid,
    timestamptz '2026-09-24 11:00:00+02',
    null,
    null,
    'Updated area',
    3,
    null,
    null,
    null,
    'Admin correction'
  );`
);

const auditCount = psqlAdmin(
  `select count(*)::text from public.trip_audit where trip_id = '${tripId}'::uuid;`
);
const hasAudit = Number(auditCount) >= 2;
console.log(hasAudit ? "PASS audit-rows-on-edit" : "FAIL audit-rows-on-edit", { auditCount });
if (!hasAudit) failed = 1;

const driverSelect = psqlAs(
  driverA,
  `select count(*)::text from public.trip_audit;`,
  { allowError: true }
);
const driverBlocked = !driverSelect.ok || driverSelect.out === "0";
console.log(
  driverBlocked ? "PASS driver-no-trip-audit-select" : "FAIL driver-no-trip-audit-select",
  driverSelect.text.slice(0, 80)
);
if (!driverBlocked) failed = 1;

process.exit(failed);
