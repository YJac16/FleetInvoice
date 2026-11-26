import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AUTHENTICATED_CLIENT_RPCS } from "../../scripts/db/00060-client-rpc-allowlist.mjs";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const strip = (t: string) => t.replace(/--[^\n]*/g, "");
const sql = strip(read("supabase/migrations/00102_self_serve_invoice_bill_to.sql"));
const rollback = strip(read("supabase/rollback-00102.sql"));

function fn(name: string): string {
  const s = sql.indexOf(`create or replace function public.${name}(`);
  expect(s, name).toBeGreaterThan(-1);
  return sql.slice(s, sql.indexOf("$$;", sql.indexOf("$$", s) + 2) + 3);
}

describe("migration 00102 (self-serve bill-to, was 00070)", () => {
  it("is the only 00102 file and 00070 stays route_price_templates", () => {
    const files = readdirSync(path.join(root, "supabase/migrations"));
    expect(files.filter((f) => f.startsWith("00102_"))).toEqual([
      "00102_self_serve_invoice_bill_to.sql",
    ]);
    expect(files.filter((f) => f.startsWith("00070_"))).toEqual([
      "00070_route_price_templates.sql",
    ]);
  });

  it("is transactional and records the renumbering", () => {
    expect(sql).toMatch(/^\s*begin;/);
    expect(sql).toMatch(/commit;\s*$/);
    expect(read("docs/migrations/SKIPPED.md")).toMatch(/#69.*00070.*\*\*00102\*\*/);
  });

  it.each(["set_org_invoice_bill_to", "get_org_invoice_bill_to"])(
    "%s is SECURITY DEFINER with a pinned search_path and no anon/public execute",
    (name) => {
      const body = fn(name);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = pg_catalog, public/);
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`)
      );
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`)
      );
      expect(AUTHENTICATED_CLIENT_RPCS).toContain(name);
    }
  );

  it("setter is org-admin only (platform_owner via is_platform_owner(), no manager)", () => {
    const body = fn("set_org_invoice_bill_to");
    expect(body).toContain("public.is_platform_owner()");
    expect(body).toMatch(/has_org_role_names\(\s*p_organisation_id,\s*array\['organisation_admin'\]\s*\)/);
    expect(body).not.toMatch(/'manager'|'finance'|'supervisor'/);
    expect(body).toMatch(/auth\.uid\(\) is null/);
  });

  it("only re-targets DRAFT driver-week invoices, never pricing", () => {
    const body = fn("set_org_invoice_bill_to");
    expect(body).toMatch(/i\.status = 'draft'/);
    expect(body).toMatch(/i\.driver_id is not null/);
    expect(body).toMatch(/set company_id = p_company_id,\s*updated_at/);
    expect(body).not.toMatch(/amount|total|price|rate/i);
  });

  it("is additive: no policies, triggers, grants to roles, or platform_owner membership", () => {
    expect(sql).not.toMatch(/create\s+policy|drop\s+policy|create\s+trigger|alter\s+table|drop\s+function/i);
    expect(sql).not.toMatch(/platform_owner'/);
  });

  it("rollback exists, is transactional and drops exactly what 00102 adds", () => {
    expect(existsSync(path.join(root, "supabase/rollback-00102.sql"))).toBe(true);
    expect(rollback).toMatch(/^\s*begin;/);
    expect(rollback).toMatch(/commit;\s*$/);
    const created = [...sql.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    const dropped = [...rollback.matchAll(/drop function if exists public\.(\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(["get_org_invoice_bill_to", "set_org_invoice_bill_to"]);
    expect(dropped.sort()).toEqual(created.sort());
    expect(rollback).not.toMatch(/drop (table|policy|trigger)|delete from|update /i);
  });
});
