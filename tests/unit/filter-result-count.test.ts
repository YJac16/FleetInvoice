import { describe, expect, it } from "vitest";

import { resolveRangeFilterResultCount } from "@/lib/date-range/filter-result-count";

describe("resolveRangeFilterResultCount", () => {
  it("returns undefined when the query errored", () => {
    expect(
      resolveRangeFilterResultCount(
        { isError: true, isPlaceholderData: false },
        { listReady: true, count: 5 }
      )
    ).toBeUndefined();
  });

  it("returns undefined while the list is not ready", () => {
    expect(
      resolveRangeFilterResultCount(
        { isError: false, isPlaceholderData: false },
        { listReady: false, count: 5 }
      )
    ).toBeUndefined();
  });

  it("returns undefined while placeholder data is shown", () => {
    expect(
      resolveRangeFilterResultCount(
        { isError: false, isPlaceholderData: true },
        { listReady: true, count: 12 }
      )
    ).toBeUndefined();
  });

  it("returns the count when ready and successful", () => {
    expect(
      resolveRangeFilterResultCount(
        { isError: false, isPlaceholderData: false },
        { listReady: true, count: 12 }
      )
    ).toBe(12);
  });
});
