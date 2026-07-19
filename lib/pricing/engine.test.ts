/**
 * Lightweight assertions for the pricing matcher.
 * Run: npx tsx lib/pricing/engine.test.ts
 */

import { matchPricingRule, type MatchablePricingRule } from "./engine";

const rules: MatchablePricingRule[] = [
  {
    id: "18",
    company_id: "lewis",
    pickup_area_id: "town",
    destination_area_id: "woodstock",
    areas_visited: ["town", "woodstock"],
    minimum_passengers: 1,
    maximum_passengers: 14,
    vehicle_id: "quantum",
    price: 300,
    priority: 100,
    active: true,
  },
  {
    id: "19",
    company_id: "lewis",
    pickup_area_id: "town",
    destination_area_id: "woodstock",
    areas_visited: [],
    minimum_passengers: 1,
    maximum_passengers: 60,
    vehicle_id: null,
    price: 280,
    priority: 10,
    active: true,
  },
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const hit = matchPricingRule(rules, {
  companyId: "lewis",
  pickupAreaId: "town",
  destinationAreaId: "woodstock",
  areasVisitedIds: ["town", "woodstock"],
  passengers: 4,
  vehicleId: "quantum",
});

assert(hit.rule?.id === "18", "expected specific vehicle + areas rule");
assert(hit.price === 300, "expected R300");
assert(hit.pricingStatus === "calculated", "expected calculated status");

const miss = matchPricingRule(rules, {
  companyId: "other",
  pickupAreaId: "town",
  destinationAreaId: "woodstock",
  areasVisitedIds: ["town", "woodstock"],
  passengers: 4,
  vehicleId: "quantum",
});

assert(miss.pricingStatus === "needs_pricing", "expected needs_pricing");
assert(miss.price === null, "expected null price");

const anyVehicle = matchPricingRule(rules, {
  companyId: "lewis",
  pickupAreaId: "town",
  destinationAreaId: "woodstock",
  areasVisitedIds: ["airport"],
  passengers: 4,
  vehicleId: "sprinter",
});

assert(anyVehicle.rule?.id === "19", "expected wildcard areas/vehicle rule");
assert(anyVehicle.price === 280, "expected R280");

console.log("pricing engine tests passed");
