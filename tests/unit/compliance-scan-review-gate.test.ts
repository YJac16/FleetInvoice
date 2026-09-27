import { describe, expect, it } from "vitest";

import { canApplyScanReview } from "@/lib/compliance/scan-review-gate";

describe("scan review save gate (U1 / X4)", () => {
  it("blocks until every suggested field is confirmed and checkbox ticked", () => {
    expect(
      canApplyScanReview([{ showSuggestion: true, confirmed: false }], true)
    ).toBe(false);
    expect(
      canApplyScanReview([{ showSuggestion: true, confirmed: true }], false)
    ).toBe(false);
    expect(
      canApplyScanReview([{ showSuggestion: true, confirmed: true }], true)
    ).toBe(true);
    expect(
      canApplyScanReview([{ showSuggestion: false, confirmed: false }], true)
    ).toBe(true);
  });
});
