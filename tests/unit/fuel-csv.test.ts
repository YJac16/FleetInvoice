import { describe, expect, it } from "vitest";

import { csvRow, csvWithBom, escapeCsvCell } from "@/features/fuel/lib/csv";

describe("fuel CSV export", () => {
  it("escapes formula injection", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCsvCell("-100")).toBe("'-100");
  });

  it("adds UTF-8 BOM for Excel", () => {
    expect(csvWithBom([csvRow(["a", "b"])])).toMatch(/^\uFEFF/);
  });
});
