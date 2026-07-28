import { describe, expect, it } from "vitest";

import { escapeCsvCell, toCsv } from "@/features/reports/lib/csv";
import {
  isDateInPeriod,
  isInstantInPeriod,
} from "@/features/reports/lib/period";

describe("reports csv", () => {
  it("escapes quotes and commas", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell(null)).toBe("");
  });

  it("builds CRLF csv with headers", () => {
    const csv = toCsv(
      ["id", "name"],
      [
        { id: 1, name: "Alpha" },
        { id: 2, name: "Beta, Inc" },
      ]
    );
    expect(csv).toBe('id,name\r\n1,Alpha\r\n2,"Beta, Inc"');
  });
});

describe("reports period", () => {
  it("includes start and excludes end for instants", () => {
    expect(
      isInstantInPeriod("2026-07-20T12:00:00.000Z", "2026-07-20", "2026-07-27")
    ).toBe(true);
    expect(
      isInstantInPeriod("2026-07-27T00:00:00.000Z", "2026-07-20", "2026-07-27")
    ).toBe(false);
  });

  it("compares date-only periods", () => {
    expect(isDateInPeriod("2026-07-20", "2026-07-20", "2026-07-27")).toBe(true);
    expect(isDateInPeriod("2026-07-27", "2026-07-20", "2026-07-27")).toBe(false);
  });
});
