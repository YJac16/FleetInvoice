#!/usr/bin/env node
/**
 * Migration 00052 — post-00051 DB, apply 00052, assert security + invite/signup.
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

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_A_ADMIN = "a0000000-0000-4000-8000-000000000011";
const INVITEE_ID = "d0000000-0000-4000-8000-000000000099";

const ANON_RPC_OK = ["get_invitation_by_token", "lookup_white_label"];
const ANON_RLS_HELPERS = [
  "is_platform_owner",
  "has_org_role",
  "user_organisation_ids",
];
const ANON_RPC_DENIED = [
  "create_invitation",
  "generate_period_invoice",
  "ingest_gps_points",
  "scan_qr_token",
  "accept_invitation",
  "assign_trip",
];

const AUTH_REQUIRED = [
  "scan_qr_token",
  "has_org_role",
  "current_driver_id",
  "generate_period_invoice",
  "accept_invitation",
  "create_invitation",
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
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", body],
    { encoding: "utf8" }
  );
  if (res.status !== 0 && !allowError) {
    throw new Error(res.stderr || res.stdout || "psqlAs failed");
  }
  return {
    ok: res.status === 0,
    text: `${res.stderr ?? ""}${res.stdout ?? ""}`.trim(),
  };
}

function psqlAsAnon(sql, { allowError = false } = {}) {
  const body = `BEGIN;\nSET LOCAL ROLE anon;\n${sql}\nCOMMIT;`;
  return psql(body, { allowError });
}

function fnExec(role, proname) {
  return psql(
    `SELECT has_function_privilege('${role}', p.oid, 'EXECUTE')::text
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '${proname}' LIMIT 1;`
  ).text;
}

function apply00052() {
  console.log("Applying 00052 on post-00051 database...");
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
  record(
    "pre-00052-anon-had-privileged-rpc",
    isTrue(fnExec("anon", "create_invitation")),
    fnExec("anon", "create_invitation")
  );

  apply00052();

  for (const name of ANON_RPC_OK) {
    record(`anon-rpc-ok-${name}`, isTrue(fnExec("anon", name)), fnExec("anon", name));
  }
  for (const name of ANON_RLS_HELPERS) {
    record(`anon-rls-helper-${name}`, isTrue(fnExec("anon", name)), fnExec("anon", name));
  }
  for (const name of ANON_RPC_DENIED) {
    record(`anon-rpc-deny-${name}`, isFalse(fnExec("anon", name)), fnExec("anon", name));
  }
  for (const name of AUTH_REQUIRED) {
    record(`auth-keep-${name}`, isTrue(fnExec("authenticated", name)), fnExec("authenticated", name));
  }

  record(
    "service-only-digest",
    isFalse(fnExec("authenticated", "enqueue_compliance_renewals_digests")) &&
      isTrue(fnExec("service_role", "enqueue_compliance_renewals_digests")),
    `auth=${fnExec("authenticated", "enqueue_compliance_renewals_digests")} svc=${fnExec("service_role", "enqueue_compliance_renewals_digests")}`
  );

  const rlsHelperSmoke = psqlAsAnon(
    "SELECT (NOT public.is_platform_owner() AND NOT EXISTS (SELECT 1 FROM public.user_organisation_ids()))::text;"
  );
  record(
    "anon-rls-helper-smoke",
    rlsHelperSmoke.ok && isTrue(rlsHelperSmoke.text.split("\n").filter(Boolean).at(-1) ?? ""),
    rlsHelperSmoke.text.slice(0, 120)
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
    record(
      `search-path-${name}`,
      /search_path=pg_catalog, public/.test(cfg.replace(/"/g, "")),
      cfg || "(empty)"
    );
  }

  const anonDefinerExtra = psql(
    `SELECT count(*)::text FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.proname <> ALL(
         '{get_invitation_by_token,lookup_white_label,is_platform_owner,is_org_member,has_org_role,has_org_role_names,has_company_scope,user_organisation_ids,current_driver_id,current_employee_id}'::text[]
       );`
  ).text;
  record("anon-definer-rpc-surface-clean", anonDefinerExtra === "0", anonDefinerExtra);

  // handle_new_user trigger path (not via PostgREST)
  psql(
    `INSERT INTO auth.users (id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_user_meta_data)
     VALUES ('${INVITEE_ID}', 'authenticated', 'authenticated', 'invite-new@audit.test', 'x', now(), now(), now(), '{"full_name":"Invite New"}')
     ON CONFLICT (id) DO NOTHING;`
  );
  const profileCount = psql(
    `SELECT count(*)::text FROM public.profiles WHERE id = '${INVITEE_ID}';`
  ).text;
  record("handle-new-user-profile", profileCount === "1", `profiles=${profileCount}`);

  // Full invite flow
  const createInv = psqlAs(
    ORG_A_ADMIN,
    `SELECT (public.create_invitation('${ORG_A}'::uuid, 'invite-new@audit.test', 'manager'::public.app_role, now() + interval '7 days')).token;`
  );
  const token = createInv.text.split("\n").filter(Boolean).at(-1) ?? "";
  record("invite-create_invitation", createInv.ok && token.length > 8, token.slice(0, 12));

  const preview = psqlAsAnon(
    `SELECT email FROM public.get_invitation_by_token('${token}');`
  );
  record(
    "invite-anon-preview",
    preview.ok && preview.text.includes("invite-new@audit.test"),
    preview.text.slice(0, 80)
  );

  const accept = psqlAs(
    INVITEE_ID,
    `SELECT public.accept_invitation('${token}')::text;`
  );
  const membership = psql(
    `SELECT count(*)::text FROM public.organisation_members
     WHERE organisation_id = '${ORG_A}' AND user_id = '${INVITEE_ID}' AND status = 'active';`
  ).text;
  record(
    "invite-accept-authenticated",
    accept.ok && membership === "1",
    `accept_ok=${accept.ok} membership=${membership}`
  );

  console.log("\nSummary:", results.filter((r) => r.pass).length, "/", results.length, "passed");
}

main();
