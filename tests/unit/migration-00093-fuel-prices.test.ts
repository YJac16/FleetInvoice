import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AUTHENTICATED_CLIENT_RPCS } from "../../scripts/db/00060-client-rpc-allowlist.mjs";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const strip = (t: string) => t.replace(/--[^\n]*/g, "");
const m93 = strip(read("supabase/migrations/00093_fuel_prices.sql"));
const m94 = strip(read("supabase/migrations/00094_fuel_fillup_price_lock.sql"));
const m95 = strip(read("supabase/migrations/00095_fuel_price_backfill.sql"));
const r93 = strip(read("supabase/rollback-00093.sql"));
const r94 = strip(read("supabase/rollback-00094.sql"));
const r95 = strip(read("supabase/rollback-00095.sql"));
const m86 = strip(read("supabase/migrations/00086_fuel_cost_finance_only.sql"));
const m87 = strip(read("supabase/migrations/00087_fix_weekly_fuel_invoice_ambiguity.sql"));

function fn(text: string, name: string): string {
  const s = text.indexOf(`create or replace function public.${name}(`);
  expect(s, name).toBeGreaterThan(-1);
  return text.slice(s, text.indexOf("$$;", text.indexOf("$$", s) + 2) + 3);
}
const header = (body: string) => body.slice(0, body.indexOf("$$"));
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

