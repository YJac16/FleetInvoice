import { describe, expect, it } from "vitest";

import { driverHeaderName } from "@/features/driver-portal/lib/driver-header-name";

describe("driverHeaderName", () => {
  it("uppercases profiles.full_name", () => {
    expect(driverHeaderName("Yaseen Jacobs")).toBe("YASEEN JACOBS");
  });

  it("trims whitespace before uppercasing", () => {
    expect(driverHeaderName("  Yaseen Driver  ")).toBe("YASEEN DRIVER");
  });

  it("falls back when the profile name is missing", () => {
    expect(driverHeaderName(null)).toBe("DRIVER");
    expect(driverHeaderName(undefined)).toBe("DRIVER");
    expect(driverHeaderName("   ")).toBe("DRIVER");
  });
});
