import { describe, expect, it } from "vitest";

import {
  formatZarFromCents,
  isRecommendedPlan,
  labelForModule,
  mapPlanWithModules,
  sortModuleKeys,
  vehicleAllowanceCopy,
  vehicleSoftCapCopy,
} from "@/lib/plans";
import type { Plan } from "@/types";

function samplePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    code: "growth",
    name: "Growth",
    description: "Everything in Starter",
    stripe_price_id: null,
    is_active: true,
    sort_order: 20,
    currency: "ZAR",
    tagline: "In control",
    monthly_price_cents: 249000,
    included_vehicles: 25,
    extra_vehicle_cents: 7900,
    max_vehicles: 60,
    created_at: "2026-08-29T00:00:00.000Z",
    updated_at: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatZarFromCents", () => {
  it("formats whole-rand membership prices as R1,990-style ZAR", () => {
    expect(formatZarFromCents(99000)).toBe("R990");
    expect(formatZarFromCents(199000)).toBe("R1,990");
    expect(formatZarFromCents(249000)).toBe("R2,490");
    expect(formatZarFromCents(699000)).toBe("R6,990");
    expect(formatZarFromCents(7900)).toBe("R79");
  });

  it("keeps cents when the amount is not a whole rand", () => {
    expect(formatZarFromCents(12345)).toBe("R123.45");
  });

  it("returns an em dash for missing amounts", () => {
    expect(formatZarFromCents(null)).toBe("—");
    expect(formatZarFromCents(undefined)).toBe("—");
  });
});

describe("plan mapping", () => {
  it("maps entitlements to ordered module keys and drops unknown keys", () => {
    const mapped = mapPlanWithModules({
      ...samplePlan({ code: "scale", name: "Scale", sort_order: 30 }),
      module_entitlements: [
        { module_key: "ai" },
        { module_key: "core" },
        { module_key: "not_a_module" },
        { module_key: "gps" },
      ],
    });

    expect(mapped.module_keys).toEqual(["core", "gps", "ai"]);
    expect(mapped).not.toHaveProperty("module_entitlements");
  });

  it("labels modules in plain language", () => {
    expect(labelForModule("gps")).toBe("Live GPS & dispatch");
    expect(labelForModule("white_label")).toBe("White-label branding");
    expect(labelForModule("unknown_key")).toBe("Unknown Key");
  });

  it("sorts module keys in commercial order", () => {
    expect(sortModuleKeys(["ai", "core", "payroll", "gps"])).toEqual([
      "core",
      "gps",
      "payroll",
      "ai",
    ]);
  });

  it("marks Growth as the recommended plan", () => {
    expect(isRecommendedPlan("growth")).toBe(true);
    expect(isRecommendedPlan("starter")).toBe(false);
  });

  it("builds vehicle allowance copy from DB columns", () => {
    expect(
      vehicleAllowanceCopy({
        included_vehicles: 8,
        extra_vehicle_cents: 9900,
        max_vehicles: 15,
      })
    ).toBe("8 vehicles included · R99 per extra vehicle · cap 15");
  });

  it("nudges when the fleet is over the included allowance", () => {
    expect(
      vehicleSoftCapCopy({
        vehicleCount: 28,
        includedVehicles: 25,
        extraVehicleCents: 7900,
        maxVehicles: 60,
      })
    ).toBe(
      "You're using 28 vehicles — 3 over the included 25. Extra vehicles are billed at R79 each. Soft cap is 60 vehicles."
    );
  });
});
