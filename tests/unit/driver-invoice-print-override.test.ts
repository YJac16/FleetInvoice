import { describe, expect, it, vi } from "vitest";

import {
  fetchDriverInvoicePrintOverride,
  isMissingOverrideTable,
  type OverrideClient,
} from "@/features/invoices/lib/driver-invoice-print-override";
import {
  applyDriverInvoicePrintOverride,
  parseDriverInvoicePrintOverride,
  parseInvoicePrintSettings,
  resolvePrintSupplierName,
} from "@/features/invoices/lib/invoice-print-settings";

// Fixture numbers are fake; never real account numbers.
const fadiaOrg = {
  name: "Fadia Org",
  settings: {
    invoice_print: {
      banking: {
        bank: "DEMO-ABSA",
        account_name: "Demo Shaheed Transport",
        account_number: "DEMO-ACC-0256",
        branch_code: "DEMO-BR-2",
        account_type: "Cheque Account",
      },
      contact: {
        name: "Demo Shaheed Transport",
        phone: "083 000 0000",
        email: "shaheed@example.test",
      },
    },
  },
};

const mansurOverride = {
  contact: { name: "Demo Mansur Logistics" },
  banking: {
    bank: "DEMO-ABSA",
    account_name: "Demo Mansur Logistics",
    account_number: "DEMO-ACC-3003",
    branch_code: "DEMO-BR-2",
    account_type: "Current Account",
  },
};

describe("applyDriverInvoicePrintOverride", () => {
  const orgSettings = parseInvoicePrintSettings(fadiaOrg);

  it("without an override the org letterhead and banking are unchanged", () => {
    expect(applyDriverInvoicePrintOverride(orgSettings, null)).toEqual(orgSettings);
    expect(applyDriverInvoicePrintOverride(orgSettings, undefined)).toEqual(orgSettings);
    expect(resolvePrintSupplierName(orgSettings, "Fadia Org")).toBe("Demo Shaheed Transport");
    expect(orgSettings.banking?.account_name).toBe("Demo Shaheed Transport");
  });

  it("with an override the issuer and banking are the override party's", () => {
    const settings = applyDriverInvoicePrintOverride(
      orgSettings,
      parseDriverInvoicePrintOverride(mansurOverride)
    );
    expect(resolvePrintSupplierName(settings, "Fadia Org")).toBe("Demo Mansur Logistics");
    expect(settings.banking).toEqual(mansurOverride.banking);
    expect(settings.contact).toEqual({ name: "Demo Mansur Logistics" });
    // Nothing of Shaheed's leaks onto the override invoice.
    expect(JSON.stringify(settings)).not.toMatch(/Shaheed|0256|083 000 0000/);
  });

  it("does not mix banking fields across parties", () => {
    const settings = applyDriverInvoicePrintOverride(
      orgSettings,
      parseDriverInvoicePrintOverride({ banking: { account_name: "Demo Mansur Logistics" } })
    );
    expect(settings.banking).toEqual({ account_name: "Demo Mansur Logistics" });
  });

  it("falls back to the org for any block the override leaves out", () => {
    const bankingOnly = applyDriverInvoicePrintOverride(
      orgSettings,
      parseDriverInvoicePrintOverride({ banking: mansurOverride.banking })
    );
    expect(bankingOnly.banking?.account_name).toBe("Demo Mansur Logistics");
    expect(bankingOnly.supplier).toEqual(orgSettings.supplier);
    expect(bankingOnly.contact).toEqual(orgSettings.contact);

    const issuerOnly = applyDriverInvoicePrintOverride(
      orgSettings,
      parseDriverInvoicePrintOverride({ contact: { name: "Demo Mansur Logistics" } })
    );
    expect(resolvePrintSupplierName(issuerOnly, "Fadia Org")).toBe("Demo Mansur Logistics");
    expect(issuerOnly.banking).toEqual(orgSettings.banking);
  });

  it("keeps driver label and vehicle reg from the org settings", () => {
    const base = parseInvoicePrintSettings({
      name: "Org",
      settings: { invoice_print: { driver_label: "X", vehicle_reg: "9116WP" } },
    });
    const settings = applyDriverInvoicePrintOverride(
      base,
      parseDriverInvoicePrintOverride(mansurOverride)
    );
    expect(settings.driver_label).toBe("X");
    expect(settings.vehicle_reg).toBe("9116WP");
  });

  it("supplier block sets letterhead name, address and phone", () => {
    const settings = applyDriverInvoicePrintOverride(
      orgSettings,
      parseDriverInvoicePrintOverride({
        supplier: { name: "Demo Mansur Logistics", address_lines: ["1 Test Rd"], phone: "082" },
      })
    );
    expect(settings.supplier).toEqual({
      name: "Demo Mansur Logistics",
      address_lines: ["1 Test Rd"],
      phone: "082",
      email: undefined,
    });
    expect(settings.contact?.name).toBe("Demo Mansur Logistics");
  });
});

describe("parseDriverInvoicePrintOverride", () => {
  it("returns null for empty or non-object settings", () => {
    expect(parseDriverInvoicePrintOverride(null)).toBeNull();
    expect(parseDriverInvoicePrintOverride({})).toBeNull();
    expect(parseDriverInvoicePrintOverride("x")).toBeNull();
    expect(parseDriverInvoicePrintOverride({ banking: {}, contact: { name: 1 } })).toBeNull();
  });
});

function clientReturning(result: { data: unknown; error: unknown }) {
  const eq2 = vi.fn(() => ({ maybeSingle: () => Promise.resolve(result) }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as OverrideClient, from, eq1, eq2 };
}

describe("fetchDriverInvoicePrintOverride", () => {
  it("scopes the read to the org and driver", async () => {
    const { client, from, eq1, eq2 } = clientReturning({
      data: { settings: mansurOverride },
      error: null,
    });
    const result = await fetchDriverInvoicePrintOverride(client, "org-1", "drv-1");
    expect(from).toHaveBeenCalledWith("driver_invoice_print_overrides");
    expect(eq1).toHaveBeenCalledWith("organisation_id", "org-1");
    expect(eq2).toHaveBeenCalledWith("driver_id", "drv-1");
    expect(result?.banking?.account_name).toBe("Demo Mansur Logistics");
  });

  it("returns null when no row is visible (no override or RLS)", async () => {
    const { client } = clientReturning({ data: null, error: null });
    expect(await fetchDriverInvoicePrintOverride(client, "o", "d")).toBeNull();
  });

  it("returns null before 00089 is applied (missing table)", async () => {
    const { client } = clientReturning({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table" },
    });
    expect(await fetchDriverInvoicePrintOverride(client, "o", "d")).toBeNull();
    expect(isMissingOverrideTable({ code: "42P01" })).toBe(true);
  });

  it("rethrows other errors, including permission errors on the table", async () => {
    const { client } = clientReturning({
      data: null,
      error: { code: "42501", message: "permission denied for table driver_invoice_print_overrides" },
    });
    await expect(fetchDriverInvoicePrintOverride(client, "o", "d")).rejects.toMatchObject({
      code: "42501",
    });
  });
});
