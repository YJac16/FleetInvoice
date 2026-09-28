#!/usr/bin/env node
/**
 * Snapshot → apply 00052 → rollback → re-snapshot must match pre-image.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";
const SNAPSHOT_SQL = join(ROOT, "scripts/db/00052_snapshot.sql");
const ROLLBACK_GEN = join(ROOT, "scripts/db/00052_rollback_from_snapshot.mjs");
const MIG_00052 = join(
  ROOT,
  "supabase/migrations/00052_security_hardening_anon_rpc_quota_rls.sql"
);

function psqlFile(file) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", file],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || `psql -f ${file} failed`);
  }
}

function captureSnapshot(path) {
  const res = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-tA", "-f", SNAPSHOT_SQL],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || "snapshot capture failed");
  }
  const jsonLine = (res.stdout ?? "").trim().split("\n").filter(Boolean).at(-1);
  writeFileSync(path, jsonLine ?? "{}");
  return JSON.parse(jsonLine ?? "{}");
}

function normalizeSnap(snap) {
  const copy = structuredClone(snap);
  delete copy.captured_at;
  for (const fn of copy.security_definer_functions ?? []) {
    fn.proconfig = [...(fn.proconfig ?? [])].sort();
  }
  for (const fn of copy.invoker_search_path_helpers ?? []) {
    fn.proconfig = [...(fn.proconfig ?? [])].sort();
  }
  copy.security_definer_functions?.sort((a, b) =>
    a.regprocedure.localeCompare(b.regprocedure)
  );
  copy.invoker_search_path_helpers?.sort((a, b) =>
    a.regprocedure.localeCompare(b.regprocedure)
  );
  return copy;
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "00052-snap-"));
  const beforePath = join(dir, "before.json");
  const afterPath = join(dir, "after.json");
  const rollbackPath = join(dir, "rollback.sql");

  const before = normalizeSnap(captureSnapshot(beforePath));
  psqlFile(MIG_00052);

  spawnSync("node", [ROLLBACK_GEN, beforePath, rollbackPath], { stdio: "inherit" });
  psqlFile(rollbackPath);

  const after = normalizeSnap(captureSnapshot(afterPath));
  const same = JSON.stringify(before) === JSON.stringify(after);
  if (!same) {
    console.error("FAIL snapshot-rollback-diff");
    writeFileSync(join(dir, "before.norm.json"), JSON.stringify(before, null, 2));
    writeFileSync(join(dir, "after.norm.json"), JSON.stringify(after, null, 2));
    console.error("Diff artifacts:", dir);
    process.exitCode = 1;
    return;
  }
  console.log("PASS snapshot-rollback-identical");
}

main();
