#!/usr/bin/env node
/**
 * Fuel slip capture (spec v2 §13 "Database / RLS") against the local hosted-mimic
 * Postgres from scripts/local-db/bootstrap.sh. Never run against production.
 *
 * Every run creates its own orgs/users with random ids, so it can be re-run on the
 * same database without cleanup.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

const PG = {
  host: process.env.FUEL_PG_HOST ?? "127.0.0.1",
  port: process.env.FUEL_PG_PORT ?? process.env.WORKOPS_AUDIT_PG_PORT ?? "54322",
  user: process.env.FUEL_PG_USER ?? "supabase_admin",
  password: process.env.FUEL_PG_PASSWORD ?? "postgres",
  database: process.env.FUEL_PG_DATABASE ?? "postgres",
};

const results = [];
function record(id, pass, evidence = "") {
  results.push({ id, pass: Boolean(pass), evidence });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${evidence ? ` — ${evidence}` : ""}`);
  if (!pass) process.exitCode = 1;
}

function runSql(sql, { role = null, sub = null, settings = {}, rollback = false } = {}) {
  let body = "BEGIN;\n";
  if (role) body += `SET LOCAL ROLE ${role};\n`;
  if (sub) body += `SET LOCAL request.jwt.claim.sub = '${sub}';\n`;
  for (const [k, v] of Object.entries(settings)) body += `SET LOCAL ${k} = '${v}';\n`;
  body += `${sql.trim().replace(/;\s*$/, "")};\n${rollback ? "ROLLBACK" : "COMMIT"};\n`;
  const res = spawnSync(
    "psql",
    ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-h", PG.host, "-p", PG.port, "-U", PG.user, "-d", PG.database],
    { input: body, env: { ...process.env, PGPASSWORD: PG.password }, encoding: "utf8" }
  );
  const lines = (res.stdout ?? "").split("\n").filter((l) => l.trim() !== "");
  return { ok: res.status === 0, out: lines.at(-1) ?? "", err: (res.stderr ?? "").trim() };
}

function su(sql, opts = {}) {
  const r = runSql(sql, opts);
  if (!r.ok) throw new Error(`SQL failed: ${r.err}\n${sql}`);
  return r.out;
}
const svc = (sql, opts = {}) => su(sql, { ...opts, role: "service_role" });
const svcJson = (sql, opts = {}) => JSON.parse(svc(sql, opts));
function svcErr(sql, opts = {}) {
  const r = runSql(sql, { ...opts, role: "service_role" });
  return r.ok ? null : r.err;
}
const asUser = (sub, sql, opts = {}) => runSql(sql, { ...opts, role: "authenticated", sub });
const asAnon = (sql) => runSql(sql, { role: "anon" });
const num = (sql) => Number(su(sql));

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v === null || v === undefined ? "null" : `$j$${JSON.stringify(v)}$j$::jsonb`);
const sha256Hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const randomSha = () => randomBytes(32).toString("hex");

function sast(offsetMinutes = 0) {
  const iso = new Date(Date.now() + offsetMinutes * 60_000 + 2 * 3_600_000).toISOString();
  return { filled_date: iso.slice(0, 10), filled_time: iso.slice(11, 16) };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const run = randomBytes(4).toString("hex");
const ORG = randomUUID();
const ORG2 = randomUUID();
const ORGR = randomUUID();
const U = Object.fromEntries(
  ["po", "admin", "drv1", "drv2", "cm", "emp", "mgr", "dsp", "sup", "admin2", "drv_o2", "adminR", "drvR"].map((k) => [
    k,
    randomUUID(),
  ])
);
const CO_P = randomUUID();
const CO_Q = randomUUID();
const CO_W = randomUUID();
const CO_O2 = randomUUID();
const CO_R = randomUUID();
const D1 = randomUUID();
const D2 = randomUUID();
const D_O2 = randomUUID();
const D_R = randomUUID();
const V1 = randomUUID(); // CA 123-456, CO_P, tank 80, ulp95; D1 assigned
const V2 = randomUUID(); // CA 999 000, CO_Q, tank unknown
const V3 = randomUUID(); // CY 1, CO_W, tank 60, diesel50
const V4 = randomUUID(); // CA 444, CO_P, tank 70
const VO2 = randomUUID();
const VR = randomUUID();

function setupFixtures() {
  const users = Object.entries(U)
    .map(
      ([k, id]) =>
        `('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', 'fuel.${k}.${run}@fuel.test', extensions.crypt('x', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{"full_name":"Fuel ${k}"}')`
    )
    .join(",\n");
  su(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ${users};
    insert into public.profiles (id, email, full_name)
    select u.id, u.email, u.email from auth.users u where u.id in (${Object.values(U).map(q).join(",")})
    on conflict (id) do nothing;
    update public.profiles set is_platform_owner = true where id = ${q(U.po)};
    insert into public.organisations (id, name, slug, status) values
      (${q(ORG)}, 'Fuel Org ${run}', 'fuel-org-${run}', 'active'),
      (${q(ORG2)}, 'Fuel Org2 ${run}', 'fuel-org2-${run}', 'active'),
      (${q(ORGR)}, 'Fuel OrgR ${run}', 'fuel-orgr-${run}', 'active');
    insert into public.organisation_members (organisation_id, user_id, role, status) values
      (${q(ORG)}, ${q(U.admin)}, 'organisation_admin', 'active'),
      (${q(ORG)}, ${q(U.drv1)}, 'driver', 'active'),
      (${q(ORG)}, ${q(U.drv2)}, 'driver', 'active'),
      (${q(ORG)}, ${q(U.cm)}, 'company_manager', 'active'),
      (${q(ORG)}, ${q(U.emp)}, 'employee', 'active'),
      (${q(ORG)}, ${q(U.mgr)}, 'manager', 'active'),
      (${q(ORG)}, ${q(U.dsp)}, 'dispatcher', 'active'),
      (${q(ORG)}, ${q(U.sup)}, 'supervisor', 'active'),
      (${q(ORG2)}, ${q(U.admin2)}, 'organisation_admin', 'active'),
      (${q(ORG2)}, ${q(U.drv_o2)}, 'driver', 'active'),
      (${q(ORGR)}, ${q(U.adminR)}, 'organisation_admin', 'active'),
      (${q(ORGR)}, ${q(U.drvR)}, 'driver', 'active');
    insert into public.companies (id, organisation_id, name, status) values
      (${q(CO_P)}, ${q(ORG)}, 'Fuel Co P', 'active'),
      (${q(CO_Q)}, ${q(ORG)}, 'Fuel Co Q', 'active'),
      (${q(CO_W)}, ${q(ORG)}, 'Fuel Co W', 'active'),
      (${q(CO_O2)}, ${q(ORG2)}, 'Fuel Co O2', 'active'),
      (${q(CO_R)}, ${q(ORGR)}, 'Fuel Co R', 'active');
    insert into public.member_scopes (organisation_id, membership_id, company_id)
    select m.organisation_id, m.id, ${q(CO_P)}::uuid from public.organisation_members m
    where m.organisation_id = ${q(ORG)} and m.user_id = ${q(U.cm)};
    insert into public.drivers (id, organisation_id, full_name, profile_id, status) values
      (${q(D1)}, ${q(ORG)}, 'Driver One', ${q(U.drv1)}, 'active'),
      (${q(D2)}, ${q(ORG)}, 'Driver Two', ${q(U.drv2)}, 'active'),
      (${q(D_O2)}, ${q(ORG2)}, 'Driver O2', ${q(U.drv_o2)}, 'active'),
      (${q(D_R)}, ${q(ORGR)}, 'Driver R', ${q(U.drvR)}, 'active');
    insert into public.vehicles (id, organisation_id, company_id, name, registration_number, vehicle_type, status, tank_capacity_litres, default_fuel_type) values
      (${q(V1)}, ${q(ORG)}, ${q(CO_P)}, 'Quantum', 'CA 123-456', 'minibus', 'active', 80, 'ulp95'),
      (${q(V2)}, ${q(ORG)}, ${q(CO_Q)}, 'Van Q', 'CA 999 000', 'van', 'active', null, null),
      (${q(V3)}, ${q(ORG)}, ${q(CO_W)}, 'Truck W', 'CY 1', 'truck', 'active', 60, 'diesel50'),
      (${q(V4)}, ${q(ORG)}, ${q(CO_P)}, 'Sedan P', 'CA 444', 'sedan', 'active', 70, 'ulp93'),
      (${q(VO2)}, ${q(ORG2)}, ${q(CO_O2)}, 'Other', 'CA 222', 'van', 'active', 70, 'ulp95'),
      (${q(VR)}, ${q(ORGR)}, ${q(CO_R)}, 'Ret', 'CA 777', 'van', 'active', 70, 'ulp95');
    insert into public.driver_vehicle_assignments (organisation_id, driver_id, vehicle_id, starts_on)
    values (${q(ORG)}, ${q(D1)}, ${q(V1)}, date '2026-01-01'),
           (${q(ORGR)}, ${q(D_R)}, ${q(VR)}, date '2026-01-01');
  `);
}

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

function photoFor(org, fillupId = randomUUID(), sha = randomSha()) {
  const photoId = randomUUID();
  return {
    fillup_id: fillupId,
    photo_id: photoId,
    storage_path: `${org}/fillups/2026/09/${fillupId}/${photoId}.jpg`,
    mime_type: "image/jpeg",
    size_bytes: 412345,
    width_px: 1800,
    height_px: 2400,
    sha256: sha,
  };
}

function fields(overrides = {}) {
  return {
    ...sast(-60),
    litres: "36.51",
    unit_price: "26.05",
    total_amount: "951.10",
    fuel_type: "ulp95",
    slip_vrn: "CA123456",
    slip_vrn_status: "confirmed_prefill",
    odometer_km: "68316",
    pump_no: "08",
    station_name: "TOTAL Woodstock",
    station_vat_no: "4190191843",
    is_full_tank: true,
    ...overrides,
  };
}

const submitSql = ({ actor, org = ORG, cid = randomUUID(), vehicle, f, photo }) =>
  `select public.submit_fuel_slip(${q(actor)}, ${q(org)}, ${q(cid)}, ${q(vehicle)}, ${j(f)}, ${j(photo)})::text`;

function submit(args) {
  return svcJson(submitSql(args));
}
function submitErr(args) {
  return svcErr(submitSql(args));
}

const row = (id) => JSON.parse(su(`select to_jsonb(f)::text from public.fuel_fillups f where f.id = ${q(id)}`));
const openFlags = (id) =>
  JSON.parse(
    su(
      `select coalesce(jsonb_object_agg(code, jsonb_build_object('severity', severity, 'message', message, 'details', details)), '{}')::text
       from public.fuel_entry_flags where fillup_id = ${q(id)} and status = 'open'`
    )
  );
const auditCount = (entityId, action) =>
  num(`select count(*) from public.audit_logs where entity_id = ${q(entityId)} and action = ${q(action)}`);
const auditMeta = (entityId, action) =>
  JSON.parse(
    su(
      `select coalesce((select metadata from public.audit_logs where entity_id = ${q(entityId)} and action = ${q(action)} order by created_at desc limit 1), 'null'::jsonb)::text`
    )
  );

function update(actor, id, f, org = ORG) {
  const at = row(id).updated_at;
  return svcJson(`select public.update_fuel_slip(${q(actor)}, ${q(org)}, ${q(id)}, ${j(f)}, ${q(at)}::timestamptz)::text`);
}
function updateErr(actor, id, f, expected = null, org = ORG) {
  const at = expected ?? row(id).updated_at;
  return svcErr(`select public.update_fuel_slip(${q(actor)}, ${q(org)}, ${q(id)}, ${j(f)}, ${q(at)}::timestamptz)::text`);
}
const reviewSql = (actor, id, action, { reason = null, note = null, res = null, org = ORG } = {}) =>
  `select public.review_fuel_slip(${q(actor)}, ${q(org)}, ${q(id)}, ${q(action)}, ${q(reason)}, ${q(note)}, ${j(res)}, ${q(row(id).updated_at)}::timestamptz)::text`;
const review = (...a) => svcJson(reviewSql(...a));
const reviewErr = (...a) => svcErr(reviewSql(...a));

const hasErr = (err, code) => typeof err === "string" && err.includes(code);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testSchema() {
  record(
    "SCHEMA-no-fuel-enums",
    num(`select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'public' and t.typtype = 'e' and t.typname like 'fuel%'`) === 0,
    "value lists are TEXT + CHECK"
  );

  const colTypes = JSON.parse(
    su(`select jsonb_object_agg(column_name, data_type)::text from information_schema.columns
        where table_schema = 'public' and table_name = 'fuel_fillups'
          and column_name in ('entry_method','review_status','fuel_type','slip_vrn_status','max_open_severity')`)
  );
  record(
    "SCHEMA-text-columns",
    Object.values(colTypes).length === 5 && Object.values(colTypes).every((t) => t === "text"),
    JSON.stringify(colTypes)
  );

  const checks = JSON.parse(
    su(`select jsonb_object_agg(conname, pg_get_constraintdef(oid))::text from pg_constraint
        where conrelid = 'public.fuel_fillups'::regclass and contype = 'c'`)
  );
  const has = (name, ...vals) => typeof checks[name] === "string" && vals.every((v) => checks[name].includes(`'${v}'`));
  record("SCHEMA-check-entry_method", has("fuel_fillups_entry_method_check", "driver_photo", "admin_manual", "legacy_manual"));
  record(
    "SCHEMA-check-review_status-voided",
    has("fuel_fillups_review_status_check", "pending_review", "queried", "approved", "rejected", "voided") &&
      !checks.fuel_fillups_review_status_check.includes("'void'")
  );
  record("SCHEMA-check-fuel_type", has("fuel_fillups_fuel_type_check", "ulp93", "ulp95", "diesel50", "diesel500", "other"));
  record(
    "SCHEMA-check-slip_vrn_status",
    has("fuel_fillups_slip_vrn_status_check", "confirmed_prefill", "edited", "not_shown", "legacy")
  );
  const notValid = num(`select count(*) from pg_constraint where conrelid = 'public.fuel_fillups'::regclass and contype = 'c' and not convalidated`);
  record("SCHEMA-checks-validated", notValid === 0, `not_valid=${notValid}`);

  const defaults = JSON.parse(
    su(`select jsonb_object_agg(column_name, column_default)::text from information_schema.columns
        where table_schema = 'public' and table_name = 'fuel_fillups'
          and column_name in ('entry_method','review_status','slip_vrn_status','is_full_tank','legal_hold','field_sources')`)
  );
  record(
    "SCHEMA-fillup-defaults",
    /driver_photo/.test(defaults.entry_method) &&
      /pending_review/.test(defaults.review_status) &&
      defaults.slip_vrn_status === null &&
      defaults.is_full_tank === "true" &&
      defaults.legal_hold === "false",
    JSON.stringify(defaults)
  );

  const genCol = su(`select generation_expression from information_schema.columns
                     where table_schema = 'public' and table_name = 'fuel_fillups' and column_name = 'slip_vrn_normalised'`);
  record("SCHEMA-slip_vrn_normalised-generated", genCol.length > 0, genCol);

  const cols = (t) =>
    su(`select string_agg(column_name, ',' order by column_name) from information_schema.columns
        where table_schema = 'public' and table_name = '${t}'`).split(",");
  const photoCols = [
    "bucket_id", "created_at", "fillup_id", "height_px", "id", "is_current", "mime_type", "organisation_id",
    "purge_reason", "purged_at", "sha256", "size_bytes", "storage_path", "superseded_at", "uploaded_by", "width_px",
  ];
  record("SCHEMA-photos-columns", JSON.stringify(cols("fuel_slip_photos")) === JSON.stringify(photoCols), cols("fuel_slip_photos").join(","));
  const flagCols = [
    "code", "created_at", "details", "fillup_id", "id", "message", "organisation_id", "resolution_note",
    "resolved_at", "resolved_by", "severity", "status",
  ];
  record("SCHEMA-flags-columns", JSON.stringify(cols("fuel_entry_flags")) === JSON.stringify(flagCols), cols("fuel_entry_flags").join(","));

  const flagChecks = su(`select string_agg(pg_get_constraintdef(oid), ' ') from pg_constraint where conrelid = 'public.fuel_entry_flags'::regclass and contype = 'c'`);
  record(
    "SCHEMA-flags-checks",
    ["info", "low", "medium", "high", "open", "accepted", "dismissed", "cleared_by_edit", "AMOUNT_MISMATCH", "EDITED_AFTER_QUERY"].every((v) =>
      flagChecks.includes(`'${v}'`)
    )
  );

  const idx = su(`select string_agg(indexname || ':' || indexdef, ' | ') from pg_indexes
                  where schemaname = 'public' and tablename in ('fuel_fillups','fuel_slip_photos','fuel_entry_flags')`);
  record("SCHEMA-one-current-photo-index", /fuel_slip_photos_one_current_uidx:CREATE UNIQUE INDEX .*\(fillup_id\) WHERE is_current/.test(idx));
  record("SCHEMA-one-open-flag-index", /fuel_entry_flags_one_open_uidx:CREATE UNIQUE INDEX .*\(fillup_id, code\) WHERE \(status = 'open'/.test(idx));
  record("SCHEMA-client-entry-unique-index", /CREATE UNIQUE INDEX .*\(organisation_id, client_entry_id\)/.test(idx));
  record(
    "SCHEMA-authorisation_no-not-unique",
    !idx.split(" | ").some((l) => /UNIQUE/.test(l) && /authorisation_no/.test(l)) &&
      num(`select count(*) from pg_constraint where conrelid = 'public.fuel_fillups'::regclass and contype = 'u'`) === 0
  );
  for (const name of [
    "fuel_fillups_review_queue_idx", "fuel_fillups_driver_filled_live_idx", "fuel_fillups_org_vat_slip_idx",
    "fuel_fillups_org_auth_filled_idx", "fuel_fillups_org_retain_until_idx", "fuel_slip_photos_org_sha256_idx",
    "fuel_slip_photos_fillup_idx", "fuel_entry_flags_org_open_idx", "fuel_entry_flags_fillup_idx",
  ]) {
    record(`SCHEMA-index-${name}`, idx.includes(`${name}:`));
  }

  const veh = JSON.parse(
    su(`select jsonb_object_agg(column_name, jsonb_build_object('type', data_type, 'p', numeric_precision, 's', numeric_scale))::text
        from information_schema.columns where table_schema = 'public' and table_name = 'vehicles'
          and column_name in ('tank_capacity_litres','default_fuel_type')`)
  );
  record(
    "SCHEMA-vehicles-fuel-profile",
    veh.tank_capacity_litres?.type === "numeric" && veh.tank_capacity_litres.p === 6 && veh.tank_capacity_litres.s === 1 &&
      veh.default_fuel_type?.type === "text",
    JSON.stringify(veh)
  );
  const vehErr = runSql(`update public.vehicles set default_fuel_type = 'petrol' where id = ${q(V4)}`);
  const tankErr = runSql(`update public.vehicles set tank_capacity_litres = 2 where id = ${q(V4)}`);
  record("SCHEMA-vehicles-checks", !vehErr.ok && !tankErr.ok, "petrol / 2 L rejected");
}

function testSettingsDefaults() {
  const s = JSON.parse(svc(`select to_jsonb(public.fuel_setting(${q(ORG2)}))::text`));
  const expected = {
    amount_tol_abs: 1, amount_tol_pct: 0.25, price_min: 15, price_max: 35, max_age_days: 7, future_tol_minutes: 10,
    min_hours_between_fills: 6, max_km_between_fills: 1500, tank_tol_pct: 5, consumption_min: 4, consumption_max: 40,
    dup_auth_window_days: 1, dup_auth_severity: "medium", default_order_no: null, retention_months: null,
    post_retention_action: null, scan_enabled: false,
  };
  const mismatches = Object.entries(expected).filter(([k, v]) => (typeof v === "number" ? Number(s[k]) !== v : s[k] !== v));
  record("SETTINGS-v1-defaults", mismatches.length === 0, mismatches.length ? JSON.stringify(mismatches) : "all 17 defaults match §6.2");

  const same = su(
    `with d as (select to_jsonb(public.fuel_setting(${q(ORG2)})) j),
          ins as (insert into public.fuel_settings (organisation_id) values (${q(ORG2)}) returning *)
     select ((to_jsonb(ins) - 'updated_at' - 'updated_by') = (d.j - 'updated_at' - 'updated_by'))::text from ins, d`,
    { rollback: true }
  );
  record("SETTINGS-table-defaults-match-fuel_setting", same === "true");
}

function testPrivileges() {
  const tables = ["fuel_fillups", "fuel_slip_photos", "fuel_entry_flags", "fuel_settings"];
  const bad = su(`
    select coalesce(string_agg(r || ':' || t || ':' || p, ','), '')
    from unnest(array['anon','authenticated']) r,
         unnest(array[${tables.map(q).join(",")}]) t,
         unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
    where has_table_privilege(r, 'public.' || t, p)`);
  record("GRANTS-no-client-writes", bad === "", bad || "anon/authenticated lack INSERT/UPDATE/DELETE/TRUNCATE");
  const anonSel = su(`select coalesce(string_agg(t, ','), '') from unnest(array[${tables.map(q).join(",")}]) t
                      where has_table_privilege('anon', 'public.' || t, 'SELECT')`);
  record("GRANTS-anon-revoke-all", anonSel === "", anonSel || "anon has no SELECT");

  const rls = num(`select count(*) from pg_class where oid in (${tables.map((t) => `'public.${t}'::regclass`).join(",")}) and relrowsecurity`);
  record("RLS-enabled", rls === 4);
  const writePolicies = su(`select coalesce(string_agg(tablename || '.' || policyname, ','), '') from pg_policies
                            where schemaname = 'public' and tablename in (${tables.map(q).join(",")}) and cmd <> 'SELECT'`);
  record("RLS-no-write-policies", writePolicies === "", writePolicies || "fuel_fillups_insert/update dropped");

  for (const [who, sub] of [["driver", U.drv1], ["admin", U.admin]]) {
    const ins = asUser(sub, `insert into public.fuel_fillups (organisation_id, vehicle_id, driver_id, odometer_km, litres, unit_price, total_amount, slip_vrn_status, entry_method)
                             values (${q(ORG)}, ${q(V1)}, ${q(D1)}, 1, 1, 20, 20, 'not_shown', 'driver_photo')`);
    record(`DIRECT-insert-denied-${who}`, !ins.ok && /permission denied/.test(ins.err), ins.err.split("\n")[0]);
    const upd = asUser(sub, `update public.fuel_fillups set litres = 1 where organisation_id = ${q(ORG)}`);
    record(`DIRECT-update-denied-${who}`, !upd.ok && /permission denied/.test(upd.err));
    const del = asUser(sub, `delete from public.fuel_fillups where organisation_id = ${q(ORG)}`);
    record(`DIRECT-delete-denied-${who}`, !del.ok && /permission denied/.test(del.err));
    for (const t of ["fuel_slip_photos", "fuel_entry_flags", "fuel_settings"]) {
      const r = asUser(sub, `delete from public.${t}`);
      record(`DIRECT-delete-denied-${who}-${t}`, !r.ok && /permission denied/.test(r.err));
    }
  }
  const anonRead = asAnon(`select count(*) from public.fuel_fillups`);
  record("DIRECT-anon-select-denied", !anonRead.ok && /permission denied/.test(anonRead.err));

  const sigs = [
    "public.submit_fuel_slip(uuid, uuid, uuid, uuid, jsonb, jsonb)",
    "public.update_fuel_slip(uuid, uuid, uuid, jsonb, timestamptz)",
    "public.replace_fuel_slip_photo(uuid, uuid, uuid, jsonb, timestamptz)",
    "public.review_fuel_slip(uuid, uuid, uuid, text, text, text, jsonb, timestamptz)",
    "public.void_fuel_slip(uuid, uuid, uuid, text, timestamptz)",
    "public.privacy_purge_fuel_slip_photo(uuid, uuid, uuid, text)",
    "public.audit_fuel_slip_photo_view(uuid, uuid, uuid)",
    "public.audit_fuel_report_export(uuid, uuid, text, jsonb, integer)",
    "public.save_fuel_settings(uuid, uuid, jsonb)",
    "public.run_fuel_slip_retention(timestamptz)",
    "public.evaluate_fuel_entry_flags(uuid, uuid, text)",
    "public.fuel_setting(uuid)",
    "public.fuel_actor_role(uuid, uuid)",
    "public.fuel_slip_normalise_fields(jsonb, text)",
    "public.fuel_slip_photo_input(uuid, jsonb)",
    "public.fuel_refresh_flag_counts(uuid)",
    "public.fuel_path_sha256(text)",
    "public.save_vehicle_capture(uuid, uuid, uuid, jsonb)",
  ];
  const legacy = [
    "public.log_fuel_fillup(uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text)",
    "public.write_audit_log(uuid, text, text, uuid, jsonb, uuid)",
    "public.enqueue_compliance_storage_purge(text, text, uuid, uuid, text)",
  ];
  const all = [...sigs, ...legacy];
  const clientExec = su(`
    select coalesce(string_agg(r || ':' || s, ','), '')
    from unnest(array['anon','authenticated']) r, unnest(array[${all.map(q).join(",")}]) s
    where has_function_privilege(r, s::regprocedure, 'EXECUTE')`);
  record("GRANTS-no-client-execute", clientExec === "", clientExec || `${all.length} functions: anon/authenticated denied`);
  const publicExec = su(`
    select coalesce(string_agg(s, ','), '') from unnest(array[${all.map(q).join(",")}]) s
    where exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where p.oid = s::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')`);
  record("GRANTS-no-public-execute", publicExec === "", publicExec || "PUBLIC has no EXECUTE");
  const svcMissing = su(`select coalesce(string_agg(s, ','), '') from unnest(array[${sigs.map(q).join(",")}]) s
                         where not has_function_privilege('service_role', s::regprocedure, 'EXECUTE')`);
  record("GRANTS-service-role-execute", svcMissing === "", svcMissing || "service_role can EXECUTE fuel RPCs");

  const callSubmit = asUser(U.drv1, submitSql({ actor: U.drv1, vehicle: V1, f: fields(), photo: photoFor(ORG) }));
  record("EXEC-authenticated-submit-denied", !callSubmit.ok && /permission denied/.test(callSubmit.err));
  const callLegacy = asUser(U.drv1, `select public.log_fuel_fillup(${q(ORG)}, ${q(V1)}, 1, 1)`);
  record("EXEC-authenticated-log_fuel_fillup-denied", !callLegacy.ok && /permission denied/.test(callLegacy.err));
  const callAudit = asUser(U.admin, `select public.write_audit_log(${q(ORG)}, 'x', 'y', null, '{}'::jsonb, null)`);
  record("EXEC-authenticated-write_audit_log-denied", !callAudit.ok && /permission denied/.test(callAudit.err));
  const anonLegacy = asAnon(`select public.log_fuel_fillup(${q(ORG)}, ${q(V1)}, 1, 1)`);
  record("EXEC-anon-log_fuel_fillup-denied", !anonLegacy.ok && /permission denied/.test(anonLegacy.err));
  const anonRet = asAnon(`select public.run_fuel_slip_retention(now())`);
  record("EXEC-anon-retention-denied", !anonRet.ok && /permission denied/.test(anonRet.err));
}

function testStorage() {
  const b = su(`select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'fuel-slips'`);
  record("STORAGE-bucket-private", b === "false|5242880|image/jpeg,image/png,image/webp", b);
  const pol = num(`select count(*) from pg_policies where schemaname = 'storage'
                   and (policyname ilike '%fuel%' or coalesce(qual, '') ilike '%fuel-slips%' or coalesce(with_check, '') ilike '%fuel-slips%')`);
  record("STORAGE-no-fuel-policies", pol === 0);

  const files = ["00051_fuel_slip_enums.sql", "00052_fuel_slips.sql"].map((f) => [
    f,
    readFileSync(join(ROOT, "supabase/migrations", f), "utf8").replace(/--.*$/gm, ""),
  ]);
  const grep = (re) => files.filter(([, s]) => re.test(s)).map(([f]) => f);
  record("GREP-no-alter-storage-objects", grep(/alter\s+table\s+(if\s+exists\s+)?storage\.objects/i).length === 0);
  record("GREP-no-delete-storage-objects", grep(/delete\s+from\s+storage\.objects/i).length === 0);
  record("GREP-no-bare-digest", grep(/(?<!extensions\.)\bdigest\s*\(/i).length === 0);
  record("GREP-no-storage-policy", grep(/create\s+policy[^;]*on\s+storage\.objects/i).length === 0);
  record("GREP-no-create-type", grep(/create\s+type/i).length === 0, "no enums in 00052");
}

// Filled in by testSubmit and reused by later sections.
const E = {};

function testSubmit() {
  let err = submitErr({ actor: U.drv1, vehicle: V1, f: fields(), photo: null });
  record("SUBMIT-driver-no-photo-photo_required", hasErr(err, "photo_required"), err?.split("\n")[0]);

  const before = num(`select count(*) from public.fuel_fillups where organisation_id = ${q(ORG)}`);
  err = submitErr({ actor: U.drv1, vehicle: V1, f: { ...fields(), entry_method: "admin_manual" }, photo: photoFor(ORG) });
  record("SUBMIT-driver-cannot-set-entry_method", hasErr(err, "entry_method_forbidden"), err?.split("\n")[0]);
  err = submitErr({ actor: U.drv1, vehicle: V1, f: { ...fields(), driver_id: D2 }, photo: photoFor(ORG) });
  record("SUBMIT-driver-cannot-set-driver_id", hasErr(err, "field_not_allowed:driver_id"));
  record("SUBMIT-rejected-no-row", num(`select count(*) from public.fuel_fillups where organisation_id = ${q(ORG)}`) === before);

  // Sample slip (TOTAL Woodstock): 36.51 x 26.05 = 951.09 vs typed 951.10 -> no flag.
  const cid = randomUUID();
  const photo = photoFor(ORG);
  const s = submit({ actor: U.drv1, cid, vehicle: V1, f: fields(sast(-24 * 60)), photo });
  E.sample = s.id;
  E.samplePhoto = photo;
  const r = row(s.id);
  record(
    "SUBMIT-driver-photo-pending",
    r.entry_method === "driver_photo" && r.review_status === "pending_review" && r.driver_id === D1 && r.company_id === CO_P,
    `${r.entry_method}/${r.review_status}`
  );
  record(
    "SUBMIT-sample-calculated-vs-typed",
    Number(r.calculated_total) === 951.09 && Number(r.total_amount) === 951.1,
    `calc=${r.calculated_total} typed=${r.total_amount}`
  );
  record("SUBMIT-sample-no-flags", r.open_flag_count === 0 && Object.keys(openFlags(s.id)).length === 0, JSON.stringify(openFlags(s.id)));
  record("SUBMIT-vrn-snapshot-normalised", r.vehicle_vrn_snapshot === "CA123456" && r.slip_vrn_normalised === "CA123456");
  record("SUBMIT-pump-no-parsed", r.pump_no === 8);
  record("SUBMIT-current-photo", num(`select count(*) from public.fuel_slip_photos where fillup_id = ${q(s.id)} and is_current`) === 1);
  const sub = auditMeta(s.id, "fuel_slip.submitted");
  record("AUDIT-submitted-entry_method", sub?.entry_method === "driver_photo", JSON.stringify(sub));
  const up = auditMeta(s.id, "fuel_slip.photo_uploaded");
  record("AUDIT-photo_uploaded-path-hash", up?.path_sha256 === sha256Hex(photo.storage_path) && !JSON.stringify(up).includes(photo.storage_path));
  record("AUDIT-flags_evaluated", auditCount(s.id, "fuel_slip.flags_evaluated") === 1);

  // Idempotent client_entry_id
  const retryPhoto = photoFor(ORG, s.id);
  const again = submit({ actor: U.drv1, cid, vehicle: V1, f: fields(sast(-24 * 60)), photo: retryPhoto });
  record(
    "SUBMIT-idempotent-client_entry_id",
    again.id === s.id && again.replayed === true &&
      num(`select count(*) from public.fuel_fillups where organisation_id = ${q(ORG)} and client_entry_id = ${q(cid)}`) === 1 &&
      auditCount(s.id, "fuel_slip.submitted") === 1
  );
  record(
    "SUBMIT-idempotent-unused-upload-queued",
    num(`select count(*) from public.compliance_storage_purge_queue where bucket_id = 'fuel-slips' and storage_path = ${q(retryPhoto.storage_path)} and reason = 'fuel_orphan'`) === 1
  );
  err = submitErr({ actor: U.drv2, cid, vehicle: V1, f: fields(), photo: photoFor(ORG) });
  record("SUBMIT-client_entry_id-other-actor-conflict", hasErr(err, "client_entry_conflict"));

  // Odometer required (driver + admin); VRN action required
  const noOdo = fields();
  delete noOdo.odometer_km;
  err = submitErr({ actor: U.drv1, vehicle: V1, f: noOdo, photo: photoFor(ORG) });
  record("SUBMIT-driver-odometer-null-rejected", hasErr(err, "odometer_required"));
  err = submitErr({ actor: U.admin, vehicle: V1, f: noOdo, photo: null });
  record("SUBMIT-admin-odometer-null-rejected", hasErr(err, "odometer_required"));
  const noVrn = fields();
  delete noVrn.slip_vrn_status;
  err = submitErr({ actor: U.drv1, vehicle: V1, f: noVrn, photo: photoFor(ORG) });
  record("SUBMIT-driver-vrn-action-required", hasErr(err, "vrn_action_required"));
  err = submitErr({ actor: U.admin, vehicle: V1, f: noVrn, photo: null });
  record("SUBMIT-admin-vrn-action-required", hasErr(err, "vrn_action_required"));
  err = submitErr({ actor: U.drv1, vehicle: V1, f: fields({ slip_vrn: null }), photo: photoFor(ORG) });
  record("SUBMIT-confirm-without-vrn-rejected", hasErr(err, "slip_vrn_required"));

  // Input validation (§4.1) — blocks saving
  const cases = [
    ["litres-zero", { litres: "0" }, "litres_out_of_range"],
    ["litres-over-1000", { litres: "1000.5" }, "litres_out_of_range"],
    ["price-over-100", { unit_price: "150" }, "unit_price_out_of_range"],
    ["total-over-100000", { total_amount: "100000" }, "total_amount_out_of_range"],
    ["odometer-over-2m", { odometer_km: "2000001" }, "odometer_out_of_range"],
    ["not-a-number", { litres: "abc" }, "invalid_number:litres"],
    ["slip-date-text-yy-mm-dd", { filled_date: "26/09/27" }, "invalid_filled_at"],
    ["date-before-2020", { filled_date: "2019-12-31" }, "filled_at_out_of_range"],
    ["vat-not-10-digits", { station_vat_no: "419019184" }, "invalid_station_vat_no"],
    ["fuel-type-invalid", { fuel_type: "diesel" }, "invalid_fuel_type"],
    ["station-required", { station_name: "" }, "station_name_required"],
    ["pump-out-of-range", { pump_no: "100" }, "invalid_pump_no"],
  ];
  for (const [name, o, code] of cases) {
    err = submitErr({ actor: U.drv1, vehicle: V1, f: fields(o), photo: photoFor(ORG) });
    record(`VALIDATE-${name}`, hasErr(err, code), err?.split("\n")[0]);
  }
  const bad = { ...photoFor(ORG) };
  bad.storage_path = `${ORG}/fuel-slips/${bad.fillup_id}/${bad.photo_id}.jpg`;
  err = submitErr({ actor: U.drv1, vehicle: V1, f: fields(), photo: bad });
  record("VALIDATE-photo-path-layout", hasErr(err, "invalid_photo_path"));
  err = submitErr({ actor: U.drv1, vehicle: V1, f: fields(), photo: photoFor(ORG2) });
  record("VALIDATE-photo-path-other-org", hasErr(err, "invalid_photo_path"));
  err = submitErr({ actor: U.drv1, vehicle: V1, f: fields(), photo: { ...photoFor(ORG), size_bytes: 5242881 } });
  record("VALIDATE-photo-over-5mb", hasErr(err, "photo_too_large"));
  err = submitErr({ actor: U.drv1, vehicle: V1, f: fields(), photo: { ...photoFor(ORG), mime_type: "image/gif" } });
  record("VALIDATE-photo-mime", hasErr(err, "invalid_photo_mime"));

  const comma = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-30 * 60), litres: "36,51", slip_vrn: "CA444", odometer_km: "1000" }), photo: photoFor(ORG) });
  record("VALIDATE-decimal-comma-accepted", Number(row(comma.id).litres) === 36.51);
  E.v4first = comma.id;

  // Roles that may not submit
  for (const [who, sub] of [["employee", U.emp], ["company_manager", U.cm], ["manager", U.mgr], ["dispatcher", U.dsp], ["supervisor", U.sup], ["other-org-admin", U.admin2]]) {
    err = submitErr({ actor: sub, vehicle: V1, f: fields(), photo: photoFor(ORG) });
    record(`SUBMIT-denied-${who}`, hasErr(err, "not_authorised"));
  }

  // Odometer regression is a flag, never a block
  const reg = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-12 * 60), odometer_km: "68000" }), photo: photoFor(ORG) });
  const regFlags = openFlags(reg.id);
  record(
    "FLAG-ODO_REGRESSION-not-blocking",
    regFlags.ODO_REGRESSION?.severity === "high" && Number(regFlags.ODO_REGRESSION.details.previous_odometer_km) === 68316,
    JSON.stringify(regFlags.ODO_REGRESSION?.details)
  );
  E.pendingCoP = reg.id;

  // VRN
  const mm = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-11 * 60), slip_vrn: "CA 999 999", slip_vrn_status: "edited", odometer_km: "68500" }), photo: photoFor(ORG) });
  const mmF = openFlags(mm.id).VRN_MISMATCH;
  record(
    "FLAG-VRN_MISMATCH",
    mmF?.severity === "high" && mmF.details.slip_vrn === "CA 999 999" && mmF.details.vehicle_vrn_snapshot === "CA123456",
    JSON.stringify(mmF?.details)
  );
  E.vrnMismatch = mm.id;
  const norm = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-10 * 60), slip_vrn: "ca 123 456", odometer_km: "68600" }), photo: photoFor(ORG) });
  record("FLAG-VRN-normalised-match", !openFlags(norm.id).VRN_MISMATCH && row(norm.id).slip_vrn === "CA 123 456");
  const ns = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-9 * 60), slip_vrn: "CA123456", slip_vrn_status: "not_shown", odometer_km: "68700" }), photo: photoFor(ORG) });
  record("FLAG-VRN_NOT_SHOWN", openFlags(ns.id).VRN_NOT_SHOWN?.severity === "low" && row(ns.id).slip_vrn === null);

  // Duplicate authorisation_no: saves, medium informational DUP_AUTH with the agreed wording
  const a1 = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-8 * 60), authorisation_no: "gr11wp", odometer_km: "68800" }), photo: photoFor(ORG) });
  const a2 = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-7 * 60), authorisation_no: "GR11WP", odometer_km: "68900" }), photo: photoFor(ORG) });
  const dup = openFlags(a2.id).DUP_AUTH;
  record(
    "FLAG-DUP_AUTH-saves-medium-wording",
    row(a1.id).authorisation_no === "GR11WP" && row(a2.id).authorisation_no === "GR11WP" && dup?.severity === "medium" &&
      dup.message === "Possible duplicate authorisation reference; may be reusable depending on station/card system." &&
      dup.details.window_days === 1 && dup.details.matching_fillup_ids.includes(a1.id),
    JSON.stringify(dup)
  );
  const far = submit({ actor: U.drv2, vehicle: V2, f: fields({ ...sast(-3 * 24 * 60), authorisation_no: "GR11WP", slip_vrn: "CA999000", odometer_km: "500" }), photo: photoFor(ORG) });
  record("FLAG-DUP_AUTH-window-plus-minus-1-day", !openFlags(far.id).DUP_AUTH, "3 days apart -> no DUP_AUTH");
  E.v2old = far.id;

  // Admin back-capture
  const bc = submit({ actor: U.admin, vehicle: V3, f: fields({ ...sast(-5 * 60), fuel_type: "diesel50", slip_vrn: "CY1", odometer_km: "20000", driver_id: D2 }), photo: null });
  const bcRow = row(bc.id);
  record(
    "BACKCAPTURE-no-photo",
    bcRow.entry_method === "admin_manual" && bcRow.review_status === "pending_review" && bcRow.driver_id === D2 &&
      openFlags(bc.id).NO_PHOTO_ADMIN?.severity === "info",
    `${bcRow.entry_method}/${bcRow.review_status}`
  );
  record(
    "BACKCAPTURE-audit",
    auditCount(bc.id, "fuel_slip.admin_backcaptured") === 1 && auditMeta(bc.id, "fuel_slip.submitted")?.entry_method === "admin_manual"
  );
  E.backcapturePending = bc.id;
  const bcp = submit({ actor: U.admin, vehicle: V3, f: fields({ ...sast(-4 * 60), fuel_type: "diesel50", slip_vrn: "CY1", odometer_km: "20100" }), photo: photoFor(ORG) });
  record(
    "BACKCAPTURE-with-photo",
    row(bcp.id).entry_method === "admin_manual" && row(bcp.id).review_status === "pending_review" && !openFlags(bcp.id).NO_PHOTO_ADMIN
  );
  E.backcaptureSelf = bcp.id;
  const po = submit({ actor: U.po, vehicle: V3, f: fields({ ...sast(-3 * 60), fuel_type: "diesel500", slip_vrn: "CY1", odometer_km: "20200" }), photo: null });
  record("BACKCAPTURE-platform-owner", row(po.id).entry_method === "admin_manual" && auditMeta(po.id, "fuel_slip.submitted")?.actor_role === "platform_owner");
}

function testFlagCoverage() {
  // AMOUNT_MISMATCH high (> 5 %) and medium
  const hi = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-29 * 60), litres: "40", unit_price: "25", total_amount: "1100", slip_vrn: "CA444", odometer_km: "1400", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  const am = openFlags(hi.id).AMOUNT_MISMATCH;
  record(
    "FLAG-AMOUNT_MISMATCH-high-details",
    am?.severity === "high" &&
      ["litres", "unit_price", "calculated_total", "typed_total", "diff", "tol_abs", "tol_pct", "tol_applied"].every((k) => k in am.details) &&
      Number(am.details.calculated_total) === 1000 && Number(am.details.typed_total) === 1100 && Number(am.details.tol_applied) === 2.75,
    JSON.stringify(am?.details)
  );
  const med = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-28 * 60), litres: "40", unit_price: "25", total_amount: "1003", slip_vrn: "CA444", odometer_km: "1800", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  record("FLAG-AMOUNT_MISMATCH-medium", openFlags(med.id).AMOUNT_MISMATCH?.severity === "medium");

  // V2 (tank unknown): ODO_JUMP fallback 1500 km, CONSUMPTION_OUTLIER, TANK_UNKNOWN, DATE_BEFORE_PREVIOUS
  const f1 = submit({ actor: U.drv2, vehicle: V2, f: fields({ ...sast(-50 * 60), slip_vrn: "CA999000", odometer_km: "1000" }), photo: photoFor(ORG) });
  const f2 = submit({ actor: U.drv2, vehicle: V2, f: fields({ ...sast(-40 * 60), slip_vrn: "CA999000", odometer_km: "3000" }), photo: photoFor(ORG) });
  const f2f = openFlags(f2.id);
  record("FLAG-ODO_JUMP-fallback", f2f.ODO_JUMP?.severity === "medium" && Number(f2f.ODO_JUMP.details.threshold_km) === 1500, JSON.stringify(f2f.ODO_JUMP?.details));
  record("FLAG-CONSUMPTION_OUTLIER", f2f.CONSUMPTION_OUTLIER?.severity === "medium" && Number(f2f.CONSUMPTION_OUTLIER.details.consumption_min) === 4, JSON.stringify(f2f.CONSUMPTION_OUTLIER?.details));
  record("FLAG-TANK_UNKNOWN", f2f.TANK_UNKNOWN?.severity === "low");
  const dbp = submit({ actor: U.drv2, vehicle: V2, f: fields({ ...sast(-45 * 60), slip_vrn: "CA999000", odometer_km: "3500" }), photo: photoFor(ORG) });
  record("FLAG-DATE_BEFORE_PREVIOUS", openFlags(dbp.id).DATE_BEFORE_PREVIOUS?.severity === "low");
  E.v2f1 = f1.id;
  E.v2f2 = f2.id;
  E.v2dbp = dbp.id;

  // OVER_TANK (V4 tank 70, 5 % tolerance -> 73.5 L)
  const ot = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-27 * 60), litres: "80", unit_price: "25", total_amount: "2000", slip_vrn: "CA444", odometer_km: "2200", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  record("FLAG-OVER_TANK", openFlags(ot.id).OVER_TANK?.severity === "high" && Number(openFlags(ot.id).OVER_TANK.details.max_litres) === 73.5);

  // PRICE_RANGE
  const pr = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-26 * 60), litres: "40", unit_price: "12", total_amount: "480", slip_vrn: "CA444", odometer_km: "2600", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  record("FLAG-PRICE_RANGE", openFlags(pr.id).PRICE_RANGE?.severity === "medium");
  E.priceRange = pr.id;

  // TOO_SOON (2 h after the previous V4 fill)
  const ts = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-24 * 60), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", odometer_km: "2700", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  record("FLAG-TOO_SOON", openFlags(ts.id).TOO_SOON?.severity === "medium" && Number(openFlags(ts.id).TOO_SOON.details.min_hours_between_fills) === 6);

  // FUEL_TYPE_MISMATCH + VEHICLE_NOT_ASSIGNED (D2 on V3, diesel vehicle, petrol entered)
  const ft = submit({ actor: U.drv2, vehicle: V3, f: fields({ ...sast(-6 * 60), fuel_type: "ulp95", slip_vrn: "CY1", odometer_km: "19000" }), photo: photoFor(ORG) });
  const ftf = openFlags(ft.id);
  record("FLAG-FUEL_TYPE_MISMATCH", ftf.FUEL_TYPE_MISMATCH?.severity === "medium" && ftf.FUEL_TYPE_MISMATCH.details.vehicle_fuel_family === "diesel");
  record("FLAG-VEHICLE_NOT_ASSIGNED", ftf.VEHICLE_NOT_ASSIGNED?.severity === "medium");
  record("FLAG-VEHICLE_NOT_ASSIGNED-assigned-driver-clear", !openFlags(E.sample).VEHICLE_NOT_ASSIGNED);
  record("FLAG-VEHICLE_NOT_ASSIGNED-admin-entries-skip", !openFlags(E.backcapturePending).VEHICLE_NOT_ASSIGNED);
  E.v3pendingDriver = ft.id;

  // DATE_FUTURE / DATE_OLD
  const fut = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(180), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", odometer_km: "5000", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  record("FLAG-DATE_FUTURE", openFlags(fut.id).DATE_FUTURE?.severity === "high" && Number(openFlags(fut.id).DATE_FUTURE.details.future_tol_minutes) === 10);
  const old = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-10 * 24 * 60), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", odometer_km: "900", fuel_type: "ulp93" }), photo: photoFor(ORG) });
  record("FLAG-DATE_OLD", openFlags(old.id).DATE_OLD?.severity === "medium" && Number(openFlags(old.id).DATE_OLD.details.max_age_days) === 7);

  // STATION_VAT_FORMAT
  const vat = submit({ actor: U.admin, vehicle: V4, f: fields({ ...sast(-20 * 60), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", odometer_km: "2800", fuel_type: "ulp93", station_vat_no: "1234567890" }), photo: null });
  record("FLAG-STATION_VAT_FORMAT", openFlags(vat.id).STATION_VAT_FORMAT?.severity === "low");

  // DUP_SLIP (same VAT + slip no. + date)
  const ds = { ...sast(-18 * 60), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", fuel_type: "ulp93", slip_number: "64392" };
  submit({ actor: U.admin, vehicle: V4, f: fields({ ...ds, odometer_km: "2900" }), photo: null });
  const ds2 = submit({ actor: U.admin, vehicle: V4, f: fields({ ...ds, odometer_km: "2950" }), photo: null });
  record("FLAG-DUP_SLIP", openFlags(ds2.id).DUP_SLIP?.severity === "high");

  // DUP_PHOTO
  const sha = randomSha();
  submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-16 * 60), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", odometer_km: "3000", fuel_type: "ulp93" }), photo: photoFor(ORG, randomUUID(), sha) });
  const dp = submit({ actor: U.drv1, vehicle: V4, f: fields({ ...sast(-8 * 60), litres: "20", unit_price: "25", total_amount: "500", slip_vrn: "CA444", odometer_km: "3100", fuel_type: "ulp93" }), photo: photoFor(ORG, randomUUID(), sha) });
  record("FLAG-DUP_PHOTO", openFlags(dp.id).DUP_PHOTO?.severity === "high" && openFlags(dp.id).DUP_PHOTO.details.sha256 === sha);
  E.dupPhoto = dp.id;

  // High flag -> admin inbox notification
  record(
    "FLAG-high-admin-inbox",
    num(`select count(*) from public.admin_inbox_notifications where subject_id = ${q(dp.id)} and recipient_user_id = ${q(U.admin)} and notification_type = 'fuel_slip_high_flag'`) === 1
  );
}

function testUpdateReview() {
  // calculated_total recomputed on edit; typed total untouched
  const id = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-6 * 60), odometer_km: "69000" }), photo: photoFor(ORG) }).id;
  update(U.drv1, id, { litres: "40" });
  let r = row(id);
  record(
    "UPDATE-calculated_total-recomputed",
    Number(r.calculated_total) === 1042 && Number(r.total_amount) === 951.1 && openFlags(id).AMOUNT_MISMATCH,
    `calc=${r.calculated_total} typed=${r.total_amount}`
  );
  update(U.drv1, id, { total_amount: "1042.00" });
  r = row(id);
  record(
    "UPDATE-total-only-when-edited-and-cleared_by_edit",
    Number(r.total_amount) === 1042 && !openFlags(id).AMOUNT_MISMATCH &&
      num(`select count(*) from public.fuel_entry_flags where fillup_id = ${q(id)} and code = 'AMOUNT_MISMATCH' and status = 'cleared_by_edit'`) === 1
  );
  const upd = auditMeta(id, "fuel_slip.updated");
  record("AUDIT-updated-before-after", upd?.changes?.total_amount?.before === 951.1 && upd.changes.total_amount.after === 1042, JSON.stringify(upd?.changes));

  let err = updateErr(U.drv1, id, { notes: "x" }, "2020-01-01T00:00:00Z");
  record("UPDATE-optimistic-lock", hasErr(err, "stale_update"));
  err = updateErr(U.drv2, id, { notes: "x" });
  record("UPDATE-other-driver-denied", hasErr(err, "not_authorised"));
  err = updateErr(U.drv1, id, { entry_method: "admin_manual" });
  record("UPDATE-entry_method-forbidden", hasErr(err, "entry_method_forbidden"));
  err = updateErr(U.mgr, id, { notes: "x" });
  record("UPDATE-manager-denied", hasErr(err, "not_authorised"));

  // Admin edit clears PRICE_RANGE
  update(U.admin, E.priceRange, { unit_price: "25", total_amount: "1000" });
  record(
    "UPDATE-admin-clears-PRICE_RANGE",
    !openFlags(E.priceRange).PRICE_RANGE &&
      auditMeta(E.priceRange, "fuel_slip.flags_evaluated")?.cleared_by_edit?.includes("PRICE_RANGE")
  );

  // Approve (no high flags -> no note needed), then driver edit denied, reopen audited
  const ap = review(U.admin, E.sample, "approve");
  record("REVIEW-approve", ap.review_status === "approved" && auditCount(E.sample, "fuel_slip.approved") === 1);
  err = updateErr(U.drv1, E.sample, { notes: "late edit" });
  record("REVIEW-driver-edit-after-decision-denied", hasErr(err, "not_editable"));
  err = updateErr(U.admin, E.sample, { notes: "admin edit" });
  record("REVIEW-admin-edit-approved-denied", hasErr(err, "not_editable"));
  err = svcErr(`select public.void_fuel_slip(${q(U.admin)}, ${q(ORG)}, ${q(E.sample)}, 'x', null)`);
  record("VOID-approved-denied", hasErr(err, "not_voidable"));
  err = reviewErr(U.admin, E.sample, "reopen");
  record("REVIEW-reopen-needs-note", hasErr(err, "note_required"));
  const ro = review(U.admin, E.sample, "reopen", { note: "wrong vehicle picked" });
  record("REVIEW-reopen-audited", ro.review_status === "pending_review" && auditCount(E.sample, "fuel_slip.reopened") === 1);
  review(U.admin, E.sample, "approve");

  // High flag open -> approve needs note
  err = reviewErr(U.admin, E.vrnMismatch, "approve");
  record("REVIEW-approve-high-flag-needs-note", hasErr(err, "note_required"));

  // Flag resolution
  const flagId = su(`select id from public.fuel_entry_flags where fillup_id = ${q(E.vrnMismatch)} and code = 'VRN_MISMATCH' and status = 'open'`);
  err = reviewErr(U.admin, E.vrnMismatch, "resolve_flags", { res: [{ flag_id: flagId, status: "dismissed" }] });
  record("REVIEW-flag-resolution-needs-note", hasErr(err, "resolution_note_required"));
  review(U.admin, E.vrnMismatch, "resolve_flags", { res: [{ flag_id: flagId, status: "dismissed", note: "Slip VRN misprinted" }] });
  record(
    "REVIEW-flag-dismissed-audited",
    su(`select status from public.fuel_entry_flags where id = ${q(flagId)}`) === "dismissed" && auditCount(E.vrnMismatch, "fuel_slip.flag_resolved") === 1
  );
  update(U.admin, E.vrnMismatch, { notes: "checked" });
  record("REVIEW-dismissed-flag-not-reraised", !openFlags(E.vrnMismatch).VRN_MISMATCH);

  // Query -> driver edit -> EDITED_AFTER_QUERY + resubmitted
  const qid = submit({ actor: U.drv1, vehicle: V1, f: fields({ ...sast(-5 * 60), odometer_km: "69100" }), photo: photoFor(ORG) }).id;
  err = reviewErr(U.admin, qid, "query");
  record("REVIEW-query-needs-message", hasErr(err, "note_required"));
  review(U.admin, qid, "query", { note: "Please check litres" });
  record(
    "REVIEW-query-notifies-driver",
    row(qid).review_status === "queried" &&
      num(`select count(*) from public.driver_inbox_notifications where driver_id = ${q(D1)} and notification_type = 'fuel_slip_queried'`) >= 1
  );
  update(U.drv1, qid, { litres: "36.00" });
  const eaq = openFlags(qid).EDITED_AFTER_QUERY;
  record(
    "FLAG-EDITED_AFTER_QUERY",
    row(qid).review_status === "pending_review" && eaq?.severity === "info" &&
      Number(eaq.details.changes.litres.before) === 36.51 && Number(eaq.details.changes.litres.after) === 36 &&
      auditCount(qid, "fuel_slip.resubmitted") === 1,
    JSON.stringify(eaq?.details)
  );

  // Reject: reason + note; driver notified; driver edit denied afterwards
  err = reviewErr(U.admin, qid, "reject", { note: "x" });
  record("REVIEW-reject-needs-reason", hasErr(err, "reason_code_required"));
  review(U.admin, qid, "reject", { reason: "illegible", note: "Photo unreadable" });
  record(
    "REVIEW-reject",
    row(qid).review_status === "rejected" && row(qid).review_reason_code === "illegible" &&
      num(`select count(*) from public.driver_inbox_notifications where driver_id = ${q(D1)} and notification_type = 'fuel_slip_rejected'`) >= 1
  );
  err = updateErr(U.drv1, qid, { notes: "x" });
  record("REVIEW-driver-edit-after-reject-denied", hasErr(err, "not_editable"));

  // Roles that may not review
  for (const [who, sub] of [["driver", U.drv1], ["company_manager", U.cm], ["manager", U.mgr], ["employee", U.emp]]) {
    err = reviewErr(sub, E.pendingCoP, "approve", { note: "x" });
    record(`REVIEW-denied-${who}`, hasErr(err, "not_authorised"));
  }

  // Self-approval of own back-capture needs a note and is audited as self_approved
  err = reviewErr(U.admin, E.backcaptureSelf, "approve");
  record("REVIEW-self-approve-needs-note", hasErr(err, "note_required"));
  review(U.admin, E.backcaptureSelf, "approve", { note: "Own back-capture, slip on file" });
  record("REVIEW-self-approved-audit", auditMeta(E.backcaptureSelf, "fuel_slip.approved")?.self_approved === true);

  // Void -> review_status 'voided', soft-deleted, kept
  const vid = submit({ actor: U.drv2, vehicle: V2, f: fields({ ...sast(-2 * 60), slip_vrn: "CA999000", odometer_km: "4000" }), photo: photoFor(ORG) }).id;
  err = svcErr(`select public.void_fuel_slip(${q(U.admin)}, ${q(ORG)}, ${q(vid)}, '', null)`);
  record("VOID-needs-reason", hasErr(err, "reason_required"));
  svc(`select public.void_fuel_slip(${q(U.admin)}, ${q(ORG)}, ${q(vid)}, 'Driver duplicate', null)::text`);
  r = row(vid);
  record("VOID-voided", r.review_status === "voided" && r.deleted_at !== null && auditCount(vid, "fuel_slip.voided") === 1);
  E.voided = vid;

  // Approve V2 f1 (CO_Q) for invoice + company-manager scope tests
  review(U.admin, E.v2f1, "approve");

  // Replace photo (driver, pending): old kept not-current, audited with hashes
  const oldPath = su(`select storage_path from public.fuel_slip_photos where fillup_id = ${q(E.pendingCoP)} and is_current`);
  const np = photoFor(ORG, E.pendingCoP);
  svc(`select public.replace_fuel_slip_photo(${q(U.drv1)}, ${q(ORG)}, ${q(E.pendingCoP)}, ${j(np)}, null)::text`);
  const photos = JSON.parse(su(`select jsonb_agg(jsonb_build_object('path', storage_path, 'cur', is_current, 'sup', superseded_at is not null))::text from public.fuel_slip_photos where fillup_id = ${q(E.pendingCoP)}`));
  const rep = auditMeta(E.pendingCoP, "fuel_slip.photo_replaced");
  record(
    "PHOTO-replace",
    photos.length === 2 && photos.some((p) => p.path === oldPath && !p.cur && p.sup) && photos.some((p) => p.path === np.storage_path && p.cur) &&
      rep?.old_path_sha256 === sha256Hex(oldPath) && rep?.new_path_sha256 === sha256Hex(np.storage_path)
  );
  err = svcErr(`select public.replace_fuel_slip_photo(${q(U.drv1)}, ${q(ORG)}, ${q(E.sample)}, ${j(photoFor(ORG, E.sample))}, null)`);
  record("PHOTO-replace-after-decision-denied", hasErr(err, "not_editable"));
}

function testVisibility() {
  const count = (sub, table, where = "true") => {
    const r = asUser(sub, `select count(*) from public.${table} where ${where}`);
    return r.ok ? Number(r.out) : `ERR ${r.err}`;
  };
  const inOrg = `organisation_id = '${ORG}'`;
  const allAdmin = num(`select count(*) from public.fuel_fillups where ${inOrg} and (deleted_at is null or review_status = 'voided')`);
  const live = num(`select count(*) from public.fuel_fillups where ${inOrg} and deleted_at is null`);
  const own = num(`select count(*) from public.fuel_fillups where ${inOrg} and deleted_at is null and driver_id = '${D1}'`);
  const cmExpected = num(`select count(*) from public.fuel_fillups where ${inOrg} and deleted_at is null and review_status = 'approved' and company_id = '${CO_P}'`);
  const pendingCoP = num(`select count(*) from public.fuel_fillups where ${inOrg} and deleted_at is null and review_status <> 'approved' and company_id = '${CO_P}'`);
  const approvedCoQ = num(`select count(*) from public.fuel_fillups where ${inOrg} and deleted_at is null and review_status = 'approved' and company_id = '${CO_Q}'`);
  const photosTotal = num(`select count(*) from public.fuel_slip_photos where ${inOrg}`);
  const photosOwn = num(`select count(*) from public.fuel_slip_photos p join public.fuel_fillups f on f.id = p.fillup_id where p.${inOrg} and f.deleted_at is null and f.driver_id = '${D1}'`);
  const flagsTotal = num(`select count(*) from public.fuel_entry_flags where ${inOrg}`);

  record("RLS-fixture-sanity", live > own && own > 0 && cmExpected > 0 && pendingCoP > 0 && approvedCoQ > 0 && allAdmin > live, `live=${live} own=${own} cm=${cmExpected}`);

  record("RLS-platform_owner-all", count(U.po, "fuel_fillups", inOrg) === allAdmin && count(U.po, "fuel_entry_flags", inOrg) === flagsTotal);
  record("RLS-org_admin-all-incl-voided", count(U.admin, "fuel_fillups", inOrg) === allAdmin && count(U.admin, "fuel_fillups", `id = '${E.voided}'`) === 1);
  record("RLS-org_admin-photos-flags", count(U.admin, "fuel_slip_photos", inOrg) === photosTotal && count(U.admin, "fuel_entry_flags", inOrg) === flagsTotal);
  record("RLS-org_admin-other-org-none", count(U.admin2, "fuel_fillups", inOrg) === 0 && count(U.admin2, "fuel_entry_flags", inOrg) === 0);

  for (const [who, sub] of [["manager", U.mgr], ["dispatcher", U.dsp], ["supervisor", U.sup]]) {
    record(
      `RLS-${who}-rows-only`,
      count(sub, "fuel_fillups", inOrg) === live && count(sub, "fuel_slip_photos") === 0 && count(sub, "fuel_entry_flags") === 0 && count(sub, "fuel_settings") === 0,
      `rows=${count(sub, "fuel_fillups", inOrg)}/${live}`
    );
  }
  record(
    "RLS-driver-own-only",
    count(U.drv1, "fuel_fillups", inOrg) === own && count(U.drv1, "fuel_fillups", `driver_id <> '${D1}' or driver_id is null`) === 0,
    `rows=${count(U.drv1, "fuel_fillups", inOrg)}/${own}`
  );
  record("RLS-driver-own-photos-only", count(U.drv1, "fuel_slip_photos") === photosOwn && photosOwn > 0);
  record("RLS-driver-no-flags-settings", count(U.drv1, "fuel_entry_flags") === 0 && count(U.drv1, "fuel_settings") === 0);
  record(
    "RLS-company_manager-approved-scoped",
    count(U.cm, "fuel_fillups", inOrg) === cmExpected &&
      count(U.cm, "fuel_fillups", `review_status <> 'approved'`) === 0 &&
      count(U.cm, "fuel_fillups", `company_id <> '${CO_P}'`) === 0,
    `rows=${count(U.cm, "fuel_fillups", inOrg)}/${cmExpected}`
  );
  record("RLS-company_manager-no-photos-flags", count(U.cm, "fuel_slip_photos") === 0 && count(U.cm, "fuel_entry_flags") === 0 && count(U.cm, "fuel_settings") === 0);
  record(
    "RLS-employee-none",
    ["fuel_fillups", "fuel_slip_photos", "fuel_entry_flags", "fuel_settings"].every((t) => count(U.emp, t) === 0)
  );
}

function testPhotoViewAndPurge() {
  const photoId = su(`select id from public.fuel_slip_photos where fillup_id = ${q(E.sample)} and is_current`);
  const view = (actor, opts) => runSql(`select public.audit_fuel_slip_photo_view(${q(actor)}, ${q(ORG)}, ${q(photoId)})::text`, { role: "service_role", ...opts });

  const own = view(U.drv1);
  const ownJson = own.ok ? JSON.parse(own.out) : {};
  const meta = auditMeta(photoId, "fuel_slip.photo_viewed");
  record(
    "PHOTO-view-owning-driver",
    own.ok && ownJson.storage_path === E.samplePhoto.storage_path && meta?.viewer_role === "driver" &&
      meta.path_sha256 === sha256Hex(E.samplePhoto.storage_path) && !JSON.stringify(meta).includes("/fillups/")
  );
  record("PHOTO-view-audit-entity", su(`select entity_type from public.audit_logs where entity_id = ${q(photoId)} and action = 'fuel_slip.photo_viewed' limit 1`) === "fuel_slip_photo");
  record("PHOTO-view-other-driver-denied", hasErr(view(U.drv2).err, "not_authorised"));
  record("PHOTO-view-company_manager-denied", hasErr(view(U.cm).err, "not_authorised"));
  record("PHOTO-view-employee-denied", hasErr(view(U.emp).err, "not_authorised"));
  record("PHOTO-view-manager-denied", hasErr(view(U.mgr).err, "not_authorised"));
  record("PHOTO-view-org_admin", view(U.admin).ok && view(U.po).ok);
  const before = num(`select count(*) from public.audit_logs where entity_id = ${q(photoId)} and action = 'fuel_slip.photo_viewed'`);
  const forced = view(U.admin, { settings: { "app.force_audit_failure": "true" } });
  record(
    "PHOTO-view-audit-failure-no-path",
    !forced.ok && hasErr(forced.err, "audit_write_failed") && forced.out === "" &&
      num(`select count(*) from public.audit_logs where entity_id = ${q(photoId)} and action = 'fuel_slip.photo_viewed'`) === before
  );

  // Privacy purge through the queue; legal hold blocks it
  const target = E.dupPhoto;
  const path = su(`select storage_path from public.fuel_slip_photos where fillup_id = ${q(target)} and is_current`);
  let err = svcErr(`select public.privacy_purge_fuel_slip_photo(${q(U.drv1)}, ${q(ORG)}, ${q(target)}, 'x')`);
  record("PURGE-driver-denied", hasErr(err, "not_authorised"));
  su(`update public.fuel_fillups set legal_hold = true where id = ${q(target)}`);
  err = svcErr(`select public.privacy_purge_fuel_slip_photo(${q(U.admin)}, ${q(ORG)}, ${q(target)}, 'Driver request')`);
  record("PURGE-legal-hold-blocks", hasErr(err, "legal_hold"));
  su(`update public.fuel_fillups set legal_hold = false where id = ${q(target)}`);
  svc(`select public.privacy_purge_fuel_slip_photo(${q(U.admin)}, ${q(ORG)}, ${q(target)}, 'Driver request')::text`);
  const pmeta = auditMeta(target, "fuel_slip.photo_privacy_purged");
  record(
    "PURGE-queued-row-kept",
    num(`select count(*) from public.compliance_storage_purge_queue where bucket_id = 'fuel-slips' and storage_path = ${q(path)} and reason = 'fuel_privacy_purge'`) === 1 &&
      row(target).photo_purged_at !== null && row(target).deleted_at === null &&
      pmeta?.path_sha256?.[0] === sha256Hex(path) && !JSON.stringify(pmeta).includes("/fillups/")
  );
  const pid = su(`select id from public.fuel_slip_photos where fillup_id = ${q(target)} and is_current`);
  err = svcErr(`select public.audit_fuel_slip_photo_view(${q(U.admin)}, ${q(ORG)}, ${q(pid)})`);
  record("PURGE-view-after-purge-denied", hasErr(err, "photo_purged"));
}

function testExportAndSettings() {
  const exp = (actor, filters) => runSql(`select public.audit_fuel_report_export(${q(actor)}, ${q(ORG)}, 'vehicle_month', ${j(filters)}, 12)::text`, { role: "service_role" });
  const cm = exp(U.cm, { include_pending: false });
  record(
    "EXPORT-company_manager-approved",
    cm.ok && su(`select action from public.audit_logs where id = ${q(cm.out)}`) === "fuel_report.exported"
  );
  record("EXPORT-company_manager-pending-denied", hasErr(exp(U.cm, { include_pending: true }).err, "not_authorised"));
  record("EXPORT-admin", exp(U.admin, { include_pending: true }).ok);
  record("EXPORT-employee-denied", hasErr(exp(U.emp, {}).err, "not_authorised"));
  record("EXPORT-manager-denied", hasErr(exp(U.mgr, {}).err, "not_authorised"));

  const save = (actor, s, org = ORG) => runSql(`select public.save_fuel_settings(${q(actor)}, ${q(org)}, ${j(s)})::text`, { role: "service_role" });
  record("SETTINGS-driver-denied", hasErr(save(U.drv1, { default_order_no: "X" }).err, "not_authorised"));
  record("SETTINGS-unknown-key", hasErr(save(U.admin, { foo: 1 }).err, "unknown_setting:foo"));
  record("SETTINGS-invalid-action", !save(U.admin, { post_retention_action: "shred" }).ok);
  const ok = save(U.admin, { default_order_no: "testord" });
  const saved = ok.ok ? JSON.parse(ok.out) : {};
  const audit = JSON.parse(su(`select metadata::text from public.audit_logs where organisation_id = ${q(ORG)} and action = 'fuel_settings.updated' order by created_at desc limit 1`));
  record(
    "SETTINGS-save-audited",
    saved.default_order_no === "TESTORD" && saved.retention_months === null && saved.scan_enabled === false &&
      audit.changes.default_order_no.after === "TESTORD" && Object.keys(audit.changes).length === 1
  );
}

function testInvoiceGuard() {
  const today = su(`select (now() at time zone 'Africa/Johannesburg')::date::text`);
  const start = su(`select ((now() at time zone 'Africa/Johannesburg')::date - 5)::text`);
  const end = su(`select ((now() at time zone 'Africa/Johannesburg')::date + 2)::text`);

  const inv = asUser(U.admin, `select row_to_json(i)::text from public.generate_period_invoice(${q(ORG)}, ${q(CO_W)}, ${q(start)}::date, ${q(end)}::date) i`);
  const invId = inv.ok ? JSON.parse(inv.out).id : null;
  const lines = invId ? su(`select coalesce(string_agg(fuel_fillup_id::text, ','), '') from public.invoice_lines where invoice_id = ${q(invId)} and line_type = 'fuel'`).split(",").filter(Boolean) : [];
  const approvedW = su(`select coalesce(string_agg(id::text, ','), '') from public.fuel_fillups where company_id = ${q(CO_W)} and review_status = 'approved' and deleted_at is null`).split(",").filter(Boolean);
  record(
    "INVOICE-period-approved-only",
    inv.ok && lines.length === approvedW.length && approvedW.length === 1 && lines[0] === E.backcaptureSelf &&
      !lines.includes(E.backcapturePending) && !lines.includes(E.v3pendingDriver),
    inv.ok ? `lines=${lines.length} approved=${approvedW.length} (${today})` : inv.err
  );

  const wk = asUser(U.admin, `select row_to_json(i)::text from public.generate_weekly_fuel_invoice(${q(ORG)}, ${q(CO_Q)}, ${q(start)}::date) i`);
  const wkId = wk.ok ? JSON.parse(wk.out).id : null;
  const wLines = wkId ? su(`select coalesce(string_agg(fuel_fillup_id::text, ','), '') from public.invoice_lines where invoice_id = ${q(wkId)} and line_type = 'fuel'`).split(",").filter(Boolean) : [];
  record(
    "INVOICE-weekly-approved-only",
    wk.ok && wLines.length === 1 && wLines[0] === E.v2f1 && !wLines.includes(E.v2f2) && !wLines.includes(E.voided),
    wk.ok ? `lines=${wLines.join(",")}` : wk.err
  );
}

function testRetention() {
  const f = (o) => fields({ ...o, slip_vrn: "CA777", fuel_type: "ulp95" });
  const r1 = submit({ actor: U.drvR, org: ORGR, vehicle: VR, f: f({ ...sast(-30 * 60), odometer_km: "1000", authorisation_no: "AUTHR1", slip_number: "S1", notes: "note" }), photo: photoFor(ORGR) }).id;
  const r2 = submit({ actor: U.drvR, org: ORGR, vehicle: VR, f: f({ ...sast(-20 * 60), odometer_km: "1400" }), photo: photoFor(ORGR) }).id;
  const r3 = submit({ actor: U.adminR, org: ORGR, vehicle: VR, f: f({ ...sast(-10 * 60), odometer_km: "1800" }), photo: null }).id;
  su(`update public.fuel_fillups set legal_hold = true where id = ${q(r2)}`);
  const orphanOld = `${ORGR}/fillups/2026/01/${randomUUID()}/${randomUUID()}.jpg`;
  const orphanNew = `${ORGR}/fillups/2026/01/${randomUUID()}/${randomUUID()}.jpg`;
  const r1Path = su(`select storage_path from public.fuel_slip_photos where fillup_id = ${q(r1)}`);
  su(`insert into storage.objects (bucket_id, name, created_at) values
        ('fuel-slips', ${q(orphanOld)}, now() - interval '2 days'),
        ('fuel-slips', ${q(orphanNew)}, now() - interval '1 hour'),
        ('fuel-slips', ${q(r1Path)}, now() - interval '2 days')`);

  const retention = (p) => svcJson(`select public.run_fuel_slip_retention(${p})::text`);
  const queued = (reason, path) => num(`select count(*) from public.compliance_storage_purge_queue where bucket_id = 'fuel-slips' and reason = ${q(reason)} and storage_path = ${q(path)}`);

  retention(`now()`);
  record(
    "RETENTION-orphan-sweep",
    queued("fuel_orphan", orphanOld) === 1 && queued("fuel_orphan", orphanNew) === 0 && queued("fuel_orphan", r1Path) === 0 &&
      num(`select count(*) from public.compliance_storage_purge_queue where storage_path = ${q(orphanOld)} and organisation_id = ${q(ORGR)}`) === 1
  );

  retention(`now() + interval '20 years'`);
  record(
    "RETENTION-null-policy-no-purge",
    num(`select count(*) from public.fuel_fillups where organisation_id = ${q(ORGR)} and (retain_until is not null or retention_processed_at is not null)`) === 0 &&
      num(`select count(*) from public.fuel_slip_photos where organisation_id = ${q(ORGR)} and purged_at is not null`) === 0 &&
      num(`select count(*) from public.compliance_storage_purge_queue where organisation_id = ${q(ORGR)} and reason = 'fuel_retention'`) === 0
  );

  const saved = svcJson(`select public.save_fuel_settings(${q(U.adminR)}, ${q(ORGR)}, ${j({ retention_months: 1, post_retention_action: "anonymise" })})::text`);
  const backfill = JSON.parse(su(`select metadata::text from public.audit_logs where organisation_id = ${q(ORGR)} and action = 'fuel_settings.updated' order by created_at desc limit 1`));
  record(
    "RETENTION-policy-backfills-retain_until",
    saved.retention_months === 1 && backfill.retain_until_backfilled === 3 &&
      num(`select count(*) from public.fuel_fillups where organisation_id = ${q(ORGR)} and retain_until is not null`) === 3
  );

  const res = retention(`now() + interval '3 months'`);
  const a = row(r1);
  record(
    "RETENTION-expired-anonymised",
    a.retention_processed_at !== null && a.driver_id === null && a.created_by === null && a.slip_vrn === null &&
      a.authorisation_no === null && a.slip_number === null && a.notes === null && Number(a.litres) === 36.51 && a.photo_purged_at !== null,
    JSON.stringify(res)
  );
  record("RETENTION-photo-queued", queued("fuel_retention", r1Path) === 1);
  record(
    "RETENTION-legal-hold-skipped",
    row(r2).retention_processed_at === null && row(r2).driver_id === D_R &&
      num(`select count(*) from public.fuel_slip_photos where fillup_id = ${q(r2)} and purged_at is null`) === 1 && res.skipped_legal_hold >= 1
  );
  record("RETENTION-no-photo-admin-row-processed", row(r3).retention_processed_at !== null);
  record(
    "RETENTION-audited",
    num(`select count(*) from public.audit_logs where organisation_id = ${q(ORGR)} and action = 'fuel_slip.retention_processed'`) === 1
  );

  const r4 = submit({ actor: U.drvR, org: ORGR, vehicle: VR, f: f({ ...sast(-5 * 60), odometer_km: "2000" }), photo: photoFor(ORGR) }).id;
  const r4Path = su(`select storage_path from public.fuel_slip_photos where fillup_id = ${q(r4)}`);
  svc(`select public.save_fuel_settings(${q(U.adminR)}, ${q(ORGR)}, ${j({ post_retention_action: "delete" })})::text`);
  retention(`now() + interval '3 months'`);
  record("RETENTION-delete-action", num(`select count(*) from public.fuel_fillups where id = ${q(r4)}`) === 0 && queued("fuel_retention", r4Path) === 1);
}

function testVehicleProfile() {
  svc(`select public.save_vehicle_capture(${q(U.admin)}, ${q(ORG)}, ${q(V2)}, ${j({ name: "Van Q", registration_number: "CA 999 000", vehicle_type: "van", company_id: CO_Q, tank_capacity_litres: "75.5", default_fuel_type: "diesel50" })})::text`);
  const meta = auditMeta(V2, "vehicle.fuel_profile_updated");
  record(
    "VEHICLE-fuel-profile-audited",
    su(`select tank_capacity_litres || '|' || default_fuel_type from public.vehicles where id = ${q(V2)}`) === "75.5|diesel50" &&
      meta?.tank_capacity_litres?.after === 75.5 && meta?.default_fuel_type?.after === "diesel50"
  );
  svc(`select public.save_vehicle_capture(${q(U.admin)}, ${q(ORG)}, ${q(V2)}, ${j({ name: "Van Q", registration_number: "CA 999 000", vehicle_type: "van", company_id: CO_Q })})::text`);
  record(
    "VEHICLE-fuel-profile-kept-when-absent",
    su(`select tank_capacity_litres || '|' || default_fuel_type from public.vehicles where id = ${q(V2)}`) === "75.5|diesel50"
  );
}

function testGlobal() {
  const codes = su(`select string_agg(distinct code, ',' order by code) from public.fuel_entry_flags where organisation_id = ${q(ORG)}`).split(",");
  const all = [
    "AMOUNT_MISMATCH", "CONSUMPTION_OUTLIER", "DATE_BEFORE_PREVIOUS", "DATE_FUTURE", "DATE_OLD", "DUP_AUTH", "DUP_PHOTO",
    "DUP_SLIP", "EDITED_AFTER_QUERY", "FUEL_TYPE_MISMATCH", "NO_PHOTO_ADMIN", "ODO_JUMP", "ODO_REGRESSION", "OVER_TANK",
    "PRICE_RANGE", "STATION_VAT_FORMAT", "TANK_UNKNOWN", "TOO_SOON", "VEHICLE_NOT_ASSIGNED", "VRN_MISMATCH", "VRN_NOT_SHOWN",
  ];
  const missing = all.filter((c) => !codes.includes(c));
  record("FLAGS-all-21-codes-raised", missing.length === 0, missing.length ? `missing ${missing}` : "all §4.2 codes exercised");
  record(
    "FLAGS-details-non-empty",
    num(`select count(*) from public.fuel_entry_flags where organisation_id = ${q(ORG)}`) > 0 &&
      num(`select count(*) from public.fuel_entry_flags where jsonb_typeof(details) <> 'object' or details = '{}'::jsonb`) === 0
  );
  record(
    "FLAGS-counts-consistent",
    num(`select count(*) from public.fuel_fillups f where f.organisation_id = ${q(ORG)} and f.open_flag_count <>
          (select count(*) from public.fuel_entry_flags fl where fl.fillup_id = f.id and fl.status = 'open')`) === 0
  );
  record(
    "AUDIT-no-raw-paths-or-urls",
    num(`select count(*) from public.audit_logs where (action like 'fuel%' or action like 'vehicle.fuel%')
           and (metadata::text like '%/fillups/%' or metadata::text ilike '%signedurl%' or metadata::text ilike '%token=%')`) === 0
  );
  const actions = su(`select string_agg(distinct action, ',') from public.audit_logs where organisation_id in (${q(ORG)}, ${q(ORGR)}) and (action like 'fuel%' or action like 'vehicle.fuel%')`).split(",");
  const spec = [
    "fuel_slip.submitted", "fuel_slip.admin_backcaptured", "fuel_slip.updated", "fuel_slip.photo_uploaded", "fuel_slip.photo_replaced",
    "fuel_slip.photo_viewed", "fuel_slip.flags_evaluated", "fuel_slip.flag_resolved", "fuel_slip.queried", "fuel_slip.resubmitted",
    "fuel_slip.approved", "fuel_slip.rejected", "fuel_slip.reopened", "fuel_slip.voided", "fuel_slip.photo_privacy_purged",
    "fuel_slip.retention_processed", "fuel_report.exported", "vehicle.fuel_profile_updated", "fuel_settings.updated",
  ];
  const missingActions = spec.filter((a) => !actions.includes(a));
  record("AUDIT-all-19-section-5.4-actions", missingActions.length === 0, missingActions.length ? `missing ${missingActions}` : "all §5.4 actions written");
}

// ---------------------------------------------------------------------------

const ping = runSql("select 1");
if (!ping.ok) {
  console.error(`Cannot reach local Postgres at ${PG.host}:${PG.port}: ${ping.err}`);
  process.exit(2);
}

setupFixtures();
for (const t of [
  testSchema, testSettingsDefaults, testPrivileges, testStorage, testSubmit, testFlagCoverage, testUpdateReview,
  testVisibility, testPhotoViewAndPurge, testExportAndSettings, testInvoiceGuard, testRetention, testVehicleProfile, testGlobal,
]) {
  try {
    t();
  } catch (e) {
    record(`${t.name}-crashed`, false, String(e.message ?? e).split("\n").slice(0, 3).join(" | "));
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\nfuel-slips: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exitCode = 1;
}
