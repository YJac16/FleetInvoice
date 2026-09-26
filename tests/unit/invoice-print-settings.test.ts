import { describe, expect, it } from "vitest";

import {
  parseInvoicePrintSettings,
  resolvePrintSupplierName,
} from "@/features/invoices/lib/invoice-print-settings";

describe("parseInvoicePrintSettings", () => {
  it("reads banking and contact from settings.invoice_print", () => {
    const settings = parseInvoicePrintSettings({
      name: "Yaseen Org",
      settings: {
        invoice_print: {
          banking: {
            bank: "FNB",
            account_name: "Yaseen Jacobs",
            account_number: "62731713170",
            branch_code: "250655",
            account_type: "Cheque Account",
          },
          contact: {
            name: "Yaseen Jacobs",
            phone: "082 327 7446",
            email: "yaseenjacobs97@gmail.com",
          },
        },
      },
    });

    expect(settings.banking).toEqual({
      bank: "FNB",
      account_name: "Yaseen Jacobs",
      account_number: "62731713170",
      branch_code: "250655",
      account_type: "Cheque Account",
    });
    expect(settings.contact).toEqual({
      name: "Yaseen Jacobs",
      phone: "082 327 7446",
      email: "yaseenjacobs97@gmail.com",
    });
  });

  it("does not inject founder defaults when invoice_print is missing", () => {
    const settings = parseInvoicePrintSettings({
      name: "Demo Transport Co",
      settings: {},
    });

    expect(settings.banking).toEqual({});
    expect(settings.contact).toEqual({});
    expect(settings.supplier?.name).toBe("Demo Transport Co");
  });

  it("still reads supplier header fields from settings.invoice", () => {
    const settings = parseInvoicePrintSettings({
      name: "Yaseen Org",
      settings: {
        invoice: {
          supplier: {
            name: "Yaseen Jacobs",
            address_lines: ["47 Upper Duke Street", "Cape Town"],
            phone: "082 327 7446",
          },
          driver_label: "YASEEN",
        },
        invoice_print: {
          banking: { bank: "FNB" },
          contact: { name: "Yaseen Jacobs", email: "yaseenjacobs97@gmail.com" },
          vehicle_reg: "GR 11 WP",
        },
      },
    });

    expect(settings.supplier?.name).toBe("Yaseen Jacobs");
    expect(settings.supplier?.address_lines).toEqual([
      "47 Upper Duke Street",
      "Cape Town",
    ]);
    expect(settings.driver_label).toBe("YASEEN");
    expect(settings.vehicle_reg).toBe("GR 11 WP");
    expect(settings.banking?.bank).toBe("FNB");
    expect(settings.contact?.email).toBe("yaseenjacobs97@gmail.com");
  });
});

describe("resolvePrintSupplierName", () => {
  it("prefers configured supplier over SaaS organisation name", () => {
    const settings = parseInvoicePrintSettings({
      name: "Yaseen Org",
      settings: {
        invoice: {
          supplier: { name: "Yaseen Jacobs" },
        },
      },
    });

    expect(resolvePrintSupplierName(settings, "Yaseen Org")).toBe(
      "Yaseen Jacobs"
    );
  });

  it("falls back to organisation name when no supplier or contact is set", () => {
    const settings = parseInvoicePrintSettings({
      name: "Demo Transport Co",
      settings: {},
    });

    expect(resolvePrintSupplierName(settings, "Demo Transport Co")).toBe(
      "Demo Transport Co"
    );
  });
});
