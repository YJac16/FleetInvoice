import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    path.resolve(__dirname, "../.."),
    "supabase/migrations/00064_driver_trip_admin_hardening.sql"
  ),
  "utf8"
);

describe("migration 00064 driver trip hardening", () => {
  it("restricts admin edit roles", () => {
    expect(sql).toMatch(/array\['organisation_admin', 'manager'\]/);
  });

  it("hardens duplicate detection and trip ops", () => {
    expect(sql).toMatch(/driver_trip_duplicate_warning/);
    expect(sql).toMatch(/45 \* 60/);
    expect(sql).toMatch(/driver_submission_pending\(t\)/);
  });

  it("locks down internal definer helpers", () => {
    expect(sql).toMatch(/revoke all on function public\.log_trip_audit/);
    expect(sql).toMatch(/revoke all on function public\.assert_staff_trip_invoice_editable/);
    expect(sql).not.toMatch(
      /grant execute on function public\.staff_can_manage_trips\(uuid\) to authenticated/
    );
  });
});