describe("migration numbering", () => {
  it("00093-00095 are the next free numbers after 00092 and unique", () => {
    const files = readdirSync(path.join(root, "supabase/migrations"));
    for (const n of ["00093", "00094", "00095"]) {
      expect(files.filter((f) => f.startsWith(`${n}_`))).toHaveLength(1);
    }
    expect(files.some((f) => f.startsWith("00092_"))).toBe(true);
    // 00096 is reserved (PR #100); 00097 is void-then-regenerate; 00098 is
    // maintenance intervals; 00099 is the security port (PR #49).
    expect(
      files.filter((f) => f > "00096" && !f.startsWith("00097_") && !f.startsWith("00098_") && !f.startsWith("00099_"))
    ).toEqual([]);
  });

  it.each([
    ["00093", m93, r93],
    ["00094", m94, r94],
    ["00095", m95, r95],
  ])("%s and its rollback are transactional", (_n, sql, rb) => {
    for (const t of [sql, rb]) {
      expect(t).toMatch(/^\s*begin;/);
      expect(t).toMatch(/commit;\s*$/);
    }
  });

  it("seeds no prices (no top-level insert into fuel_prices; no numeric price literal in RPC inserts)", () => {
    for (const t of [m93, m94, m95]) {
      const topLevel = t.replace(/\$\$[\s\S]*?\$\$/g, "");
      expect(topLevel).not.toMatch(/insert into public\.fuel_prices/i);
      expect(t).not.toMatch(/insert into public\.fuel_prices[^;]*values\s*\([^;]*\b\d+\.\d+/i);
    }
  });
});

describe("00093 fuel_prices", () => {
  it("has the brief's columns, null-org global key and status check", () => {
    const create = m93.match(/create table if not exists public\.fuel_prices \(([\s\S]*?)\n\);/)![1];
    for (const c of [
      "organisation_id uuid references",
      "fuel_type text not null",
      "region text not null default 'coastal'",
      "effective_from date not null",
      "price_per_litre numeric(10, 4) not null",
      "source text not null",
      "status text not null default 'pending'",
      "created_by uuid",
      "confirmed_by uuid",
      "confirmed_at timestamptz",
    ]) {
      expect(create).toContain(c);
    }
    expect(create).toMatch(/check \(status in \('pending', 'confirmed'\)\)/);
    expect(create).toMatch(/unique nulls not distinct \(organisation_id, fuel_type, region, effective_from\)/);
    expect(create).toMatch(/check \(organisation_id is not null or status = 'pending'\)/);
  });

  it("RLS: SELECT only for platform owner / admin / manager, no client writes", () => {
    expect(m93).toMatch(/alter table public\.fuel_prices enable row level security;/);
    expect(m93).toMatch(/revoke all on table public\.fuel_prices from public, anon, authenticated;/);
    expect(m93).toMatch(/grant select on table public\.fuel_prices to authenticated;/);
    expect(m93).not.toMatch(/grant (insert|update|delete)[^;]*fuel_prices to authenticated/);
    const policy = m93.match(/create policy fuel_prices_select[\s\S]*?\);\n/)![0];
    expect(policy).toMatch(/for select/);
    expect(policy).not.toMatch(/dispatcher|supervisor|driver|employee|company_manager|current_driver_id/);
    expect(policy.match(/array\['organisation_admin', 'manager'\]/g)).toHaveLength(2);
  });

  const definers = [
    "list_fuel_prices",
    "confirm_fuel_prices",
    "upsert_org_fuel_price",
    "ingest_global_fuel_prices",
    "notify_fuel_price_ingest_failure",
  ];
  it.each(definers)("%s is SECURITY DEFINER with a pinned search_path and no anon", (name) => {
    const h = header(fn(m93, name));
    expect(h).toMatch(/security definer\s+set search_path = pg_catalog, public/);
    expect(m93).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`));
  });

  it("finance RPCs are client-callable and in the allowlist; cron RPCs are service_role only", () => {
    for (const name of ["list_fuel_prices", "confirm_fuel_prices", "upsert_org_fuel_price"]) {
      expect(m93).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
      expect(AUTHENTICATED_CLIENT_RPCS).toContain(name);
    }
    for (const name of ["ingest_global_fuel_prices", "notify_fuel_price_ingest_failure", "resolve_fuel_unit_price"]) {
      expect(m93).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`));
      expect(m93).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role;`));
      expect(AUTHENTICATED_CLIENT_RPCS).not.toContain(name);
    }
  });

  it.each(["list_fuel_prices", "confirm_fuel_prices", "upsert_org_fuel_price"])(
    "%s is finance-gated (platform owner, organisation_admin, manager)",
    (name) => {
      expect(fn(m93, name)).toMatch(
        /public\.is_platform_owner\(\)\s+or public\.has_org_role_names\(p_organisation_id, array\['organisation_admin', 'manager'\]\)/
      );
    }
  );

  it("resolve_fuel_unit_price returns only confirmed ORG rows effective on/before the slip date", () => {
    const body = fn(m93, "resolve_fuel_unit_price");
    expect(header(body)).toMatch(/security invoker\s+set search_path = pg_catalog, public/);
    expect(body).toMatch(/p\.organisation_id = p_organisation_id/);
    expect(body).toMatch(/p\.organisation_id is not null/);
    expect(body).toMatch(/p\.status = 'confirmed'/);
    expect(body).toMatch(/p\.effective_from <= p_slip_date/);
    expect(body).toMatch(/order by p\.effective_from desc\s+limit 1/);
  });

  it("confirm_fuel_prices writes the caller's org only, from global pending rows, idempotently", () => {
    const body = fn(m93, "confirm_fuel_prices");
    expect(body).toMatch(/g\.organisation_id is null\s+and g\.status = 'pending'/);
    expect(body).toMatch(/select\s+p_organisation_id, c\.fuel_type/);
    expect(body).toMatch(/'confirmed', auth\.uid\(\), auth\.uid\(\)/);
    expect(body).toMatch(/on conflict on constraint fuel_prices_key do nothing/);
    expect(body).not.toMatch(/update public\.fuel_prices/);
  });

  it("ingest inserts global pending only, refuses DEMO, idempotent", () => {
    const body = fn(m93, "ingest_global_fuel_prices");
    expect(body).toMatch(/p_source ~\* 'demo'/);
    expect(body).toMatch(/select null, s\.fuel_type[\s\S]*'pending'/);
    expect(body).toMatch(/on conflict on constraint fuel_prices_key do nothing/);
  });

  it("notify writes admin inbox notices only (no price change)", () => {
    const body = fn(m93, "notify_fuel_price_ingest_failure");
    expect(body).toMatch(/insert into public\.admin_inbox_notifications/);
    expect(body).not.toMatch(/fuel_prices\s*\(|update public\.fuel_prices|delete from public\.fuel_prices/);
    expect(body).toMatch(/'organisation_admin', 'manager'/);
  });
});

describe("00094 fill-up price lock", () => {
  it("adds the columns with region default coastal and a status check (needs_price => null money)", () => {
    expect(m94).toMatch(/add column if not exists fuel_type text/);
    expect(m94).toMatch(/add column if not exists region text not null default 'coastal'/);
    expect(m94).toMatch(/add column if not exists price_status text not null default 'needs_price'/);
    expect(m94).toMatch(/add column if not exists priced_from_id uuid references public\.fuel_prices \(id\)/);
    expect(m94).toMatch(/add column if not exists priced_at timestamptz/);
    expect(m94).toMatch(
      /\(price_status = 'needs_price' and unit_price is null and total_amount is null and priced_from_id is null\)/
    );
  });

  it("grants SELECT on fuel_type, region only (money/status stay hidden)", () => {
    const grants = [...m94.matchAll(/grant select \(([\s\S]*?)\) on table public\.fuel_fillups to authenticated;/g)].map((m) =>
      m[1].split(",").map((c) => c.trim())
    );
    const all = grants.flat();
    expect(all).toContain("fuel_type");
    expect(all).toContain("region");
    for (const c of ["unit_price", "total_amount", "currency", "price_status", "priced_from_id", "priced_at"]) {
      expect(all).not.toContain(c);
    }
    // the only columns beyond 00086's list are fuel_type and region
    const m86cols = m86.match(/grant select \(([\s\S]*?)\) on table public\.fuel_fillups/)![1].split(",").map((c) => c.trim());
    expect(all.filter((c) => !m86cols.includes(c)).sort()).toEqual(["fuel_type", "region"]);
  });

  it("clients cannot write prices: INSERT/UPDATE limited to ops columns", () => {
    expect(m94).toMatch(/revoke insert, update on table public\.fuel_fillups from authenticated, anon;/);
    for (const kind of ["insert", "update"]) {
      const g = m94.match(new RegExp(`grant ${kind} \\(([\\s\\S]*?)\\) on table public\\.fuel_fillups to authenticated;`))![1];
      for (const c of ["unit_price", "total_amount", "currency", "price_status", "priced_from_id", "priced_at"]) {
        expect(g).not.toMatch(new RegExp(`\\b${c}\\b`));
      }
    }
  });

  it("lock trigger rejects money / priced_from_id changes once priced", () => {
    const body = fn(m94, "fuel_fillups_guard_price_lock");
    expect(body).toMatch(/old\.price_status = 'priced'/);
    for (const c of ["unit_price", "total_amount", "currency", "priced_from_id", "priced_at", "price_status"]) {
      expect(body).toContain(`new.${c} is distinct from old.${c}`);
    }
    expect(m94).toMatch(/before update on public\.fuel_fillups\s+for each row execute function public\.fuel_fillups_guard_price_lock\(\)/);
  });

  describe("log_fuel_fillup", () => {
    const body = fn(m94, "log_fuel_fillup");
    it("keeps the 00086 signature plus p_fuel_type / p_region, pinned, definer", () => {
      expect(m94).toMatch(
        /drop function if exists public\.log_fuel_fillup\(\s*uuid, uuid, numeric, numeric, uuid, uuid, timestamptz, numeric, text, text\s*\);/
      );
      expect(body).toMatch(/p_unit_price numeric default null,[\s\S]*p_fuel_type text default null,\s*p_region text default null\s*\)/);
      expect(header(body)).toMatch(/security definer\s+set search_path = pg_catalog, public/);
      expect(m94).toMatch(/revoke all on function public\.log_fuel_fillup\([^)]*\) from public, anon;/);
    });
    it("requires fuel_type and ignores p_unit_price for every caller", () => {
      expect(body).toMatch(/Fuel type is required/);
      const code = body.replace(/p_unit_price numeric default null/, "");
      expect(code).not.toMatch(/p_unit_price(?! is ignored)/);
    });
    it("prices from resolve_fuel_unit_price on the Africa/Johannesburg slip date, else needs_price with null money", () => {
      expect(body).toMatch(/v_slip := \(timezone\('Africa\/Johannesburg', v_filled_at\)\)::date;/);
      expect(body).toMatch(/from public\.resolve_fuel_unit_price\(p_organisation_id, trim\(p_fuel_type\), v_region, v_slip\)/);
      expect(body).toMatch(/case when v_price\.id is not null then round\(p_litres \* v_price\.price_per_litre, 2\) end/);
      expect(body).toMatch(/case when v_price\.id is not null then 'priced' else 'needs_price' end/);
      expect(body).not.toMatch(/coalesce\([^)]*,\s*0\)/);
    });
    it("masks money and status for everyone except owner / admin / manager (drivers too)", () => {
      expect(body).toMatch(/is_finance := public\.is_platform_owner\(\)\s+or public\.has_org_role_names\(\s*p_organisation_id,\s*array\['organisation_admin', 'manager'\]\s*\);/);
      expect(body).toMatch(
        /if not is_finance then\s+row\.unit_price := null;\s+row\.total_amount := null;\s+row\.currency := null;\s+row\.price_status := null;\s+row\.priced_from_id := null;\s+row\.priced_at := null;\s+end if;/
      );
      expect(body).not.toMatch(/or is_self_driver\s*\)\s*then\s+row\./);
    });
  });

  it("list_fuel_fillup_amounts: finance only, 0 rows for drivers (tightened from 00086)", () => {
    const body = fn(m94, "list_fuel_fillup_amounts");
    expect(body).toMatch(/price_status text,\s*priced_from_id uuid,\s*priced_at timestamptz/);
    expect(body.match(/return query/g)).toHaveLength(1);
    expect(body).not.toMatch(/current_driver_id/);
    expect(fn(m86, "list_fuel_fillup_amounts")).toMatch(/current_driver_id/); // what we tightened
    expect(header(body)).toMatch(/stable\s+security definer\s+set search_path = pg_catalog, public/);
  });

  describe("generate_weekly_fuel_invoice", () => {
    const body = fn(m94, "generate_weekly_fuel_invoice");
    const old = fn(m87, "generate_weekly_fuel_invoice");
    it("keeps the 00085/00087 auth and v_period_end", () => {
      const auth = (t: string) => norm(t.slice(t.indexOf("can_generate :="), t.indexOf("if not can_generate")));
      expect(auth(body)).toBe(auth(old));
      expect(body).toMatch(/v_period_end := p_week_start \+ 7;/);
    });
    it("keeps the existing-invoice short-circuit before the needs-price check", () => {
      const sc = (t: string) => norm(t.slice(t.indexOf("select * into existing"), t.indexOf("return existing;") + 16));
      expect(sc(body)).toBe(sc(old));
      expect(body.indexOf("return existing;")).toBeLessThan(body.indexOf("v_unpriced > 0"));
    });
    it("never coalesces money to 0 and raises before creating an invoice", () => {
      expect(old).toMatch(/coalesce\(fill\.unit_price, 0\)/); // the R0 bug being fixed
      expect(body).not.toMatch(/coalesce\(/);
      expect(body).toMatch(/f\.price_status <> 'priced' or f\.total_amount is null/);
      expect(body.indexOf("raise exception 'Cannot invoice this fuel week")).toBeLessThan(body.indexOf("insert into public.invoices"));
      expect(body).not.toMatch(/select f\.\*/);
    });
    it("matches the week on the Africa/Johannesburg slip date", () => {
      expect(body).toMatch(/timezone\('Africa\/Johannesburg', f\.filled_at\) >= p_week_start::timestamp/);
    });
  });

  it("upsert_org_fuel_price refuses to change a rate that has priced fill-ups", () => {
    expect(fn(m94, "upsert_org_fuel_price")).toMatch(/f\.priced_from_id = v_existing\.id[\s\S]*locked/);
  });
});

describe("00095 backfill", () => {
  const body = fn(m95, "backfill_unpriced_fuel_fillups");
  it("is finance-only, definer, pinned, client allowlisted", () => {
    expect(header(body)).toMatch(/security definer\s+set search_path = pg_catalog, public/);
    expect(body).toMatch(/public\.is_platform_owner\(\)\s+or public\.has_org_role_names\(p_organisation_id, array\['organisation_admin', 'manager'\]\)/);
    expect(m95).toMatch(/revoke all on function public\.backfill_unpriced_fuel_fillups\(uuid\) from public, anon;/);
    expect(AUTHENTICATED_CLIENT_RPCS).toContain("backfill_unpriced_fuel_fillups");
  });
  it("only prices needs_price rows with null money, via resolve_fuel_unit_price", () => {
    expect(body).toMatch(/f\.price_status = 'needs_price'\s+and f\.total_amount is null\s+and f\.unit_price is null/);
    expect(body).toMatch(/public\.resolve_fuel_unit_price\(/);
    expect(body).toMatch(/where f\.id = t\.id\s+and f\.price_status = 'needs_price'/);
  });
});

describe("rollbacks", () => {
  it("rollback-00094 restores the 00086 log/list and 00087 weekly invoice verbatim", () => {
    expect(norm(fn(r94, "log_fuel_fillup"))).toBe(norm(fn(m86, "log_fuel_fillup")));
    expect(norm(fn(r94, "list_fuel_fillup_amounts"))).toBe(norm(fn(m86, "list_fuel_fillup_amounts")));
    expect(norm(fn(r94, "generate_weekly_fuel_invoice"))).toBe(norm(fn(m87, "generate_weekly_fuel_invoice")));
    expect(norm(fn(r94, "upsert_org_fuel_price"))).toBe(norm(fn(m93, "upsert_org_fuel_price")));
    expect(r94).toMatch(/drop column if exists price_status/);
    expect(r94).toMatch(/drop trigger if exists fuel_fillups_price_lock/);
  });
  it("rollback-00093 drops the table without cascade, rollback-00095 drops backfill", () => {
    expect(r93).toMatch(/drop table if exists public\.fuel_prices;/);
    expect(r93).not.toMatch(/cascade/i);
    expect(r95).toMatch(/drop function if exists public\.backfill_unpriced_fuel_fillups\(uuid\);/);
  });
});
