import { describe, expect, it } from "vitest";

import {
  MAX_PLACE_LENGTH,
  tripRouteText,
  validateTripPlaces,
} from "@/features/trips/lib/trip-route-text";
import { parseInvoiceLineDescription } from "@/features/invoices/lib/invoice-line-description";
import { normalizeAreaValue } from "@/features/locations/lib/location-match";

describe("tripRouteText (mirrors SQL trip_route_text)", () => {
  it("formats structured pickup → drop-off and trims", () => {
    expect(tripRouteText("  Cape Town International Airport ", " Radisson Blu ", "legacy")).toBe(
      "Cape Town International Airport → Radisson Blu"
    );
  });

  it("falls back to the legacy area text", () => {
    expect(tripRouteText(null, null, "Central / WEX William St")).toBe(
      "Central / WEX William St"
    );
    expect(tripRouteText("Only pickup", null, " legacy ")).toBe("legacy");
    expect(tripRouteText("", "", undefined)).toBe("");
  });
});

describe("validateTripPlaces (mirrors SQL validate_trip_places)", () => {
  it("accepts and trims valid places, keeping commas/slashes/dashes/arrows", () => {
    expect(validateTripPlaces(" The Silo Hotel, V&A Waterfront ", "Stellenbosch / Franschhoek")).toEqual({
      ok: true,
      pickup: "The Silo Hotel, V&A Waterfront",
      dropoff: "Stellenbosch / Franschhoek",
    });
    expect(validateTripPlaces("Marine Hotel – Hermanus", "Hotel A → Annex").ok).toBe(true);
  });

  it.each([
    ["empty pickup", "", "Airport", /required/],
    ["blank drop-off", "Airport", "   ", /required/],
    ["null", null, undefined, /required/],
    ["pipe", "Bar | Grill", "Airport", /cannot contain/],
    ["pipe in drop-off", "Airport", "A|B", /cannot contain/],
    ["newline", "Foo\nBar", "Airport", /cannot contain/],
    ["carriage return", "Foo\rBar", "Airport", /cannot contain/],
    ["equal", "Airport", "airport", /different/],
    ["too long", "x".repeat(MAX_PLACE_LENGTH + 1), "Airport", /120/],
  ])("rejects %s", (_name, pickup, dropoff, message) => {
    const result = validateTripPlaces(pickup, dropoff);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });

  it("allows exactly 120 characters", () => {
    expect(validateTripPlaces("y".repeat(120), "Airport").ok).toBe(true);
  });
});

/** Golden cases from the pickup/drop-off audit (pipe is rejected by validation instead). */
const GOLDEN: [string, string, string][] = [
  ["airport→hotel", "Cape Town International Airport", "Radisson Blu Hotel"],
  ["'to' in name", "Cape Town International Airport", "Table Bay Hotel Waterfront - Pier Head to Quay 4"],
  ["hyphen", "Cape Town International Airport", "Cape Grace - V&A Waterfront"],
  ["comma", "Cape Town International Airport", "The Silo Hotel, V&A Waterfront, Cape Town"],
  ["arrow in name", "Hotel A → Annex", "Airport"],
  ["slash", "Cape Town International Airport", "Stellenbosch / Franschhoek Wine Tram"],
  ["WEX inside a name", "Cape Town International Airport", "Alexandra WEX Centre"],
  ["William Street guest house", "Cape Town International Airport", "William Street Guest House, Woodstock"],
  ["William St pickup", "William St Hotel", "Cape Town International Airport"],
  ["WEX William Street pickup (policy open)", "WEX William Street", "Cape Town International Airport"],
  ["en dash", "Cape Town International Airport", "Marine Hotel – Hermanus"],
];

describe("structured routes print verbatim (golden)", () => {
  for (const [name, pickup, dropoff] of GOLDEN) {
    for (const company of ["Springbok Atlas", "Lewis Head Office"]) {
      it(`${name} / ${company}: line text → print area is unchanged`, () => {
        const area = tripRouteText(pickup, dropoff, null);
        const parsed = parseInvoiceLineDescription(
          `26/10/2026 14:30 | ${company} | 2 pax | ${area}`
        );
        expect(parsed?.area).toBe(area);
      });
    }

    it(`${name}: admin area editor leaves an unchanged route untouched`, () => {
      const area = tripRouteText(pickup, dropoff, null);
      expect(normalizeAreaValue(area, []).value).toBe(area);
    });
  }
});
