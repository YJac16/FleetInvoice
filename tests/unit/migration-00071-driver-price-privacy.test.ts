import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(
    path.resolve(__dirname, "../.."),
    "supabase/migrations/00071_driver_price_privacy_and_stops.sql"
  ),
  "utf8"
);

describe("migration 00071 driver price privacy and stops", () => {
  it("hides price columns and rate lookups from drivers", () => {
    expect(sql).toMatch(
      /revoke select \(manual_unit_price, manual_price_area_key\)/i
    );
    expect(sql).toMatch(/revoke select \(unit_price, total_amount\)/i);
    expect(sql).toMatch(/list_fuel_amounts_for_staff/);
    expect(sql).toMatch(/if not public\.staff_can_manage_trips\(p_organisation_id\)/);
    expect(sql).not.toMatch(
      /staff_can_manage_trips\(p_organisation_id\)\s+or public\.has_org_role_names\(p_organisation_id, array\['driver'\]\)/
    );
    expect(sql).toMatch(/array\['driver', 'employee'\]/);
    expect(sql).toMatch(/t\.manual_unit_price := null/);
  });

  it("adds ordered stops without rewriting existing rows", () => {
    expect(sql).toMatch(/add column if not exists route_stops jsonb/);
    expect(sql).toMatch(/trip_is_multi_stop/);
    expect(sql).toMatch(/No company or route price is applied/);
    expect(sql).toMatch(/format_route_stop_area/);
    expect(sql).not.toMatch(/update public\.trips\s+set route_stops/i);
    expect(sql).not.toMatch(/update public\.rate_cards/i);
  });

  it("flags typed places and keeps map matches inside the Cape Town box", () => {
    expect(sql).toMatch(/propose_service_location/);
    expect(sql).toMatch(/needs_review/);
    expect(sql).toMatch(/between -34\.50 and -32\.90/);
    expect(sql).toMatch(/between 17\.95 and 19\.45/);
    expect(sql).toMatch(/outside the Cape Town service area/);
  });
});
