#!/usr/bin/env node
/**
 * Structured pickup / drop-off (00069): invoice line text, legacy fallback,
 * server-side validation, update_staff_trip behaviour, anon revoke and
 * issued-invoice immutability.
 * Requires: local Postgres (see scripts/local-db/bootstrap-native.sh). Never
 * touches a hosted database.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
let failed = 0;
const pass = (n) => console.log(`PASS ${n}`);
const fail = (n, d = "") => {
  console.log(`FAIL ${n} ${d}`);
  failed = 1;
};

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

const ORG = "d9100000-0000-4000-8000-000000000001";
const adminUser = "d9100000-0000-4000-8000-000000000011";
const driverUser = "d9100000-0000-4000-8000-000000000012";
const driverRow = "d9100000-0000-4000-8000-000000000201";
const companyId = "d9100000-0000-4000-8000-000000000301";
const vehicleId = "d9100000-0000-4000-8000-000000000401";
const billTo = "e5100000-0000-4000-8000-000000000001";

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
   'pd-admin@pickup-dropoff.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${driverUser}', 'authenticated', 'authenticated',
   'pd-driver@pickup-dropoff.test', crypt('TestPassword123!', gen_salt('bf')), now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.organisations (id, name, slug, status)
values ('${ORG}', 'Pickup Dropoff Org', 'pickup-dropoff', 'active')
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


const ARROW = "\u2192";
const when = "timestamptz '2026-10-20 09:00:00+02'";

function submit(pickup, dropoff, ts = when) {
  return psqlAs(
    driverUser,
    `select trip_id::text from public.submit_driver_trip(
      '${ORG}'::uuid, ${ts},
      $p$${pickup}$p$, $p$${dropoff}$p$,
      '${companyId}'::uuid, 2, 12, null
    );`,
    { allowError: true }
  );
}

function approve(tripId) {
  psqlAs(adminUser, `select public.approve_driver_trip('${tripId}'::uuid, '${vehicleId}'::uuid);`);
}

// 1. structured submit -> columns + area_text
const t1 = submit("Cape Town International Airport", "The Silo Hotel, V&A Waterfront");
const row1 = psqlAdmin(
  `select pickup_text || '#' || dropoff_text || '#' || area_text from public.trips where id = '${t1.out}'::uuid;`
);
const expectedArea = `Cape Town International Airport ${ARROW} The Silo Hotel, V&A Waterfront`;
if (row1 !== `Cape Town International Airport#The Silo Hotel, V&A Waterfront#${expectedArea}`) {
  fail("submit-structured-columns", row1);
} else pass("submit-structured-columns");

// 2. trip_route_text unit cases (structured, legacy, partial, trimming)
const routeCases = [
  ["structured", "select public.trip_route_text('  A ', ' B  ', 'legacy')", `A ${ARROW} B`],
  ["legacy-null", "select public.trip_route_text(null, null, 'Central / WEX William St')", "Central / WEX William St"],
  ["legacy-partial", "select public.trip_route_text('A', null, 'legacy area')", "legacy area"],
  ["legacy-blank", "select public.trip_route_text('', '', ' x ')", "x"],
  ["name-with-wex-untouched", `select public.trip_route_text('Alexandra WEX Centre', 'Airport', null)`, `Alexandra WEX Centre ${ARROW} Airport`],
];
for (const [name, q, expected] of routeCases) {
  const got = psqlAdmin(q + ";");
  if (got !== expected) fail(`route-text-${name}`, got);
  else pass(`route-text-${name}`);
}

// 3. validation rejections
const bad = [
  ["empty-pickup", "", "Airport", /required/i],
  ["blank-dropoff", "Airport", "   ", /required/i],
  ["pipe", "Foo | Bar", "Airport", /cannot contain/i],
  ["newline", "Foo\nBar", "Airport", /cannot contain/i],
  ["equal-ci", "Airport", " airport ", /must be different/i],
  ["too-long", "x".repeat(121), "Airport", /120 characters/i],
];
for (const [name, p, d, re] of bad) {
  const r = submit(p, d);
  if (r.ok || !re.test(r.text)) fail(`validation-${name}`, r.text.slice(0, 120));
  else pass(`validation-${name}`);
}
const exactly120 = submit("y".repeat(120), "Airport 120");
if (!exactly120.ok) fail("validation-120-ok", exactly120.text.slice(0, 120));
else pass("validation-120-ok");

// 4. invoice line text uses the structured route (draft line) after approval
approve(t1.out);
const line1 = psqlAdmin(
  `select description from public.invoice_lines where trip_id = '${t1.out}'::uuid;`
);
if (!line1.endsWith(`| 2 pax | ${expectedArea}`)) fail("invoice-line-structured", line1);
else pass("invoice-line-structured");

// 5. legacy trip (no structured columns) keeps legacy area text on its line
const legacyTrip = psqlAs(
  adminUser,
  `select (public.backfill_staff_waybill(
    '${ORG}'::uuid, '${driverRow}'::uuid,
    timestamptz '2026-10-21 10:00:00+02',
    'Legacy A / Legacy B', 1, '${companyId}'::uuid,
    null, null, null, '${vehicleId}'::uuid
  ))::text;`
).out;
const legacyLine = psqlAdmin(
  `select description from public.invoice_lines where trip_id = '${legacyTrip}'::uuid;`
);
const legacyCols = psqlAdmin(
  `select coalesce(pickup_text,'null') || '#' || coalesce(dropoff_text,'null') from public.trips where id = '${legacyTrip}'::uuid;`
);
if (!legacyLine.endsWith("| Legacy A / Legacy B") || legacyCols !== "null#null") {
  fail("legacy-fallback", `${legacyLine} ${legacyCols}`);
} else pass("legacy-fallback");

// 6. update_staff_trip: structured edit refreshes area_text, line and audit
psqlAs(
  adminUser,
  `select public.update_staff_trip(
    '${t1.out}'::uuid, null, null, null, null, null, null, null, null,
    'Fix places', 'Camps Bay', 'Hout Bay Harbour'
  );`
);
const after = psqlAdmin(
  `select t.pickup_text || '#' || t.dropoff_text || '#' || t.area_text
   from public.trips t where t.id = '${t1.out}'::uuid;`
);
const lineAfter = psqlAdmin(
  `select description from public.invoice_lines where trip_id = '${t1.out}'::uuid;`
);
if (after !== `Camps Bay#Hout Bay Harbour#Camps Bay ${ARROW} Hout Bay Harbour` ||
    !lineAfter.endsWith(`| Camps Bay ${ARROW} Hout Bay Harbour`)) {
  fail("update-structured", `${after} :: ${lineAfter}`);
} else pass("update-structured");
const auditKeys = psqlAdmin(
  `select count(*)::text from public.trip_audit where trip_id = '${t1.out}'::uuid and field_name in ('pickup_text','dropoff_text');`
);
if (Number(auditKeys) < 1) fail("update-structured-audit", auditKeys);
else pass("update-structured-audit");

// 6b. only one of the two places -> rejected
const half = psqlAs(
  adminUser,
  `select public.update_staff_trip('${t1.out}'::uuid, null, null, null, null, null, null, null, null, 'x', 'Only pickup', null);`,
  { allowError: true }
);
if (half.ok || !/required/i.test(half.text)) fail("update-requires-both", half.text.slice(0, 120));
else pass("update-requires-both");

// 6c. legacy-area-only edit on a structured trip clears stale structured text
psqlAs(
  adminUser,
  `select public.update_staff_trip('${t1.out}'::uuid, null, null, null, 'Admin typed area', null, null, null, null, 'Legacy edit');`
);
const cleared = psqlAdmin(
  `select coalesce(pickup_text,'null') || '#' || coalesce(dropoff_text,'null') || '#' || area_text from public.trips where id = '${t1.out}'::uuid;`
);
const clearedLine = psqlAdmin(
  `select description from public.invoice_lines where trip_id = '${t1.out}'::uuid;`
);
if (cleared !== "null#null#Admin typed area" || !clearedLine.endsWith("| Admin typed area")) {
  fail("update-legacy-area-clears-structured", `${cleared} :: ${clearedLine}`);
} else pass("update-legacy-area-clears-structured");

// 7. anon cannot execute; trip_route_text/validate not callable by anon
const anonChecks = psqlAdmin(
  `select bool_or(has_function_privilege('anon', p.oid, 'execute'))::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('update_staff_trip','submit_driver_trip','admin_create_staff_trip','trip_route_text','validate_trip_places');`
);
if (anonChecks !== "false") fail("anon-no-execute", anonChecks);
else pass("anon-no-execute");
const oldSig = psqlAdmin(
  `select count(*)::text from pg_proc where proname = 'update_staff_trip' and pronargs = 10;`
);
if (oldSig !== "0") fail("old-update-signature-dropped", oldSig);
else pass("old-update-signature-dropped");

// 8. issued invoices stay immutable: edits are rejected, line text unchanged
const t2 = submit("Camps Bay", "Cape Town Stadium", "timestamptz '2026-10-22 09:00:00+02'");
approve(t2.out);
const invoiceId = psqlAdmin(
  `select invoice_id::text from public.invoice_lines where trip_id = '${t2.out}'::uuid limit 1;`
);
psqlAs(adminUser, `select public.set_invoice_status('${invoiceId}'::uuid, 'issued');`);
const lineBefore = psqlAdmin(
  `select description from public.invoice_lines where trip_id = '${t2.out}'::uuid;`
);
const issuedEdit = psqlAs(
  adminUser,
  `select public.update_staff_trip('${t2.out}'::uuid, null, null, null, null, null, null, null, null, 'late', 'Somewhere', 'Else');`,
  { allowError: true }
);
const lineAfterIssued = psqlAdmin(
  `select description from public.invoice_lines where trip_id = '${t2.out}'::uuid;`
);
if (issuedEdit.ok || lineBefore !== lineAfterIssued || !lineBefore.endsWith(`| Camps Bay ${ARROW} Cape Town Stadium`)) {
  fail("issued-invoice-immutable", `${issuedEdit.text.slice(0, 100)} :: ${lineBefore}`);
} else pass("issued-invoice-immutable");

console.log(failed ? "Pickup/drop-off DB tests: FAILURES" : "Pickup/drop-off DB tests: all passed");
process.exit(failed);
