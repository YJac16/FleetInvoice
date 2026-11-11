import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTE_PLACE_ALIASES } from "@/features/billing/lib/route-price-match";

const root = path.resolve(__dirname, "../..");
const sql = readFileSync(
  path.join(root, "supabase/migrations/00070_route_price_templates.sql"),
  "utf8"
);

describe("migration 00070 route price templates", () => {
  it("stores org-scoped defaults and keeps them editable under RLS", () => {
    expect(sql).toMatch(/create table if not exists public\.route_prices/);
    expect(sql).toMatch(/organisation_id uuid not null/);
    expect(sql).toMatch(/company_id uuid not null/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/route_prices_select/);
    expect(sql).toMatch(/route_prices_insert/);
    expect(sql).toMatch(/route_prices_update/);
    expect(sql).toMatch(/organisation_admin', 'manager', 'dispatcher'/);
  });

  it("pre-fills from a route template and leaves an empty override reason", () => {
    expect(sql).toMatch(/suggest_trip_unit_price/);
    expect(sql).toMatch(/resolve_route_price/);
    expect(sql).toMatch(/v_price_overridden := true/);
    expect(sql).toMatch(/v_override_reason := null/);
    expect(sql).toMatch(/when v_price_changed then null else line\.override_reason/);
    expect(sql).toMatch(/reprice_on_next_sync/);
  });

  it("does not rewrite rate cards or existing invoice totals in the seed", () => {
    expect(sql).toMatch(/Seed does not update rate_cards or invoice lines/);
    expect(sql).not.toMatch(/update\s+public\.rate_cards/i);
    expect(sql).not.toMatch(/update\s+public\.invoice_lines\s+il\b/i);
    expect(sql).toMatch(/priced_area_key is null/);
  });

  it("keeps place aliases aligned with the TypeScript matcher", () => {
    for (const alias of Object.keys(ROUTE_PLACE_ALIASES)) {
      expect(sql).toContain(`when '${alias}'`);
    }
  });

  it("seeds the 11 Nov 2026 reference prices without inventing amounts", () => {
    const expected = [
      ["fadia", "Airport ↔ listed hotels", "410"],
      ["fadia", "Crystal Towers ↔ Airport", "430"],
      ["fadia", "Restaurant run (Tang or Waterside V&A)", "500"],
      ["fadia", "Radisson Blu → Black River Park", "500"],
      ["fadia", "AC Marriott Waterfront ↔ Airport or Black River Park", "590"],
      ["fadia", "Bridge Park → Crystal Towers", "590"],
      ["fadia", "Harbour House Camps Bay → Southern Sun Waterfront → Crystal Towers", "640"],
      ["fadia", "Bridge Park → Protea North Wharf", "660"],
      ["fadia", "Waterside V&A → 29 Queens Road Sea Point", "660"],
      ["fadia", "Black River Park → Radisson Blu", "1180"],
      ["fadia", "WNS Claremont → 29 Queens Road Sea Point", "1500"],
      ["fadia", "CTIA → Garden Court Victoria Junction", "390"],
      ["fadia", "Cloud 9 → River Manor Stellenbosch", "390"],
      ["fadia", "CTIA → De Wijnlanden", "715"],
      ["yaseen", "Airport → The Commodore", "390"],
      ["yaseen", "Airport → Protea Sea Point", "410"],
      ["yaseen", "Cloud Nine → Cape Town Station", "410"],
      ["yaseen", "Airport → Garden Court Victoria Junction", "390"],
      ["yaseen", "Observatory → Airport", "605"],
      ["yaseen", "Claremont ↔ Crystal Towers", "430"],
      ["yaseen", "Century City ↔ Protea North Wharf", "430"],
      ["yaseen", "Southern Sun Waterfront → Claremont", "430"],
      ["yaseen", "Century City ↔ Teleperformance Woodstock", "300"],
      ["yaseen", "Century City ↔ Protea", "300"],
      ["yaseen", "Any route (flat template)", "300"],
    ] as const;

    for (const [org, label, amount] of expected) {
      expect(sql).toContain(`'${org}'`);
      expect(sql).toContain(`'${label}'`);
      expect(sql).toContain(`, ${amount},`);
    }
    expect(sql.match(/Any route \(flat template\)/g)?.length).toBe(4);
  });
});
