#!/usr/bin/env node
/**
 * Postgres enforcement for driver trip admin (00063–00068): invoice lock,
 * role gates, override reason, append-only trip_audit.
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

const ORG = "f1000000-0000-4000-8000-000000000001";
const adminUser = "f1000000-0000-4000-8000-000000000011";
const driverUser = "f1000000-0000-4000-8000-000000000012";
const dispatcherUser = "f1000000-0000-4000-8000-000000000013";
const driverRow = "f1000000-0000-4000-8000-000000000201";
const companyId = "f1000000-0000-4000-8000-000000000301";
const vehicleId = "f1000000-0000-4000-8000-000000000401";
const billTo = "e5000000-0000-4000-8000-000000000001";

let failed = 0;
function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(name, detail = "") {
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  failed = 1;
}

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
  const text = `${res.stderr ?? ""}${res.stdout ?? ""}`;
  if (res.status !== 0 && !allowError) {
    throw new Error(text || "psqlAs failed");
  }
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "",
    text,
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
   'enforce-admin@driver-trip.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${driverUser}', 'authenticated', 'authenticated',
   'enforce-driver@driver-trip.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${dispatcherUser}', 'authenticated', 'authenticated',
   'enforce-dispatcher@driver-trip.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.organisations (id, name, slug, status)
values ('${ORG}', 'Driver Trip Enforcement Org', 'driver-trip-enforce', 'active')
on conflict (id) do update set name = excluded.name;

insert into public.organisation_members (organisation_id, user_id, role, status)
values
  ('${ORG}', '${adminUser}', 'organisation_admin', 'active'),
  ('${ORG}', '${driverUser}', 'driver', 'active'),
  ('${ORG}', '${dispatcherUser}', 'dispatcher', 'active')
on conflict do nothing;

insert into public.drivers (id, organisation_id, profile_id, full_name, status)
values ('${driverRow}', '${ORG}', '${driverUser}', 'Enforce Driver', 'active')
on conflict (id) do update set profile_id = excluded.profile_id;

insert into public.companies (id, organisation_id, name, status)
values
  ('${companyId}', '${ORG}', 'Enforce Co', 'active'),
  ('${billTo}', '${ORG}', 'WCL Trading CC', 'active')
on conflict (id) do nothing;

insert into public.rate_cards (organisation_id, company_id, name, line_type, unit, unit_amount, effective_from)
select '${ORG}', '${companyId}', 'Enforce rate', 'trip', 'fixed', 440, date '2026-08-01'
where not exists (
  select 1 from public.rate_cards rc
  where rc.organisation_id = '${ORG}' and rc.company_id = '${companyId}' and rc.deleted_at is null
);

insert into public.vehicles (id, organisation_id, name, registration_number, status, vehicle_type)
values ('${vehicleId}', '${ORG}', 'Enforce Van', 'ENF-001', 'active', 'other')
on conflict (id) do nothing;

update public.organisations
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('invoice_bill_to_company_id', '${billTo}')
where id = '${ORG}';
`);

const completedTrip = psqlAs(
  adminUser,
  `select (public.backfill_staff_waybill(
    '${ORG}'::uuid,
    '${driverRow}'::uuid,
    timestamptz '2026-09-24 10:00:00+02',
    'Enforce route',
    1,
    '${companyId}'::uuid,
    null,
    null,
    null,
    '${vehicleId}'::uuid
  ))::text;`
).out;

const noReasonOverride = psqlAs(
  adminUser,
  `select public.set_trip_billing_override('${completedTrip}'::uuid, 50, '  ');`,
  { allowError: true }
);
if (noReasonOverride.ok || !/Override reason is required/i.test(noReasonOverride.text)) {
  fail("override-reason-required", noReasonOverride.text.slice(0, 120));
} else {
  pass("override-reason-required");
}

psqlAs(
  adminUser,
  `select public.set_trip_billing_override('${completedTrip}'::uuid, 111.11, 'marker test');`
);

const marker = psqlAdmin(
  `select price_overridden::text || '|' || coalesce(override_reason, '')
   from public.invoice_lines where trip_id = '${completedTrip}'::uuid limit 1;`
);
if (marker !== "true|marker test") {
  fail("invoice-line-override-marker", marker);
} else {
  pass("invoice-line-override-marker");
}

const auditId = psqlAdmin(
  `select id::text from public.trip_audit where trip_id = '${completedTrip}'::uuid limit 1;`
);

const invoiceId = psqlAdmin(
  `select il.invoice_id::text from public.invoice_lines il where il.trip_id = '${completedTrip}'::uuid limit 1;`
);

psqlAs(adminUser, `select public.set_invoice_status('${invoiceId}'::uuid, 'issued');`);

const issuedEdit = psqlAs(
  adminUser,
  `select public.update_staff_trip(
    '${completedTrip}'::uuid,
    timestamptz '2026-09-24 11:00:00+02',
    null, null, 'Blocked', 1,
    null, null, null,
    'Should fail'
  );`,
  { allowError: true }
);
if (issuedEdit.ok || !/linked invoice is issued/i.test(issuedEdit.text)) {
  fail("issued-invoice-lock-update_staff_trip", issuedEdit.text.slice(0, 120));
} else {
  pass("issued-invoice-lock-update_staff_trip");
}

const issuedOverride = psqlAs(
  adminUser,
  `select public.set_trip_billing_override('${completedTrip}'::uuid, 99, 'late override');`,
  { allowError: true }
);
if (issuedOverride.ok || !/linked invoice is issued/i.test(issuedOverride.text)) {
  fail("issued-invoice-lock-set_override", issuedOverride.text.slice(0, 120));
} else {
  pass("issued-invoice-lock-set_override");
}

const pendingTrip = psqlAs(
  driverUser,
  `select trip_id::text from public.submit_driver_trip(
    '${ORG}'::uuid,
    timestamptz '2026-10-15 09:00:00+02',
    'Gate pickup',
    'Gate dropoff',
    '${companyId}'::uuid,
    1,
    5,
    null
  );`
).out;

const driverApprove = psqlAs(
  driverUser,
  `select public.approve_driver_trip('${pendingTrip}'::uuid, '${vehicleId}'::uuid);`,
  { allowError: true }
);
if (driverApprove.ok || !/Not authorised/i.test(driverApprove.text)) {
  fail("driver-cannot-approve", driverApprove.text.slice(0, 120));
} else {
  pass("driver-cannot-approve");
}

const dispatcherApprove = psqlAs(
  dispatcherUser,
  `select public.approve_driver_trip('${pendingTrip}'::uuid, '${vehicleId}'::uuid);`,
  { allowError: true }
);
if (dispatcherApprove.ok || !/Not authorised/i.test(dispatcherApprove.text)) {
  fail("dispatcher-cannot-approve", dispatcherApprove.text.slice(0, 120));
} else {
  pass("dispatcher-cannot-approve");
}

const dispatcherReject = psqlAs(
  dispatcherUser,
  `select public.reject_driver_trip('${pendingTrip}'::uuid, 'no access');`,
  { allowError: true }
);
if (dispatcherReject.ok || !/Not authorised/i.test(dispatcherReject.text)) {
  fail("dispatcher-cannot-reject", dispatcherReject.text.slice(0, 120));
} else {
  pass("dispatcher-cannot-reject");
}

const auditFieldBefore = psqlAdmin(
  `select field_name from public.trip_audit where id = '${auditId}'::uuid;`
);
psqlAs(
  adminUser,
  `update public.trip_audit set field_name = 'tampered' where id = '${auditId}'::uuid;`,
  { allowError: true }
);
const auditFieldAfter = psqlAdmin(
  `select field_name from public.trip_audit where id = '${auditId}'::uuid;`
);
if (!auditId || auditFieldBefore !== auditFieldAfter || auditFieldAfter === "tampered") {
  fail("trip-audit-no-update", `before=${auditFieldBefore} after=${auditFieldAfter}`);
} else {
  pass("trip-audit-no-update");
}

psqlAs(
  adminUser,
  `delete from public.trip_audit where id = '${auditId}'::uuid;`,
  { allowError: true }
);
const auditStillThere = psqlAdmin(
  `select count(*)::text from public.trip_audit where id = '${auditId}'::uuid;`
);
if (auditStillThere !== "1") {
  fail("trip-audit-no-delete", `count=${auditStillThere}`);
} else {
  pass("trip-audit-no-delete");
}

psqlAs(
  adminUser,
  `select public.approve_driver_trip('${pendingTrip}'::uuid, '${vehicleId}'::uuid);`
);
pass("admin-can-approve");

process.exit(failed);
