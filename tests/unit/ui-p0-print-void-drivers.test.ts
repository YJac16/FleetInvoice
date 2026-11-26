import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Fixture data is fake (DEMO-* banks / accounts).
import {
  resolveInvoicePrintSettings,
  resolvePrintSupplierName,
} from "@/features/invoices/lib/invoice-print-settings";
import {
  voidInvoiceDescription,
  voidInvoiceLabel,
} from "@/features/invoices/lib/void-invoice-confirm";
import {
  ownerBlockFromForm,
  ownerBlockToForm,
  setOwnerBlock,
} from "@/features/settings/lib/owner-print-form";
import { invoicePrintSettingsToOrganisationSettings } from "@/features/settings/lib/invoice-print-settings-form";
import { resolveInvoiceOwner } from "@/lib/owner-tag";
import type { Invoice } from "@/types";

const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const jacobs = {
  name: "Jacobs Org",
  settings: {
    invoice_print: {
      contact: { name: "Jacobs Org Accounts" },
      banking: { bank: "DEMO-BANK", account_name: "Jacobs Org", account_number: "DEMO-ACC-0000" },
      owners: {
        yaseen: {
          supplier: { name: "Demo Yaseen Transport" },
          banking: { bank: "DEMO-FNB", account_name: "Demo Yaseen Transport", account_number: "DEMO-ACC-1001" },
        },
        fadia: {
          supplier: { name: "Demo Fadia Logistics" },
          banking: { bank: "DEMO-ABSA", account_name: "Demo Fadia Logistics", account_number: "DEMO-ACC-2002" },
        },
      },
    },
  },
};

describe("Jacobs print issuer by owner", () => {
  const print = (owner: "yaseen" | "fadia" | null, driverOverride = null) =>
    resolveInvoicePrintSettings(jacobs, owner, driverOverride);

  it("yaseen prints Yaseen issuer + banking", () => {
    const s = print("yaseen");
    expect(resolvePrintSupplierName(s, jacobs.name)).toBe("Demo Yaseen Transport");
    expect(s.banking?.account_number).toBe("DEMO-ACC-1001");
  });

  it("fadia prints Fadia issuer + banking, never Yaseen's", () => {
    const s = print("fadia");
    expect(resolvePrintSupplierName(s, jacobs.name)).toBe("Demo Fadia Logistics");
    expect(s.banking?.account_number).toBe("DEMO-ACC-2002");
  });

  it("unassigned falls back to the org issuer", () => {
    const s = print(null);
    expect(resolvePrintSupplierName(s, jacobs.name)).toBe("Jacobs Org Accounts");
    expect(s.banking?.account_number).toBe("DEMO-ACC-0000");
  });

  it("driver override still wins over the owner block", () => {
    const s = print("yaseen", {
      banking: { bank: "DEMO-NED", account_name: "Driver Co", account_number: "DEMO-ACC-3003" },
    } as never);
    expect(s.banking?.account_number).toBe("DEMO-ACC-3003");
  });

  it("owner comes from driver first, then invoice", () => {
    expect(resolveInvoiceOwner({ owner_tag: "fadia", drivers: { owner_tag: "yaseen" } })).toBe("yaseen");
    expect(resolveInvoiceOwner({ owner_tag: "fadia", drivers: null })).toBe("fadia");
  });

  it("owner blocks survive saving the org print form and round-trip", () => {
    const next = invoicePrintSettingsToOrganisationSettings(
      {
        supplier_name: "", supplier_address: "", supplier_phone: "", supplier_email: "",
        bank: "", account_name: "", account_number: "", branch_code: "", account_type: "",
        contact_name: "Jacobs Org Accounts", contact_phone: "", contact_email: "",
        vehicle_reg: "", driver_label: "",
      },
      jacobs.settings
    );
    expect((next.invoice_print as { owners?: unknown }).owners).toEqual(jacobs.settings.invoice_print.owners);

    const form = ownerBlockToForm(jacobs, "yaseen");
    expect(form.account_number).toBe("DEMO-ACC-1001");
    const cleared = setOwnerBlock(jacobs.settings, "yaseen", ownerBlockFromForm({ ...form, issuer_name: "", bank: "", account_name: "", account_number: "", branch_code: "", account_type: "" }));
    expect((cleared.invoice_print as { owners: Record<string, unknown> }).owners).not.toHaveProperty("yaseen");
  });
});

describe("void confirm", () => {
  const inv = {
    id: "i1",
    company_id: "c1234567",
    currency: "ZAR",
    total: 1380,
    period_start: "2026-11-23",
    period_end: "2026-11-29",
    companies: { id: "c1", name: "WCL" },
    drivers: { id: "d1", full_name: "Sam Driver" },
  } as unknown as Invoice;

  it("names the invoice and amount", () => {
    const text = voidInvoiceDescription(inv);
    expect(text).toContain("WCL");
    expect(text).toContain("Sam Driver");
    expect(text).toContain("ZAR 1380");
    expect(voidInvoiceLabel(inv)).toContain("→");
  });

  it("Cancel is the initial focus and confirm is destructive", () => {
    const src = read("components/shared/confirm-dialog.tsx");
    expect(src).toMatch(/initialFocus=\{cancelRef\}/);
    expect(src).toMatch(/ref=\{cancelRef\}/);
    expect(src).toMatch(/destructive \? "destructive"/);
  });

  it("Void lives in the overflow menu, not beside Print", () => {
    const src = read("features/invoices/components/invoices-page.tsx");
    expect(src).not.toMatch(/status: "void" \}\)\s*\}\s*>\s*Void\s*</);
    expect(src).toMatch(/Void invoice…/);
    expect(src).toMatch(/setVoidTarget\(inv\)/);
    expect(src).toMatch(/<ConfirmDialog[\s\S]*destructive/);
  });
});

describe("drivers list layout", () => {
  const page = read("features/drivers/components/drivers-page.tsx");

  it("merges columns: no standalone email/phone/linked-user/licence-code columns", () => {
    expect(page).not.toMatch(/accessorKey: "email"/);
    expect(page).not.toMatch(/accessorKey: "phone"/);
    expect(page).not.toMatch(/id: "linked_user"/);
    expect(page).not.toMatch(/accessorKey: "license_code"/);
    const headers = [...page.matchAll(/header: ("[^"]+"|PRDP_SHORT_LABEL)/g)];
    expect(headers.length).toBeLessThanOrEqual(8);
  });

  it("row actions collapse to an overflow menu", () => {
    expect(page).toMatch(/DropdownMenuTrigger/);
    expect(page).not.toMatch(/>\s*Invoice issuer\s*<\/Button>/);
  });

  it("actions wrap and cells can wrap (no 390px clip, no wide table)", () => {
    expect(read("components/shared/entity-crud-page.tsx")).toMatch(/flex flex-wrap items-center justify-end gap-2/);
    expect(read("components/shared/data-table.tsx")).toMatch(/whitespace-normal break-words/);
    expect(page).toMatch(/wrapCells/);
  });
});
