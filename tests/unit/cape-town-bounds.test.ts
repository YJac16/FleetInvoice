import { describe, expect, it } from "vitest";

import {
  CAPE_TOWN_BOUNDS,
  isInsideCapeTownBounds,
} from "@/lib/maps/cape-town-bounds";

describe("Cape Town place bounds", () => {
  it("covers the peninsula, airport, winelands, Langebaan and Hermanus", () => {
    const inside = [
      ["Cape Town", -33.9249, 18.4241],
      ["Cape Point", -34.357, 18.497],
      ["Airport", -33.97, 18.602],
      ["Stellenbosch", -33.932, 18.86],
      ["Paarl", -33.734, 18.962],
      ["Franschhoek", -33.913, 19.12],
      ["Somerset West", -34.078, 18.844],
      ["Langebaan", -33.093, 18.033],
      ["Hermanus", -34.419, 19.243],
    ] as const;

    for (const [name, lat, lng] of inside) {
      expect(isInsideCapeTownBounds(lat, lng), name).toBe(true);
    }
  });

  it("rejects places outside the box", () => {
    expect(isInsideCapeTownBounds(-26.2041, 28.0473)).toBe(false);
    expect(isInsideCapeTownBounds(-33.0, 25.6)).toBe(false);
    expect(isInsideCapeTownBounds(CAPE_TOWN_BOUNDS.north + 0.2, 18.4)).toBe(
      false
    );
  });
});
