import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/00056_security_privilege_and_billing.sql"),
  "utf8"
);

describe("migration 00056 security controls", () => {
  it("blocks self-grant of is_platform_owner and limits profile updates", () => {
    expect(sql).toContain("function public.protect_profile_platform_owner()");
    expect(sql).toContain("is_platform_owner cannot be changed");
    expect(sql).toContain(
      "revoke update on table public.profiles from anon, authenticated"
    );
    expect(sql).toContain(
      "grant update (full_name, phone, avatar_url) on table public.profiles to authenticated"
    );
  });

  it("rejects platform_owner as a JWT-assigned organisation role", () => {
    expect(sql).toContain("function public.reject_platform_owner_membership_role()");
    expect(sql).toContain("platform_owner cannot be assigned as an organisation role");
    expect(sql).toContain(
      "trigger organisation_members_reject_platform_owner"
    );
    expect(sql).toContain("trigger invitations_reject_platform_owner");
  });

  it("aligns invoice line reads and removes direct invoice updates", () => {
    expect(sql).toContain("drop policy if exists invoice_lines_select");
    expect(sql).toContain("array['driver', 'employee']");
    expect(sql).toContain("drop policy if exists invoices_update on public.invoices");
    expect(sql).not.toMatch(/create policy invoices_update/i);
  });

  it("limits subscription reads to platform owners and organisation admins", () => {
    const subscriptions = sql.slice(sql.indexOf("5) Subscription"));
    expect(subscriptions).toContain("drop policy if exists subscriptions_select");
    expect(subscriptions).toContain("array['organisation_admin']");
    expect(subscriptions).not.toContain("user_organisation_ids()");
  });
});
