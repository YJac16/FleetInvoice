import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00084_finance_rate_cards_payrates_admin_only.sql");
const rollback = read("supabase/rollback-00084.sql");
const m00079 = read("supabase/migrations/00079_hide_trip_prices_from_drivers.sql");
const m00012 = read("supabase/migrations/00012_phase8_payroll.sql");

const code = (t: string) => t.replace(/--[^\n]*/g, "");
const squash = (t: string) => code(t).replace(/\s+/g, " ").trim();
function policy(text: string, name: string): string {
  const m = code(text).match(new RegExp(`create policy ${name} on [\\s\\S]*?\\);\\n`, "i"));
  if (!m) throw new Error(`policy ${name} not found`);
  return squash(m[0]);
}
const adminManagerOnly = (p: string) =>
  p
    .replace("array['organisation_admin','manager','dispatcher']", "array['organisation_admin','manager']")
    .replace("array['organisation_admin', 'manager', 'dispatcher']", "array['organisation_admin', 'manager']");

const LATEST: Record<string, string> = {
  rate_cards_select: m00079,
  pay_rates_select: m00012,
  payroll_runs_select: m00012,
  payroll_lines_select: m00012,
};

describe("00084 rate cards + pay rates / payroll SELECT: admin/manager only", () => {
  it("only recreates the four select policies, in a transaction", () => {
    const created = [...code(sql).matchAll(/create policy (\w+)/gi)].map((m) => m[1]).sort();
    expect(created).toEqual(Object.keys(LATEST).sort());
    expect(code(sql)).toMatch(/^\s*begin;/m);
    expect(code(sql)).toMatch(/commit;\s*$/);
    expect(code(sql)).not.toMatch(/create (or replace )?function|grant |revoke /i);
  });

  it.each(Object.keys(LATEST))("%s equals its latest definition with only dispatcher removed", (name) => {
    const before = policy(LATEST[name]!, name);
    const after = policy(sql, name);
    expect(after).toBe(adminManagerOnly(before));
    expect(after).not.toBe(before);
    expect(after).not.toMatch(/dispatcher|supervisor|'driver'|'employee'/);
    expect(after).toContain("public.is_platform_owner()");
  });

  it("rate_cards keeps the scoped company_manager branch", () => {
    expect(policy(sql, "rate_cards_select")).toContain(
      "or (public.is_company_manager(organisation_id) and company_id is not null and public.company_user_can_see(organisation_id, company_id))"
    );
  });

  it("00079 is the latest rate_cards_select before 00084 and already excludes supervisor", () => {
    expect(policy(m00079, "rate_cards_select")).not.toContain("supervisor");
    for (const later of [
      "supabase/migrations/00081_finance_select_exclude_supervisor.sql",
      "supabase/migrations/00082_delete_workshop_bill_supplier_audit.sql",
    ]) {
      expect(code(read(later))).not.toMatch(/rate_cards_select|pay_rates_select|payroll_runs_select|payroll_lines_select/);
    }
  });

  it.each(Object.keys(LATEST))("rollback restores %s exactly", (name) => {
    expect(policy(rollback, name)).toBe(policy(LATEST[name]!, name));
  });
});
