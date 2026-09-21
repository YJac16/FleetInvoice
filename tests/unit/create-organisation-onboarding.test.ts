import { describe, expect, it } from "vitest";

import { createOrganisationOnboardingSchema } from "@/features/onboarding/schemas/create-organisation-onboarding";
import { invoicePrintSettingsToOrganisationSettings } from "@/features/settings/lib/invoice-print-settings-form";
import { parseInvoicePrintSettings } from "@/features/invoices/lib/invoice-print-settings";

describe("createOrganisationOnboardingSchema", () => {
  it("requires organisation and supplier names", () => {
    const parsed = createOrganisationOnboardingSchema.safeParse({
      name: "Demo Org",
      slug: "demo-org",
      supplier_name: "Demo Trading",
      supplier_address: "",
      supplier_phone: "",
      supplier_email: "",
      bank: "",
      account_name: "",
      account_number: "",
      branch_code: "",
      account_type: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("onboarding invoice settings round-trip", () => {
  it("stores demo org letterhead without founder defaults", () => {
    const settings = invoicePrintSettingsToOrganisationSettings({
      supplier_name: "Demo Trading (Pty) Ltd",
      supplier_address: "1 Example Street\nCape Town",
      supplier_phone: "000 000 0000",
      supplier_email: "billing@example.test",
      bank: "Demo Bank",
      account_name: "Demo Trading",
      account_number: "123456789",
      branch_code: "000000",
      account_type: "Cheque",
      contact_name: "Demo Admin",
      contact_phone: "000 000 0000",
      contact_email: "admin@example.test",
      vehicle_reg: "",
      driver_label: "",
    });

    const parsed = parseInvoicePrintSettings({
      name: "Demo Org",
      settings,
    });

    expect(parsed.supplier?.name).toBe("Demo Trading (Pty) Ltd");
    expect(parsed.banking?.bank).toBe("Demo Bank");
    expect(parsed.contact?.email).toBe("admin@example.test");
    expect(parsed.contact?.email).not.toContain("yaseen");
  });
});
