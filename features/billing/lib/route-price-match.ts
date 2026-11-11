/**
 * Route-price template matching.
 *
 * Keep this in lockstep with supabase/migrations/00070_route_price_templates.sql
 * (`normalize_route_place`, `split_route_stops`, `resolve_route_price` scores).
 *
 * Exact route (both directions when marked) beats a fixed-end list, which beats
 * "every stop is in this area", which beats "either end is one of these places",
 * which beats a company-wide flat template.
 */

export const ROUTE_PLACE_ALIASES: Record<string, string> = {
  ctia: "airport",
  "cape town international": "airport",
  "cape town international airport": "airport",
  "cpt airport": "airport",
  "ss waterfront": "southern sun waterfront",
  "s s waterfront": "southern sun waterfront",
  "cloud 9": "cloud nine",
  "garden court vj": "garden court victoria junction",
  gcvj: "garden court victoria junction",
  "waterside va": "waterside v and a",
  "waterside v a": "waterside v and a",
  "commodore hotel": "commodore",
  "harbour house": "harbour house camps bay",
};

export type RoutePriceMatchKind =
  | "exact"
  | "anchor"
  | "within"
  | "either"
  | "company";

export type RoutePriceRule = {
  id: string;
  matchKind: RoutePriceMatchKind;
  /** Human place names. Normalized at match time. Exact routes list every stop in order. */
  stops: string[];
  anchorPlace: string | null;
  /** Other end (anchor), or the area / place list (within, either). */
  places: string[];
  bidirectional: boolean;
  unitAmount: number;
  priority: number;
  label: string;
  active?: boolean;
};

export function normalizeRoutePlace(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/['’]/g, "");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.startsWith("the ")) s = s.slice(4);
  s = s.replace(/\brd\b/g, "road");
  s = s.replace(/\bst\b/g, "street");
  return ROUTE_PLACE_ALIASES[s] ?? s;
}

/** Split a route label into stops. Arrows win, then " / ", then the word "to". */
export function splitRouteStops(area: string): string[] {
  const raw = area ?? "";
  let parts: string[];
  if (/(?:→|->|-->|—>|–>)/.test(raw)) {
    parts = raw.split(/\s*(?:→|->|-->|—>|–>)\s*/);
  } else if (raw.includes(" / ")) {
    parts = raw.split(/\s*\/\s*/);
  } else if (/\sto\s/i.test(raw)) {
    parts = raw.split(/\s+to\s+/i);
  } else {
    parts = [raw];
  }
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function routeAreaKey(area: string): string {
  return splitRouteStops(area)
    .map(normalizeRoutePlace)
    .filter(Boolean)
    .join("|");
}

function normalizedList(values: string[]): string[] {
  return values.map(normalizeRoutePlace).filter(Boolean);
}

function sameStops(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((stop, index) => stop === right[index]);
}

/**
 * Higher is a closer match. Null means the rule does not apply.
 * 300+ exact, 200 anchor, 100 within, 50 either, 10 company flat.
 */
export function scoreRoutePrice(rule: RoutePriceRule, stops: string[]): number | null {
  if (rule.active === false) return null;
  if (rule.matchKind === "company") return 10;

  if (stops.length < 2) return null;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;

  if (rule.matchKind === "exact") {
    const want = normalizedList(rule.stops);
    if (want.length < 2) return null;
    const forward = sameStops(stops, want);
    const reverse = rule.bidirectional && sameStops(stops, [...want].reverse());
    if (!forward && !reverse) return null;
    return 300 + want.length * 10;
  }

  if (rule.matchKind === "anchor") {
    const anchor = normalizeRoutePlace(rule.anchorPlace ?? "");
    const members = new Set(normalizedList(rule.places));
    if (!anchor || members.size === 0) return null;
    const forward = first === anchor && members.has(last);
    const reverse = rule.bidirectional && last === anchor && members.has(first);
    if (!forward && !reverse) return null;
    return 200;
  }

  if (rule.matchKind === "within") {
    const members = new Set(normalizedList(rule.places));
    if (members.size === 0) return null;
    if (!stops.every((stop) => members.has(stop))) return null;
    return 100;
  }

  if (rule.matchKind === "either") {
    const members = new Set(normalizedList(rule.places));
    if (members.size === 0) return null;
    if (!members.has(first) && !members.has(last)) return null;
    return 50;
  }

  return null;
}

export function matchRoutePrice(
  rules: RoutePriceRule[],
  areaText: string
): RoutePriceRule | null {
  const stops = splitRouteStops(areaText).map(normalizeRoutePlace).filter(Boolean);
  let best: { rule: RoutePriceRule; score: number } | null = null;
  for (const rule of rules) {
    const score = scoreRoutePrice(rule, stops);
    if (score == null) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && rule.priority > best.rule.priority) ||
      (score === best.score &&
        rule.priority === best.rule.priority &&
        rule.label.localeCompare(best.rule.label) < 0)
    ) {
      best = { rule, score };
    }
  }
  return best?.rule ?? null;
}

export function moneyEqual(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

/**
 * A route template replaces the rate card only when its amount differs.
 * An equal amount stays on the rate card so effective-dating is unchanged.
 */
export function chooseTripUnitPrice(input: {
  routeAmount: number | null;
  rateCardAmount: number | null;
}): { amount: number | null; source: "route_price" | "rate_card" | "none" } {
  const { routeAmount, rateCardAmount } = input;
  if (
    routeAmount != null &&
    rateCardAmount != null &&
    !moneyEqual(routeAmount, rateCardAmount)
  ) {
    return { amount: routeAmount, source: "route_price" };
  }
  if (rateCardAmount != null) {
    return { amount: rateCardAmount, source: "rate_card" };
  }
  if (routeAmount != null) {
    return { amount: routeAmount, source: "route_price" };
  }
  return { amount: null, source: "none" };
}
