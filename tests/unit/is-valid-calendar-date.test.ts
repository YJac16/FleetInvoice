import { describe, expect, it } from "vitest";

import { isValidCalendarDateStr } from "@/lib/date-range/sast-range";
import { dateRangeFromSearchParams } from "@/lib/date-range/search-params";

describe("isValidCalendarDateStr", () => {
  it("rejects impossible calendar dates", () => {
    expect(isValidCalendarDateStr("2026-02-31")).toBe(false);
    expect(isValidCalendarDateStr("2026-02-29")).toBe(false);
  });

  it("accepts real dates", () => {
    expect(isValidCalendarDateStr("2026-02-28")).toBe(true);
    expect(isValidCalendarDateStr("2024-02-29")).toBe(true);
  });
});

describe("dateRangeFromSearchParams impossible custom dates", () => {
  it("falls back to this week when custom from/to are impossible", () => {
    const range = dateRangeFromSearchParams(
      new URLSearchParams("range=custom&from=2026-02-31&to=2026-03-01")
    );
    expect(range.preset).toBe("this_week");
  });
});
