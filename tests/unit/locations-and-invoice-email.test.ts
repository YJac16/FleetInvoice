import { describe, expect, it } from "vitest";

import {
  matchLocationToken,
  normalizeAreaValue,
  splitAreaPlaces,
} from "@/features/locations/lib/location-match";
import type { ServiceLocation } from "@/features/locations/lib/location-match";
import {
  parseEmailList,
  validateEmailList,
} from "@/lib/notifications/email-addresses";
import { buildInvoiceEmailContent } from "@/lib/notifications/invoice-email";

const catalogue: ServiceLocation[] = [
  {
    id: "1",
    organisation_id: null,
    name: "Dunoon",
    aliases: ["Danoon"],
    region: "cape_town",
    status: "active",
  },
  {
    id: "2",
    organisation_id: null,
    name: "Bloubergstrand",
    aliases: ["Blouberg"],
    region: "cape_town",
    status: "active",
  },
  {
    id: "3",
    organisation_id: null,
    name: "Paarden Eiland",
    aliases: ["Paardeneiland"],
    region: "cape_town",
    status: "active",
  },
];

describe("matchLocationToken", () => {
  it("corrects common Cape Town typos", () => {
    expect(matchLocationToken("Danoon", catalogue).canonical).toBe("Dunoon");
    expect(matchLocationToken("Blouberg", catalogue).canonical).toBe(
      "Bloubergstrand"
    );
    expect(matchLocationToken("Paardeneiland", catalogue).canonical).toBe(
      "Paarden Eiland"
    );
  });

  it("does not invent unknown places", () => {
    const result = matchLocationToken("Johannesburg", catalogue);
    expect(result.canonical).toBe("Johannesburg");
    expect(result.suggestion).toBeNull();
  });
});

describe("normalizeAreaValue", () => {
  it("normalizes multi-drop slash-separated areas", () => {
    const { value, corrections } = normalizeAreaValue(
      "Danoon / Blouberg",
      catalogue
    );
    expect(value).toBe("Dunoon / Bloubergstrand");
    expect(corrections.some((item) => item.corrected)).toBe(true);
  });

  it("splits comma-separated places", () => {
    expect(splitAreaPlaces("Milnerton, Dunoon")).toEqual([
      "Milnerton",
      "Dunoon",
    ]);
  });
});

describe("validateEmailList", () => {
  it("accepts comma-separated CC emails", () => {
    const result = validateEmailList("ops@test.com, finance@test.com");
    expect(result.error).toBeNull();
    expect(result.emails).toHaveLength(2);
  });

  it("requires To when sending", () => {
    expect(validateEmailList("", { required: true }).error).toMatch(/at least one/i);
  });
});

describe("buildInvoiceEmailContent", () => {
  it("includes print link in email body", () => {
    const content = buildInvoiceEmailContent({
      invoice: {
        id: "inv-1",
        organisation_id: "org",
        company_id: "co",
        period_start: "2025-08-18",
        period_end: "2025-08-25",
        status: "issued",
        currency: "ZAR",
        subtotal: 300,
        total: 300,
        notes: null,
        generated_by: null,
        issued_at: "2025-08-25T00:00:00.000Z",
        paid_at: null,
        created_at: "2025-08-25T00:00:00.000Z",
        updated_at: "2025-08-25T00:00:00.000Z",
        deleted_at: null,
        companies: { id: "co", name: "Lewis Compliance" },
      },
      company: {
        id: "co",
        organisation_id: "org",
        name: "Lewis Compliance",
        code: null,
        contact_name: null,
        contact_email: "billing@lewis.test",
        contact_phone: null,
        address: null,
        status: "active",
        created_by: null,
        created_at: "2025-08-25T00:00:00.000Z",
        updated_at: "2025-08-25T00:00:00.000Z",
        deleted_at: null,
      },
      supplierName: "Yaseen Jacobs",
      printUrl: "https://workops.test/invoices/inv-1/print",
    });

    expect(content.subject).toContain("Lewis Compliance");
    expect(content.text).toContain("https://workops.test/invoices/inv-1/print");
    expect(content.html).toContain("View and print invoice");
  });
});
