import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/permissions";
import { isComplianceScanAssistActive } from "@/lib/compliance/scan-assist";

describe("admin capture permissions", () => {
  it("organisation_admin can manage drivers and vehicles", () => {
    expect(hasPermission("organisation_admin", "drivers:manage")).toBe(true);
    expect(hasPermission("organisation_admin", "vehicles:manage")).toBe(true);
  });

  it("driver and employee cannot manage drivers or vehicles", () => {
    expect(hasPermission("driver", "drivers:manage")).toBe(false);
    expect(hasPermission("driver", "vehicles:manage")).toBe(false);
    expect(hasPermission("employee", "drivers:manage")).toBe(false);
    expect(hasPermission("employee", "vehicles:manage")).toBe(false);
  });

  it("company_manager cannot view or manage fleet entities", () => {
    expect(hasPermission("company_manager", "drivers:view")).toBe(false);
    expect(hasPermission("company_manager", "drivers:manage")).toBe(false);
    expect(hasPermission("company_manager", "vehicles:view")).toBe(false);
    expect(hasPermission("company_manager", "vehicles:manage")).toBe(false);
  });
});

describe("scan-assist default", () => {
  it("is off when env flag is unset even if org flag is true", () => {
    const prev = process.env.COMPLIANCE_SCAN_ENABLED;
    delete process.env.COMPLIANCE_SCAN_ENABLED;
    expect(isComplianceScanAssistActive(true)).toBe(false);
    if (prev) process.env.COMPLIANCE_SCAN_ENABLED = prev;
  });
});
