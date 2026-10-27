import { describe, expect, it } from "vitest";

import {
  isDriverThemeChoice,
  nextDriverTheme,
} from "@/features/driver-portal/lib/driver-theme";

describe("driver theme choice", () => {
  it("cycles light, dark, and system", () => {
    expect(nextDriverTheme("light")).toBe("dark");
    expect(nextDriverTheme("dark")).toBe("system");
    expect(nextDriverTheme("system")).toBe("light");
  });

  it("starts at light when the stored theme is unknown", () => {
    expect(nextDriverTheme(undefined)).toBe("light");
    expect(nextDriverTheme("sepia")).toBe("light");
  });

  it("accepts only the three persisted choices", () => {
    expect(isDriverThemeChoice("system")).toBe(true);
    expect(isDriverThemeChoice("dark")).toBe(true);
    expect(isDriverThemeChoice("light")).toBe(true);
    expect(isDriverThemeChoice(undefined)).toBe(false);
  });
});
