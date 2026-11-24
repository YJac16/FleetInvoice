import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const sql = read("supabase/migrations/00082_delete_workshop_bill_supplier_audit.sql");
const rollback = read("supabase/rollback-00082.sql");
const m00078 = read("supabase/migrations/00078_delete_workshop_bill.sql");

const code = (t: string) => t.replace(/--[^\n]*/g, "");
const squash = (t: string) => code(t).replace(/\s+/g, " ").trim();
const fn = (t: string) => {
  const c = code(t);
  return squash(c.slice(c.indexOf("create or replace function"), c.indexOf("commit;")));
};

describe("00082 delete_workshop_bill supplier_name audit", () => {
  it("keeps the 00078 signature, security definer, writer check and grants", () => {
    const f = fn(sql);
    expect(f).toContain("create or replace function public.delete_workshop_bill( p_actor uuid, p_org uuid, p_id uuid ) returns void");
    expect(f).toContain("security definer set search_path = pg_catalog, public");
    expect(f).toContain("perform public.maintenance_assert_writer(p_actor, p_org);");
    expect(f).toContain("raise exception 'bill_not_draft'");
    expect(f).toContain("raise exception 'not_found'");
    expect(f).toContain("revoke all on function public.delete_workshop_bill(uuid, uuid, uuid) from public, anon, authenticated;");
    expect(f).toContain("grant execute on function public.delete_workshop_bill(uuid, uuid, uuid) to service_role;");
  });

  it("adds supplier_name from the same-org supplier and locks only the bill", () => {
    const f = fn(sql);
    expect(f).toContain("left join public.suppliers s on s.id = b.supplier_id and s.organisation_id = b.organisation_id");
    expect(f).toContain("for update of b;");
    expect(f).toContain("'supplier_name', v_supplier_name");
    expect(f).toContain("'invoice_ref', v_invoice_ref");
    expect(f).toContain("'total_incl', v_total");
    expect(f).toContain("'workshop_bill.deleted'");
  });

  it("is otherwise the 00078 body", () => {
    const strip = (f: string) =>
      f
        .replace(/ v_supplier_name text;/, "")
        .replace(/select b\.status.*?for update( of b)?;/, "SELECT")
        .replace(/jsonb_build_object\(.*?\)/, "META");
    expect(strip(fn(sql))).toBe(strip(fn(m00078)));
  });

  it("rollback restores 00078 exactly", () => {
    expect(fn(rollback)).toBe(fn(m00078));
  });
});
