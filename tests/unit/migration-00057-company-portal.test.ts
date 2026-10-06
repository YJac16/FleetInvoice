import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../supabase/migrations/00057_company_portal_phase1_isolation.sql"
  ),
  "utf8"
);

function policy(name: string): string {
  const marker = `create policy ${name} on`;
  const start = sql.indexOf(marker);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(start);
  const next = rest.slice(marker.length).search(/\ncreate policy |\ncreate or replace function |\n-- ----/);
  return next === -1 ? rest : rest.slice(0, marker.length + next);
}

function routine(name: string): string {
  const marker = `create or replace function public.${name}(`;
  const start = sql.indexOf(marker);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(start);
  const end = rest.indexOf("$$;");
  expect(end, name).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("migration 00057", () => {
  it("does not create tables or restore invoices_update", () => {
    expect(sql.toLowerCase()).not.toMatch(/\bcreate table\b/);
    expect(sql).not.toMatch(/policy\s+invoices_update|policy if exists invoices_update/);
  });

  it("drops the org-wide company_manager rate-card branch", () => {
    const rate = policy("rate_cards_select");
    expect(rate).not.toContain("'company_manager'");
    expect(rate).not.toMatch(/company_id is null/);
    expect(rate).toContain("company_user_can_see");
  });

  it("removes company_manager from passenger, attendance, and qr role arrays", () => {
    for (const name of [
      "trip_passengers_select",
      "attendance_events_select",
      "qr_tokens_select",
    ]) {
      expect(policy(name)).not.toContain("'company_manager'");
    }
    expect(policy("invoice_lines_select")).toContain(
      "array['driver', 'employee']"
    );
  });

  it("removes company_manager from the three billing RPCs", () => {
    for (const name of [
      "set_invoice_status",
      "update_draft_invoice_line",
      "generate_period_invoice",
    ]) {
      expect(routine(name)).not.toContain("company_manager");
    }
    expect(routine("generate_period_invoice")).toContain("pg_advisory_xact_lock");
  });

  it("guards member_scopes with a before insert or update trigger", () => {
    expect(sql).toContain(
      "create trigger member_scopes_guard_company_manager"
    );
    expect(sql).toContain(
      "before insert or update on public.member_scopes"
    );
    expect(sql).toContain(
      "The bill-to company cannot be a company login scope."
    );
    expect(sql).toContain(
      "A company login can be linked to one company only."
    );
    expect(sql).toContain(
      "revoke all on function public.guard_company_manager_member_scope() from public, anon, authenticated"
    );
  });
});
