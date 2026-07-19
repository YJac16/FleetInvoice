/**
 * Pure server-side pricing matcher.
 * Never import this module from client components.
 */

export interface PricingRuleMatchInput {
  companyId: string;
  pickupAreaId: string;
  destinationAreaId: string;
  /** Area UUIDs visited on the trip (order-independent). */
  areasVisitedIds: string[];
  passengers: number;
  vehicleId: string;
}

export interface MatchablePricingRule {
  id: string;
  company_id: string;
  pickup_area_id: string;
  destination_area_id: string;
  areas_visited: string[];
  minimum_passengers: number;
  maximum_passengers: number;
  vehicle_id: string | null;
  price: number;
  priority: number;
  active: boolean;
  updated_at?: string;
}

export interface PricingMatchResult {
  rule: MatchablePricingRule | null;
  price: number | null;
  reason: string;
  pricingStatus: "calculated" | "needs_pricing";
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

function areasEqual(a: string[], b: string[]): boolean {
  const left = sortedUnique(a);
  const right = sortedUnique(b);
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

/**
 * Find the best matching pricing rule.
 *
 * Match order:
 * Company → Pickup → Destination → Areas Visited → Passenger Range → Vehicle → Highest Priority
 *
 * Specific vehicle / areas_visited rules rank above wildcards before priority.
 */
export function matchPricingRule(
  rules: MatchablePricingRule[],
  input: PricingRuleMatchInput
): PricingMatchResult {
  const visited = sortedUnique(input.areasVisitedIds);

  const candidates = rules.filter((rule) => {
    if (!rule.active) return false;
    if (rule.company_id !== input.companyId) return false;
    if (rule.pickup_area_id !== input.pickupAreaId) return false;
    if (rule.destination_area_id !== input.destinationAreaId) return false;
    if (
      input.passengers < rule.minimum_passengers ||
      input.passengers > rule.maximum_passengers
    ) {
      return false;
    }
    if (rule.vehicle_id && rule.vehicle_id !== input.vehicleId) return false;

    const ruleAreas = rule.areas_visited ?? [];
    if (ruleAreas.length === 0) return true;
    return areasEqual(ruleAreas, visited);
  });

  if (candidates.length === 0) {
    return {
      rule: null,
      price: null,
      reason: "No matching pricing rule",
      pricingStatus: "needs_pricing",
    };
  }

  candidates.sort((a, b) => {
    const vehicleScore =
      Number(b.vehicle_id !== null) - Number(a.vehicle_id !== null);
    if (vehicleScore !== 0) return vehicleScore;

    const areasScore =
      Number((b.areas_visited?.length ?? 0) > 0) -
      Number((a.areas_visited?.length ?? 0) > 0);
    if (areasScore !== 0) return areasScore;

    if (b.priority !== a.priority) return b.priority - a.priority;

    const aUpdated = a.updated_at ?? "";
    const bUpdated = b.updated_at ?? "";
    return bUpdated.localeCompare(aUpdated);
  });

  const rule = candidates[0];
  const parts = [
    "Matched company, pickup, destination, passenger range",
    (rule.areas_visited?.length ?? 0) === 0
      ? "any areas visited"
      : "areas visited set",
    rule.vehicle_id ? "specific vehicle" : "any vehicle",
    `priority ${rule.priority}`,
  ];

  return {
    rule,
    price: Number(rule.price),
    reason: parts.join(", "),
    pricingStatus: "calculated",
  };
}

export function formatRuleLabel(ruleId: string | null | undefined): string {
  if (!ruleId) return "—";
  const short = ruleId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `Rule #${short}`;
}
