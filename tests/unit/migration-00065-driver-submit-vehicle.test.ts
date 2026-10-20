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
  it("drops client vehicle param from submit_driver_trip", () => {
    expect(sql).toMatch(/drop function if exists public\.submit_driver_trip/);
    expect(sql).not.toContain("p_vehicle_id uuid");
  });

  it("uses driver_default_vehicle_id for assigned vehicle on submit", () => {
    expect(sql).toMatch(/driver_default_vehicle_id/);
  });

  it("reverts driver-wide vehicle picker RLS from 00064", () => {
    expect(sql).toMatch(/drop policy if exists vehicles_select on public\.vehicles/);
  });
});
