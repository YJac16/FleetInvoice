import { describe, expect, it } from "vitest";

import {
  hasModule,
  isAppModule,
  moduleForPermission,
} from "@/lib/entitlements";

describe("entitlements", () => {
  it("recognises module keys", () => {
    expect(isAppModule("payroll")).toBe(true);
    expect(isAppModule("nope")).toBe(false);
  });

  it("hasModule respects all", () => {
    expect(hasModule("all", "gps")).toBe(true);
    expect(hasModule(["core", "billing"], "payroll")).toBe(false);
  });

  it("maps permissions to modules", () => {
    expect(moduleForPermission("dispatch:view")).toBe("gps");
    expect(moduleForPermission("invoices:view")).toBe("billing");
    expect(moduleForPermission("dashboard:view")).toBe("core");
  });
});
