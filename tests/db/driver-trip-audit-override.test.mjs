#!/usr/bin/env node
/**
 * Driver trip admin audit + billing override (00063/00064).
 * Requires: bash scripts/local-db/bootstrap-native.sh
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(
  join(root, "supabase/migrations/00064_driver_trip_admin_hardening.sql"),
  "utf8"
);

const staticChecks = [
  ["trip_status cast on admin create", /::public\.trip_status/],
  ["duplicate 45min window", /45 \* 60/],
  ["block unapproved start", /Driver submission must be approved/],
  ["approve audit", /submission_status/],
];

let failed = 0;
for (const [name, pattern] of staticChecks) {
  const pass = pattern.test(sql);
  console.log(pass ? `PASS ${name}` : `FAIL ${name}`);
  if (!pass) failed = 1;
}

function requirePsql() {
  const pgCheck = spawnSync("which", ["psql"], { encoding: "utf8" });
  if (pgCheck.status !== 0) {
    console.error("FAIL integration — psql not available (required)");
    process.exit(1);
  }
}

requirePsql();

const PG = {
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG = "d9000000-0000-4000-8000-000000000001";
const adminUser = "d9000000-0000-4000-8000-000000000011";
const driverUser = "d9000000-0000-4000-8000-000000000012";
const driverRow = "d9000000-0000-4000-8000-000000000201";
const companyId = "d9000000-0000-4000-8000-000000000301";
const vehicleId = "d9000000-0000-4000-8000-000000000401";
const billTo = "e5000000-0000-4000-8000-000000000001";

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
  console.error("FAIL integration — bootstrap-native.sh failed");
  console.error(bootstrap.stderr || bootstrap.stdout);
  process.exit(1);
}

psqlAdmin(`
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '${adminUser}', 'authenticated', 'authenticated',
   'audit-admin@driver-trip.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${driverUser}', 'authenticated', 'authenticated',
   'audit-driver@driver-trip.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.organisations (id, name, slug, status)
values ('${ORG}', 'Driver Trip Audit Org', 'driver-trip-audit', 'active')
on conflict (id) do update set name = excluded.name;

insert into public.organisation_members (organisation_id, user_id, role, status)
values
  ('${ORG}', '${adminUser}', 'organisation_admin', 'active'),
  ('${ORG}', '${driverUser}', 'driver', 'active')
on conflict do nothing;

insert into public.drivers (id, organisation_id, profile_id, full_name, status)
values ('${driverRow}', '${ORG}', '${driverUser}', 'Audit Driver', 'active')
on conflict (id) do update set profile_id = excluded.profile_id;

insert into public.companies (id, organisation_id, name, status)
values
  ('${companyId}', '${ORG}', 'Audit Co', 'active'),
  ('${billTo}', '${ORG}', 'WCL Trading CC', 'active')
on conflict (id) do nothing;

insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
select '${ORG}', '${companyId}', 'Audit rate', 'trip', 'fixed', 440, date '2026-08-01'
where not exists (
  select 1 from public.rate_cards rc
  where rc.organisation_id = '${ORG}' and rc.company_id = '${companyId}' and rc.deleted_at is null
);

insert into public.vehicles (id, organisation_id, name, registration_number, status, vehicle_type)
values ('${vehicleId}', '${ORG}', 'Audit Van', 'AUD-001', 'active', 'other')
on conflict (id) do nothing;

update public.organisations
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('invoice_bill_to_company_id', '${billTo}')
where id = '${ORG}';
`);

const tripId = psqlAs(
  adminUser,
  `select (public.backfill_staff_waybill(
    '${ORG}'::uuid,
    '${driverRow}'::uuid,
    timestamptz '2026-09-24 10:00:00+02',
    'Dup route A → B',
    1,
    '${companyId}'::uuid,
    null,
    null,
    null,
    '${vehicleId}'::uuid
  ))::text;`
).out;

psqlAs(
  adminUser,
  `select public.set_trip_billing_override('${tripId}'::uuid, 123.45, 'test override');`
);

const rateAfter = psqlAdmin(
  `select unit_price::text from public.invoice_lines where trip_id = '${tripId}'::uuid;`
);
if (Number.parseFloat(rateAfter).toFixed(2) !== "123.45") {
  console.log("FAIL override-beats-rate-card", rateAfter);
  failed = 1;
} else {
  console.log("PASS override-beats-rate-card");
}

const markerRow = psqlAdmin(
  `select price_overridden::text || '|' || coalesce(override_reason, '')
   from public.invoice_lines where trip_id = '${tripId}'::uuid;`
);
if (markerRow !== "true|test override") {
  console.log("FAIL invoice-line-override-marker", markerRow);
  failed = 1;
} else {
  console.log("PASS invoice-line-override-marker");
}

psqlAs(
  adminUser,
  `select public.update_staff_trip(
    '${tripId}'::uuid,
    timestamptz '2026-09-24 11:00:00+02',
    null, null, 'Updated area', 3,
    null, null, null,
    'Admin correction'
  );`
);

const auditCount = psqlAdmin(
  `select count(*)::text from public.trip_audit where trip_id = '${tripId}'::uuid;`
);
if (Number(auditCount) < 2) {
  console.log("FAIL audit-rows-on-edit", auditCount);
  failed = 1;
} else {
  console.log("PASS audit-rows-on-edit");
}

const driverAudit = psqlAs(
  driverUser,
  `select count(*)::text from public.trip_audit;`,
  { allowError: true }
);
if (driverAudit.ok && driverAudit.out !== "0") {
  console.log("FAIL driver-no-trip-audit-select", driverAudit.out);
  failed = 1;
} else {
  console.log("PASS driver-no-trip-audit-select");
}

process.exit(failed);
