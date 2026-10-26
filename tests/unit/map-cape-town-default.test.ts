// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const ctor = vi.fn();
vi.mock("mapbox-gl", () => {
  class FakeMap {
    constructor(options: unknown) {
      ctor(options);
    }
    addControl() {}
  }
  class FakeNav {}
  return { default: { Map: FakeMap, NavigationControl: FakeNav, accessToken: "" } };
});

import {
  CAPE_TOWN_CENTER,
  CAPE_TOWN_DEFAULT_ZOOM,
  CAPE_TOWN_MAX_BOUNDS,
  CAPE_TOWN_SEARCH_BBOX,
} from "@/lib/maps/cape-town";
import { createMapboxMap } from "@/lib/maps/mapbox";

describe("Cape Town map defaults", () => {
  beforeEach(() => ctor.mockClear());

  it("constants match the agreed Cape Town centre / zoom / bounds", () => {
    expect(CAPE_TOWN_CENTER).toEqual([18.4241, -33.9249]);
    expect(CAPE_TOWN_DEFAULT_ZOOM).toBe(10.5);
    expect(CAPE_TOWN_MAX_BOUNDS).toEqual([
      [18.0, -34.5],
      [19.4, -33.4],
    ]);
    expect(CAPE_TOWN_SEARCH_BBOX).toBe("18.28,-34.25,19.20,-33.60");
  });

  it("opens centred on Cape Town (not Johannesburg) by default, with no pan limit", async () => {
    await createMapboxMap(document.createElement("div"), { accessToken: "pk.test" });
    const options = ctor.mock.calls[0][0] as Record<string, unknown>;
    expect(options.center).toEqual([18.4241, -33.9249]);
    expect(options.zoom).toBe(10.5);
    // The GPS trip map relies on this: it must never be clipped to Cape Town.
    expect("maxBounds" in options).toBe(false);
  });

  it("applies maxBounds only when a caller opts in; explicit centre still wins", async () => {
    await createMapboxMap(document.createElement("div"), {
      accessToken: "pk.test",
      center: [28.0473, -26.2041],
      zoom: 9,
      maxBounds: CAPE_TOWN_MAX_BOUNDS,
    });
    const options = ctor.mock.calls[0][0] as Record<string, unknown>;
    expect(options.center).toEqual([28.0473, -26.2041]);
    expect(options.zoom).toBe(9);
    expect(options.maxBounds).toEqual(CAPE_TOWN_MAX_BOUNDS);
  });
});
