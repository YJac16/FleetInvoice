import { describe, expect, it } from "vitest";
import { TRIP_COLUMNS } from "@/lib/trip-columns";
import { TRIP_SELECT } from "@/services/trips.service";

/** Split on top-level commas (ignores commas inside embed parentheses). */
function topLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

describe("TRIP_SELECT (00079)", () => {
  const parts = topLevel(TRIP_SELECT);
  const cols = parts.filter((p) => !p.includes("("));
  const embeds = parts.filter((p) => p.includes("("));

  it("never uses * and never names the revoked price columns", () => {
    expect(TRIP_SELECT).not.toMatch(/(^|[\s,(])\*/);
    expect(TRIP_SELECT).not.toContain("manual_unit_price");
    expect(TRIP_SELECT).not.toContain("manual_price_area_key");
  });

  it("plain columns equal TRIP_COLUMNS", () => {
    expect(cols).toEqual(TRIP_COLUMNS.split(",").map((c) => c.trim()));
  });

  it("keeps routes, companies and trip_assignments embeds", () => {
    expect(embeds.some((e) => e.startsWith("routes:route_id"))).toBe(true);
    expect(embeds.some((e) => e.startsWith("companies:company_id"))).toBe(true);
    expect(embeds.some((e) => e.startsWith("trip_assignments("))).toBe(true);
  });
});
