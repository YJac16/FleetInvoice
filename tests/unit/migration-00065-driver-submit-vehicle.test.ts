import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    path.resolve(__dirname, "../.."),
    "supabase/migrations/00065_driver_submit_assigned_vehicle.sql"
  ),
  "utf8"
);

describe("migration 00065 driver submit assigned vehicle", () => {
  it("drops client vehicle param and uses driver_default_vehicle_id", () => {
    expect(sql).toMatch(/drop function if exists public\.submit_driver_trip/);
    expect(sql).toMatch(/driver_default_vehicle_id\(p_organisation_id, v_driver_id\)/);
    expect(sql).not.toContain("p_vehicle_id uuid");
    expect(sql).toMatch(/needs_vehicle boolean/);
  });

  it("requires vehicle on approval", () => {
    expect(sql).toMatch(/Assign a vehicle on this trip before approval/);
  });

  it("reverts driver-wide vehicle picker RLS from 00064", () => {
    expect(sql).toMatch(/Reverts driver-wide vehicle picker RLS from 00064/);
    expect(sql).not.toContain("and status = 'active'\n      )");
  });
});
