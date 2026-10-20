import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const sql = readFileSync(
  path.join(root, "supabase/migrations/00062_driver_self_entry_trips.sql"),
  "utf8"
);

describe("migration 00062 driver self-entry trips", () => {
  it("adds submission columns and RPCs", () => {
    expect(sql).toMatch(/submitted_by_driver/);
    expect(sql).toMatch(/approved_by/);
    expect(sql).toMatch(/approved_at/);
    expect(sql).toMatch(/rejected_reason/);
    expect(sql).toMatch(/submit_driver_trip/);
    expect(sql).toMatch(/approve_driver_trip/);
    expect(sql).toMatch(/reject_driver_trip/);
    expect(sql).toMatch(/driver_submission_pending/);
    expect(sql).toMatch(/driver_submission_pending\(t\)/);
  });
});
