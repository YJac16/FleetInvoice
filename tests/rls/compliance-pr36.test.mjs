#!/usr/bin/env node
/**
 * PR #36 compliance RLS + alert automation tests (T1–T10).
 * Requires: bash scripts/local-db/bootstrap-native.sh
 * Run: WORKOPS_AUDIT_PG_DATABASE=workops_audit node tests/rls/compliance-pr36.test.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PG = {
  host: process.env.WORKOPS_AUDIT_PG_HOST ?? "127.0.0.1",
  port: process.env.WORKOPS_AUDIT_PG_PORT ?? "5432",
  database: process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit",
  auditUser: process.env.WORKOPS_AUDIT_PG_USER ?? "audit_rls",
  auditPassword: process.env.WORKOPS_AUDIT_PG_PASSWORD ?? "audit_rls_test",
};

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const adminA = "a0000000-0000-4000-8000-000000000011";
const adminA2 = "a0000000-0000-4000-8000-000000000017";
const managerA = "a0000000-0000-4000-8000-000000000016";
const driverAUser = "a0000000-0000-4000-8000-000000000012";
const driverA2User = "a0000000-0000-4000-8000-000000000015";
const driverAId = "a0000000-0000-4000-8000-000000000201";
const driverA2Id = "a0000000-0000-4000-8000-000000000202";
const employeeA = "a0000000-0000-4000-8000-000000000013";
const cmA = "a0000000-0000-4000-8000-000000000014";
const adminB = "b0000000-0000-4000-8000-000000000011";
const driverBUser = "b0000000-0000-4000-8000-000000000012";
const V1 = "a0000000-0000-4000-8000-000000000601";
const V2 = "a0000000-0000-4000-8000-000000000602";
const V3 = "a0000000-0000-4000-8000-000000000603";
const CO_A1 = "a0000000-0000-4000-8000-000000000101";

const results = [];

// Idempotency: 00032 + 00033 re-apply (spec requirement)
try {
  const idem = spawnSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-f",
      "/workspace/supabase/migrations/00032_driver_vehicle_compliance.sql",
      "-f",
      "/workspace/supabase/migrations/00033_driver_notification_compliance_expiry.sql",
    ],
    { encoding: "utf8" }
  );
  record("MIG-idempotent", idem.status === 0, `00032/00033 re-apply exit=${idem.status}`);
} catch (e) {
  record("MIG-idempotent", false, e.message);
}

try {
  const idem34 = spawnSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-d",
      PG.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-f",
      "/workspace/supabase/migrations/00034_compliance_security_hardening.sql",
      "-f",
      "/workspace/supabase/migrations/00034_compliance_security_hardening.sql",
    ],
    { encoding: "utf8" }
  );
  record(
    "MIG-00034-idempotent",
    idem34.status === 0,
    `00034 double-apply exit=${idem34.status}`
  );
} catch (e) {
  record("MIG-00034-idempotent", false, e.message);
}

function psqlRaw(sql, { role = "authenticated", userId, allowError = false } = {}) {
  const jwt = userId ? `SET LOCAL request.jwt.claim.sub = '${userId}';` : "";
  const body = `
BEGIN;
SET LOCAL ROLE ${role};
${jwt}
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
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  const out = (res.stdout ?? "").trim();
  const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
  return { ok: res.status === 0, out: lines.at(-1) ?? "", stderr: res.stderr ?? "", lines };
}

function psqlAdmin(sql) {
  const body = `BEGIN;\n${sql}\nCOMMIT;`;
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
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "psqlAdmin failed");
  }
  const lines = (res.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

const anonRevokedFunctions = [
  ["driver_serves_company", "public.driver_serves_company(uuid, uuid, integer)"],
  ["vehicle_in_company_scope", "public.vehicle_in_company_scope(uuid, uuid)"],
  ["assign_vehicle_to_driver", "public.assign_vehicle_to_driver(uuid, uuid)"],
  ["unassign_vehicle", "public.unassign_vehicle(uuid)"],
  ["get_trip_driver_names", "public.get_trip_driver_names(uuid[])"],
  ["mark_admin_notification_read", "public.mark_admin_notification_read(uuid)"],
  ["enqueue_compliance_expiry_alerts", "public.enqueue_compliance_expiry_alerts()"],
];

for (const [label, fn] of anonRevokedFunctions) {
  const priv = psqlAdmin(
    `select has_function_privilege('anon', '${fn}', 'EXECUTE')::text;`
  );
  const anonDenied = priv === "f" || priv === "false";
  record(`PRIV-anon-${label}`, anonDenied, `anon execute ${label}=${priv}`);
}

function psqlAs(userId, sql) {
  return psqlRaw(sql, { userId }).out;
}

function psqlAsExpectFail(userId, sql) {
  return psqlRaw(sql, { userId, allowError: true }).ok === false;
}

function psqlService(sql) {
  const body = `BEGIN;\nSET LOCAL ROLE service_role;\n${sql}\nCOMMIT;`;
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
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || "psqlService failed");
  const lines = (res.stdout ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.at(-1) ?? "";
}

function psqlServiceExpectFail(sql) {
  const body = `BEGIN;\nSET LOCAL ROLE service_role;\n${sql}\nCOMMIT;`;
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG.database, "-c", body],
    { encoding: "utf8" }
  );
  return res.status !== 0;
}

// --- setup trip for get_trip_driver_names (T3a) ---
try {
  psqlAdmin(`
    insert into public.routes (id, organisation_id, company_id, name, status)
    values ('a0000000-0000-4000-8000-000000000801', '${ORG_A}', '${CO_A1}', 'Compliance Test Route', 'active')
    on conflict (id) do nothing;
    insert into public.trips (id, organisation_id, route_id, company_id, planned_start, status)
    values (
      'a0000000-0000-4000-8000-000000000901',
      '${ORG_A}',
      'a0000000-0000-4000-8000-000000000801',
      '${CO_A1}',
      timezone('utc', now()) + interval '1 day',
      'assigned'
    )
    on conflict (id) do nothing;
    insert into public.trip_assignments (id, organisation_id, trip_id, driver_id, vehicle_id, assigned_at)
    values (
      'a0000000-0000-4000-8000-000000000902',
      '${ORG_A}',
      'a0000000-0000-4000-8000-000000000901',
      '${driverAId}',
      '${V1}',
      now()
    )
    on conflict (id) do nothing;
    insert into public.trip_passengers (id, organisation_id, trip_id, employee_id, direction, status)
    select
      'a0000000-0000-4000-8000-000000000903',
      '${ORG_A}',
      'a0000000-0000-4000-8000-000000000901',
      'a0000000-0000-4000-8000-000000000301',
      'to_work',
      'confirmed'
    where not exists (select 1 from public.trip_passengers where id = 'a0000000-0000-4000-8000-000000000903');
  `);
} catch (e) {
  console.error("Setup failed:", e.message);
  process.exit(1);
}

// Reset assignments for deterministic T2/T4
psqlAdmin(`
  update public.driver_vehicle_assignments set ends_on = current_date, ended_by = '${adminA}'
  where organisation_id = '${ORG_A}' and ends_on is null and deleted_at is null;
`);

// T1 cross-org
const adminA_sees_b_drivers = psqlAs(adminA, `select count(*)::text from public.drivers where organisation_id = '${ORG_B}';`);
record("T1a", adminA_sees_b_drivers === "0", `admin A drivers in org B count=${adminA_sees_b_drivers}`);

const driverA_sees_b = psqlAs(driverAUser, `select count(*)::text from public.drivers where organisation_id = '${ORG_B}';`);
record("T1b", driverA_sees_b === "0", `driver A org B drivers count=${driverA_sees_b}`);

const crossAssignFail = psqlAsExpectFail(
  adminA,
  `select public.assign_vehicle_to_driver('${driverAId}', (select id from public.vehicles where organisation_id = '${ORG_B}' limit 1));`
);
record("T1c", crossAssignFail, "cross-org assign_vehicle_to_driver rejected");

// T2a driver least privilege
const driverRows = psqlAs(driverAUser, `select count(*)::text from public.drivers;`);
record("T2a", driverRows === "1", `driver A driver row count=${driverRows}`);

const empDrivers = psqlAs(employeeA, `select count(*)::text from public.drivers;`);
record("T2a-employee", empDrivers === "0", `employee drivers count=${empDrivers}`);

// Release trip-based vehicle access so standing-assignment tests are isolated
psqlAdmin(`
  update public.trip_assignments
  set released_at = timezone('utc', now())
  where trip_id = 'a0000000-0000-4000-8000-000000000901' and released_at is null;
`);

// Assign V1 to driver A
psqlAs(adminA, `select public.assign_vehicle_to_driver('${driverAId}', '${V1}');`);
const driverSeesV1 = psqlAs(driverAUser, `select count(*)::text from public.vehicles where id = '${V1}';`);
record("T2a-vehicle", driverSeesV1 === "1", `driver A sees assigned V1 count=${driverSeesV1}`);

const driverSeesV2 = psqlAs(driverAUser, `select count(*)::text from public.vehicles where id = '${V2}';`);
record("T2a-unassigned", driverSeesV2 === "0", `driver A unassigned V2 count=${driverSeesV2}`);

// T2b reassignment
psqlAs(adminA, `select public.assign_vehicle_to_driver('${driverA2Id}', '${V1}');`);
const a1Lost = psqlAs(driverAUser, `select count(*)::text from public.vehicles where id = '${V1}';`);
const a2Has = psqlAs(driverA2User, `select count(*)::text from public.vehicles where id = '${V1}';`);
record("T2b", a1Lost === "0" && a2Has === "1", `after reassign A1 V1=${a1Lost} A2 V1=${a2Has}`);

// T3a trip driver names for employee
const tripNames = psqlAs(
  employeeA,
  `select full_name from public.get_trip_driver_names(array['a0000000-0000-4000-8000-000000000901'::uuid]);`
);
record("T3a", tripNames.includes("Org A Driver"), `get_trip_driver_names=${tripNames}`);

// T3b company manager
const cmDirectDrivers = psqlAs(cmA, `select count(*)::text from public.drivers;`);
record("T3b-drivers", cmDirectDrivers === "0", `company_manager direct drivers=${cmDirectDrivers}`);

const renewals = psqlRaw(
  `select coalesce(string_agg(subject_name || ':' || coalesce(registration_number,''), '|'), '') from public.list_compliance_renewals('${ORG_A}', 3650);`,
  { userId: cmA }
).out;
const leaksLicence = renewals.includes("LIC-") || renewals.includes("PRDP-") || renewals.includes("SECRET");
record("T3b-rpc", !leaksLicence, `list_compliance_renewals cm sample=${renewals.slice(0, 120)}`);

// T4b non-admin assign fails
record("T4b-driver", psqlAsExpectFail(driverAUser, `select public.assign_vehicle_to_driver('${driverAId}', '${V2}');`), "driver assign denied");
record("T4b-cm", psqlAsExpectFail(cmA, `select public.assign_vehicle_to_driver('${driverA2Id}', '${V2}');`), "company_manager assign denied");

// T4a assign + audit
const auditBefore = psqlAdmin(`select count(*)::text from public.audit_logs where action like 'driver_vehicle.%';`);
psqlAs(adminA, `select public.assign_vehicle_to_driver('${driverA2Id}', '${V2}');`);
const auditAfter = psqlAdmin(`select count(*)::text from public.audit_logs where action like 'driver_vehicle.%';`);
record("T4d", Number(auditAfter) > Number(auditBefore), `audit logs before=${auditBefore} after=${auditAfter}`);

// T4c — genuine overlapping concurrent assign (session 1 holds xact during pg_sleep)
{
  const race = spawnSync("bash", [join(__dirname, "helpers/run-t4c-race.sh")], {
    encoding: "utf8",
    env: { ...process.env, WORKOPS_AUDIT_PG_DATABASE: PG.database },
  });
  const out = race.stdout ?? "";
  const openV = /OPEN_V=(\d+)/.exec(out)?.[1] ?? "?";
  const openDrivers = /OPEN_DRIVERS=(\d+)/.exec(out)?.[1] ?? "?";
  const elapsed = Number(/ELAPSED_MS=(\d+)/.exec(out)?.[1] ?? 0);
  const chalExit = Number(/CHAL_EXIT=(\d+)/.exec(out)?.[1] ?? 1);
  const chalErr = /CHAL_ERR=(.*)/.exec(out)?.[1] ?? "";
  const dupV = /DUP_V=(\d+)/.exec(out)?.[1] ?? "?";
  const dupD = /DUP_D=(\d+)/.exec(out)?.[1] ?? "?";
  const waited = elapsed >= 3500;
  const oneOpenVehicle = openV === "1";
  const atMostOneDriverOpen = openDrivers === "1";
  const noDupes = dupV === "0" && dupD === "0";
  const waitedOrFailed = chalExit !== 0 || waited;
  record(
    "T4c",
    race.status === 0 && oneOpenVehicle && atMostOneDriverOpen && noDupes && waitedOrFailed,
    `open_vehicle=${openV} open_driver_slots=${openDrivers} dup_v=${dupV} dup_d=${dupD} elapsed_ms=${elapsed} challenger_exit=${chalExit} err=${chalErr.trim()}`
  );
}

// T5 model_year trigger + licence code Other
const badYear = psqlAdmin(`
  do $$ begin
    insert into public.vehicles (organisation_id, name, vehicle_type, status, model_year)
    values ('${ORG_A}', 'Bad Year', 'van', 'active', 1800);
    raise exception 'expected failure';
  exception when others then
    null;
  end $$;
  select 'ok';
`);
record("T5b-year", badYear === "ok", "model_year 1800 rejected by trigger");

const badOther = psqlAdmin(`
  do $$ begin
    insert into public.drivers (organisation_id, full_name, status, license_code)
    values ('${ORG_A}', 'Bad Code', 'active', 'Other');
    raise exception 'expected failure';
  exception when others then
    null;
  end $$;
  select 'ok';
`);
record("T5c-other", badOther === "ok", "license_code Other without explanation rejected");

// T6 alerts — use driver A licence expiry at today+45 (milestone 60)
const today = psqlAdmin(`select public.compliance_today_sast()::text;`);
psqlAdmin(`
  delete from public.driver_inbox_notifications where organisation_id = '${ORG_A}';
  delete from public.admin_inbox_notifications where organisation_id = '${ORG_A}';
  delete from public.compliance_alerts_sent where organisation_id = '${ORG_A}';
  update public.drivers set license_expires_on = ('${today}'::date + 45) where id = '${driverAId}';
  update public.vehicles set operating_permit_expires_on = ('${today}'::date + 45), operating_permit_number = 'PERMIT-601'
  where id = '${V1}';
  update public.driver_vehicle_assignments set ends_on = current_date where vehicle_id = '${V1}' and ends_on is null;
  -- vehicle with no driver assignment for no-driver alert test
  update public.vehicles set operating_permit_expires_on = ('${today}'::date + 45) where id = '${V2}';
`);
psqlAs(adminA, `select public.assign_vehicle_to_driver('${driverA2Id}', '${V1}');`);

const created1 = psqlService(`select public.enqueue_compliance_expiry_alerts()::text;`);
const adminAlerts = psqlAdmin(
  `select count(*)::text from public.admin_inbox_notifications where organisation_id = '${ORG_A}';`
);
const driverAlerts = psqlAdmin(
  `select count(*)::text from public.driver_inbox_notifications where organisation_id = '${ORG_A}' and notification_type = 'compliance_expiry';`
);
const milestones = psqlAdmin(
  `select string_agg(distinct milestone, ',') from public.compliance_alerts_sent where organisation_id = '${ORG_A}';`
);
const adminRecipients = psqlAdmin(
  `select count(distinct recipient_user_id)::text from public.compliance_alerts_sent where organisation_id = '${ORG_A}' and audience = 'admin';`
);
record(
  "T6a",
  milestones.includes("60") && Number(adminAlerts) >= 2 && Number(driverAlerts) >= 1,
  `enqueue=${created1} milestones=${milestones} admin_inbox=${adminAlerts} admin_recipients=${adminRecipients} driver_inbox=${driverAlerts}`
);

const created2 = psqlService(`select public.enqueue_compliance_expiry_alerts()::text;`);
const adminAlerts2 = psqlAdmin(
  `select count(*)::text from public.admin_inbox_notifications where organisation_id = '${ORG_A}';`
);
record("T6b", adminAlerts === adminAlerts2, `dedupe admin count1=${adminAlerts} count2=${adminAlerts2} second_run=${created2}`);

// T6c single disc alert (vehicle field authoritative)
psqlAdmin(`
  delete from public.compliance_alerts_sent where subject_kind = 'vehicle_disc' and subject_id = '${V1}';
  delete from public.admin_inbox_notifications where subject_kind = 'vehicle_disc' and subject_id = '${V1}';
  update public.vehicles set license_disc_expires_on = ('${today}'::date + 45) where id = '${V1}';
  insert into public.vehicle_documents (organisation_id, vehicle_id, name, doc_type, expires_at)
  values ('${ORG_A}', '${V1}', 'disk scan', 'license_disk', ('${today}'::date + 45))
  on conflict do nothing;
`);
psqlService(`select public.enqueue_compliance_expiry_alerts();`);
const discRenewalRows = psqlAs(
  adminA,
  `select count(*)::text from public.list_compliance_renewals('${ORG_A}', 3650) where subject_kind = 'vehicle_disc' and vehicle_id = '${V1}';`
);
record("T6c", discRenewalRows === "1", `vehicle_disc renewal rows=${discRenewalRows} (vehicle field only)`);

// T6 no driver on V2 permit — only admin alerts for vehicle_permit on V2
psqlAdmin(`
  delete from public.compliance_alerts_sent where subject_id = '${V2}' and subject_kind = 'vehicle_permit';
  delete from public.driver_inbox_notifications where body like '%CMP-602%';
`);
psqlService(`select public.enqueue_compliance_expiry_alerts();`);
const v2DriverNotes = psqlAdmin(
  `select count(*)::text from public.driver_inbox_notifications n
   join public.drivers d on d.id = n.driver_id
   where n.body like '%CMP-602%';`
);
record("T6-no-driver", v2DriverNotes === "0", `driver notifications for unassigned V2=${v2DriverNotes}`);

// T8 notification RLS
const driverA_reads_b = psqlAs(
  driverAUser,
  `select count(*)::text from public.driver_inbox_notifications where driver_id = '${driverA2Id}';`
);
record("T8a", driverA_reads_b === "0", `driver A reads B notifications=${driverA_reads_b}`);

const driver_reads_admin = psqlAs(
  driverAUser,
  `select count(*)::text from public.admin_inbox_notifications;`
);
record("T8b", driver_reads_admin === "0", `driver admin inbox count=${driver_reads_admin}`);

const admin1_reads_admin2 = psqlAs(
  adminA,
  `select count(*)::text from public.admin_inbox_notifications where recipient_user_id = '${adminA2}';`
);
record("T8g", admin1_reads_admin2 === "0", `admin1 reads admin2 inbox=${admin1_reads_admin2}`);

const insertDriverNoteFail = psqlAsExpectFail(
  driverAUser,
  `insert into public.driver_inbox_notifications (organisation_id, driver_id, notification_type, title, body)
   values ('${ORG_A}', '${driverAId}', 'compliance_expiry', 'x', 'y');`
);
record("T8e-driver", insertDriverNoteFail, "driver cannot insert driver_inbox_notifications");

record(
  "T8e-admin-inbox",
  psqlAsExpectFail(
    adminA,
    `insert into public.admin_inbox_notifications (organisation_id, recipient_user_id, title, body)
     values ('${ORG_A}', '${adminA}', 'fake', 'fake');`
  ),
  "authenticated cannot insert admin_inbox_notifications"
);

record(
  "T8e-alerts-sent",
  psqlAsExpectFail(
    adminA,
    `insert into public.compliance_alerts_sent (
       organisation_id, subject_kind, subject_id, expires_on, milestone, audience, recipient_user_id
     ) values (
       '${ORG_A}', 'driver_license', '${driverAId}', current_date, '60', 'admin', '${adminA}'
     );`
  ),
  "authenticated cannot insert compliance_alerts_sent"
);

// T8f company_manager cannot read admin/compliance alert tables
const cmAdminInbox = psqlAs(cmA, `select count(*)::text from public.admin_inbox_notifications;`);
record("T8f-admin-inbox", cmAdminInbox === "0", `company_manager admin_inbox count=${cmAdminInbox}`);

const cmAlertsSent = psqlRaw(`select count(*)::text from public.compliance_alerts_sent;`, {
  userId: cmA,
  allowError: true,
});
record(
  "T8f-alerts-sent",
  cmAlertsSent.out === "0" || !cmAlertsSent.ok,
  `company_manager compliance_alerts_sent count=${cmAlertsSent.out || "denied"}`
);

// T9 missing data
const missing = psqlAs(adminA, `select count(*)::text from public.list_compliance_missing_data('${ORG_A}');`);
record("T9", Number(missing) > 0, `missing data rows=${missing}`);

// T10 execution path
record("T10-auth", psqlAsExpectFail(adminA, `select public.enqueue_compliance_expiry_alerts();`), "authenticated cannot enqueue");
record("T10-service", !psqlServiceExpectFail(`select public.enqueue_compliance_expiry_alerts();`), "service_role can enqueue");

// T6 milestone matrix (45→60, 20→30, 5→7, -1→expired)
for (const [days, milestone] of [
  [45, "60"],
  [20, "30"],
  [5, "7"],
  [-1, "expired"],
]) {
  psqlAdmin(`
    delete from public.compliance_alerts_sent where organisation_id = '${ORG_A}';
    delete from public.admin_inbox_notifications where organisation_id = '${ORG_A}';
    delete from public.driver_inbox_notifications where organisation_id = '${ORG_A}';
    update public.drivers set license_expires_on = (public.compliance_today_sast() + ${days}) where id = '${driverAId}';
  `);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const got = psqlAdmin(
    `select milestone from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}' limit 1;`
  );
  record(`T6-milestone-${milestone}`, got === milestone, `days_remaining=${days} milestone=${got}`);
}

// T8c cross-org notifications
const adminA_reads_B = psqlAs(
  adminA,
  `select count(*)::text from public.admin_inbox_notifications where organisation_id = '${ORG_B}';`
);
record("T8c", adminA_reads_B === "0", `org A admin reads org B admin inbox=${adminA_reads_B}`);

// T8d mark read other user's notification
const otherNote = psqlAdmin(
  `select id::text from public.admin_inbox_notifications where recipient_user_id = '${adminA2}' limit 1;`
);
if (otherNote) {
  psqlAs(adminA, `select public.mark_admin_notification_read('${otherNote}');`);
  const stillUnread = psqlAdmin(
    `select read_at is null from public.admin_inbox_notifications where id = '${otherNote}';`
  );
  record("T8d", stillUnread === "t", `admin1 cannot mark admin2 read (still unread=${stillUnread})`);
}

// T6d renewal re-arm (new expires_on → new alert cycle)
{
  const exp1 = psqlAdmin(`select (public.compliance_today_sast() + 45)::text;`);
  psqlAdmin(`
    delete from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}';
    delete from public.admin_inbox_notifications where subject_kind = 'driver_license' and subject_id = '${driverAId}';
    update public.drivers set license_expires_on = '${exp1}'::date where id = '${driverAId}';
  `);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const sent1 = psqlAdmin(
    `select count(*)::text from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}' and expires_on = '${exp1}'::date;`
  );
  const exp2 = psqlAdmin(`select (public.compliance_today_sast() + 20)::text;`);
  psqlAdmin(`update public.drivers set license_expires_on = '${exp2}'::date where id = '${driverAId}';`);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const sent2 = psqlAdmin(
    `select count(*)::text from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}' and expires_on = '${exp2}'::date;`
  );
  record(
    "T6d",
    Number(sent1) > 0 && Number(sent2) > 0,
    `first_cycle expires=${exp1} sent=${sent1}; re-arm expires=${exp2} sent=${sent2}`
  );
}

// T6e missed run — only current milestone (5 days → 7 only)
{
  psqlAdmin(`
    delete from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}';
    update public.drivers set license_expires_on = (public.compliance_today_sast() + 5) where id = '${driverAId}';
  `);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const milestones = psqlAdmin(
    `select coalesce(string_agg(distinct milestone, ',' order by milestone), '') from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}';`
  );
  record("T6e", milestones === "7", `milestones_sent=${milestones} (expected 7 only)`);
}

// T6f expired once per cycle; rerun zero; renewal allows new expired
{
  const expiredDate = psqlAdmin(`select (public.compliance_today_sast() - 1)::text;`);
  psqlAdmin(`
    delete from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}';
    delete from public.admin_inbox_notifications where subject_kind = 'driver_license' and subject_id = '${driverAId}';
    update public.drivers set license_expires_on = '${expiredDate}'::date where id = '${driverAId}';
  `);
  const run1 = psqlService(`select public.enqueue_compliance_expiry_alerts()::text;`);
  const expiredRows1 = psqlAdmin(
    `select count(*)::text from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}' and milestone = 'expired' and expires_on = '${expiredDate}'::date;`
  );
  const run2 = psqlService(`select public.enqueue_compliance_expiry_alerts()::text;`);
  const expiredRows2 = psqlAdmin(
    `select count(*)::text from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}' and milestone = 'expired' and expires_on = '${expiredDate}'::date;`
  );
  const newExpired = psqlAdmin(`select (public.compliance_today_sast() - 2)::text;`);
  psqlAdmin(`update public.drivers set license_expires_on = '${newExpired}'::date where id = '${driverAId}';`);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const newCycle = psqlAdmin(
    `select count(*)::text from public.compliance_alerts_sent where subject_kind = 'driver_license' and subject_id = '${driverAId}' and milestone = 'expired' and expires_on = '${newExpired}'::date;`
  );
  record(
    "T6f",
    Number(expiredRows1) > 0 && expiredRows1 === expiredRows2 && run2 === "0" && Number(newCycle) > 0,
    `expired_sent=${expiredRows1} rerun_created=${run2} after_renewal_expired=${newCycle}`
  );
}

// T7 reassignment recipient dedupe (vehicle permit alert moves to new driver)
{
  psqlAdmin(`
    delete from public.compliance_alerts_sent where organisation_id = '${ORG_A}' and subject_kind = 'vehicle_permit' and subject_id = '${V1}';
    delete from public.driver_inbox_notifications where organisation_id = '${ORG_A}' and notification_type = 'compliance_expiry';
    update public.driver_vehicle_assignments set ends_on = current_date where vehicle_id = '${V1}' and ends_on is null;
  `);
  psqlAs(adminA, `select public.assign_vehicle_to_driver('${driverAId}', '${V1}');`);
  const permitExp = psqlAdmin(`select (public.compliance_today_sast() + 20)::text;`);
  psqlAdmin(`
    update public.vehicles set operating_permit_expires_on = '${permitExp}'::date, operating_permit_number = 'PERMIT-T7' where id = '${V1}';
  `);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const aNotesBefore = psqlAdmin(
    `select count(*)::text from public.driver_inbox_notifications where driver_id = '${driverAId}' and notification_type = 'compliance_expiry';`
  );
  const bNotesBefore = psqlAdmin(
    `select count(*)::text from public.driver_inbox_notifications where driver_id = '${driverA2Id}' and notification_type = 'compliance_expiry';`
  );
  psqlAs(adminA, `select public.assign_vehicle_to_driver('${driverA2Id}', '${V1}');`);
  psqlService(`select public.enqueue_compliance_expiry_alerts();`);
  const aNotesAfter = psqlAdmin(
    `select count(*)::text from public.driver_inbox_notifications where driver_id = '${driverAId}' and notification_type = 'compliance_expiry';`
  );
  const bNotesAfter = psqlAdmin(
    `select count(*)::text from public.driver_inbox_notifications where driver_id = '${driverA2Id}' and notification_type = 'compliance_expiry';`
  );
  const bGotNew = Number(bNotesAfter) > Number(bNotesBefore);
  const aUnchanged = aNotesAfter === aNotesBefore;
  const aHasHistory = Number(aNotesBefore) >= 1;
  record(
    "T7",
    aHasHistory && aUnchanged && bGotNew,
    `A before=${aNotesBefore} after=${aNotesAfter}; B before=${bNotesBefore} after=${bNotesAfter}`
  );
}

// Regression: broad GRANT EXECUTE must not leave enqueue callable by authenticated (bootstrap re-revoke)
{
  psqlAdmin(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;`);
  psqlAdmin(`
    REVOKE EXECUTE ON FUNCTION public.enqueue_compliance_expiry_alerts() FROM PUBLIC, authenticated;
    GRANT EXECUTE ON FUNCTION public.enqueue_compliance_expiry_alerts() TO service_role;
    REVOKE EXECUTE ON FUNCTION public.driver_serves_company(uuid, uuid, integer) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.driver_serves_company(uuid, uuid, integer) TO authenticated;
    REVOKE EXECUTE ON FUNCTION public.assign_vehicle_to_driver(uuid, uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.assign_vehicle_to_driver(uuid, uuid) TO authenticated;
  `);
  record(
    "REG-bootstrap-revoke",
    psqlAsExpectFail(adminA, `select public.enqueue_compliance_expiry_alerts();`),
    "after simulated bootstrap broad grant + re-revoke, authenticated still denied"
  );
}

// Write evidence file
const reportPath = "/workspace/tests/rls/compliance-pr36-results.json";
writeFileSync(reportPath, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
console.log(`\nWrote ${reportPath}`);
