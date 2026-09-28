#!/usr/bin/env node
/**
 * Generate SQL to restore 00055-affected grants, policies, and indexes from snapshot JSON.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FKEY_INDEXES_00055 } from "./00055-advisor-constants.mjs";

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath) {
  console.error("Usage: node 00055_rollback_from_snapshot.mjs <snapshot.json> [rollback.sql]");
  process.exit(1);
}

const snap = JSON.parse(readFileSync(inPath, "utf8"));
const lines = ["-- Generated from 00055 snapshot", "BEGIN;"];

function fnIdent(regprocedure) {
  return regprocedure.startsWith("public.") ? regprocedure : `public.${regprocedure}`;
}

for (const name of [
  "driver_presence_insert",
  "driver_presence_update",
  "driver_presence_delete",
]) {
  lines.push(`DROP POLICY IF EXISTS ${name} ON public.driver_presence;`);
}

for (const fn of snap.internal_security_definer_functions ?? []) {
  const rp = fnIdent(fn.regprocedure);
  lines.push(`REVOKE ALL ON FUNCTION ${rp} FROM PUBLIC, anon, authenticated, service_role;`);
  if (fn.authenticated_execute) {
    lines.push(`GRANT EXECUTE ON FUNCTION ${rp} TO authenticated;`);
  }
  if (fn.service_role_execute) {
    lines.push(`GRANT EXECUTE ON FUNCTION ${rp} TO service_role;`);
  }
}

const hn = snap.handle_new_user_grants;
if (hn) {
  lines.push(
    `REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;`
  );
  lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;`);
  if (hn.supabase_auth_admin) {
    lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;`);
  } else if (hn.supabase_auth_admin === null) {
    lines.push(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin; END IF; END $$;`
    );
  }
  if (hn.authenticated) {
    lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;`);
  }
  if (hn.service_role) {
    lines.push(`GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;`);
  }
}

for (const p of snap.advisor_rls_policies ?? []) {
  lines.push(`DROP POLICY IF EXISTS ${p.policyname} ON public.${p.tablename};`);
  const roles =
    p.roles?.length && !(p.roles.length === 1 && p.roles[0] === "public")
      ? ` TO ${p.roles.join(", ")}`
      : "";
  const using = p.qual ? ` USING (${p.qual})` : "";
  const check = p.with_check ? ` WITH CHECK (${p.with_check})` : "";
  lines.push(
    `CREATE POLICY ${p.policyname} ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd}${roles}${using}${check};`
  );
}

for (const idx of FKEY_INDEXES_00055) {
  lines.push(`DROP INDEX IF EXISTS public.${idx};`);
}

lines.push("COMMIT;");
lines.push("");

const sql = lines.join("\n");
if (outPath) {
  writeFileSync(outPath, sql);
} else {
  process.stdout.write(sql);
}
