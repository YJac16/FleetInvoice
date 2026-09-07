import { describe, expect, it } from "vitest";

import {
  invoicePrintSettingsFromOrganisation,
  invoicePrintSettingsToOrganisationSettings,
} from "@/features/settings/lib/invoice-print-settings-form";
import {
  formatInvoiceDatePreview,
  formatServiceWeekLabel,
} from "@/features/invoices/lib/service-week";
import {
  buildOrgLogoStoragePath,
  validateOrgLogoFile,
} from "@/services/org-logo.service";

describe("buildOrgLogoStoragePath", () => {
  it("scopes logo files to organisation id", () => {
    expect(
      buildOrgLogoStoragePath("org-123", "image/png")
    ).toBe("org-123/logo.png");
    expect(
      buildOrgLogoStoragePath("org-456", "image/jpeg")
    ).toBe("org-456/logo.jpg");
  });
});

describe("validateOrgLogoFile", () => {
  it("rejects non-images", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    expect(() => validateOrgLogoFile(file)).toThrow(/image/i);
  });

  it("rejects files over 2 MB", () => {
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });
    expect(() => validateOrgLogoFile(file)).toThrow(/2 MB/i);
  });
});

describe("invoicePrintSettingsFromOrganisation", () => {
  it("reads nested invoice_print and supplier fields", () => {
    const values = invoicePrintSettingsFromOrganisation({
      name: "Fleet Org",
      settings: {
        invoice: {
          supplier: {
            name: "Yaseen Jacobs",
            address_lines: ["47 Upper Duke Street"],
            phone: "082 327 7446",
          },
        },
        invoice_print: {
          banking: { bank: "FNB", account_number: "62731713170" },
          contact: { name: "Yaseen Jacobs", email: "yaseen@example.com" },
          vehicle_reg: "GR 11 WP",
          driver_label: "YASEEN",
        },
      },
    });

    expect(values.supplier_name).toBe("Yaseen Jacobs");
    expect(values.supplier_address).toBe("47 Upper Duke Street");
    expect(values.bank).toBe("FNB");
    expect(values.vehicle_reg).toBe("GR 11 WP");
    expect(values.driver_label).toBe("YASEEN");
  });
});

describe("invoicePrintSettingsToOrganisationSettings", () => {
  it("writes invoice_print banking without leaking other org settings", () => {
    const settings = invoicePrintSettingsToOrganisationSettings(
      {
        supplier_name: "Acme Shuttle",
        supplier_address: "1 Main Rd",
        supplier_phone: "",
        supplier_email: "",
        bank: "FNB",
        account_name: "Acme",
        account_number: "123",
        branch_code: "250655",
        account_type: "Cheque",
        contact_name: "Ops",
        contact_phone: "0800",
        contact_email: "ops@acme.test",
        vehicle_reg: "CA 123 GP",
        driver_label: "JOHN",
      },
      { other_feature: { enabled: true } }
    );

    expect(settings.other_feature).toEqual({ enabled: true });
    expect(settings.invoice_print).toMatchObject({
      banking: { bank: "FNB", account_number: "123" },
      vehicle_reg: "CA 123 GP",
      driver_label: "JOHN",
    });
    expect(settings.invoice).toMatchObject({
      supplier: { name: "Acme Shuttle", address_lines: ["1 Main Rd"] },
    });
  });
});

describe("formatServiceWeekLabel", () => {
  it("labels Mon–Sun from period_start", () => {
    expect(formatServiceWeekLabel("2025-08-18")).toContain("Mon 18 Aug");
    expect(formatServiceWeekLabel("2025-08-18")).toContain("Sun 24 Aug");
  });
});

describe("formatInvoiceDatePreview", () => {
  it("shows Monday after the service week", () => {
    expect(formatInvoiceDatePreview("2025-08-18")).toContain("Mon 25 Aug");
  });
});
