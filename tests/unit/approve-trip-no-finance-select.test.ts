/**
 * Demo QA6: 00081 removes dispatcher/supervisor SELECT on invoices,
 * invoice_lines and route_prices. Approving a driver trip with its pre-filled
 * price must not depend on the caller's SELECT on those tables (or on
 * rate_cards): the dialog only calls RPCs, and every function on the
 * approve / suggest path is SECURITY DEFINER.
 * DB-level proof: npm run test:finance-00081 (tests/db/finance-select-00081.test.mjs).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const FINANCE_TABLES = ["invoices", "invoice_lines", "rate_cards", "route_prices"];

/** Latest `create or replace function public.<name>` across the migration chain. */
function latestFunctions(): Map<string, { file: string; header: string; body: string }> {
  const dir = path.join(root, "supabase/migrations");
  const out = new Map<string, { file: string; header: string; body: string }>();
  for (const file of readdirSync(dir).filter((f) => /^\d+.*\.sql$/.test(f)).sort()) {
    const text = readFileSync(path.join(dir, file), "utf8");
    const re = /create or replace function public\.(\w+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi;
    for (const m of text.matchAll(re)) out.set(m[1]!, { file, header: m[2]!, body: m[3]! });
  }
  return out;
}

const fns = latestFunctions();
const isDefiner = (name: string) => /security definer/i.test(fns.get(name)?.header ?? "");

/** Functions reachable from `start` through public.<fn>( calls. */
function reachable(start: string): string[] {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const name = stack.pop()!;
    if (seen.has(name) || !fns.has(name)) continue;
    seen.add(name);
    const body = fns.get(name)!.body.replace(/--[^\n]*/g, "");
    for (const m of body.matchAll(/public\.(\w+)\s*\(/g)) stack.push(m[1]!);
  }
  return [...seen];
}

describe("approve path RPCs are SECURITY DEFINER", () => {
  it.each(["approve_driver_trip", "suggest_trip_unit_price"])(
    "%s and every function it reaches that touches a finance table",
    (entry) => {
      expect(fns.has(entry)).toBe(true);
      const touching = reachable(entry).filter((n) =>
        FINANCE_TABLES.some((t) => new RegExp(`public\\.${t}\\b`).test(fns.get(n)!.body))
      );
      expect(touching.length).toBeGreaterThan(0);
      const invokers = touching.filter((n) => !isDefiner(n));
      expect(invokers).toEqual([]);
    }
  );

  it("the price helpers are on the path", () => {
    expect(reachable("approve_driver_trip")).toEqual(
      expect.arrayContaining(["sync_staff_trip_invoice_line"])
    );
    expect(reachable("suggest_trip_unit_price")).toEqual(
      expect.arrayContaining(["resolve_route_price", "resolve_trip_line_rate"])
    );
  });

  it("approval is gated by staff_can_manage_trips (admin/manager), not by table SELECT", () => {
    expect(fns.get("approve_driver_trip")!.body).toMatch(/staff_can_manage_trips\(t\.organisation_id\)/);
    expect(fns.get("suggest_trip_unit_price")!.body).toMatch(/staff_can_manage_trips\(p_organisation_id\)/);
    const gate = fns.get("staff_can_manage_trips")!.body;
    expect(gate).toContain("array['organisation_admin', 'manager']");
    expect(gate).not.toContain("dispatcher");
  });
});

describe("approve dialog reads no finance table directly", () => {
  const dialog = read("features/trips/components/approve-driver-trip-dialog.tsx");
  const draft = read("features/billing/lib/use-trip-price-draft.ts");

  it("passes existingUnitPrice: null (no invoice_lines lookup)", () => {
    expect(dialog).toMatch(/existingUnitPrice:\s*null/);
    expect(dialog).not.toContain("getTripInvoiceUnitPrice");
  });

  it.each([
    ["approve dialog", dialog],
    ["useTripPriceDraft", draft],
  ])("%s has no .from(<finance table>) and no list/get of finance rows", (_n, src) => {
    for (const t of FINANCE_TABLES) expect(src).not.toContain(`from("${t}")`);
    expect(src).not.toMatch(/listRoutePrices|listRateCards|listInvoices|getTripInvoiceUnitPrice/);
  });

  it("the services it uses only call RPCs", () => {
    const fnBody = (file: string, name: string) => {
      const src = read(file);
      const start = src.indexOf(`export async function ${name}(`);
      expect(start).toBeGreaterThan(-1);
      const next = src.indexOf("\nexport ", start + 1);
      return src.slice(start, next === -1 ? undefined : next);
    };
    const approve = fnBody("services/driver-submitted-trips.service.ts", "approveDriverTrip");
    const suggest = fnBody("services/route-prices.service.ts", "suggestTripUnitPrice");
    expect(approve).toContain('rpc("approve_driver_trip"');
    expect(suggest).toContain('rpc("suggest_trip_unit_price"');
    for (const body of [approve, suggest]) expect(body).not.toMatch(/\.from\(/);
  });
});
