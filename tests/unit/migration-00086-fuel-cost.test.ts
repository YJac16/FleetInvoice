import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AUTHENTICATED_CLIENT_RPCS } from "../../scripts/db/00060-client-rpc-allowlist.mjs";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const strip = (t: string) => t.replace(/--[^\n]*/g, "");
const sql = strip(read("supabase/migrations/00086_fuel_cost_finance_only.sql"));
const rollback = strip(read("supabase/rollback-00086.sql"));
const m00007 = read("supabase/migrations/00007_phase5_fuel_and_invoices.sql");

function fn(text: string, name: string): string {
  const s = text.indexOf(`create or replace function public.${name}(`);
  expect(s).toBeGreaterThan(-1);
  return text.slice(s, text.indexOf("$$;", text.indexOf("$$", s) + 2) + 3);
}

describe("00086 fuel cost is finance only", () => {
  it("is transactional", () => {
    expect(sql).toMatch(/^\s*begin;/);
    expect(sql).toMatch(/commit;\s*$/);
    expect(rollback).toMatch(/^\s*begin;/);
    expect(rollback).toMatch(/commit;\s*$/);
  });

  it("revokes the money columns from authenticated and anon (and the table grant they hide behind)", () => {
    expect(sql).toMatch(
      /revoke select \(unit_price, total_amount, currency\)\s+on table public\.fuel_fillups from authenticated, anon;/
    );
    expect(sql).toMatch(/revoke select on table public\.fuel_fillups from authenticated, anon;/);
    const grant = sql.match(/grant select \(([\s\S]*?)\) on table public\.fuel_fillups to authenticated;/);
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    for (const c of ["unit_price", "total_amount", "currency"]) expect(cols).not.toContain(c);
    for (const c of ["id", "organisation_id", "driver_id", "odometer_km", "litres", "deleted_at"]) {
      expect(cols).toContain(c);
    }
  });

  it("the re-granted columns are every fuel_fillups column except the money ones", () => {
    const create = strip(m00007).match(/create table if not exists public\.fuel_fillups\s*\(([\s\S]*?)\n\);/)![1];
    const all = create
      .split("\n")
      .map((l) => l.trim().match(/^([a-z_][a-z0-9_]*)\s+\S/i)?.[1])
      .filter((c): c is string => !!c && !/^(constraint|primary|unique|check|foreign)$/i.test(c));
    const grant = sql.match(/grant select \(([\s\S]*?)\) on table public\.fuel_fillups/)![1];
    const cols = grant.split(",").map((c) => c.trim());
    expect([...cols].sort()).toEqual(
      all.filter((c) => !["unit_price", "total_amount", "currency"].includes(c)).sort()
    );
  });

  describe("list_fuel_fillup_amounts", () => {
    const body = fn(sql, "list_fuel_fillup_amounts");
    it("is a stable SECURITY DEFINER with a pinned search_path", () => {
      expect(body).toMatch(/returns table \(\s*id uuid,\s*unit_price numeric,\s*total_amount numeric,\s*currency text\s*\)/);
      expect(body).toMatch(/language plpgsql\s+stable\s+security definer\s+set search_path = pg_catalog, public/);
      expect(body).toMatch(/auth\.uid\(\) is null[\s\S]*Not authenticated/);
    });
    it("gives admin/manager/owner all rows", () => {
      expect(body).toMatch(
        /public\.is_platform_owner\(\)\s+or public\.has_org_role_names\(\s*p_organisation_id,\s*array\['organisation_admin', 'manager'\]\s*\) then\s+return query[\s\S]*?f\.organisation_id = p_organisation_id\s+and f\.deleted_at is null;/
      );
    });
    it("gives non-dispatcher/supervisor drivers own rows only, everyone else none", () => {
      expect(body).toMatch(
        /elsif not public\.has_org_role_names\(\s*p_organisation_id,\s*array\['dispatcher', 'supervisor'\]\s*\) then[\s\S]*?f\.driver_id = public\.current_driver_id\(p_organisation_id\);/
      );
      expect(body.match(/return query/g)).toHaveLength(2);
    });
    it("is not callable by public/anon", () => {
      expect(sql).toMatch(/revoke all on function public\.list_fuel_fillup_amounts\(uuid\) from public, anon;/);
      expect(sql).toMatch(/grant execute on function public\.list_fuel_fillup_amounts\(uuid\) to authenticated;/);
      expect(AUTHENTICATED_CLIENT_RPCS).toContain("list_fuel_fillup_amounts");
    });
  });

  describe("log_fuel_fillup", () => {
    const body = fn(sql, "log_fuel_fillup");
    it("keeps the 00007 definition apart from search_path and the mask", () => {
      const original = fn(m00007, "log_fuel_fillup");
      const stripped = body
        .replace("set search_path = pg_catalog, public", "set search_path = public")
        .replace(/\s*if not \(\s*public\.is_platform_owner\(\)[\s\S]*?end if;\n\n(?=\s*return row;)/, "\n");
      expect(stripped.replace(/\s+/g, " ")).toBe(original.replace(/\s+/g, " "));
    });
    it("masks money for non-finance, non-self-driver callers before returning", () => {
      expect(body).toMatch(
        /if not \(\s*public\.is_platform_owner\(\)\s+or public\.has_org_role_names\(\s*p_organisation_id,\s*array\['organisation_admin', 'manager'\]\s*\)\s+or is_self_driver\s*\) then\s+row\.unit_price := null;\s+row\.total_amount := null;\s+row\.currency := null;\s+end if;\s+return row;/
      );
    });
  });

  it("does not touch generate_weekly_fuel_invoice", () => {
    expect(sql).not.toMatch(/generate_weekly_fuel_invoice/);
  });

  describe("rollback-00086.sql", () => {
    it("restores the grants and drops the RPC", () => {
      expect(rollback).toMatch(/grant select \(unit_price, total_amount, currency\) on public\.fuel_fillups to authenticated;/);
      expect(rollback).toMatch(/drop function if exists public\.list_fuel_fillup_amounts\(uuid\);/);
    });
    it("restores the 00007 log_fuel_fillup verbatim", () => {
      expect(fn(rollback, "log_fuel_fillup").replace(/\s+/g, " ")).toBe(
        fn(m00007, "log_fuel_fillup").replace(/\s+/g, " ")
      );
    });
  });
});

describe("no client queries * on fuel_fillups", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      if (["node_modules", ".next", ".git", "tests", "supabase", "e2e"].includes(e)) continue;
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e)) out.push(p);
    }
    return out;
  }
  it("fuel_fillups is only read via the safe column list", () => {
    const users = walk(root).filter((f) => /["'`]fuel_fillups["'`]/.test(readFileSync(f, "utf8")));
    expect(users.map((f) => path.relative(root, f))).toEqual(["services/fuel-fillups.service.ts"]);
    const svc = read("services/fuel-fillups.service.ts");
    expect(svc).not.toMatch(/select\(\s*["'`]\*/);
    expect(svc).not.toMatch(/["'`]\*,/);
    const safe = svc.match(/FUEL_FILLUP_SAFE_COLUMNS =\s*"([^"]+)"/)![1];
    expect(safe).not.toMatch(/unit_price|total_amount|currency|\*/);
    expect(svc).toMatch(/FUEL_FILLUP_SELECT = `\$\{FUEL_FILLUP_SAFE_COLUMNS\}/);
  });
});
