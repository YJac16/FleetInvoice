import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00081_finance_select_exclude_supervisor.sql");
const rollback = read("supabase/rollback-00081.sql");
const m00057 = read("supabase/migrations/00057_company_portal_phase1_isolation.sql");

const code = (t: string) => t.replace(/--[^\n]*/g, "");
const squash = (t: string) => code(t).replace(/\s+/g, " ").trim();

function policy(text: string, name: string): string {
  const m = code(text).match(new RegExp(`create policy ${name} on [\\s\\S]*?\\);\\n`, "i"));
  if (!m) throw new Error(`policy ${name} not found`);
  return squash(m[0]);
}

describe("00081 finance select excludes supervisor", () => {
  it("is wrapped in a transaction and only touches the three select policies", () => {
    expect(code(sql)).toMatch(/^\s*begin;/m);
    expect(code(sql)).toMatch(/commit;\s*$/);
    const created = [...code(sql).matchAll(/create policy (\w+)/gi)].map((m) => m[1]).sort();
    expect(created).toEqual(["invoice_lines_select", "invoices_select", "route_prices_select"]);
    expect(code(sql)).not.toMatch(/create (or replace )?function/i);
    expect(code(sql)).not.toMatch(/rate_cards|pay_rates|payroll/i);
  });

  it("route_prices_select: platform owner or admin/manager/dispatcher (no supervisor)", () => {
    const p = policy(sql, "route_prices_select");
    expect(p).toContain("public.is_platform_owner()");
    expect(p).toContain("array['organisation_admin', 'manager', 'dispatcher']");
    expect(p).not.toContain("supervisor");
  });

  it.each(["invoices_select", "invoice_lines_select"])(
    "%s differs from 00057 only by 'supervisor' in the NOT list",
    (name) => {
      const before = policy(m00057, name);
      const after = policy(sql, name);
      expect(after).toBe(
        before.replace("array['driver', 'employee']", "array['driver', 'employee', 'supervisor']")
      );
      expect(after).not.toBe(before);
      // company_manager branch and the ops branch are kept.
      expect(after).toContain("company_user_can_see");
      expect(after).toContain("array['organisation_admin', 'manager', 'dispatcher']");
    }
  );

  it("rollback restores 00057 invoice policies and 00070 route_prices_select", () => {
    for (const name of ["invoices_select", "invoice_lines_select"]) {
      expect(policy(rollback, name)).toBe(policy(m00057, name));
    }
    const m00070 = read("supabase/migrations/00070_route_price_templates.sql");
    expect(policy(rollback, "route_prices_select")).toBe(policy(m00070, "route_prices_select"));
  });
});
