#!/usr/bin/env node
/**
 * Assert SECURITY DEFINER functions referenced in RLS policies are executable
 * by authenticated (and anon where pre-login RPCs apply). Run after 00060 apply.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { INTERNAL_SECURITY_DEFINER_RPCS } from "../../scripts/db/00055-advisor-constants.mjs";

const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

const RLS_EXCLUDE = [
  "driver_default_vehicle_id",
  "ensure_trip_assignment_vehicle",
  "guard_company_manager_member_scope",
  "handle_new_user",
];

const ANON_INVITE_RPCS = [
  "check_invitation_email",
  "get_invitation_by_token",
  "lookup_white_label",
];

const isTrue = (v) => v === "t" || v === "true";
const isFalse = (v) => v === "f" || v === "false";

function psql(sql) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "psql failed");
  }
  return `${res.stderr ?? ""}${res.stdout ?? ""}`.trim();
}

function main() {
  let exitCode = 0;
  const record = (id, pass, evidence) => {
    console.log(pass ? `PASS ${id}` : `FAIL ${id}`, evidence);
    if (!pass) exitCode = 1;
  };

  const missingAuth = psql(`
WITH policy_text AS (
  SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
  FROM pg_policies
  WHERE schemaname IN ('public', 'storage')
),
fn_names AS (
  SELECT DISTINCT (m)[1] AS proname
  FROM policy_text pt,
    LATERAL regexp_matches(pt.expr, '(?:public\\.)?([a-z_][a-z0-9_]*)\s*\\(', 'gi') AS m
)
SELECT coalesce(string_agg(p.oid::regprocedure::text, '|' ORDER BY p.oid::regprocedure::text), '')
FROM fn_names f
JOIN pg_proc p ON p.proname = f.proname
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.prosecdef
  AND NOT (f.proname = ANY (ARRAY[${RLS_EXCLUDE.map((n) => `'${n}'`).join(",")}]::text[]))
  AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
`);

  record(
    "rls-policy-functions-authenticated-execute",
    missingAuth === "",
    missingAuth ? `missing=${missingAuth}` : "all RLS-referenced DEFINER functions granted"
  );

  for (const name of ["is_company_manager", "company_user_can_see", "compliance_storage_path_allowed"]) {
    const ok = psql(
      `SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${name}' LIMIT 1;`
    );
    record(`rls-helper-auth-${name}`, isTrue(ok.split("\n").pop() ?? ""), ok);
  }

  for (const name of ANON_INVITE_RPCS) {
    const authOk = psql(
      `SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${name}' LIMIT 1;`
    ).split("\n").pop() ?? "";
    const anonOk = psql(
      `SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${name}' LIMIT 1;`
    ).split("\n").pop() ?? "";
    record(`invite-rpc-auth-${name}`, isTrue(authOk), `auth=${authOk}`);
    record(`invite-rpc-anon-${name}`, isTrue(anonOk), `anon=${anonOk}`);
  }

  for (const name of INTERNAL_SECURITY_DEFINER_RPCS) {
    const auth = psql(
      `SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = '${name}' LIMIT 1;`
    ).split("\n").pop() ?? "";
    record(`internal-still-deny-auth-${name}`, isFalse(auth), `authenticated=${auth}`);
  }

  process.exitCode = exitCode;
}

main();
