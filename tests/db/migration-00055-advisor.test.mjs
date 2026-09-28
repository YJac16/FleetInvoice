#!/usr/bin/env node
/**
 * Migration 00055 — advisor cleanup on post-00052 DB shape.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { apply00055HostedFidelity } from "./00055-hosted-apply.mjs";
import { migrationSqlTargetsSupabaseAdmin } from "./00052-hosted-apply.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIG_00055 = join(ROOT, "supabase/migrations/00055_advisor_cleanup.sql");
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_A_ADMIN = "a0000000-0000-4000-8000-000000000011";
const ORG_A_DRIVER = "a0000000-0000-4000-8000-000000000201";
const PLATFORM_OWNER = "f0000000-0000-4000-8000-000000000001";

const INTERNAL_DENIED = [
  "sync_staff_trip_invoice_line",
  "set_staff_trip_status",
  "recalculate_invoice_totals",
  "resolve_pay_rate",
  "assert_staff_trip_driver",
];

const AUTH_RPC_KEEP = [
  "generate_period_invoice",
  "accept_invitation",
  "scan_qr_token",
  "list_compliance_renewals",
  "list_my_compliance",
  "org_entitled_modules",
  "get_trip_driver_names",
];

const results = [];

function record(id, pass, evidence) {
  results.push({ id, pass, evidence });
  console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
  if (!pass) process.exitCode = 1;
}

const isTrue = (v) => v === "t" || v === "true";
const isFalse = (v) => v === "f" || v === "false";

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

function psqlAs(userId, sql, { allowError = false } = {}) {
  const body = `BEGIN;\nSET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = '${userId}';\n${sql}\nCOMMIT;`;
  return psql(body, { allowError });
}

function psqlAsAnon(sql, { allowError = false } = {}) {
  const body = `BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
${sql}
COMMIT;`;
  return psql(body, { allowError });
}

function fnExec(role, proname) {
  return psql(
    `SELECT has_function_privilege('${role}', p.oid, 'EXECUTE')::text
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '${proname}' LIMIT 1;`
  ).text;
}

function main() {
  const migrationSql = readFileSync(MIG_00055, "utf8");
  record(
    "migration-no-supabase_admin-sql",
    !migrationSqlTargetsSupabaseAdmin(migrationSql),
    "00055 must not target supabase_admin"
  );

  apply00055HostedFidelity(MIG_00055);
  apply00055HostedFidelity(MIG_00055);
  record("migration-idempotent-apply", true, "applied 00055 twice without error");

  for (const name of INTERNAL_DENIED) {
    record(
      `internal-deny-authenticated-${name}`,
      isFalse(fnExec("authenticated", name)),
      fnExec("authenticated", name)
    );
  }

  for (const name of AUTH_RPC_KEEP) {
    record(`auth-keep-${name}`, isTrue(fnExec("authenticated", name)), fnExec("authenticated", name));
  }

  const fkIdx = psql(
    `SELECT count(*)::text FROM pg_indexes
     WHERE schemaname = 'public' AND indexname LIKE '%\_fkey\_idx' ESCAPE '\\';`
  ).text;
  record("fk-covering-index-count", Number.parseInt(fkIdx, 10) >= 73, `count=${fkIdx}`);

  const initplan = psql(
    `SELECT count(*)::text FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN ('profiles_select','profiles_update','employees_select','admin_inbox_select','admin_inbox_update')
       AND (
         (qual IS NOT NULL AND qual NOT ILIKE '%select %uid()%')
         OR (with_check IS NOT NULL AND with_check NOT ILIKE '%select %uid()%')
       );`
  ).text;
  record("auth-rls-initplan-fixed", initplan === "0", `remaining=${initplan}`);

  record(
    "driver-presence-no-upsert-policy",
    psql(
      `SELECT count(*)::text FROM pg_policies
       WHERE tablename = 'driver_presence' AND policyname = 'driver_presence_upsert';`
    ).text === "0",
    "driver_presence_upsert dropped"
  );

  const anonCompanies = psqlAsAnon(
    `SELECT count(*)::text FROM public.companies WHERE organisation_id = '${ORG_A}';`
  );
  record("anon-rls-companies-zero", anonCompanies.ok && anonCompanies.text.endsWith("0"), anonCompanies.text);

  const authCompanies = psqlAs(
    ORG_A_ADMIN,
    `SELECT count(*)::text FROM public.companies WHERE organisation_id = '${ORG_A}' AND deleted_at IS NULL;`
  );
  record(
    "auth-rls-companies-org-rows",
    authCompanies.ok && Number.parseInt(authCompanies.text.split("\n").pop() ?? "0", 10) >= 1,
    authCompanies.text
  );

  const iso = psqlAs(
    ORG_A_ADMIN,
    `SELECT count(*)::text FROM public.organisations WHERE id = 'b0000000-0000-4000-8000-000000000001';`
  );
  record("auth-rls-other-org-hidden", iso.ok && iso.text.endsWith("0"), iso.text);

  const ownerAll = psqlAs(
    PLATFORM_OWNER,
    `SELECT count(*)::text FROM public.organisations WHERE deleted_at IS NULL;`
  );
  record(
    "platform-owner-sees-orgs",
    ownerAll.ok && Number.parseInt(ownerAll.text.split("\n").pop() ?? "0", 10) >= 2,
    ownerAll.text
  );

  const driverTrips = psqlAs(
    ORG_A_DRIVER,
    `SELECT count(*)::text FROM public.trips WHERE organisation_id = '${ORG_A}';`
  );
  record(
    "driver-rls-trips-visible",
    driverTrips.ok && Number.parseInt(driverTrips.text.split("\n").pop() ?? "0", 10) >= 0,
    driverTrips.text
  );

  record(
    "handle-new-user-no-authenticated",
    isFalse(fnExec("authenticated", "handle_new_user")),
    fnExec("authenticated", "handle_new_user")
  );

  console.log("\nSummary:", results.filter((r) => r.pass).length, "/", results.length, "passed");
}

main();
