import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "supabase/migrations");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00085_finance_writes_admin_only.sql");
const rollback = read("supabase/rollback-00085.sql");

const FUNCS = [
  "apply_company_trip_rate",
  "earliest_unbilled_trip_date",
  "list_archived_rate_cards",
  "generate_period_invoice",
  "generate_driver_weekly_invoice",
  "generate_weekly_fuel_invoice",
  "set_invoice_status",
  "update_draft_invoice_line",
  "update_invoice_line_area",
  "generate_payroll_run",
  "finalize_payroll_run",
  "void_payroll_run",
];
const POLICIES: Array<[string, string]> = [
  ["invoices", "invoices_update"],
  ["rate_cards", "rate_cards_insert"],
  ["rate_cards", "rate_cards_update"],
  ["route_prices", "route_prices_insert"],
  ["route_prices", "route_prices_update"],
  ["pay_rates", "pay_rates_insert"],
  ["pay_rates", "pay_rates_update"],
];
const FINANCE_TABLES = ["invoices", "invoice_lines", "rate_cards", "route_prices", "pay_rates", "payroll_runs", "payroll_lines"];

const code = (t: string) => t.replace(/--[^\n]*/g, "");
const earlier = readdirSync(dir)
  .filter((f) => /^\d+.*\.sql$/.test(f) && f < "00085")
  .sort()
  .map((f) => code(readFileSync(path.join(dir, f), "utf8")));

const fnRe = (name: string) => new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;\\n`, "g");
const polRe = (table: string, name: string) =>
  new RegExp(`drop policy if exists ${name} on public\\.${table};\\ncreate policy ${name} on public\\.${table}[\\s\\S]*?\\);\\n`, "g");
function lastMatch(texts: string[], re: () => RegExp): string {
  let found: string | null = null;
  for (const t of texts) for (const m of t.matchAll(re())) found = m[0];
  if (!found) throw new Error(`not found: ${re().source.slice(0, 60)}`);
  return found;
}
const narrow = (t: string) =>
  t.replace(/array\['organisation_admin', 'manager'(, 'dispatcher')?(, 'supervisor')?\]/g, "array['organisation_admin', 'manager']");

describe("00085 finance writes + RPCs admin/manager only", () => {
  it("has no dispatcher or supervisor outside comments", () => {
    expect(code(sql)).not.toMatch(/dispatcher|supervisor/);
    expect(code(sql)).toMatch(/^\s*begin;/m);
    expect(code(sql)).toMatch(/commit;\s*$/);
  });

  it("recreates exactly the listed functions and policies", () => {
    const fns = [...code(sql).matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]).sort();
    expect(fns).toEqual([...FUNCS].sort());
    const pols = [...code(sql).matchAll(/create policy (\w+)/g)].map((m) => m[1]).sort();
    expect(pols).toEqual(POLICIES.map(([, n]) => n).sort());
    expect(code(sql)).not.toMatch(/\b(grant|revoke|alter function|drop function)\b/i);
  });

  it.each(FUNCS)("%s = latest definition with only the role set narrowed", (name) => {
    const before = lastMatch(earlier, () => fnRe(name));
    const after = lastMatch([code(sql)], () => fnRe(name));
    expect(before).toMatch(/'dispatcher'|'supervisor'/);
    expect(after).toBe(narrow(before));
    expect(after).toMatch(/security definer/i);
    expect(after).toContain("public.is_platform_owner()");
  });

  it.each(POLICIES)("policy on %s %s = latest definition with only the role set narrowed", (table, name) => {
    const before = lastMatch(earlier, () => polRe(table, name));
    const after = lastMatch([code(sql)], () => polRe(table, name));
    expect(before).toContain("'dispatcher'");
    expect(after).toBe(narrow(before));
  });

  it("company_manager branches inside the fuel invoice / line-area RPCs are kept", () => {
    for (const name of ["generate_weekly_fuel_invoice", "update_invoice_line_area"]) {
      expect(lastMatch([code(sql)], () => fnRe(name))).toContain("array['company_manager']");
    }
  });

  it("no other finance function or finance write policy still admits dispatcher/supervisor after 00085", () => {
    const all = [...earlier, code(sql)];
    const latestFns = new Map<string, string>();
    for (const t of all) for (const m of t.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\n\$\$;\n/g)) latestFns.set(m[1]!, m[0]);
    const offenders = [...latestFns]
      .filter(([, body]) => FINANCE_TABLES.some((tb) => new RegExp(`public\\.${tb}\\b`).test(body)))
      .filter(([, body]) => /array\[[^\]]*'(dispatcher|supervisor)'[^\]]*\]/.test(body.replace(/and not public\.has_org_role_names\([^)]*\)/g, "")))
      .map(([n]) => n);
    expect(offenders).toEqual([]);

    const latestPols = new Map<string, string>();
    for (const t of all)
      for (const m of t.matchAll(/create policy (\w+) on public\.(\w+)[\s\S]*?\);\n/g)) latestPols.set(`${m[2]}.${m[1]}`, m[0]);
    const polOffenders = [...latestPols]
      .filter(([k]) => FINANCE_TABLES.includes(k.split(".")[0]!) && !k.endsWith("_select"))
      .filter(([, body]) => /'(dispatcher|supervisor)'/.test(body))
      .map(([k]) => k);
    expect(polOffenders).toEqual([]);
  });

  it("rollback restores every object's previous definition", () => {
    for (const name of FUNCS) {
      expect(lastMatch([code(rollback)], () => fnRe(name))).toBe(lastMatch(earlier, () => fnRe(name)));
    }
    for (const [table, name] of POLICIES) {
      expect(lastMatch([code(rollback)], () => polRe(table, name))).toBe(lastMatch(earlier, () => polRe(table, name)));
    }
  });
});
