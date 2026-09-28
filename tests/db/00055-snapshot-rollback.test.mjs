#!/usr/bin/env node
/**
 * Post-00052 baseline → snapshot → apply 00055 → rollback → re-snapshot identical.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { apply00055HostedFidelity } from "./00055-hosted-apply.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";
const SNAPSHOT_SQL = join(ROOT, "scripts/db/00055_snapshot.sql");
const ROLLBACK_GEN = join(ROOT, "scripts/db/00055_rollback_from_snapshot.mjs");
const MIG_00055 = join(ROOT, "supabase/migrations/00055_advisor_cleanup.sql");

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
  copy.fkey_covering_indexes?.sort();
  copy.advisor_rls_policies?.sort((a, b) =>
    `${a.tablename}:${a.policyname}`.localeCompare(`${b.tablename}:${b.policyname}`)
  );
  copy.internal_security_definer_functions?.sort((a, b) =>
    a.regprocedure.localeCompare(b.regprocedure)
  );
  return copy;
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "00055-snap-"));
  chmodSync(dir, 0o755);
  const beforePath = join(dir, "before.json");
  const afterPath = join(dir, "after.json");
  const rollbackPath = join(dir, "rollback.sql");

  const before = normalizeSnap(captureSnapshot(beforePath));
  apply00055HostedFidelity(MIG_00055);

  spawnSync("node", [ROLLBACK_GEN, beforePath, rollbackPath], { stdio: "inherit" });
  psqlFile(rollbackPath);

  const after = normalizeSnap(captureSnapshot(afterPath));
  const same = JSON.stringify(before) === JSON.stringify(after);
  if (!same) {
    console.error("FAIL 00055 snapshot rollback drift");
    process.exit(1);
  }
  console.log("PASS 00055-snapshot-rollback-identical");
}

main();
