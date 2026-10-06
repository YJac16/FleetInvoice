import { describe, expect, it } from "vitest";

import { resolveBillToCompanyId } from "@/lib/billing/bill-to-company";

const companies = [
  { id: "wcl", name: "  WCL Trading CC  ", created_at: "2026-01-02T00:00:00Z" },
  { id: "lewis", name: "Lewis", created_at: "2026-01-01T00:00:00Z" },
  { id: "wcl-later", name: "wcl trading cc", created_at: "2026-06-01T00:00:00Z" },
];

describe("resolveBillToCompanyId", () => {
  it("uses invoice_bill_to_company_id when that company exists", () => {
    expect(
      resolveBillToCompanyId(companies, {
        invoice_bill_to_company_id: "lewis",
      })
    ).toBe("lewis");
  });

  it("falls through when the setting does not point at a company", () => {
    expect(
      resolveBillToCompanyId(companies, {
        invoice_bill_to_company_id: "missing",
      })
    ).toBe("wcl");
    expect(
      resolveBillToCompanyId(companies, {
        invoice_bill_to_company_id: "  ",
      })
    ).toBe("wcl");
    expect(resolveBillToCompanyId(companies, {})).toBe("wcl");
    expect(resolveBillToCompanyId(companies, null)).toBe("wcl");
  });

  it("matches WCL Trading CC case-insensitively and picks the earliest row", () => {
    expect(resolveBillToCompanyId(companies, null)).toBe("wcl");
  });

  it("returns null when nothing matches", () => {
    expect(
      resolveBillToCompanyId([{ id: "acme", name: "Acme Staffing" }], null)
    ).toBeNull();
  });
});
