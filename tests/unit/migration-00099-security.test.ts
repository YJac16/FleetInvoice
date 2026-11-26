import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sql = read("supabase/migrations/00099_security_privilege_and_billing.sql");
const rollback = read("supabase/rollback-00099.sql");
const code = (t: string) => t.replace(/--[^\n]*/g, "");

describe("migration 00099 security controls", () => {
  it("blocks self-grant of is_platform_owner with an invoker trigger", () => {
    const fn = sql.slice(
      sql.indexOf("function public.protect_profile_platform_owner()"),
      sql.indexOf("drop trigger if exists profiles_protect_platform_owner")
    );
    expect(fn).toContain("security invoker");
    expect(fn).toContain("current_user in ('authenticated', 'anon', 'authenticator')");
    expect(fn).toContain("not public.is_platform_owner()");
    expect(fn).toContain("is_platform_owner cannot be changed");
    expect(code(sql)).not.toContain("request.jwt.claim");
    expect(sql).toMatch(
      /create trigger profiles_protect_platform_owner\s+before insert or update on public\.profiles/
    );
  });

  it("a non-owner cannot change is_platform_owner (guard ordering)", () => {
    const fn = sql.slice(
      sql.indexOf("function public.protect_profile_platform_owner()"),
      sql.indexOf("drop trigger if exists profiles_protect_platform_owner")
    );
    // Unchanged flag passes first, then the role check raises for JWT roles.
    const unchanged = fn.indexOf("is not distinct from old.is_platform_owner");
    const guard = fn.indexOf("current_user in");
    const raise = fn.indexOf("raise exception");
    expect(unchanged).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(unchanged);
    expect(raise).toBeGreaterThan(guard);
    expect(fn).toContain("using errcode = '42501'");
  });

  it("limits profile column grants to what the app updates", () => {
    expect(sql).toContain("revoke update on table public.profiles from anon, authenticated");
    expect(sql).toContain(
      "grant update (full_name, phone, avatar_url) on table public.profiles to authenticated"
    );
    expect(code(sql)).not.toMatch(/profiles_update/);
  });

  it("rejects platform_owner as a JWT-assigned organisation role", () => {
    expect(sql).toContain("function public.reject_platform_owner_membership_role()");
    expect(sql).toContain("platform_owner cannot be assigned as an organisation role");
    expect(sql).toContain("trigger organisation_members_reject_platform_owner");
    expect(sql).toContain("trigger invitations_reject_platform_owner");
  });

  it("removes direct invoice updates and does not touch invoice_lines_select", () => {
    expect(code(sql)).toContain("drop policy if exists invoices_update on public.invoices");
    expect(code(sql)).not.toMatch(/create policy invoices_update/i);
    expect(code(sql)).not.toContain("invoice_lines_select");
  });

  it("invoice_lines_select role gate matches invoices_select (latest definitions)", () => {
    const files = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((f) => /^\d+.*\.sql$/.test(f) && f < "00099")
      .sort();
    const latest = (name: string): string => {
      const re = new RegExp(
        `create policy ${name} on public\\.\\w+[\\s\\S]*?\\n  \\);\\n`,
        "g"
      );
      let found = "";
      for (const f of files) {
        for (const m of code(read(`supabase/migrations/${f}`)).matchAll(re)) found = m[0];
      }
      return found;
    };
    const gates = (s: string) =>
      [...s.matchAll(/array\[([^\]]*)\]/g)].map((m) => m[1].replace(/\s+/g, " "));
    const inv = gates(latest("invoices_select"));
    const lines = gates(latest("invoice_lines_select"));
    expect(inv.length).toBeGreaterThan(0);
    expect(lines).toEqual(inv);
  });

  it("limits subscription reads to platform owners and organisation admins", () => {
    const part = sql.slice(sql.indexOf("-- 4) Subscription"));
    expect(part).toContain("drop policy if exists subscriptions_select");
    expect(part).toContain("array['organisation_admin']");
    expect(part).not.toContain("user_organisation_ids()");
  });

  it("rollback restores the pre-00099 state", () => {
    expect(rollback).toMatch(/^begin;$/m);
    expect(rollback).toMatch(/^commit;$/m);
    expect(rollback).toContain("drop trigger if exists profiles_protect_platform_owner");
    expect(rollback).toContain("drop function if exists public.protect_profile_platform_owner()");
    expect(rollback).toContain("drop function if exists public.reject_platform_owner_membership_role()");
    expect(rollback).toContain("grant update on table public.profiles to authenticated");
    expect(rollback).toContain("create policy invoices_update on public.invoices");
    expect(rollback).toContain("organisation_id in (select public.user_organisation_ids())");
  });
});
