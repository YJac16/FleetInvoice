import { describe, expect, it } from "vitest";

import { sanitizeAppRedirectPath } from "@/lib/auth/safe-redirect";
import {
  parseInvoicePrintSettings,
  resolvePrintSupplierName,
} from "@/features/invoices/lib/invoice-print-settings";

describe("Phase 7 edge cases (unit-safe)", () => {
  it("handles empty org invoice settings without leaking defaults", () => {
    const settings = parseInvoicePrintSettings({
      name: "Empty Fleet Co",
      settings: {},
    });
    expect(settings.banking).toEqual({});
    expect(settings.contact).toEqual({});
    expect(resolvePrintSupplierName(settings, "Empty Fleet Co")).toBe(
      "Empty Fleet Co"
    );
  });

  it("handles long supplier names and special characters", () => {
    const longName =
      "Fleet & Co «Unicode» — " + "A".repeat(120);
    const settings = parseInvoicePrintSettings({
      name: "Org",
      settings: {
        invoice_print: {
          contact: { name: longName, email: "bill+tag@example.test" },
        },
      },
    });
    expect(settings.contact?.name).toBe(longName);
    expect(settings.contact?.email).toBe("bill+tag@example.test");
  });

  it("rejects invalid redirect paths (invalid UUID / off-site)", () => {
    expect(sanitizeAppRedirectPath("/invoices/not-a-uuid/print", "/hub")).toBe(
      "/invoices/not-a-uuid/print"
    );
    expect(sanitizeAppRedirectPath("javascript:alert(1)", "/hub")).toBe("/hub");
    expect(sanitizeAppRedirectPath("/\\evil", "/hub")).toBe("/hub");
  });

  it("parses zero amounts in stored invoice print banking", () => {
    const settings = parseInvoicePrintSettings({
      name: "Zero Co",
      settings: {
        invoice_print: {
          banking: { account_number: "0", branch_code: "000000" },
        },
      },
    });
    expect(settings.banking?.account_number).toBe("0");
  });
});
