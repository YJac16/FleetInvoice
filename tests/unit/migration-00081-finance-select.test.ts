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

describe("00081 finance select: admin/manager only", () => {
  it("is wrapped in a transaction and only touches the three select policies", () => {
    expect(code(sql)).toMatch(/^\s*begin;/m);
    expect(code(sql)).toMatch(/commit;\s*$/);
    const created = [...code(sql).matchAll(/create policy (\w+)/gi)].map((m) => m[1]).sort();
    expect(created).toEqual(["invoice_lines_select", "invoices_select", "route_prices_select"]);
    expect(code(sql)).not.toMatch(/create (or replace )?function/i);
    expect(code(sql)).not.toMatch(/rate_cards|pay_rates|payroll/i);
  });

  it("route_prices_select: platform owner or admin/manager only", () => {
    const p = policy(sql, "route_prices_select");
    expect(p).toContain("public.is_platform_owner()");
    expect(p).toContain("array['organisation_admin', 'manager']");
    expect(p).not.toMatch(/dispatcher|supervisor/);
  });

  it.each(["invoices_select", "invoice_lines_select"])(
    "%s: 00057 with dispatcher dropped from the ops list and dispatcher+supervisor added to the NOT list",
    (name) => {
      const before = policy(m00057, name);
      const after = policy(sql, name);
      expect(after).toBe(
        before
          .replace("array['organisation_admin', 'manager', 'dispatcher']", "array['organisation_admin', 'manager']")
          .replace("array['driver', 'employee']", "array['driver', 'employee', 'dispatcher', 'supervisor']")
      );
      expect(after).not.toBe(before);
      // company_manager branch unchanged.
      expect(after).toContain("when public.is_company_manager(");
      expect(after).toContain("company_user_can_see");
      // dispatcher only appears in the NOT list.
      expect(after.match(/dispatcher/g)).toHaveLength(1);
      expect(after).toMatch(/and not public\.has_org_role_names\( \w*\.?organisation_id, array\['driver', 'employee', 'dispatcher', 'supervisor'\] \)/);
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
