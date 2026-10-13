import { describe, expect, it } from "vitest";

import { hrefWithDateRange } from "@/lib/date-range/nav";

describe("hrefWithDateRange", () => {
  it("appends range query to trips and invoices links", () => {
    const params = new URLSearchParams("range=this_week");
    expect(hrefWithDateRange("/trips", params)).toBe("/trips?range=this_week");
    expect(hrefWithDateRange("/invoices", params)).toBe(
      "/invoices?range=this_week"
    );
  });

  it("preserves custom from/to", () => {
    const params = new URLSearchParams(
      "range=custom&from=2026-09-01&to=2026-09-10"
    );
    expect(hrefWithDateRange("/dashboard", params)).toBe(
      "/dashboard?range=custom&from=2026-09-01&to=2026-09-10"
    );
  });

  it("leaves unrelated paths unchanged", () => {
    const params = new URLSearchParams("range=today");
    expect(hrefWithDateRange("/drivers", params)).toBe("/drivers");
  });
});
