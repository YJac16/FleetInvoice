#!/usr/bin/env node
/**
 * 00055 index rollback: only migration-created indexes are dropped; pre-existing survive.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FKEY_INDEXES_00055 } from "../../scripts/db/00055-advisor-constants.mjs";
import { apply00055HostedFidelity } from "./00055-hosted-apply.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PG_DB = process.env.WORKOPS_AUDIT_PG_DATABASE ?? "workops_audit";
const PREEXISTING_IDX = "preexisting_test_fkey_idx";
const MIG_00055 = join(ROOT, "supabase/migrations/00055_advisor_cleanup.sql");
const SNAPSHOT_SQL = join(ROOT, "scripts/db/00055_snapshot.sql");
const ROLLBACK_GEN = join(ROOT, "scripts/db/00055_rollback_from_snapshot.mjs");

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

function indexExists(name) {
  const res = psql(`SELECT (to_regclass('public.${name}') IS NOT NULL)::text;`);
  const line = res.text
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l === "t" || l === "f" || l === "true" || l === "false")
    .pop();
  return line;
}

function indexPresent(name) {
  const v = indexExists(name);
  return v === "t" || v === "true";
}

function main() {
  psql(
    `CREATE INDEX IF NOT EXISTS ${PREEXISTING_IDX} ON public.trips (company_id);`
  );

  const dir = mkdtempSync(join(tmpdir(), "00055-idx-"));
  chmodSync(dir, 0o755);
  const snapPath = join(dir, "before.json");
  const rollbackPath = join(dir, "rollback.sql");

  const cap = spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-tA", "-f", SNAPSHOT_SQL],
    { encoding: "utf8" }
  );
  if (cap.status !== 0) throw new Error(cap.stderr || cap.stdout);
  writeFileSync(snapPath, cap.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "{}");

  apply00055HostedFidelity(MIG_00055);

  for (const idx of FKEY_INDEXES_00055) {
    if (!indexPresent(idx)) {
      console.error(`FAIL missing 00055 index after apply: ${idx}`);
      process.exit(1);
    }
  }
  if (!indexPresent(PREEXISTING_IDX)) {
    console.error("FAIL pre-existing index missing after 00055 apply");
    process.exit(1);
  }

  spawnSync("node", [ROLLBACK_GEN, snapPath, rollbackPath], { stdio: "inherit" });
  chmodSync(rollbackPath, 0o644);
  spawnSync(
    "sudo",
    ["-u", "postgres", "psql", "-q", "-d", PG_DB, "-v", "ON_ERROR_STOP=1", "-f", rollbackPath],
    { stdio: "inherit" }
  );

  for (const idx of FKEY_INDEXES_00055) {
    if (indexPresent(idx)) {
      console.error(`FAIL 00055 index still present after rollback: ${idx}`);
      process.exit(1);
    }
  }
  if (!indexPresent(PREEXISTING_IDX)) {
    console.error("FAIL pre-existing index dropped by rollback");
    process.exit(1);
  }

  console.log("PASS 00055-index-rollback-preexisting-survives");
}

main();
