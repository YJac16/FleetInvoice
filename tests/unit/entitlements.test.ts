import { describe, expect, it } from "vitest";

import {
  hasModule,
  isAppModule,
  moduleForPermission,
} from "@/lib/entitlements";

describe("entitlements", () => {
  it("recognises module keys", () => {
    expect(isAppModule("payroll")).toBe(true);
    expect(isAppModule("white_label")).toBe(true);
    expect(isAppModule("sso")).toBe(true);
    expect(isAppModule("integrations")).toBe(true);
    expect(isAppModule("ai")).toBe(true);
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
