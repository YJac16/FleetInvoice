import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const sql = readFileSync(
  path.join(root, "supabase/migrations/00063_driver_trip_admin_audit_override.sql"),
  "utf8"
);

describe("migration 00063 driver trip admin audit and override", () => {
  it("adds snapshot, override, and audit tables with staff RLS", () => {
    expect(sql).toMatch(/trip_driver_submission_snapshots/);
    expect(sql).toMatch(/trip_billing_overrides/);
    expect(sql).toMatch(/trip_audit/);
    expect(sql).toMatch(/trip_audit_select/);
    expect(sql).toMatch(/staff-only via RLS/i);
  });

  it("wires override precedence in invoice sync", () => {
    expect(sql).toMatch(/trip_billing_overrides bo/);
    expect(sql).toMatch(/v_override/);
    expect(sql).toMatch(/v_rate := v_override/);
  });

  it("requires edit reason and logs audit rows", () => {
    expect(sql).toMatch(/log_trip_audit/);
    expect(sql).toMatch(/Edit reason is required/);
    expect(sql).toMatch(/assert_staff_trip_invoice_editable/);
  });

  it("exposes admin RPCs", () => {
    expect(sql).toMatch(/set_trip_billing_override/);
    expect(sql).toMatch(/admin_create_staff_trip/);
    expect(sql).toMatch(/trip_driver_submission_snapshots/);
  });
});
