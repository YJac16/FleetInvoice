import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

const sql = readFileSync(
  path.join(root, "supabase/migrations/00061_driver_trip_rls_privacy.sql"),
  "utf8"
);

describe("migration 00061 driver trip RLS privacy", () => {
  it("defines trip_assigned_to_current_driver and tightens select policies", () => {
    expect(sql).toMatch(/trip_assigned_to_current_driver/);
    expect(sql).toMatch(/grant execute on function public\.trip_assigned_to_current_driver/);
    expect(sql).toMatch(/create policy trips_select/);
    expect(sql).toMatch(/when public\.has_org_role_names\(organisation_id, array\['driver'\]\)/);
    expect(sql).toMatch(/trip_assigned_to_current_driver\(id\)/);
    expect(sql).toMatch(/create policy trip_passengers_select/);
    expect(sql).toMatch(/trip_assigned_to_current_driver\(trip_id\)/);
  });
});
