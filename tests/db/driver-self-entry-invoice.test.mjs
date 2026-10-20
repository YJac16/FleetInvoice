#!/usr/bin/env node
/**
 * Static checks for driver self-entry billing guards (00062).
 * Full RPC integration requires local Postgres bootstrap.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql = readFileSync(
  join(root, "supabase/migrations/00062_driver_self_entry_trips.sql"),
  "utf8"
);

const checks = [
  ["submit_driver_trip RPC", /create or replace function public\.submit_driver_trip/],
  ["approve uses resolve path", /sync_staff_trip_invoice_line\(p_trip_id, false\)/],
  ["pending blocks invoice sync", /driver_submission_pending\(t\)/],
  ["planned status on submit", /'planned'/],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const pass = pattern.test(sql);
  console.log(pass ? `PASS ${name}` : `FAIL ${name}`);
  if (!pass) failed = 1;
}

process.exit(failed);
