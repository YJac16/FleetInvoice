import { describe, expect, it } from "vitest";

import {
  parseTripLogNotes,
  resolveTripServiceCompany,
  resolveVehicleRegistration,
} from "@/features/invoices/lib/trip-notes";

describe("parseTripLogNotes", () => {
  it("parses pax and area from pipe-delimited notes", () => {
    expect(parseTripLogNotes("Lewis compliance | 1 pax | Manenberg")).toEqual({
      pax: 1,
      area: "Manenberg",
    });
  });

  it("parses multi-digit pax", () => {
    expect(
      parseTripLogNotes("TP performance | 12 pax | Paarden Eiland/Danoon/Parklands")
    ).toEqual({
      pax: 12,
      area: "Paarden Eiland/Danoon/Parklands",
    });
  });

  it("returns nulls for empty notes", () => {
    expect(parseTripLogNotes(null)).toEqual({ pax: null, area: null });
    expect(parseTripLogNotes("")).toEqual({ pax: null, area: null });
  });
});

describe("resolveTripServiceCompany", () => {
  it("prefers route name over notes and never WCL bill-to", () => {
    expect(
      resolveTripServiceCompany("Lewis Compliance", "WCL Trading CC | 1 pax | X")
    ).toBe("Lewis Compliance");
  });

  it("falls back to first notes segment when route name missing", () => {
    expect(resolveTripServiceCompany(null, "Inspire | 2 pax | Milnerton")).toBe(
      "Inspire"
    );
  });
});

describe("resolveVehicleRegistration", () => {
  it("prefers registration_number over vehicle name", () => {
    expect(resolveVehicleRegistration("CAA 484892", "Quantam 1")).toBe(
      "CAA 484892"
    );
  });

  it("falls back to vehicle name when registration empty", () => {
    expect(resolveVehicleRegistration("", "GR 11 WP")).toBe("GR 11 WP");
  });
});
