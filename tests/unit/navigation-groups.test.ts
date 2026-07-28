import { describe, expect, it } from "vitest";

import { MAIN_NAV, NAV_GROUPS, SECONDARY_NAV } from "@/lib/navigation";

describe("navigation groups", () => {
  it("assigns every main nav item to a known group", () => {
    const ids = new Set(NAV_GROUPS.map((g) => g.id));
    for (const item of MAIN_NAV) {
      expect(ids.has(item.group)).toBe(true);
    }
  });

  it("keeps settings in secondary nav only", () => {
    expect(SECONDARY_NAV.map((i) => i.href)).toEqual(["/settings"]);
    expect(MAIN_NAV.some((i) => i.href === "/settings")).toBe(false);
  });

  it("does not expose portal deep-links in admin nav", () => {
    const hrefs = [...MAIN_NAV, ...SECONDARY_NAV].map((i) => i.href);
    expect(hrefs).not.toContain("/driver");
    expect(hrefs).not.toContain("/employee");
    expect(hrefs).not.toContain("/company");
  });
});
