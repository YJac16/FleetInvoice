/**
 * In-memory pricing rules + history for demo mode (no Supabase).
 */

import { AUDIT_ACTIONS } from "@/lib/pricing/constants";
import { matchPricingRule } from "@/lib/pricing/engine";
import {
  DEMO_AREAS,
  DEMO_COMPANIES,
  DEMO_VEHICLES,
} from "@/lib/demo/catalog";
import type {
  PricingHistory,
  PricingRule,
  PricingRuleWithDetails,
  PricingStatus,
  Trip,
} from "@/types/database";

let rules: PricingRule[] = [
  {
    id: "pr000018-0000-0000-0000-000000000018",
    company_id: DEMO_COMPANIES[0].id,
    rule_name: "Town → Woodstock",
    pickup_area_id: DEMO_AREAS.find((a) => a.name === "Town")!.id,
    destination_area_id: DEMO_AREAS.find((a) => a.name === "Woodstock")!.id,
    areas_visited: [
      DEMO_AREAS.find((a) => a.name === "Town")!.id,
      DEMO_AREAS.find((a) => a.name === "Woodstock")!.id,
    ],
    minimum_passengers: 1,
    maximum_passengers: 14,
    vehicle_id: DEMO_VEHICLES[0].id,
    price: 300,
    priority: 100,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "pr000019-0000-0000-0000-000000000019",
    company_id: DEMO_COMPANIES[0].id,
    rule_name: "Town → Woodstock (any vehicle)",
    pickup_area_id: DEMO_AREAS.find((a) => a.name === "Town")!.id,
    destination_area_id: DEMO_AREAS.find((a) => a.name === "Woodstock")!.id,
    areas_visited: [],
    minimum_passengers: 1,
    maximum_passengers: 60,
    vehicle_id: null,
    price: 280,
    priority: 10,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "pr000020-0000-0000-0000-000000000020",
    company_id: DEMO_COMPANIES[1].id,
    rule_name: "Town → Green Point",
    pickup_area_id: DEMO_AREAS.find((a) => a.name === "Town")!.id,
    destination_area_id: DEMO_AREAS.find((a) => a.name === "Green Point")!.id,
    areas_visited: [],
    minimum_passengers: 1,
    maximum_passengers: 8,
    vehicle_id: null,
    price: 350,
    priority: 50,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let history: PricingHistory[] = [];

export interface DemoAuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

let audits: DemoAuditEntry[] = [];

function areaName(id: string): string {
  return DEMO_AREAS.find((a) => a.id === id)?.name ?? "Unknown";
}

function companyName(id: string): string {
  return DEMO_COMPANIES.find((c) => c.id === id)?.company_name ?? "Unknown";
}

function vehicleLabel(id: string | null): string {
  if (!id) return "Any vehicle";
  const vehicle = DEMO_VEHICLES.find((v) => v.id === id);
  if (!vehicle) return "Unknown vehicle";
  return `${vehicle.registration} · ${vehicle.make} ${vehicle.model}`;
}

export function enrichDemoPricingRule(
  rule: PricingRule
): PricingRuleWithDetails {
  return {
    ...rule,
    company_name: companyName(rule.company_id),
    pickup_area_name: areaName(rule.pickup_area_id),
    destination_area_name: areaName(rule.destination_area_id),
    areas_visited_names: rule.areas_visited.map(areaName),
    vehicle_label: vehicleLabel(rule.vehicle_id),
  };
}

export function listDemoPricingRules(): PricingRuleWithDetails[] {
  return rules
    .map(enrichDemoPricingRule)
    .sort((a, b) => b.priority - a.priority || a.company_name.localeCompare(b.company_name));
}

export function getDemoPricingRule(id: string): PricingRuleWithDetails | null {
  const rule = rules.find((r) => r.id === id);
  return rule ? enrichDemoPricingRule(rule) : null;
}

export function createDemoPricingRule(
  input: Omit<PricingRule, "id" | "created_at" | "updated_at">
): PricingRuleWithDetails {
  const now = new Date().toISOString();
  const rule: PricingRule = {
    ...input,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  };
  rules = [rule, ...rules];
  return enrichDemoPricingRule(rule);
}

export function updateDemoPricingRule(
  id: string,
  patch: Partial<
    Omit<PricingRule, "id" | "created_at" | "updated_at">
  >
): PricingRuleWithDetails | null {
  const index = rules.findIndex((r) => r.id === id);
  if (index < 0) return null;
  const next: PricingRule = {
    ...rules[index],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  rules = [...rules.slice(0, index), next, ...rules.slice(index + 1)];
  return enrichDemoPricingRule(next);
}

/** Soft delete — set active = false. */
export function softDeleteDemoPricingRule(
  id: string
): PricingRuleWithDetails | null {
  return updateDemoPricingRule(id, { active: false });
}

function resolveAreaId(name: string): string | null {
  const area = DEMO_AREAS.find(
    (a) => a.name.toLowerCase() === name.trim().toLowerCase()
  );
  return area?.id ?? null;
}

export function calculateDemoTripPrice(input: {
  companyId: string;
  pickupArea: string;
  destinationArea: string;
  areasVisited: string[];
  passengers: number;
  vehicleId: string;
}): {
  calculated_price: number | null;
  pricing_rule_id: string | null;
  pricing_status: PricingStatus;
  price_calculated_at: string;
  reason: string;
} {
  const pickupAreaId = resolveAreaId(input.pickupArea);
  const destinationAreaId = resolveAreaId(input.destinationArea);
  const areasVisitedIds = input.areasVisited
    .map(resolveAreaId)
    .filter((id): id is string => Boolean(id));

  const now = new Date().toISOString();

  if (!pickupAreaId || !destinationAreaId) {
    return {
      calculated_price: null,
      pricing_rule_id: null,
      pricing_status: "needs_pricing",
      price_calculated_at: now,
      reason: "Pickup or destination area could not be resolved",
    };
  }

  const result = matchPricingRule(
    rules.map((r) => ({
      ...r,
      price: Number(r.price),
    })),
    {
      companyId: input.companyId,
      pickupAreaId,
      destinationAreaId,
      areasVisitedIds,
      passengers: input.passengers,
      vehicleId: input.vehicleId,
    }
  );

  return {
    calculated_price: result.price,
    pricing_rule_id: result.rule?.id ?? null,
    pricing_status: result.pricingStatus,
    price_calculated_at: now,
    reason: result.reason,
  };
}

export function pushDemoAudit(entry: {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): void {
  audits = [
    {
      id: crypto.randomUUID(),
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
      created_at: new Date().toISOString(),
    },
    ...audits,
  ];
}

export function listDemoAuditsForTrip(tripId: string): DemoAuditEntry[] {
  return audits.filter((a) => a.entity_id === tripId);
}

export function recordDemoPriceOverride(input: {
  tripId: string;
  oldPrice: number | null;
  newPrice: number;
  changedBy: string | null;
  reason: string;
}): PricingHistory {
  const row: PricingHistory = {
    id: crypto.randomUUID(),
    trip_id: input.tripId,
    old_price: input.oldPrice,
    new_price: input.newPrice,
    changed_by: input.changedBy,
    changed_at: new Date().toISOString(),
    reason: input.reason,
  };
  history = [row, ...history];
  pushDemoAudit({
    userId: input.changedBy,
    action: AUDIT_ACTIONS.manualOverride,
    entityType: "trip",
    entityId: input.tripId,
    metadata: { new_price: input.newPrice, reason: input.reason },
  });
  return row;
}

export function listDemoPricingHistory(tripId: string): PricingHistory[] {
  return history.filter((h) => h.trip_id === tripId);
}

export function applyDemoPricingToTrip(
  trip: Trip,
  userId: string | null,
  mode: "create" | "recalculate"
): Trip {
  if (
    trip.price_locked ||
    trip.status === "approved" ||
    trip.status === "invoiced"
  ) {
    return trip;
  }

  const priced = calculateDemoTripPrice({
    companyId: trip.company_id,
    pickupArea: trip.pickup_area,
    destinationArea: trip.destination_area,
    areasVisited: trip.areas_visited,
    passengers: trip.passengers,
    vehicleId: trip.vehicle_id,
  });

  const next: Trip = {
    ...trip,
    calculated_price: priced.calculated_price,
    pricing_rule_id: priced.pricing_rule_id,
    pricing_status: priced.pricing_status,
    price_calculated_at: priced.price_calculated_at,
  };

  if (mode === "create") {
    pushDemoAudit({
      userId,
      action: AUDIT_ACTIONS.tripCreated,
      entityType: "trip",
      entityId: trip.id,
      metadata: { status: trip.status },
    });
    pushDemoAudit({
      userId,
      action: AUDIT_ACTIONS.priceCalculated,
      entityType: "trip",
      entityId: trip.id,
      metadata: {
        pricing_status: priced.pricing_status,
        calculated_price: priced.calculated_price,
        pricing_rule_id: priced.pricing_rule_id,
        reason: priced.reason,
      },
    });
  } else {
    pushDemoAudit({
      userId,
      action: AUDIT_ACTIONS.priceRecalculated,
      entityType: "trip",
      entityId: trip.id,
      metadata: {
        pricing_status: priced.pricing_status,
        old_price: trip.calculated_price,
        new_price: priced.calculated_price,
        pricing_rule_id: priced.pricing_rule_id,
        reason: priced.reason,
      },
    });
  }

  return next;
}
