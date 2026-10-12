import { describe, expect, it } from "vitest";

import {
  formatIsoDateEnZa,
  isoDateToDisplay,
  parseDisplayDateToIso,
} from "@/lib/date-range/calendar-text";

describe("calendar-text", () => {
  it("round-trips ISO via dd/MM/yyyy display", () => {
    expect(isoDateToDisplay("2026-10-14")).toBe("14/10/2026");
    expect(parseDisplayDateToIso("14/10/2026")).toBe("2026-10-14");
    expect(parseDisplayDateToIso("1/3/2026")).toBe("2026-03-01");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseDisplayDateToIso("31/02/2026")).toBeNull();
    expect(parseDisplayDateToIso("not-a-date")).toBeNull();
  });

  it("formats en-ZA hint for valid ISO dates", () => {
    const hint = formatIsoDateEnZa("2026-10-14");
    expect(hint).toMatch(/14/);
    expect(hint).toMatch(/2026/);
  });
});
