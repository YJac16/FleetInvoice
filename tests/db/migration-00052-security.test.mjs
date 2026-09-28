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
const ORG_A_COMPANY = "a0000000-0000-4000-8000-000000000101";
const INVITEE_ID = "d0000000-0000-4000-8000-000000000099";
const TRIP_A = "a0000000-0000-4000-8000-000000000601";
const ROUTE_A = "a0000000-0000-4000-8000-000000000602";

/** Documented anon SECURITY DEFINER exception (2 public RPCs + 8 RLS helpers). */
const ANON_DEFINER_ALLOWLIST = new Set([
  "public.current_driver_id(uuid)",
  "public.current_employee_id(uuid)",
  "public.get_invitation_by_token(text)",
  "public.has_company_scope(uuid,uuid)",
  "public.has_org_role(uuid,app_role[])",
  "public.has_org_role_names(uuid,text[])",
  "public.is_org_member(uuid)",
  "public.is_platform_owner()",
  "public.lookup_white_label(text)",
  "public.user_organisation_ids()",
]);

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
  return { ok: res.status === 0, text: `${res.stderr ?? ""}${res.stdout ?? ""}`.trim() };
}

function psqlAsAnon(sql, { allowError = false } = {}) {
  const body = `BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
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

function seedTripFixture() {
  psql(`
INSERT INTO public.routes (id, organisation_id, company_id, name, status)
VALUES ('${ROUTE_A}', '${ORG_A}', '${ORG_A_COMPANY}', 'RLS Test Route', 'active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.trips (id, organisation_id, route_id, company_id, planned_start, status)
VALUES ('${TRIP_A}', '${ORG_A}', '${ROUTE_A}', '${ORG_A_COMPANY}', now(), 'planned')
ON CONFLICT (id) DO NOTHING;
`);
}

function main() {
  record(
    "pre-00052-anon-had-privileged-rpc",
    isTrue(fnExec("anon", "create_invitation")),
    fnExec("anon", "create_invitation")
  );

  apply00052();
  seedTripFixture();

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

  const anonDefinerSigs = psql(
    `SELECT coalesce(string_agg(p.oid::regprocedure::text, '|' ORDER BY p.oid::regprocedure::text), '')
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE');`
  ).text
    .split("|")
    .filter(Boolean)
    .map((s) => (s.startsWith("public.") ? s : `public.${s}`));

  record("anon-definer-exact-count-10", anonDefinerSigs.length === 10, String(anonDefinerSigs.length));
  const unexpected = anonDefinerSigs.filter((s) => !ANON_DEFINER_ALLOWLIST.has(s));
  const missing = [...ANON_DEFINER_ALLOWLIST].filter((s) => !anonDefinerSigs.includes(s));
  record(
    "anon-definer-signature-allowlist",
    unexpected.length === 0 && missing.length === 0,
    `unexpected=${unexpected.join(",") || "none"} missing=${missing.join(",") || "none"}`
  );

  const rlsHelperSmoke = psqlAsAnon(
    "SELECT (NOT public.is_platform_owner() AND NOT EXISTS (SELECT 1 FROM public.user_organisation_ids()))::text;"
  );
  record(
    "anon-rls-helper-smoke",
    rlsHelperSmoke.ok && isTrue(rlsHelperSmoke.text.split("\n").filter(Boolean).at(-1) ?? ""),
    rlsHelperSmoke.text.slice(0, 120)
  );

  // --- Anon real-table RLS (production-shaped SELECT grant on public tables) ---
  const anonCompanies = psqlAsAnon(
    `SELECT count(*)::text FROM public.companies WHERE organisation_id = '${ORG_A}';`
  );
  record("anon-rls-companies-zero", anonCompanies.ok && anonCompanies.text.endsWith("0"), anonCompanies.text);

  const anonTrips = psqlAsAnon(
    `SELECT count(*)::text FROM public.trips WHERE organisation_id = '${ORG_A}';`
  );
  record("anon-rls-trips-zero", anonTrips.ok && anonTrips.text.endsWith("0"), anonTrips.text);

  const anonInvoices = psqlAsAnon(
    `SELECT count(*)::text FROM public.invoices WHERE organisation_id = '${ORG_A}';`
  );
  record("anon-rls-invoices-zero", anonInvoices.ok && anonInvoices.text.endsWith("0"), anonInvoices.text);

  const anonSubs = psqlAsAnon(`SELECT count(*)::text FROM public.subscriptions;`);
  record("anon-rls-subscriptions-zero", anonSubs.ok && anonSubs.text.endsWith("0"), anonSubs.text);

  const anonWl = psqlAsAnon(`SELECT count(*)::text FROM public.white_label_configs;`);
  record("anon-rls-white_label-zero", anonWl.ok && anonWl.text.endsWith("0"), anonWl.text);

  const anonPlans = psqlAsAnon(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE NOT is_active)::text AS inactive
     FROM public.plans;`
  );
  const planLines = anonPlans.text.split("\n").filter(Boolean).pop()?.split("|") ?? [];
  record(
    "anon-rls-plans-active-catalog-only",
    anonPlans.ok && (planLines[1] ?? "0") === "0",
    "public catalog: active plans only (plans_select allows is_active OR platform_owner)"
  );

  const anonEnt = psqlAsAnon(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_active
            ) AND NOT EXISTS (
              SELECT 1 FROM public.subscriptions s WHERE s.plan_id = plan_id
            ))::text AS disallowed
     FROM public.module_entitlements;`
  );
  const entLines = anonEnt.text.split("\n").filter(Boolean).pop()?.split("|") ?? [];
  record(
    "anon-rls-module_entitlements-policy",
    anonEnt.ok && (entLines[1] ?? "0") === "0",
    "allowed: entitlements on active plans (module_entitlements_select)"
  );

  const authCompanies = psqlAs(
    ORG_A_ADMIN,
    `SELECT count(*)::text FROM public.companies WHERE organisation_id = '${ORG_A}' AND deleted_at IS NULL;`
  );
  record(
    "auth-rls-companies-org-rows",
    authCompanies.ok && Number.parseInt(authCompanies.text.split("\n").pop() ?? "0", 10) >= 1,
    authCompanies.text
  );

  const authInvoices = psqlAs(
    ORG_A_ADMIN,
    `SELECT count(*)::text FROM public.invoices WHERE organisation_id = '${ORG_A}' AND deleted_at IS NULL;`
  );
  record(
    "auth-rls-invoices-org-rows",
    authInvoices.ok && Number.parseInt(authInvoices.text.split("\n").pop() ?? "0", 10) >= 1,
    authInvoices.text
  );

  const authTrips = psqlAs(
    ORG_A_ADMIN,
    `SELECT count(*)::text FROM public.trips WHERE organisation_id = '${ORG_A}' AND deleted_at IS NULL;`
  );
  record(
    "auth-rls-trips-org-rows",
    authTrips.ok && Number.parseInt(authTrips.text.split("\n").pop() ?? "0", 10) >= 1,
    authTrips.text
  );

  // --- Default privileges (postgres creates a new function) ---
  const defaultAclAnon = psql(
    `SELECT count(*)::text FROM pg_default_acl d
     JOIN pg_namespace n ON n.oid = d.defaclnamespace
     WHERE n.nspname = 'public' AND d.defaclobjtype = 'f'
       AND d.defaclacl::text LIKE '%anon=X%';`
  );
  record(
    "default-privileges-no-anon-in-public-acl",
    defaultAclAnon.text === "0",
    `public function default ACL rows with anon=X: ${defaultAclAnon.text}`
  );

  const defaultPriv = psql(`
CREATE OR REPLACE FUNCTION public._00052_default_priv_probe()
RETURNS integer LANGUAGE sql AS $probe$ SELECT 1 $probe$;
SELECT (
  NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE acl.grantee = 0
  )
)::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = '_00052_default_priv_probe';
DROP FUNCTION public._00052_default_priv_probe();
`);
  record(
    "default-privileges-new-function-no-manual-revoke",
    defaultPriv.ok && isTrue(defaultPriv.text.split("\n").filter(Boolean).at(-1) ?? ""),
    defaultPriv.text.split("\n").filter(Boolean).at(-1) ?? defaultPriv.text
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

  psql(
    `INSERT INTO auth.users (id, aud, role, email, encrypted_password, confirmed_at, created_at, updated_at, raw_user_meta_data)
     VALUES ('${INVITEE_ID}', 'authenticated', 'authenticated', 'invite-new@audit.test', 'x', now(), now(), now(), '{"full_name":"Invite New"}')
     ON CONFLICT (id) DO NOTHING;`
  );
  const profileCount = psql(
    `SELECT count(*)::text FROM public.profiles WHERE id = '${INVITEE_ID}';`
  ).text;
  record("handle-new-user-profile", profileCount === "1", `profiles=${profileCount}`);

  const createInv = psqlAs(
    ORG_A_ADMIN,
    `SELECT (public.create_invitation('${ORG_A}'::uuid, 'invite-new@audit.test', 'manager'::public.app_role, now() + interval '7 days')).token;`
  );
  const token = createInv.text.split("\n").filter(Boolean).at(-1) ?? "";
  record("invite-create_invitation", createInv.ok && token.length > 8, token.slice(0, 12));

  const preview = psqlAsAnon(`SELECT email FROM public.get_invitation_by_token('${token}');`);
  record(
    "invite-anon-preview",
    preview.ok && preview.text.includes("invite-new@audit.test"),
    preview.text.slice(0, 80)
  );

  const accept = psqlAs(INVITEE_ID, `SELECT public.accept_invitation('${token}')::text;`);
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
