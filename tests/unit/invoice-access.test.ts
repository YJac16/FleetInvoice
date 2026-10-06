import { describe, expect, it, vi } from "vitest";

import { assertInvoiceManageAccess } from "@/lib/auth/invoice-access";

const invoice = {
  id: "inv",
  organisation_id: "org",
  company_id: "company",
  status: "issued",
};

function supabase(ops: boolean, owner = false) {
  const rpc = vi.fn(async (name: string, args?: { allowed?: string[] }) => {
    if (name === "is_platform_owner") return { data: owner, error: null };
    if (name === "has_org_role_names") {
      const allowed = args?.allowed ?? [];
      if (allowed.includes("company_manager")) {
        return { data: true, error: null };
      }
      return { data: ops, error: null };
    }
    if (name === "has_company_scope") return { data: true, error: null };
    return { data: null, error: { message: `unexpected ${name}` } };
  });
  return { rpc };
}

describe("assertInvoiceManageAccess", () => {
  it("rejects company_manager without consulting company scope", async () => {
    const client = supabase(false);
    await expect(
      assertInvoiceManageAccess(client as never, invoice)
    ).rejects.toThrow("Not authorised to manage this invoice");
    expect(client.rpc.mock.calls.map((call) => call[0])).not.toContain(
      "has_company_scope"
    );
    expect(
      client.rpc.mock.calls.some((call) =>
        (call[1] as { allowed?: string[] } | undefined)?.allowed?.includes(
          "company_manager"
        )
      )
    ).toBe(false);
  });

  it("allows organisation ops and platform owner", async () => {
    await expect(
      assertInvoiceManageAccess(supabase(true) as never, invoice)
    ).resolves.toBeUndefined();
    await expect(
      assertInvoiceManageAccess(supabase(false, true) as never, invoice)
    ).resolves.toBeUndefined();
  });
});
