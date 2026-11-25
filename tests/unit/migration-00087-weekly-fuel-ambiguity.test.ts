import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const code = (t: string) => t.replace(/--[^\n]*/g, "");
const norm = (t: string) => t.replace(/\s+/g, " ");
const fnOf = (sql: string) => {
  const s = sql.indexOf("create or replace function public.generate_weekly_fuel_invoice(");
  const e = sql.indexOf("$$;", s);
  return code(sql.slice(s, e + 3));
};

const m87 = read("supabase/migrations/00087_fix_weekly_fuel_invoice_ambiguity.sql");
const rb87 = read("supabase/rollback-00087.sql");
const m85 = read("supabase/migrations/00085_finance_writes_admin_only.sql");
const f87 = fnOf(m87);
const f85 = fnOf(m85);

describe("00087 generate_weekly_fuel_invoice ambiguity fix", () => {
  it("is wrapped in a transaction and recreates only this function", () => {
    expect(code(m87)).toMatch(/^\s*begin;/);
    expect(code(m87).trim()).toMatch(/commit;$/);
    expect(code(m87).match(/create or replace function/g)).toHaveLength(1);
  });

  it("has no variable colliding with invoices.period_end and qualifies the column", () => {
    expect(f87).not.toMatch(/^\s*period_end\s+date;/m);
    expect(f87).not.toMatch(/=\s*period_end\b/);
    expect(f87).not.toMatch(/(?<![\w])period_end\s*:=/);
    expect(f87).not.toMatch(/\bperiod_end::/);
    expect(f87).toMatch(/v_period_end date;/);
    expect(f87).toMatch(/and i\.period_end = v_period_end/);
    // the bug is real: 00085 compares the column to the same-named variable
    expect(f85).toMatch(/^\s*period_end date;/m);
    expect(f85).toMatch(/and i\.period_end = period_end/);
  });

  it("keeps signature, return type, SECURITY DEFINER and search_path", () => {
    expect(norm(f87)).toContain("p_organisation_id uuid, p_company_id uuid, p_week_start date )");
    expect(f87).toMatch(/returns public\.invoices/);
    expect(f87).toMatch(/security definer/);
    expect(f87).toMatch(/set search_path = public\n/);
  });

  it("keeps the 00085 admin/manager/platform-owner check (no dispatcher/supervisor)", () => {
    expect(f87).toMatch(/public\.is_platform_owner\(\)/);
    expect(f87).toMatch(/array\['organisation_admin', 'manager'\]/);
    expect(f87).toMatch(/array\['company_manager'\]\)\s+and public\.has_company_scope/);
    expect(f87).not.toMatch(/dispatcher|supervisor/);
    expect(f87).toMatch(/raise exception 'Not authorised to generate invoices'/);
  });

  it("differs from the 00085 body only by the variable rename", () => {
    const back = f87.replace(/v_period_end/g, "period_end");
    expect(norm(back)).toBe(norm(f85));
  });

  it("rollback-00087 restores the 00085 definition", () => {
    expect(norm(fnOf(rb87))).toBe(norm(f85));
    expect(code(rb87)).toMatch(/begin;[\s\S]*commit;/);
  });
});
