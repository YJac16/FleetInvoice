import { describe, expect, it } from "vitest";

import {
  isInstantInRange,
  resolveDateRange,
  todayInListTz,
} from "@/lib/date-range/sast-range";
import { dateRangeFromSearchParams } from "@/lib/date-range/search-params";

describe("date range SAST", () => {
  const wednesdaySast = new Date("2026-10-07T12:00:00+02:00");

  it("resolves this week Monday–Sunday in SAST", () => {
    const range = resolveDateRange("this_week", null, null, wednesdaySast);
    expect(range.from).toBe("2026-10-05");
    expect(range.to).toBe("2026-10-11");
    expect(range.toExclusive).toBe("2026-10-12");
  });

  it("resolves last week as prior Monday–Sunday", () => {
    const range = resolveDateRange("last_week", null, null, wednesdaySast);
    expect(range.from).toBe("2026-09-28");
    expect(range.to).toBe("2026-10-04");
  });

  it("places UTC instant on SAST calendar day at midnight boundary", () => {
    const range = resolveDateRange("today", null, null, new Date("2026-10-12T10:00:00+02:00"));
    expect(range.from).toBe("2026-10-12");

    // 2026-10-11T22:00:00Z = 2026-10-12 00:00 SAST → belongs to Oct 12
    expect(
      isInstantInRange("2026-10-11T22:00:00.000Z", range)
    ).toBe(true);

    // One second before SAST midnight on Oct 12 is still Oct 11
    const yesterday = resolveDateRange(
      "yesterday",
      null,
      null,
      new Date("2026-10-12T10:00:00+02:00")
    );
    expect(yesterday.from).toBe("2026-10-11");
    expect(isInstantInRange("2026-10-11T21:59:59.000Z", yesterday)).toBe(true);
    expect(isInstantInRange("2026-10-11T22:00:00.000Z", yesterday)).toBe(false);
  });

  it("week starting Monday when reference is Sunday SAST", () => {
    const sunday = new Date("2026-10-11T15:00:00+02:00");
    const range = resolveDateRange("this_week", null, null, sunday);
    expect(range.from).toBe("2026-10-05");
    expect(range.to).toBe("2026-10-11");
  });

  it("parses range from URL search params", () => {
    const params = new URLSearchParams("range=custom&from=2026-09-01&to=2026-09-03");
    const range = dateRangeFromSearchParams(params, "today");
    expect(range.preset).toBe("custom");
    expect(range.from).toBe("2026-09-01");
    expect(range.to).toBe("2026-09-03");
  });

  it("todayInListTz uses SAST calendar date", () => {
    // Late UTC evening still same SAST day as midday SAST reference
    const noonSast = new Date("2026-10-12T12:00:00+02:00");
    expect(todayInListTz(noonSast)).toBe("2026-10-12");
  });
});
