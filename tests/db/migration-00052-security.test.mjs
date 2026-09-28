#!/usr/bin/env node
/**
 * Migration 00052 — applies migration on pre-00052 DB and asserts posture.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIG_00052 = join(
  ROOT,
  "supabase/migrations/00052_security_hardening_anon_rpc_quota_rls.sql"
);
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

const ANON_OK = ["get_invitation_by_token", "lookup_white_label"];

const ANON_DENIED = [
  "create_invitation",
  "generate_period_invoice",
  "ingest_gps_points",
  "scan_qr_token",
  "has_org_role",
  "is_org_member",
  "current_driver_id",
  "enqueue_compliance_renewals_digests",
];

const AUTH_REQUIRED = [
  "scan_qr_token",
  "has_org_role",
  "current_driver_id",
  "generate_period_invoice",
  "compliance_storage_path_allowed",
];

const SEARCH_PATH_FUNCTIONS = [
  "set_updated_at",
  "haversine_m",
  "staff_company_display_name",
  "calc_total_km",
  "service_week_bounds_sast",
  "compliance_immutable_driver_document",
  "compliance_immutable_vehicle_document",
  "storage_org_id",
  "storage_path_segment",
  "normalize_invoice_period_end",
  "invoice_period_lower_bound_sast",
  "invoice_period_upper_bound_sast",
];

const results = [];

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

function psql(sql, { allowError = false } = {}) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    { encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  return { ok: res.status === 0, text: `${res.stderr ?? ""}${res.stdout ?? ""}`.trim() };
}

function fnExec(role, proname) {
  const sql = `SELECT has_function_privilege('${role}', p.oid, 'EXECUTE')::text
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '${proname}' LIMIT 1;`;
  return psql(sql).text;
}

function apply00052() {
  console.log("Applying 00052...");
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", MIG_00052],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "00052 apply failed");
  }
}

function main() {
  const preAnonCreate = fnExec("anon", "create_invitation");
  const preAnonPrivileged =
    preAnonCreate === "t" || preAnonCreate === "true";
  record(
    "pre-00052-anon-had-privileged-rpc",
    preAnonPrivileged,
    `before 00052 anon create_invitation EXECUTE=${preAnonCreate}`
  );

  apply00052();

  const isTrue = (v) => v === "t" || v === "true";
  const isFalse = (v) => v === "f" || v === "false";

  for (const name of ANON_OK) {
    record(`anon-ok-${name}`, isTrue(fnExec("anon", name)), fnExec("anon", name));
  }

  for (const name of ANON_DENIED) {
    record(`anon-deny-${name}`, isFalse(fnExec("anon", name)), fnExec("anon", name));
  }

  for (const name of AUTH_REQUIRED) {
    record(
      `auth-keep-${name}`,
      isTrue(fnExec("authenticated", name)),
      fnExec("authenticated", name)
    );
  }

  record(
    "service-only-digest",
    isFalse(fnExec("authenticated", "enqueue_compliance_renewals_digests")) &&
      isTrue(fnExec("service_role", "enqueue_compliance_renewals_digests")),
    `auth=${fnExec("authenticated", "enqueue_compliance_renewals_digests")} svc=${fnExec("service_role", "enqueue_compliance_renewals_digests")}`
  );

  const rlsOn = psql(
    `SELECT relrowsecurity::text FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'compliance_scan_quota';`
  ).text;
  record("quota-rls-enabled", isTrue(rlsOn), rlsOn);

  for (const name of SEARCH_PATH_FUNCTIONS) {
    const exists = psql(
      `SELECT count(*)::text FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${name}';`
    ).text;
    if (exists === "0") {
      record(`search-path-${name}`, true, "skipped (not in this DB shape)");
      continue;
    }
    const cfg = psql(
      `SELECT coalesce(string_agg(array_to_string(p.proconfig, ','), '|'), '')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${name}';`
    ).text;
    const ok = /search_path=pg_catalog, public/.test(cfg.replace(/"/g, ""));
    record(`search-path-${name}`, ok, cfg || "(empty)");
  }

  const anonDefinerExtra = psql(
    `SELECT count(*)::text FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.proname <> ALL('{get_invitation_by_token,lookup_white_label}'::text[]);`
  ).text;
  record("anon-definer-surface-clean", anonDefinerExtra === "0", anonDefinerExtra);

  console.log("\nSummary:", results.filter((r) => r.pass).length, "/", results.length, "passed");
}

main();
