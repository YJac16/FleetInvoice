import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const code = (t: string) => t.replace(/--[^\n]*/g, "");
const fnRe = /create or replace function public\.generate_period_invoice\([\s\S]*?\n\$\$;\n/;

const m85 = code(read("supabase/migrations/00085_finance_writes_admin_only.sql")).match(fnRe)![0];
const sql = code(read("supabase/migrations/00101_period_invoice_owner_stamp.sql"));
const fn = sql.match(fnRe)![0];
const rollback = code(read("supabase/rollback-00101.sql"));

describe("00101 period invoice owner stamp", () => {
  it("is wrapped in begin/commit and only redefines generate_period_invoice", () => {
    expect(sql).toMatch(/^\s*begin;/m);
    expect(sql).toMatch(/commit;\s*$/);
    expect([...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])).toEqual([
      "generate_period_invoice",
    ]);
    expect(sql).not.toMatch(/\b(grant|revoke|drop function|alter function)\b/i);
  });

  it("keeps signature, security definer and auth; pins search_path", () => {
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = pg_catalog, public");
    expect(fn).toContain("array['organisation_admin', 'manager']");
    expect(fn).toContain("public.is_platform_owner()");
    expect(fn).toContain("returns public.invoices");
  });

  it("keeps idempotent early return, draft insert and issued final status", () => {
    expect(fn).toMatch(/if found then\s+return existing;/);
    expect(fn).toMatch(/'draft',\s+auth\.uid\(\)/);
    expect(fn).toMatch(/status = 'issued'/);
    expect(fn).toContain("issued_at = timezone('utc', now())");
  });

  it("stamps owner_tag only in the final update, from drivers only", () => {
    const final = fn.slice(fn.lastIndexOf("update public.invoices"));
    expect(final).toContain("owner_tag = v_owner_tag");
    expect(fn).toContain("left join public.drivers d");
    expect(fn).not.toMatch(/v\.owner_tag|c\.owner_tag/);
    expect(fn).toContain("count(*) = 0 then null");
    expect(fn).toContain("d.owner_tag is null) > 0 then null");
    expect(fn).toContain("count(distinct d.owner_tag) = 1 then min(d.owner_tag)");
  });

  it("differs from 00085 only by search_path pin, v_owner_tag and the stamp", () => {
    const back = fn
      .replace("set search_path = pg_catalog, public", "set search_path = public")
      .replace("  v_owner_tag text;\n", "")
      .replace(/(  \n)+  select case\n[\s\S]*?and il\.line_type = 'trip';\n\n/, "")
      .replace("issued_at = timezone('utc', now()),\n      owner_tag = v_owner_tag", "issued_at = timezone('utc', now())");
    expect(back).toBe(m85);
  });

  it("rollback restores the 00085 definition exactly", () => {
    expect(rollback.match(fnRe)![0]).toBe(m85);
    expect(rollback).toContain("set search_path = public\n");
  });

  it("generate_driver_weekly_invoice is not touched", () => {
    expect(sql).not.toContain("generate_driver_weekly_invoice");
  });
});
