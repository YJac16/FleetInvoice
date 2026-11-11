import { describe, expect, it } from "vitest";

import {
  chooseTripUnitPrice,
  matchRoutePrice,
  normalizeRoutePlace,
  routeAreaKey,
  splitRouteStops,
  type RoutePriceRule,
} from "@/features/billing/lib/route-price-match";
import { tripPriceApplyArgs } from "@/features/billing/lib/trip-price-entry";

function rule(partial: Omit<RoutePriceRule, "id" | "priority" | "active"> & { id?: string; priority?: number }): RoutePriceRule {
  return {
    id: partial.id ?? partial.label,
    priority: partial.priority ?? 0,
    active: true,
    ...partial,
  };
}

const fadiaWns: RoutePriceRule[] = [
  rule({
    label: "Airport ↔ listed hotels",
    matchKind: "anchor",
    stops: [],
    anchorPlace: "Airport",
    places: [
      "Cullinan",
      "Protea Fire & Ice",
      "Protea Sea Point",
      "Queen Victoria",
      "Southern Sun Waterfront",
      "Rockefeller",
      "Onomo",
      "Radisson Red",
      "Waterfront Village",
    ],
    bidirectional: true,
    unitAmount: 410,
  }),
  rule({
    label: "Short runs",
    matchKind: "within",
    stops: [],
    anchorPlace: null,
    places: ["Crystal Towers", "Coral Grove", "Claremont", "Bridge Park", "Heron Crescent"],
    bidirectional: true,
    unitAmount: 430,
  }),
  rule({
    label: "Crystal Towers ↔ Airport",
    matchKind: "exact",
    stops: ["Crystal Towers", "Airport"],
    anchorPlace: null,
    places: [],
    bidirectional: true,
    unitAmount: 430,
  }),
  rule({
    label: "Restaurant run",
    matchKind: "either",
    stops: [],
    anchorPlace: null,
    places: ["Tang", "Waterside V&A"],
    bidirectional: true,
    unitAmount: 500,
  }),
  rule({
    label: "Radisson Blu → Black River Park",
    matchKind: "exact",
    stops: ["Radisson Blu", "Black River Park"],
    anchorPlace: null,
    places: [],
    bidirectional: false,
    unitAmount: 500,
  }),
  rule({
    label: "AC Marriott",
    matchKind: "anchor",
    stops: [],
    anchorPlace: "AC Marriott Waterfront",
    places: ["Airport", "Black River Park"],
    bidirectional: true,
    unitAmount: 590,
  }),
  rule({
    label: "Bridge Park → Crystal Towers",
    matchKind: "exact",
    stops: ["Bridge Park", "Crystal Towers"],
    anchorPlace: null,
    places: [],
    bidirectional: false,
    unitAmount: 590,
  }),
  rule({
    label: "Harbour House via",
    matchKind: "exact",
    stops: ["Harbour House Camps Bay", "Southern Sun Waterfront", "Crystal Towers"],
    anchorPlace: null,
    places: [],
    bidirectional: false,
    unitAmount: 640,
  }),
  rule({
    label: "Black River Park → Radisson Blu",
    matchKind: "exact",
    stops: ["Black River Park", "Radisson Blu"],
    anchorPlace: null,
    places: [],
    bidirectional: false,
    unitAmount: 1180,
  }),
  rule({
    label: "WNS Claremont → 29 Queens",
    matchKind: "exact",
    stops: ["WNS Claremont", "29 Queens Rd Sea Point"],
    anchorPlace: null,
    places: [],
    bidirectional: false,
    unitAmount: 1500,
  }),
];

describe("normalizeRoutePlace", () => {
  it("treats airport aliases and hotel shorthand as the same place", () => {
    expect(normalizeRoutePlace("CTIA")).toBe("airport");
    expect(normalizeRoutePlace("Cape Town International")).toBe("airport");
    expect(normalizeRoutePlace("SS Waterfront")).toBe("southern sun waterfront");
    expect(normalizeRoutePlace("Cloud 9")).toBe("cloud nine");
    expect(normalizeRoutePlace("GCVJ")).toBe("garden court victoria junction");
    expect(normalizeRoutePlace("The Commodore")).toBe("commodore");
    expect(normalizeRoutePlace("Waterside V&A")).toBe("waterside v and a");
    expect(normalizeRoutePlace("29 Queens Rd Sea Point")).toBe("29 queens road sea point");
    expect(normalizeRoutePlace("Harbour House")).toBe("harbour house camps bay");
  });

  it("keeps WNS Claremont distinct from Claremont", () => {
    expect(normalizeRoutePlace("WNS Claremont")).not.toBe(normalizeRoutePlace("Claremont"));
  });
});

describe("splitRouteStops", () => {
  it("splits arrows, the word to, and spaced slashes", () => {
    expect(splitRouteStops("Airport → Cullinan")).toEqual(["Airport", "Cullinan"]);
    expect(splitRouteStops("Airport -> Cullinan")).toEqual(["Airport", "Cullinan"]);
    expect(splitRouteStops("Airport to Cullinan")).toEqual(["Airport", "Cullinan"]);
    expect(splitRouteStops("Airport TO Cullinan")).toEqual(["Airport", "Cullinan"]);
    expect(splitRouteStops("A → B → C")).toEqual(["A", "B", "C"]);
    expect(routeAreaKey("CTIA → The Commodore")).toBe("airport|commodore");
  });
});

