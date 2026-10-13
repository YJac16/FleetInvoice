import { describe, expect, it } from "vitest";

import { customRangeApplyDisabledTitle } from "@/lib/date-range/custom-range-apply";
import { validateCustomRangeDraft } from "@/lib/date-range/custom-range-draft";

describe("customRangeApplyDisabledTitle", () => {
  it("explains invalid or unordered dates", () => {
    const invalid = validateCustomRangeDraft("31/02/2026", "14/10/2026");
    expect(
      customRangeApplyDisabledTitle(invalid, "31/02/2026", "14/10/2026")
    ).toMatch(/valid dates/i);

    const ordered = validateCustomRangeDraft("14/10/2026", "01/10/2026");
    expect(
      customRangeApplyDisabledTitle(ordered, "14/10/2026", "01/10/2026")
    ).toMatch(/on or after/i);
  });

  it("returns undefined when apply is allowed", () => {
    const ok = validateCustomRangeDraft("01/10/2026", "14/10/2026");
    expect(
      customRangeApplyDisabledTitle(ok, "01/10/2026", "14/10/2026")
    ).toBeUndefined();
  });
});
