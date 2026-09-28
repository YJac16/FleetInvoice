#!/usr/bin/env node
/**
 * Migration 00055 — advisor cleanup on post-00052 DB shape.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FKEY_INDEXES_00055,
  INTERNAL_SECURITY_DEFINER_RPCS,
} from "../../scripts/db/00055-advisor-constants.mjs";
import { apply00055HostedFidelity } from "./00055-hosted-apply.mjs";
import { migrationSqlTargetsSupabaseAdmin } from "./00052-hosted-apply.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIG_00055 = join(ROOT, "supabase/migrations/00055_advisor_cleanup.sql");
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";

const ORG_A = "a0000000-0000-4000-8000-000000000001";
const ORG_B = "b0000000-0000-4000-8000-000000000001";
const ORG_A_ADMIN = "a0000000-0000-4000-8000-000000000011";
const ORG_B_ADMIN = "b0000000-0000-4000-8000-000000000011";
const DRIVER_A_USER = "a0000000-0000-4000-8000-000000000012";
const DRIVER_A_ID = "a0000000-0000-4000-8000-000000000201";
const DRIVER_A_PEER_ID = "a0000000-0000-4000-8000-000000000202";
const PLATFORM_OWNER = "f0000000-0000-4000-8000-000000000001";

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
  ).text.split("\n").pop();
}

function seedDriverPresenceFixture() {
  psql(`
INSERT INTO public.drivers (id, organisation_id, full_name, email, status)
VALUES ('${DRIVER_A_PEER_ID}', '${ORG_A}', 'Org A Driver Peer', 'driver.peer@audit.test', 'active')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.driver_presence WHERE driver_id IN ('${DRIVER_A_ID}', '${DRIVER_A_PEER_ID}');
INSERT INTO public.driver_presence (driver_id, organisation_id, last_seen_at)
VALUES
  ('${DRIVER_A_ID}', '${ORG_A}', timezone('utc', now()) - interval '2 minutes'),
  ('${DRIVER_A_PEER_ID}', '${ORG_A}', timezone('utc', now()) - interval '1 minute');
`);
}

function presenceSelectCountAs(userId) {
  const res = psqlAs(
    userId,
    `SELECT count(*)::text FROM public.driver_presence WHERE organisation_id = '${ORG_A}';`
  );
  return res.text.split("\n").pop() ?? "";
}

function presenceSelectCountAnon() {
  const res = psqlAsAnon(
    `SELECT count(*)::text FROM public.driver_presence WHERE organisation_id = '${ORG_A}';`
  );
  return res.text.split("\n").pop() ?? "";
}

function main() {
  const migrationSql = readFileSync(MIG_00055, "utf8");
  record(
    "migration-no-supabase_admin-sql",
    !migrationSqlTargetsSupabaseAdmin(migrationSql),
    "00055 must not target supabase_admin"
  );

  seedDriverPresenceFixture();
  const selectBefore = {
    anon: presenceSelectCountAnon(),
    driverA: presenceSelectCountAs(DRIVER_A_USER),
    orgAdminA: presenceSelectCountAs(ORG_A_ADMIN),
    orgAdminB: presenceSelectCountAs(ORG_B_ADMIN),
  };

  apply00055HostedFidelity(MIG_00055);
  apply00055HostedFidelity(MIG_00055);
  record("migration-idempotent-apply", true, "applied 00055 twice without error");

  const selectAfter = {
    anon: presenceSelectCountAnon(),
    driverA: presenceSelectCountAs(DRIVER_A_USER),
    orgAdminA: presenceSelectCountAs(ORG_A_ADMIN),
    orgAdminB: presenceSelectCountAs(ORG_B_ADMIN),
  };

  record(
    "driver-presence-select-parity-anon",
    selectBefore.anon === selectAfter.anon,
    `before=${selectBefore.anon} after=${selectAfter.anon}`
  );
  record(
    "driver-presence-select-parity-driver",
    selectBefore.driverA === selectAfter.driverA,
    `before=${selectBefore.driverA} after=${selectAfter.driverA}`
  );
  record(
    "driver-presence-select-parity-org-admin",
    selectBefore.orgAdminA === selectAfter.orgAdminA,
    `before=${selectBefore.orgAdminA} after=${selectAfter.orgAdminA}`
  );
  record(
    "driver-presence-select-parity-other-org",
    selectBefore.orgAdminB === selectAfter.orgAdminB,
    `before=${selectBefore.orgAdminB} after=${selectAfter.orgAdminB}`
  );

  for (const name of INTERNAL_SECURITY_DEFINER_RPCS) {
    record(
      `internal-deny-authenticated-${name}`,
      isFalse(fnExec("authenticated", name)),
      `authenticated=${fnExec("authenticated", name)}`
    );
    record(
      `internal-allow-service_role-${name}`,
      isTrue(fnExec("service_role", name)),
      `service_role=${fnExec("service_role", name)}`
    );
  }

  for (const name of AUTH_RPC_KEEP) {
    record(`auth-keep-${name}`, isTrue(fnExec("authenticated", name)), fnExec("authenticated", name));
  }

  const idxList = psql(
    `SELECT coalesce(string_agg(indexname, ',' ORDER BY indexname), '')
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = ANY (ARRAY[${FKEY_INDEXES_00055.map((n) => `'${n}'`).join(",")}]::text[]);`
  ).text.split("\n").pop();
  const idxSet = new Set((idxList ?? "").split(",").filter(Boolean));
  const missing = FKEY_INDEXES_00055.filter((n) => !idxSet.has(n));
  const extra = [...idxSet].filter((n) => !FKEY_INDEXES_00055.includes(n));
  record(
    "fk-covering-index-exact-list",
    missing.length === 0 && extra.length === 0 && idxSet.size === FKEY_INDEXES_00055.length,
    `size=${idxSet.size} missing=${missing.join(",") || "none"} extra=${extra.join(",") || "none"}`
  );

  const initplan = psql(
    `SELECT count(*)::text FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN ('profiles_select','profiles_update','employees_select','admin_inbox_select','admin_inbox_update')
       AND (
         (qual IS NOT NULL AND qual NOT ILIKE '%select %uid()%')
         OR (with_check IS NOT NULL AND with_check NOT ILIKE '%select %uid()%')
       );`
  ).text.split("\n").pop();
  record("auth-rls-initplan-fixed", initplan === "0", `remaining=${initplan}`);

  record(
    "driver-presence-no-upsert-policy",
    psql(
      `SELECT count(*)::text FROM pg_policies
       WHERE tablename = 'driver_presence' AND policyname = 'driver_presence_upsert';`
    ).text.split("\n").pop() === "0",
    "driver_presence_upsert dropped"
  );

  psql(`DELETE FROM public.driver_presence WHERE driver_id = '${DRIVER_A_ID}';`);

  const insOwn = psqlAs(
    DRIVER_A_USER,
    `INSERT INTO public.driver_presence (driver_id, organisation_id, last_seen_at)
     VALUES ('${DRIVER_A_ID}', '${ORG_A}', timezone('utc', now()));`
  );
  record("driver-presence-insert-own", insOwn.ok, insOwn.text.slice(0, 80));

  psqlAs(
    DRIVER_A_USER,
    `UPDATE public.driver_presence SET last_seen_at = '2099-06-01 00:00:00+00'
     WHERE driver_id = '${DRIVER_A_ID}';`
  );
  const updOwn = psqlAs(
    DRIVER_A_USER,
    `SELECT (last_seen_at = '2099-06-01 00:00:00+00')::text
     FROM public.driver_presence WHERE driver_id = '${DRIVER_A_ID}';`
  );
  record(
    "driver-presence-update-own",
    updOwn.ok && isTrue(updOwn.text.split("\n").pop()),
    updOwn.text.split("\n").pop()
  );

  const selOwn = psqlAs(
    DRIVER_A_USER,
    `SELECT count(*)::text FROM public.driver_presence WHERE driver_id = '${DRIVER_A_ID}';`
  );
  record(
    "driver-presence-select-own",
    selOwn.ok && selOwn.text.split("\n").pop() === "1",
    selOwn.text.split("\n").pop()
  );

  const insPeer = psqlAs(
    DRIVER_A_USER,
    `INSERT INTO public.driver_presence (driver_id, organisation_id, last_seen_at)
     VALUES ('${DRIVER_A_PEER_ID}', '${ORG_A}', timezone('utc', now()));`,
    { allowError: true }
  );
  record(
    "driver-presence-insert-peer-denied",
    !insPeer.ok || insPeer.text.toLowerCase().includes("policy"),
    insPeer.text.slice(0, 120)
  );

  psqlAs(
    DRIVER_A_USER,
    `UPDATE public.driver_presence SET last_seen_at = '2099-06-02 00:00:00+00'
     WHERE driver_id = '${DRIVER_A_PEER_ID}';`
  );
  const peerUnchanged = psql(
    `SELECT (last_seen_at <> '2099-06-02 00:00:00+00')::text
     FROM public.driver_presence WHERE driver_id = '${DRIVER_A_PEER_ID}';`
  ).text.split("\n").pop();
  record(
    "driver-presence-update-peer-denied",
    isTrue(peerUnchanged),
    `peer row unchanged=${peerUnchanged}`
  );

  psqlAs(DRIVER_A_USER, `DELETE FROM public.driver_presence WHERE driver_id = '${DRIVER_A_PEER_ID}';`);
  const peerStill = psql(
    `SELECT count(*)::text FROM public.driver_presence WHERE driver_id = '${DRIVER_A_PEER_ID}';`
  ).text.split("\n").pop();
  record(
    "driver-presence-delete-peer-denied",
    peerStill === "1",
    `peer rows (postgres)=${peerStill}`
  );

  psqlAs(DRIVER_A_USER, `DELETE FROM public.driver_presence WHERE driver_id = '${DRIVER_A_ID}';`);
  const ownGone = psqlAs(
    DRIVER_A_USER,
    `SELECT count(*)::text FROM public.driver_presence WHERE driver_id = '${DRIVER_A_ID}';`
  ).text.split("\n").pop();
  record("driver-presence-delete-own", ownGone === "0", `own rows=${ownGone}`);

  record(
    "handle-new-user-deny-anon",
    isFalse(fnExec("anon", "handle_new_user")),
    fnExec("anon", "handle_new_user")
  );
  record(
    "handle-new-user-deny-authenticated",
    isFalse(fnExec("authenticated", "handle_new_user")),
    fnExec("authenticated", "handle_new_user")
  );
  record(
    "handle-new-user-deny-service_role",
    isFalse(fnExec("service_role", "handle_new_user")),
    fnExec("service_role", "handle_new_user")
  );
  record(
    "handle-new-user-allow-postgres",
    isTrue(
      psql(
        `SELECT has_function_privilege('postgres', p.oid, 'EXECUTE')::text
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';`
      ).text.split("\n").pop()
    ),
    "postgres execute"
  );
  record(
    "handle-new-user-allow-supabase_auth_admin",
    isTrue(
      psql(
        `SELECT has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')::text
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';`
      ).text.split("\n").pop()
    ),
    "supabase_auth_admin execute"
  );

  const anonCompanies = psqlAsAnon(
    `SELECT count(*)::text FROM public.companies WHERE organisation_id = '${ORG_A}';`
  );
  record("anon-rls-companies-zero", anonCompanies.ok && anonCompanies.text.endsWith("0"), anonCompanies.text);

  const iso = psqlAs(
    ORG_A_ADMIN,
    `SELECT count(*)::text FROM public.organisations WHERE id = '${ORG_B}';`
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

  console.log("\nSummary:", results.filter((r) => r.pass).length, "/", results.length, "passed");
}

main();
