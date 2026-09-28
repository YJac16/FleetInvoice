#!/usr/bin/env node
/**
 * Generate SQL to restore function grants/search_path/RLS from a 00052_snapshot JSON file.
 */
import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath) {
  console.error("Usage: node 00052_rollback_from_snapshot.mjs <snapshot.json> [rollback.sql]");
  process.exit(1);
}

const snap = JSON.parse(readFileSync(inPath, "utf8"));
const lines = ["-- Generated from 00052 snapshot", "BEGIN;"];

function fnSql(regprocedure) {
  return regprocedure;
}

function setExec(regprocedure, role, allowed) {
  const fn = fnSql(regprocedure);
  if (allowed) {
    lines.push(`GRANT EXECUTE ON FUNCTION ${fn} TO ${role};`);
  } else {
    lines.push(`REVOKE ALL ON FUNCTION ${fn} FROM ${role};`);
  }
}

for (const fn of snap.security_definer_functions ?? []) {
  const rp = fn.regprocedure;
  lines.push(`REVOKE ALL ON FUNCTION ${fnSql(rp)} FROM PUBLIC;`);
  setExec(rp, "anon", fn.anon_execute);
  setExec(rp, "authenticated", fn.authenticated_execute);
  setExec(rp, "service_role", fn.service_role_execute);
  if (fn.public_execute) {
    lines.push(`GRANT EXECUTE ON FUNCTION ${fnSql(rp)} TO PUBLIC;`);
  }
}

for (const fn of snap.invoker_search_path_helpers ?? []) {
  const rp = fn.regprocedure;
  const cfg = fn.proconfig ?? [];
  const searchPath = cfg.find((e) => e.startsWith("search_path="));
  if (searchPath) {
    const value = searchPath.slice("search_path=".length);
    lines.push(`ALTER FUNCTION ${fnSql(rp)} SET search_path = ${value};`);
  } else {
    lines.push(`ALTER FUNCTION ${fnSql(rp)} RESET search_path;`);
  }
}

const rls = snap.compliance_scan_quota?.relrowsecurity;
if (rls === true) {
  lines.push("ALTER TABLE public.compliance_scan_quota ENABLE ROW LEVEL SECURITY;");
} else if (rls === false) {
  lines.push("ALTER TABLE public.compliance_scan_quota DISABLE ROW LEVEL SECURITY;");
}

lines.push("COMMIT;");
lines.push("");

const sql = lines.join("\n");
if (outPath) {
  writeFileSync(outPath, sql);
} else {
  process.stdout.write(sql);
}
