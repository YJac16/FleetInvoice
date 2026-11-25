import { describe, expect, it } from "vitest";

import {
  currentConfirmedRate,
  isPricedFill,
  needsPrice,
  slipDate,
  vehicleFuelHistory,
} from "@/features/fuel/lib/fuel-pricing";
import type { FuelFillup, FuelPrice } from "@/types";

// DEMO fixtures: fake prices.
const ORG = "org-demo";
const price = (p: Partial<FuelPrice>): FuelPrice => ({
  id: Math.random().toString(36).slice(2),
  organisation_id: ORG,
  fuel_type: "diesel_50ppm",
  region: "coastal",
  effective_from: "2099-01-01",
  price_per_litre: 10,
  source: "DEMO",
  status: "confirmed",
  created_by: null,
  confirmed_by: null,
  confirmed_at: null,
  created_at: "",
  updated_at: "",
  ...p,
});
const fill = (p: Partial<FuelFillup>): FuelFillup => ({
  id: Math.random().toString(36).slice(2),
  organisation_id: ORG,
  vehicle_id: "v1",
  driver_id: null,
  company_id: null,
  filled_at: "2099-01-10T08:00:00Z",
  odometer_km: 0,
  litres: 10,
  unit_price: null,
  total_amount: null,
  currency: "ZAR",
  station_name: null,
  notes: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  deleted_at: null,
  fuel_type: "diesel_50ppm",
  region: "coastal",
  price_status: "needs_price",
  ...p,
});

describe("slipDate", () => {
  it("is the Africa/Johannesburg calendar date", () => {
    expect(slipDate("2099-02-02T21:30:00Z")).toBe("2099-02-02"); // 23:30 SAST
    expect(slipDate("2099-02-02T22:30:00Z")).toBe("2099-02-03"); // 00:30 SAST
  });
});

describe("priced vs needs price", () => {
  it("needs_price is never a priced (R0) fill", () => {
    expect(isPricedFill(fill({}))).toBe(false);
    expect(needsPrice(fill({}))).toBe(true);
    expect(isPricedFill(fill({ price_status: "priced", total_amount: 100 }))).toBe(true);
    expect(isPricedFill(fill({ price_status: "priced", total_amount: 0 }))).toBe(true);
    expect(isPricedFill(fill({ price_status: null, total_amount: null }))).toBe(false);
  });
});

describe("currentConfirmedRate", () => {
  const prices = [
    price({ effective_from: "2099-01-01", price_per_litre: 10 }),
    price({ effective_from: "2099-02-01", price_per_litre: 11 }),
    price({ effective_from: "2099-03-01", price_per_litre: 12, status: "pending" }),
    price({ organisation_id: null, effective_from: "2099-02-15", price_per_litre: 99, status: "pending" }),
    price({ organisation_id: "other-org", effective_from: "2099-02-20", price_per_litre: 98 }),
    price({ region: "inland", effective_from: "2099-02-10", price_per_litre: 13 }),
  ];
  it("uses the latest confirmed org rate with effective_from <= date", () => {
    expect(currentConfirmedRate(prices, ORG, "diesel_50ppm", "coastal", "2099-01-31")?.price_per_litre).toBe(10);
    expect(currentConfirmedRate(prices, ORG, "diesel_50ppm", "coastal", "2099-02-01")?.price_per_litre).toBe(11);
  });
  it("ignores pending, global and other-org rows", () => {
    expect(currentConfirmedRate(prices, ORG, "diesel_50ppm", "coastal", "2099-03-31")?.price_per_litre).toBe(11);
  });
  it("defaults region to coastal and respects inland", () => {
    expect(currentConfirmedRate(prices, ORG, "diesel_50ppm", null, "2099-02-28")?.price_per_litre).toBe(11);
    expect(currentConfirmedRate(prices, ORG, "diesel_50ppm", "inland", "2099-02-28")?.price_per_litre).toBe(13);
  });
  it("none before the first rate or without a type", () => {
    expect(currentConfirmedRate(prices, ORG, "diesel_50ppm", "coastal", "2098-12-31")).toBeNull();
    expect(currentConfirmedRate(prices, ORG, null, "coastal", "2099-02-28")).toBeNull();
  });
});

describe("vehicleFuelHistory", () => {
  const fills = [
    fill({ id: "a", filled_at: "2099-01-05T08:00:00Z", odometer_km: 1000, unit_price: 10, total_amount: 100, price_status: "priced" }),
    fill({ id: "b", filled_at: "2099-01-12T08:00:00Z", odometer_km: 1200, unit_price: 10.5, total_amount: 105, price_status: "priced" }),
    fill({ id: "c", filled_at: "2099-01-19T08:00:00Z", odometer_km: 1400 }), // needs price
    fill({ id: "d", filled_at: "2099-01-26T08:00:00Z", odometer_km: 1500, unit_price: 10.2, total_amount: 102, price_status: "priced" }),
    fill({ id: "x", vehicle_id: "v2", filled_at: "2099-01-26T08:00:00Z", odometer_km: 5, unit_price: 1, total_amount: 1, price_status: "priced" }),
  ];
  const prices = [price({ effective_from: "2099-01-20", price_per_litre: 11 })];
  const h = vehicleFuelHistory(fills, "v1", prices, ORG, "2099-02-01");

  it("last locked purchase vs current confirmed rate", () => {
    expect(h.lastLocked?.id).toBe("d");
    expect(h.currentRate?.price_per_litre).toBe(11);
    expect(h.rateDelta).toBe(0.8);
  });
  it("cost/km = total_amount / odometer delta since the previous fill; unpriced skipped, not R0", () => {
    expect(h.costPerKm.map((c) => [c.id, c.km, c.costPerKm])).toEqual([
      ["b", 200, 105 / 200],
      ["d", 100, 102 / 100],
    ]);
    expect(h.averageCostPerKm).toBeCloseTo(207 / 300, 6);
    expect(h.needsPriceCount).toBe(1);
  });
  it("unit-price trend over priced fills only", () => {
    expect(h.trend.map((t) => t.unit_price)).toEqual([10, 10.5, 10.2]);
    expect(h.trendDirection).toBe("down");
  });
  it("empty vehicle", () => {
    const e = vehicleFuelHistory(fills, "none", prices, ORG, "2099-02-01");
    expect(e.lastLocked).toBeNull();
    expect(e.averageCostPerKm).toBeNull();
    expect(e.trendDirection).toBeNull();
  });
});
