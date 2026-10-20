import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    path.resolve(__dirname, "../.."),
    "supabase/migrations/00066_admin_assign_vehicle_on_approve.sql"
  ),
  "utf8"
);

describe("migration 00066 admin vehicle on approve", () => {
  it("submits without any vehicle on assignment", () => {
    expect(sql).toMatch(/vehicle_id,\s*\n\s*assigned_by/);
    expect(sql).toMatch(/null,\s*\n\s*auth\.uid\(\)/);
    expect(sql).not.toMatch(/needs_vehicle/);
  });

  it("approves with required vehicle param and audit", () => {
    expect(sql).toMatch(/approve_driver_trip\(\s*\n\s*p_trip_id uuid,\s*\n\s*p_vehicle_id uuid/);
    expect(sql).toMatch(/Assigned on driver trip approval/);
    expect(sql).toMatch(/suggest_driver_trip_vehicle/);
  });
});
