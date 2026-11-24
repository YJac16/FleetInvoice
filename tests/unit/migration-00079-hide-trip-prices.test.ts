import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TRIP_COLUMNS } from "@/lib/trip-columns";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00079_hide_trip_prices_from_drivers.sql");
const rollback = read("supabase/rollback-00079.sql");

describe("migration 00079 hide trip prices", () => {
  it("suggest_trip_unit_price allows only staff who manage trips", () => {
    expect(sql).toMatch(/create or replace function public\.suggest_trip_unit_price/);
    expect(sql).toMatch(
      /if not public\.staff_can_manage_trips\(p_organisation_id\) then\s+raise exception 'Not authorised'/
    );
    expect(sql).not.toMatch(/array\['driver'\]/);
    expect(sql).toMatch(
      /grant execute on function public\.suggest_trip_unit_price\(uuid, uuid, text, date\) to authenticated/
    );
  });

  it("revokes the price columns from authenticated and never re-grants them", () => {
    expect(sql).toMatch(/revoke select on table public\.trips from authenticated/);
    expect(sql).toMatch(
      /revoke select \(manual_unit_price, manual_price_area_key\)\s+on table public\.trips from authenticated/
    );
    const grant = sql.slice(sql.indexOf("grant select ("));
    expect(grant).not.toMatch(/manual_unit_price|manual_price_area_key/);
    expect(grant).toMatch(/reprice_on_next_sync/);
  });

  it("grants exactly the columns the client selects", () => {
    const grant = sql.match(/grant select \(([\s\S]*?)\) on table public\.trips/)![1];
    const granted = grant.split(",").map((c) => c.trim()).sort();
    const client = TRIP_COLUMNS.split(",").map((c) => c.trim()).sort();
    expect(granted).toEqual(client);
    expect(client).not.toContain("manual_unit_price");
    expect(client).not.toContain("manual_price_area_key");
  });

  it("client trips selects no longer use *", () => {
    for (const f of [
      "services/driver-submitted-trips.service.ts",
      "services/staff-trips.service.ts",
      "services/attendance.service.ts",
      "services/trip-assignments.service.ts",
    ]) {
      expect(read(f)).toContain("TRIP_COLUMNS");
    }
    expect(read("services/attendance.service.ts")).not.toMatch(
      /\.select\("\*, routes:route_id/
    );
  });

  it("rollback restores the driver branch and the column grants", () => {
    expect(rollback).toMatch(/has_org_role_names\(p_organisation_id, array\['driver'\]\)/);
    expect(rollback).toMatch(/grant select on table public\.trips to authenticated/);
    expect(rollback).toMatch(
      /grant select \(manual_unit_price, manual_price_area_key\)/
    );
  });
});

describe("staff approve flow keeps pricing", () => {
  it("ApproveDriverTripDialog still uses the price draft and approveDriverTrip", () => {
    const src = read("features/trips/components/approve-driver-trip-dialog.tsx");
    expect(src).toMatch(/useTripPriceDraft/);
    expect(src).toMatch(/approveDriverTrip/);
    expect(src).toMatch(/applyUnitPrice/);
  });
});
