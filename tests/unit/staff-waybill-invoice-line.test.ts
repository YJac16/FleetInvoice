import { describe, expect, it } from "vitest";

import { parseInvoiceLineDescription } from "@/features/invoices/lib/invoice-line-description";

describe("staff waybill invoice line description", () => {
  it("parses pipe format aligned with sync_staff_trip_invoice_line", () => {
    const parsed = parseInvoiceLineDescription(
      "21/09/2026 08:00 | Lewis Compliance | 2 pax | Cape Town CBD"
    );
    expect(parsed).toEqual({
      date: "21/09/2026",
      time: "8h00",
      company: "Lewis Compliance",
      pax: 2,
      area: "Cape Town CBD",
    });
  });
});
