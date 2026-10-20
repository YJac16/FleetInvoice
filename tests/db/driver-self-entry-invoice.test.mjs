#!/usr/bin/env node
/**
 * Static checks for driver self-entry billing guards (00062).
 * Full RPC integration requires local Postgres bootstrap.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sql62 = readFileSync(
  join(root, "supabase/migrations/00062_driver_self_entry_trips.sql"),
  "utf8"
);
const sql65 = readFileSync(
  join(root, "supabase/migrations/00065_driver_submit_assigned_vehicle.sql"),
  "utf8"
);
const sql66 = readFileSync(
  join(root, "supabase/migrations/00066_admin_assign_vehicle_on_approve.sql"),
  "utf8"
);

const checks = [
  ["submit_driver_trip RPC (00062)", /create or replace function public\.submit_driver_trip/, sql62],
  ["approve uses resolve path", /sync_staff_trip_invoice_line\(p_trip_id, false\)/, sql62],
  ["pending blocks invoice sync", /driver_submission_pending\(t\)/, sql62],
  ["no vehicle on submit (00066)", /null,\s*\n\s*auth\.uid\(\)/, sql66],
  ["approve with vehicle param (00066)", /p_vehicle_id uuid/, sql66],
  ["suggest vehicle RPC (00066)", /suggest_driver_trip_vehicle/, sql66],
];

let failed = 0;
for (const [name, pattern, sql] of checks) {
  const pass = pattern.test(sql);
  console.log(pass ? `PASS ${name}` : `FAIL ${name}`);
  if (!pass) failed = 1;
}

process.exit(failed);
