import { describe, expect, it } from "vitest";

import { dateRangeFromSearchParams } from "@/lib/date-range/search-params";

describe("dateRangeFromSearchParams", () => {
  it("falls back to this week for invalid range param", () => {
    const range = dateRangeFromSearchParams(new URLSearchParams("range=not-a-preset"));
    expect(range.preset).toBe("this_week");
  });

  it("falls back to this week for custom with invalid from/to", () => {
    const range = dateRangeFromSearchParams(
      new URLSearchParams("range=custom&from=31/02/2026&to=2026-10-01")
    );
    expect(range.preset).toBe("this_week");
  });

  it("keeps valid custom range", () => {
    const range = dateRangeFromSearchParams(
      new URLSearchParams("range=custom&from=2026-09-01&to=2026-09-10")
    );
    expect(range.preset).toBe("custom");
    expect(range.from).toBe("2026-09-01");
    expect(range.to).toBe("2026-09-10");
  });
});
