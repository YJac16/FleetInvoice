import { describe, expect, it } from "vitest";

import {
  mapsDirectionsUrl,
  pickupNavTarget,
  type PassengerWithNav,
} from "@/services/trip-passengers.service";

describe("mapsDirectionsUrl", () => {
  it("encodes destination for Google Maps directions", () => {
    const url = mapsDirectionsUrl("-26.2,28.0");
    expect(url).toContain("https://www.google.com/maps/dir/");
    expect(url).toContain(encodeURIComponent("-26.2,28.0"));
  });
});

describe("pickupNavTarget", () => {
  it("uses home coords for to_work", () => {
    const passenger = {
      direction: "to_work",
      employees: {
        id: "e1",
        full_name: "Ada",
        email: null,
        phone: null,
        home_address: "12 Main",
        home_latitude: -26.1,
        home_longitude: 28.1,
        company_id: null,
        site_id: null,
      },
    } as PassengerWithNav;

    expect(pickupNavTarget(passenger)).toEqual({
      label: "12 Main",
      mapsQuery: "-26.1,28.1",
    });
  });

  it("uses site coords for from_work", () => {
    const passenger = {
      direction: "from_work",
      employees: {
        id: "e1",
        full_name: "Ada",
        email: null,
        phone: null,
        home_address: null,
        home_latitude: null,
        home_longitude: null,
        company_id: null,
        site_id: "s1",
        sites: {
          id: "s1",
          name: "Plant A",
          address: "Site Rd",
          latitude: -26.3,
          longitude: 28.3,
        },
      },
    } as PassengerWithNav;

    expect(pickupNavTarget(passenger)).toEqual({
      label: "Plant A",
      mapsQuery: "-26.3,28.3",
    });
  });
});
