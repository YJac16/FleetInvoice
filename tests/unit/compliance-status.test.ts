import { describe, expect, it } from "vitest";

import { complianceTodaySast } from "@/features/compliance/lib/compliance-dates";
import {
  complianceStatusForDate,
  complianceStatusForDaysRemaining,
  complianceStatusLabel,
} from "@/features/compliance/lib/compliance-status";
import { maskSensitiveNumber } from "@/features/compliance/lib/mask-sensitive";
import { PRDP_FULL_LABEL, PRDP_SHORT_LABEL } from "@/features/compliance/lib/prdp-label";
import { driverSchema } from "@/features/drivers/schemas/driver";

describe("complianceStatusForDaysRemaining", () => {
  it("maps milestone thresholds", () => {
    expect(complianceStatusForDaysRemaining(-1)).toBe("expired");
    expect(complianceStatusForDaysRemaining(0)).toBe("due_7");
    expect(complianceStatusForDaysRemaining(7)).toBe("due_7");
    expect(complianceStatusForDaysRemaining(8)).toBe("due_30");
    expect(complianceStatusForDaysRemaining(30)).toBe("due_30");
    expect(complianceStatusForDaysRemaining(31)).toBe("due_60");
    expect(complianceStatusForDaysRemaining(61)).toBe("ok");
  });
});

describe("complianceStatusForDate", () => {
  it("returns not_captured when empty", () => {
    expect(complianceStatusForDate(null)).toBe("not_captured");
    expect(complianceStatusLabel("not_captured")).toBe("Not captured");
  });

  it("uses SAST today for relative status", () => {
    const today = complianceTodaySast();
    expect(complianceStatusForDate(today, today)).toBe("due_7");
  });
});

describe("maskSensitiveNumber", () => {
  it("masks all but last four", () => {
    expect(maskSensitiveNumber("AB1234567890")).toBe("••••••••7890");
  });
});

describe("PrDP labels", () => {
  it("uses PrDP wording", () => {
    expect(PRDP_SHORT_LABEL).toBe("PrDP");
    expect(PRDP_FULL_LABEL).toContain("Professional Driving Permit");
  });
});

describe("driverSchema licence code", () => {
  const base = {
    full_name: "Test Driver",
    status: "active" as const,
  };

  it("rejects Other without explanation", () => {
    const result = driverSchema.safeParse({
      ...base,
      license_code: "Other",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid code without explanation", () => {
    const result = driverSchema.safeParse({
      ...base,
      license_code: "B",
    });
    expect(result.success).toBe(true);
  });

  it("rejects explanation when code is not Other", () => {
    const result = driverSchema.safeParse({
      ...base,
      license_code: "B",
      license_code_other: "Custom",
    });
    expect(result.success).toBe(false);
  });
});
