import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TRIP_COLUMNS } from "@/lib/trip-columns";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00079_hide_trip_prices_from_drivers.sql");
const rollback = read("supabase/rollback-00079.sql");

function tripsColumnsFromMigrations(): string[] {
  const dir = path.join(root, "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => /^\d+.*\.sql$/.test(f) && !f.startsWith("00079"))
    .sort();
  const cols: string[] = [];
  const add = (c: string) => {
    if (!cols.includes(c)) cols.push(c);
  };
  const stripComments = (t: string) => t.replace(/--[^\n]*/g, "");
  for (const f of files) {
    const text = stripComments(readFileSync(path.join(dir, f), "utf8"));
    const create = text.match(/create table (?:if not exists )?public\.trips\s*\(([\s\S]*?)\n\);/i);
    if (create) {
      for (const line of create[1].split("\n")) {
        const m = line.trim().match(/^([a-z_][a-z0-9_]*)\s+\S/i);
        if (m && !/^(constraint|primary|unique|check|foreign)$/i.test(m[1])) add(m[1]);
      }
    }
    for (const stmt of text.match(/alter table (?:only )?(?:if exists )?public\.trips\b[^;]*;/gi) ?? []) {
      for (const m of stmt.matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) add(m[1]);
      for (const m of stmt.matchAll(/drop column (?:if exists )?([a-z_][a-z0-9_]*)/gi)) {
        const i = cols.indexOf(m[1]);
        if (i >= 0) cols.splice(i, 1);
      }
    }
  }
  return cols;
}

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

  it("GRANT list = TRIP_COLUMNS = trips columns derived from migrations minus price columns", () => {
    const grant = sql.match(/grant select \(([\s\S]*?)\) on table public\.trips/)![1];
    const granted = grant.split(",").map((c) => c.trim());
    const client = TRIP_COLUMNS.split(",").map((c) => c.trim());
    const actual = tripsColumnsFromMigrations();
    const expected = actual.filter(
      (c) => c !== "manual_unit_price" && c !== "manual_price_area_key"
    );

    expect(actual).toContain("manual_unit_price");
    expect(actual).toContain("manual_price_area_key");
    expect(new Set(granted).size).toBe(granted.length);
    expect([...granted].sort()).toEqual([...expected].sort());
    expect([...client].sort()).toEqual([...expected].sort());
    // invoice_lines columns must not leak into the trips grant
    for (const c of ["trip_company_id", "priced_area_key", "rate_effective_on", "route_price_id"]) {
      expect(actual).not.toContain(c);
    }
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

describe("migration 00079 rate_cards_select", () => {
  it("drops supervisor but keeps the other readers", () => {
    expect(sql).toMatch(
      /create policy rate_cards_select[\s\S]*array\['organisation_admin','manager','dispatcher'\]/
    );
    const start = sql.indexOf("create policy rate_cards_select");
    const policy = sql.slice(start, sql.indexOf(");", start));
    expect(policy).not.toMatch(/supervisor/);
    expect(policy).toMatch(/is_platform_owner\(\)/);
    expect(policy).toMatch(/is_company_manager/);
  });

  it("rollback restores supervisor", () => {
    expect(rollback).toMatch(
      /array\['organisation_admin','manager','dispatcher','supervisor'\]/
    );
  });
});

describe("migration 00079 fuel_fillups_select", () => {
  const policy = sql.slice(sql.indexOf("create policy fuel_fillups_select"));

  it("keeps staff org-wide and limits drivers to their own fill-ups", () => {
    expect(policy).toMatch(/is_platform_owner\(\)/);
    expect(policy).toMatch(
      /array\['organisation_admin', 'manager', 'dispatcher', 'supervisor'\]/
    );
    expect(policy).toMatch(/driver_id = public\.current_driver_id\(organisation_id\)/);
    expect(policy).not.toMatch(/has_company_scope/);
  });

  it("rollback restores the company-scope branch", () => {
    expect(rollback).toMatch(/create policy fuel_fillups_select[\s\S]*has_company_scope/);
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