describe("matchRoutePrice", () => {
  it("matches an airport hotel either way and prefers an exact route over the area", () => {
    expect(matchRoutePrice(fadiaWns, "CTIA → Cullinan")?.unitAmount).toBe(410);
    expect(matchRoutePrice(fadiaWns, "Cullinan → Airport")?.unitAmount).toBe(410);
    expect(matchRoutePrice(fadiaWns, "Crystal Towers → Claremont")?.unitAmount).toBe(430);
    expect(matchRoutePrice(fadiaWns, "Crystal Towers → Airport")?.label).toBe(
      "Crystal Towers ↔ Airport"
    );
    expect(matchRoutePrice(fadiaWns, "Bridge Park → Crystal Towers")?.unitAmount).toBe(590);
    expect(matchRoutePrice(fadiaWns, "Crystal Towers → Bridge Park")?.unitAmount).toBe(430);
  });

  it("keeps one-way luxury routes and the three-stop run exact", () => {
    expect(matchRoutePrice(fadiaWns, "Radisson Blu → Black River Park")?.unitAmount).toBe(500);
    expect(matchRoutePrice(fadiaWns, "Black River Park → Radisson Blu")?.unitAmount).toBe(1180);
    expect(
      matchRoutePrice(
        fadiaWns,
        "Harbour House Camps Bay → SS Waterfront → Crystal Towers"
      )?.unitAmount
    ).toBe(640);
    expect(matchRoutePrice(fadiaWns, "Harbour House → Crystal Towers")).toBeNull();
  });

  it("does not let WNS Claremont fall into the Claremont short-run price", () => {
    expect(
      matchRoutePrice(fadiaWns, "WNS Claremont → 29 Queens Rd Sea Point")?.unitAmount
    ).toBe(1500);
    expect(matchRoutePrice(fadiaWns, "Tang → Airport")?.unitAmount).toBe(500);
  });

  it("lets a company flat lose to a specific route", () => {
    const rules = [
      ...fadiaWns,
      rule({
        label: "Any route (flat template)",
        matchKind: "company",
        stops: [],
        anchorPlace: null,
        places: [],
        bidirectional: true,
        unitAmount: 300,
      }),
    ];
    expect(matchRoutePrice(rules, "Airport → Cullinan")?.unitAmount).toBe(410);
    expect(matchRoutePrice(rules, "Somewhere → Else")?.unitAmount).toBe(300);
  });

  it("does not treat Protea as Protea North Wharf", () => {
    const rules: RoutePriceRule[] = [
      rule({
        label: "Century City ↔ Protea North Wharf",
        matchKind: "exact",
        stops: ["Century City", "Protea North Wharf"],
        anchorPlace: null,
        places: [],
        bidirectional: true,
        unitAmount: 430,
      }),
      rule({
        label: "Century City ↔ Protea",
        matchKind: "exact",
        stops: ["Century City", "Protea"],
        anchorPlace: null,
        places: [],
        bidirectional: true,
        unitAmount: 300,
      }),
    ];
    expect(matchRoutePrice(rules, "Century City → Protea")?.unitAmount).toBe(300);
    expect(matchRoutePrice(rules, "Century City → Protea North Wharf")?.unitAmount).toBe(430);
    expect(matchRoutePrice(rules, "Protea Sea Point → Century City")).toBeNull();
  });

  it("ignores an inactive rule", () => {
    const rules = fadiaWns.map((item) =>
      item.label === "Airport ↔ listed hotels" ? { ...item, active: false } : item
    );
    expect(matchRoutePrice(rules, "Airport → Cullinan")).toBeNull();
  });
});

describe("chooseTripUnitPrice", () => {
  it("keeps the rate card when the template amount is the same", () => {
    expect(chooseTripUnitPrice({ routeAmount: 300, rateCardAmount: 300 })).toEqual({
      amount: 300,
      source: "rate_card",
    });
  });

  it("uses the route template only when the amount differs", () => {
    expect(chooseTripUnitPrice({ routeAmount: 410, rateCardAmount: 450 })).toEqual({
      amount: 410,
      source: "route_price",
    });
  });

  it("falls back to the rate card when no route price matches", () => {
    expect(chooseTripUnitPrice({ routeAmount: null, rateCardAmount: 450 })).toEqual({
      amount: 450,
      source: "rate_card",
    });
  });
});

describe("tripPriceApplyArgs", () => {
  it("stores a typed price, including the suggestion when the saved line differs", () => {
    expect(
      tripPriceApplyArgs({ entered: "500", suggestion: 410, existingUnitPrice: 410 })
    ).toEqual({ apply: true, price: 500 });
    expect(
      tripPriceApplyArgs({ entered: "410", suggestion: 410, existingUnitPrice: 450 })
    ).toEqual({ apply: true, price: 410 });
    expect(
      tripPriceApplyArgs({ entered: "410", suggestion: 410, existingUnitPrice: null })
    ).toEqual({ apply: true, price: null });
  });

  it("leaves an unchanged line and an active billing override alone", () => {
    expect(
      tripPriceApplyArgs({ entered: "450", suggestion: 410, existingUnitPrice: 450 })
    ).toEqual({ apply: false, price: null });
    expect(
      tripPriceApplyArgs({
        entered: "700",
        suggestion: 410,
        overrideAmount: 700,
        existingUnitPrice: 700,
      })
    ).toEqual({ apply: false, price: null });
  });
});
