import { describe, expect, it } from "vitest";

import {
  formatDriverRoute,
  isMultiStopRoute,
} from "@/features/trips/lib/route-stops";

describe("driver route stops", () => {
  it("keeps a pickup and drop-off as the stored area text", () => {
    expect(
      formatDriverRoute({
        area_text: "Rondebosch → Athlone",
        route_stops: [{ name: "Rondebosch" }, { name: "Athlone" }],
      })
    ).toBe("Rondebosch → Athlone");
    expect(isMultiStopRoute([{ name: "Rondebosch" }, { name: "Athlone" }])).toBe(
      false
    );
  });

  it("labels pickup, middle stops, and the final drop-off", () => {
    expect(
      formatDriverRoute({
        area_text: "ignored",
        route_stops: [
          { name: "Rondebosch" },
          { name: "Athlone" },
          { name: "Claremont" },
        ],
      })
    ).toBe("Pickup: Rondebosch → Stop 2: Athlone → Final drop-off: Claremont");
    expect(
      isMultiStopRoute([
        { name: "Rondebosch" },
        { name: "Athlone" },
        { name: "Claremont" },
      ])
    ).toBe(true);
  });
});
