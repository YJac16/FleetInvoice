import { describe, expect, it } from "vitest";

import { inclusiveEndToExclusive } from "@/features/reports/lib/period";
import { formatDate, formatDateTime } from "@/utils/format";

describe("dd MMM yyyy display", () => {
  it("formats date-only values without a timezone shift", () => {
    expect(formatDate("2026-11-25")).toBe("25 Nov 2026");
    expect(formatDate("2026-01-02")).toBe("02 Jan 2026");
  });

  it("formats instants in SAST (UTC+2)", () => {
    expect(formatDate("2026-11-24T22:30:00Z")).toBe("25 Nov 2026");
    expect(formatDateTime("2026-11-25T12:20:00Z")).toBe("25 Nov 2026 14:20");
  });

  it("never renders US mm/dd and handles empty or invalid", () => {
    expect(formatDate("2026-11-23")).not.toMatch(/\//);
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime("nope")).toBe("—");
  });
});

describe("report end date", () => {
  it("converts the inclusive last day to an exclusive bound", () => {
    expect(inclusiveEndToExclusive("2026-11-29")).toBe("2026-11-30");
    expect(inclusiveEndToExclusive("2026-12-31")).toBe("2027-01-01");
  });
});
