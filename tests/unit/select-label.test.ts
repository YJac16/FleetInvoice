import { describe, expect, it } from "vitest";

import { resolveSelectLabel } from "@/components/forms/select-label";
import { REPORT_TYPE_LABELS, REPORT_TYPES } from "@/features/reports/schemas/report";

const reportOptions = REPORT_TYPES.map((value) => ({
  value,
  label: REPORT_TYPE_LABELS[value],
}));

describe("resolveSelectLabel", () => {
  it("maps report values to human labels", () => {
    expect(resolveSelectLabel(reportOptions, "trips")).toBe("Trips");
    expect(resolveSelectLabel(reportOptions, "fuel")).toBe("Fuel fill-ups");
    expect(resolveSelectLabel(reportOptions, "attendance")).toBe(
      "Attendance boardings"
    );
    expect(resolveSelectLabel(reportOptions, "commercial")).toBe(
      "Invoices & payroll"
    );
  });

  it("uses the placeholder when empty", () => {
    expect(resolveSelectLabel(reportOptions, "", "Select…")).toBe("Select…");
    expect(resolveSelectLabel(reportOptions, null, "Select…")).toBe("Select…");
  });
});
